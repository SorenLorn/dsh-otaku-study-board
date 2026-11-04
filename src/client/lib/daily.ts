/**
 * daily.ts — 日聚合（V4 热力图与周报的唯一数据源）。
 *
 * ── 为什么必须单独存一份 ──────────────────────────────────────────────────
 * V3 的日志上限是 400 条（防 localStorage 爆掉），一年的专注记录很容易超。
 * 如果热力图直接读日志，超过上限的历史会「凭空消失」；如果拿任务完成数去凑
 * 专注时间，那就是**编数据**。所以这里维护一张按天聚合的表：
 *
 *   • 只记真实发生过的计数（focus 分钟、完成数、会话数、阻碍数）；
 *   • 没有 focus 记录的那天，focusMinutes 就是 0，绝不推算；
 *   • 写入走「增量 +1」，另外提供 `rebuildDaily` 从原始数据重算（修复用）。
 *
 * 增量与重建必须得到一致结果 —— 这一点在 smoke 断言里是硬要求。
 */
import type { DailyAggregate, FrictionRecord, SessionLog, Task } from '../types'
import { BOARD_CONFIG } from './config'
import { dayKey } from './time'

/** 一条空记录。 */
export function emptyDaily(day: string): DailyAggregate {
  return { day, focusMinutes: 0, tasksDone: 0, sessions: 0, friction: 0 }
}

/** 增量字段：只允许这四个，避免把 day 改坏。 */
export type DailyDelta = Partial<Pick<DailyAggregate, 'focusMinutes' | 'tasksDone' | 'sessions' | 'friction'>>

/**
 * 累加一天的计数。
 *
 * @param list - 现有聚合（按 day 升序）
 * @param day - `YYYY-MM-DD`
 * @param delta - 增量（负数会被夹到 0，防止脏数据把计数减成负的）
 * @returns 新数组，长度受 `config.daily.maxDays` 约束
 */
export function applyDailyDelta(
  list: DailyAggregate[],
  day: string,
  delta: DailyDelta,
  now = Date.now(),
): DailyAggregate[] {
  const index = list.findIndex(item => item.day === day)
  const base = index >= 0 ? list[index]! : emptyDaily(day)
  const next: DailyAggregate = {
    day,
    focusMinutes: clampAdd(base.focusMinutes, delta.focusMinutes, 24 * 60),
    tasksDone: clampAdd(base.tasksDone, delta.tasksDone, 1000),
    sessions: clampAdd(base.sessions, delta.sessions, 5000),
    friction: clampAdd(base.friction, delta.friction, 1000),
  }

  const copy = index >= 0 ? list.map((item, i) => (i === index ? next : item)) : [...list, next]
  copy.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  // 超出上限时丢最旧的（保留最近 N 天，热力图看两年足够）。
  const limit = BOARD_CONFIG.daily.maxDays
  void now
  return copy.length > limit ? copy.slice(copy.length - limit) : copy
}

function clampAdd(base: number, delta: number | undefined, max: number): number {
  if (delta === undefined || !Number.isFinite(delta)) return Math.max(0, Math.round(base))
  return Math.min(max, Math.max(0, Math.round(base + delta)))
}

/**
 * 直接把某天某个字段设成绝对值（幂等）。
 *
 * 为什么需要它：`tasksDone` 如果按「完成事件 +1」，同一个任务「完成 → 重开 →
 * 再完成」就会被算两次，而 `rebuildDaily` 是按当前状态数一次。两者必然不一致。
 * 所以任务完成数必须用**当日完成任务的绝对数量**写入（第二轮审计 NEW-07）。
 */
export function setDailyValue(
  list: DailyAggregate[],
  day: string,
  field: 'focusMinutes' | 'tasksDone' | 'sessions' | 'friction',
  value: number,
  now = Date.now(),
): DailyAggregate[] {
  const clamped = Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
  const limit = field === 'focusMinutes' ? 24 * 60 : field === 'tasksDone' ? 1000 : field === 'sessions' ? 5000 : 1000
  const finalValue = Math.min(limit, clamped)

  const index = list.findIndex(item => item.day === day)
  const base = index >= 0 ? list[index]! : emptyDaily(day)
  const next: DailyAggregate = { ...base, [field]: finalValue }
  const copy = index >= 0 ? list.map((item, i) => (i === index ? next : item)) : [...list, next]
  copy.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  const maxDays = BOARD_CONFIG.daily.maxDays
  void now
  return copy.length > maxDays ? copy.slice(copy.length - maxDays) : copy
}

/** 按「当天完成的任务数」重算 tasksDone（幂等，用于替换事件 +1）。 */
export function syncDailyTasks(
  list: DailyAggregate[],
  tasks: Task[],
  day: string,
  now = Date.now(),
): DailyAggregate[] {
  let count = 0
  for (const task of tasks) {
    if (task.completedAt === undefined) continue
    if (dayKey(task.completedAt) === day) count += 1
  }
  return setDailyValue(list, day, 'tasksDone', count, now)
}

/** 取某天的聚合；没有就返回一条零值（**不写入**）。 */
export function getDaily(list: DailyAggregate[], day: string): DailyAggregate {
  return list.find(item => item.day === day) ?? emptyDaily(day)
}

/** 取区间内的聚合（闭区间，按 day 字符串比较即可，因为格式定长）。 */
export function dailyRange(list: DailyAggregate[], from: string, to: string): DailyAggregate[] {
  return list.filter(item => item.day >= from && item.day <= to)
}

/**
 * 从原始数据重建整张表（修复用）。
 *
 * 口径与增量写入保持一致：
 *   • focusMinutes 只来自 `kind === 'focus'` 的日志；
 *   • sessions 数「非 focus」日志；
 *   • tasksDone 用 `completedAt`；
 *   • friction 用阻碍记录的首次出现时间。
 */
export function rebuildDaily(input: {
  logs: SessionLog[]
  tasks: Task[]
  friction: FrictionRecord[]
}): DailyAggregate[] {
  const map = new Map<string, DailyAggregate>()

  const ensure = (day: string): DailyAggregate => {
    const existing = map.get(day)
    if (existing !== undefined) return existing
    const created = emptyDaily(day)
    map.set(day, created)
    return created
  }

  for (const log of input.logs) {
    const day = dayKey(log.at)
    const entry = ensure(day)
    if (log.kind === 'focus') {
      entry.focusMinutes = Math.min(24 * 60, entry.focusMinutes + Math.max(0, Math.round(log.minutes ?? 0)))
    } else {
      entry.sessions += 1
    }
  }

  for (const task of input.tasks) {
    if (task.completedAt === undefined) continue
    ensure(dayKey(task.completedAt)).tasksDone += 1
  }

  for (const record of input.friction) {
    ensure(dayKey(record.at)).friction += 1
  }

  const list = [...map.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  const limit = BOARD_CONFIG.daily.maxDays
  return list.length > limit ? list.slice(list.length - limit) : list
}

/**
 * 重算某一天（幂等）。
 *
 * `applyDailyDelta` 是**增量**接口：同一个事件被投递两次就会算两次。凡是可能重试
 * 或重复触发的路径（StrictMode 双调用、写入失败后重试、导入后修复），都应该改用
 * 这个函数 —— 它从原始数据重算那一天，跑 100 次结果都一样。
 */
export function rebuildDay(
  input: { logs: SessionLog[]; tasks: Task[]; friction: FrictionRecord[] },
  day: string,
): DailyAggregate {
  const one = rebuildDaily(input).find(item => item.day === day)
  return one ?? emptyDaily(day)
}

/** 汇总一段时间：总分钟 / 活跃天数 / 完成任务数。 */
export function summarizeDaily(list: DailyAggregate[]): {
  minutes: number
  activeDays: number
  tasksDone: number
  sessions: number
} {
  let minutes = 0
  let activeDays = 0
  let tasksDone = 0
  let sessions = 0
  for (const item of list) {
    minutes += item.focusMinutes
    tasksDone += item.tasksDone
    sessions += item.sessions
    if (item.focusMinutes > 0) activeDays += 1
  }
  return { minutes, activeDays, tasksDone, sessions }
}
