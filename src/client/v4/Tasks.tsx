/**
 * v4/Tasks.tsx — 任务页（统一工作台内）。
 *
 * 布局：紧凑标题行（计数 + 搜索 / 排序 / 新建）→ 状态分段 → 内联表单 → 列表。
 *
 * 交互规范（本阶段统一）：
 *   • 行本身可点：展开行内摘要（备注、项目、子任务、已专注、创建时间）；
 *   • 勾选只勾选，不连带展开；完成 / 重开走 `useBoardActions`；
 *   • 编辑 / 删除平时隐藏，hover 或键盘聚焦时出现（不是不可见按钮）；
 *   • 删除两步确认，就地在行内完成，不弹系统 confirm；
 *   • 「完整详情」打开统一抽屉，抽屉里可以再编辑（弹层）或删除。
 *
 * 页面内不再有项目下拉：项目作用域只在顶部工具栏一处，避免两处筛选打架。
 */
import { useEffect, useMemo, useState } from 'react'
import type { Task, TaskPriority } from '../types'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { isOverdue, taskFocusMinutes } from '../lib/stats'
import { formatDateInput, formatMinutes, formatRelative } from '../lib/time'
import { Button, Card, StateView } from './ui'
import { TaskComposer } from './TaskComposer'
import { useWorkspace } from './workspace'

type StatusFilter = 'all' | 'active' | 'done' | 'overdue'
type SortMode = 'priority' | 'due' | 'created'

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: '紧急',
  important: '重要',
  normal: '普通',
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { urgent: 3, important: 2, normal: 1 }

export interface TasksProps {
  /** 外部（Dashboard 的「新建任务」）递增这个值来打开表单。 */
  createSignal?: number
}

export function Tasks({ createSignal = 0 }: TasksProps) {
  const board = useBoardData()
  const actions = useBoardActions()
  const workspace = useWorkspace()
  const now = useNow()

  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('priority')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const projectName = (id: string | undefined): string =>
    board.projects.find(project => project.id === id)?.name ?? '未归属'

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const list = board.allTasks.filter(task => {
      if (board.activeProjectId !== '' && task.projectId !== board.activeProjectId) return false
      if (status === 'active' && task.done) return false
      if (status === 'done' && !task.done) return false
      if (status === 'overdue' && !isOverdue(task, now)) return false
      if (keyword !== '') {
        const text = `${task.title} ${task.note ?? ''}`.toLowerCase()
        if (!text.includes(keyword)) return false
      }
      return true
    })

    return list.sort((left, right) => {
      if (sort === 'due') {
        const a = left.dueAt ?? Number.POSITIVE_INFINITY
        const b = right.dueAt ?? Number.POSITIVE_INFINITY
        if (a !== b) return a - b
      }
      if (sort === 'priority') {
        const diff = (PRIORITY_WEIGHT[right.priority ?? 'normal'] ?? 1) - (PRIORITY_WEIGHT[left.priority ?? 'normal'] ?? 1)
        if (diff !== 0) return diff
        const due = (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)
        if (due !== 0) return due
      }
      return right.createdAt - left.createdAt
    })
  }, [board.allTasks, board.activeProjectId, status, query, sort, now])

  const openCreate = (): void => {
    setEditingId(null)
    workspace.collapseAll()
    setFormOpen(true)
  }

  // 顶部「新建任务」：信号递增 → 直接打开表单（不经过页面跳转）。
  useEffect(() => {
    if (createSignal > 0) openCreate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal])

  const closeComposer = (): void => {
    setFormOpen(false)
    setEditingId(null)
  }

  const openEdit = (task: Task): void => {
    setEditingId(task.id)
    setFormOpen(true)
    workspace.selectTask(task.id)
  }

  const editing = editingId === null ? undefined : board.allTasks.find(task => task.id === editingId)
  const total = board.allTasks.length
  const done = board.allTasks.filter(task => task.done).length
  const overdue = board.allTasks.filter(task => isOverdue(task, now)).length

  return (
    <div className="v4-tasks">
      <div className="v4-task-top">
        <div className="v4-task-heading">
          <h2 className="v4-task-page-title">任务</h2>
          <p className="v4-task-counts">
            {total} 个任务 · {done} 已完成 · {overdue} 逾期
          </p>
        </div>

        <div className="v4-task-tools">
          <input
            className="v4-field v4-task-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索标题或备注"
            aria-label="搜索任务"
          />
          <select className="v4-field" value={sort} onChange={event => setSort(event.target.value as SortMode)} aria-label="排序">
            <option value="priority">按优先级</option>
            <option value="due">按截止日期</option>
            <option value="created">按创建时间</option>
          </select>
          <Button variant="primary" size="sm" onClick={openCreate}>
            新建任务
          </Button>
        </div>
      </div>

      <div className="v4-task-segments" role="group" aria-label="状态筛选">
        {(
          [
            ['all', '全部'],
            ['active', '未完成'],
            ['done', '已完成'],
            ['overdue', '逾期'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={status === key ? 'v4-segment is-active' : 'v4-segment'}
            aria-pressed={status === key}
            onClick={() => setStatus(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {formOpen ? (
        <Card variant="feature" className="v4-composer-card" pad="none">
          <div className="v4-composer-head">
            <h3 className="v4-composer-title">{editingId === null ? '新建任务' : '编辑任务'}</h3>
            <button type="button" className="v4-close" aria-label="取消" onClick={closeComposer}>
              ✕
            </button>
          </div>
          <TaskComposer
            mode={editingId === null ? 'create' : 'edit'}
            {...(editing === undefined ? {} : { task: editing })}
            defaultProjectId={board.activeProjectId}
            onDone={closeComposer}
            onCancel={closeComposer}
          />
        </Card>
      ) : null}

      <Card className="v4-task-panel">
        {visible.length === 0 ? (
          <StateView
            kind="empty"
            title={total === 0 ? '还没有任务' : '没有匹配的任务'}
            hint={total === 0 ? '先写下一个 25 分钟内能推进的小任务。' : '换一个关键词或筛选条件试试。'}
            action={
              <Button size="sm" onClick={openCreate}>
                新建任务
              </Button>
            }
          />
        ) : (
          <ul className="v4-task-list">
            {visible.map(task => {
              const panelId = `task-${task.id}`
              const open = workspace.expandedId === panelId
              const subtasks = task.subtasks ?? []
              return (
                <li key={task.id} className="v4-task-row" data-open={open ? 'true' : 'false'}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={task.done}
                    aria-label={task.done ? `重开 ${task.title}` : `完成 ${task.title}`}
                    className={task.done ? 'v4-task-check is-done' : 'v4-task-check'}
                    onClick={() => (task.done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}
                  >
                    {task.done ? '✓' : ''}
                  </button>

                  <div className="v4-task-main">
                    <button
                      type="button"
                      className="v4-task-open"
                      aria-expanded={open}
                      aria-controls={`v4-panel-${panelId}`}
                      onClick={() => {
                        workspace.selectTask(task.id)
                        workspace.toggleExpanded(panelId)
                      }}
                    >
                      <p className={task.done ? 'v4-task-title is-done' : 'v4-task-title'}>{task.title}</p>
                      <p className="v4-task-meta">
                        <span className={`v4-priority is-${task.priority ?? 'normal'}`}>
                          {PRIORITY_LABEL[task.priority ?? 'normal']}
                        </span>
                        <span>{projectName(task.projectId)}</span>
                        {task.dueAt === undefined ? null : (
                          <span className={isOverdue(task, now) ? 'v4-task-overdue' : undefined}>{formatDateInput(task.dueAt)}</span>
                        )}
                        {subtasks.length > 0 ? (
                          <span>
                            子任务 {subtasks.filter(sub => sub.done).length}/{subtasks.length}
                          </span>
                        ) : null}
                      </p>
                    </button>

                    {open ? (
                      <div className="v4-task-inline" id={`v4-panel-${panelId}`}>
                        {task.note === undefined || task.note === '' ? (
                          <p className="v4-inline-note is-muted">没有备注。</p>
                        ) : (
                          <p className="v4-inline-note">{task.note}</p>
                        )}
                        <dl className="v4-inline-facts">
                          <div>
                            <dt>已专注</dt>
                            <dd>{formatMinutes(taskFocusMinutes(task))}</dd>
                          </div>
                          <div>
                            <dt>创建</dt>
                            <dd>{formatRelative(task.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>子任务</dt>
                            <dd>{subtasks.length === 0 ? '无' : `${subtasks.filter(sub => sub.done).length}/${subtasks.length}`}</dd>
                          </div>
                          {task.completedAt === undefined ? null : (
                            <div>
                              <dt>完成</dt>
                              <dd>{formatRelative(task.completedAt)}</dd>
                            </div>
                          )}
                        </dl>

                        {subtasks.length === 0 ? null : (
                          <ul className="v4-detail-sublist">
                            {subtasks.map(sub => (
                              <li key={sub.id} data-done={sub.done ? 'true' : 'false'}>
                                <span aria-hidden="true">{sub.done ? '✓' : '○'}</span>
                                <span>{sub.title}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="v4-inline-actions">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => (task.done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}
                          >
                            {task.done ? '重新打开' : '标记完成'}
                          </Button>
                          <Button size="sm" onClick={() => openEdit(task)}>
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

                        {pendingDelete === task.id ? (
                          <div className="v4-task-confirm" role="alert">
                            <span>删除后不可恢复，确认？</span>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                actions.removeTask(task.id)
                                setPendingDelete(null)
                              }}
                            >
                              删除
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                              取消
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="v4-task-actions">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(task)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        workspace.selectTask(task.id)
                        workspace.toggleExpanded(panelId)
                        setPendingDelete(task.id)
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
