/**
 * v4/TaskComposer.tsx — 任务新建 / 编辑表单（弹层与任务页内联共用）。
 *
 * 同一份表单出现在两个地方：
 *   • 顶部「新建任务」→ 居中弹层（任何页面都能新建，不强制跳页）；
 *   • 任务页 → 列表上方的内联面板（就地编辑，视线不跳走）。
 *
 * 字段、校验、写入路径完全一致，唯一区别是外壳。写入仍然只走
 * `useBoardActions`（createTask / updateTask），Daily 与 Timeline 由 Actions 维护。
 *
 * 刻意没有「预估时长」字段：`createTask` / `updateTask` 的动作签名还不接受它，
 * 在这里加一个存不进去的输入框就是假功能。它随 Focus 阶段一起迁移。
 */
import { useState } from 'react'
import type { Task, TaskPriority } from '../types'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { formatDateInput, parseDateInput } from '../lib/time'
import { Button } from './ui'

interface FormState {
  title: string
  note: string
  priority: TaskPriority
  due: string
  projectId: string
}

const EMPTY_FORM: FormState = { title: '', note: '', priority: 'normal', due: '', projectId: '' }

export interface TaskComposerProps {
  mode: 'create' | 'edit'
  /** 编辑时的任务；找不到时表单退化成新建。 */
  task?: Task
  /** 默认项目（新建时用当前项目作用域）。 */
  defaultProjectId?: string
  onDone: () => void
  onCancel: () => void
}

export function TaskComposer({ mode, task, defaultProjectId = '', onDone, onCancel }: TaskComposerProps) {
  const board = useBoardData()
  const actions = useBoardActions()
  const editing = mode === 'edit' && task !== undefined

  const [form, setForm] = useState<FormState>(() =>
    editing && task !== undefined
      ? {
          title: task.title,
          note: task.note ?? '',
          priority: task.priority ?? 'normal',
          due: task.dueAt === undefined ? '' : formatDateInput(task.dueAt),
          projectId: task.projectId ?? '',
        }
      : { ...EMPTY_FORM, projectId: defaultProjectId },
  )
  const [error, setError] = useState('')

  const submit = (): void => {
    const title = form.title.trim()
    if (title === '') {
      setError('任务标题不能为空')
      return
    }
    let dueAt: number | null = null
    if (form.due.trim() !== '') {
      dueAt = parseDateInput(form.due.trim())
      if (dueAt === null) {
        setError('截止日期格式应为 YYYY-MM-DD')
        return
      }
    }

    if (!editing) {
      actions.createTask({
        title,
        note: form.note,
        priority: form.priority,
        ...(dueAt === null ? {} : { dueAt }),
        ...(form.projectId === '' ? {} : { projectId: form.projectId }),
      })
    } else {
      actions.updateTask(task.id, {
        title,
        note: form.note,
        priority: form.priority,
        dueAt,
        projectId: form.projectId,
      })
    }
    onDone()
  }

  return (
    <div className="v4-composer">
      <div className="v4-task-form">
        <label className="v4-task-field v4-task-field-wide">
          <span>标题</span>
          <input
            className="v4-field"
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })}
            onKeyDown={event => {
              if (event.key === 'Enter') submit()
            }}
            placeholder="25 分钟内能推进的一步"
            aria-label="任务标题"
            autoFocus
          />
        </label>
        <label className="v4-task-field">
          <span>优先级</span>
          <select
            className="v4-field"
            value={form.priority}
            onChange={event => setForm({ ...form, priority: event.target.value as TaskPriority })}
            aria-label="优先级"
          >
            <option value="normal">普通</option>
            <option value="important">重要</option>
            <option value="urgent">紧急</option>
          </select>
        </label>
        <label className="v4-task-field">
          <span>截止日期</span>
          <input
            className="v4-field"
            type="date"
            value={form.due}
            onChange={event => setForm({ ...form, due: event.target.value })}
            aria-label="截止日期"
          />
        </label>
        <label className="v4-task-field">
          <span>项目</span>
          <select
            className="v4-field"
            value={form.projectId}
            onChange={event => setForm({ ...form, projectId: event.target.value })}
            aria-label="项目归属"
          >
            <option value="">未归属</option>
            {board.projects
              .filter(project => !project.archived)
              .map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
        </label>
        <label className="v4-task-field v4-task-field-wide">
          <span>备注</span>
          <input
            className="v4-field"
            value={form.note}
            onChange={event => setForm({ ...form, note: event.target.value })}
            placeholder="可选：上下文、验收标准"
            aria-label="任务备注"
          />
        </label>
      </div>
      {error === '' ? null : (
        <p className="v4-task-error" role="alert">
          {error}
        </p>
      )}
      <div className="v4-task-form-actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" size="sm" onClick={submit}>
          {editing ? '保存' : '创建'}
        </Button>
      </div>
    </div>
  )
}
