/**
 * defaults.ts — 默认值与硬边界。
 *
 * 纯常量与工厂函数，不依赖 React。之所以独立成文件：`schema.ts`（读取兜底）、
 * `useTimer`（区间校验）、`useProject`（模板）都要用同一批数字，放在 hook 里会
 * 形成 `schema → hook → react` 的循环依赖。
 *
 * V3 起这些数字从 `BOARD_CONFIG` 取，避免「配置改了一处、常量还是旧值」。
 */
import type { BoardMeta, BoardSettings, TimerPersistedState } from '../types'
import { BOARD_CONFIG } from './config'
import { DEFAULT_PROJECT_RULES } from './detect'
import { monthKey } from './time'

/** 计时器允许的时长区间（分钟）。 */
export const MIN_DURATION_MINUTES = BOARD_CONFIG.timer.minMinutes
export const MAX_DURATION_MINUTES = BOARD_CONFIG.timer.maxMinutes
/** 默认一轮长度。 */
export const DEFAULT_DURATION_MINUTES = BOARD_CONFIG.timer.defaultMinutes

/** 标题最大长度；超出直接截断，不报错。 */
export const MAX_TITLE_LENGTH = 120
/** 子任务标题更短一点，一行放得下。 */
export const MAX_SUBTASK_LENGTH = 80
/** 日志条数上限，防止 localStorage 被自动采集撑爆。 */
export const MAX_LOG_ENTRIES = BOARD_CONFIG.storage.logSoftLimit
/** 任务条数上限。 */
export const MAX_TASK_ENTRIES = 500
/** 阻碍记录条数上限。 */
export const MAX_FRICTION_ENTRIES = BOARD_CONFIG.friction.maxRecords
/** 单次专注允许的最大分钟数（脏数据夹取用）。 */
export const MAX_MINUTES = 24 * 60
/** 月度目标上限。 */
export const MAX_GOAL_MINUTES = 1_000_000
export const MAX_GOAL_TASKS = 10_000

/**
 * 计时器「残留判定」阈值：deadline 已经过去超过这个时长，说明不是这一轮跑完
 * 了，而是几天前遗留的状态。此时直接重置，不补记 —— 否则打开页面会凭空多出
 * 一段专注。
 */
export const STALE_TIMER_MS = 24 * 60 * 60 * 1000

/** 一份全新的设置。 */
export function createDefaultSettings(now = Date.now()): BoardSettings {
  return {
    autoCapture: true,
    lastDurationMinutes: DEFAULT_DURATION_MINUTES,
    projectRules: DEFAULT_PROJECT_RULES.map(rule => ({ ...rule })),
    monthlyGoal: { month: monthKey(now), targetMinutes: 1200, targetTasks: 20 },
    activeProjectId: BOARD_CONFIG.projects.allId,
    breakEnabled: BOARD_CONFIG.features.breakPhase,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    roundsBeforeLongBreak: BOARD_CONFIG.timer.roundsBeforeLongBreak,
    contextWarnMessages: BOARD_CONFIG.context.warnMessages,
    contextDangerMessages: BOARD_CONFIG.context.dangerMessages,
    aiAutoDaily: false,
    aiTier: 'stats',
    heatmapYear: 0,
  }
}

/** 一份全新的计时状态。 */
export function createDefaultTimerState(now = Date.now()): TimerPersistedState {
  void now
  return {
    running: false,
    deadline: null,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    boundTaskId: '',
    startedAt: null,
    remainingSeconds: DEFAULT_DURATION_MINUTES * 60,
    phase: 'focus',
    roundInCycle: 0,
    focusMinutes: DEFAULT_DURATION_MINUTES,
    roundId: '',
  }
}

/** 一份全新的 meta。 */
export function createDefaultMeta(): BoardMeta {
  return { sessionTaskMap: {} }
}
