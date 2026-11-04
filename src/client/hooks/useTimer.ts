/**
 * useTimer — 计时器的 React 外壳（Phase 5.5 重写）。
 *
 * 状态机本体在 `lib/focus.ts`（纯函数、可控时钟、可单测）。这里只做四件事：
 *   1. 读 / 写 `STORAGE_KEYS.timer`（唯一写者，不走 useLocalStore，避免双写）；
 *   2. 250ms 的**显示**刷新（真实时间永远由 deadline 反推，不靠累加秒数）；
 *   3. 到点结算（专注 → 结果回调；休息 → 回专注待机）；
 *   4. 页面重新打开时把「离开期间跑完的那一轮」补结算一次（同一 roundId，重放不重复）。
 *
 * ── 三条硬规则 ────────────────────────────────────────────────────────────
 *   • **休息不计入专注**：只有 focus 结束才回调 `onComplete`，休息只回调 `onBreakEnd`。
 *   • **先落状态再回调**：结算先把 `completed` 写进存储，再交结果给调用方去写日志。
 *     这样即使写日志途中刷新，也不会二次记账（状态已经不在 running）。
 *   • **重复结束无副作用**：`end()` 在 idle / completed / 休息态直接返回；即使真的
 *     重复回调，日志 id 是 roundId，`addFocusLog` 会挡下第二条。
 *
 * 写盘只发生在状态边界（开始 / 暂停 / 结束 / 取消 / 换阶段），250ms 的刷新不碰
 * localStorage。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PendingBaseline, PendingSettlement, TimerPersistedState, TimerPhase } from '../types'
import { debug, info, warn } from '../lib/debug'
import { pushNotice } from '../lib/bus'
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  createDefaultTimerState,
} from '../lib/defaults'
import { restoreTimerState, unwrapEnvelope } from '../lib/schema'
import { clampBreakMinutes, clampDurationMinutes, isFiniteNumber } from '../lib/validate'
import {
  FOCUS_STATUS_LABEL,
  actualFocusMinutes,
  cancelRound,
  elapsedSecondsAt,
  endRound,
  finishBreak,
  focusProgress,
  focusStatus,
  isBreakPhase,
  pauseRound,
  remainingSecondsAt,
  resumeRound,
  startBreak,
  startRound,
  type BreakInfo,
  type FocusResult,
  type FocusSettings,
  type FocusStatus,
} from '../lib/focus'
import { readStoreEnvelope, writeStore } from './useLocalStore'

export { DEFAULT_DURATION_MINUTES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES }

/** Display refresh; 250 ms keeps the countdown honest without wasting renders. */
const TICK_MS = 250

/** 一轮专注结束（只有 focus 会触发）。`minutes` 是**实际**专注分钟。 */
export type TimerCompleteInfo = FocusResult

/** 结算回调返回的结构化结果（失败时带上基线快照）。 */
export interface CompleteOutcome {
  ok: boolean
  baseline?: PendingBaseline
  message?: string
}

/** 把三种返回值归一成 `{ ok, baseline }`。 */
function readOutcome(value: boolean | CompleteOutcome | void): { ok: boolean; baseline?: PendingBaseline } {
  if (value === false) return { ok: false }
  if (value === true || value === undefined) return { ok: true }
  return { ok: value.ok, ...(value.baseline === undefined ? {} : { baseline: value.baseline }) }
}

/** 进入休息。 */
export type PhaseChangeInfo = Omit<BreakInfo, 'phase'> & {
  from: TimerPhase
  to: TimerPhase
  /** 刚刚结束 / 进入的那一段（休息段才有意义）。 */
  phase: TimerPhase
}

/**
 * 「放弃这一笔」的回调结果（Phase 6.1）。
 *
 * 只有 `ok: true` 才允许把待保存标记清掉；`persisted` 表示清理方是否**已经在同一个
 * 事务里**把标记写掉，`false` 时计时器要自己再写一次（没有存储端口时）。
 */
export interface DiscardInfo {
  ok: boolean
  message: string
  persisted?: boolean
}

/** 把三种返回值归一成 `{ ok, message, persisted }`。 */
function readDiscard(value: boolean | DiscardInfo | void): { ok: boolean; message: string; persisted: boolean } {
  if (value === false) return { ok: false, message: '', persisted: false }
  if (value === true || value === undefined) return { ok: true, message: '', persisted: false }
  return { ok: value.ok, message: value.message, persisted: value.persisted === true }
}

export interface UseTimerOptions {
  storageKey: string
  initialDurationMinutes?: number
  /**
   * 专注段结束（只有 focus 会触发）。
   *
   * 返回值三种含义：
   *   • `false`：**没有落盘成功** → 保留 `pendingResult`，界面显示「未保存 · 重试」；
   *   • `{ ok: false, baseline }`：同样失败，但带回结算前的基线快照 —— 下次重试
   *     据此判断哪些实体已经写过（Phase 5.5.2，部分写入的修复依据）；
   *   • `true` / `undefined`：成功（`undefined` 是旧调用方，视为已处理，避免无限重试）。
   */
  onComplete?: (info: TimerCompleteInfo, baseline?: PendingBaseline) => boolean | CompleteOutcome | void
  /**
   * 用户点「放弃这一笔」时调用（Phase 6.1）。
   *
   * 回调负责**先证明再清理**：只删能确认属于本轮的日志与时间轴事件，并把待保存标记
   * 一起写掉（第二个参数就是「去掉 pendingResult 的计时器状态」）。
   * 返回 `{ ok: false }` 时计时器保留标记 —— 界面必须继续显示「未保存」。
   */
  onDiscard?: (pending: PendingSettlement, cleared: { key: string; value: unknown }) => boolean | DiscardInfo | void
  /** 进入休息。 */
  onBreakStart?: (info: PhaseChangeInfo) => void
  /** 休息结束 / 跳过。 */
  onBreakEnd?: (info: PhaseChangeInfo) => void
  /**
   * 兼容 V3 卡片的单一回调（进入休息 / 离开休息都走它）。
   * 新代码请用 onBreakStart / onBreakEnd，语义更清楚。
   */
  onPhaseChange?: (info: PhaseChangeInfo) => void
  /** 休息开关与长度。 */
  breakEnabled?: boolean
  shortBreakMinutes?: number
  longBreakMinutes?: number
  roundsBeforeLongBreak?: number
}

export interface UseTimerResult {
  status: FocusStatus
  /** 状态的中文名，UI 直接用，避免各写一套。 */
  statusLabel: string
  phase: TimerPhase
  running: boolean
  remainingSeconds: number
  durationSeconds: number
  durationMinutes: number
  /** 本轮已专注秒数（多段暂停累计）。 */
  elapsedSeconds: number
  /** 本轮已专注分钟（向下取整）。 */
  actualMinutes: number
  progress: number
  boundTaskId: string
  startedAt: number | null
  roundId: string
  roundInCycle: number
  focusMinutes: number
  /** 上一轮的真实结算（刷新后仍在）；没有结算过时为 null。 */
  lastResult: { minutes: number; endedAt: number; taskId: string } | null
  /** 还没落盘成功的那一笔（有值就说明「本轮完成但没保存」）。 */
  pendingResult: PendingSettlement | null
  /** 重试落盘；返回是否成功。 */
  retryPending: () => boolean
  /** 放弃这一笔没落盘的记录（用户明确选择丢弃，只在重试一直失败时用）。 */
  discardPending: () => boolean
  start: () => void
  pause: () => void
  /** 结束并结算：写入实际分钟（不足 1 分钟不写）。 */
  end: () => void
  /** 取消：不写任何记录，回到待机。 */
  cancel: () => void
  /** Back to a full round of the **current phase** (optionally a new length). */
  reset: (nextDurationMinutes?: number) => void
  setDurationMinutes: (minutes: number) => void
  setBoundTaskId: (taskId: string) => void
  /** 进入休息（短 / 长）。默认按 ring 位置决定。 */
  beginBreak: (kind?: 'short' | 'long') => void
  /** 跳过 / 结束休息，回专注待机。 */
  skipBreak: () => void
  /** 继续被暂停的休息。 */
  resumeBreak: () => void
}

/** Clamp any input to a legal focus round length. */
export function clampMinutes(minutes: number): number {
  return clampDurationMinutes(minutes, DEFAULT_DURATION_MINUTES)
}

interface LoadedState {
  state: TimerPersistedState
  warning?: string
}

/** 读取 + 兜底 + 残留判定，异常情况带一句提示回来。 */
function loadState(key: string, fallbackMinutes: number): LoadedState {
  const fallback = createDefaultTimerState()
  fallback.durationMinutes = clampDurationMinutes(fallbackMinutes, DEFAULT_DURATION_MINUTES)
  fallback.remainingSeconds = fallback.durationMinutes * 60
  fallback.focusMinutes = fallback.durationMinutes

  let warning: string | undefined
  const read = readStoreEnvelope<TimerPersistedState>(key, fallback, data => {
    const restored = restoreTimerState(data)
    if (restored.warning !== undefined) warning = restored.warning
    return restored.state
  })

  return { state: read.value, ...(warning === undefined ? {} : { warning }) }
}

export function useTimer(options: UseTimerOptions): UseTimerResult {
  const {
    storageKey,
    initialDurationMinutes = DEFAULT_DURATION_MINUTES,
    onComplete,
    onDiscard,
    onBreakStart,
    onBreakEnd,
    onPhaseChange,
    breakEnabled = true,
    shortBreakMinutes = 5,
    longBreakMinutes = 15,
    roundsBeforeLongBreak = 4,
  } = options

  const loadedRef = useRef<LoadedState | null>(null)
  if (loadedRef.current === null) loadedRef.current = loadState(storageKey, initialDurationMinutes)

  const [state, setState] = useState<TimerPersistedState>(loadedRef.current.state)
  const [now, setNow] = useState<number>(() => Date.now())

  const stateRef = useRef<TimerPersistedState>(state)
  /** 防止 React 18 StrictMode 的双调用把同一轮结算两次（数据层还有 roundId 兜底）。 */
  const settlingRef = useRef(false)

  /** 回调放进 ref：避免父组件每次渲染都重建整条状态机。 */
  const cbRef = useRef<{
    onComplete?: UseTimerOptions['onComplete']
    onDiscard?: UseTimerOptions['onDiscard']
    onBreakStart?: UseTimerOptions['onBreakStart']
    onBreakEnd?: UseTimerOptions['onBreakEnd']
    onPhaseChange?: UseTimerOptions['onPhaseChange']
  }>({ onComplete, onDiscard, onBreakStart, onBreakEnd, onPhaseChange })
  cbRef.current = { onComplete, onDiscard, onBreakStart, onBreakEnd, onPhaseChange }

  const settingsRef = useRef<FocusSettings>({
    breakEnabled,
    shortBreakMinutes,
    longBreakMinutes,
    roundsBeforeLongBreak,
  })
  settingsRef.current = { breakEnabled, shortBreakMinutes, longBreakMinutes, roundsBeforeLongBreak }

  // 残留 / 异常计时被重置时，告诉用户发生了什么（只提示一次）。
  useEffect(() => {
    const warning = loadedRef.current?.warning
    if (warning !== undefined) {
      warn('timer', warning)
      pushNotice(warning, 'warn')
    }
  }, [])

  /** Apply a transition: re-render, re-derive the clock, persist the edges. */
  const commit = useCallback(
    (next: TimerPersistedState) => {
      stateRef.current = next
      setState(next)
      setNow(Date.now())
      const written = writeStore(storageKey, next)
      if (!written) debug('timer', 'state write skipped — see the storage notice')
      return written
    },
    [storageKey],
  )

  /**
   * 清掉「待落盘」标记（写失败也不影响正确性：下次会再幂等重试一次）。
   * @returns 是否真的写进去了（Phase 6.1：放弃流程要据此决定能不能说「成功」）
   */
  const clearPendingSettlement = useCallback((): boolean => {
    const current = stateRef.current
    if (current.pendingResult === undefined) return true
    const next: TimerPersistedState = { ...current }
    delete next.pendingResult
    return commit(next)
  }, [commit])

  /**
   * 落盘失败时把基线快照补进 `pendingResult`（Phase 5.5.2）。
   *
   * 只写一次：已经有了就不覆盖，避免把「写入前」的值改写成「失败后」的值。
   * 这一步本身写盘失败也不影响正确性 —— 没有基线只会让下次修复更保守（报告「无法确定」）。
   */
  const keepBaseline = useCallback(
    (baseline: PendingBaseline) => {
      const current = stateRef.current
      const pending = current.pendingResult
      if (pending === undefined || pending.before !== undefined) return
      commit({ ...current, pendingResult: { ...pending, before: baseline } })
    },
    [commit],
  )

  /** 专注到点 / 手动结束：结算一次，并把结果交回调用方。 */
  const settleFocus = useCallback(() => {
    if (settlingRef.current) return
    const current = stateRef.current
    // 跑着可以结算；暂停中「结束」也要能结算（暂停前的时长是真的）。
    const settleable = current.running || (!isBreakPhase(current.phase) && focusStatus(current) === 'paused')
    if (!settleable) return
    settlingRef.current = true
    try {
      const at = Date.now()
      const { state: next, result } = endRound(current, at, settingsRef.current)
      commit(next)
      info(
        'timer',
        result.recorded ? `round complete: ${result.minutes} min` : 'round ended under 1 min — not recorded',
        { roundId: result.roundId, elapsedSeconds: result.elapsedSeconds, targetMinutes: result.targetMinutes },
      )
      if (!result.recorded) {
        pushNotice('不足 1 分钟，本轮没有记入专注', 'warn')
        return
      }
      /**
       * 落盘结果决定要不要保留 `pendingResult`：
       *   • 返回 false（写入失败）→ 留在存储里，界面显示「未保存 · 重试」，下次挂载自动补；
       *   • 返回 undefined（没有消费者）→ 视为已处理，避免无限重试；
       *   • 返回 true → 清掉。
       */
      let delivered: boolean | CompleteOutcome | void = true
      try {
        delivered = cbRef.current.onComplete?.(result)
      } catch (error) {
        warn('timer', 'onComplete threw', error)
        pushNotice('计时已结束，但记录写入失败，详见控制台', 'error')
        delivered = false
      }
      const outcome = readOutcome(delivered)
      if (outcome.ok) clearPendingSettlement()
      else if (outcome.baseline !== undefined) keepBaseline(outcome.baseline)
    } finally {
      settlingRef.current = false
    }
  }, [clearPendingSettlement, commit])

  const settleBreak = useCallback(() => {
    if (settlingRef.current) return
    const current = stateRef.current
    if (!current.running || !isBreakPhase(current.phase)) return
    settlingRef.current = true
    try {
      const from = current.phase ?? 'short'
      commit(finishBreak(current))
      info('timer', `break finished → back to focus (${stateRef.current.durationMinutes} min)`)
      pushNotice('休息结束，可以开始下一轮专注了', 'info')
      const change: PhaseChangeInfo = {
        from,
        to: 'focus',
        minutes: stateRef.current.focusMinutes ?? stateRef.current.durationMinutes,
        longBreak: from === 'long',
        phase: from,
      }
      try {
        cbRef.current.onBreakEnd?.(change)
        cbRef.current.onPhaseChange?.(change)
      } catch (error) {
        warn('timer', 'onBreakEnd threw', error)
      }
    } finally {
      settlingRef.current = false
    }
  }, [commit])

  const start = useCallback(() => {
    const current = stateRef.current
    const next = startRound(current, Date.now())
    if (next === current) return
    commit(next)
    info('timer', `started ${next.durationMinutes} min`, {
      boundTaskId: next.boundTaskId,
      roundId: next.roundId,
      resumed: current.remainingSeconds > 0 && current.remainingSeconds < current.durationMinutes * 60,
    })
  }, [commit])

  const pause = useCallback(() => {
    const current = stateRef.current
    const next = pauseRound(current, Date.now())
    if (next === current) return
    commit(next)
    debug('timer', 'paused')
  }, [commit])

  const end = useCallback(() => {
    const current = stateRef.current
    // 只有跑着 / 暂停中的专注轮才需要结算；重复点击直接忽略。
    if (isBreakPhase(current.phase)) return
    if (!current.running && focusStatus(current) !== 'paused') return
    settleFocus()
  }, [settleFocus])

  const cancel = useCallback(() => {
    const current = stateRef.current
    const next = cancelRound(current)
    commit(next)
    info('timer', 'round cancelled — nothing recorded')
  }, [commit])

  const reset = useCallback(
    (nextDurationMinutes?: number) => {
      const current = stateRef.current
      const isBreak = isBreakPhase(current.phase)
      const minutes = isBreak
        ? clampBreakMinutes(nextDurationMinutes ?? current.durationMinutes, current.durationMinutes)
        : clampDurationMinutes(nextDurationMinutes ?? current.durationMinutes)
      commit({
        ...current,
        running: false,
        deadline: null,
        durationMinutes: minutes,
        remainingSeconds: minutes * 60,
        startedAt: null,
        roundId: '',
        ...(isBreak ? {} : { focusMinutes: minutes }),
      })
      debug('timer', `reset to ${minutes} min (${current.phase ?? 'focus'})`)
    },
    [commit],
  )

  const setDurationMinutes = useCallback(
    (minutes: number) => {
      if (stateRef.current.running) {
        warn('timer', 'duration change ignored while running')
        pushNotice('计时进行中，先暂停再改时长', 'warn')
        return
      }
      reset(minutes)
    },
    [reset],
  )

  const setBoundTaskId = useCallback(
    (taskId: string) => {
      commit({ ...stateRef.current, boundTaskId: taskId })
    },
    [commit],
  )

  const beginBreak = useCallback(
    (kind?: 'short' | 'long') => {
      const current = stateRef.current
      if (current.running) return
      if (isBreakPhase(current.phase)) return
      const { state: next, info: breakInfo } = startBreak(current, Date.now(), settingsRef.current, kind)
      commit(next)
      info('timer', `break started: ${breakInfo.phase} ${breakInfo.minutes} min`)
      pushNotice(
        breakInfo.longBreak
          ? `进入长休 ${breakInfo.minutes} 分钟，休息不计入专注`
          : `进入短休 ${breakInfo.minutes} 分钟，休息不计入专注`,
        'info',
      )
      const change: PhaseChangeInfo = { from: 'focus', to: breakInfo.phase, ...breakInfo }
      try {
        cbRef.current.onBreakStart?.(change)
        cbRef.current.onPhaseChange?.(change)
      } catch (error) {
        warn('timer', 'onBreakStart threw', error)
      }
    },
    [commit],
  )

  const skipBreak = useCallback(() => {
    const current = stateRef.current
    if (!isBreakPhase(current.phase)) return
    const from = current.phase ?? 'short'
    commit(finishBreak(current))
    info('timer', 'break skipped')
    const change: PhaseChangeInfo = {
      from,
      to: 'focus',
      minutes: stateRef.current.focusMinutes ?? stateRef.current.durationMinutes,
      longBreak: from === 'long',
      phase: from,
    }
    try {
      cbRef.current.onBreakEnd?.(change)
      cbRef.current.onPhaseChange?.(change)
    } catch (error) {
      warn('timer', 'onBreakEnd threw', error)
    }
  }, [commit])

  /**
   * 重试一笔没落盘的结算。
   *
   * 幂等靠 `roundId`：即使上一次其实写成功了（只是清标记失败），再提交也只会
   * 得到 `duplicate`，不会重复累计。
   */
  const retryPending = useCallback((): boolean => {
    const pending = stateRef.current.pendingResult
    if (pending === undefined) return true
    const result: TimerCompleteInfo = {
      roundId: pending.roundId,
      minutes: pending.minutes,
      elapsedSeconds: pending.elapsedSeconds,
      targetMinutes: pending.targetMinutes,
      taskId: pending.taskId,
      startedAt: pending.startedAt,
      endedAt: pending.endedAt,
      longBreak: false,
      recorded: pending.minutes >= 1,
    }
    let delivered: boolean | CompleteOutcome | void = true
    try {
      delivered = cbRef.current.onComplete?.(result, pending.before)
    } catch (error) {
      warn('timer', 'retry onComplete threw', error)
      delivered = false
    }
    const outcome = readOutcome(delivered)
    if (!outcome.ok) {
      if (outcome.baseline !== undefined) keepBaseline(outcome.baseline)
      return false
    }
    clearPendingSettlement()
    return true
  }, [clearPendingSettlement, keepBaseline])

  /**
   * 放弃这一笔（Phase 6.1）。
   *
   * 三条路，顺序不能变：
   *   1. 交给 `onDiscard` 先**证明再清理**（删本轮日志/时间轴 + 同一事务里清标记）；
   *   2. 回调说不能清理 → 什么都不动，保留 `pendingResult`，界面继续显示「未保存」；
   *   3. 没有回调（老调用方）→ 退回「只清标记」的老行为，但写失败也要如实报告。
   *
   * @returns 是否真的放弃了（false 表示标记还在，界面不能显示成功）
   */
  const discardPending = useCallback((): boolean => {
    const current = stateRef.current
    const pending = current.pendingResult
    if (pending === undefined) return true

    const cleared: TimerPersistedState = { ...current }
    delete cleared.pendingResult

    if (cbRef.current.onDiscard === undefined) {
      warn('timer', 'pending settlement discarded by user (no onDiscard)', { roundId: pending.roundId })
      const written = clearPendingSettlement()
      if (!written) pushNotice('放弃标记没能写入，刷新后这一笔可能被重新补写；请检查存储后再试', 'error')
      return written
    }

    let delivered: boolean | DiscardInfo | void = true
    try {
      delivered = cbRef.current.onDiscard(pending, { key: storageKey, value: cleared })
    } catch (error) {
      warn('timer', 'onDiscard threw', error)
      delivered = false
    }

    const info = readDiscard(delivered)
    if (!info.ok) {
      // 清理被拒绝或失败：数据与标记都保持原样，把原因交给界面。
      warn('timer', 'discard refused', { roundId: pending.roundId, message: info.message })
      pushNotice(info.message === '' ? '无法安全放弃这一笔，已保留待保存状态' : info.message, 'error')
      return false
    }

    /**
     * 清理方已经把「去掉 pendingResult 的状态」写进同一事务时，这里只同步内存，
     * 不再写第二次盘；否则（没有存储端口）自己写一次，并检查写入结果。
     */
    if (info.persisted) {
      stateRef.current = cleared
      setState(cleared)
      setNow(Date.now())
    } else {
      const written = clearPendingSettlement()
      if (!written) pushNotice('放弃标记没能写入，刷新后这一笔可能被重新补写；请检查存储后再试', 'error')
      if (!written) return false
    }

    warn('timer', 'pending settlement discarded by user', { roundId: pending.roundId })
    if (info.message !== '') pushNotice(info.message, 'info')
    return true
  }, [clearPendingSettlement, storageKey])

  const resumeBreak = useCallback(() => {
    const current = stateRef.current
    if (!isBreakPhase(current.phase)) return
    const next = resumeRound(current, Date.now())
    if (next === current) return
    commit(next)
    debug('timer', 'break resumed')
  }, [commit])

  /**
   * 挂载时补写「上次没落盘」的那一笔。
   *
   * 只跑一次、放在 settleFocus 之后：如果上一轮是「离开期间跑完的」，先由 settleFocus
   * 结算（它会顺手写 pendingResult），再由这里补；两者幂等，重复提交只会得到 duplicate。
   */
  const retriedRef = useRef(false)
  useEffect(() => {
    if (retriedRef.current) return
    retriedRef.current = true
    if (stateRef.current.pendingResult === undefined) return
    info('timer', 'found an un-settled round — retrying', { roundId: stateRef.current.pendingResult.roundId })
    retryPending()
  }, [retryPending])

  // The ticking loop exists only while running; 卸载时一并清掉。
  // 它只负责刷新显示与「到点」判定，真实剩余时间永远从 deadline 反推。
  useEffect(() => {
    if (!state.running || state.deadline === null) return
    const id = window.setInterval(() => {
      try {
        const current = stateRef.current
        const at = Date.now()
        setNow(at)
        if (remainingSecondsAt(current, at) > 0) return
        window.clearInterval(id)
        if (isBreakPhase(current.phase)) settleBreak()
        else settleFocus()
      } catch (error) {
        warn('timer', 'tick failed', error)
        window.clearInterval(id)
      }
    }, TICK_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [state.running, state.deadline, settleFocus, settleBreak])

  // A round that finished while the page was closed is settled on the way back in.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const current = stateRef.current
    if (!current.running || current.deadline === null) return
    if (current.deadline > Date.now()) return
    info('timer', 'round finished while away — settling it now')
    if (isBreakPhase(current.phase)) settleBreak()
    else settleFocus()
  }, [settleFocus, settleBreak])

  // 系统时间被改（回拨 / 大幅前进）：下一次 tick 会自然纠正；
  // 但从后台切回来时可能还没有 tick，这里补一次「到点」检查。
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return
      const current = stateRef.current
      if (!current.running || current.deadline === null) return
      if (remainingSecondsAt(current, Date.now()) > 0) return
      if (isBreakPhase(current.phase)) settleBreak()
      else settleFocus()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [settleFocus, settleBreak])

  const status = focusStatus(state)
  const remainingSeconds = remainingSecondsAt(state, now)

  return {
    status,
    statusLabel: FOCUS_STATUS_LABEL[status],
    phase: state.phase ?? 'focus',
    running: state.running,
    remainingSeconds,
    durationSeconds: state.durationMinutes * 60,
    durationMinutes: state.durationMinutes,
    elapsedSeconds: elapsedSecondsAt(state, now),
    actualMinutes: actualFocusMinutes(state, now),
    progress: focusProgress(state, now),
    boundTaskId: state.boundTaskId,
    startedAt: state.startedAt,
    roundId: state.roundId ?? '',
    roundInCycle: state.roundInCycle ?? 0,
    focusMinutes: state.focusMinutes ?? state.durationMinutes,
    lastResult:
      state.lastMinutes === undefined
        ? null
        : { minutes: state.lastMinutes, endedAt: state.lastEndedAt ?? now, taskId: state.lastTaskId ?? '' },
    pendingResult: state.pendingResult ?? null,
    start,
    pause,
    end,
    cancel,
    reset,
    setDurationMinutes,
    setBoundTaskId,
    beginBreak,
    skipBreak,
    resumeBreak,
    retryPending,
    discardPending,
  }
}

/** 暴露给调试面板：把存储里的原始信封读回来看看版本号对不对。 */
export function readRawTimerEnvelope(storageKey: string): { version: number; legacy: boolean } {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) return { version: 0, legacy: false }
    const { version, legacy } = unwrapEnvelope(JSON.parse(raw) as unknown)
    return { version, legacy }
  } catch {
    return { version: -1, legacy: false }
  }
}

/** 供 UI 判断「有没有真实数据可显示」用（避免出现 NaN 分钟）。 */
export function isFiniteMinutes(value: unknown): boolean {
  return isFiniteNumber(value)
}
