/**
 * Stats — Card E「学习数据看板」（V3）。
 *
 * 五张图 + 五个折叠面板，全部原生 SVG / HTML，没有引入任何图表库：
 *
 *   1. 近 7 日专注柱状图      ← logs(kind='focus')
 *   2. 当日类型占比环形图     ← logs（六类；自动记录用间隔估算时长）
 *   3. 项目投入排行           ← 专注分钟 / 会话数 / 完成任务数
 *   4. 本周完成率 + 逾期率    ← tasks（dueAt / completedAt）
 *   5. 每日完成时序（甘特）    ← tasks.completedAt
 *
 * 折叠面板：月度目标 / 会话上下文观测 / 开发阻碍记录 / 数据备份 / 调试自测。
 *
 * 所有聚合都来自 lib/stats.ts 与 lib/projects.ts，和概览卡同一套函数，所以两处
 * 数字不会打架；`tasks` / `logs` 已经是当前项目作用域内的数据（`useBoardData`）。
 */
import { useMemo } from 'react'
import { BarChart } from '../charts/BarChart'
import { GanttChart } from '../charts/GanttChart'
import { PieChart } from '../charts/PieChart'
import { ProjectBars } from '../charts/ProjectBars'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { useContextStats } from '../hooks/useContextStats'
import { SESSION_TYPE_LABELS } from '../lib/config'
import { projectRanking } from '../lib/projects'
import {
  dailyFocusSeries,
  focusMinutesOn,
  ganttSeries,
  overdueStats,
  typeBreakdown,
  weekCompletion,
} from '../lib/stats'
import { formatMinutes, recentDayKeys, weekdayOfDayKey } from '../lib/time'
import type { SessionType } from '../types'
import { ContextInsight } from './ContextInsight'
import { DataPanel } from './DataPanel'
import { DebugPanel } from './DebugPanel'
import { FrictionLog } from './FrictionLog'
import { MonthlyGoalPanel } from './MonthlyGoal'
import { dayKey } from '../lib/time'

/** 每种会话类型一个颜色，全部取主题 token，换肤时自动跟随。 */
const TYPE_COLORS: Record<SessionType, string> = {
  dev: 'var(--osb-accent)',
  debug: 'var(--osb-danger)',
  refactor: 'var(--osb-warn)',
  design: 'var(--osb-ok)',
  reading: 'var(--osb-text-2)',
  other: 'var(--osb-text-3)',
}

export interface StatsProps {
  sessionId?: string
}

export function Stats({ sessionId }: StatsProps) {
  const board = useBoardData()
  const now = useNow()

  const days = useMemo(() => recentDayKeys(7, now), [now])

  const points = useMemo(() => {
    const series = dailyFocusSeries(board.logs, days)
    return series.map(point => {
      const [, month, day] = point.key.split('-')
      return {
        key: point.key,
        label: `${Number(month)}/${Number(day)}`,
        value: point.minutes,
      }
    })
  }, [board.logs, days])

  const today = dayKey(now)
  const todaySlices = useMemo(
    () =>
      typeBreakdown(board.logs, today)
        .filter(slice => slice.minutes > 0)
        .map(slice => ({
          key: slice.type,
          label: SESSION_TYPE_LABELS[slice.type],
          value: slice.minutes,
          color: TYPE_COLORS[slice.type],
        })),
    [board.logs, today],
  )

  const todayFocus = useMemo(() => focusMinutesOn(board.logs, today), [board.logs, today])
  const week = useMemo(() => weekCompletion(board.tasks, now), [board.tasks, now])
  const overdue = useMemo(() => overdueStats(board.tasks, now), [board.tasks, now])
  const gantt = useMemo(() => ganttSeries(board.tasks, days), [board.tasks, days])

  /** 项目排行：专注分钟 / 会话数 / 完成任务数。 */
  const ranking = useMemo(
    () => projectRanking(board.allLogs, board.allTasks, board.projects, board.activeProjectId),
    [board.allLogs, board.allTasks, board.projects, board.activeProjectId],
  )
  const rankingRows = useMemo(
    () =>
      ranking
        .filter(row => row.minutes > 0 || row.sessions > 0 || row.tasksDone > 0)
        .map(row => ({
          project: row.archived ? `${row.name}（已归档）` : row.name,
          minutes: row.minutes,
          count: row.sessions,
        })),
    [ranking],
  )

  const context = useContextStats(board.logs, sessionId, now)

  const weekTotal = points.reduce((sum, point) => sum + point.value, 0)

  return (
    <section className="osb-card osb-span-12 osb-stats" data-osb-section="stats">
      <header className="osb-card-head">
        <div className="osb-card-head-main">
          <h2 className="osb-card-title">学习数据看板</h2>
          <span className="osb-card-title-en">Statistics</span>
        </div>
        <span className="osb-badge">V3</span>
      </header>

      <div className="osb-card-body">
        <div className="osb-stats-grid">
          {/* 1 · 近 7 日专注 */}
          <figure className="osb-stat-block osb-stat-wide">
            <figcaption className="osb-stat-title">
              近 7 日专注
              <span className="osb-stat-meta">{weekTotal > 0 ? `合计 ${formatMinutes(weekTotal)}` : ""}</span>
            </figcaption>
            <BarChart points={points} unit="m" ariaLabel="近 7 日每日专注时长" />
            <p className="osb-stat-hint">{days.map(key => weekdayOfDayKey(key)).join(' · ')}</p>
          </figure>

          {/* 2 · 当日构成 */}
          <figure className="osb-stat-block">
            <figcaption className="osb-stat-title">
              当日会话构成
              <span className="osb-stat-meta">专注 {formatMinutes(todayFocus)}</span>
            </figcaption>
            <PieChart
              slices={todaySlices}
              centerValue={formatMinutes(todayFocus === 0 ? todaySlices.reduce((s, i) => s + i.value, 0) : todayFocus)}
              centerLabel="今日"
              emptyHint="今日还没有记录"
            />
          </figure>

          {/* 3 · 项目投入排行 */}
          <figure className="osb-stat-block">
            <figcaption className="osb-stat-title">
              项目投入排行
              <span className="osb-stat-meta">
                {rankingRows.length} 个有投入
                {board.activeProjectId === '' ? '' : ` · ${board.activeProject?.name ?? ''}`}
              </span>
            </figcaption>
            <ProjectBars rows={rankingRows} emptyHint="还没有项目投入记录" />
            {ranking.length === 0 ? null : (
              <p className="osb-stat-hint">
                {ranking
                  .slice(0, 3)
                  .map(row => `${row.name}：${row.sessions} 次会话 / 完成 ${row.tasksDone}`)
                  .join(' · ')}
              </p>
            )}
          </figure>

          {/* 4 · 本周完成率 + 逾期 */}
          <figure className="osb-stat-block">
            <figcaption className="osb-stat-title">
              本周任务完成率
              <span className="osb-stat-meta">{Math.round(week.rate * 100)}%</span>
            </figcaption>
            <div className="osb-week">
              <div className="osb-week-track">
                <span className="osb-week-fill" style={{ width: `${Math.round(week.rate * 100)}%` }} />
              </div>
              <dl className="osb-week-figures">
                <div>
                  <dt>本周新增</dt>
                  <dd>{week.created}</dd>
                </div>
                <div>
                  <dt>本周完成</dt>
                  <dd>{week.done}</dd>
                </div>
                <div>
                  <dt>待推进</dt>
                  <dd>{board.tasks.filter(task => !task.done).length}</dd>
                </div>
              </dl>
              <p className="osb-stat-hint" data-overdue={overdue.overdue > 0 ? 'true' : 'false'}>
                {overdue.scheduled === 0
                  ? '没有设截止日期的任务'
                  : `逾期 ${overdue.overdue} / 设了截止的 ${overdue.scheduled} 个（${Math.round(overdue.rate * 100)}%）`}
                {overdue.items.length === 0
                  ? ''
                  : ` · 最近：${overdue.items[0]?.title.slice(0, 18) ?? ''}`}
              </p>
            </div>
          </figure>

          {/* 5 · 每日完成时序 */}
          <figure className="osb-stat-block osb-stat-wide">
            <figcaption className="osb-stat-title">
              每日完成时序
              <span className="osb-stat-meta">
                近 7 天完成 {gantt.reduce((sum, row) => sum + row.items.length, 0)} 件
              </span>
            </figcaption>
            <GanttChart rows={gantt} ariaLabel="近 7 天每日任务完成时序" />
            <p className="osb-stat-hint">
              横轴为当天时刻（0–24），块宽按该任务累计专注时长缩放；悬停可看任务名。
            </p>
          </figure>
        </div>

        <div className="osb-collapse-group">
          <ContextInsight
            stats={context.stats}
            sessionLabel={context.sessionLabel}
            plan={context.plan}
            {...(context.lastPrunedAt === undefined ? {} : { lastPrunedAt: context.lastPrunedAt })}
            onAdoptPlan={() => {
              context.markPruned()
              board.setLogs(previous => [
                {
                  id: `log-prune-${Date.now().toString(36)}`,
                  at: Date.now(),
                  kind: 'milestone',
                  sessionType: 'other',
                  title: `精简会话建议：保留 ${context.plan.keep} 条 / 折叠 ${context.plan.fold} 条`,
                  detail: context.plan.logDetail,
                  source: 'manual',
                  edited: false,
                  ...(sessionId === undefined ? {} : { sessionId }),
                  ...(board.activeProjectId === '' ? {} : { projectId: board.activeProjectId }),
                },
                ...previous,
              ])
            }}
          />
          <FrictionLog />
          <MonthlyGoalPanel />
          <DataPanel />
          {/* 开发自测入口：默认收起，普通使用者看不到内容 */}
          <DebugPanel sessionId={sessionId} />
        </div>
      </div>
    </section>
  )
}
