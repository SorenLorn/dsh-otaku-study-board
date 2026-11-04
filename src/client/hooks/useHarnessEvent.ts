/**
 * useHarnessEvent — 订阅 DSH 的 Harness 事件（V3）。
 *
 * ── 通道探测（为什么不写死事件名）─────────────────────────────────────────
 * 当前发布版 DSH 没有对外承诺稳定的本地事件名，所以按三个通道依次尝试，挂上
 * 哪个用哪个，并把结果暴露给 UI：
 *   1. `ctx.on(name, fn)` —— cordis 自身的事件面；
 *   2. `ctx.get('session' | 'sessions' | 'conversation' | …)` —— 宿主服务上的 emitter；
 *   3. `window` 桥 `sorchron:harness-event` —— 任何插件 / 适配层都能往这里推，
 *      也是手动验证链路的入口（见 {@link emitHarnessEvent}）。
 *
 * ── V3 的四处加固 ─────────────────────────────────────────────────────────
 *   • **先销毁旧实例再绑定**（需求 2.1.4）：模块级 `activeDispose` 保存当前活跃
 *     实例的清理函数，新实例挂载时先调用它。这样即使热更新 / 重复挂载，也永远
 *     只有一组监听器，不会出现「关掉面板还在后台采集」。
 *   • **内容哈希去重**（需求 2.1.1）：同一条消息 5 分钟内重复推送（宿主重放、流式
 *     重发）只处理一次。哈希只算前 600 字符，不保留原文。
 *   • **防抖合并 + 最长等待**：80ms 窗口合并；无论怎么抖，1.5s 必落一次。
 *   • **逐事件 try/catch + 超大 payload 预检**：单条坏数据只 skip，监听继续。
 *
 * 卸载时：清所有 pending 定时器、摘所有监听、清去重窗口、复位模块级句柄。
 * 控制台统一前缀 `SorchronBoard V3:`。
 */
import { useEffect, useRef, useState } from 'react'
import { BOARD_CONFIG } from '../lib/config'
import { debug, info, warn } from '../lib/debug'
import { contentSignature, createDedupeWindow } from '../lib/hash'
import type { ClientCtx, EmitterFace, HarnessEvent } from '../types'

/** Window bridge name: an external producer can push events into the board. */
export const HARNESS_BRIDGE_EVENT = 'sorchron:harness-event'

/** Candidate event names, tried in order on every channel; unknown ones are skipped. */
export const HARNESS_EVENT_CANDIDATES: readonly string[] = [
  'harness/message',
  'harness/code-block',
  'harness/tool-call',
  'session/message',
  'session/message/added',
  'session/message/updated',
  'session/event',
  'session/updated',
  'conversation/message',
  'conversation/updated',
  'message',
  'message/added',
  'message/updated',
  'tool-call',
  'tool/result',
  'code-block',
]

/** Host services that might own a session event emitter. */
const SERVICE_CANDIDATES: readonly string[] = [
  'session',
  'sessions',
  'sessionQuery',
  'conversation',
  'connection',
  'harness',
  'chat',
]

/** Which channel actually bound, and how much it bound. */
export interface HarnessBinding {
  channel: 'ctx' | 'service' | 'window' | 'none'
  listeners: number
  services: string[]
  /** 解析回调抛错的累计次数（用于状态灯变红）。 */
  errors: number
  /** V3：被内容哈希挡掉的重复条数。 */
  deduped: number
}

const EMPTY_BINDING: HarnessBinding = { channel: 'none', listeners: 0, services: [], errors: 0, deduped: 0 }

export interface UseHarnessEventOptions {
  onEvent: (event: HarnessEvent) => void
  /** Set to false to detach without unmounting (the card's listen switch). */
  enabled?: boolean
  /** 同一事件名的合并窗口（毫秒），0 表示不合并。 */
  debounceMs?: number
}

/** Best-effort session id carried by a payload. */
function readSessionId(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const candidate = (payload as { sessionId?: unknown }).sessionId
  if (typeof candidate === 'string') return candidate
  const session = (payload as { session?: unknown }).session
  if (typeof session === 'object' && session !== null) {
    const id = (session as { id?: unknown }).id
    if (typeof id === 'string') return id
  }
  return undefined
}

/** Does this value look like an emitter? */
function asEmitter(value: unknown): EmitterFace | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Partial<EmitterFace>
  return typeof candidate.on === 'function' ? (candidate as EmitterFace) : undefined
}

/**
 * 前置过滤：值不值得进入解析。
 * @returns `signature` 供后续内容去重使用
 */
function preflight(payload: unknown): { ok: boolean; signature: string } {
  if (payload === undefined || payload === null) return { ok: false, signature: '' }
  try {
    const text = JSON.stringify(payload)
    if (typeof text !== 'string') return { ok: false, signature: '' }
    if (text.length < 3) return { ok: false, signature: '' }
    if (text.length > BOARD_CONFIG.capture.maxPayloadChars) {
      warn('capture', `payload too large (${text.length} chars) — dropped`)
      return { ok: false, signature: '' }
    }
    return { ok: true, signature: contentSignature('payload', text) }
  } catch {
    // 循环引用之类：交给下游 try/catch，不在这里一刀切掉。
    return { ok: true, signature: '' }
  }
}

/**
 * 当前活跃实例的清理函数。
 *
 * 模块级单例：同一时刻只允许一组监听器。与 V2 的 token 相比这里多做一步 ——
 * **先执行旧的 cleanup**，而不是「发现已有就直接放弃」。区别在于：如果旧实例
 * 因为异常没卸载干净，V2 会让新实例绑不上（页面看着正常、实际不采集）；V3 则是
 * 强制换新，最坏情况是短暂重复一次，不会永久失灵。
 */
let activeDispose: (() => void) | null = null

/** 把一组事件名挂到某个 emitter 上，逐个 try/catch。 */
function bindEmitters(
  emitter: EmitterFace,
  prefix: string,
  schedule: (type: string, payload: unknown) => void,
  disposers: Array<() => void>,
): number {
  let count = 0
  for (const eventName of HARNESS_EVENT_CANDIDATES) {
    try {
      const off = emitter.on(eventName, (payload: unknown) => schedule(`${prefix}${eventName}`, payload))
      if (typeof off === 'function') disposers.push(off as () => void)
      count += 1
    } catch {
      /* this build does not know that event — skip it */
    }
  }
  return count
}

export function useHarnessEvent(
  ctx: ClientCtx | undefined,
  options: UseHarnessEventOptions,
): HarnessBinding {
  const { onEvent, enabled = true, debounceMs = BOARD_CONFIG.capture.debounceMs } = options

  // Latest handler without re-subscribing: the listener closure reads this ref.
  const handlerRef = useRef(onEvent)
  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  const [binding, setBinding] = useState<HarnessBinding>(EMPTY_BINDING)

  useEffect(() => {
    if (!enabled) {
      setBinding(EMPTY_BINDING)
      info('capture', 'listener disabled — skipping every event')
      return
    }

    // ── 关键：先销毁旧实例（需求 2.1.4）────────────────────────────────────
    if (activeDispose !== null) {
      try {
        activeDispose()
        info('capture', 'previous listener instance disposed before re-binding')
      } catch (error) {
        warn('capture', 'previous instance cleanup failed — continuing', error)
      }
      activeDispose = null
    }

    const disposers: Array<() => void> = []
    /** 待落盘的一批事件：同一事件名只保留最新一条。 */
    const pending = new Map<string, { payload: unknown; timer: number; first: number }>()
    const dedupe = createDedupeWindow()
    let errorCount = 0
    let dedupedCount = 0

    const deliver = (type: string, payload: unknown): void => {
      try {
        handlerRef.current({ type, at: Date.now(), sessionId: readSessionId(payload), payload })
      } catch (error) {
        errorCount += 1
        warn('capture', `handler threw for "${type}" (${errorCount})`, error)
        if (errorCount >= BOARD_CONFIG.capture.errorThreshold) {
          setBinding(previous => ({ ...previous, errors: errorCount, deduped: dedupedCount }))
        }
      }
    }

    const flush = (type: string): void => {
      const item = pending.get(type)
      if (item === undefined) return
      pending.delete(type)
      if (typeof item.timer === 'number') window.clearTimeout(item.timer)
      deliver(type, item.payload)
    }

    /**
     * 入队（防抖 + 去重）；`maxWait` 到点强制落一次，避免长流永不结束。
     *
     * 去重分两层：
     *   1. 这里的内容哈希 —— 同一条消息重复推送；
     *   2. `useSessionCapture.mergeLogDraft` 的业务合并 —— 同一主题的多条消息。
     * 两层都要：前者防「重复推送」，后者防「同一句话说了三遍」。
     */
    const schedule = (type: string, payload: unknown): void => {
      const gate = preflight(payload)
      if (!gate.ok) return
      if (gate.signature !== '' && !dedupe.admit(gate.signature)) {
        dedupedCount += 1
        if (dedupedCount % 10 === 1) debug('capture', `duplicate suppressed (${dedupedCount} total)`)
        return
      }
      if (debounceMs <= 0) {
        deliver(type, payload)
        return
      }
      const now = Date.now()
      const existing = pending.get(type)
      if (existing !== undefined && typeof existing.timer === 'number') {
        window.clearTimeout(existing.timer)
      }
      const first = existing?.first ?? now
      const elapsed = now - first
      const wait = Math.max(0, Math.min(debounceMs, BOARD_CONFIG.capture.maxWaitMs - elapsed))
      const timer = window.setTimeout(() => flush(type), wait)
      pending.set(type, { payload, timer, first })
      if (elapsed >= BOARD_CONFIG.capture.maxWaitMs) flush(type)
    }

    // ── 通道 1：ctx 自身 ────────────────────────────────────────────────────
    const ctxEmitter = ctx !== undefined ? asEmitter(ctx) : undefined
    const ctxListeners = ctxEmitter === undefined ? 0 : bindEmitters(ctxEmitter, '', schedule, disposers)

    // ── 通道 2：宿主服务上的 emitter ────────────────────────────────────────
    const boundServices: string[] = []
    let serviceListeners = 0
    if (typeof ctx?.get === 'function') {
      for (const serviceName of SERVICE_CANDIDATES) {
        let service: unknown
        try {
          service = ctx.get(serviceName)
        } catch {
          continue
        }
        const emitter = asEmitter(service)
        if (emitter === undefined) continue
        boundServices.push(serviceName)
        serviceListeners += bindEmitters(emitter, `${serviceName}:`, schedule, disposers)
      }
    }

    // ── 通道 3：window 桥（外部注入 / 手动验证）────────────────────────────
    let bridgeBound = false
    if (typeof window !== 'undefined') {
      const onBridge = (event: Event): void => {
        try {
          const detail = (event as CustomEvent<{ type?: unknown; payload?: unknown }>).detail
          const type = typeof detail?.type === 'string' ? detail.type : 'bridge/message'
          schedule(type, detail?.payload)
        } catch (error) {
          warn('capture', 'bridge handler failed', error)
        }
      }
      try {
        window.addEventListener(HARNESS_BRIDGE_EVENT, onBridge)
        disposers.push(() => window.removeEventListener(HARNESS_BRIDGE_EVENT, onBridge))
        bridgeBound = true
      } catch (error) {
        warn('capture', 'window bridge unavailable', error)
      }
    }

    const next: HarnessBinding =
      ctxListeners > 0
        ? { channel: 'ctx', listeners: ctxListeners, services: boundServices, errors: 0, deduped: 0 }
        : serviceListeners > 0
          ? { channel: 'service', listeners: serviceListeners, services: boundServices, errors: 0, deduped: 0 }
          : bridgeBound
            ? { channel: 'window', listeners: 1, services: [], errors: 0, deduped: 0 }
            : EMPTY_BINDING

    setBinding(next)
    info('capture', `channel bound: ${next.channel}`, {
      listeners: next.listeners,
      services: next.services,
      bridge: bridgeBound,
      debounceMs,
    })

    /**
     * 清理：定时器 → 监听器 → 去重窗口 → 模块级句柄。
     * 顺序有讲究：先停定时器，否则清理过程中还可能触发一次回调。
     */
    const dispose = (): void => {
      for (const item of pending.values()) {
        if (typeof item.timer === 'number') window.clearTimeout(item.timer)
      }
      pending.clear()
      for (const release of disposers) {
        try {
          release()
        } catch {
          /* already released by the runtime */
        }
      }
      disposers.length = 0
      dedupe.clear()
      if (activeDispose === dispose) activeDispose = null
      debug('capture', 'listener detached')
    }

    activeDispose = dispose
    return dispose
  }, [ctx, enabled, debounceMs])

  return binding
}

/**
 * Push an event into the board through the window bridge.
 *
 * 两个用途：别的插件 / 适配层把真实事件转发进来；控制台手动验证整条链路
 * （调试面板的模拟按钮用的就是它）。
 *
 *     window.dispatchEvent(new CustomEvent('sorchron:harness-event', {
 *       detail: { type: 'bridge/message', payload: { text: '修复了 useTimer 的报错' } },
 *     }))
 */
export function emitHarnessEvent(type: string, payload?: unknown): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.dispatchEvent(new CustomEvent(HARNESS_BRIDGE_EVENT, { detail: { type, payload } }))
    return true
  } catch (error) {
    warn('capture', 'bridge emit failed', error)
    return false
  }
}
