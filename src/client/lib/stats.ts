/**
 * Aggregations — pure, memo-friendly, and the single definition of every number
 * the board shows. Components never compute a total themselves; they call in
 * here, so the Overview card and the Statistics card can never disagree.
 *
 * ── 口径（重要）────────────────────────────────────────────────────────────
 * 「专注分钟」只有一个来源：`kind === 'focus'` 的日志（每完成一轮计时写一条）。
 * `Task.focusedMinutes` 只是**按任务**的展示副本，不参与任何总计 —— 否则同一
 * 轮计时会被算两次。V1 历史遗留的 `pomodoros` 计数同理，只在任务行里展示。
 */
import type {
  BoardStats,
  GanttRow,
  MonthlyGoal,
  SessionLog,
  SessionType,
  Task,
} from '../types'
import { SESSION_TYPE_ORDER } from './config'
import { dayKey, monthKey, startOfDay, startOfMonth, startOfWeek } from './time'

/** V1 records only carried a pomodoro count; this is the assumed round length. */
export const LEGACY_ROUND_MINUTES = 25

/** 会话类型顺序：全局一份（config），图表与图例都跟着它走。 */
const SESSION_TYPES: readonly SessionType[] = SESSION_TYPE_ORDER

/** Minutes of focus actually attributed to one task (V2 field, V1 fallback). */
export function taskFocusMinutes(task: Task): number {
  if (typeof task.focusedMinutes === 'number') return Math.max(0, task.focusedMinutes)
  return Math.max(0, (task.pomodoros ?? 0) * LEGACY_ROUND_MINUTES)
}

/** Focus minutes recorded on one day, from `kind === 'focus'` logs only. */
export function focusMinutesOn(logs: SessionLog[], key: string): number {
  let total = 0
  for (const log of logs) {
    if (log.kind !== 'focus') continue
    if (dayKey(log.at) !== key) continue
    total += Math.max(0, log.minutes ?? 0)
  }
  return total
}

/**
 * Consecutive active days ending today.
 *
 * "Active" = any of: a task was created, a task was completed, or a log exists.
 * The window may start yesterday, so a streak survives until the first activity
 * of a new day instead of reading 0 all morning.
 */
export function countStreak(tasks: Task[], logs: SessionLog[], now = Date.now()): number {
  const days = new Set<string>()
  // 只有「完成」才算学习；创建 / 编辑任务不算（P0.5）。
  for (const task of tasks) {
    if (task.completedAt !== undefined) days.add(dayKey(task.completedAt))
  }
  // 只有「有效的专注记录」才算；消息、工具、代码块都不算。
  for (const log of logs) {
    if (log.kind !== 'focus') continue
    if ((log.minutes ?? 0) <= 0) continue
    days.add(dayKey(log.at))
  }
  if (days.size === 0) return 0

  const cursor = new Date(startOfDay(now))
  // 今天没有记录时，从昨天开始算「截至昨天」的连续天数。
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(dayKey(cursor.getTime()))) return 0
  }

  let streak = 0
  while (streak < 400 && days.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Everything the Overview card renders. */
export function computeBoardStats(tasks: Task[], logs: SessionLog[], now = Date.now()): BoardStats {
  const today = dayKey(now)
  let tasksDoneToday = 0
  for (const task of tasks) {
    if (task.done && task.completedAt !== undefined && dayKey(task.completedAt) === today) {
      tasksDoneToday += 1
    }
  }
  let logsToday = 0
  for (const log of logs) {
    if (dayKey(log.at) === today) logsToday += 1
  }
  return {
    tasksDoneToday,
    tasksTotal: tasks.length,
    focusMinutesToday: focusMinutesOn(logs, today),
    streakDays: countStreak(tasks, logs, now),
    logsToday,
    overdueTasks: tasks.filter(task => isOverdue(task, now)).length,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Charts
 * ──────────────────────────────────────────────────────────────────────────── */

/** One bar of the 7-day chart. */
export interface DailyFocusPoint {
  key: string
  minutes: number
}

/** Focus minutes for each of the given day keys (zero-filled, input order kept). */
export function dailyFocusSeries(logs: SessionLog[], keys: string[]): DailyFocusPoint[] {
  const totals = new Map<string, number>()
  for (const log of logs) {
    if (log.kind !== 'focus') continue
    const key = dayKey(log.at)
    totals.set(key, (totals.get(key) ?? 0) + Math.max(0, log.minutes ?? 0))
  }
  return keys.map(key => ({ key, minutes: Math.round(totals.get(key) ?? 0) }))
}

/**
 * Minutes attributed to a log entry.
 *
 * Auto-captured entries have no duration of their own, so one is **estimated**
 * from the gap to the next entry (capped at 30 min, floored at 2), and the last
 * entry of a batch gets a flat 5. Explicit `minutes` (timer rounds, manual
 * entries) always win. Every chart that shows durations draws from here, so the
 * estimate is at least consistent everywhere.
 */
export function assignLogMinutes(logs: SessionLog[]): Array<{ log: SessionLog; minutes: number }> {
  const ascending = [...logs].sort((a, b) => a.at - b.at)
  return ascending.map((log, index) => {
    if (typeof log.minutes === 'number' && log.minutes > 0) {
      return { log, minutes: log.minutes }
    }
    const next = ascending[index + 1]
    if (next === undefined) return { log, minutes: 5 }
    const gapMinutes = (next.at - log.at) / 60_000
    const estimated = Math.round(Math.min(30, Math.max(2, gapMinutes)))
    return { log, minutes: estimated }
  })
}

/** One slice of the per-type pie. */
export interface TypeSlice {
  type: SessionType
  minutes: number
  count: number
}

/** Minutes + entry count per session type for one day. */
export function typeBreakdown(logs: SessionLog[], key: string): TypeSlice[] {
  const dayLogs = logs.filter(log => dayKey(log.at) === key)
  const totals = new Map<SessionType, { minutes: number; count: number }>()
  for (const type of SESSION_TYPES) totals.set(type, { minutes: 0, count: 0 })

  for (const { log, minutes } of assignLogMinutes(dayLogs)) {
    const type = log.sessionType ?? 'other'
    const bucket = totals.get(type) ?? { minutes: 0, count: 0 }
    totals.set(type, { minutes: bucket.minutes + minutes, count: bucket.count + 1 })
  }

  return SESSION_TYPES.map(type => {
    const bucket = totals.get(type) ?? { minutes: 0, count: 0 }
    return { type, minutes: bucket.minutes, count: bucket.count }
  })
}

/** One row of the project summary. */
export interface ProjectTotal {
  project: string
  minutes: number
  count: number
}

/** Total focus time grouped by project, longest first. `''` becomes 未归属项目. */
export function projectTotals(logs: SessionLog[]): ProjectTotal[] {
  const totals = new Map<string, { minutes: number; count: number }>()
  for (const { log, minutes } of assignLogMinutes(logs)) {
    const project = log.project !== undefined && log.project.trim() !== '' ? log.project : '未归属项目'
    const bucket = totals.get(project) ?? { minutes: 0, count: 0 }
    totals.set(project, { minutes: bucket.minutes + minutes, count: bucket.count + 1 })
  }
  return [...totals.entries()]
    .map(([project, bucket]) => ({ project, minutes: bucket.minutes, count: bucket.count }))
    .sort((a, b) => b.minutes - a.minutes)
}

/** Tasks added vs tasks completed in the current week. */
export function weekCompletion(tasks: Task[], now = Date.now()): { created: number; done: number; rate: number } {
  const weekStart = startOfWeek(now)
  let created = 0
  let done = 0
  for (const task of tasks) {
    if (task.createdAt >= weekStart) created += 1
    if (task.completedAt !== undefined && task.completedAt >= weekStart) done += 1
  }
  const denominator = created === 0 ? done : created
  const rate = denominator === 0 ? 0 : Math.min(1, done / denominator)
  return { created, done, rate }
}

/** Progress against the configured monthly goal. */
export interface MonthlyProgress {
  focusMinutes: number
  doneTasks: number
  minutesRate: number
  tasksRate: number
  /** Whether the stored goal belongs to the current month. */
  inCurrentMonth: boolean
}

export function monthlyProgress(
  tasks: Task[],
  logs: SessionLog[],
  goal: MonthlyGoal,
  now = Date.now(),
): MonthlyProgress {
  const monthStart = startOfMonth(now)
  const current = monthKey(now)

  let focusMinutes = 0
  for (const log of logs) {
    if (log.kind !== 'focus') continue
    if (log.at >= monthStart) focusMinutes += Math.max(0, log.minutes ?? 0)
  }

  let doneTasks = 0
  for (const task of tasks) {
    if (task.completedAt !== undefined && task.completedAt >= monthStart) doneTasks += 1
  }

  return {
    focusMinutes,
    doneTasks,
    minutesRate: goal.targetMinutes > 0 ? Math.min(1, focusMinutes / goal.targetMinutes) : 0,
    tasksRate: goal.targetTasks > 0 ? Math.min(1, doneTasks / goal.targetTasks) : 0,
    inCurrentMonth: goal.month === current,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * V3：逾期 / 甘特 / 阻碍（需求 2.2.4、2.4.1、3.4.3）
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 是否逾期。
 *
 * 口径：有 `dueAt`、未完成、且**当前时间已过截止**。已完成的永远不算逾期 ——
 * 逾期率是「还有多少欠账」，不是「历史上迟到过几次」。
 */
export function isOverdue(task: Task, now = Date.now()): boolean {
  if (task.done) return false
  if (task.dueAt === undefined) return false
  return task.dueAt < now
}

export interface OverdueStats {
  /** 有截止时间的未完成任务数。 */
  scheduled: number
  overdue: number
  /** 逾期占「有截止时间的未完成任务」的比例（0–1）。 */
  rate: number
  items: Task[]
}

/**
 * 逾期统计（需求 2.2.4「统计面板单独统计逾期任务占比」）。
 *
 * 分母用 `scheduled`（设了截止的未完成任务），而不是全部任务 —— 否则「从来
 * 不设截止」的人会永远显示 0%，看不出问题；而用全部任务当分母又会把「没打算
 * 定截止」的正常任务算成欠账。
 */
export function overdueStats(tasks: Task[], now = Date.now()): OverdueStats {
  const open = tasks.filter(task => !task.done && task.dueAt !== undefined)
  const items = open.filter(task => task.dueAt !== undefined && task.dueAt < now)
  const scheduled = open.length
  return {
    scheduled,
    overdue: items.length,
    rate: scheduled === 0 ? 0 : items.length / scheduled,
    items: items.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
  }
}

/**
 * 每日完成时序（需求 2.4.1「任务进度甘特简易视图」）。
 *
 * 这里不做真正的甘特（那需要开始/结束区间），而是「按天分组的完成流水」：
 * 每行一天，行内按完成时间排序，条长按该任务的专注分钟数取对数缩放 —— 目测
 * 能看出「今天推进了几件事、各花了多久」，比一堆坐标轴实用。
 */
export function ganttSeries(tasks: Task[], dayKeys: string[], limitPerDay = 5): GanttRow[] {
  const buckets = new Map<string, Task[]>()
  for (const key of dayKeys) buckets.set(key, [])

  for (const task of tasks) {
    if (task.completedAt === undefined) continue
    const key = dayKey(task.completedAt)
    const bucket = buckets.get(key)
    if (bucket === undefined) continue
    bucket.push(task)
  }

  return dayKeys.map(key => {
    const list = (buckets.get(key) ?? [])
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
      .slice(-limitPerDay)
    const [, month, day] = key.split('-')
    return {
      dayKey: key,
      label: `${Number(month)}/${Number(day)}`,
      items: list.map(task => ({
        id: task.id,
        title: task.title,
        at: task.completedAt ?? 0,
        minutes: taskFocusMinutes(task),
      })),
    }
  })
}
