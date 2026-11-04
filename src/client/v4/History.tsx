/**
 * v4/History.tsx — 历史活动页（Phase 5.4）。
 *
 * 三块内容：
 *   1. 统计带：活跃天数 / 最长连续 / 当前连续 / 总专注（全部按所选窗口计算）；
 *   2. 年度热力图：30 / 90 / 365 天，周一对齐，五档活动强度；
 *   3. 历史活动列表：真实 TimelineEvent，按天分组、分页加载。
 *
 * 数据全部来自 `lib/activity.ts` 的纯函数（DailyAggregate + Task + SessionLog）；
 * 组件不做统计、不写存储、不新造演示数据。
 *
 * 交互：tooltip 支持鼠标与键盘；格子的 Tab 焦点是「漫游」的（只有当前格可 Tab），
 * 方向键移动、Enter 打开当天详情；点击直接复用统一 Drawer 的 `day` 详情。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DailyAggregate, TimelineEvent } from '../types'
import { STORAGE_KEYS } from '../types'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { useLocalStore } from '../hooks/useLocalStore'
import {
  buildActivityCalendar,
  buildActivityWindow,
  groupTimelineByDay,
  type ActivityDay,
  type ActivityRange,
} from '../lib/activity'
import { dayKey, formatDateInput, formatMinutes, formatTime, weekdayOfDayKey } from '../lib/time'
import { EVENT_META } from '../lib/timeline'
import { Card, StateView } from './ui'
import { ActivityHeatmap } from './Heatmap'
import { useWorkspace } from './workspace'

const RANGES: ActivityRange[] = [30, 90, 365]
/** 历史列表每页的天数（按天分组，不一次渲染 1200 条事件）。 */
const PAGE_DAYS = 8

export function History() {
  const board = useBoardData()
  const workspace = useWorkspace()
  const now = useNow(60_000)
  const today = dayKey(now)
  const [range, setRange] = useState<ActivityRange>(365)
  const [daily] = useLocalStore<DailyAggregate[]>(STORAGE_KEYS.daily, [])
  const [timeline] = useLocalStore<TimelineEvent[]>(STORAGE_KEYS.timeline, [])

  const activity = useMemo(
    () =>
      buildActivityWindow(
        { daily, tasks: board.allTasks, logs: board.allLogs },
        { range, now },
      ),
    // `today` 让跨零点后自动重算；不直接依赖 now（每 30 秒会变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, board.allTasks, board.allLogs, range, today],
  )
  const calendar = useMemo(() => buildActivityCalendar(activity.days), [activity.days])
  const summary = activity.summary
  const dayMap = useMemo(() => new Map(activity.days.map(day => [day.day, day])), [activity.days])

  const groups = useMemo(() => groupTimelineByDay(timeline), [timeline])
  const [page, setPage] = useState(1)
  const visibleGroups = groups.slice(0, page * PAGE_DAYS)
  const remaining = Math.max(0, groups.length - visibleGroups.length)

  const openDay = useCallback(
    (day: string) => {
      const cell = dayMap.get(day)
      const title = cell === undefined ? day : `${formatDateInput(new Date(`${day}T00:00:00`).getTime())} · ${weekdayOfDayKey(day)}`
      workspace.openDetail({ kind: 'day', id: day, title })
    },
    [dayMap, workspace],
  )

  // 换范围 / 换天后重置分页，避免「加载更多」停在旧的页数上。
  useEffect(() => {
    setPage(1)
  }, [range])

  return (
    <div className="v4-history">
      <div className="v4-history-head">
        <div className="v4-history-title">
          <h2 className="v4-task-page-title">历史</h2>
          <p className="v4-task-counts">
            近 {range} 天 · {summary.activeDays} 天有活动
          </p>
        </div>
        <div className="v4-task-segments" role="group" aria-label="统计范围">
          {RANGES.map(value => (
            <button
              key={value}
              type="button"
              className={range === value ? 'v4-segment is-active' : 'v4-segment'}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {value} 天
            </button>
          ))}
        </div>
      </div>

      {board.activeProjectId === '' ? null : (
        <p className="v4-history-scope" role="note">
          历史统计包含全部项目：日聚合没有项目维度，不会按顶部项目筛选伪造一份「项目热力图」。
        </p>
      )}

      <div className="v4-history-stats">
        <Stat label="活跃天数" value={`${summary.activeDays}`} unit={`/ ${range}`} hint="完成过任务或专注过" />
        <Stat label="最长连续" value={`${summary.longestStreak}`} unit="天" hint="所选范围内最长一段" />
        <Stat
          label="当前连续"
          value={`${summary.currentStreak}`}
          unit="天"
          hint={summary.todayActive ? '含今天' : '今天还没有活动，从昨天起算'}
        />
        <Stat label="总专注" value={formatMinutes(summary.focusMinutes)} hint={`完成 ${summary.tasksDone} 个任务`} />
      </div>

      <Card title="学习活动" meta={`${summary.activityCount} 项记录 · 近 ${range} 天`}>
        <ActivityHeatmap calendar={calendar} today={today} range={range} onOpenDay={openDay} />
      </Card>

      <Card title="历史活动" meta={`${groups.length} 天有记录`}>
        {groups.length === 0 ? (
          <StateView
            kind="empty"
            title="还没有历史记录"
            hint="完成任务、专注结束、解决阻碍都会出现在这里。"
          />
        ) : (
          <>
            <ul className="v4-history-list">
              {visibleGroups.map(group => (
                <DayGroup
                  key={group.day}
                  day={group.day}
                  events={group.events}
                  summary={dayMap.get(group.day)}
                  onOpenDay={openDay}
                />
              ))}
            </ul>
            <div className="v4-history-more">
              {remaining > 0 ? (
                <button type="button" className="v4-link" onClick={() => setPage(value => value + 1)}>
                  加载更早的 {Math.min(remaining, PAGE_DAYS)} 天 →
                </button>
              ) : (
                <span className="v4-data-faint">已经到底了 · 共 {groups.length} 天</span>
              )}
            </div>
          </>
        )}
        <p className="v4-panel-hint">
          只展示本阶段已存在的真实时间轴事件；会话日志逐条明细尚未迁移，只计入统计。
        </p>
      </Card>
    </div>
  )
}

function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint: string }) {
  return (
    <div className="v4-history-stat">
      <p className="v4-stat-label">{label}</p>
      <p className="v4-history-value">
        {value}
        {unit === undefined ? null : <span className="v4-history-unit">{unit}</span>}
      </p>
      <p className="v4-history-hint">{hint}</p>
    </div>
  )
}

/* ── 历史列表 ───────────────────────────────────────────────────────────── */

function DayGroup({
  day,
  events,
  summary,
  onOpenDay,
}: {
  day: string
  events: TimelineEvent[]
  summary: ActivityDay | undefined
  onOpenDay: (day: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? events : events.slice(0, 3)
  const hidden = events.length - visible.length

  return (
    <li className="v4-history-group">
      <button type="button" className="v4-history-day" onClick={() => onOpenDay(day)}>
        <span className="v4-history-date">{formatDateInput(new Date(`${day}T00:00:00`).getTime())}</span>
        <span className="v4-history-weekday">{weekdayOfDayKey(day)}</span>
        <span className="v4-history-count">{events.length} 条</span>
        {summary === undefined ? null : (
          <span className="v4-history-focus">
            {summary.focusMinutes > 0 ? `专注 ${summary.focusMinutes}m` : '无专注'}
            {summary.tasksDone > 0 ? ` · 完成 ${summary.tasksDone}` : ''}
          </span>
        )}
        <span className="v4-history-open">当天详情 →</span>
      </button>

      <ul className="v4-history-events">
        {visible.map(event => (
          <li key={event.id}>
            <span className="v4-history-time">{formatTime(event.at)}</span>
            <span className="v4-history-kind">{EVENT_META[event.type].label}</span>
            <span className="v4-history-title">{event.title}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button type="button" className="v4-history-expand" onClick={() => setExpanded(true)}>
          展开其余 {hidden} 条
        </button>
      ) : null}
      {expanded && events.length > 3 ? (
        <button type="button" className="v4-history-expand" onClick={() => setExpanded(false)}>
          收起
        </button>
      ) : null}
    </li>
  )
}
