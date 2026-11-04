/**
 * focus.ts — 专注计时的**纯状态机**（Phase 5.5）。
 *
 * 为什么单独抽出来：计时器的正确性不该靠「手动点一遍看看」。这里只做
 * `旧状态 + 参数 → 新状态`，不读 `Date.now()`（时间一律当参数传）、不碰
 * localStorage、不碰 React，所以可以用「可控时钟」把后台节流、睡眠恢复、
 * 多次暂停、重复结束、系统时间回拨这些场景全部钉死在断言里。
 *
 * ── 状态怎么来的（不新增持久化字段）───────────────────────────────────────
 * 只从 `TimerPersistedState` 已有的字段派生：
 *
 *   阶段 focus + running                     → running
 *   阶段 focus + 未跑 + 剩余 0                → completed（本轮已结算）
 *   阶段 focus + 未跑 + 剩余 < 全长 + 有开始时间 → paused
 *   阶段 focus + 未跑 + 剩余 = 全长            → idle
 *   阶段 short/long + running                → break
 *   阶段 short/long + 未跑                    → break-paused
 *
 * 「剩余 0」能当终态标记，是因为 `endRound` 特意把 remaining 留在 0 而不是回满：
 * 刷新后仍然显示「本轮完成 · 18 分钟」，而不是悄悄退回 idle 让人以为没记上。
 *
 * ── 实际时长怎么算（需求 §5.1）─────────────────────────────────────────────
 * `elapsed = 全长 - 剩余`。剩余时间只在**跑着的时候**减少（暂停时 deadline
 * 被清空、剩余被冻结），所以多段暂停天然累计，不需要额外的 accumulated 字段。
 * 记日志时取 `floor(elapsed / 60)`，不足 1 分钟不记 —— 宁可少记，不虚报。
 */
import type { TimerPersistedState, TimerPhase } from '../types'
import { BOARD_CONFIG } from './config'
import { clampBreakMinutes, clampDurationMinutes } from './validate'

/** 六个对用户有意义的界面状态。 */
export type FocusStatus = 'idle' | 'running' | 'paused' | 'completed' | 'break' | 'break-paused'

export const FOCUS_STATUS_LABEL: Record<FocusStatus, string> = {
  idle: '待开始',
  running: '专注中',
  paused: '已暂停',
  completed: '本轮完成',
  break: '休息中',
  'break-paused': '休息暂停',
}

/** 休息相关的设置（与 `BoardSettings` 同名字段一一对应）。 */
export interface FocusSettings {
  breakEnabled: boolean
  shortBreakMinutes: number
  longBreakMinutes: number
  roundsBeforeLongBreak: number
}

/** 一次结算的结果。`recorded === false` 表示不足 1 分钟，调用方不得写日志。 */
export interface FocusResult {
  /** 幂等键：日志 id 直接用它。 */
  roundId: string
  /** 实际专注分钟（向下取整）。 */
  minutes: number
  /** 实际专注秒数（用于「不足 1 分钟」的提示文案）。 */
  elapsedSeconds: number
  targetMinutes: number
  taskId: string
  startedAt: number
  endedAt: number
  /** 下一轮是否该长休（由本轮在环里的位置决定）。 */
  longBreak: boolean
  /** 是否真的值得写一条记录。 */
  recorded: boolean
}

/** 一次休息的开始结果。 */
export interface BreakInfo {
  phase: 'short' | 'long'
  minutes: number
  longBreak: boolean
}

export function isBreakPhase(phase: TimerPhase | undefined): boolean {
  return phase === 'short' || phase === 'long'
}

/** 当前状态。`now` 不参与判断，用剩余秒数即可（见文件头的派生表）。 */
export function focusStatus(state: TimerPersistedState): FocusStatus {
  const phase = state.phase ?? 'focus'
  const duration = Math.max(0, state.durationMinutes) * 60
  if (isBreakPhase(phase)) return state.running ? 'break' : 'break-paused'
  if (state.running) return 'running'
  const remaining = Math.max(0, Math.min(duration, state.remainingSeconds))
  if (remaining <= 0) return 'completed'
  /**
   * 「这一轮已经开始过」的唯一标记是 `startedAt`，不是「剩余 < 全长」。
   *
   * 为什么不能用剩余判断：刚开始就暂停（1 秒内）时 `ceil` 会把剩余取回全长，
   * 那一刻剩余 === 全长，但这一轮确实开始了 —— 如果判成 idle，界面会显示
   * 「开始专注」，用户再点一下就会**换一个新的 roundId**，那一轮白记。
   */
  if (state.startedAt !== null) return 'paused'
  return 'idle'
}

/** `now` 时刻的剩余秒数（跑着时由 deadline 反推）。 */
export function remainingSecondsAt(state: TimerPersistedState, now: number): number {
  if (state.running && state.deadline !== null) {
    return Math.max(0, Math.ceil((state.deadline - now) / 1000))
  }
  const duration = Math.max(0, state.durationMinutes) * 60
  const stored = Number.isFinite(state.remainingSeconds) ? state.remainingSeconds : duration
  return Math.max(0, Math.min(duration, stored))
}

/** `now` 时刻已经专注了多少秒（多段暂停自动累计）。 */
export function elapsedSecondsAt(state: TimerPersistedState, now: number): number {
  if (isBreakPhase(state.phase)) return 0
  const duration = Math.max(0, state.durationMinutes) * 60
  return Math.max(0, Math.min(duration, duration - remainingSecondsAt(state, now)))
}

/** 实际专注分钟：向下取整，不四舍五入（不虚报）。 */
export function actualFocusMinutes(state: TimerPersistedState, now: number): number {
  return Math.floor(elapsedSecondsAt(state, now) / 60)
}

/** 本轮进度 0–1（休息段恒为 0，休息有自己的进度）。 */
export function focusProgress(state: TimerPersistedState, now: number): number {
  const duration = Math.max(0, state.durationMinutes) * 60
  if (duration <= 0) return 0
  return Math.min(1, Math.max(0, 1 - remainingSecondsAt(state, now) / duration))
}

/**
 * 生成一轮的唯一 id（幂等键）。
 *
 * `random` 可注入，测试里给固定值就能得到确定的 id；生产环境用 `Math.random`。
 */
export function createRoundId(now = Date.now(), random: () => number = Math.random): string {
  return `focus-${now.toString(36)}-${Math.floor(random() * 0xffffff).toString(36)}`
}

/** 让任意输入变成合法的一轮 id（外部传入的脏值一律重生成）。 */
export function normalizeRoundId(value: unknown, now = Date.now()): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > 80) return ''
  if (!/^focus-[a-z0-9-]+$/i.test(trimmed)) return ''
  void now
  return trimmed
}

/** 空闲态（当前阶段的全长，未开始）。 */
export function idleState(state: TimerPersistedState, minutes?: number): TimerPersistedState {
  const phase = state.phase ?? 'focus'
  const target = isBreakPhase(phase)
    ? clampBreakMinutes(minutes ?? state.durationMinutes, state.durationMinutes)
    : clampDurationMinutes(minutes ?? state.durationMinutes)
  return {
    ...state,
    running: false,
    deadline: null,
    durationMinutes: target,
    remainingSeconds: target * 60,
    startedAt: null,
    roundId: '',
    lastMinutes: undefined,
    lastEndedAt: undefined,
    lastTaskId: undefined,
    pendingResult: undefined,
    ...(isBreakPhase(phase) ? {} : { focusMinutes: target }),
  }
}

/**
 * 开始 / 继续。
 *
 * - 暂停中：接着剩余时间走，**沿用同一 roundId 与 startedAt**（同一轮，不是新一轮）；
 * - 已完成 / 空闲：开新一轮，生成新 roundId；
 * - 跑着：重复调用无副作用（防双击）；
 * - 休息段：不允许从这里开始（必须先结束休息）。
 */
export function startRound(state: TimerPersistedState, now: number): TimerPersistedState {
  if (state.running) return state
  if (isBreakPhase(state.phase)) return state
  const duration = Math.max(0, state.durationMinutes) * 60
  const resumed = state.startedAt !== null && state.remainingSeconds > 0 && state.remainingSeconds <= duration
  const total = resumed ? state.remainingSeconds : duration
  if (total <= 0) return state
  return {
    ...state,
    running: true,
    deadline: now + total * 1000,
    remainingSeconds: total,
    startedAt: resumed ? state.startedAt : now,
    roundId: resumed ? state.roundId : createRoundId(now),
    phase: 'focus',
  }
}

/** 暂停（跑着才有意义），把剩余时间冻结下来。 */
export function pauseRound(state: TimerPersistedState, now: number): TimerPersistedState {
  if (!state.running) return state
  return { ...state, running: false, deadline: null, remainingSeconds: remainingSecondsAt(state, now) }
}

/**
 * 结束本轮并结算。
 *
 * 关键点：**先落「已结束」状态，再交回结果**。调用方拿到 result 去写日志，
 * 即使写日志的过程中有人刷新页面，存储里也已经是 completed，不会二次记账。
 */
export function endRound(
  state: TimerPersistedState,
  now: number,
  settings: FocusSettings,
): { state: TimerPersistedState; result: FocusResult } {
  /**
   * 只有「跑着」或「暂停中」的专注轮可以结算。
   * 已经 completed / idle 的再调一次直接返回空结果 —— 这是重复结束的第二道闸
   * （第一道在 useTimer.end()，第三道是日志 id 幂等）。
   */
  if (!state.running && focusStatus(state) !== 'paused') {
    return {
      state,
      result: {
        roundId: '',
        minutes: 0,
        elapsedSeconds: 0,
        targetMinutes: state.durationMinutes,
        taskId: state.boundTaskId,
        startedAt: now,
        endedAt: now,
        longBreak: false,
        recorded: false,
      },
    }
  }
  const targetMinutes = clampDurationMinutes(state.durationMinutes)
  const elapsed = elapsedSecondsAt(state, now)
  const minutes = Math.floor(elapsed / 60)
  const roundsDone = (state.roundInCycle ?? 0) + 1
  const longBreak = roundsDone >= Math.max(2, settings.roundsBeforeLongBreak || 4)
  /**
   * 结束时刻取 `min(now, deadline)`：电脑睡眠 / 页面关了一夜再回来时，
   * 真正的结束点是 deadline，不是「打开页面的那一刻」。否则跨零点的那一轮
   * 会被记到今天，热力图的日期就错了。
   */
  const endedAt = state.running && state.deadline !== null ? Math.min(now, state.deadline) : now
  const startedAt = state.startedAt ?? endedAt
  /**
   * 幂等键的兜底：老数据（V3 起就没有 roundId）用 `startedAt` 派生。
   *
   * 为什么用 startedAt 而不是随机数：刷新重放 / 双标签同时结算会各自调一次
   * `endRound`，只有「同一轮得到同一个 id」才能让 `addFocusLog` 的同 id 判断
   * 真正挡住重复写入。随机 id 在这种情况下必然写两条。
   */
  const roundId = state.roundId !== undefined && state.roundId !== '' ? state.roundId : `focus-${startedAt.toString(36)}`
  const result: FocusResult = {
    roundId,
    minutes,
    elapsedSeconds: elapsed,
    targetMinutes,
    taskId: state.boundTaskId,
    startedAt,
    endedAt,
    longBreak,
    recorded: minutes >= 1,
  }
  const next: TimerPersistedState = {
    ...state,
    running: false,
    deadline: null,
    remainingSeconds: 0,
    startedAt: null,
    roundId: '',
    roundInCycle: roundsDone,
    focusMinutes: targetMinutes,
    phase: 'focus',
    // 记下真实结算值：刷新后 completed 态要能显示「18 分钟」而不是目标 25 分钟。
    lastMinutes: minutes,
    lastEndedAt: endedAt,
    ...(state.boundTaskId === '' ? {} : { lastTaskId: state.boundTaskId }),
    /**
     * 待落盘标记（Phase 5.5.1）：只有「真的该写一条记录」时才留。
     * 落盘成功后由 useTimer 清掉；失败时它就留在存储里，下次挂载自动重试。
     */
    ...(result.recorded
      ? {
          pendingResult: {
            roundId,
            minutes,
            elapsedSeconds: elapsed,
            targetMinutes,
            taskId: state.boundTaskId,
            startedAt,
            endedAt,
          },
        }
      : {}),
  }
  return { state: next, result }
}

/** 取消：什么都不记，回到当前阶段的全长待机。 */
export function cancelRound(state: TimerPersistedState): TimerPersistedState {
  return idleState(state)
}

/** 进入休息（短 / 长），立即开始计时。 */
export function startBreak(
  state: TimerPersistedState,
  now: number,
  settings: FocusSettings,
  kind?: 'short' | 'long',
): { state: TimerPersistedState; info: BreakInfo } {
  const longBreak = kind === 'long' || (kind === undefined && (state.roundInCycle ?? 0) >= Math.max(2, settings.roundsBeforeLongBreak || 4))
  const minutes = longBreak
    ? clampBreakMinutes(settings.longBreakMinutes, 15)
    : clampBreakMinutes(settings.shortBreakMinutes, 5)
  const phase: 'short' | 'long' = longBreak ? 'long' : 'short'
  const focusMinutes = clampDurationMinutes(state.focusMinutes ?? state.durationMinutes)
  const next: TimerPersistedState = {
    ...state,
    phase,
    durationMinutes: minutes,
    remainingSeconds: minutes * 60,
    running: true,
    deadline: now + minutes * 60_000,
    startedAt: now,
    roundId: '',
    focusMinutes,
    roundInCycle: longBreak ? 0 : state.roundInCycle ?? 0,
  }
  return { state: next, info: { phase, minutes, longBreak } }
}

/** 休息结束 / 跳过：回到专注待机（不写任何专注记录）。 */
export function finishBreak(state: TimerPersistedState): TimerPersistedState {
  if (!isBreakPhase(state.phase)) return state
  const focusMinutes = clampDurationMinutes(state.focusMinutes ?? state.durationMinutes)
  return {
    ...state,
    phase: 'focus',
    durationMinutes: focusMinutes,
    remainingSeconds: focusMinutes * 60,
    running: false,
    deadline: null,
    startedAt: null,
    roundId: '',
    focusMinutes,
  }
}

/** 暂停后继续（专注与休息通用，沿用剩余时间与 roundId）。 */
export function resumeRound(state: TimerPersistedState, now: number): TimerPersistedState {
  if (state.running) return state
  const duration = Math.max(0, state.durationMinutes) * 60
  const total = Math.max(0, Math.min(duration, state.remainingSeconds))
  if (total <= 0) return state
  return {
    ...state,
    running: true,
    deadline: now + total * 1000,
    remainingSeconds: total,
    startedAt: state.startedAt ?? now,
  }
}

/** 休息是否该结束了（供 tick 判断）。 */
export function breakExpired(state: TimerPersistedState, now: number): boolean {
  return isBreakPhase(state.phase) && state.running && remainingSecondsAt(state, now) <= 0
}

/** 专注是否该结束了（供 tick 判断）。 */
export function focusExpired(state: TimerPersistedState, now: number): boolean {
  return !isBreakPhase(state.phase) && state.running && remainingSecondsAt(state, now) <= 0
}

/** 本轮默认时长：优先用设置里的值，夹到合法区间。 */
export function resolveDuration(settings: { lastDurationMinutes?: number } | undefined): number {
  return clampDurationMinutes(settings?.lastDurationMinutes, BOARD_CONFIG.timer.defaultMinutes)
}
