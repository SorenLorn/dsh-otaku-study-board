/**
 * actions.ts — 统一业务动作层（阶段 2 · B1）。
 *
 * 为什么需要它：在此之前，UI 直接拼「改数组 + 写日志 + 记事件 + 更新聚合」，
 * 结果就是 V4 的 daily / timeline / history 在业务上完全空转（阶段 2 门禁证据：
 * 7 个必需函数零调用）。这一层把「一次用户动作 = 一次完整状态迁移」固定下来：
 *
 *   输入旧状态 + 操作参数  →  输出新状态 + 时间轴事件（+ 可选历史快照）
 *
 * 三条纪律：
 *   1. 纯函数：不读 localStorage、不碰 React、不碰 DOM；持久化由调用方负责。
 *   2. 事件必须来自真实动作：没有「为了凑调用点」而写的 appendEvent。
 *   3. 聚合口径与 `rebuildDaily` 对齐：任务完成数用**绝对值**（syncDailyTasks），
 *      专注/会话用增量（applyDailyDelta）。
 */
import type {
  DailyAggregate,
  FrictionRecord,
  HistorySnapshot,
  KnowledgeGraph,
  MemoryDraft,
  Project,
  ProjectMemory,
  ReviewRecord,
  SessionLog,
  Task,
  TimelineEvent,
} from '../types'
import { applyDailyDelta, syncDailyTasks } from './daily'
import { appendEvent, makeEvent } from './timeline'
import { buildHistorySnapshot, needsAutoSnapshot } from './history'
import { removeNode, unlinkFrom } from './knowledge'
import { pruneReviews } from './review'
import { acceptDraft, applyMemoryPatch, createEmptyMemory, memoryOf, upsertMemory } from './memory'
import { mergeFriction } from './friction'
import { classifyTitle } from './detect'
import { dayKey, formatTime } from './time'
import type { FocusResult } from './focus'

/** 每个动作的统一返回：只包含被它改动过的集合。 */
export interface ActionResult {
  tasks?: Task[]
  logs?: SessionLog[]
  daily?: DailyAggregate[]
  timeline?: TimelineEvent[]
  graph?: KnowledgeGraph
  reviews?: ReviewRecord[]
  friction?: FrictionRecord[]
  memory?: ProjectMemory[]
  meta?: { sessionTaskMap: Record<string, string> }
  snapshot?: HistorySnapshot
}

function pushEvent(list: TimelineEvent[], event: TimelineEvent): TimelineEvent[] {
  return appendEvent(list, event).list
}

/* ────────────────────────────────────────────────────────────────────────────
 * 任务
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CreateTaskInput {
  tasks: Task[]
  timeline: TimelineEvent[]
  id: string
  title: string
  note?: string
  priority?: Task['priority']
  dueAt?: number
  projectId?: string
  /** 提供时做项目归属校验（推荐）。 */
  projects?: Project[]
  at?: number
}

/**
 * 新建任务。
 *
 * 只允许通过这里创建：校验标题、项目归属、截止时间；写 `task.created` 事件。
 * 不在这里生成 id —— 调用方传 id，便于测试与幂等判断（同 id 直接返回空）。
 */
export function createTask(input: CreateTaskInput): ActionResult {
  const title = input.title.trim()
  if (title === '') return {}
  if (input.id.trim() === '' || input.tasks.some(task => task.id === input.id)) return {}
  if (input.dueAt !== undefined && !Number.isFinite(input.dueAt)) return {}
  if (
    input.projectId !== undefined &&
    input.projectId !== '' &&
    input.projects !== undefined &&
    !input.projects.some(project => project.id === input.projectId && !project.archived)
  ) {
    return {}
  }

  const at = input.at ?? Date.now()
  const task: Task = {
    id: input.id,
    title,
    status: 'todo',
    done: false,
    pomodoros: 0,
    createdAt: at,
    updatedAt: at,
    ...(input.note === undefined || input.note.trim() === '' ? {} : { note: input.note.trim() }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
    ...(input.projectId === undefined || input.projectId === '' ? {} : { projectId: input.projectId }),
  }
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'task.created',
        title: `新建任务：${title}`,
        refId: task.id,
        ...(task.projectId === undefined ? {} : { projectId: task.projectId }),
      },
      at,
    ),
  )
  return { tasks: [task, ...input.tasks], timeline }
}

export interface UpdateTaskInput {
  tasks: Task[]
  taskId: string
  patch: {
    title?: string
    note?: string
    priority?: Task['priority']
    /** `null` 表示清除截止时间。 */
    dueAt?: number | null
    projectId?: string
  }
  projects?: Project[]
  at?: number
}

/**
 * 编辑任务字段（不处理完成状态）。
 *
 * 空补丁 / 值没变 → 返回空结果，不更新时间戳、不产生事件。
 * 普通字段编辑不写时间轴，避免「改个标题也刷一条历史」的噪声。
 */
export function updateTask(input: UpdateTaskInput): ActionResult {
  const existing = input.tasks.find(task => task.id === input.taskId)
  if (existing === undefined) return {}
  const { patch } = input

  if (patch.title !== undefined && patch.title.trim() === '') return {}
  if (
    patch.projectId !== undefined &&
    patch.projectId !== '' &&
    input.projects !== undefined &&
    !input.projects.some(project => project.id === patch.projectId && !project.archived)
  ) {
    return {}
  }
  if (patch.dueAt !== undefined && patch.dueAt !== null && !Number.isFinite(patch.dueAt)) return {}

  const next: Task = { ...existing }
  let changed = false
  const set = <K extends keyof Task>(key: K, value: Task[K]): void => {
    if (next[key] === value) return
    next[key] = value
    changed = true
  }

  if (patch.title !== undefined) set('title', patch.title.trim())
  if (patch.note !== undefined) {
    if (patch.note.trim() === '') delete next.note
    else set('note', patch.note.trim())
  }
  if (patch.priority !== undefined) set('priority', patch.priority)
  if (patch.dueAt !== undefined) {
    if (patch.dueAt === null) {
      if (next.dueAt !== undefined) {
        delete next.dueAt
        changed = true
      }
    } else set('dueAt', patch.dueAt)
  }
  if (patch.projectId !== undefined) {
    if (patch.projectId === '') {
      if (next.projectId !== undefined) {
        delete next.projectId
        changed = true
      }
    } else set('projectId', patch.projectId)
  }

  if (!changed) return {}
  next.updatedAt = input.at ?? Date.now()
  return { tasks: input.tasks.map(task => (task.id === next.id ? next : task)) }
}

export interface CompleteTaskInput {
  tasks: Task[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
  taskId: string
  at?: number
  projectId?: string
  /** 提供时才会考虑生成历史快照（不是每次完成都生成）。 */
  project?: Project
  friction?: FrictionRecord[]
  memory?: ProjectMemory[]
  history?: HistorySnapshot[]
  /** 显式要求打快照（例如「完成里程碑」按钮）。 */
  requestSnapshot?: boolean
}

/**
 * 完成任务。
 *
 * - Daily：`syncDailyTasks` 写绝对值（重开再完成不会变 2）；
 * - 时间轴：`task.completed`；
 * - 历史快照：只有 `requestSnapshot` 或「距上次快照 ≥ 7 天」才生成，
 *   避免每次勾选都产生一个新快照。
 */
export function completeTask(input: CompleteTaskInput): ActionResult {
  const at = input.at ?? Date.now()
  const existing = input.tasks.find(task => task.id === input.taskId)
  if (existing === undefined) return {}
  // 幂等：已经完成的任务再点一次不产生任何副作用。
  if (existing.done) return {}

  const tasks = input.tasks.map(task =>
    task.id === input.taskId
      ? { ...task, done: true, status: 'done' as const, completedAt: at, updatedAt: at }
      : task,
  )
  const daily = syncDailyTasks(input.daily, tasks, dayKey(at), at)
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'task.completed',
        title: `完成任务：${existing.title}`,
        refId: existing.id,
        ...(existing.projectId === undefined ? {} : { projectId: existing.projectId }),
      },
      at,
    ),
  )

  const result: ActionResult = { tasks, daily, timeline }

  const shouldSnapshot =
    input.project !== undefined &&
    (input.requestSnapshot === true ||
      needsAutoSnapshot(input.history ?? [], input.project.id, at))
  if (shouldSnapshot && input.project !== undefined) {
    result.snapshot = buildHistorySnapshot({
      project: input.project,
      tasks,
      friction: input.friction ?? [],
      ...(input.memory === undefined ? {} : { memory: memoryOf(input.memory, input.project.id) }),
      now: at,
    })
  }
  return result
}

/** 重开任务：完成数回落（同样是绝对值），记 `task.reopened`。 */export function reopenTask(input: {
  tasks: Task[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
  taskId: string
  at?: number
}): ActionResult {
  const at = input.at ?? Date.now()
  const existing = input.tasks.find(task => task.id === input.taskId)
  if (existing === undefined || !existing.done) return {}

  const tasks = input.tasks.map(task =>
    task.id === input.taskId
      ? { ...task, done: false, status: 'todo' as const, completedAt: undefined, updatedAt: at }
      : task,
  )
  const daily = syncDailyTasks(input.daily, tasks, dayKey(at), at)
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'task.reopened',
        title: `重开任务：${existing.title}`,
        refId: existing.id,
        ...(existing.projectId === undefined ? {} : { projectId: existing.projectId }),
      },
      at,
    ),
  )
  return { tasks, daily, timeline }
}

/**
 * 删除任务。
 *
 * 除了移除任务本身，还必须清理两类引用，否则会留下悬空 id：
 *   • 知识节点上的 `taskIds`（`unlinkFrom`）；
 *   • `meta.sessionTaskMap` 里指向它的会话绑定。
 * 日志上的 `taskId` 也一并清掉（历史日志仍保留标题，不丢内容）。
 *
 * 删除不是「里程碑」，不写时间轴 —— 白名单里也没有 `task.deleted`，
 * 不为它专门扩类型。
 */
export function deleteTask(input: {
  tasks: Task[]
  logs?: SessionLog[]
  graph?: KnowledgeGraph
  meta?: { sessionTaskMap: Record<string, string> }
  daily?: DailyAggregate[]
  timeline?: TimelineEvent[]
  taskId: string
  at?: number
}): ActionResult {
  const existing = input.tasks.find(task => task.id === input.taskId)
  if (existing === undefined) return {}
  const at = input.at ?? Date.now()
  const tasks = input.tasks.filter(task => task.id !== input.taskId)

  const result: ActionResult = { tasks }
  if (input.logs !== undefined) {
    result.logs = input.logs.map(log => {
      if (log.taskId !== input.taskId) return log
      const next = { ...log }
      delete next.taskId
      return next
    })
  }
  if (input.graph !== undefined) result.graph = unlinkFrom(input.graph, { taskId: input.taskId })
  if (input.meta !== undefined) {
    const sessionTaskMap: Record<string, string> = {}
    for (const [sessionId, taskId] of Object.entries(input.meta.sessionTaskMap)) {
      if (taskId !== input.taskId) sessionTaskMap[sessionId] = taskId
    }
    result.meta = { sessionTaskMap }
  }
  // 删除已完成任务必须回退当天完成数，否则 Daily 会永久多 1。
  if (input.daily !== undefined && existing.completedAt !== undefined) {
    result.daily = syncDailyTasks(input.daily, tasks, dayKey(existing.completedAt), at)
  }
  if (input.timeline !== undefined) {
    result.timeline = pushEvent(
      input.timeline,
      makeEvent(
        {
          type: 'task.deleted',
          title: `删除任务：${existing.title}`,
          refId: existing.id,
          ...(existing.projectId === undefined ? {} : { projectId: existing.projectId }),
        },
        at,
      ),
    )
  }
  return result
}

/* ────────────────────────────────────────────────────────────────────────────
 * 专注与阻碍
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AddFocusLogInput {
  logs: SessionLog[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
  log: SessionLog
  /** 幂等键：同一 log.id 重复提交只算一次。 */
  at?: number
}

/**
 * 记一条专注日志。
 *
 * - Daily：`focusMinutes` 用增量（时长是「事件量」，不是状态量）；
 * - 幂等：同 id 已存在则原样返回（计时器重试/双击不会双计）。
 */
export function addFocusLog(input: AddFocusLogInput): ActionResult {
  const at = input.at ?? input.log.at
  if (input.logs.some(log => log.id === input.log.id)) return {}
  const minutes = Math.max(0, Math.round(input.log.minutes ?? 0))

  const logs = [input.log, ...input.logs]
  const daily = applyDailyDelta(input.daily, dayKey(at), { focusMinutes: minutes }, at)
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'focus.completed',
        title: `专注 ${minutes} 分钟`,
        refId: input.log.id,
        ...(input.log.projectId === undefined ? {} : { projectId: input.log.projectId }),
      },
      at,
    ),
  )
  return { logs, daily, timeline }
}

/**
 * 专注结束的完整记账（Phase 5.5 的唯一入口）。
 *
 * 为什么不让 UI 自己拼「写日志 + 加 daily + 记任务」：这三步必须同时发生，
 * 任何一步漏掉都会出现「热力图有数、任务没涨」或者「任务涨了、日志没落」。
 * 全部收在这里，UI 只负责把计时器的结算结果递进来。
 *
 * 四条口径：
 *   • **实际分钟**：用 `result.minutes`（计时器按剩余时间反推），不是目标时长；
 *   • **幂等**：日志 id = `result.roundId`，同 id 已存在时整个动作返回空；
 *   • **不伪造**：`minutes < 1` 直接不写（需求 §5.1）；
 *   • **任务副本**：`focusedMinutes` 与 `pomodoros` 同步累加（与 V3 语义一致），
 *     它只是按任务的展示副本，不参与任何总计（see lib/stats.ts）。
 */
export interface FinishFocusInput {
  logs: SessionLog[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
  tasks: Task[]
  /** 计时器结算结果（`lib/focus.ts` 的 `endRound().result`）。 */
  result: FocusResult
  /** 绑定的任务；任务已被删除时传 undefined，日志仍然写入（只是没有 taskId）。 */
  task?: Task
  /** 项目：优先用任务上的 projectId，其次当前活跃项目。 */
  projects?: Project[]
  activeProjectId?: string
  at?: number
}

export function finishFocus(input: FinishFocusInput): ActionResult {
  const { result } = input
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(result.minutes)))
  if (minutes < 1) return {}
  const id = result.roundId.trim()
  if (id === '') return {}
  // 幂等：同一轮重复结算（双击 / 刷新重放 / 双标签）直接返回空结果。
  if (input.logs.some(log => log.id === id)) return {}

  const at = result.endedAt
  const task = input.task
  const projectId =
    task?.projectId ??
    (input.activeProjectId !== undefined && input.activeProjectId !== '' ? input.activeProjectId : undefined)
  const projectName = input.projects?.find(item => item.id === projectId)?.name

  const log: SessionLog = {
    id,
    at,
    kind: 'focus',
    sessionType: classifyTitle(task?.title ?? ''),
    title: `${minutes} 分钟专注${task === undefined ? '' : ` · ${task.title}`}`,
    detail: `${formatTime(result.startedAt)} → ${formatTime(at)}`,
    source: 'manual',
    edited: false,
    minutes,
    ...(projectId === undefined ? {} : { projectId }),
    ...(projectName === undefined ? {} : { project: projectName }),
    ...(task === undefined ? {} : { taskId: task.id }),
  }

  const logs = [log, ...input.logs]
  const daily = applyDailyDelta(input.daily, dayKey(at), { focusMinutes: minutes }, at)
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'focus.completed',
        title: `专注 ${minutes} 分钟${task === undefined ? '' : `：${task.title}`}`,
        refId: log.id,
        ...(projectId === undefined ? {} : { projectId }),
        detail: `${formatTime(result.startedAt)} → ${formatTime(at)}`,
      },
      at,
    ),
  )

  // 任务副本：只在任务仍然存在时累加；已删除的任务不动（历史日志仍然保留标题）。
  const tasks =
    task === undefined
      ? input.tasks
      : input.tasks.map(item => {
          if (item.id !== task.id) return item
          const base = item.focusedMinutes ?? (item.pomodoros ?? 0) * 25
          return {
            ...item,
            focusedMinutes: base + minutes,
            pomodoros: (item.pomodoros ?? 0) + 1,
            updatedAt: at,
          }
        })

  return { logs, daily, timeline, tasks }
}

/**
 * 写入一条非专注的会话日志（自动采集 / 手动补记）。
 *
 * 与 `addFocusLog` 的分工：
 *   • `kind === 'focus'` 走 `finishFocus`，计入 `focusMinutes`；
 *   • 其余 kind 走这里，只计入 `sessions`，**绝不进入专注分钟**（需求 §7.3）。
 *
 * 时间轴：只有 `milestone` 会写 `log.milestone`。自动采集的每条消息都进时间轴
 * 会把 1200 条的环挤爆，时间轴也就没人看了 —— 这是刻意的降噪。
 */
export function addSessionLog(input: {
  logs: SessionLog[]
  daily: DailyAggregate[]
  timeline?: TimelineEvent[]
  log: SessionLog
}): ActionResult {
  if (input.log.kind === 'focus') return {}
  if (input.logs.some(log => log.id === input.log.id)) return {}
  const at = input.log.at
  const logs = [input.log, ...input.logs]
  const daily = applyDailyDelta(input.daily, dayKey(at), { sessions: 1 }, at)
  const result: ActionResult = { logs, daily }
  if (input.timeline !== undefined && input.log.kind === 'milestone') {
    result.timeline = pushEvent(
      input.timeline,
      makeEvent(
        {
          type: 'log.milestone',
          title: input.log.title || '里程碑',
          refId: input.log.id,
          ...(input.log.projectId === undefined ? {} : { projectId: input.log.projectId }),
        },
        at,
      ),
    )
  }
  return result
}

/** 新增阻碍：Daily +1，事件 `friction.created`。 */export function addFriction(input: {
  friction: FrictionRecord[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
  record: FrictionRecord
}): ActionResult {
  if (input.friction.some(item => item.id === input.record.id)) return {}
  const friction = [input.record, ...input.friction]
  const daily = applyDailyDelta(input.daily, dayKey(input.record.at), { friction: 1 }, input.record.at)
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'friction.created',
        title: `出现阻碍：${input.record.summary.slice(0, 40)}`,
        refId: input.record.id,
        ...(input.record.projectId === undefined ? {} : { projectId: input.record.projectId }),
      },
      input.record.at,
    ),
  )
  return { friction, daily, timeline }
}

/** 解决阻碍：只改状态与事件，不动 Daily（次数已在创建时计过）。 */
export function resolveFriction(input: {
  friction: FrictionRecord[]
  timeline: TimelineEvent[]
  frictionId: string
  solution: string
  at?: number
}): ActionResult {
  const at = input.at ?? Date.now()
  const target = input.friction.find(item => item.id === input.frictionId)
  if (target === undefined || target.resolved) return {}

  const friction = input.friction.map(item =>
    item.id === input.frictionId
      ? {
          ...item,
          resolved: true,
          solution: input.solution.trim(),
          updatedAt: at,
          resolveMs: item.resolveMs ?? Math.max(60_000, at - item.at),
        }
      : item,
  )
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'friction.resolved',
        title: `解决阻碍：${target.summary.slice(0, 40)}`,
        refId: target.id,
        ...(target.projectId === undefined ? {} : { projectId: target.projectId }),
      },
      at,
    ),
  )
  return { friction, timeline }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 知识与记忆
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 删除知识节点：节点 + 相关边 + 孤儿复习记录。
 *
 * 三步缺一不可，否则统计会虚高、图上会出现悬空边（第二轮审计 C8/E2）。
 */
export function deleteKnowledgeNode(input: {
  graph: KnowledgeGraph
  reviews: ReviewRecord[]
  nodeId: string
}): ActionResult {
  if (!input.graph.nodes.some(node => node.id === input.nodeId)) return {}
  const graph = removeNode(input.graph, input.nodeId)
  const remaining = new Set(graph.nodes.map(node => node.id))
  const pruned = pruneReviews(input.reviews, remaining)
  return { graph, reviews: pruned.reviews }
}

/**
 * 保存项目记忆。
 *
 * 只有内容真的变化时 `applyMemoryPatch` 才涨版本（第一轮 QA-07 已修），
 * 所以「保存但没改」不会产生时间轴噪声。
 */
export function saveMemory(input: {
  memory: ProjectMemory[]
  timeline: TimelineEvent[]
  projectId: string
  patch: MemoryDraft['patch']
  source?: ProjectMemory['source']
  at?: number
}): ActionResult {
  const at = input.at ?? Date.now()
  const current = memoryOf(input.memory, input.projectId) ?? createEmptyMemory(input.projectId, at)
  const next = applyMemoryPatch(current, input.patch, input.source ?? 'manual', at)
  if (next === current) return {}

  const memory = upsertMemory(input.memory, next)
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: 'memory.updated',
        title: `记忆更新：${input.projectId} → v${next.version}`,
        refId: input.projectId,
        projectId: input.projectId,
      },
      at,
    ),
  )
  return { memory, timeline }
}

/**
 * 采纳记忆草稿。
 *
 * - 只采纳 `accepted === true` 的条目（用户逐条勾选）；
 * - 采纳后把草稿从 meta 里移除（避免重复采纳）；
 * - 未采纳的条目不进入正式记忆。
 */
export function adoptDraft(input: {
  memory: ProjectMemory[]
  drafts: Record<string, MemoryDraft>
  timeline: TimelineEvent[]
  projectId: string
  at?: number
}): ActionResult & { drafts?: Record<string, MemoryDraft> } {
  const at = input.at ?? Date.now()
  const draft = input.drafts[input.projectId]
  if (draft === undefined) return {}

  const patch = acceptDraft(draft)
  const result = saveMemory({
    memory: input.memory,
    timeline: input.timeline,
    projectId: input.projectId,
    patch,
    source: 'ai',
    at,
  })
  if (result.memory === undefined) return {}

  const drafts = { ...input.drafts }
  delete drafts[input.projectId]
  return { ...result, drafts }
}


/* ────────────────────────────────────────────────────────────────────────────
 * 日志删除与阻碍合并写入（B3.5 第二批）
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 删除日志，并**反向扣减**当日聚合。
 *
 * 幂等：日志不存在时返回空结果，重复删除不会重复扣减。
 * 时间轴保持 append-only，不删除历史事件 —— 删除日志是「纠正记录」，
 * 不是「历史从未发生」。
 *
 * Phase 5.5 修（审计 F5）：非 focus 日志此前只删数组、不动 daily，而
 * `rebuildDaily` 的口径是 `sessions = 非 focus 日志条数` → 删一条会话日志后
 * `daily.sessions` 永久偏高。现在两类日志都按同一口径回退。
 */
export function deleteLog(input: {
  logs: SessionLog[]
  daily: DailyAggregate[]
  logId: string
}): ActionResult {
  const log = input.logs.find(item => item.id === input.logId)
  if (log === undefined) return {}
  const logs = input.logs.filter(item => item.id !== input.logId)
  const day = dayKey(log.at)
  if (log.kind !== 'focus') {
    // applyDailyDelta 自带下限 0 夹取，重复扣减也不会变成负数。
    return { logs, daily: applyDailyDelta(input.daily, day, { sessions: -1 }, log.at) }
  }
  const minutes = Math.max(0, Math.round(log.minutes ?? 0))
  return { logs, daily: applyDailyDelta(input.daily, day, { focusMinutes: -minutes }, log.at) }
}

/** 批量删除（筛选结果）：逐条扣减，最后一次性返回。 */
export function deleteLogs(input: {
  logs: SessionLog[]
  daily: DailyAggregate[]
  logIds: string[]
}): ActionResult {
  const ids = new Set(input.logIds)
  if (ids.size === 0) return {}
  let daily = input.daily
  let changed = false
  for (const log of input.logs) {
    if (!ids.has(log.id)) continue
    changed = true
    const day = dayKey(log.at)
    if (log.kind === 'focus') {
      daily = applyDailyDelta(daily, day, { focusMinutes: -Math.max(0, Math.round(log.minutes ?? 0)) }, log.at)
    } else {
      daily = applyDailyDelta(daily, day, { sessions: -1 }, log.at)
    }
  }
  if (!changed) return {}
  return { logs: input.logs.filter(log => !ids.has(log.id)), daily }
}

/**
 * 写入阻碍（保留相似合并）。
 *
 * 与 `addFriction` 的区别：先走 `mergeFriction` 判断是否并入已有记录。
 * **只有真正新增记录时才 +1 Daily 与写时间轴**；合并只累加 hits。
 */
export function addFrictionMerged(input: {
  friction: FrictionRecord[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
  draft: Omit<FrictionRecord, 'id'>
  now?: number
}): ActionResult & { created: boolean } {
  const now = input.now ?? Date.now()
  const outcome = mergeFriction(input.friction, input.draft, now)
  // 合并分支显式回传未变的 daily，调用方无需判断「undefined 代表没改」。
  if (outcome.merged) return { friction: outcome.records, daily: input.daily, created: false }

  const record = outcome.records.find(item => item.id === outcome.id)
  if (record === undefined) return { friction: outcome.records, created: false }
  // 注意：要传**合并前**的列表。outcome.records 已经包含新记录，
  // 再传给 addFriction 会被幂等判断当成「重复」而返回空结果（本轮修掉的 bug）。
  const added = addFriction({ friction: input.friction, daily: input.daily, timeline: input.timeline, record })
  return { ...added, created: true }
}

/** 导入成功后生成一次历史快照（失败分支不要调用它）。 */
export function buildImportSnapshot(input: {
  project: Project
  tasks: Task[]
  friction: FrictionRecord[]
  memory?: ProjectMemory
  now?: number
}): HistorySnapshot {
  return buildHistorySnapshot({
    project: input.project,
    tasks: input.tasks,
    friction: input.friction,
    ...(input.memory === undefined ? {} : { memory: input.memory }),
    label: '导入后',
    now: input.now ?? Date.now(),
  })
}
