/**
 * activity.ts — History / 热力图的唯一数据选择器（Phase 5.4）。
 *
 * 目标：把「某一天到底学了多久、完成了多少、算几档」变成可测试的纯函数，
 * 组件只负责渲染。**不做任何写入**，也不改 Storage Schema。
 *
 * ── 数据来源与去重 ────────────────────────────────────────────────────────
 *   focusMinutes : daily.focusMinutes 与 focus 日志之和取 **max**（不求和）
 *   tasksDone    : 任务列表完整时用实时 `completedAt` 计数；超上限时取 daily 绝对值
 *   activityCount: 完成任务 + 有效 focus 记录 + 非 focus 记录（不读 timeline）
 *   score        : focusMinutes + tasksDone × 25（1 个任务 ≈ 1 个 25 分钟番茄）
 *   level        : 复用 heatmap.levelOf() 的 [1,25,60,120] 阈值
 *
 * 为什么用 max 而不是相加：daily 与日志描述的是**同一批事件**。相加会翻倍；
 * 直接信 daily 又会在「删日志后 daily 没扣干净 / 旧日志被裁掉」时失真。
 * max 同时覆盖两种偏差，且永远不会产生「1 + 1 = 2 倍」的重复累计。
 *
 * ── 日期运算 ──────────────────────────────────────────────────────────────
 * 全部用 `Date.setDate` 做日历运算，不用 +86_400_000；跨月 / 跨年 / 闰年 /
 * 夏令时都不会错格。所有 key 都是本地墙钟的 `YYYY-MM-DD`。
 */
import type { DailyAggregate, HeatmapLevel, SessionLog, Task } from '../types'
import { MAX_LOG_ENTRIES, MAX_TASK_ENTRIES } from './defaults'
import { levelOf } from './heatmap'
import { dayKey, recentDayKeys } from './time'

/**
 * 时间窗（含今天）。
 *
 * `7` 是 Phase 5.5 加进来的：专注面板要显示「近 7 日活跃」，必须复用同一套
 * 去重与计分逻辑，不能为了一个 7 天数字在组件里再写一遍。
 */
export type ActivityRange = 7 | 30 | 90 | 365

/** 一天的活动。`inRange=false` 只出现在日历首尾补齐格。 */
export interface ActivityDay {
  day: string
  focusMinutes: number
  tasksDone: number
  /** 有效专注记录条数（daily-only 的老日子按下限记 1 次，不编造具体条数）。 */
  focusCount: number
  /** 完成任务 + 有效专注记录 + 非专注记录的条数（不读 timeline，避免镜像重复）。 */
  activityCount: number
  /** 等效专注分钟：focusMinutes + tasksDone × 25。 */
  score: number
  level: HeatmapLevel
  inRange: boolean
  /** 专注分钟的来源，UI 可据此提示「该日由日志回退计算」。 */
  focusSource: 'daily' | 'logs' | 'empty' | 'reconciled'
  /** 任务数来源：实时任务列表 / daily 绝对值。 */
  tasksSource: 'tasks' | 'daily'
  /** daily 与原始数据不一致（已按规则取更可信的一方）。 */
  reconciled: boolean
}

export interface ActivitySummary {
  startDay: string
  endDay: string
  /** 有有效活动（专注 > 0 或完成 > 0）的天数。 */
  activeDays: number
  /** 窗口内最长连续活跃天数。 */
  longestStreak: number
  /** 截至今天的连续活跃天数（今天为空时允许从昨天起算）。 */
  currentStreak: number
  focusMinutes: number
  tasksDone: number
  activityCount: number
  /** 今天是否已有活动（决定「当前连续」的起算点）。 */
  todayActive: boolean
}

export interface ActivityWindow {
  range: ActivityRange
  days: ActivityDay[]
  summary: ActivitySummary
}

export interface ActivityInput {
  daily: DailyAggregate[]
  tasks: Task[]
  logs: SessionLog[]
}

export interface ActivityOptions {
  range: ActivityRange
  /** 用于可复现测试；生产传 `Date.now()`。 */
  now?: number
}

/** 25 分钟 = 一个番茄，作为「一个完成任务」的等效权重。 */
export const TASK_SCORE_WEIGHT = 25

/** 0–4 档的中文说明（与 heatmap 阈值一一对应）。 */
export const ACTIVITY_LEVEL_LABEL: Record<HeatmapLevel, string> = {
  0: '无活动',
  1: '轻量（<25 分钟等效）',
  2: '中等（25–59）',
  3: '较高（60–119）',
  4: '高强度（≥120）',
}

const DAY_MS = 24 * 60 * 60 * 1000

function weekdayIndex(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  return (date.getDay() + 6) % 7
}

/** 在 key 上加减若干**日历日**（不受 DST 影响）。 */
export function shiftDayKey(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() + delta)
  return dayKey(date.getTime())
}

/** 空白天（用于日历补齐格）。 */
function blankDay(day: string, inRange: boolean): ActivityDay {
  return {
    day,
    focusMinutes: 0,
    tasksDone: 0,
    focusCount: 0,
    activityCount: 0,
    score: 0,
    level: 0,
    inRange,
    focusSource: 'empty',
    tasksSource: 'tasks',
    reconciled: false,
  }
}

/**
 * 计算所选窗口内每一天的活动。
 *
 * @param input - daily / tasks / logs（全部历史，未按项目过滤）
 * @param options - 窗口长度与「今天」
 */
export function buildActivityWindow(input: ActivityInput, options: ActivityOptions): ActivityWindow {
  const now = options.now ?? Date.now()
  const keys = recentDayKeys(options.range, now)

  const dailyByDay = new Map<string, DailyAggregate>()
  for (const item of input.daily) dailyByDay.set(item.day, item)

  const focusByDay = new Map<string, { minutes: number; count: number }>()
  const otherByDay = new Map<string, number>()
  // 同一条日志被重复投递（同 id）时只算一次；不同 id 的两次专注是两次真实活动。
  const seenLogs = new Set<string>()
  for (const log of input.logs) {
    if (seenLogs.has(log.id)) continue
    seenLogs.add(log.id)
    const key = dayKey(log.at)
    if (log.kind === 'focus') {
      const minutes = Math.max(0, Math.round(log.minutes ?? 0))
      if (minutes <= 0) continue
      const current = focusByDay.get(key) ?? { minutes: 0, count: 0 }
      focusByDay.set(key, { minutes: current.minutes + minutes, count: current.count + 1 })
    } else {
      otherByDay.set(key, (otherByDay.get(key) ?? 0) + 1)
    }
  }

  const tasksByDay = new Map<string, number>()
  for (const task of input.tasks) {
    if (task.completedAt === undefined) continue
    const key = dayKey(task.completedAt)
    tasksByDay.set(key, (tasksByDay.get(key) ?? 0) + 1)
  }

  // 列表完整 = 没有被上限裁剪；超限时只能相信 daily 的绝对值。
  const tasksComplete = input.tasks.length < MAX_TASK_ENTRIES
  const logsComplete = input.logs.length < MAX_LOG_ENTRIES

  const days: ActivityDay[] = keys.map(day => {
    const aggregate = dailyByDay.get(day)
    const logFocus = focusByDay.get(day) ?? { minutes: 0, count: 0 }
    const dailyMinutes = aggregate?.focusMinutes

    const focusMinutes = Math.max(dailyMinutes ?? 0, logFocus.minutes)
    const focusSource: ActivityDay['focusSource'] =
      dailyMinutes === undefined
        ? logFocus.minutes > 0
          ? 'logs'
          : 'empty'
        : logFocus.minutes > dailyMinutes
          ? 'reconciled'
          : 'daily'

    const liveTasks = tasksByDay.get(day) ?? 0
    const tasksDone = tasksComplete ? liveTasks : Math.max(liveTasks, aggregate?.tasksDone ?? 0)

    const liveOther = otherByDay.get(day) ?? 0
    // daily.sessions 在「删除非 focus 日志」后不会回退（审计 G1），
    // 所以日志完整时以实时条数为准；只有超上限时才取 max 兜底。
    const otherCount = logsComplete ? liveOther : Math.max(liveOther, aggregate?.sessions ?? 0)

    /**
     * daily-only 的日子（旧日志已超出 400 条上限）没有「专注条数」，
     * 但 focusMinutes > 0 说明至少发生过一次专注 —— 记 1 次，而不是记 0。
     * 这是下限，不编造具体条数。
     */
    const focusCount = logFocus.count > 0 ? logFocus.count : focusMinutes > 0 ? 1 : 0
    const activityCount = tasksDone + focusCount + otherCount
    const score = focusMinutes + tasksDone * TASK_SCORE_WEIGHT

    // 只把「原始日志比 daily 更多」视为不一致：daily 更多可能是日志被裁掉（正常），
    // 反过来则说明 daily 漏记了真实专注。
    const reconciled =
      (dailyMinutes !== undefined && logFocus.minutes > dailyMinutes) ||
      (!tasksComplete && aggregate !== undefined && aggregate.tasksDone !== liveTasks)

    return {
      day,
      focusMinutes,
      tasksDone,
      focusCount,
      activityCount,
      score,
      level: levelOf(score),
      inRange: true,
      focusSource,
      tasksSource: tasksComplete ? 'tasks' : 'daily',
      reconciled,
    }
  })

  return {
    range: options.range,
    days,
    summary: summarize(days),
  }
}

/** 对连续窗口做统计（活跃 / 最长连续 / 当前连续 / 合计）。 */
export function summarize(days: ActivityDay[]): ActivitySummary {
  const active = days.map(day => day.score > 0)
  let activeDays = 0
  let longestStreak = 0
  let run = 0
  let focusMinutes = 0
  let tasksDone = 0
  let activityCount = 0

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index]!
    focusMinutes += day.focusMinutes
    tasksDone += day.tasksDone
    activityCount += day.activityCount
    if (active[index] === true) {
      activeDays += 1
      run += 1
      longestStreak = Math.max(longestStreak, run)
    } else {
      run = 0
    }
  }

  const lastIndex = days.length - 1
  const todayActive = lastIndex >= 0 && active[lastIndex] === true
  let currentStreak = 0
  // 今天没有活动时，允许从昨天起算（与 stats.countStreak 的产品规则一致）。
  let cursor = todayActive ? lastIndex : lastIndex - 1
  while (cursor >= 0 && active[cursor] === true) {
    currentStreak += 1
    cursor -= 1
  }

  return {
    startDay: days[0]?.day ?? '',
    endDay: days[lastIndex]?.day ?? '',
    activeDays,
    longestStreak,
    currentStreak,
    focusMinutes,
    tasksDone,
    activityCount,
    todayActive,
  }
}

export interface ActivityCalendar {
  /** 每周一列，列内 7 天（周一 → 周日），首尾补齐格 `inRange=false`。 */
  weeks: ActivityDay[][]
  /** 月份标签：该周包含某月 1 日时标一次。 */
  monthLabels: Array<{ weekIndex: number; label: string }>
}

/**
 * 把连续日期排成「周一对齐」的日历。
 *
 * 首周与末周用空白天补齐，保证每列 7 格；补齐格不属于所选范围，
 * 渲染时置灰、不参与统计。
 */
export function buildActivityCalendar(days: ActivityDay[]): ActivityCalendar {
  if (days.length === 0) return { weeks: [], monthLabels: [] }
  const first = days[0]!
  const padStart = weekdayIndex(first.day)
  const cells: ActivityDay[] = []

  for (let index = padStart; index > 0; index -= 1) {
    cells.push(blankDay(shiftDayKey(first.day, -index), false))
  }
  cells.push(...days)
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!
    cells.push(blankDay(shiftDayKey(last.day, 1), false))
  }

  const weeks: ActivityDay[][] = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))

  const monthLabels: Array<{ weekIndex: number; label: string }> = []
  weeks.forEach((week, weekIndex) => {
    const firstOfMonth = week.find(cell => cell.inRange && cell.day.endsWith('-01'))
    if (firstOfMonth === undefined) return
    const month = Number(firstOfMonth.day.slice(5, 7))
    if (!Number.isFinite(month)) return
    monthLabels.push({ weekIndex, label: `${month}月` })
  })

  return { weeks, monthLabels }
}

/** 某天的分析（列表 / 详情共用；不存在时返回空白日）。 */
export function activityOf(days: ActivityDay[], day: string): ActivityDay {
  return days.find(item => item.day === day) ?? blankDay(day, false)
}

/**
 * 合并同一天的 `TimelineEvent`（列表用）。
 *
 * 只做分组与排序，不改事件内容；没有任何统计含义。
 */
export interface TimelineGroup<T extends { at: number; id: string }> {
  day: string
  at: number
  events: T[]
}

export function groupTimelineByDay<T extends { at: number; id: string }>(events: T[]): TimelineGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const event of events) {
    const key = dayKey(event.at)
    const list = map.get(key)
    if (list === undefined) map.set(key, [event])
    else list.push(event)
  }
  return [...map.entries()]
    .map(([day, list]) => ({
      day,
      at: Math.max(...list.map(event => event.at)),
      events: [...list].sort((left, right) => right.at - left.at),
    }))
    .sort((left, right) => right.at - left.at)
}

/** 时区/DST 回归用：两个 key 之间相差多少个日历日。 */
export function dayDistance(from: string, to: string): number {
  const parse = (key: string): number => {
    const [year, month, day] = key.split('-').map(Number)
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime()
  }
  // 用四舍五入抵消 DST 带来的 ±1 小时。
  return Math.round((parse(to) - parse(from)) / DAY_MS)
}
