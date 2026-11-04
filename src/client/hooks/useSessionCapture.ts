/**
 * useSessionCapture — 「传输 → 去重 → 规则 → 落库」管线（V3）。
 *
 *   useHarnessEvent        原始事件 · 通道探测 · 防抖 · 内容哈希去重 · 订阅生命周期
 *        ↓
 *   normalizeHarnessEvent  摊平成文本 + 代码块（图片 / 二进制在这里被丢掉）
 *        ↓
 *   [斜杠命令拦截]          以 /board- 开头的用户消息交给 useSlashCommand，不再入库
 *        ↓
 *   buildLogDraft          六类分类、摘要、项目归属、任务归属、token 估算
 *        ↓
 *   mergeLogDraft          90 秒内同类合并（hits+1），然后持久化
 *        ↓
 *   onFriction             命中「排错调试」时顺手沉淀一条阻碍记录
 *
 * V3 新增的三件事：
 *   1. **任务归属**：会话 → 任务的绑定表在 meta 里，命中后每条日志自动带 taskId；
 *   2. **项目归属**：规则命中优先，否则落到当前活跃项目（用户在看哪个就是在做哪个）；
 *   3. **阻碍沉淀**：debug 类日志会额外生成/合并一条 FrictionRecord。
 */
import { useCallback, useEffect, useRef } from 'react'
import type { ClientCtx, FrictionRecord, HarnessEvent, ProjectRule, SessionLog } from '../types'
import {
  DEDUPE_WINDOW_MS,
  buildLogDraft,
  dedupeKey,
  normalizeHarnessEvent,
  type LogDraft,
} from '../lib/detect'
import { buildFrictionDraft } from '../lib/friction'
import { debug, warn } from '../lib/debug'
import { setCaptureStatus } from '../lib/bus'
import { BOARD_CONFIG } from '../lib/config'
import { useHarnessEvent, type HarnessBinding } from './useHarnessEvent'
import { createId } from './useLocalStore'

/** 每秒最多处理多少个事件（流式 delta 的中间态直接丢）。 */
export const MAX_EVENTS_PER_SECOND = BOARD_CONFIG.capture.maxPerSecond

export interface UseSessionCaptureOptions {
  /** Client context; without it only the window bridge is available. */
  ctx?: ClientCtx
  /** The card's listen switch. */
  enabled: boolean
  /** Keyword → project rules from settings. */
  rules: ProjectRule[]
  /** Session id stamped on entries that do not carry one. */
  sessionId?: string
  /** V3：当前活跃项目（规则没命中时的兜底归属）。 */
  projectId?: string
  /** V3：当前会话绑定的任务。 */
  taskId?: string
  /** Called once per accepted draft. */
  onDraft: (draft: LogDraft) => void
  /** V3：debug 类草稿会额外给一份阻碍草表。 */
  onFriction?: (draft: Omit<FrictionRecord, 'id'>) => void
  /**
   * V3：用户消息的原始文本先过一遍这里；返回 true 表示「已消费（是斜杠命令）」，
   * 不再当普通日志记录。
   */
  onUserText?: (text: string, sessionId?: string) => boolean
}

export function useSessionCapture(options: UseSessionCaptureOptions): HarnessBinding {
  const { ctx, enabled, rules, sessionId, projectId, taskId, onDraft, onFriction, onUserText } = options

  /** Per-second window; kept in a ref so it never triggers a render. */
  const rateRef = useRef({ windowStart: 0, count: 0, dropped: 0 })

  /** 回调放进 ref：避免因为 props 变化重新订阅整条链路。 */
  const cbRef = useRef({ onDraft, onFriction, onUserText })
  cbRef.current = { onDraft, onFriction, onUserText }

  const handleEvent = useCallback(
    (event: HarnessEvent) => {
      try {
        const now = Date.now()
        const window = rateRef.current
        if (now - window.windowStart > 1000) {
          window.windowStart = now
          window.count = 0
        }
        window.count += 1
        if (window.count > MAX_EVENTS_PER_SECOND) {
          window.dropped += 1
          if (window.dropped % 25 === 1) {
            debug('capture', `rate limit hit — dropped ${window.dropped} events so far`)
          }
          return
        }

        const normalized = normalizeHarnessEvent(event)

        // 图片 / 附件 / base64：连摘要都不留。
        if (normalized.binary === true) {
          debug('capture', `skipped ${event.type} — binary/attachment payload`)
          return
        }

        // 前置过滤：没有任何文本、也没有代码块的事件不必进识别。
        if (normalized.text.trim() === '' && normalized.codeBlocks.length === 0) {
          debug('capture', `ignored ${event.type} — empty payload`)
          return
        }

        // 斜杠命令：只在「用户自己说的话」里找，模型的回答里出现 /board- 不算。
        if (normalized.role !== 'assistant' && normalized.text.trim().startsWith('/')) {
          const consumed = cbRef.current.onUserText?.(normalized.text, normalized.sessionId ?? sessionId)
          if (consumed === true) {
            debug('capture', `consumed slash command: ${normalized.text.split(/\s+/)[0] ?? ''}`)
            return
          }
        }

        const draft = buildLogDraft(normalized, {
          rules,
          now: event.at,
          ...(projectId === undefined || projectId === '' ? {} : { projectId }),
          ...(taskId === undefined || taskId === '' ? {} : { taskId }),
          charsPerToken: BOARD_CONFIG.context.charsPerToken,
        })
        if (draft === undefined) {
          debug('capture', `ignored ${event.type} — nothing worth logging`)
          return
        }
        if (sessionId !== undefined && draft.sessionId === undefined) {
          draft.sessionId = sessionId
        }

        debug('capture', `accepted ${draft.kind}/${draft.sessionType}`, draft.title)

        // 阻碍沉淀：失败不影响日志落库。
        if (draft.sessionType === 'debug' && cbRef.current.onFriction !== undefined) {
          try {
            const friction = buildFrictionDraft(draft, {
              ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
              ...(draft.taskId === undefined ? {} : { taskId: draft.taskId }),
              ...(draft.sessionId === undefined ? {} : { sessionId: draft.sessionId }),
            })
            if (friction !== undefined) cbRef.current.onFriction(friction)
          } catch (error) {
            warn('capture', 'friction extraction failed — log kept', error)
          }
        }

        try {
          cbRef.current.onDraft(draft)
        } catch (error) {
          warn('capture', 'onDraft failed — entry skipped', error)
        }
      } catch (error) {
        // 兜底：归一化或分类自己抛错时，只丢这一条，监听继续。
        warn('capture', `failed to process "${event.type}"`, error)
      }
    },
    [rules, sessionId, projectId, taskId],
  )

  const binding = useHarnessEvent(ctx, { enabled, onEvent: handleEvent })

  // 把状态广播出去：日志卡顶部状态行、调试面板指示灯读同一份。
  useEffect(() => {
    if (!enabled) {
      setCaptureStatus('off', '监听已关闭')
      return
    }
    if (binding.channel === 'none') {
      setCaptureStatus('error', '未找到可用事件通道')
      return
    }
    if (binding.errors > 0) {
      setCaptureStatus('error', `解析失败 ${binding.errors} 次`)
      return
    }
    const dedupeText = binding.deduped > 0 ? ` · 去重 ${binding.deduped}` : ''
    setCaptureStatus('on', `通道：${binding.channel} · ${binding.listeners} 个监听器${dedupeText}`)
  }, [enabled, binding.channel, binding.listeners, binding.errors, binding.deduped])

  // 卸载时把状态收回 off，避免调试面板继续显示「绿色」。
  useEffect(() => {
    return () => {
      setCaptureStatus('off', '页面已卸载')
    }
  }, [])

  return binding
}

/**
 * Merge a draft into the list, or insert it.
 *
 * 90 秒内同 (type, kind, project, title) 的自动记录会被**更新**而不是新增：
 * 流式回答的多个片段、连着追问的三句话，最终只留一行 `×N`。
 *
 * @param logs - current list (newest first)
 * @param draft - accepted draft, still without an id
 * @returns a new array; the input is never mutated
 */
export function mergeLogDraft(logs: SessionLog[], draft: LogDraft): SessionLog[] {
  const key = dedupeKey(draft)
  const cutoff = draft.at - DEDUPE_WINDOW_MS
  let merged = false

  const next = logs.map(log => {
    if (merged) return log
    if (log.source !== 'auto') return log
    if (log.at < cutoff) return log
    if (dedupeKey(log) !== key) return log
    merged = true
    // 保留最早的时间戳（min）会让列表看起来「没更新」；保留最新更符合直觉，
    // 但把 hits 累加，用户仍然能看出这是合并过的。
    return {
      ...log,
      at: draft.at,
      hits: (log.hits ?? 1) + 1,
      tokens: (log.tokens ?? 0) + (draft.tokens ?? 0),
    }
  })

  if (merged) {
    debug('capture', `merged into an existing row: ${key}`)
    return next
  }
  return [{ ...draft, id: createId('log') }, ...logs]
}
