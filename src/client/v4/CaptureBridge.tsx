/**
 * v4/CaptureBridge.tsx — 自动采集的**根级挂载点**（Phase 5.5）。
 *
 * 为什么要有这个文件：Phase 5.2 把 V3 的 SessionLog 卡片从工作台移除时，
 * `useSessionCapture` / `useHarnessEvent` 的挂载点一起消失了 —— 监听器没有宿主，
 * 自动采集从此静默停止（`setCaptureStatus` 的调用点只剩它自己，状态永远 off）。
 * 本阶段把监听器接到工作台根节点（`BoardPage` 里渲染一次），页面切换不再影响它。
 *
 * ── 三条纪律 ──────────────────────────────────────────────────────────────
 *   1. **全局只有一个实例**。`useHarnessEvent` 用模块级 `activeDispose` 保证
 *      「同一时刻只有一组监听器」：新实例挂载会先把旧实例摘掉。所以这里绝不能
 *      在多个页面各挂一个 —— 后挂载的会把先挂载的踢掉，表现为「时好时坏」。
 *   2. **不新增采集范围**。归一化、分类、去重、限流全部复用 `useSessionCapture`
 *      与 `lib/detect`，本文件只负责「拿到草稿 → 落库」。
 *   3. **不污染专注**。自动记录走 `addSessionLog`（只计 `daily.sessions`），
 *      永远不进 `focusMinutes`；只有用户主动计时的 `finishFocus` 才计专注分钟。
 *
 * 斜杠命令（`/board-*`）在本阶段**不做执行迁移**：这里只把它们从日志里摘掉，
 * 避免「用户敲命令」被记成一条学习记录。执行通道仍待 Commands 阶段。
 */
import { useCallback } from 'react'
import type { ClientCtx, FrictionRecord } from '../types'
import { useBoardActions } from '../hooks/useBoardActions'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { mergeLogDraft, useSessionCapture } from '../hooks/useSessionCapture'
import { debug } from '../lib/debug'
import type { LogDraft } from '../lib/detect'

export interface CaptureBridgeProps {
  ctx?: ClientCtx
  sessionId?: string
}

export function CaptureBridge({ ctx, sessionId }: CaptureBridgeProps): null {
  const board = useBoardData()
  const actions = useBoardActions()
  const { settings } = useBoardSettings()

  const handleDraft = useCallback(
    (draft: LogDraft) => {
      const existing = board.allLogs
      const merged = mergeLogDraft(existing, draft)
      /**
       * 合并路径长度不变（90 秒内同一主题的续写）；新增路径长度 +1。
       * 合并意味着**没有新的会话发生**，所以不能加 `sessions`，
       * 只把 hits / tokens / at 更新写回去。
       */
      if (merged.length === existing.length) {
        board.setLogs(merged)
        return
      }
      const created = merged[0]
      if (created === undefined) return
      actions.addSessionLog(created)
    },
    [board, actions],
  )

  const handleFriction = useCallback(
    (draft: Omit<FrictionRecord, 'id'>) => {
      actions.addFrictionMerged(draft)
    },
    [actions],
  )

  /**
   * 斜杠命令：只消费、不执行（见文件头）。
   * 返回 true → `useSessionCapture` 不再把这条文本入库。
   */
  const handleUserText = useCallback((text: string): boolean => {
    if (!text.trimStart().startsWith('/')) return false
    debug('capture', `slash command consumed without execution: ${text.split(/\s+/)[0] ?? ''}`)
    return true
  }, [])

  useSessionCapture({
    ...(ctx === undefined ? {} : { ctx }),
    enabled: settings.autoCapture,
    rules: settings.projectRules,
    ...(sessionId === undefined || sessionId === '' ? {} : { sessionId }),
    ...(board.activeProjectId === '' ? {} : { projectId: board.activeProjectId }),
    onDraft: handleDraft,
    onFriction: handleFriction,
    onUserText: handleUserText,
  })

  // 采集是纯副作用，不占布局。
  return null
}
