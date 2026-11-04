/**
 * v4/DetailContent.tsx — 抽屉里的正文。
 *
 * 原则：
 *   1. 只读聚合 + 已有 Actions（完成 / 重新打开 / 删除 / 编辑走弹层）。
 *   2. 不新增业务规则：所有数字来自 `lib/stats`、`lib/projects`、`lib/knowledge`，
 *      和 Dashboard 用的是同一批函数，所以两处不会打架。
 *   3. 没有迁移完的能力**明确写出来**（「尚未开放」+ 数据仍在 + 目标阶段），
 *      不做假入口，也不假装已经能用。
 */
import { useMemo, useState } from 'react'
import type { KnowledgeNode, ProjectMemory, ReviewRecord } from '../types'
import { STORAGE_KEYS, type KnowledgeGraph, type TimelineEvent } from '../types'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { useLocalStore } from '../hooks/useLocalStore'
import { computeBoardStats, isOverdue, taskFocusMinutes } from '../lib/stats'
import { graphStats } from '../lib/knowledge'
import { reviewStats } from '../lib/review'
import { dayKey, formatDateInput, formatMinutes, formatRelative, formatTime, weekdayOfDayKey } from '../lib/time'
import { EVENT_META } from '../lib/timeline'
import { useWorkspace, type DetailRef } from './workspace'
import { Button } from './ui'

const PRIORITY_LABEL = { normal: '普通', important: '重要', urgent: '紧急' } as const

export function DetailContent({ detail }: { detail: DetailRef }) {
  if (detail.kind === 'task') return <TaskDetail id={detail.id} />
  if (detail.kind === 'stat') return <StatDetail id={detail.id} />
  if (detail.kind === 'project') return <ProjectDetail id={detail.id} />
  if (detail.kind === 'activity') return <ActivityDetail id={detail.id} />
  if (detail.kind === 'day') return <DayDetail id={detail.id} />
  if (detail.kind === 'knowledge') return <KnowledgeDetail id={detail.id} />
  if (detail.kind === 'unavailable') return <UnavailableDetail detail={detail} />
  return <RoadmapDetail />
}

/* ── 任务 ─────────────────────────────────────────────────────────────────── */

function TaskDetail({ id }: { id?: string }) {
  const board = useBoardData()
  const actions = useBoardActions()
  const workspace = useWorkspace()
  const [confirming, setConfirming] = useState(false)
  const task = board.allTasks.find(item => item.id === id)
  if (task === undefined) return <p className="v4-detail-empty">这个任务已经不存在了。</p>

  const project = board.projects.find(item => item.id === task.projectId)
  const subtasks = task.subtasks ?? []

  return (
    <div className="v4-detail">
      <p className={task.done ? 'v4-detail-title is-done' : 'v4-detail-title'}>{task.title}</p>
      <dl className="v4-detail-facts">
        <div>
          <dt>状态</dt>
          <dd>{task.done ? '已完成' : '进行中'}</dd>
        </div>
        <div>
          <dt>优先级</dt>
          <dd>{PRIORITY_LABEL[task.priority ?? 'normal']}</dd>
        </div>
        <div>
          <dt>项目</dt>
          <dd>{project?.name ?? '未归属'}</dd>
        </div>
        <div>
          <dt>截止</dt>
          <dd>
            {task.dueAt === undefined ? '—' : formatDateInput(task.dueAt)}
            {task.dueAt !== undefined && isOverdue(task, Date.now()) ? '（已逾期）' : ''}
          </dd>
        </div>
        <div>
          <dt>已专注</dt>
          <dd>{formatMinutes(taskFocusMinutes(task))}</dd>
        </div>
        <div>
          <dt>创建</dt>
          <dd>{formatDateInput(task.createdAt)}</dd>
        </div>
        {task.completedAt === undefined ? null : (
          <div>
            <dt>完成</dt>
            <dd>{formatRelative(task.completedAt)}</dd>
          </div>
        )}
      </dl>

      {task.note === undefined || task.note === '' ? null : <p className="v4-detail-note">{task.note}</p>}

      <h3 className="v4-detail-subhead">子任务 {subtasks.length === 0 ? '' : `${subtasks.filter(s => s.done).length}/${subtasks.length}`}</h3>
      {subtasks.length === 0 ? (
        <p className="v4-detail-muted">没有拆子任务。子任务目前只读：勾选与拆分随 Tasks 阶段迁移，已有数据照常展示。</p>
      ) : (
        <ul className="v4-detail-sublist">
          {subtasks.map(sub => (
            <li key={sub.id} data-done={sub.done ? 'true' : 'false'}>
              <span aria-hidden="true">{sub.done ? '✓' : '○'}</span>
              <span>{sub.title}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="v4-detail-actions">
        <Button size="sm" variant="primary" onClick={() => (task.done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}>
          {task.done ? '重新打开' : '标记完成'}
        </Button>
        <Button size="sm" onClick={() => workspace.openModal({ kind: 'edit-task', taskId: task.id, title: '编辑任务' })}>
          编辑
        </Button>
        {confirming ? (
          <span className="v4-detail-confirm" role="alert">
            删除后不可恢复
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                actions.removeTask(task.id)
                workspace.closeOverlay()
              }}
            >
              确认删除
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              取消
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
            删除
          </Button>
        )}
      </div>
      <p className="v4-detail-hint">任务绑定在首页「专注」卡的设置里（以结束那一刻的绑定为准）；预估时长尚未迁移，字段保留。</p>
    </div>
  )
}

/* ── 统计 ─────────────────────────────────────────────────────────────────── */

function StatDetail({ id }: { id?: string }) {
  const board = useBoardData()
  const now = Date.now()
  const stats = useMemo(() => computeBoardStats(board.tasks, board.logs, now), [board.tasks, board.logs, now])
  const done = board.tasks.filter(task => task.done)
  const open = board.tasks.filter(task => !task.done)

  if (id === 'focus') {
    const weekLogs = board.logs.filter(log => log.kind === 'focus' && now - log.at < 7 * 86_400_000)
    const weekMinutes = weekLogs.reduce((sum, log) => sum + (log.minutes ?? 0), 0)
    return (
      <div className="v4-detail">
        <p className="v4-detail-big">{formatMinutes(stats.focusMinutesToday)}</p>
        <p className="v4-detail-muted">今天所有 focus 日志的合计（休息不计入）。</p>
        <dl className="v4-detail-facts">
          <div>
            <dt>今日记录</dt>
            <dd>{stats.logsToday} 条</dd>
          </div>
          <div>
            <dt>本周合计</dt>
            <dd>{formatMinutes(weekMinutes)}</dd>
          </div>
          <div>
            <dt>本周记录</dt>
            <dd>{weekLogs.length} 条</dd>
          </div>
        </dl>
        <h3 className="v4-detail-subhead">最近专注</h3>
        {weekLogs.length === 0 ? (
          <p className="v4-detail-muted">最近 7 天没有 focus 记录。</p>
        ) : (
          <ul className="v4-detail-list">
            {weekLogs.slice(0, 8).map(log => (
              <li key={log.id}>
                <span className="v4-detail-list-time">{formatTime(log.at)}</span>
                <span>{log.title}</span>
                <span className="v4-detail-list-tail">{formatMinutes(log.minutes ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="v4-detail-hint">计时器在首页「专注」卡里：开始 / 暂停 / 继续 / 短休长休 / 结束并记录都已可用。</p>
      </div>
    )
  }

  if (id === 'streak') {
    const doneToday = board.tasks.filter(task => task.completedAt !== undefined && dayKey(task.completedAt) === dayKey(now))
    return (
      <div className="v4-detail">
        <p className="v4-detail-big">{stats.streakDays} 天</p>
        <p className="v4-detail-muted">按「当天有任务完成或有有效专注记录」计算连续天数。</p>
        <dl className="v4-detail-facts">
          <div>
            <dt>今天完成</dt>
            <dd>{doneToday.length} 个</dd>
          </div>
          <div>
            <dt>今天专注</dt>
            <dd>{formatMinutes(stats.focusMinutesToday)}</dd>
          </div>
        </dl>
        <h3 className="v4-detail-subhead">最近完成</h3>
        {board.tasks.every(task => task.completedAt === undefined) ? (
          <p className="v4-detail-muted">还没有完成记录。</p>
        ) : (
          <ul className="v4-detail-list">
            {board.tasks
              .filter(task => task.completedAt !== undefined)
              .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
              .slice(0, 6)
              .map(task => (
                <li key={task.id}>
                  <span className="v4-detail-list-time">{formatRelative(task.completedAt!)}</span>
                  <span>{task.title}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    )
  }

  if (id === 'done') {
    return (
      <div className="v4-detail">
        <p className="v4-detail-big">
          {done.length} / {stats.tasksTotal}
        </p>
        <p className="v4-detail-muted">当前项目作用域内的完成情况（收起时按项目筛选）。</p>
        <dl className="v4-detail-facts">
          <div>
            <dt>进行中</dt>
            <dd>{open.length}</dd>
          </div>
          <div>
            <dt>已完成</dt>
            <dd>{done.length}</dd>
          </div>
          <div>
            <dt>逾期</dt>
            <dd>{stats.overdueTasks ?? 0}</dd>
          </div>
        </dl>
        <ul className="v4-detail-list">
          {done.slice(0, 8).map(task => (
            <li key={task.id}>
              <span className="v4-detail-list-time">{task.completedAt === undefined ? '—' : formatRelative(task.completedAt)}</span>
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
        {done.length === 0 ? <p className="v4-detail-muted">还没有已完成的任务。</p> : null}
      </div>
    )
  }

  return (
    <div className="v4-detail">
      <p className="v4-detail-big">
        {stats.tasksTotal} 个
      </p>
      <p className="v4-detail-muted">今日任务：未完成且未归档的项目作用域内的全部任务。</p>
      <dl className="v4-detail-facts">
        <div>
          <dt>待完成</dt>
          <dd>{open.length}</dd>
        </div>
        <div>
          <dt>今日完成</dt>
          <dd>{stats.tasksDoneToday}</dd>
        </div>
        <div>
          <dt>逾期</dt>
          <dd>{stats.overdueTasks ?? 0}</dd>
        </div>
      </dl>
      <h3 className="v4-detail-subhead">按优先级</h3>
      <ul className="v4-detail-list">
        {open.slice(0, 8).map(task => (
          <li key={task.id}>
            <span className="v4-detail-list-time">{PRIORITY_LABEL[task.priority ?? 'normal']}</span>
            <span>{task.title}</span>
          </li>
        ))}
      </ul>
      {open.length === 0 ? <p className="v4-detail-muted">没有待完成任务。</p> : null}
    </div>
  )
}

/* ── 项目 ─────────────────────────────────────────────────────────────────── */

function ProjectDetail({ id }: { id?: string }) {
  const board = useBoardData()
  const project = board.projects.find(item => item.id === id)
  if (project === undefined) return <p className="v4-detail-empty">这个项目已经不存在了。</p>
  const tasks = board.allTasks.filter(task => task.projectId === project.id)
  const done = tasks.filter(task => task.done)
  const overdue = tasks.filter(task => !task.done && isOverdue(task, Date.now())).length
  const minutes = board.allLogs
    .filter(log => log.projectId === project.id && log.kind === 'focus')
    .reduce((sum, log) => sum + (log.minutes ?? 0), 0)

  return (
    <div className="v4-detail">
      <p className="v4-detail-big">{formatMinutes(minutes)}</p>
      <p className="v4-detail-muted">
        {project.name} · 完成 {done.length} / {tasks.length}
      </p>
      <dl className="v4-detail-facts">
        <div>
          <dt>逾期</dt>
          <dd>{overdue}</dd>
        </div>
        <div>
          <dt>创建</dt>
          <dd>{formatDateInput(project.createdAt)}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{project.archived ? '已归档' : '进行中'}</dd>
        </div>
      </dl>
      {project.note === undefined ? null : <p className="v4-detail-note">{project.note}</p>}
      {project.archived ? <p className="v4-detail-hint">这个项目已归档，数据保留但不再出现在选择器里。</p> : null}
      <h3 className="v4-detail-subhead">任务</h3>
      {tasks.length === 0 ? (
        <p className="v4-detail-muted">这个项目还没有任务。</p>
      ) : (
        <ul className="v4-detail-list">
          {tasks.slice(0, 10).map(task => (
            <li key={task.id} data-done={task.done ? 'true' : 'false'}>
              <span className="v4-detail-list-time">{task.done ? '✓' : '○'}</span>
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="v4-detail-hint">项目新建 / 模板 / 归档 / 快照随 Projects 阶段迁移，当前不可用；原有数据与代码均保留。</p>
    </div>
  )
}

/* ── 活动 ─────────────────────────────────────────────────────────────────── */

function ActivityDetail({ id }: { id?: string }) {
  const [timeline] = useLocalStore<TimelineEvent[]>(STORAGE_KEYS.timeline, [])
  const event = timeline.find(item => item.id === id)
  if (event === undefined) return <p className="v4-detail-empty">这条记录已经不存在了。</p>
  return (
    <div className="v4-detail">
      <p className="v4-detail-title">{event.title}</p>
      <dl className="v4-detail-facts">
        <div>
          <dt>类型</dt>
          <dd>{EVENT_META[event.type].label}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{formatRelative(event.at)}</dd>
        </div>
        {event.projectId === undefined ? null : (
          <div>
            <dt>项目</dt>
            <dd>{event.projectId}</dd>
          </div>
        )}
      </dl>
      {event.detail === undefined ? null : <p className="v4-detail-note">{event.detail}</p>}
      <p className="v4-detail-hint">完整时间轴在「历史」页（30 / 90 / 365 天热力图 + 按天分组）；按项目筛选不开放，日聚合没有项目维度。</p>
    </div>
  )
}

/* ── 某一天 ───────────────────────────────────────────────────────────────── */

function DayDetail({ id }: { id?: string }) {
  const board = useBoardData()
  const [daily] = useLocalStore<Array<{ day: string; focusMinutes: number; tasksDone: number; sessions: number }>>(
    STORAGE_KEYS.daily,
    [],
  )
  // Hook 必须全部在 early return 之前：id 从有到无时组件不会改变 Hook 数量。
  const [timeline] = useLocalStore<TimelineEvent[]>(STORAGE_KEYS.timeline, [])
  if (id === undefined) return <p className="v4-detail-empty">没有选中的日期。</p>
  const row = daily.find(item => item.day === id)
  const logs = board.allLogs.filter(log => dayKey(log.at) === id)
  const focus = logs.filter(log => log.kind === 'focus' && (log.minutes ?? 0) > 0)
  const completed = board.allTasks.filter(task => task.completedAt !== undefined && dayKey(task.completedAt) === id)
  // 时间轴只用于「当天发生了什么」的明细，不参与任何计数累加。
  const events = timeline.filter(event => dayKey(event.at) === id).sort((left, right) => right.at - left.at)
  const minutes = focus.reduce((sum, log) => sum + (log.minutes ?? 0), 0)

  return (
    <div className="v4-detail">
      <p className="v4-detail-big">{formatMinutes(minutes)}</p>
      <p className="v4-detail-muted">
        {formatDateInput(new Date(`${id}T00:00:00`).getTime())} · {weekdayOfDayKey(id)} · 本机记录
      </p>
      <dl className="v4-detail-facts">
        <div>
          <dt>专注记录</dt>
          <dd>{focus.length} 条</dd>
        </div>
        <div>
          <dt>完成任务</dt>
          <dd>{completed.length} 个</dd>
        </div>
        <div>
          <dt>全部记录</dt>
          <dd>{logs.length} 条</dd>
        </div>
        <div>
          <dt>活动事件</dt>
          <dd>{events.length} 条</dd>
        </div>
        {row === undefined ? null : (
          <div>
            <dt>日聚合</dt>
            <dd>
              {formatMinutes(row.focusMinutes)} / {row.tasksDone} 个
            </dd>
          </div>
        )}
      </dl>
      <h3 className="v4-detail-subhead">当天完成的专注</h3>
      {focus.length === 0 ? (
        <p className="v4-detail-muted">这一天没有 focus 记录。</p>
      ) : (
        <ul className="v4-detail-list">
          {focus.slice(0, 10).map(log => (
            <li key={log.id}>
              <span className="v4-detail-list-time">{formatTime(log.at)}</span>
              <span>{log.title}</span>
              <span className="v4-detail-list-tail">{formatMinutes(log.minutes ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="v4-detail-subhead">当天完成的任务</h3>
      {completed.length === 0 ? (
        <p className="v4-detail-muted">这一天没有完成任务。</p>
      ) : (
        <ul className="v4-detail-list">
          {completed.map(task => (
            <li key={task.id}>
              <span className="v4-detail-list-time">{formatTime(task.completedAt!)}</span>
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="v4-detail-subhead">当天活动</h3>
      {events.length === 0 ? (
        <p className="v4-detail-muted">这一天没有时间轴事件（会话日志明细尚未迁移）。</p>
      ) : (
        <ul className="v4-detail-list">
          {events.slice(0, 10).map(event => (
            <li key={event.id}>
              <span className="v4-detail-list-time">{formatTime(event.at)}</span>
              <span>{EVENT_META[event.type].label} · {event.title}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="v4-detail-hint">
        统计口径：专注只算有效 focus 记录，完成数只算 completedAt；时间轴用于明细，不重复累加。
      </p>
    </div>
  )
}

/* ── 知识与记忆（只读） ───────────────────────────────────────────────────── */

function KnowledgeDetail({ id }: { id?: string }) {
  const [graph] = useLocalStore<KnowledgeGraph>(STORAGE_KEYS.knowledge, { nodes: [], edges: [] })
  const [memory] = useLocalStore<ProjectMemory[]>(STORAGE_KEYS.memory, [])
  const [reviews] = useLocalStore<ReviewRecord[]>(STORAGE_KEYS.reviews, [])
  const stats = graphStats(graph)
  const rstats = reviewStats(reviews)
  const nodes = useMemo(() => [...graph.nodes].sort((a, b) => b.updatedAt - a.updatedAt), [graph.nodes])
  const target = id ?? 'knowledge'

  if (target === 'memory') {
    return (
      <div className="v4-detail">
        <p className="v4-detail-big">{memory.length} 份</p>
        <p className="v4-detail-muted">每个项目一份记忆文档；只读展示，起草与采纳仍需确认流程。</p>
        {memory.length === 0 ? (
          <p className="v4-detail-muted">还没有记忆文档。原有数据若存在，会在这里出现。</p>
        ) : (
          <ul className="v4-detail-list">
            {memory.slice(0, 8).map(item => (
              <li key={item.projectId}>
                <span className="v4-detail-list-time">v{item.version}</span>
                <span>{item.intro === '' ? '（无简介）' : item.intro}</span>
                <span className="v4-detail-list-tail">{formatRelative(item.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="v4-detail-hint">记忆草稿、逐条采纳与版本对比随 Memory 阶段迁移。</p>
      </div>
    )
  }

  return (
    <div className="v4-detail">
      <p className="v4-detail-big">{stats.total} 个知识点</p>
      <p className="v4-detail-muted">从本地知识图谱读取，只读展示，不会触发任何写入。</p>
      <dl className="v4-detail-facts">
        <div>
          <dt>已掌握</dt>
          <dd>{stats.learned}</dd>
        </div>
        <div>
          <dt>学习中</dt>
          <dd>{stats.learning}</dd>
        </div>
        <div>
          <dt>待复习</dt>
          <dd>{stats.dueCount}</dd>
        </div>
        <div>
          <dt>依赖边</dt>
          <dd>{stats.edges}</dd>
        </div>
        <div>
          <dt>复习记录</dt>
          <dd>{rstats.total} 次</dd>
        </div>
      </dl>
      <NodeList nodes={nodes} />
      <p className="v4-detail-hint">知识节点编辑、依赖关系与复习排期随 Knowledge 阶段迁移。</p>
    </div>
  )
}

function NodeList({ nodes }: { nodes: KnowledgeNode[] }) {
  if (nodes.length === 0) return <p className="v4-detail-muted">还没有知识节点。</p>
  return (
    <ul className="v4-detail-list">
      {nodes.slice(0, 10).map(node => (
        <li key={node.id}>
          <span className="v4-detail-list-time">{STATUS_LABEL[node.status]}</span>
          <span>{node.title}</span>
          <span className="v4-detail-list-tail">掌握 {node.mastery}/5</span>
        </li>
      ))}
    </ul>
  )
}

const STATUS_LABEL: Record<KnowledgeNode['status'], string> = {
  todo: '待学',
  learning: '在学',
  learned: '已学',
  review: '复习',
}

/* ── 尚未开放 / 迁移计划 ─────────────────────────────────────────────────── */

function UnavailableDetail({ detail }: { detail: DetailRef }) {
  return (
    <div className="v4-detail">
      <p className="v4-detail-title">{detail.title}</p>
      <p className="v4-detail-muted">
        这块能力还在迁移中：没有从旧工作台偷偷打开，也不会用半成品顶替。
      </p>
      {detail.note === undefined ? null : <p className="v4-detail-note">{detail.note}</p>}
      <p className="v4-detail-hint">原有代码、数据与兼容逻辑全部保留；迁移完成后会直接出现在这个工作台里。</p>
    </div>
  )
}

/** 迁移计划：所有尚未开放的能力 + 目标组件 + 顺序，集中在一处说明。 */
function RoadmapDetail() {
  return (
    <div className="v4-detail">
      <p className="v4-detail-muted">
        以下能力仍在迁移中。原有代码与数据都保留，不会丢失；它们**不再**通过经典工作台访问。
      </p>
      <ul className="v4-detail-roadmap">
        {ROADMAP.map(row => (
          <li key={row.name}>
            <div className="v4-detail-roadmap-head">
              <span>{row.name}</span>
              <span className="v4-detail-badge" data-state={row.state}>
                {row.state === 'next' ? '下一阶段' : row.state === 'now' ? '本阶段' : '未开放'}
              </span>
            </div>
            <p>{row.desc}</p>
            <p className="v4-detail-roadmap-target">迁移位置：{row.target}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ROADMAP: ReadonlyArray<{ name: string; state: 'now' | 'next' | 'later'; target: string; desc: string }> = [
  {
    name: '任务：详情 / 行内展开 / 弹层编辑',
    state: 'now',
    target: 'Tasks 页 + 统一抽屉 / 弹层',
    desc: '已完成：点击任务行展开摘要，抽屉看完整字段，弹层新建与编辑，删除两步确认。',
  },
  {
    name: '任务：子任务勾选 / 预估时长',
    state: 'next',
    target: 'Tasks 页 · 任务详情面板',
    desc: '子任务与预估目前只读（数据与展示都在），写入口需要先给 Actions 补方法，否则界面会写不进去。',
  },
  {
    name: '任务：会话绑定专注',
    state: 'now',
    target: 'Dashboard · 专注卡设置',
    desc: '已完成：可在专注卡的设置里绑定任务，归属以结束那一刻的绑定为准。',
  },
  {
    name: '专注计时器（开始 / 暂停 / 短休长休 / 任务绑定）',
    state: 'now',
    target: 'Dashboard · 专注卡',
    desc:
      '已完成（Phase 5.5）：时间戳计时、六态派生、短休长休、任务绑定、结算失败可重试，' +
      '刷新与多标签页不会重复记账。',
  },
  {
    name: '会话日志与自动采集',
    state: 'now',
    target: '页面根节点（CaptureBridge）',
    desc:
      '已完成（Phase 5.5）：采集挂在工作台根节点，页面切换不影响；自动记录只计「会话条数」，' +
      '永远不进专注分钟。',
  },
  {
    name: '斜杠命令执行（/board-*）',
    state: 'later',
    target: 'History 页 · 记录列表',
    desc: '目前只把 /board-* 从日志里摘掉、不执行命令；执行通道与逐条日志编辑随下一阶段迁移。',
  },
  {
    name: '完整时间轴与学习日历',
    state: 'now',
    target: '历史页',
    desc: '已完成：30 / 90 / 365 天热力图、活动强度、连续统计、按天分组的时间轴与当天详情。',
  },
  {
    name: '项目新建 / 模板 / 归档 / 快照',
    state: 'later',
    target: 'Projects 页 / 项目抽屉',
    desc: '只读统计已可用；写操作随 Projects 阶段迁移。',
  },
  {
    name: '备份 / 导入 / 导出 / 存储观测',
    state: 'now',
    target: '设置 · 数据页',
    desc: '已完成：全量 / 时间窗导出、导入预览、合并与覆盖、事务回滚、存储观测与清空。',
  },
  {
    name: '记忆草稿 / 知识节点 / 复习排期',
    state: 'later',
    target: 'Knowledge 页',
    desc: '只读概览已接入 Dashboard；编辑与排期随 Knowledge 阶段迁移。',
  },
  {
    name: '阻碍记录 / 月度目标 / 上下文观测 / 调试',
    state: 'later',
    target: 'Settings 页 · 低频工具区',
    desc: '这些是低频诊断能力，统一收进设置，不再占用主视图。',
  },
]
