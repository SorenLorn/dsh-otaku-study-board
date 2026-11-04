/**
 * useProject — 项目分组（需求 3.3）：切换、创建、模板、归档、解封。
 *
 * 为什么单开一个 hook 而不是塞进 useBoardSettings：
 *   • 项目是一个**列表**（增删改），设置是一个**对象**（改字段），生命周期不同；
 *   • 切换项目要同时写 settings.activeProjectId 并让所有卡片重渲染，
 *     这套逻辑集中在一处，组件只管调用。
 *
 * 一致性：
 *   • 归档当前项目 → 自动切回「全部项目」，否则页面会变成空白的，用户以为数据没了；
 *   • 删除当前项目 → 同上，并且**不删**任务/日志（它们的 projectId 变成悬空，
 *     由 `projectNameOf` 显示为「未归属项目」，数据不丢）。这是有意的保守选择。
 */
import { useCallback, useMemo } from 'react'
import type { Project, Subtask, Task } from '../types'
import { STORAGE_KEYS } from '../types'
import { BOARD_CONFIG } from './../lib/config'
import { normalizeActiveId, findTemplate, PROJECT_TEMPLATES } from '../lib/projects'
import { clampInteger, sanitizeText, sanitizeTitle } from '../lib/validate'
import { info, warn } from '../lib/debug'
import { createId, useLocalStore } from './useLocalStore'
import { useBoardSettings } from './useBoardSettings'

export interface ProjectApi {
  projects: Project[]
  /** 当前活跃项目 id；`''` = 全部项目。 */
  activeProjectId: string
  /** 当前活跃项目实体（全部时 undefined）。 */
  activeProject: Project | undefined
  /** 未归档的项目（下拉、切换条用）。 */
  activeProjects: Project[]
  /** 所有项目，含归档（管理面板用）。 */
  allProjects: Project[]
  setActive: (id: string) => void
  /** 创建一个空项目。 */
  create: (name: string, note?: string) => Project | undefined
  /** 按模板创建项目，返回**待插入**的任务（由调用方落库）。 */
  createFromTemplate: (templateId: string) => { project: Project; tasks: Task[] } | undefined
  update: (id: string, patch: { name?: string; note?: string; color?: string }) => void
  /** 归档 / 解封。归档当前项目会自动切回「全部」。 */
  setArchived: (id: string, archived: boolean) => void
  /** 删除项目（不删任务与日志）。 */
  remove: (id: string) => void
}

/** 本地生成一条模板任务。 */
function templateTask(title: string, projectId: string, now: number, index: number): Task {
  return {
    id: `task-${now.toString(36)}-${index}${Math.random().toString(36).slice(2, 5)}`,
    title,
    status: 'todo',
    done: false,
    pomodoros: 0,
    focusedMinutes: 0,
    estimateMinutes: 25,
    priority: 'normal',
    projectId,
    createdAt: now + index,
    updatedAt: now + index,
  }
}

export function useProject(): ProjectApi {
  const [allProjects, setProjects] = useLocalStore<Project[]>(STORAGE_KEYS.projects, [])
  const { settings, patch } = useBoardSettings()

  const activeProjectId = useMemo(
    () => normalizeActiveId(settings.activeProjectId, allProjects),
    [settings.activeProjectId, allProjects],
  )

  const activeProjects = useMemo(() => allProjects.filter(item => !item.archived), [allProjects])
  const activeProject = useMemo(
    () => allProjects.find(item => item.id === activeProjectId),
    [allProjects, activeProjectId],
  )

  const setActive = useCallback(
    (id: string) => {
      const next = normalizeActiveId(id, allProjects)
      patch({ activeProjectId: next })
      info('project', `active project → ${next === '' ? '全部' : next}`)
    },
    [allProjects, patch],
  )

  const create = useCallback(
    (name: string, note?: string): Project | undefined => {
      const clean = sanitizeTitle(name, BOARD_CONFIG.projects.maxNameLength)
      if (clean === '') return undefined
      const visible = allProjects.filter(item => !item.archived)
      if (visible.length >= BOARD_CONFIG.projects.maxProjects) {
        warn('project', `project limit reached (${BOARD_CONFIG.projects.maxProjects})`)
        return undefined
      }
      // 重名直接拒绝：项目名是用户唯一的识别线索，允许重名只会让人选错。
      if (allProjects.some(item => item.name === clean)) {
        warn('project', `duplicate project name: ${clean}`)
        return undefined
      }
      const now = Date.now()
      const project: Project = { id: createId('project'), name: clean, archived: false, createdAt: now }
      const cleanNote = sanitizeText(note ?? '', 300)
      if (cleanNote !== '') project.note = cleanNote
      setProjects(previous => [...previous, project])
      patch({ activeProjectId: project.id })
      info('project', `created ${project.name}`)
      return project
    },
    [allProjects, setProjects, patch],
  )

  const createFromTemplate = useCallback(
    (templateId: string): { project: Project; tasks: Task[] } | undefined => {
      const template = findTemplate(templateId)
      if (template === undefined) return undefined
      // 同名已存在时加时间后缀，保证「一键初始化」永远可用。
      let name = template.projectName
      if (allProjects.some(item => item.name === name)) {
        name = `${template.projectName} ${new Date().getMonth() + 1}/${new Date().getDate()}`
      }
      const clean = sanitizeTitle(name, BOARD_CONFIG.projects.maxNameLength)
      if (clean === '') return undefined
      const now = Date.now()
      const project: Project = {
        id: createId('project'),
        name: clean,
        color: template.color,
        note: template.note,
        archived: false,
        templateId: template.id,
        createdAt: now,
      }
      setProjects(previous => [...previous, project])
      patch({ activeProjectId: project.id })
      const tasks = template.tasks.map((title, index) => templateTask(title, project.id, now, index))
      info('project', `created ${clean} from ${template.name} (+${tasks.length} tasks)`)
      return { project, tasks }
    },
    [allProjects, setProjects, patch],
  )

  const update = useCallback(
    (id: string, next: { name?: string; note?: string; color?: string }) => {
      setProjects(previous =>
        previous.map(project => {
          if (project.id !== id) return project
          const updated: Project = { ...project }
          if (next.name !== undefined) {
            const clean = sanitizeTitle(next.name, BOARD_CONFIG.projects.maxNameLength)
            if (clean !== '') updated.name = clean
          }
          if (next.note !== undefined) {
            const clean = sanitizeText(next.note, 300)
            if (clean === '') delete updated.note
            else updated.note = clean
          }
          if (next.color !== undefined) {
            const clean = sanitizeTitle(next.color, 32)
            if (clean === '') delete updated.color
            else updated.color = clean
          }
          return updated
        }),
      )
    },
    [setProjects],
  )

  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      setProjects(previous =>
        previous.map(project => {
          if (project.id !== id) return project
          const next: Project = { ...project, archived }
          if (archived) next.archivedAt = Date.now()
          else delete next.archivedAt
          return next
        }),
      )
      // 归档了正在看的项目 → 退回「全部」，避免页面突然空掉。
      if (archived && settings.activeProjectId === id) patch({ activeProjectId: '' })
      info('project', `${archived ? 'archived' : 'restored'} ${id}`)
    },
    [setProjects, settings.activeProjectId, patch],
  )

  const remove = useCallback(
    (id: string) => {
      setProjects(previous => previous.filter(project => project.id !== id))
      if (settings.activeProjectId === id) patch({ activeProjectId: '' })
      info('project', `removed ${id} (tasks/logs kept, now unassigned)`)
    },
    [setProjects, settings.activeProjectId, patch],
  )

  return {
    projects: activeProjects,
    allProjects,
    activeProjectId,
    activeProject,
    activeProjects,
    setActive,
    create,
    createFromTemplate,
    update,
    setArchived,
    remove,
  }
}

/** 模板列表给 UI 用（避免组件直接 import 常量时漏掉类型）。 */
export const PROJECT_TEMPLATE_OPTIONS = PROJECT_TEMPLATES.map(item => ({
  id: item.id,
  name: item.name,
  note: item.note,
}))

/** 子任务计数（项目卡片上的小字）。 */
export function countSubtasks(tasks: Task[]): { total: number; done: number } {
  let total = 0
  let done = 0
  for (const task of tasks) {
    const list: Subtask[] = task.subtasks ?? []
    total += list.length
    done += list.filter(item => item.done).length
  }
  return { total, done }
}

/** 项目任务概览：总数 / 完成 / 逾期（项目卡片用）。 */
export function projectDigest(tasks: Task[], now = Date.now()): {
  total: number
  done: number
  overdue: number
} {
  let done = 0
  let overdue = 0
  for (const task of tasks) {
    if (task.done) done += 1
    else if (task.dueAt !== undefined && task.dueAt < now) overdue += 1
  }
  return { total: tasks.length, done, overdue: clampInteger(overdue, 0, tasks.length, 0) }
}
