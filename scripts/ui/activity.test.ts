/**
 * activity.test.ts — Phase 5.4 统计纯函数测试（无 DOM）。
 *
 * 固定「今天」为 2026-11-04 12:00（本地时区），所有日期都用相对偏移构造，
 * 不依赖测试机器的当前时间，也不依赖 UTC。
 */
import {
  buildActivityCalendar,
  buildActivityWindow,
  dayDistance,
  groupTimelineByDay,
  shiftDayKey,
  type ActivityRange,
} from '../../src/client/lib/activity'
import type { DailyAggregate, SessionLog, Task, TimelineEvent } from '../../src/client/types'
import { dayKey } from '../../src/client/lib/time'

const NOW = new Date(2026, 10, 4, 12, 0, 0, 0).getTime()
const TODAY = dayKey(NOW)

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}

/** 相对今天的第 offset 天（0 = 今天）的 12:00。 */
function at(offset: number, hour = 12): number {
  const date = new Date(NOW)
  date.setHours(hour, 0, 0, 0)
  date.setDate(date.getDate() - offset)
  return date.getTime()
}
function key(offset: number): string {
  return dayKey(at(offset))
}
function daily(offset: number, minutes: number, tasksDone = 0): DailyAggregate {
  return { day: key(offset), focusMinutes: minutes, tasksDone, sessions: 0, friction: 0 }
}
function focusLog(id: string, offset: number, minutes: number): SessionLog {
  return { id, at: at(offset, 20), kind: 'focus', title: `专注 ${minutes}`, minutes, source: 'manual', edited: false }
}
function otherLog(id: string, offset: number): SessionLog {
  return { id, at: at(offset, 21), kind: 'message', title: '消息', minutes: 0, source: 'auto', edited: false }
}
function doneTask(id: string, offset: number): Task {
  return {
    id,
    title: `任务 ${id}`,
    status: 'done',
    done: true,
    pomodoros: 1,
    createdAt: at(offset, 9),
    updatedAt: at(offset, 18),
    completedAt: at(offset, 18),
  }
}

function windowOf(range: ActivityRange, input: { daily?: DailyAggregate[]; tasks?: Task[]; logs?: SessionLog[] }) {
  return buildActivityWindow(
    { daily: input.daily ?? [], tasks: input.tasks ?? [], logs: input.logs ?? [] },
    { range, now: NOW },
  )
}

/* 1. 空数据 */
{
  const win = windowOf(365, {})
  check('A1 空数据：365 天窗口、0 活跃、0 连续', win.days.length === 365 && win.summary.activeDays === 0 && win.summary.longestStreak === 0 && win.summary.currentStreak === 0)
  check('A2 空数据：所有格子 level 0 且无分数', win.days.every(day => day.level === 0 && day.score === 0))
  check('A3 空数据：总专注 0 且今天无活动', win.summary.focusMinutes === 0 && win.summary.todayActive === false)
}

/* 2. 单个活跃日 */
{
  const win = windowOf(365, { daily: [daily(0, 25)] })
  check('A4 今天 25 分钟：活跃 1、最长 1、当前 1、含今天', win.summary.activeDays === 1 && win.summary.longestStreak === 1 && win.summary.currentStreak === 1 && win.summary.todayActive === true)
  check('A5 25 分钟落在第 2 档（阈值 25）', win.days[364]?.level === 2, win.days[364]?.level)
}
{
  const win = windowOf(30, { tasks: [doneTask('t1', 0)] })
  check('A6 只完成任务也算活跃（等效 25 分钟）', win.days[29]?.level === 2 && win.summary.activeDays === 1 && win.summary.focusMinutes === 0)
}

/* 3. 连续 7 / 30 / 365 天 */
for (const length of [7, 30, 365] as const) {
  const dailyList = Array.from({ length }, (_, index) => daily(index, 30))
  const win = windowOf(365, { daily: dailyList })
  check(`A7 连续 ${length} 天：最长与当前都为 ${length}`, win.summary.longestStreak === length && win.summary.currentStreak === length && win.summary.activeDays === length, win.summary)
}
{
  // 40 天连续，但窗口只有 30 天：统计必须被窗口截断。
  const dailyList = Array.from({ length: 40 }, (_, index) => daily(index, 30))
  const win = windowOf(30, { daily: dailyList })
  check('A8 窗口截断：40 天连续在 30 天视图里只算 30', win.summary.longestStreak === 30 && win.summary.currentStreak === 30)
}

/* 4. 断档 */
{
  const dailyList = [daily(6, 30), daily(5, 30), daily(4, 30), daily(1, 30), daily(0, 30)]
  const win = windowOf(30, { daily: dailyList })
  check('A9 中间断一天：最长 3、当前 2', win.summary.longestStreak === 3 && win.summary.currentStreak === 2, win.summary)
}

/* 5. 跨月 / 跨年 / 闰年 */
{
  // 2026-10-29 → 2026-11-04（跨月 7 天）
  const dailyList = Array.from({ length: 7 }, (_, index) => daily(index, 20))
  const win = windowOf(30, { daily: dailyList })
  check(
    'A10 跨月连续 7 天',
    win.summary.currentStreak === 7 &&
      win.days.some(day => day.day.startsWith('2026-10') && day.level > 0) &&
      win.days.some(day => day.day.startsWith('2026-11') && day.level > 0),
    win.days.filter(day => day.level > 0).map(day => day.day),
  )
}
{
  // 2025-12-29 → 2026-01-04（跨年 7 天）
  const dailyList = Array.from({ length: 7 }, (_, index) => daily(index + 308, 20))
  const win = windowOf(365, { daily: dailyList })
  check('A11 跨年连续 7 天不中断', win.summary.longestStreak === 7, win.summary)
}
{
  // 闰年：2028-02-27 → 2028-03-01（含 2/29），把「今天」移到 2028-03-01。
  const leapNow = new Date(2028, 2, 1, 12, 0, 0, 0).getTime()
  const leapKey = (offset: number): string => {
    const date = new Date(leapNow)
    date.setDate(date.getDate() - offset)
    return dayKey(date.getTime())
  }
  const dailyList = [0, 1, 2, 3].map(offset => ({ day: leapKey(offset), focusMinutes: 30, tasksDone: 0, sessions: 0, friction: 0 }))
  const win = buildActivityWindow({ daily: dailyList, tasks: [], logs: [] }, { range: 30, now: leapNow })
  check(
    'A12 闰年 2 月 29 日被正确覆盖',
    win.summary.longestStreak === 4 && win.days.some(day => day.day === '2028-02-29' && day.level > 0),
    win.days.filter(day => day.level > 0).map(day => day.day),
  )
}

/* 6. 今天 / 昨天 / 前天 */
{
  const win = windowOf(30, { daily: [daily(1, 25)] })
  check('A13 今天没活动、昨天有：当前连续 1、todayActive=false', win.summary.currentStreak === 1 && win.summary.todayActive === false)
}
{
  const win = windowOf(30, { daily: [daily(2, 25)] })
  check('A14 今天与昨天都没活动：当前连续 0', win.summary.currentStreak === 0)
}

/* 7. 日志与 daily 的交叉校验 */
{
  const win = windowOf(30, { daily: [daily(0, 25)], logs: [focusLog('l1', 0, 25), focusLog('l1', 0, 25)] })
  check('A15 同一 id 的重复日志只算一次', win.summary.focusMinutes === 25 && win.days[29]?.activityCount === 1, win.days[29])
}
{
  const win = windowOf(30, {
    daily: [daily(0, 50)],
    logs: [focusLog('l1', 0, 25), focusLog('l2', 0, 25)],
  })
  check(
    'A16 daily 与两条日志一致：不翻倍、activityCount=2',
    win.summary.focusMinutes === 50 && win.days[29]?.activityCount === 2 && win.days[29]?.reconciled === false,
    win.days[29],
  )
}
{
  const win = windowOf(30, { logs: [focusLog('l1', 0, 30)] })
  check('A17 daily 缺失：回退到日志并标记来源', win.summary.focusMinutes === 30 && win.days[29]?.focusSource === 'logs')
}
{
  const win = windowOf(30, { daily: [daily(0, 0)], logs: [focusLog('l1', 0, 30)] })
  check(
    'A18 daily 少记（0）而日志 30：取 30 并标记 reconciled',
    win.summary.focusMinutes === 30 && win.days[29]?.focusSource === 'reconciled' && win.days[29]?.reconciled === true,
    win.days[29],
  )
}
{
  const win = windowOf(30, { daily: [daily(0, 100)], logs: [focusLog('l1', 0, 30)] })
  check(
    'A19 daily 更多（旧日志被裁）：取 daily 且不误报',
    win.summary.focusMinutes === 100 && win.days[29]?.focusSource === 'daily' && win.days[29]?.reconciled === false,
  )
}
{
  const win = windowOf(30, { daily: [daily(0, 50)], logs: [otherLog('o1', 0), otherLog('o2', 0), focusLog('l1', 0, 50)] })
  check('A20 activityCount = 任务 + 专注 + 其他记录', win.days[29]?.activityCount === 3, win.days[29]?.activityCount)
}

/* 8. 删除后的重算 */
{
  // 任务被删除：daily 里的 1 是旧的，任务列表完整时应以实时 0 为准。
  const win = windowOf(30, { daily: [daily(0, 0, 1)], tasks: [] })
  check('A21 删除任务后完成数归零', win.days[29]?.tasksDone === 0 && win.days[29]?.level === 0, win.days[29])
}
{
  // 日志被删除：daily 已扣到 0，日志为空。
  const win = windowOf(30, { daily: [daily(0, 0)], logs: [] })
  check('A22 删除日志后专注归零', win.summary.focusMinutes === 0 && win.summary.activeDays === 0)
}

/* 9. 任务超过上限：只能用 daily 绝对值 */
{
  const tasks = Array.from({ length: 500 }, (_, index) => doneTask(`cap-${index}`, 400))
  const win = windowOf(30, { daily: [daily(0, 10, 3)], tasks })
  check(
    'A23 任务列表达上限时退回 daily 的 tasksDone',
    win.days[29]?.tasksDone === 3 && win.days[29]?.tasksSource === 'daily',
    win.days[29],
  )
}

/* 10. 等级阈值 */
{
  const cases: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [24, 1],
    [25, 2],
    [59, 2],
    [60, 3],
    [119, 3],
    [120, 4],
    [300, 4],
  ]
  const dailyList = cases.map(([minutes], index) => daily(index, minutes))
  const win = windowOf(30, { daily: dailyList })
  const levels = cases.map((_, index) => win.days[29 - index]?.level)
  check(
    'A24 五档阈值 [0,1,25,60,120] 正确',
    JSON.stringify(levels) === JSON.stringify(cases.map(([, level]) => level)),
    levels,
  )
}

/* 11. 窗口边界 */
for (const range of [30, 90, 365] as const) {
  const win = windowOf(range, {})
  check(
    `A25 ${range} 天窗口：长度、起止日期正确`,
    win.days.length === range && win.summary.endDay === TODAY && win.summary.startDay === key(range - 1),
    { start: win.summary.startDay, end: win.summary.endDay },
  )
}

/* 12. 日历布局 */
{
  const win = windowOf(365, {})
  const calendar = buildActivityCalendar(win.days)
  const firstCell = calendar.weeks[0]?.[0]
  const lastWeek = calendar.weeks[calendar.weeks.length - 1]
  check('A26 每列 7 天且总格数为 7 的倍数', calendar.weeks.every(week => week.length === 7))
  check(
    'A27 第一列从周一开始',
    firstCell !== undefined && new Date(`${firstCell.day}T00:00:00`).getDay() === 1,
    firstCell?.day,
  )
  check('A28 末列补齐到周日', lastWeek?.length === 7 && lastWeek[6]?.day !== undefined)
  check(
    'A29 月份标签递增且只在包含 1 号的周出现',
    calendar.monthLabels.length >= 12 && calendar.monthLabels.every((label, index) => index === 0 || label.weekIndex > calendar.monthLabels[index - 1]!.weekIndex),
    calendar.monthLabels,
  )
  const padding = calendar.weeks.flat().filter(cell => !cell.inRange)
  check('A30 补齐格不参与统计（inRange=false 且 level=0）', padding.every(cell => cell.level === 0 && cell.activityCount === 0))
}

/* 13. 日期工具 */
{
  check('A31 跨年 shiftDayKey 正确', shiftDayKey('2026-01-01', -1) === '2025-12-31' && shiftDayKey('2024-02-28', 1) === '2024-02-29')
  check('A32 dayDistance 跨月为 1', dayDistance('2026-10-31', '2026-11-01') === 1 && dayDistance('2026-12-31', '2027-01-01') === 1)
}

/* 14. 时间轴分组 */
{
  const events: TimelineEvent[] = [
    { id: 'e1', at: at(0, 9), type: 'task.completed', title: '任务 A' },
    { id: 'e2', at: at(0, 20), type: 'focus.completed', title: '专注' },
    { id: 'e3', at: at(1, 9), type: 'task.completed', title: '任务 B' },
  ]
  const groups = groupTimelineByDay(events)
  check(
    'A33 时间轴按天倒序分组，组内事件倒序',
    groups.length === 2 && groups[0]?.day === TODAY && groups[0]?.events[0]?.id === 'e2' && groups[1]?.day === key(1),
    groups.map(group => group.day),
  )
}

console.log(`\n活动统计：${passed} 通过 / ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
