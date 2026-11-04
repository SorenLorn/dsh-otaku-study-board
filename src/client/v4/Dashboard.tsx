/**
 * v4/Dashboard.tsx — 统一工作台首页。
 *
 * 八块内容，默认都只展示「一眼要看的数字」，细节按需展开：
 *
 *   统计带   4 个指标 → 点击打开对应统计抽屉（任务 / 完成 / 专注 / 连续）
 *   今日任务 行内展开任务摘要；勾选完成走 useBoardActions；「⋯」打开抽屉
 *   专注     真实的 FocusPanel：开始 / 暂停 / 休息 / 结束结算（Phase 5.5），卡片内展开设置
 *   项目进度 点击项目打开抽屉；卡片内展开全部项目
 *   学习活动 全年热力图（Phase 6.2）：与 History 同一个组件、同一份聚合，点击打开当天
 *   学习趋势 数据点可点（鼠标与键盘），打开那一天；展开看逐日数字
 *   最近活动 点击事件打开抽屉；展开看更长的列表
 *   知识与记忆 只读概览；展开看节点；编辑随 Knowledge 阶段迁移
 *
 * 所有写入仍然只走 `useBoardActions`（与任务页、旧工作台同一条链路），
 * Daily 与 Timeline 由 Actions 维护，页面自身不做任何存储写入。
 */
import { useCallback, useMemo, type ReactNode } from 'react'
import type { KnowledgeGraph, ProjectMemory, ReviewRecord } from '../types'
import { STORAGE_KEYS, type DailyAggregate, type TimelineEvent } from '../types'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { useLocalStore } from '../hooks/useLocalStore'
import { buildActivityCalendar, buildActivityWindow } from '../lib/activity'
import { computeBoardStats, countStreak, isOverdue, taskFocusMinutes } from '../lib/stats'
import { projectRanking } from '../lib/projects'
import { graphStats } from '../lib/knowledge'
import { reviewStats } from '../lib/review'
import { dayKey, formatDateInput, formatMinutes, formatRelative, recentDayKeys, weekdayOfDayKey } from '../lib/time'
import { EVENT_META } from '../lib/timeline'
import { Button, Card, ProgressBar, ProgressRing, Sparkline, StateView, StreakDots } from './ui'
import { ExpandablePanel } from './Expandable'
import { FocusPanel } from './FocusPanel'
import { ActivityHeatmap } from './Heatmap'
import { useWorkspace } from './workspace'

export interface DashboardProps {
  /** 切到任务页。 */
  onNavigate: (target: 'tasks') => void
  /** 新建任务。缺省时直接打开统一弹层（不依赖调用方）。 */
  onCreateTask?: () => void
}

const PRIORITY_LABEL = { normal: '普通', important: '重要', urgent: '紧急' } as const
const STATUS_LABEL = { todo: '待学', learning: '在学', learned: '已学', review: '复习' } as const

export function Dashboard({ onNavigate, onCreateTask }: DashboardProps) {
  const board = useBoardData()
  const actions = useBoardActions()
  const workspace = useWorkspace()
  /** 没有外部回调时也能新建：走同一个统一弹层，不依赖页面跳转。 */
  const createTask = onCreateTask ?? (() => workspace.openModal({ kind: 'create-task', title: '新建任务' }))
  const now = useNow()
  const [daily] = useLocalStore<DailyAggregate[]>(STORAGE_KEYS.daily, [])
  const [timeline] = useLocalStore<TimelineEvent[]>(STORAGE_KEYS.timeline, [])
  const [graph] = useLocalStore<KnowledgeGraph>(STORAGE_KEYS.knowledge, { nodes: [], edges: [] })
  const [memory] = useLocalStore<ProjectMemory[]>(STORAGE_KEYS.memory, [])
  const [reviews] = useLocalStore<ReviewRecord[]>(STORAGE_KEYS.reviews, [])

  const days = useMemo(() => recentDayKeys(7, now), [now])
  const stats = useMemo(() => computeBoardStats(board.tasks, board.logs, now), [board.tasks, board.logs, now])
  const streak = useMemo(() => countStreak(board.tasks, board.logs, now), [board.tasks, board.logs, now])
  const byDay = useMemo(() => new Map(daily.map(item => [item.day, item])), [daily])
  const series = useMemo(() => days.map(day => byDay.get(day)?.focusMinutes ?? 0), [days, byDay])
  const weekMinutes = series.reduce((sum, value) => sum + value, 0)
  const peakIndex = series.reduce((best, value, index) => (value > series[best]! ? index : best), 0)
  const peakMinutes = series[peakIndex] ?? 0

  const activityDays = useMemo(() => {
    const active = new Set<string>()
    for (const task of board.tasks) if (task.completedAt !== undefined) active.add(dayKey(task.completedAt))
    for (const log of board.logs) if (log.kind === 'focus' && (log.minutes ?? 0) > 0) active.add(dayKey(log.at))
    return days.map(day => active.has(day))
  }, [board.tasks, board.logs, days])

  /**
   * 全年活跃热力图（Phase 6.2）。
   *
   * 数据源与 History 页**完全相同**：`buildActivityWindow` 的 365 天窗口，
   * 输入是同一份 `daily` / `allTasks` / `allLogs`。同一天的颜色因此是同一份
   * 聚合算出来的，不是「首页另算一套」。
   */
  const today = dayKey(now)
  const activity = useMemo(
    () => buildActivityWindow({ daily, tasks: board.allTasks, logs: board.allLogs }, { range: 365, now }),
    // `today` 让跨零点后自动重算；不直接依赖 now（每 30 秒会变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, board.allTasks, board.allLogs, today],
  )
  const calendar = useMemo(() => buildActivityCalendar(activity.days), [activity.days])
  const openDay = useCallback(
    (day: string) => {
      workspace.openDetail({
        kind: 'day',
        id: day,
        title: `${formatDateInput(new Date(`${day}T00:00:00`).getTime())} · ${weekdayOfDayKey(day)}`,
      })
    },
    [workspace],
  )

  const projectTasks = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    for (const task of board.tasks) {
      const key = task.projectId ?? ''
      const row = map.get(key) ?? { total: 0, done: 0 }
      row.total += 1
      if (task.done) row.done += 1
      map.set(key, row)
    }
    return map
  }, [board.tasks])

  const allProjects = useMemo(
    () => projectRanking(board.allLogs, board.allTasks, board.projects, board.activeProjectId, { includeEmpty: true }),
    [board.allLogs, board.allTasks, board.projects, board.activeProjectId],
  )

  const events = useMemo(() => {
    const scoped = board.activeProjectId === '' ? timeline : timeline.filter(event => event.projectId === board.activeProjectId)
    return [...scoped].sort((left, right) => right.at - left.at)
  }, [timeline, board.activeProjectId])

  const openTasks = useMemo(
    () =>
      board.tasks
        .filter(task => !task.done)
        .sort((left, right) => (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)),
    [board.tasks],
  )
  const todayTasks = openTasks.slice(0, 6)
  const doneCount = board.tasks.filter(task => task.done).length
  const doneRate = board.tasks.length === 0 ? 0 : doneCount / board.tasks.length
  const knowledge = graphStats(graph)
  const review = reviewStats(reviews)
  const projectName = (id: string | undefined): string => board.projects.find(project => project.id === id)?.name ?? '未归属'

  return (
    <div className="v4-dashboard">
      <Card variant="feature" className="v4-stat-shelf" pad="none">
        <div className="v4-stat-row">
          <Stat
            label="今日任务"
            value={`${stats.tasksTotal}`}
            unit="个"
            hint={(stats.overdueTasks ?? 0) > 0 ? `${stats.overdueTasks} 个已逾期` : '全部在计划内'}
            onOpen={() => workspace.openDetail({ kind: 'stat', id: 'tasks', title: '今日任务' })}
          />
          <Stat
            label="今日完成"
            value={`${stats.tasksDoneToday}`}
            unit="个"
            hint={`累计完成 ${doneCount}`}
            ring={doneRate}
            onOpen={() => workspace.openDetail({ kind: 'stat', id: 'done', title: '完成情况' })}
          />
          <Stat
            label="今日专注"
            value={formatMinutes(stats.focusMinutesToday)}
            hint={weekMinutes > 0 ? `本周 ${formatMinutes(weekMinutes)}` : '还没有开始'}
            onOpen={() => workspace.openDetail({ kind: 'stat', id: 'focus', title: '专注统计' })}
          />
          <Stat
            label="连续学习"
            value={`${streak}`}
            unit="天"
            hint={streak >= 3 ? '节奏保持住了' : '今天写一点就接上'}
            title="按有任务完成或专注记录的日期计算。"
            visual={<StreakDots active={activityDays} labels={days.map(day => weekdayOfDayKey(day))} />}
            onOpen={() => workspace.openDetail({ kind: 'stat', id: 'streak', title: '连续学习' })}
          />
        </div>
      </Card>

      <div className="v4-dash">
        <Card title="今日任务" meta={`${openTasks.length} 个待完成`}>
          {board.tasks.length === 0 ? (
            <StateView
              kind="empty"
              title="还没有任务"
              hint="先写下一个 25 分钟内能推进的小任务。"
              action={
                <Button size="sm" variant="primary" onClick={createTask}>
                  新建任务
                </Button>
              }
            />
          ) : (
            <>
              <ProgressBar value={doneRate} showValue />
              {todayTasks.length === 0 ? (
                <p className="v4-dash-done">今天的任务全部完成，可以收工了。</p>
              ) : (
                <ul className="v4-today-list">
                  {todayTasks.map(task => {
                    const panelId = `dash-task-${task.id}`
                    const open = workspace.expandedId === panelId
                    return (
                      <li key={task.id} className="v4-today-row" data-open={open ? 'true' : 'false'}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={false}
                          aria-label={`完成 ${task.title}`}
                          className="v4-task-check"
                          onClick={() => actions.completeTask(task.id)}
                        />
                        <button
                          type="button"
                          className="v4-today-main"
                          aria-expanded={open}
                          aria-controls={`v4-panel-${panelId}`}
                          onClick={() => {
                            workspace.selectTask(task.id)
                            workspace.toggleExpanded(panelId)
                          }}
                        >
                          <span className={`v4-today-priority is-${task.priority ?? 'normal'}`}>
                            {PRIORITY_LABEL[task.priority ?? 'normal']}
                          </span>
                          <span className="v4-today-title">{task.title}</span>
                          {task.dueAt === undefined ? null : (
                            <span className={isOverdue(task, now) ? 'v4-today-due is-overdue' : 'v4-today-due'}>
                              {formatDateInput(task.dueAt)}
                            </span>
                          )}
                          <span className="v4-chevron" data-open={open ? 'true' : 'false'} aria-hidden="true">
                            ▾
                          </span>
                        </button>
                        <button
                          type="button"
                          className="v4-icon-btn"
                          aria-label={`打开 ${task.title} 的详情`}
                          title="详情"
                          onClick={() => {
                            workspace.selectTask(task.id)
                            workspace.openDetail({ kind: 'task', id: task.id, title: task.title })
                          }}
                        >
                          ⋯
                        </button>

                        {open ? (
                          <div className="v4-today-detail" id={`v4-panel-${panelId}`}>
                            <dl className="v4-inline-facts">
                              <div>
                                <dt>项目</dt>
                                <dd>{projectName(task.projectId)}</dd>
                              </div>
                              <div>
                                <dt>子任务</dt>
                                <dd>
                                  {(task.subtasks ?? []).length === 0
                                    ? '无'
                                    : `${(task.subtasks ?? []).filter(sub => sub.done).length}/${(task.subtasks ?? []).length}`}
                                </dd>
                              </div>
                              <div>
                                <dt>已专注</dt>
                                <dd>{formatMinutes(taskFocusMinutes(task))}</dd>
                              </div>
                            </dl>
                            {task.note === undefined || task.note === '' ? null : <p className="v4-inline-note">{task.note}</p>}
                            <div className="v4-inline-actions">
                              <Button size="sm" variant="primary" onClick={() => actions.completeTask(task.id)}>
                                标记完成
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => workspace.openModal({ kind: 'edit-task', taskId: task.id, title: '编辑任务' })}
                              >
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => workspace.openDetail({ kind: 'task', id: task.id, title: task.title })}
                              >
                                完整详情
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
              <button type="button" className="v4-link" onClick={() => onNavigate('tasks')}>
                查看全部 {board.tasks.length} 个任务 →
              </button>
            </>
          )}
        </Card>

        <div className="v4-side">
          <FocusPanel />

          <ExpandablePanel
            id="projects"
            title="项目进度"
            meta={`${allProjects.length} 个`}
            hint="展开全部项目"
            summary={
              allProjects.length === 0 ? (
                <StateView kind="empty" title="还没有项目投入" hint="创建项目后，专注与任务会自动归到项目下。" />
              ) : (
                <ul className="v4-project-list">
                  {allProjects.slice(0, 3).map(row => (
                    <li key={row.projectId || row.name}>
                      <button
                        type="button"
                        className="v4-project-button"
                        onClick={() => workspace.openDetail({ kind: 'project', id: row.projectId, title: row.name })}
                      >
                        <div className="v4-project-row">
                          <span className="v4-project-name">{row.name}</span>
                          <span className="v4-project-meta">
                            {formatMinutes(row.minutes)} · {row.tasksDone}/{projectTasks.get(row.projectId ?? '')?.total ?? 0}
                          </span>
                        </div>
                        <ProgressBar value={rankedRate(row.minutes, allProjects[0]?.minutes ?? 0)} />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            }
            detail={
              allProjects.length === 0 ? (
                <p className="v4-muted">没有可展开的项目。</p>
              ) : (
                <>
                  <ul className="v4-mini-table">
                    {allProjects.map(row => (
                      <li key={row.projectId || row.name}>
                        <button
                          type="button"
                          className="v4-mini-row"
                          onClick={() => workspace.openDetail({ kind: 'project', id: row.projectId, title: row.name })}
                        >
                          <span>{row.name}</span>
                          <span className="v4-mini-value">{formatMinutes(row.minutes)}</span>
                          <span className="v4-mini-meta">{row.tasksDone} 个完成</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="v4-panel-hint">新建 / 模板 / 归档 / 快照随 Projects 阶段迁移；统计已经是最新数据。</p>
                </>
              )
            }
          />
        </div>
      </div>

      {/*
        学习活动热力图（Phase 6.2）：GitHub Contributions 风格的整年视图，放在
        「核心信息（今日任务 / 专注 / 项目）」**下面**、次级卡片**上面** ——
        一眼能扫到，又不挤占操作区。用的就是 History 那个组件与那份聚合。
      */}
      <Card
        title="学习活动"
        meta={`近 365 天 · ${activity.summary.activeDays} 天有活动`}
        className="v4-dash-heat"
      >
        {activity.summary.activeDays === 0 ? (
          <p className="v4-heat-empty">还没有活跃记录 —— 完成一次专注或一个任务，当天就会亮起。</p>
        ) : null}
        {/*
          左边是日历本体（固定 12px 格里），右边用一列数字补上横向空白 ——
          1440px 下日历只占 740px，空着大半张卡反而显得没做完。
        */}
        <div className="v4-dash-heat-body">
          <div className="v4-dash-heat-chart">
            <ActivityHeatmap calendar={calendar} today={today} range={365} onOpenDay={openDay} legend="bottom" />
          </div>
          <div className="v4-dash-heat-side">
            <dl className="v4-dash-heat-stats">
              <div>
                <dt>最长连续</dt>
                <dd>
                  {activity.summary.longestStreak}
                  <span>天</span>
                </dd>
              </div>
              <div>
                <dt>累计专注</dt>
                <dd>{formatMinutes(activity.summary.focusMinutes)}</dd>
              </div>
              <div>
                <dt>完成任务</dt>
                <dd>
                  {activity.summary.tasksDone}
                  <span>个</span>
                </dd>
              </div>
            </dl>
            <p className="v4-dash-heat-note">悬停看某天，点击打开当天详情</p>
          </div>
        </div>
      </Card>

      <div className="v4-dash-lower">
        <ExpandablePanel
          id="trend"
          title="近 7 日专注"
          meta={weekMinutes > 0 ? `合计 ${formatMinutes(weekMinutes)}` : '全部项目'}
          hint="展开逐日数字"
          summary={
            weekMinutes === 0 ? (
              <StateView
                kind="empty"
                title="这 7 天还没有专注记录"
                hint="在上方「专注」卡里开始第一轮，完成后这里会出现趋势"
              />
            ) : (
              <>
                <Sparkline
                  values={series}
                  labels={days.map(day => weekdayOfDayKey(day))}
                  onSelect={index => {
                    const day = days[index]
                    if (day === undefined) return
                    workspace.openDetail({
                      kind: 'day',
                      id: day,
                      title: `${formatDateInput(new Date(`${day}T00:00:00`).getTime())} · ${weekdayOfDayKey(day)}`,
                    })
                  }}
                />
                <p className="v4-chart-foot">
                  {days.map(day => weekdayOfDayKey(day)).join(' · ')}
                  {peakMinutes > 0 ? ` ｜ 峰值 ${formatMinutes(peakMinutes)} · ${weekdayOfDayKey(days[peakIndex]!)}` : ''}
                </p>
              </>
            )
          }
          detail={
            <ul className="v4-mini-table">
              {days.map((day, index) => (
                <li key={day}>
                  <button
                    type="button"
                    className="v4-mini-row"
                    onClick={() =>
                      workspace.openDetail({
                        kind: 'day',
                        id: day,
                        title: `${formatDateInput(new Date(`${day}T00:00:00`).getTime())} · ${weekdayOfDayKey(day)}`,
                      })
                    }
                  >
                    <span>{weekdayOfDayKey(day)}</span>
                    <span className="v4-mini-value">{formatMinutes(series[index] ?? 0)}</span>
                    <span className="v4-mini-meta">{(byDay.get(day)?.tasksDone ?? 0)} 个完成</span>
                  </button>
                </li>
              ))}
            </ul>
          }
        />

        <ExpandablePanel
          id="activity"
          title="最近活动"
          meta={`${events.length} 条`}
          hint="展开更早记录"
          summary={
            events.length === 0 ? (
              <StateView kind="empty" title="还没有时间轴记录" hint="完成任务、完成专注、解决阻碍都会出现在这里。" />
            ) : (
              <ul className="v4-activity-list">
                {events.slice(0, 4).map(event => (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="v4-activity-button"
                      onClick={() => workspace.openDetail({ kind: 'activity', id: event.id, title: '活动详情' })}
                    >
                      <span className="v4-activity-time">{formatRelative(event.at)}</span>
                      <span className="v4-activity-kind">{EVENT_META[event.type].label}</span>
                      <span className="v4-activity-title">{event.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
          detail={
            events.length === 0 ? (
              <p className="v4-muted">没有更多记录。</p>
            ) : (
              <ul className="v4-activity-list">
                {events.slice(0, 20).map(event => (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="v4-activity-button"
                      onClick={() => workspace.openDetail({ kind: 'activity', id: event.id, title: '活动详情' })}
                    >
                      <span className="v4-activity-time">{formatRelative(event.at)}</span>
                      <span className="v4-activity-kind">{EVENT_META[event.type].label}</span>
                      <span className="v4-activity-title">{event.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
        />

        <ExpandablePanel
          id="knowledge"
          title="知识与记忆"
          meta={`${knowledge.total} 个知识点`}
          hint="展开节点"
          summary={
            <div className="v4-knowledge-summary">
              <div>
                <p className="v4-mini-big">{knowledge.total}</p>
                <p className="v4-mini-label">知识点</p>
              </div>
              <div>
                <p className="v4-mini-big">{knowledge.learned}</p>
                <p className="v4-mini-label">已掌握</p>
              </div>
              <div>
                <p className="v4-mini-big">{knowledge.dueCount}</p>
                <p className="v4-mini-label">待复习</p>
              </div>
              <div>
                <p className="v4-mini-big">{memory.length}</p>
                <p className="v4-mini-label">记忆文档</p>
              </div>
            </div>
          }
          detail={
            <>
              {graph.nodes.length === 0 ? (
                <p className="v4-muted">还没有知识节点。原有数据若存在，会在这里出现。</p>
              ) : (
                <ul className="v4-mini-table">
                  {[...graph.nodes]
                    .sort((left, right) => right.updatedAt - left.updatedAt)
                    .slice(0, 6)
                    .map(node => (
                      <li key={node.id}>
                        <button
                          type="button"
                          className="v4-mini-row"
                          onClick={() => workspace.openDetail({ kind: 'knowledge', id: 'knowledge', title: '知识图谱' })}
                        >
                          <span>{node.title}</span>
                          <span className="v4-mini-value">{STATUS_LABEL[node.status]}</span>
                          <span className="v4-mini-meta">掌握 {node.mastery}/5</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
              <div className="v4-panel-actions">
                <Button
                  size="sm"
                  onClick={() => workspace.openDetail({ kind: 'knowledge', id: 'knowledge', title: '知识图谱' })}
                >
                  知识点详情
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => workspace.openDetail({ kind: 'knowledge', id: 'memory', title: '项目记忆' })}
                >
                  记忆 {memory.length} 份
                </Button>
              </div>
              <p className="v4-panel-hint">
                复习记录 {review.total} 次 · 本周 {review.week} 次。编辑与排期随 Knowledge 阶段迁移。
              </p>
            </>
          }
        />
      </div>
    </div>
  )
}

function rankedRate(value: number, max: number): number {
  return max <= 0 ? 0 : value / max
}

interface StatProps {
  label: string
  value: string
  unit?: string
  hint: string
  ring?: number
  title?: string
  visual?: ReactNode
  /** 有值就是可点的：整个格子变成一个按钮，打开对应统计抽屉。 */
  onOpen?: () => void
}

function Stat({ label, value, unit, hint, ring, title, visual, onOpen }: StatProps) {
  const body = (
    <>
      <div className="v4-stat-main">
        <div style={{ minWidth: 0 }}>
          <p className="v4-stat-label">{label}</p>
          <p className="v4-stat-value">
            {value}
            {unit === undefined ? null : <span className="v4-stat-unit">{unit}</span>}
          </p>
        </div>
        {ring === undefined ? null : <ProgressRing value={ring} size={40} />}
      </div>
      <p className="v4-stat-hint">{hint}</p>
      {visual}
    </>
  )

  if (onOpen === undefined) {
    return (
      <div className="v4-stat" title={title}>
        {body}
      </div>
    )
  }

  return (
    <button type="button" className="v4-stat v4-stat-button" title={title} aria-haspopup="dialog" onClick={onOpen}>
      {body}
      <span className="v4-stat-more" aria-hidden="true">
        详情 →
      </span>
    </button>
  )
}
