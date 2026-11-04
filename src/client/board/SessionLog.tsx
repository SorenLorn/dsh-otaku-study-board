/**
 * SessionLog — Card D「开发会话日志」（V3）。
 *
 * 采集链路（V3 完整版）：
 *
 *   Harness 事件 → useHarnessEvent（防抖 + 内容哈希去重 + 旧实例销毁）
 *                → useSessionCapture（归一化 → 斜杠命令拦截 → 分类 → 项目/任务归属）
 *                → mergeLogDraft（90 秒内同类合并，带「×N」角标）
 *                → setLogs（唯一写入口）
 *                → onFriction（排错类日志额外沉淀一条阻碍记录）
 *
 * V3 新增：
 *   • 斜杠命令：用户消息里以 `/board-` 开头的会被 `tryHandle` 消费，不再当普通
 *     日志记录；执行结果在这里给一行提示。
 *   • 任务归属：每条日志可以显示/编辑它归属的任务；会话绑定后自动带上。
 *   • 项目筛选改用 `projectId`（名字会改，id 不会）。
 */
import { useCallback, useMemo, useState } from 'react'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { useBoardActions } from '../hooks/useBoardActions'
import { useSlashCommand } from '../hooks/useSlashCommand'
import { createId } from '../hooks/useLocalStore'
import { mergeLogDraft, useSessionCapture } from '../hooks/useSessionCapture'
import type { LogDraft } from '../lib/detect'
import { SESSION_TYPE_LABELS, SESSION_TYPE_ORDER } from '../lib/config'
import { dayKey, formatTime } from '../lib/time'
import { useConfirm } from '../ui/ConfirmDialog'
import {
  type ClientCtx,
  type LogKind,
  type SessionLog as SessionLogEntry,
  type SessionType,
} from '../types'

/** Keep the list bounded — the log lives in localStorage, not in a database. */
const MAX_LOGS = 400

const SESSION_TYPE_OPTIONS: ReadonlyArray<{ value: SessionType; label: string }> = SESSION_TYPE_ORDER.map(
  value => ({ value, label: SESSION_TYPE_LABELS[value] }),
)

const KIND_LABELS: Record<LogKind, string> = {
  message: '对话',
  'code-block': '代码',
  'tool-call': '工具',
  milestone: '里程碑',
  manual: '手动',
  focus: '专注',
  friction: '阻碍',
}

/** 采集通道 → 人话。 */
const CHANNEL_LABELS = {
  ctx: '宿主事件总线',
  service: '宿主服务',
  window: 'window 桥',
  none: '未接入',
} as const

type DateFilter = 'all' | 'today' | 'week' | 'day'

export interface SessionLogProps {
  /** Plugin client context; without it only the window bridge is available. */
  ctx?: ClientCtx
  /** Current DSH session id, stored on every entry for later filtering. */
  sessionId?: string
}

export function SessionLog({ ctx, sessionId }: SessionLogProps) {
  const board = useBoardData()
  const { settings, patch } = useBoardSettings()
  const actions = useBoardActions()
  const now = useNow()
  const confirm = useConfirm()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState('')
  const [draftProject, setDraftProject] = useState('')
  const [draftProjectId, setDraftProjectId] = useState('')
  const [draftTaskId, setDraftTaskId] = useState('')
  const [draftType, setDraftType] = useState<SessionType>('dev')

  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [dayValue, setDayValue] = useState(() => dayKey(Date.now()))
  const [projectFilter, setProjectFilter] = useState('')
  const [taskFilter, setTaskFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | SessionType>('all')
  const [keyword, setKeyword] = useState('')

  /** 当前会话绑定的任务（来自 meta）。 */
  const boundTaskId = sessionId === undefined ? '' : board.meta.sessionTaskMap[sessionId] ?? ''

  /** 采集回调：合并 or 新增，然后截断到上限。 */
  const handleDraft = useCallback(
    (draft: LogDraft) => {
      board.setLogs(previous => mergeLogDraft(previous, draft).slice(0, MAX_LOGS))
    },
    [board],
  )

  const slash = useSlashCommand(ctx, sessionId)

  const binding = useSessionCapture({
    ctx,
    enabled: settings.autoCapture,
    rules: settings.projectRules,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(board.activeProjectId === '' ? {} : { projectId: board.activeProjectId }),
    ...(boundTaskId === '' ? {} : { taskId: boundTaskId }),
    onDraft: handleDraft,
    onFriction: record => {
      // 保留相似合并语义；只有真正新增才 +1 Daily（actions.addFrictionMerged）。
      actions.addFrictionMerged(record)
    },
    onUserText: slash.tryHandle,
  })

  /** 项目下拉：合并「实体项目」与「历史文本项目」，去重。 */
  const projectOptions = useMemo(() => {
    const options: Array<{ id: string; name: string }> = []
    for (const project of board.projects) options.push({ id: project.id, name: project.name })
    const seen = new Set(options.map(item => item.name))
    for (const log of board.logs) {
      const text = log.project?.trim() ?? ''
      if (text === '' || seen.has(text)) continue
      seen.add(text)
      options.push({ id: '', name: text })
    }
    return options
  }, [board.projects, board.logs])

  const taskOptions = useMemo(() => board.tasks.slice(0, 200), [board.tasks])

  const visible = useMemo(() => {
    const today = dayKey(now)
    const weekStart = now - 7 * 24 * 60 * 60 * 1000
    const needle = keyword.trim().toLowerCase()

    return board.logs.filter(entry => {
      if (dateFilter === 'today' && dayKey(entry.at) !== today) return false
      if (dateFilter === 'week' && entry.at < weekStart) return false
      if (dateFilter === 'day' && dayKey(entry.at) !== dayValue) return false
      if (projectFilter !== '') {
        const id = entry.projectId ?? ''
        const text = entry.project?.trim() ?? ''
        if (projectFilter === '__none__') {
          if (id !== '' || text !== '') return false
        } else if (id !== projectFilter && text !== projectFilter) return false
      }
      if (taskFilter !== '' && (entry.taskId ?? '') !== taskFilter) return false
      if (typeFilter !== 'all' && (entry.sessionType ?? 'other') !== typeFilter) return false
      if (needle !== '') {
        const haystack = `${entry.title} ${entry.detail ?? ''} ${entry.project ?? ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [board.logs, now, dateFilter, dayValue, projectFilter, taskFilter, typeFilter, keyword])

  function addManualLog(): void {
    const entry: SessionLogEntry = {
      id: createId('log'),
      at: Date.now(),
      kind: 'manual',
      sessionType: 'dev',
      project: '',
      title: '手动记录',
      detail: '',
      source: 'manual',
      edited: false,
      ...(sessionId === undefined ? {} : { sessionId }),
    }
    if (board.activeProjectId !== '') {
      entry.projectId = board.activeProjectId
      entry.project = board.activeProject?.name
    }
    if (boundTaskId !== '') entry.taskId = boundTaskId
    board.setLogs(previous => [entry, ...previous].slice(0, MAX_LOGS))
    setEditingId(entry.id)
    setDraftNote('')
    setDraftProject('')
    setDraftProjectId(entry.projectId ?? '')
    setDraftTaskId(entry.taskId ?? '')
    setDraftType('dev')
  }

  function beginEdit(entry: SessionLogEntry): void {
    setEditingId(entry.id)
    setDraftNote(entry.detail ?? '')
    setDraftProject(entry.project ?? '')
    setDraftProjectId(entry.projectId ?? '')
    setDraftTaskId(entry.taskId ?? '')
    setDraftType(entry.sessionType ?? 'other')
  }

  function cancelEdit(): void {
    setEditingId(null)
    setDraftNote('')
    setDraftProject('')
    setDraftProjectId('')
    setDraftTaskId('')
  }

  function commitEdit(id: string): void {
    const project = board.projects.find(item => item.id === draftProjectId)
    board.setLogs(previous =>
      previous.map(entry => {
        if (entry.id !== id) return entry
        const next: SessionLogEntry = {
          ...entry,
          detail: draftNote,
          project: project?.name ?? draftProject.trim(),
          sessionType: draftType,
          edited: true,
        }
        if (project !== undefined) next.projectId = project.id
        else delete next.projectId
        if (draftTaskId !== '') next.taskId = draftTaskId
        else delete next.taskId
        return next
      }),
    )
    cancelEdit()
  }

  function removeLog(entry: SessionLogEntry): void {
    confirm.ask(
      {
        title: '删除这条记录？',
        description: `「${entry.title}」将被永久移除，统计里的时长也会随之减少。`,
        confirmLabel: '删除',
        tone: 'danger',
      },
      () => {
        actions.deleteLog(entry.id)
        if (editingId === entry.id) cancelEdit()
      },
    )
  }

  /** 批量删除：只删「当前筛选结果」。高危操作，必须二次确认。 */
  function removeVisible(): void {
    const ids = new Set(visible.map(entry => entry.id))
    if (ids.size === 0) return
    confirm.ask(
      {
        title: `删除当前筛选出的 ${ids.size} 条记录？`,
        description: '只删除筛选结果，其它记录不受影响。删除后统计里的时长会同步减少，且不可撤销。',
        confirmLabel: `删除 ${ids.size} 条`,
        tone: 'danger',
      },
      () => {
        actions.deleteLogs([...ids])
        if (editingId !== null && ids.has(editingId)) cancelEdit()
      },
    )
  }

  /** 把一条日志归属到某个任务（会话绑定的补充手段）。 */
  function bindEntry(entry: SessionLogEntry, taskId: string): void {
    board.setLogs(previous =>
      previous.map(item => {
        if (item.id !== entry.id) return item
        const next: SessionLogEntry = { ...item, edited: true }
        if (taskId === '') delete next.taskId
        else next.taskId = taskId
        return next
      }),
    )
    if (taskId === '') return
    const found = board.tasks.find(item => item.id === taskId)
    if (found !== undefined) {
      // 顺手把会话也绑上：用户手动指了一次，说明这段会话就属于这个任务。
      if (sessionId !== undefined && sessionId !== '') {
        board.setMeta(previous => ({
          ...previous,
          sessionTaskMap: { ...previous.sessionTaskMap, [sessionId]: taskId },
        }))
      }
    }
  }

  const toggleCapture = (): void => {
    patch({ autoCapture: !settings.autoCapture })
  }

  return (
    <section className="osb-card osb-span-12 osb-log" data-osb-section="log">
      <header className="osb-card-head">
        <div className="osb-card-head-main">
          <h2 className="osb-card-title">开发会话日志</h2>
          <span className="osb-card-title-en">Session log</span>
        </div>
        <span className="osb-card-count">
          {visible.length === board.logs.length
            ? `${board.logs.length} 条`
            : `${visible.length} / ${board.logs.length} 条`}
          {boundTaskId === '' ? '' : ' · 已绑定任务'}
        </span>
      </header>

      <div className="osb-card-body">
        <div className="osb-log-toolbar">
          <button type="button" className="osb-btn osb-btn-ghost" onClick={addManualLog}>
            手动新增记录
          </button>
          <button
            type="button"
            className="osb-btn osb-btn-ghost"
            aria-pressed={settings.autoCapture}
            onClick={toggleCapture}
          >
            {settings.autoCapture ? '监听开关 · 开' : '监听开关 · 关'}
          </button>
          {visible.length > 0 ? (
            <button type="button" className="osb-btn osb-btn-ghost" onClick={removeVisible}>
              删除筛选结果 · {visible.length}
            </button>
          ) : null}
          <span className="osb-capture-status" data-on={settings.autoCapture ? 'true' : 'false'}>
            {settings.autoCapture ? `采集通道：${CHANNEL_LABELS[binding.channel]}` : '已停止监听'}
          </span>
        </div>

        {slash.result === null ? null : (
          <p
            className="osb-notice"
            data-ok={slash.result.ok ? 'true' : 'false'}
            style={{ marginTop: 6 }}
            onClick={slash.clear}
            title="点击关闭"
          >
            <strong>{slash.result.name}</strong> · {slash.result.message}
            {slash.result.detail === undefined ? null : (
              <span style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 4 }}>
                {slash.result.detail}
              </span>
            )}
          </p>
        )}

        <div className="osb-log-filters">
          <select
            className="osb-select"
            value={dateFilter}
            aria-label="按日期筛选"
            onChange={event => setDateFilter(event.target.value as DateFilter)}
          >
            <option value="all">全部日期</option>
            <option value="today">今天</option>
            <option value="week">近 7 天</option>
            <option value="day">指定日期</option>
          </select>
          {dateFilter === 'day' ? (
            <input
              className="osb-input"
              type="date"
              value={dayValue}
              aria-label="选择日期"
              onChange={event => setDayValue(event.target.value)}
            />
          ) : null}
          <select
            className="osb-select"
            value={projectFilter}
            aria-label="按项目筛选"
            onChange={event => setProjectFilter(event.target.value)}
          >
            <option value="">全部项目</option>
            <option value="__none__">未归属项目</option>
            {projectOptions.map(project => (
              <option key={`${project.id}-${project.name}`} value={project.id === '' ? project.name : project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            className="osb-select"
            value={taskFilter}
            aria-label="按任务筛选"
            onChange={event => setTaskFilter(event.target.value)}
          >
            <option value="">全部任务</option>
            {taskOptions.map(task => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <select
            className="osb-select"
            value={typeFilter}
            aria-label="按类型筛选"
            onChange={event => setTypeFilter(event.target.value as 'all' | SessionType)}
          >
            <option value="all">全部类型</option>
            {SESSION_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="osb-input"
            value={keyword}
            placeholder="搜索标题 / 备注 / 项目"
            aria-label="搜索日志"
            onChange={event => setKeyword(event.target.value)}
          />
        </div>

        {board.logs.length === 0 ? (
          <p className="osb-empty">
            暂无记录。打开「监听开关」，在 DSH 里正常对话即可自动生成；也可以「手动新增记录」，
            或在聊天框输入 <code>/board-todo 任务标题</code> 直接建任务。
          </p>
        ) : visible.length === 0 ? (
          <p className="osb-empty">没有符合条件的记录，换个筛选条件试试。</p>
        ) : (
          <ul className="osb-log-list">
            {visible.map(entry => {
              const type = entry.sessionType ?? 'other'
              const task = entry.taskId === undefined ? undefined : board.tasks.find(item => item.id === entry.taskId)
              return (
                <li className="osb-log-row" data-type={type} key={entry.id}>
                  <span className="osb-log-time">{formatTime(entry.at)}</span>

                  <div className="osb-log-body">
                    <div className="osb-log-head">
                      <span className="osb-log-type">{SESSION_TYPE_LABELS[type]}</span>
                      <span className="osb-log-kind">{KIND_LABELS[entry.kind] ?? entry.kind}</span>
                      <span className="osb-log-project">
                        {entry.projectId !== undefined
                          ? board.projects.find(item => item.id === entry.projectId)?.name ?? '未归属项目'
                          : entry.project === undefined || entry.project === ''
                            ? '未归属项目'
                            : entry.project}
                      </span>
                      <span className="osb-log-title">{entry.title}</span>
                      {task === undefined ? null : <span className="osb-log-kind">↳ {task.title}</span>}
                      {entry.hits !== undefined && entry.hits > 1 ? (
                        <span className="osb-log-hits">×{entry.hits}</span>
                      ) : null}
                      {entry.edited ? <span className="osb-log-edited">已编辑</span> : null}
                    </div>

                    {editingId === entry.id ? (
                      <div className="osb-log-editor">
                        <div className="osb-log-editor-fields">
                          <label className="osb-field">
                            <span className="osb-field-label">项目</span>
                            <select
                              className="osb-select"
                              value={draftProjectId}
                              onChange={event => setDraftProjectId(event.target.value)}
                            >
                              <option value="">未归属项目</option>
                              {board.projects.map(project => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="osb-field">
                            <span className="osb-field-label">归属任务</span>
                            <select
                              className="osb-select"
                              value={draftTaskId}
                              onChange={event => setDraftTaskId(event.target.value)}
                            >
                              <option value="">不归属任务</option>
                              {taskOptions.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="osb-field">
                            <span className="osb-field-label">会话类型</span>
                            <select
                              className="osb-select"
                              value={draftType}
                              onChange={event => setDraftType(event.target.value as SessionType)}
                            >
                              {SESSION_TYPE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <textarea
                          className="osb-textarea"
                          value={draftNote}
                          rows={3}
                          placeholder="简短备注：本次推进了什么、卡在哪里…"
                          onChange={event => setDraftNote(event.target.value)}
                        />
                        <div className="osb-log-editor-actions">
                          <button
                            type="button"
                            className="osb-btn osb-btn-primary osb-btn-sm"
                            onClick={() => commitEdit(entry.id)}
                          >
                            保存
                          </button>
                          <button type="button" className="osb-btn osb-btn-sm" onClick={cancelEdit}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : entry.detail !== undefined && entry.detail !== '' ? (
                      <p className="osb-log-detail">{entry.detail}</p>
                    ) : null}
                  </div>

                  <div className="osb-log-actions">
                    <select
                      className="osb-select"
                      style={{ maxWidth: 96, fontSize: 11 }}
                      value={entry.taskId ?? ''}
                      aria-label="归属任务"
                      title="归属任务"
                      onChange={event => bindEntry(entry, event.target.value)}
                    >
                      <option value="">任务…</option>
                      {taskOptions.slice(0, 50).map(item => (
                        <option key={item.id} value={item.id}>
                          {item.title.slice(0, 16)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="osb-btn osb-btn-icon"
                      aria-label="编辑日志"
                      title="编辑日志"
                      onClick={() => beginEdit(entry)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="osb-btn osb-btn-icon"
                      aria-label="删除日志"
                      title="删除日志"
                      onClick={() => removeLog(entry)}
                    >
                      ✕
                    </button>
                  </div>
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
