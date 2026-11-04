/**
 * schema.ts — 存储版本、迁移与逐字段兜底（V3）。
 *
 * ── 为什么需要这一层（场景 1 / 版本升级用例）────────────────────────────────
 * 写入形状随版本演进：
 *
 *   V1        裸数组 `[ {...task} ]`
 *   V2        `{ "schemaVersion": 2, "data": [ ... ] }`
 *   V3        `{ "schemaVersion": 3, "data": [ ... ] }`，data 里多了
 *             子任务 / 截止日期 / 项目 id / 阻碍记录 / meta
 *
 * 读取时三种都要认。策略是**读时补齐，不写时改写**：
 *   • 裸数组 / 裸对象 → 视为 V1，走同一条 coerce 路径；
 *   • `schemaVersion` 是 1 / 2 / 3 → 都按 V3 的字段表补齐，缺的给默认值。
 *
 * 关键：打开页面**不重写**旧数据（`useLocalStore` 用 touchedRef 保证）。这样
 * 即使 V3 有问题、用户回退到 V2 / V1，数据也不会被改成回不去的形状。
 *
 * 所有字段都过 `clamp*` / `sanitize*`：缺字段给默认、类型错给默认、超界夹边界。
 * 任何一条脏记录都不允许把整页带崩（验收标准 §六.4）。
 */
import type {
  AiRun,
  BoardMeta,
  BoardSettings,
  DailyAggregate,
  Decision,
  FrictionRecord,
  HistorySnapshot,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeStatus,
  Mastery,
  MemoryDraft,
  Project,
  ProjectMemory,
  ReviewForm,
  ReviewGrade,
  ReviewRecord,
  SessionLog,
  SessionType,
  Subtask,
  Task,
  TaskPriority,
  TimelineEvent,
  TimerPersistedState,
  TimerPhase,
} from '../types'
import { STORAGE_KEYS, type StorageKey } from '../types'
import {
  MAX_FRICTION_ENTRIES,
  MAX_LOG_ENTRIES,
  MAX_MINUTES,
  MAX_SUBTASK_LENGTH,
  MAX_TASK_ENTRIES,
  MAX_TITLE_LENGTH,
  STALE_TIMER_MS,
  createDefaultMeta,
  createDefaultSettings,
  createDefaultTimerState,
} from './defaults'
import { DEFAULT_PROJECT_RULES } from './detect'
import { BOARD_CONFIG } from './config'
import {
  clampBreakMinutes,
  clampDurationMinutes,
  clampDueAt,
  clampFocusMinutes,
  clampGoalMinutes,
  clampGoalTasks,
  clampInteger,
  isFiniteNumber,
  isMonthKey,
  sanitizeSubtask,
  sanitizeText,
  sanitizeTitle,
} from './validate'

/** 当前写入的版本号。读到更小的版本就走补齐（同一套 coerce）。 */
export const SCHEMA_VERSION = 4

/** 存储信封。 */
export interface StoreEnvelope {
  schemaVersion: number
  data: unknown
}

/** 包裹一层版本信息，写入时使用。 */
export function wrapEnvelope<T>(data: T): StoreEnvelope {
  return { schemaVersion: SCHEMA_VERSION, data }
}

export interface Unwrapped {
  data: unknown
  /** 1 = 裸数据；2 / 3 = 带信封。 */
  version: number
  /** 是否是 V1 的裸数据。 */
  legacy: boolean
}

/** 拆信封：认不出结构的一律当 V1 裸数据，交给 coerce 兜底。 */
export function unwrapEnvelope(parsed: unknown): Unwrapped {
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as { schemaVersion?: unknown; data?: unknown }
    if ('schemaVersion' in record || 'data' in record) {
      const version = isFiniteNumber(record.schemaVersion) ? record.schemaVersion : 1
      return { data: record.data, version, legacy: false }
    }
  }
  return { data: parsed, version: 1, legacy: true }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 基础读取器
 * ──────────────────────────────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * 读时间戳。
 *
 * 三道过滤（需求 4.1.3 脏数据清理）：
 *   1. 非数字 / NaN / Infinity → fallback
 *   2. 非正数 → fallback
 *   3. 明显越界的未来时间（> 现在 + 24h）→ 夹到 现在 + 24h，避免排序与统计错乱
 */
function readTime(value: unknown, fallback: number, now = Date.now()): number {
  if (!isFiniteNumber(value) || value <= 0) return fallback
  return Math.min(value, now + 24 * 60 * 60 * 1000)
}

/**
 * 读「计划时间」（下次复习、排期这类**本来就在未来**的时间）。
 *
 * 不能复用 `readTime`：它把任何未来时间夹到 24 小时内，那是给「已经发生的事件」
 * 防脏数据用的。用在排期上，90 天后的复习会被压成明天 —— 间隔复习直接失效。
 * 这里只挡「荒谬到不可能」的时间（10 年以上），其余原样保留。
 */
function readScheduleTime(value: unknown, fallback: number, now = Date.now()): number {
  if (!isFiniteNumber(value) || value <= 0) return fallback
  const ceiling = now + 10 * 365 * 24 * 60 * 60 * 1000
  return Math.min(value, ceiling)
}

/** 防原型污染：这些键不允许作为普通字典的 key。 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isSafeKey(key: string): boolean {
  return key.trim() !== '' && !UNSAFE_KEYS.has(key)
}

/* ────────────────────────────────────────────────────────────────────────────
 * 逐类型兜底
 * ──────────────────────────────────────────────────────────────────────────── */

const TASK_PRIORITY = ['normal', 'important', 'urgent'] as const
const SESSION_TYPES: readonly SessionType[] = ['dev', 'debug', 'reading', 'design', 'refactor', 'other']
const LOG_KINDS = ['message', 'code-block', 'tool-call', 'milestone', 'manual', 'focus', 'friction'] as const
const TIMER_PHASES: readonly TimerPhase[] = ['focus', 'short', 'long']

/** 任务：字段级兜底，任何不合法都退到安全值。 */
export function coerceTask(value: unknown, now = Date.now()): Task | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined

  const id = readString(record.id)
  const title = sanitizeTitle(record.title, MAX_TITLE_LENGTH)
  if (id === undefined || title === '') return undefined

  const done = record.done === true || record.status === 'done'
  const status = done ? 'done' : record.status === 'doing' ? 'doing' : 'todo'
  const createdAt = readTime(record.createdAt, now, now)

  const task: Task = {
    id,
    title,
    status,
    done,
    pomodoros: clampInteger(record.pomodoros, 0, MAX_MINUTES, 0),
    createdAt,
    updatedAt: readTime(record.updatedAt, createdAt, now),
  }

  if (record.focusedMinutes !== undefined) task.focusedMinutes = clampFocusMinutes(record.focusedMinutes)
  if (record.estimateMinutes !== undefined) {
    task.estimateMinutes = clampInteger(record.estimateMinutes, 1, MAX_MINUTES, 25)
  }
  const priority = TASK_PRIORITY.find(item => item === record.priority)
  if (priority !== undefined) task.priority = priority as TaskPriority
  if (isFiniteNumber(record.completedAt) && record.completedAt > 0) {
    task.completedAt = readTime(record.completedAt, createdAt, now)
  }
  const note = readString(record.note)
  if (note !== undefined) task.note = sanitizeText(note, 500)
  const projectId = readString(record.projectId)
  if (projectId !== undefined) task.projectId = projectId
  const sessionId = readString(record.sessionId)
  if (sessionId !== undefined) task.sessionId = sessionId

  // V3：截止时间（非法值 → 不设截止）
  const dueAt = clampDueAt(record.dueAt, now)
  if (dueAt !== undefined) task.dueAt = dueAt

  // V3：子任务。坏一条只丢这一条，不影响主任务。
  if (Array.isArray(record.subtasks)) {
    const subtasks: Subtask[] = []
    for (const item of record.subtasks.slice(0, 50)) {
      const coerced = coerceSubtask(item, now)
      if (coerced !== undefined) subtasks.push(coerced)
    }
    if (subtasks.length > 0) {
      task.subtasks = subtasks
      // 一致性修复：子任务全部完成时，主任务自动视为完成。
      if (!task.done && subtasks.every(sub => sub.done)) {
        task.done = true
        task.status = 'done'
        if (task.completedAt === undefined) task.completedAt = readTime(record.updatedAt, now, now)
      }
    }
  }

  return task
}

/** 子任务。 */
export function coerceSubtask(value: unknown, now = Date.now()): Subtask | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const id = readString(record.id)
  const title = sanitizeSubtask(record.title)
  if (id === undefined || title === '') return undefined
  const done = record.done === true
  const subtask: Subtask = {
    id,
    title: title.slice(0, MAX_SUBTASK_LENGTH),
    done,
    createdAt: readTime(record.createdAt, now, now),
  }
  if (done) subtask.doneAt = readTime(record.doneAt, now, now)
  return subtask
}

/** 日志：kind / sessionType 用白名单，标题与备注截断。 */
export function coerceLog(value: unknown, now = Date.now()): SessionLog | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined

  const id = readString(record.id)
  const title = sanitizeTitle(record.title, MAX_TITLE_LENGTH)
  if (id === undefined || title === '') return undefined

  const kind = LOG_KINDS.find(item => item === record.kind) ?? 'manual'
  const sessionType = SESSION_TYPES.find(item => item === record.sessionType)

  const log: SessionLog = {
    id,
    at: readTime(record.at, now, now),
    kind,
    title,
    source: record.source === 'auto' ? 'auto' : 'manual',
    edited: record.edited === true,
  }
  if (sessionType !== undefined) log.sessionType = sessionType
  const detail = readString(record.detail)
  if (detail !== undefined) log.detail = sanitizeText(detail, BOARD_CONFIG.code.maxDetailChars * 4)
  const project = readString(record.project)
  if (project !== undefined) log.project = sanitizeTitle(project, 60)
  const projectId = readString(record.projectId)
  if (projectId !== undefined) log.projectId = projectId
  const taskId = readString(record.taskId)
  if (taskId !== undefined) log.taskId = taskId
  const sessionId = readString(record.sessionId)
  if (sessionId !== undefined) log.sessionId = sessionId
  if (record.minutes !== undefined) log.minutes = clampFocusMinutes(record.minutes)
  if (record.hits !== undefined) log.hits = clampInteger(record.hits, 1, 999, 1)
  if (record.tokens !== undefined) log.tokens = clampInteger(record.tokens, 0, 10_000_000, 0)
  if (record.role === 'user' || record.role === 'assistant' || record.role === 'tool') {
    log.role = record.role
  }

  return log
}

/** 项目。 */
export function coerceProject(value: unknown, now = Date.now()): Project | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const id = readString(record.id)
  const name = sanitizeTitle(record.name, BOARD_CONFIG.projects.maxNameLength)
  if (id === undefined || name === '') return undefined
  const archived = record.archived === true
  const project: Project = {
    id,
    name,
    archived,
    createdAt: readTime(record.createdAt, now, now),
  }
  const color = readString(record.color)
  if (color !== undefined) project.color = color
  const note = readString(record.note)
  if (note !== undefined) project.note = sanitizeText(note, 300)
  const templateId = readString(record.templateId)
  if (templateId !== undefined) project.templateId = templateId
  if (archived) project.archivedAt = readTime(record.archivedAt, now, now)
  return project
}

/** 阻碍记录。 */
export function coerceFriction(value: unknown, now = Date.now()): FrictionRecord | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const id = readString(record.id)
  const summary = sanitizeText(record.summary, 200)
  if (id === undefined || summary === '') return undefined
  const at = readTime(record.at, now, now)
  const friction: FrictionRecord = {
    id,
    at,
    updatedAt: readTime(record.updatedAt, at, now),
    summary,
    hits: clampInteger(record.hits, 1, 999, 1),
    resolved: record.resolved === true,
  }
  const detail = readString(record.detail)
  if (detail !== undefined) friction.detail = sanitizeText(detail, 600)
  const solution = readString(record.solution)
  if (solution !== undefined) friction.solution = sanitizeText(solution, 1000)
  const projectId = readString(record.projectId)
  if (projectId !== undefined) friction.projectId = projectId
  const taskId = readString(record.taskId)
  if (taskId !== undefined) friction.taskId = taskId
  const sessionId = readString(record.sessionId)
  if (sessionId !== undefined) friction.sessionId = sessionId
  const logId = readString(record.logId)
  if (logId !== undefined) friction.logId = logId
  if (record.resolveMs !== undefined) {
    friction.resolveMs = clampInteger(record.resolveMs, 0, 365 * 24 * 3600 * 1000, 0)
  }
  return friction
}

/** 设置：缺项用默认值补，规则列表做结构清洗。 */
export function coerceSettings(value: unknown, now = Date.now()): BoardSettings {
  const defaults = createDefaultSettings(now)
  const record = asRecord(value)
  if (record === undefined) return defaults

  const rules = Array.isArray(record.projectRules)
    ? record.projectRules
        .slice(0, 20)
        .map((rule, index) => {
          const entry = asRecord(rule)
          const keyword = sanitizeTitle(entry?.keyword, 60)
          const project = sanitizeTitle(entry?.project, 40)
          if (keyword === '' || project === '') return undefined
          const next: {
            id: string
            keyword: string
            project: string
            projectId?: string
            regex?: boolean
          } = { id: readString(entry?.id) ?? `rule-${index}-${keyword}`, keyword, project }
          const projectId = readString(entry?.projectId)
          if (projectId !== undefined) next.projectId = projectId
          if (entry?.regex === true) next.regex = true
          return next
        })
        .filter(
          (
            rule,
          ): rule is { id: string; keyword: string; project: string; projectId?: string; regex?: boolean } =>
            rule !== undefined,
        )
    : defaults.projectRules

  const goalRecord = asRecord(record.monthlyGoal)
  const month = readString(goalRecord?.month)

  return {
    autoCapture: record.autoCapture !== false,
    lastDurationMinutes: clampDurationMinutes(record.lastDurationMinutes, defaults.lastDurationMinutes),
    projectRules: rules.length > 0 ? rules : defaults.projectRules,
    monthlyGoal: {
      month: isMonthKey(month) ? month : '',
      targetMinutes: clampGoalMinutes(goalRecord?.targetMinutes, defaults.monthlyGoal.targetMinutes),
      targetTasks: clampGoalTasks(goalRecord?.targetTasks, defaults.monthlyGoal.targetTasks),
    },
    activeProjectId: sanitizeTitle(record.activeProjectId, 64),
    breakEnabled: record.breakEnabled !== false,
    shortBreakMinutes: clampBreakMinutes(record.shortBreakMinutes, defaults.shortBreakMinutes),
    longBreakMinutes: clampBreakMinutes(record.longBreakMinutes, defaults.longBreakMinutes),
    roundsBeforeLongBreak: clampInteger(
      record.roundsBeforeLongBreak,
      2,
      8,
      defaults.roundsBeforeLongBreak,
    ),
    contextWarnMessages: clampInteger(record.contextWarnMessages, 10, 500, defaults.contextWarnMessages),
    contextDangerMessages: clampInteger(record.contextDangerMessages, 20, 1000, defaults.contextDangerMessages),
    aiAutoDaily: record.aiAutoDaily === true,
    aiTier: record.aiTier === 'summary' ? 'summary' : 'stats',
    heatmapYear: clampInteger(record.heatmapYear, 0, 2100, 0),
  }
}

/**
 * meta：会话 → 任务绑定表。
 *
 * 只保留「值像 id」的条目，条数上限 200（一个人不会同时开两百个会话）。
 */
export function coerceMeta(value: unknown): BoardMeta {
  const record = asRecord(value)
  if (record === undefined) return createDefaultMeta()

  const sessionTaskMap: Record<string, string> = {}
  const source = asRecord(record.sessionTaskMap)
  if (source !== undefined) {
    const keys = Object.keys(source).slice(0, 200)
    for (const key of keys) {
      if (!isSafeKey(key)) continue
      const target = readString(source[key])
      if (target === undefined) continue
      sessionTaskMap[key] = target
    }
  }

  const meta: BoardMeta = { sessionTaskMap }
  const drafts = coerceMemoryDrafts(record.memoryDrafts)
  if (Object.keys(drafts).length > 0) meta.memoryDrafts = drafts
  if (isFiniteNumber(record.upgradedFrom)) meta.upgradedFrom = Math.round(record.upgradedFrom)
  if (isFiniteNumber(record.lastWeeklyAt) && record.lastWeeklyAt > 0) {
    meta.lastWeeklyAt = readTime(record.lastWeeklyAt, Date.now())
  }
  if (isFiniteNumber(record.lastContextPruneAt) && record.lastContextPruneAt > 0) {
    meta.lastContextPruneAt = readTime(record.lastContextPruneAt, Date.now())
  }
  if (isFiniteNumber(record.schemaStamp)) meta.schemaStamp = Math.round(record.schemaStamp)
  return meta
}

export interface TimerRestoreResult {
  state: TimerPersistedState
  /** 非空表示发生了「异常重置」，调用方应提示用户。 */
  warning?: string
}

/**
 * 计时状态兜底（场景 3 + 场景 10 + 休息阶段）。
 *
 * 异常会被就地修正：
 *   1. 专注时长不在 10–90 / 休息时长不在 1–30 → 夹取；
 *   2. deadline 已过期超过 24 小时 → 视为残留，直接清空（**不补记**）；
 *   3. deadline 在未来超过「本轮长度 + 2 分钟」→ 时间戳异常，重置；
 *   4. phase / roundInCycle 非法 → 回到 focus / 0。
 */
export function restoreTimerState(value: unknown, now = Date.now()): TimerRestoreResult {
  const defaults = createDefaultTimerState(now)
  const record = asRecord(value)
  if (record === undefined) return { state: defaults }

  const phase = TIMER_PHASES.find(item => item === record.phase) ?? 'focus'
  const isBreak = phase !== 'focus'
  const durationMinutes = isBreak
    ? clampBreakMinutes(record.durationMinutes, phase === 'long' ? 15 : 5)
    : clampDurationMinutes(record.durationMinutes, defaults.durationMinutes)
  const roundInCycle = clampInteger(record.roundInCycle, 0, 7, 0)
  const boundTaskId = readString(record.boundTaskId) ?? ''
  const startedAt = isFiniteNumber(record.startedAt) && record.startedAt > 0 ? record.startedAt : null
  let deadline = isFiniteNumber(record.deadline) && record.deadline > 0 ? record.deadline : null
  let warning: string | undefined

  let running = record.running === true && deadline !== null

  if (running && deadline !== null) {
    const overdue = now - deadline
    const overshoot = deadline - now - durationMinutes * 60_000

    if (overdue > STALE_TIMER_MS) {
      running = false
      deadline = null
      warning = '发现超过 24 小时的残留计时，已重置（不会补记）'
    } else if (overshoot > 120_000) {
      running = false
      deadline = null
      warning = '计时时间戳异常（指向未来），已重置'
    }
  }

  const maxSeconds = durationMinutes * 60
  const storedRemaining = isFiniteNumber(record.remainingSeconds) ? record.remainingSeconds : maxSeconds
  // 休息期间 durationMinutes 是休息长度，专注长度单独记住，休息完回到它。
  const focusMinutes = clampDurationMinutes(record.focusMinutes, defaults.durationMinutes)
  const remainingSeconds = clampInteger(storedRemaining, 0, maxSeconds, maxSeconds)
  /**
   * Phase 5.5：暂停状态也要保留 `startedAt`。
   *
   * 旧实现是 `startedAt: running ? startedAt : null`，于是「暂停 → 刷新 → 继续」之后
   * 日志里的开始时间变成了「继续的那一刻」，`detail` 的时间区间是错的，实际专注
   * 分钟也会跟着变（本轮改为按剩余时间反推，这一条主要影响时间区间与幂等键）。
   * 只有三种情况才清零：跑着但没开始戳（异常）、已完成（剩余 0）、休息段。
   */
  const keepStartedAt =
    startedAt !== null && (running || (phase === 'focus' && remainingSeconds > 0))
  const roundId = typeof record.roundId === 'string' && /^focus-[a-z0-9-]+$/i.test(record.roundId)
    ? record.roundId
    : ''
  const lastMinutes = isFiniteNumber(record.lastMinutes)
    ? clampInteger(record.lastMinutes, 0, maxSeconds / 60, 0)
    : undefined
  /**
   * 待落盘结算：形状不对就整块丢掉（宁可少一次自动重试，也不要拿半个对象去拼日志）。
   * 它是 timer 的瞬态字段，不进备份，所以不需要版本迁移。
   */
  const pending = record.pendingResult
  const pendingResult =
    typeof pending === 'object' &&
    pending !== null &&
    typeof (pending as { roundId?: unknown }).roundId === 'string' &&
    /^focus-[a-z0-9-]+$/i.test((pending as { roundId: string }).roundId) &&
    isFiniteNumber((pending as { minutes?: unknown }).minutes) &&
    isFiniteNumber((pending as { endedAt?: unknown }).endedAt)
      ? {
          roundId: (pending as { roundId: string }).roundId,
          minutes: clampInteger((pending as { minutes: number }).minutes, 0, 24 * 60, 0),
          elapsedSeconds: clampInteger((pending as { elapsedSeconds?: unknown }).elapsedSeconds, 0, 24 * 60 * 60, 0),
          targetMinutes: clampInteger((pending as { targetMinutes?: unknown }).targetMinutes, 0, 24 * 60, durationMinutes),
          taskId: typeof (pending as { taskId?: unknown }).taskId === 'string' ? (pending as { taskId: string }).taskId : '',
          startedAt: isFiniteNumber((pending as { startedAt?: unknown }).startedAt)
            ? readTime((pending as { startedAt: number }).startedAt, now)
            : now,
          endedAt: readTime((pending as { endedAt: number }).endedAt, now),
          ...(() => {
            const before = (pending as { before?: unknown }).before
            if (typeof before !== 'object' || before === null) return {}
            const record = before as Record<string, unknown>
            if (typeof record.day !== 'string') return {}
            const num = (value: unknown): number | null =>
              isFiniteNumber(value) ? Math.max(0, Math.round(value)) : null
            return {
              before: {
                day: record.day,
                dailyMinutes: num(record.dailyMinutes),
                taskId: typeof record.taskId === 'string' ? record.taskId : '',
                taskMinutes: num(record.taskMinutes),
                taskPomodoros: num(record.taskPomodoros),
              },
            }
          })(),
        }
      : undefined

  return {
    state: {
      running,
      deadline: running ? deadline : null,
      durationMinutes,
      boundTaskId,
      startedAt: keepStartedAt ? startedAt : null,
      remainingSeconds,
      phase,
      roundInCycle,
      focusMinutes,
      ...(roundId === '' ? {} : { roundId }),
      ...(lastMinutes === undefined || lastMinutes === 0 ? {} : { lastMinutes }),
      ...(isFiniteNumber(record.lastEndedAt) && record.lastEndedAt > 0
        ? { lastEndedAt: readTime(record.lastEndedAt, now) }
        : {}),
      ...(typeof record.lastTaskId === 'string' && record.lastTaskId !== ''
        ? { lastTaskId: record.lastTaskId }
        : {}),
      ...(pendingResult === undefined ? {} : { pendingResult }),
    },
    ...(warning === undefined ? {} : { warning }),
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * V4：记忆 / 知识 / 复习 / 时间轴 / 历史 / 日聚合 / AI 审计
 *
 * 统一原则与 V3 一致：缺字段给默认、类型错给默认、超界夹边界、单条坏数据只丢自己。
 * 新增实体全部是**独立键**，所以 V3 的 7 个键读写路径一行未改。
 * ──────────────────────────────────────────────────────────────────────────── */

const KNOWLEDGE_STATUS: readonly KnowledgeStatus[] = ['todo', 'learning', 'learned', 'review']
const MEMORY_SOURCES = ['manual', 'draft', 'ai'] as const
const REVIEW_FORMS: readonly ReviewForm[] = ['recall', 'code', 'debug', 'scenario']
const EVENT_TYPES = [
  'project.created',
  'project.archived',
  'project.restored',
  'task.created',
  'task.completed',
  'task.reopened',
  'focus.completed',
  'log.debug',
  'log.milestone',
  'friction.created',
  'friction.resolved',
  'memory.updated',
  'decision.added',
  'knowledge.learned',
  'knowledge.reviewed',
  'history.snapshot',
] as const

/** 字符串数组清洗：去空、去重、限长。 */
function readStringList(value: unknown, limit: number, maxLength = 200): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value.slice(0, limit * 2)) {
    const text = sanitizeText(item, maxLength)
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

/** 决策列表。 */
export function coerceDecision(value: unknown, now = Date.now()): Decision | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const text = sanitizeText(record.text, 300)
  if (text === '') return undefined
  const at = readTime(record.at, now, now)
  return {
    id: readString(record.id) ?? `decision-${at}`,
    at,
    text,
    status: record.status === 'superseded' ? 'superseded' : 'active',
  }
}

/** 项目记忆。`projectId` 是主键，缺失即视为无效记录。 */
export function coerceMemory(value: unknown, now = Date.now()): ProjectMemory | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const projectId = readString(record.projectId)
  if (projectId === undefined) return undefined

  const decisions: Decision[] = []
  if (Array.isArray(record.decisions)) {
    for (const item of record.decisions.slice(0, 60)) {
      const coerced = coerceDecision(item, now)
      if (coerced !== undefined) decisions.push(coerced)
    }
  }

  const source = MEMORY_SOURCES.find(item => item === record.source) ?? 'manual'
  return {
    projectId,
    intro: sanitizeText(record.intro, 600),
    stack: readStringList(record.stack, 30, 40),
    architecture: sanitizeText(record.architecture, 4000),
    done: readStringList(record.done, 120, 300),
    progress: sanitizeText(record.progress, 800),
    openIssues: readStringList(record.openIssues, 120, 300),
    resolvedIssues: readStringList(record.resolvedIssues, 120, 300),
    decisions,
    nextSteps: readStringList(record.nextSteps, 60, 300),
    updatedAt: readTime(record.updatedAt, now, now),
    version: clampInteger(record.version, 1, 100000, 1),
    source,
  }
}

/** 单条知识节点。 */
export function coerceKnowledgeNode(value: unknown, now = Date.now()): KnowledgeNode | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const id = readString(record.id)
  const title = sanitizeTitle(record.title, 80)
  if (id === undefined || title === '') return undefined

  const status = KNOWLEDGE_STATUS.find(item => item === record.status) ?? 'todo'
  const mastery = clampInteger(record.mastery, 0, 5, 0) as Mastery
  const node: KnowledgeNode = {
    id,
    title,
    status,
    mastery,
    projectIds: readStringList(record.projectIds, 40, 64),
    taskIds: readStringList(record.taskIds, 100, 64),
    logIds: readStringList(record.logIds, 100, 64),
    frictionIds: readStringList(record.frictionIds, 100, 64),
    origin: record.origin === 'ai' ? 'ai' : 'manual',
    createdAt: readTime(record.createdAt, now, now),
    updatedAt: readTime(record.updatedAt, now, now),
    reviewCount: clampInteger(record.reviewCount, 0, 10000, 0),
  }
  const summary = readString(record.summary)
  if (summary !== undefined) node.summary = sanitizeText(summary, 400)
  const category = readString(record.category)
  if (category !== undefined) node.category = sanitizeTitle(category, 30)
  if (isFiniteNumber(record.lastReviewedAt) && record.lastReviewedAt > 0) {
    node.lastReviewedAt = readTime(record.lastReviewedAt, now, now)
  }
  if (isFiniteNumber(record.nextReviewAt) && record.nextReviewAt > 0) {
    node.nextReviewAt = readScheduleTime(record.nextReviewAt, now, now)
  }
  return node
}

/**
 * 知识图谱。
 *
 * 这里做了**引用完整性修复**：指向不存在节点的边直接丢弃；自环丢弃；
 * `related` 按无序对去重（A-B 与 B-A 只留一条）。这样即使手改 JSON 也不会
 * 让图算法拿到悬空边。
 */
export function coerceKnowledge(value: unknown, now = Date.now()): KnowledgeGraph {
  const record = asRecord(value)
  if (record === undefined) return { nodes: [], edges: [] }

  const nodes: KnowledgeNode[] = []
  const seenNodes = new Set<string>()
  if (Array.isArray(record.nodes)) {
    for (const item of record.nodes.slice(0, 500)) {
      const node = coerceKnowledgeNode(item, now)
      if (node === undefined || seenNodes.has(node.id)) continue
      seenNodes.add(node.id)
      nodes.push(node)
    }
  }

  const edges: KnowledgeEdge[] = []
  const seenEdges = new Set<string>()
  if (Array.isArray(record.edges)) {
    for (const item of record.edges.slice(0, 900)) {
      const edge = asRecord(item)
      if (edge === undefined) continue
      const fromId = readString(edge.fromId)
      const toId = readString(edge.toId)
      if (fromId === undefined || toId === undefined) continue
      if (fromId === toId) continue
      if (!seenNodes.has(fromId) || !seenNodes.has(toId)) continue
      const kind = edge.kind === 'prereq' ? 'prereq' : 'related'
      // related 视为无向：按排序后的键去重。
      const key = kind === 'related' ? `r|${[fromId, toId].sort().join('|')}` : `p|${fromId}|${toId}`
      if (seenEdges.has(key)) continue
      seenEdges.add(key)
      edges.push({
        id: readString(edge.id) ?? `edge-${edges.length}`,
        fromId,
        toId,
        kind,
      })
    }
  }

  return { nodes, edges }
}

/** 复习记录。 */
export function coerceReview(value: unknown, now = Date.now()): ReviewRecord | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const nodeId = readString(record.nodeId)
  if (nodeId === undefined) return undefined
  const form = REVIEW_FORMS.find(item => item === record.form) ?? 'recall'
  const grade = clampInteger(record.grade, 0, 3, 0) as ReviewGrade
  const at = readTime(record.at, now, now)
  const review: ReviewRecord = {
    id: readString(record.id) ?? `review-${at}`,
    nodeId,
    at,
    form,
    grade,
    nextAt: readScheduleTime(record.nextAt, at + 86_400_000, now),
    intervalDays: clampInteger(record.intervalDays, 1, 3650, 1),
  }
  const note = readString(record.note)
  if (note !== undefined) review.note = sanitizeText(note, 400)
  return review
}

/** 时间轴事件：类型必须在白名单里，否则丢弃（降噪的第一道闸）。 */
export function coerceTimelineEvent(value: unknown, now = Date.now()): TimelineEvent | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const type = EVENT_TYPES.find(item => item === record.type)
  if (type === undefined) return undefined
  const title = sanitizeTitle(record.title, 120)
  if (title === '') return undefined
  const at = readTime(record.at, now, now)
  const event: TimelineEvent = {
    id: readString(record.id) ?? `evt-${at}-${Math.random().toString(36).slice(2, 6)}`,
    at,
    type,
    title,
  }
  const projectId = readString(record.projectId)
  if (projectId !== undefined) event.projectId = projectId
  const refId = readString(record.refId)
  if (refId !== undefined) event.refId = refId
  const detail = readString(record.detail)
  if (detail !== undefined) event.detail = sanitizeText(detail, 200)
  return event
}

/** 历史快照。 */
export function coerceHistory(value: unknown, now = Date.now()): HistorySnapshot | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const projectId = readString(record.projectId)
  if (projectId === undefined) return undefined
  const counts = asRecord(record.counts)
  const digest = asRecord(record.memoryDigest)
  const at = readTime(record.at, now, now)
  return {
    id: readString(record.id) ?? `snap-${at}`,
    projectId,
    at,
    label: sanitizeTitle(record.label, 40),
    counts: {
      tasks: clampInteger(counts?.tasks, 0, 100000, 0),
      done: clampInteger(counts?.done, 0, 100000, 0),
      openFriction: clampInteger(counts?.openFriction, 0, 100000, 0),
      knowledgeLearned: clampInteger(counts?.knowledgeLearned, 0, 100000, 0),
    },
    taskDoneIds: readStringList(record.taskDoneIds, 800, 64),
    taskOpenIds: readStringList(record.taskOpenIds, 800, 64),
    openFrictionIds: readStringList(record.openFrictionIds, 400, 64),
    memoryVersion: clampInteger(record.memoryVersion, 0, 100000, 0),
    memoryDigest: {
      intro: sanitizeText(digest?.intro, 300),
      stack: readStringList(digest?.stack, 30, 40),
      decisions: readStringList(digest?.decisions, 40, 200),
    },
  }
}

/** `YYYY-MM-DD` 且必须是真实存在的日历日（挡掉 2026-02-31）。 */
function isRealDay(day: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  if (month < 1 || month > 12 || date < 1 || date > 31) return false
  const probe = new Date(year, month - 1, date)
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === date
}

/**
 * 草稿补丁清洗。
 *
 * 草稿会被直接交给 `applyMemoryPatch`，而后者假定数组里全是字符串。备份文件里
 * 的 `meta.memoryDrafts` 是用户可编辑的，所以在这个入口把形状焊死 —— 否则
 * `item.trim is not a function` 会在采纳草稿时把页面搞崩（审计 C2）。
 */
export function coerceDraftPatch(value: unknown): MemoryDraft['patch'] {
  const record = asRecord(value)
  if (record === undefined) return {}
  const patch: MemoryDraft['patch'] = {}

  const listFields = ['stack', 'done', 'openIssues', 'resolvedIssues', 'nextSteps'] as const
  for (const field of listFields) {
    const list = readStringList(record[field], 60, 300)
    if (list.length > 0) patch[field] = list
  }

  const intro = sanitizeText(record.intro, 600)
  if (intro !== '') patch.intro = intro
  const architecture = sanitizeText(record.architecture, 4000)
  if (architecture !== '') patch.architecture = architecture
  const progress = sanitizeText(record.progress, 800)
  if (progress !== '') patch.progress = progress

  if (Array.isArray(record.decisions)) {
    const decisions: Decision[] = []
    for (const item of record.decisions.slice(0, 60)) {
      const decision = coerceDecision(item)
      if (decision !== undefined) decisions.push(decision)
    }
    if (decisions.length > 0) patch.decisions = decisions
  }
  return patch
}

/** 日聚合。`day` 必须是合法的 `YYYY-MM-DD`。 */
export function coerceDaily(value: unknown): DailyAggregate | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const day = readString(record.day)
  if (day === undefined || !isRealDay(day)) return undefined
  return {
    day,
    focusMinutes: clampInteger(record.focusMinutes, 0, 24 * 60, 0),
    tasksDone: clampInteger(record.tasksDone, 0, 500, 0),
    sessions: clampInteger(record.sessions, 0, 2000, 0),
    friction: clampInteger(record.friction, 0, 500, 0),
  }
}

/** AI 审计记录。 */
export function coerceAiRun(value: unknown, now = Date.now()): AiRun | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const kind = ['daily', 'weekly', 'project', 'memory', 'knowledge'].find(item => item === record.kind)
  if (kind === undefined) return undefined
  const at = readTime(record.at, now, now)
  const run: AiRun = {
    id: readString(record.id) ?? `ai-${at}`,
    at,
    kind: kind as AiRun['kind'],
    provider: record.provider === 'openai-compatible' ? 'openai-compatible' : 'local',
    ok: record.ok === true,
    fallbackUsed: record.fallbackUsed === true,
  }
  const model = readString(record.model)
  if (model !== undefined) run.model = sanitizeTitle(model, 60)
  const code = ['no-config', 'network', 'timeout', 'bad-json', 'rate-limit', 'auth', 'unknown'].find(
    item => item === record.errorCode,
  )
  if (code !== undefined) run.errorCode = code as AiRun['errorCode']
  if (record.inputCharsApprox !== undefined) {
    run.inputCharsApprox = clampInteger(record.inputCharsApprox, 0, 10_000_000, 0)
  }
  if (record.outputChars !== undefined) {
    run.outputChars = clampInteger(record.outputChars, 0, 10_000_000, 0)
  }
  return run
}

/** 记忆草稿：只在 meta 里，同样要防脏数据。 */
export function coerceMemoryDrafts(value: unknown): Record<string, MemoryDraft> {
  const record = asRecord(value)
  if (record === undefined) return {}
  // 用 null 原型：即使 key 里有 __proto__，也只会变成一个普通属性，不会替换原型。
  const out: Record<string, MemoryDraft> = Object.create(null) as Record<string, MemoryDraft>
  for (const key of Object.keys(record).slice(0, 50)) {
    if (!isSafeKey(key)) continue
    const entry = asRecord(record[key])
    if (entry === undefined) continue
    const items = Array.isArray(entry.items)
      ? (entry.items as unknown[])
          .map(item => {
            const row = asRecord(item)
            const text = sanitizeText(row?.text, 300)
            const field = typeof row?.field === 'string' ? row.field : ''
            if (text === '' || field === '') return undefined
            return { field: field as MemoryDraft['items'][number]['field'], text, accepted: row?.accepted === true }
          })
          .filter((item): item is MemoryDraft['items'][number] => item !== undefined)
          .slice(0, 60)
      : []
    out[key] = {
      projectId: key,
      at: readTime(entry.at, Date.now()),
      source: entry.source === 'ai' ? 'ai' : 'logs',
      patch: coerceDraftPatch(entry.patch),
      rationale: sanitizeText(entry.rationale, 600),
      items,
    }
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * 按 key 分发
 * ──────────────────────────────────────────────────────────────────────────── */

function coerceList<T>(data: unknown, coerce: (item: unknown) => T | undefined, limit: number): T[] {
  if (!Array.isArray(data)) return []
  const out: T[] = []
  for (const item of data.slice(0, limit)) {
    try {
      const coerced = coerce(item)
      if (coerced !== undefined) out.push(coerced)
    } catch {
      // 单条坏数据只丢这一条，不影响整表（场景 10）。
    }
  }
  return out
}

/** 按存储键把原始数据洗成合法值。 */
export function coercePayload(key: StorageKey, data: unknown, now = Date.now()): unknown {
  switch (key) {
    case STORAGE_KEYS.tasks:
      return coerceList(data, item => coerceTask(item, now), MAX_TASK_ENTRIES)
    case STORAGE_KEYS.logs:
      return coerceList(data, item => coerceLog(item, now), MAX_LOG_ENTRIES)
    case STORAGE_KEYS.projects:
      return coerceList(data, item => coerceProject(item, now), BOARD_CONFIG.projects.maxProjects * 4)
    case STORAGE_KEYS.friction:
      return coerceList(data, item => coerceFriction(item, now), MAX_FRICTION_ENTRIES)
    case STORAGE_KEYS.settings:
      return coerceSettings(data, now)
    case STORAGE_KEYS.timer:
      return restoreTimerState(data, now).state
    case STORAGE_KEYS.meta:
      return coerceMeta(data)
    /* ── V4 ── */
    case STORAGE_KEYS.memory:
      return coerceList(data, item => coerceMemory(item, now), 60)
    case STORAGE_KEYS.knowledge:
      return coerceKnowledge(data, now)
    case STORAGE_KEYS.reviews:
      return coerceList(data, item => coerceReview(item, now), 2000)
    case STORAGE_KEYS.timeline:
      return coerceList(data, item => coerceTimelineEvent(item, now), 1200)
    case STORAGE_KEYS.history:
      return coerceList(data, item => coerceHistory(item, now), 240)
    case STORAGE_KEYS.daily:
      return coerceList(data, item => coerceDaily(item), 800)
    case STORAGE_KEYS.aiRuns:
      return coerceList(data, item => coerceAiRun(item, now), 100)
    default:
      return data
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 脏数据清理（需求 4.1.3）
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SanitizeReport {
  tasks: number
  logs: number
  friction: number
  /** 被丢弃的条数（NaN 时长、空标题、无效时间戳…）。 */
  dropped: number
  /** 是否真的改动过（没有改动就不回写存储）。 */
  changed: boolean
}

/**
 * 启动时跑一遍：把三个列表各自洗一次，并报告丢了多少。
 *
 * 与 `coercePayload` 的区别：这个函数返回**报告**，让调试面板能显示「本次清理
 * 掉了 3 条脏记录」，而不是静默处理。是否写回由调用方决定（只在 changed 时写）。
 */
export function sanitizeAll(input: { tasks: unknown; logs: unknown; friction: unknown }): {
  tasks: Task[]
  logs: SessionLog[]
  friction: FrictionRecord[]
  report: SanitizeReport
} {
  const rawTasks = Array.isArray(input.tasks) ? input.tasks : []
  const rawLogs = Array.isArray(input.logs) ? input.logs : []
  const rawFriction = Array.isArray(input.friction) ? input.friction : []

  const tasks = coerceList(rawTasks, item => coerceTask(item), MAX_TASK_ENTRIES)
  const logs = coerceList(rawLogs, item => coerceLog(item), MAX_LOG_ENTRIES)
  const friction = coerceList(rawFriction, item => coerceFriction(item), MAX_FRICTION_ENTRIES)

  const dropped =
    rawTasks.length - tasks.length + (rawLogs.length - logs.length) + (rawFriction.length - friction.length)

  return {
    tasks,
    logs,
    friction,
    report: { tasks: tasks.length, logs: logs.length, friction: friction.length, dropped, changed: dropped > 0 },
  }
}

/** 默认规则导出一次，避免别的模块重复 import detect。 */
export { DEFAULT_PROJECT_RULES }
