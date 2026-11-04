/**
 * TaskList — Card B「任务清单」（V3）。
 *
 * V3 增加的东西，全部围绕「一个任务到底做到哪了」：
 *   • **子任务**：主任务下可拆多条，勾完最后一条主任务自动完成；支持一键全选，
 *     反过来取消任意一条会退回未完成（`lib/subtask.ts` 保证两个方向一致）。
 *   • **截止日期**：逾期在行内标红，筛选条多了「逾期」。
 *   • **任务 ↔ 会话**：
 *       - 「开会话」把任务标题复制到剪贴板，并派发 `sorchron:open-session`；
 *       - 「绑定会话」把当前 DSH 会话与任务绑定，之后该会话采集的日志自动归属。
 *   • **项目归属**：新建任务自动落在当前项目；切项目时列表跟着换。
 *
 * 所有写操作仍走 `useBoardData` 的 setter（同一个 useLocalStore），所以概览、
 * 计时器、统计会同时更新。
 */
import { useMemo, useState, type FormEvent } from 'react'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { createId } from '../hooks/useLocalStore'
import { taskFocusMinutes, isOverdue } from '../lib/stats'
import { createSubtask, subtaskProgress, toggleSubtask, setAllSubtasks, syncParent } from '../lib/subtask'
import { formatDateInput, formatMinutes, formatRelative, formatTime, parseDateInput } from '../lib/time'
import { clampInteger, sanitizeSubtask, sanitizeTitle } from '../lib/validate'
import { pushNotice } from '../lib/bus'
import { useConfirm } from '../ui/ConfirmDialog'
import type { ClientCtx, Task, TaskFilter, TaskPriority } from '../types'

/** Planned-length choices offered by the add form, in minutes. */
const ESTIMATE_OPTIONS = [15, 25, 45, 60, 90] as const

const PRIORITY_OPTIONS: ReadonlyArray<{ value: TaskPriority; label: string }> = [
  { value: 'normal', label: '普通' },
  { value: 'important', label: '重要' },
  { value: 'urgent', label: '紧急' },
]

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  normal: '普通',
  important: '重要',
  urgent: '紧急',
}

const FILTERS: ReadonlyArray<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'done', label: '已完成' },
  { value: 'overdue', label: '逾期' },
]

export interface TaskListProps {
  /** 客户端上下文：用于「开会话」时探测宿主 sessions 服务。 */
  ctx?: ClientCtx
  /** 当前 DSH 会话 id：用于「绑定会话」。 */
  sessionId?: string
}

export function TaskList({ ctx, sessionId }: TaskListProps) {
  const board = useBoardData()
  const actions = useBoardActions()
  const confirm = useConfirm()

  const [draft, setDraft] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [estimate, setEstimate] = useState<number>(ESTIMATE_OPTIONS[1])
  const [filter, setFilter] = useState<TaskFilter>('all')

  /** Inline editor state — one row at a time. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPriority, setDraftPriority] = useState<TaskPriority>('normal')
  const [draftEstimate, setDraftEstimate] = useState<number>(25)
  const [draftDue, setDraftDue] = useState('')

  /** 展开子任务的任务 id（一次只展开一个，避免列表过长）。 */
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [subDraft, setSubDraft] = useState('')

  const now = Date.now()
  const doneCount = board.tasks.filter(task => task.done).length
  const overdueCount = board.tasks.filter(task => isOverdue(task, now)).length

  const visible = useMemo(() => {
    return board.tasks.filter(task => {
      if (filter === 'active') return !task.done
      if (filter === 'done') return task.done
      if (filter === 'overdue') return isOverdue(task, now)
      return true
    })
  }, [board.tasks, filter, now])

  function addTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const title = sanitizeTitle(draft)
    if (title === '') return
    const at = Date.now()
    const task: Task = {
      id: createId('task'),
      title,
      status: 'todo',
      done: false,
      pomodoros: 0,
      focusedMinutes: 0,
      estimateMinutes: clampInteger(estimate, 1, 1440, 25),
      priority,
      createdAt: at,
      updatedAt: at,
    }
    if (board.activeProjectId !== '') task.projectId = board.activeProjectId
    board.setTasks(previous => [task, ...previous])
    setDraft('')
    setPriority('normal')
    setEstimate(ESTIMATE_OPTIONS[1])
  }

  /**
   * 勾选主任务。
   *
   * 完成/重开走 actions 层：`completeTask` / `reopenTask` 会同步 Daily（绝对值）、
   * 时间轴与必要的快照；子任务状态仍需在这里一起翻转（actions 不处理子任务）。
   * 顺序很重要：先翻转子任务，再交给 action —— 否则 action 拿到的是旧对象。
   */
  function toggleTask(task: Task): void {
    const done = !task.done
    const at = Date.now()
    if ((task.subtasks ?? []).length > 0) {
      board.setTasks(previous =>
        previous.map(item => {
          if (item.id !== task.id) return item
          return {
            ...item,
            subtasks: (item.subtasks ?? []).map(sub => {
              const next = { ...sub, done }
              if (done) next.doneAt = at
              else delete next.doneAt
              return next
            }),
            updatedAt: at,
          }
        }),
      )
    }
    if (done) actions.completeTask(task.id)
    else actions.reopenTask(task.id)
  }

  function beginEdit(task: Task): void {
    setEditingId(task.id)
    setDraftTitle(task.title)
    setDraftPriority(task.priority ?? 'normal')
    setDraftEstimate(task.estimateMinutes ?? 25)
    setDraftDue(task.dueAt === undefined ? '' : formatDateInput(task.dueAt))
  }

  function cancelEdit(): void {
    setEditingId(null)
  }

  function commitEdit(id: string): void {
    // 空白标题不允许保存：留在编辑态，避免产生一行看不见的任务。
    const title = sanitizeTitle(draftTitle)
    if (title === '') return
    const dueAt = draftDue.trim() === '' ? undefined : parseDateInput(draftDue)
    if (draftDue.trim() !== '' && dueAt === null) {
      pushNotice('截止日期格式不对（应为 YYYY-MM-DD），已忽略这一项', 'warn')
    }
    board.setTasks(previous =>
      previous.map(task => {
        if (task.id !== id) return task
        const next: Task = {
          ...task,
          title,
          priority: draftPriority,
          estimateMinutes: draftEstimate,
          updatedAt: Date.now(),
        }
        if (dueAt === null || dueAt === undefined) delete next.dueAt
        else next.dueAt = dueAt
        return next
      }),
    )
    setEditingId(null)
  }

  function removeTask(task: Task): void {
    confirm.ask(
      {
        title: `删除「${task.title}」？`,
        description: '任务会被永久删除，已记录的专注时长仍保留在历史日志里。',
        confirmLabel: '删除',
        tone: 'danger',
      },
      () => {
        actions.removeTask(task.id)
        if (editingId === task.id) setEditingId(null)
        if (expandedId === task.id) setExpandedId(null)
      },
    )
  }

  /** 子任务：新增。 */
  function addSubtask(task: Task): void {
    const title = sanitizeSubtask(subDraft)
    if (title === '') return
    board.setTasks(previous =>
      previous.map(item =>
        item.id === task.id
          ? {
              ...item,
              subtasks: [...(item.subtasks ?? []), createSubtask(title)],
              updatedAt: Date.now(),
            }
          : item,
      ),
    )
    setSubDraft('')
  }

  function removeSubtask(taskId: string, subtaskId: string): void {
    board.setTasks(previous =>
      previous.map(item =>
        item.id === taskId
          ? syncParent(
              { ...item, subtasks: (item.subtasks ?? []).filter(sub => sub.id !== subtaskId) },
            )
          : item,
      ),
    )
  }

  /** 一键开会话：标题进剪贴板 + 派发事件（宿主支持就直接开）。 */
  function openSession(task: Task): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
        void navigator.clipboard.writeText(task.title).catch(() => undefined)
      }
    } catch {
      /* 剪贴板不可用——不影响后续 */
    }
    let hostOpened = false
    try {
      const sessions = ctx?.get<{ create?: (input: unknown) => unknown }>('sessions')
      if (sessions !== undefined && typeof sessions.create === 'function') {
        sessions.create({ title: task.title })
        hostOpened = true
      }
    } catch {
      /* 宿主没有这个能力——退回事件 + 剪贴板 */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('sorchron:open-session', { detail: { title: task.title, taskId: task.id } }),
      )
    } catch {
      /* 无 CustomEvent 时静默 */
    }
    pushNotice(
      hostOpened
        ? `已为「${task.title}」打开新会话`
        : `已复制「${task.title}」到剪贴板：新建会话后粘贴即可`,
      'info',
    )
  }

  /** 把当前 DSH 会话绑到任务。 */
  function bindSession(task: Task): void {
    if (sessionId === undefined || sessionId === '') {
      pushNotice('拿不到当前会话 id，暂时无法绑定', 'warn')
      return
    }
    const at = Date.now()
    board.setMeta(previous => ({
      ...previous,
      sessionTaskMap: { ...previous.sessionTaskMap, [sessionId]: task.id },
    }))
    board.setTasks(previous =>
      previous.map(item => (item.id === task.id ? { ...item, sessionId, updatedAt: at } : item)),
    )
    pushNotice(`当前会话已绑定「${task.title}」，之后采集的日志都会归到它下面`, 'success')
  }

  /** 这个任务是否已经绑定了当前会话。 */
  function isBound(task: Task): boolean {
    if (sessionId === undefined || sessionId === '') return false
    return board.meta.sessionTaskMap[sessionId] === task.id || task.sessionId === sessionId
  }

  return (
    <section className="osb-card osb-span-7 osb-tasks" data-osb-section="tasks">
      <header className="osb-card-head">
        <div className="osb-card-head-main">
          <h2 className="osb-card-title">任务清单</h2>
          <span className="osb-card-title-en">Task list</span>
        </div>
        <span className="osb-card-count">
          {doneCount} / {board.tasks.length}
          {overdueCount > 0 ? ` · 逾期 ${overdueCount}` : ''}
        </span>
      </header>

      <div className="osb-card-body">
        <form className="osb-add" onSubmit={addTask}>
          <input
            className="osb-input"
            value={draft}
            placeholder="添加学习目标（TS开发 / 英语学习 / 开源练习）"
            aria-label="添加学习目标"
            onChange={event => setDraft(event.target.value)}
          />
          <select
            className="osb-select osb-select-priority"
            value={priority}
            aria-label="优先级"
            onChange={event => setPriority(event.target.value as TaskPriority)}
          >
            {PRIORITY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="osb-select"
            value={estimate}
            aria-label="预估时长"
            onChange={event => setEstimate(Number(event.target.value))}
          >
            {ESTIMATE_OPTIONS.map(minutes => (
              <option key={minutes} value={minutes}>
                {minutes}m
              </option>
            ))}
          </select>
          <button className="osb-btn osb-btn-primary" type="submit">
            Add
          </button>
        </form>

        <div className="osb-filterbar" role="group" aria-label="任务筛选">
          {FILTERS.map(item => (
            <button
              key={item.value}
              type="button"
              className="osb-chip"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              {item.value === 'all' ? ` ${board.tasks.length}` : ''}
              {item.value === 'done' ? ` ${doneCount}` : ''}
              {item.value === 'overdue' ? ` ${overdueCount}` : ''}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="osb-empty">
            {board.tasks.length === 0
              ? '还没有目标。先写下一个能在 25 分钟内推进的小任务。'
              : filter === 'overdue'
                ? '没有逾期任务，节奏很好。'
                : filter === 'done'
                  ? '还没有完成的任务。'
                  : '进行中的任务都清空了。'}
          </p>
        ) : (
          <ul className="osb-task-list">
            {visible.map(task => {
              const focused = taskFocusMinutes(task)
              const progress = subtaskProgress(task)
              const overdue = isOverdue(task, now)
              const expanded = expandedId === task.id
              return (
                <li
                  className="osb-task"
                  data-done={task.done ? 'true' : 'false'}
                  data-overdue={overdue ? 'true' : 'false'}
                  key={task.id}
                >
                  <input
                    className="osb-check"
                    id={`osb-task-${task.id}`}
                    type="checkbox"
                    checked={task.done}
                    onChange={() => toggleTask(task)}
                  />

                  {editingId === task.id ? (
                    <div className="osb-task-editor">
                      <input
                        className="osb-input"
                        value={draftTitle}
                        aria-label="任务标题"
                        onChange={event => setDraftTitle(event.target.value)}
                      />
                      <select
                        className="osb-select osb-select-priority"
                        value={draftPriority}
                        aria-label="优先级"
                        onChange={event => setDraftPriority(event.target.value as TaskPriority)}
                      >
                        {PRIORITY_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="osb-select"
                        value={draftEstimate}
                        aria-label="预估时长"
                        onChange={event => setDraftEstimate(Number(event.target.value))}
                      >
                        {ESTIMATE_OPTIONS.map(minutes => (
                          <option key={minutes} value={minutes}>
                            {minutes}m
                          </option>
                        ))}
                      </select>
                      <input
                        className="osb-input"
                        type="date"
                        value={draftDue}
                        aria-label="截止日期"
                        onChange={event => setDraftDue(event.target.value)}
                      />
                      <button
                        type="button"
                        className="osb-btn osb-btn-primary osb-btn-sm"
                        onClick={() => commitEdit(task.id)}
                      >
                        保存
                      </button>
                      <button type="button" className="osb-btn osb-btn-sm" onClick={cancelEdit}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="osb-task-body">
                      <label className="osb-task-title" htmlFor={`osb-task-${task.id}`}>
                        {task.title}
                      </label>
                      <div className="osb-task-meta">
                        <span className="osb-priority" data-priority={task.priority ?? 'normal'}>
                          <i className="osb-priority-dot" aria-hidden="true" />
                          {PRIORITY_LABELS[task.priority ?? 'normal']}
                        </span>
                        <span className="osb-task-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>预估 {task.estimateMinutes ?? 25}m</span>
                        {focused > 0 ? (
                          <>
                            <span className="osb-task-dot" aria-hidden="true">
                              ·
                            </span>
                            <span>已专注 {formatMinutes(focused)}</span>
                          </>
                        ) : null}
                        {progress.total > 0 ? (
                          <>
                            <span className="osb-task-dot" aria-hidden="true">
                              ·
                            </span>
                            <span>
                              子任务 {progress.done}/{progress.total}
                            </span>
                          </>
                        ) : null}
                        {task.dueAt !== undefined ? (
                          <>
                            <span className="osb-task-dot" aria-hidden="true">
                              ·
                            </span>
                            <span data-overdue={overdue ? 'true' : 'false'}>
                              {overdue ? '已逾期 ' : '截止 '}
                              {formatRelative(task.dueAt, now)}
                            </span>
                          </>
                        ) : null}
                        {isBound(task) ? (
                          <>
                            <span className="osb-task-dot" aria-hidden="true">
                              ·
                            </span>
                            <span>已绑定当前会话</span>
                          </>
                        ) : null}
                        {task.done && task.completedAt !== undefined ? (
                          <>
                            <span className="osb-task-dot" aria-hidden="true">
                              ·
                            </span>
                            <span className="osb-task-done">完成 {formatTime(task.completedAt)}</span>
                          </>
                        ) : null}
                      </div>

                      {progress.total > 0 ? (
                        <div className="osb-track" style={{ height: 3, marginTop: 4 }}>
                          <span
                            className="osb-track-fill"
                            style={{ width: `${Math.round(progress.rate * 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}

                  {editingId === task.id ? null : (
                    <div className="osb-task-actions">
                      <button
                        type="button"
                        className="osb-btn osb-btn-icon"
                        aria-label={expanded ? '收起子任务' : '展开子任务'}
                        title="子任务"
                        aria-expanded={expanded}
                        onClick={() => {
                          setExpandedId(expanded ? null : task.id)
                          setSubDraft('')
                        }}
                      >
                        ☰
                      </button>
                      <button
                        type="button"
                        className="osb-btn osb-btn-icon"
                        aria-label="开会话"
                        title="用这个任务标题开一个新会话（复制标题）"
                        onClick={() => openSession(task)}
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className="osb-btn osb-btn-icon"
                        aria-label="绑定当前会话"
                        title={isBound(task) ? '已绑定当前会话' : '把当前会话绑定到这个任务'}
                        onClick={() => bindSession(task)}
                      >
                        ⇄
                      </button>
                      <button
                        type="button"
                        className="osb-btn osb-btn-icon"
                        aria-label="编辑任务"
                        title="编辑任务"
                        onClick={() => beginEdit(task)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="osb-btn osb-btn-icon"
                        aria-label="删除任务"
                        title="删除任务"
                        onClick={() => removeTask(task)}
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {expanded && editingId !== task.id ? (
                    <div className="osb-subtasks">
                      {(task.subtasks ?? []).length === 0 ? (
                        <p className="osb-hint" style={{ margin: '2px 0 4px' }}>
                          还没有子任务。拆成 2–4 步，勾选时主任务会自动推进。
                        </p>
                      ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {(task.subtasks ?? []).map(sub => (
                            <li
                              key={sub.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}
                            >
                              <input
                                className="osb-check"
                                type="checkbox"
                                checked={sub.done}
                                aria-label={`子任务 ${sub.title}`}
                                onChange={() => {
                                  board.setTasks(previous =>
                                    previous.map(item =>
                                      item.id === task.id ? toggleSubtask(item, sub.id) : item,
                                    ),
                                  )
                                }}
                              />
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: 12,
                                  textDecoration: sub.done ? 'line-through' : 'none',
                                  color: sub.done ? 'var(--osb-text-3)' : 'var(--osb-text-2)',
                                }}
                              >
                                {sub.title}
                              </span>
                              <button
                                type="button"
                                className="osb-btn osb-btn-icon"
                                aria-label="删除子任务"
                                onClick={() => removeSubtask(task.id, sub.id)}
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <input
                          className="osb-input"
                          value={subDraft}
                          placeholder="加一条子任务，回车保存"
                          aria-label="新子任务"
                          onChange={event => setSubDraft(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              addSubtask(task)
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="osb-btn osb-btn-sm"
                          onClick={() => addSubtask(task)}
                        >
                          添加
                        </button>
                        <button
                          type="button"
                          className="osb-btn osb-btn-sm"
                          onClick={() => {
                            const allDone = (task.subtasks ?? []).every(sub => sub.done)
                            board.setTasks(previous =>
                              previous.map(item =>
                                item.id === task.id ? setAllSubtasks(item, !allDone) : item,
                              ),
                            )
                          }}
                        >
                          全选 / 全不选
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {confirm.dialog}
    </section>
  )
}
