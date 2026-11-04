/**
 * snapshot.ts — 简易跨会话记忆快照（需求 3.5，纯本地，不上传）。
 *
 * 解决的问题：新建一个项目时，往往要先回忆「上次做到哪、卡在哪、哪些坑已经踩
 * 过了」。快照把这些**摘要**打成一个 JSON：任务清单 + 阻碍记录（含解决方案）+
 * 重点会话标题。
 *
 * 三条边界：
 *   1. **只有摘要**：会话日志只带 title / detail，不带原文（本来也没存原文）；
 *   2. **导入一定重编号**：快照来自另一个项目，id 直接搬过来会和现有数据撞车，
 *      所以 `importSnapshot` 统一重新生成 id，并修正阻碍记录里的 taskId 引用；
 *   3. **不改已有数据**：导入只新增一个项目，不合并、不覆盖。
 */
import type {
  FrictionRecord,
  MemorySnapshot,
  Project,
  SessionLog,
  Subtask,
  Task,
} from '../types'
import { BOARD_CONFIG } from './config'
import { warn } from './debug'
import { taskFocusMinutes } from './stats'

/** 生成一批短 id（不依赖 crypto，测试环境也能跑）。 */
function makeId(prefix: string, now: number, index: number): string {
  return `${prefix}-${now.toString(36)}-${index.toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export interface BuildSnapshotInput {
  project: Project
  tasks: Task[]
  friction: FrictionRecord[]
  logs: SessionLog[]
  now?: number
}

/**
 * 打包快照。
 *
 * 只取**未完成**任务？不 —— 全取。已完成的也留着，因为它带着 focusedMinutes，
 * 是「这个项目投入了多少」的证据；但 `totals` 里会分开数。
 */
export function buildSnapshot(input: BuildSnapshotInput): MemorySnapshot {
  const now = input.now ?? Date.now()
  const { project } = input

  const tasks = input.tasks
    .filter(task => (task.projectId ?? '') === project.id)
    .slice(0, BOARD_CONFIG.snapshot.maxTasks)
  const friction = input.friction
    .filter(record => (record.projectId ?? '') === project.id)
    .slice(0, BOARD_CONFIG.snapshot.maxFriction)

  const highlights = input.logs
    .filter(log => (log.projectId ?? '') === project.id)
    .filter(log => log.kind !== 'focus')
    .sort((a, b) => b.at - a.at)
    .slice(0, BOARD_CONFIG.snapshot.maxHighlights)
    .map(log => {
      const entry: MemorySnapshot['highlights'][number] = { at: log.at, title: log.title }
      if (log.detail !== undefined) entry.detail = log.detail
      if (log.sessionType !== undefined) entry.sessionType = log.sessionType
      if (log.taskId !== undefined) entry.taskId = log.taskId
      return entry
    })

  const focusMinutes = input.logs
    .filter(log => (log.projectId ?? '') === project.id && log.kind === 'focus')
    .reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0)

  return {
    kind: 'sorchron-project-snapshot',
    version: 3,
    exportedAt: now,
    project: {
      id: project.id,
      name: project.name,
      ...(project.note === undefined ? {} : { note: project.note }),
      ...(project.templateId === undefined ? {} : { templateId: project.templateId }),
    },
    tasks,
    friction,
    highlights,
    totals: {
      tasks: tasks.length,
      tasksDone: tasks.filter(task => task.done).length,
      focusMinutes: Math.round(focusMinutes),
      friction: friction.length,
      openFriction: friction.filter(record => !record.resolved).length,
    },
  }
}

/** 序列化：带缩进，用户能自己看。 */
export function serializeSnapshot(snapshot: MemorySnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

/** 快照文件名。 */
export function snapshotFileName(projectName: string, now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const safe = projectName.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24)
  return `sorchron-snapshot-${safe}-${stamp}.json`
}

export type SnapshotParseResult =
  | { ok: true; snapshot: MemorySnapshot }
  | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function bool(value: unknown): boolean {
  return value === true
}

function coerceSubtasks(value: unknown, now: number): Subtask[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: Subtask[] = []
  for (const item of value.slice(0, 50)) {
    const record = asRecord(item)
    const title = str(record?.title)
    if (record === undefined || title === undefined) continue
    const subtask: Subtask = {
      id: str(record.id) ?? makeId('sub', now, out.length),
      title: title.slice(0, 80),
      done: bool(record.done),
      createdAt: num(record.createdAt, now),
    }
    if (subtask.done) subtask.doneAt = num(record.doneAt, now)
    out.push(subtask)
  }
  return out.length > 0 ? out : undefined
}

function coerceTask(value: unknown, now: number): Task | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const title = str(record.title)
  if (title === undefined) return undefined
  const done = bool(record.done)
  const task: Task = {
    id: str(record.id) ?? makeId('task', now, 0),
    title: title.slice(0, 120),
    status: done ? 'done' : record.status === 'doing' ? 'doing' : 'todo',
    done,
    pomodoros: Math.max(0, Math.round(num(record.pomodoros, 0))),
    createdAt: num(record.createdAt, now),
    updatedAt: num(record.updatedAt, now),
  }
  if (record.focusedMinutes !== undefined) task.focusedMinutes = Math.max(0, num(record.focusedMinutes, 0))
  if (record.estimateMinutes !== undefined) task.estimateMinutes = Math.max(1, num(record.estimateMinutes, 25))
  if (record.priority === 'normal' || record.priority === 'important' || record.priority === 'urgent') {
    task.priority = record.priority
  }
  if (record.completedAt !== undefined) task.completedAt = num(record.completedAt, now)
  if (record.note !== undefined) {
    const note = str(record.note)
    if (note !== undefined) task.note = note.slice(0, 500)
  }
  if (record.dueAt !== undefined) task.dueAt = num(record.dueAt, 0)
  const subtasks = coerceSubtasks(record.subtasks, now)
  if (subtasks !== undefined) task.subtasks = subtasks
  return task
}

function coerceFriction(value: unknown, now: number): FrictionRecord | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const summary = str(record.summary)
  if (summary === undefined) return undefined
  const at = num(record.at, now)
  const friction: FrictionRecord = {
    id: str(record.id) ?? makeId('friction', now, 0),
    at,
    updatedAt: num(record.updatedAt, at),
    summary: summary.slice(0, 160),
    hits: Math.max(1, Math.round(num(record.hits, 1))),
    resolved: bool(record.resolved),
  }
  const detail = str(record.detail)
  if (detail !== undefined) friction.detail = detail.slice(0, 600)
  const solution = str(record.solution)
  if (solution !== undefined) friction.solution = solution.slice(0, 1000)
  // taskId 必须保留：导入时要靠它把阻碍记录挂回重编号后的任务。
  const taskId = str(record.taskId)
  if (taskId !== undefined) friction.taskId = taskId
  if (record.resolveMs !== undefined) friction.resolveMs = Math.max(0, num(record.resolveMs, 0))
  return friction
}

/** 解析快照文件，坏文件给出明确原因。 */
export function parseSnapshot(raw: string): SnapshotParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: '文件不是合法的 JSON' }
  }
  const record = asRecord(parsed)
  if (record === undefined) return { ok: false, error: '文件内容不是一个对象' }
  if (record.kind !== 'sorchron-project-snapshot') {
    return { ok: false, error: '不是项目快照（kind 不匹配）' }
  }
  const projectRecord = asRecord(record.project)
  const name = str(projectRecord?.name)
  if (name === undefined) return { ok: false, error: '快照缺少项目名' }

  const now = Date.now()
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map(item => coerceTask(item, now)).filter((task): task is Task => task !== undefined)
    : []
  const friction = Array.isArray(record.friction)
    ? record.friction
        .map(item => coerceFriction(item, now))
        .filter((item): item is FrictionRecord => item !== undefined)
    : []
  const rawHighlights = Array.isArray(record.highlights) ? record.highlights : []
  const highlights: MemorySnapshot['highlights'] = []
  for (const item of rawHighlights.slice(0, BOARD_CONFIG.snapshot.maxHighlights)) {
    const entry = asRecord(item)
    const title = str(entry?.title)
    if (entry === undefined || title === undefined) continue
    const highlight: MemorySnapshot['highlights'][number] = { at: num(entry.at, now), title }
    const detail = str(entry.detail)
    if (detail !== undefined) highlight.detail = detail
    if (entry.sessionType === 'dev' || entry.sessionType === 'debug' || entry.sessionType === 'reading'
      || entry.sessionType === 'design' || entry.sessionType === 'refactor' || entry.sessionType === 'other') {
      highlight.sessionType = entry.sessionType
    }
    const taskId = str(entry.taskId)
    if (taskId !== undefined) highlight.taskId = taskId
    highlights.push(highlight)
  }

  const totalsRecord = asRecord(record.totals)
  const totals: MemorySnapshot['totals'] = {
    tasks: Math.max(0, Math.round(num(totalsRecord?.tasks, tasks.length))),
    tasksDone: Math.max(0, Math.round(num(totalsRecord?.tasksDone, tasks.filter(task => task.done).length))),
    focusMinutes: Math.max(0, Math.round(num(totalsRecord?.focusMinutes, tasks.reduce((sum, task) => sum + taskFocusMinutes(task), 0)))),
    friction: Math.max(0, Math.round(num(totalsRecord?.friction, friction.length))),
    openFriction: Math.max(0, Math.round(num(totalsRecord?.openFriction, friction.filter(item => !item.resolved).length))),
  }

  const project: MemorySnapshot['project'] = {
    id: str(projectRecord?.id) ?? makeId('project', now, 0),
    name: name.slice(0, BOARD_CONFIG.projects.maxNameLength),
  }
  const note = str(projectRecord?.note)
  if (note !== undefined) project.note = note.slice(0, 300)
  const templateId = str(projectRecord?.templateId)
  if (templateId !== undefined) project.templateId = templateId

  warn('snapshot', `parsed: ${tasks.length} tasks / ${friction.length} friction / ${highlights.length} highlights`)

  return {
    ok: true,
    snapshot: {
      kind: 'sorchron-project-snapshot',
      version: 3,
      exportedAt: num(record.exportedAt, now),
      project,
      tasks,
      friction,
      highlights,
      totals,
    },
  }
}

export interface ImportedSnapshot {
  project: Project
  tasks: Task[]
  friction: FrictionRecord[]
  /** 原 session 摘要转成的日志（可选，调用方决定要不要写）。 */
  highlights: SessionLog[]
}

/**
 * 把快照变成「可以直接落库的三组数据」。
 *
 * 关键在**重编号**：
 *   • 项目、任务、阻碍全部换新 id；
 *   • 阻碍记录里的 `taskId` 通过 oldId → newId 映射修正；
 *   • 任务统一挂到新项目下，避免和同名旧项目混在一起。
 */
export function importSnapshot(
  snapshot: MemorySnapshot,
  options: { projectNames: string[]; now?: number } = { projectNames: [] },
): ImportedSnapshot {
  const now = options.now ?? Date.now()
  const projectId = makeId('project', now, 0)

  // 重名时加后缀，避免列表里出现两个一模一样的名字。
  let name = snapshot.project.name
  if (options.projectNames.includes(name)) {
    let index = 2
    while (options.projectNames.includes(`${snapshot.project.name} (${index})`) && index < 50) index += 1
    name = `${snapshot.project.name} (${index})`
  }

  const project: Project = {
    id: projectId,
    name,
    archived: false,
    createdAt: now,
  }
  if (snapshot.project.note !== undefined) project.note = snapshot.project.note
  if (snapshot.project.templateId !== undefined) project.templateId = snapshot.project.templateId

  const idMap = new Map<string, string>()
  const tasks = snapshot.tasks.map((task, index) => {
    const newId = makeId('task', now, index)
    idMap.set(task.id, newId)
    const next: Task = {
      ...task,
      id: newId,
      projectId,
      updatedAt: now,
      subtasks: task.subtasks?.map((subtask, subIndex) => ({
        ...subtask,
        id: makeId('sub', now, index * 100 + subIndex),
      })),
    }
    return next
  })

  const friction = snapshot.friction.map((record, index) => {
    const next: FrictionRecord = {
      ...record,
      id: makeId('friction', now, index),
      projectId,
      updatedAt: now,
    }
    if (record.taskId !== undefined) {
      const mapped = idMap.get(record.taskId)
      if (mapped === undefined) delete next.taskId
      else next.taskId = mapped
    }
    delete next.sessionId
    delete next.logId
    return next
  })

  const highlights: SessionLog[] = snapshot.highlights.slice(0, BOARD_CONFIG.snapshot.maxHighlights).map((item, index) => {
    const log: SessionLog = {
      id: makeId('log', now, index),
      at: item.at,
      kind: 'milestone',
      title: item.title,
      source: 'manual',
      edited: false,
      projectId,
      project: project.name,
    }
    if (item.detail !== undefined) log.detail = item.detail
    if (item.sessionType !== undefined) log.sessionType = item.sessionType
    if (item.taskId !== undefined) {
      const mapped = idMap.get(item.taskId)
      if (mapped !== undefined) log.taskId = mapped
    }
    return log
  })

  return { project, tasks, friction, highlights }
}
