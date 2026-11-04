/**
 * heatmap.ts — GitHub 风格年度学习热力图的数据层（V4 §五）。
 *
 * ── 数据来源的唯一性 ──────────────────────────────────────────────────────
 * 只读 `daily` 聚合表，而 `daily.focusMinutes` 只由**真实的 focus 日志**写入。
 * 因此「某天没学」就是 0 档，绝不会因为「那天完成了任务」而被涂上颜色 ——
 * 需求里明确禁止拿任务完成数虚构专注时间。
 *
 * ── 布局口径 ──────────────────────────────────────────────────────────────
 * 一周从周一开始（与中文习惯、与 V3 的 startOfWeek 一致）。为了显示完整年份，
 * 首尾会多带几天相邻年份的格子，这些格子 `inYear = false`，渲染时置灰且不计入
 * 年度汇总。
 */
import type { DailyAggregate, HeatmapDay, HeatmapLevel, HeatmapSummary, HeatmapWeek } from '../types'
import { BOARD_CONFIG } from './config'
import { dayKey, startOfDay, startOfWeek } from './time'

/** 0–4 五档；0 表示完全没有专注记录。 */
export function levelOf(minutes: number): HeatmapLevel {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  const [t1, t2, t3, t4] = BOARD_CONFIG.daily.thresholds
  if (minutes >= (t4 ?? 120)) return 4
  if (minutes >= (t3 ?? 60)) return 3
  if (minutes >= (t2 ?? 25)) return 2
  if (minutes >= (t1 ?? 1)) return 1
  return 0
}

/** 某年的 1 月 1 日 0 点。 */
function yearStart(year: number): number {
  return new Date(year, 0, 1, 0, 0, 0, 0).getTime()
}

/** 某年的 12 月 31 日 23:59:59.999。 */
function yearEnd(year: number): number {
  return new Date(year, 11, 31, 23, 59, 59, 999).getTime()
}

/**
 * 生成一年的热力图。
 *
 * @param daily - 日聚合（可以包含其它年份，会自动忽略）
 * @param year - 目标年份
 */
export function buildHeatmap(daily: DailyAggregate[], year: number, now = Date.now()): HeatmapSummary {
  void now
  const byDay = new Map<string, DailyAggregate>()
  for (const item of daily) byDay.set(item.day, item)

  const first = startOfWeek(yearStart(year))
  const lastDay = yearEnd(year)
  // 收尾补齐到周日，保证最后一列是完整的一周。
  const last = startOfWeek(lastDay) + 6 * 86_400_000

  const weeks: HeatmapWeek[] = []
  let totalMinutes = 0
  let tasksDone = 0
  let activeDays = 0
  let longestStreak = 0
  let currentStreak = 0

  let cursor = first
  while (cursor <= last) {
    const weekStart = cursor
    const days: HeatmapDay[] = []
    for (let i = 0; i < 7; i += 1) {
      const at = weekStart + i * 86_400_000
      const key = dayKey(at)
      const inYear = new Date(at).getFullYear() === year
      const aggregate = byDay.get(key)
      const minutes = aggregate?.focusMinutes ?? 0
      days.push({
        day: key,
        level: levelOf(minutes),
        minutes,
        tasksDone: aggregate?.tasksDone ?? 0,
        inYear,
      })
      if (inYear) {
        totalMinutes += minutes
        tasksDone += aggregate?.tasksDone ?? 0
        if (minutes > 0) {
          activeDays += 1
          currentStreak += 1
          longestStreak = Math.max(longestStreak, currentStreak)
        } else {
          currentStreak = 0
        }
      }
    }
    weeks.push({ weekStart: dayKey(weekStart), days })
    cursor = weekStart + 7 * 86_400_000
  }

  return { year, totalMinutes, activeDays, tasksDone, longestStreak, weeks }
}

/** 取某一天的详情（点击格子后展示）。 */
export function dayDetail(daily: DailyAggregate[], day: string): DailyAggregate {
  return daily.find(item => item.day === day) ?? { day, focusMinutes: 0, tasksDone: 0, sessions: 0, friction: 0 }
}

/** 有数据的年份（用于年份切换器）。 */
export function availableYears(daily: DailyAggregate[], now = Date.now()): number[] {
  const set = new Set<number>()
  set.add(new Date(now).getFullYear())
  for (const item of daily) {
    const year = Number(item.day.slice(0, 4))
    if (Number.isFinite(year)) set.add(year)
  }
  return [...set].sort((a, b) => b - a)
}

/** 把某天当作锚点，返回它在哪一周（用于点击格子后滚动定位）。 */
export function weekIndexOf(summary: HeatmapSummary, day: string): number {
  const index = summary.weeks.findIndex(week => week.days.some(item => item.day === day))
  return index < 0 ? -1 : index
}

/** 今天是不是这个格子的日子（渲染时高亮边框）。 */
export function isToday(day: string, now = Date.now()): boolean {
  return dayKey(startOfDay(now)) === day
}
