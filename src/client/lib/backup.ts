/**
 * Backup — 导出 / 导入（V3：增量导出 + 冲突预览 + 合并/覆盖两种模式）。
 *
 * 全部数据都在 localStorage，一次「清除站点数据」就能抹掉几个月的记录。这个
 * 模块是唯一的逃生口，所以规则写得比较死：
 *
 *   • `kind` 必须匹配，`version` 1/2/3 都接受（字段全部可选，缺的走默认）；
 *   • 每条记录导入前都过 `coerce*`，手改过的文件不能注入组件吃不下的形状；
 *   • **默认合并**，覆盖必须先看冲突预览（需求 2.3.2）；
 *   • timer 永不导出：恢复一个「声称正在跑」的倒计时比没有倒计时更糟。
 */
import type {
  BackupPayload,
  BackupScope,
  BoardMeta,
  BoardSettings,
  DailyAggregate,
  FrictionRecord,
  HistorySnapshot,
  ImportMode,
  ImportPreview,
  KnowledgeGraph,
  Project,
  ProjectMemory,
  ReviewRecord,
  SessionLog,
  Task,
  TimelineEvent,
} from '../types'
import { BACKUP_SCOPE_LABELS } from './config'
import { warn } from './debug'
import { createDefaultMeta, createDefaultSettings } from './defaults'
import {
  coerceDaily,
  coerceFriction,
  coerceMeta,
  coerceHistory,
  coerceKnowledge,
  coerceLog,
  coerceMemory,
  coerceProject,
  coerceReview,
  coerceSettings,
  coerceTask,
  coerceTimelineEvent,
} from './schema'
import { pruneSnapshots } from './history'
import { dayKey, startOfMonth } from './time'

/** 导入硬上限：8 MB 字符（≈ 4 MB UTF-8 中文文本）。 */
export const MAX_IMPORT_CHARS = 8_000_000

/** 文件名：带范围与到秒的时间戳，避免一天内多次导出互相覆盖。 */
export function backupFileName(scope: BackupScope = 'all', now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `sorchron-board-backup-${scope}-${stamp}.json`
}

/** 范围 → 起始时间戳（`all` 返回 0）。 */
export function scopeCutoff(scope: BackupScope, now = Date.now()): number {
  if (scope === 'week') return now - 7 * 24 * 60 * 60 * 1000
  if (scope === 'month') return startOfMonth(now)
  return 0
}

export interface ScopeFiltered {
  tasks: Task[]
  logs: SessionLog[]
  friction: FrictionRecord[]
  /* ── V4（`all` 时原样带出） ── */
  memory?: ProjectMemory[]
  knowledge?: KnowledgeGraph
  reviews?: ReviewRecord[]
  timeline?: TimelineEvent[]
  history?: HistorySnapshot[]
  daily?: DailyAggregate[]
}

/**
 * 增量导出（需求 2.3.1）。
 *
 * 任务用「三选一」判断是否算「近期」：创建过、完成过、或改动过。只看 createdAt
 * 会把「上周建、今天完成」的任务漏掉 —— 那恰恰是最该导出的。
 *
 * 项目不按时间筛（数量本来就少），但去掉已归档的（归档数据不参与日常统计，
 * 也就不必进增量包）。
 */
export function filterByScope(
  input: {
    tasks: Task[]
    logs: SessionLog[]
    friction: FrictionRecord[]
    projects: Project[]
    /* V4 可选：没传就不进增量包 */
    memory?: ProjectMemory[]
    knowledge?: KnowledgeGraph
    reviews?: ReviewRecord[]
    timeline?: TimelineEvent[]
    history?: HistorySnapshot[]
    daily?: DailyAggregate[]
  },
  scope: BackupScope,
  now = Date.now(),
): ScopeFiltered {
  if (scope === 'all') {
    const all: ScopeFiltered = { tasks: input.tasks, logs: input.logs, friction: input.friction }
    if (input.memory !== undefined) all.memory = input.memory
    if (input.knowledge !== undefined) all.knowledge = input.knowledge
    if (input.reviews !== undefined) all.reviews = input.reviews
    if (input.timeline !== undefined) all.timeline = input.timeline
    if (input.history !== undefined) all.history = input.history
    if (input.daily !== undefined) all.daily = input.daily
    return all
  }

  const cutoff = scopeCutoff(scope, now)
  const cutoffDay = dayKey(cutoff)
  const filtered: ScopeFiltered = {
    tasks: input.tasks.filter(task => {
      if (task.createdAt >= cutoff) return true
      if (task.completedAt !== undefined && task.completedAt >= cutoff) return true
      return task.updatedAt >= cutoff
    }),
    logs: input.logs.filter(log => log.at >= cutoff),
    friction: input.friction.filter(record => record.at >= cutoff || record.updatedAt >= cutoff),
  }

  // 记忆与知识图谱是「活文档」，按时间切会把一个项目切成半份，所以整体带出。
  if (input.memory !== undefined) filtered.memory = input.memory
  if (input.knowledge !== undefined) filtered.knowledge = input.knowledge
  if (input.reviews !== undefined) filtered.reviews = input.reviews.filter(item => item.at >= cutoff)
  if (input.timeline !== undefined) filtered.timeline = input.timeline.filter(item => item.at >= cutoff)
  if (input.history !== undefined) filtered.history = input.history.filter(item => item.at >= cutoff)
  if (input.daily !== undefined) filtered.daily = input.daily.filter(item => item.day >= cutoffDay)
  return filtered
}

/** Assemble the envelope. */
export function buildBackup(input: {
  tasks: Task[]
  logs: SessionLog[]
  projects: Project[]
  settings: BoardSettings
  friction: FrictionRecord[]
  meta: BoardMeta
  scope?: BackupScope
  now?: number
  /* ── V4 六个实体：可选入参，但**始终写进文件**（缺省给空值，见下方注释） ── */
  memory?: ProjectMemory[]
  knowledge?: KnowledgeGraph
  reviews?: ReviewRecord[]
  timeline?: TimelineEvent[]
  history?: HistorySnapshot[]
  daily?: DailyAggregate[]
}): BackupPayload {
  const payload: BackupPayload = {
    kind: 'sorchron-study-board-backup',
    version: 4,
    exportedAt: input.now ?? Date.now(),
    scope: input.scope ?? 'all',
    tasks: input.tasks,
    logs: input.logs,
    projects: input.projects,
    settings: input.settings,
    friction: input.friction,
    meta: input.meta,
  }
  /**
   * 六个 V4 字段**总是写进文件**（没有就给空值）。
   *
   * 为什么不用「有才写」：那样调用方漏传一个字段就变成静默丢数据，而且从文件里
   * 看不出来（审计 B1 就是这么暴露的）。恒定字段也让「这份备份有没有新实体」
   * 一眼可判。
   */
  payload.memory = input.memory ?? []
  payload.knowledge = input.knowledge ?? { nodes: [], edges: [] }
  payload.reviews = input.reviews ?? []
  payload.timeline = input.timeline ?? []
  payload.history = input.history ?? []
  payload.daily = input.daily ?? []
  return payload
}

/** Serialise with indentation — the file is meant to be human-readable. */
export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Import validation
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 解析报告：文件里**原本**的版本与被丢弃的坏记录数。
 *
 * 为什么单独一个字段而不是塞进 payload：`payload.version` 是「当前 schema 版本」，
 * 写入端恒为 4；而用户需要知道「这份文件是哪个版本导出的」。混在一起会让
 * 预览界面把一份 v2 备份显示成 v4。
 */
export interface ImportReport {
  /** 文件自带的 version；没有或非法时为 0。 */
  sourceVersion: number
  /** 被 coerce* 拒绝并丢弃的记录数（按实体分组）。 */
  dropped: {
    tasks: number
    logs: number
    projects: number
    friction: number
    memory: number
    reviews: number
    timeline: number
    history: number
    daily: number
  }
}

export type ParseResult =
  | { ok: true; payload: BackupPayload; report: ImportReport }
  | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readScope(value: unknown): BackupScope | undefined {
  if (value === 'all' || value === 'week' || value === 'month') return value
  return undefined
}

/** Accept a backup file's text, or explain precisely why it was refused. */
export function parseBackup(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: '文件不是合法的 JSON' }
  }

  // 体积上限：整份文件读进内存再解析，超大文件会直接把页面卡死。
  if (raw.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: `备份文件过大（${Math.round(raw.length / 1024)} KB，上限 ${MAX_IMPORT_CHARS / 1024} KB）` }
  }

  const record = asRecord(parsed)
  if (record === undefined) return { ok: false, error: '文件内容不是一个对象' }
  if (record.kind !== 'sorchron-study-board-backup') {
    return { ok: false, error: '不是溯时学习工作台的备份文件（kind 不匹配）' }
  }
  if (!Array.isArray(record.tasks) || !Array.isArray(record.logs)) {
    return { ok: false, error: '备份缺少 tasks / logs 数组' }
  }
  /**
   * 条数上限：**拒绝**而不是截断。
   *
   * 静默截断会让用户以为「恢复成功」，实际少了一半数据 —— 那是最坏的失败方式。
   * 上限与运行时一致（tasks 500 / logs 400 / friction 200 / projects 96），
   * 正常使用不可能超。
   */
  if (record.tasks.length > 500) {
    return { ok: false, error: `任务数量超出上限（${record.tasks.length} > 500），请拆分备份` }
  }
  if (record.logs.length > 400) {
    return { ok: false, error: `日志数量超出上限（${record.logs.length} > 400），请先清理或拆分备份` }
  }
  if (Array.isArray(record.friction) && record.friction.length > 200) {
    return { ok: false, error: `阻碍记录超出上限（${record.friction.length} > 200）` }
  }
  if (Array.isArray(record.projects) && record.projects.length > 96) {
    return { ok: false, error: `项目数量超出上限（${record.projects.length} > 96）` }
  }

  /**
   * V4 实体同样**拒绝**而不是截断（第二轮审计 NEW-09）。
   * 之前 coerceKnowledge / slice 会把超量数据静默砍掉，用户以为恢复成功、实际少了一半。
   */
  const v4Limits: Array<{ key: string; label: string; limit: number }> = [
    { key: 'memory', label: '项目记忆', limit: 60 },
    { key: 'reviews', label: '复习记录', limit: 2000 },
    { key: 'timeline', label: '时间轴事件', limit: 1200 },
    { key: 'history', label: '历史快照', limit: 240 },
    { key: 'daily', label: '日聚合', limit: 800 },
  ]
  for (const entry of v4Limits) {
    const value = record[entry.key]
    if (Array.isArray(value) && value.length > entry.limit) {
      return { ok: false, error: `${entry.label}超出上限（${value.length} > ${entry.limit}），请先清理或拆分备份` }
    }
  }
  const knowledgeRecord = asRecord(record.knowledge)
  if (knowledgeRecord !== undefined) {
    if (Array.isArray(knowledgeRecord.nodes) && knowledgeRecord.nodes.length > 500) {
      return { ok: false, error: `知识节点超出上限（${knowledgeRecord.nodes.length} > 500）` }
    }
    if (Array.isArray(knowledgeRecord.edges) && knowledgeRecord.edges.length > 900) {
      return { ok: false, error: `知识关系超出上限（${knowledgeRecord.edges.length} > 900）` }
    }
  }

  const rawTaskCount = record.tasks.length
  const rawLogCount = record.logs.length
  const rawProjects = Array.isArray(record.projects) ? (record.projects as unknown[]) : []
  const rawFriction = Array.isArray(record.friction) ? (record.friction as unknown[]) : []
  const rawMemory = Array.isArray(record.memory) ? (record.memory as unknown[]) : []
  const rawReviews = Array.isArray(record.reviews) ? (record.reviews as unknown[]) : []
  const rawTimeline = Array.isArray(record.timeline) ? (record.timeline as unknown[]) : []
  const rawHistory = Array.isArray(record.history) ? (record.history as unknown[]) : []
  const rawDaily = Array.isArray(record.daily) ? (record.daily as unknown[]) : []

  const tasks = (record.tasks as unknown[])
    .map(item => coerceTask(item))
    .filter((task): task is Task => task !== undefined)
  const logs = (record.logs as unknown[])
    .map(item => coerceLog(item))
    .filter((log): log is SessionLog => log !== undefined)
  const projects = rawProjects
    .map(item => coerceProject(item))
    .filter((item): item is Project => item !== undefined)
  const friction = rawFriction
    .map(item => coerceFriction(item))
    .filter((item): item is FrictionRecord => item !== undefined)

  /* ── V4 实体：缺失即空，条数上限与运行时一致 ── */
  const memory = rawMemory
    .map(item => coerceMemory(item))
    .filter((item): item is ProjectMemory => item !== undefined)
    .slice(0, 60)
  const knowledge = coerceKnowledge(record.knowledge)
  const reviews = rawReviews
    .map(item => coerceReview(item))
    .filter((item): item is ReviewRecord => item !== undefined)
    .slice(0, 2000)
  const timeline = rawTimeline
    .map(item => coerceTimelineEvent(item))
    .filter((item): item is TimelineEvent => item !== undefined)
    .slice(0, 1200)
  const history = rawHistory
    .map(item => coerceHistory(item))
    .filter((item): item is HistorySnapshot => item !== undefined)
    .slice(0, 240)
  const daily = rawDaily
    .map(item => coerceDaily(item))
    .filter((item): item is DailyAggregate => item !== undefined)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .slice(-800)

  const settings = coerceSettings(record.settings)
  /**
   * 用 `coerceMeta` 而不是手搓 `{ sessionTaskMap }`：手搓会丢掉
   * `memoryDrafts` / `upgradedFrom` / `lastWeeklyAt`（第二轮审计 NEW-02），
   * 其中草稿是用户还没确认的工作，丢了就真没了。
   */
  const meta: BoardMeta = asRecord(record.meta) === undefined ? createDefaultMeta() : coerceMeta(record.meta)

  const scope = readScope(record.scope)
  warn('backup', `import parsed: ${tasks.length} tasks / ${logs.length} logs / ${friction.length} friction`)

  const sourceVersion = typeof record.version === 'number' && Number.isFinite(record.version) ? record.version : 0

  return {
    ok: true,
    report: {
      sourceVersion,
      dropped: {
        tasks: rawTaskCount - tasks.length,
        logs: rawLogCount - logs.length,
        projects: rawProjects.length - projects.length,
        friction: rawFriction.length - friction.length,
        memory: rawMemory.length - memory.length,
        reviews: rawReviews.length - reviews.length,
        timeline: rawTimeline.length - timeline.length,
        history: rawHistory.length - history.length,
        daily: rawDaily.length - daily.length,
      },
    },
    payload: {
      kind: 'sorchron-study-board-backup',
      version: 4,
      exportedAt: num(record.exportedAt, Date.now()),
      ...(scope === undefined ? {} : { scope }),
      tasks,
      logs,
      projects,
      settings,
      friction,
      meta,
      /* V4：即使为空也显式带出，导入端据此判断「这份文件有没有新实体」 */
      memory,
      knowledge,
      reviews,
      timeline,
      history,
      daily,
    },
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 冲突预览与合并（需求 2.3.2）
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LocalSnapshot {
  tasks: Task[]
  logs: SessionLog[]
  projects: Project[]
  friction: FrictionRecord[]
  /* ── V4（可选：老调用方不传也能工作） ── */
  memory?: ProjectMemory[]
  knowledge?: KnowledgeGraph
  reviews?: ReviewRecord[]
  timeline?: TimelineEvent[]
  history?: HistorySnapshot[]
  daily?: DailyAggregate[]
}

function countConflicts<T extends { id: string }>(local: T[], incoming: T[]): number {
  const map = new Map(local.map(item => [item.id, item]))
  let conflicts = 0
  for (const item of incoming) {
    const existing = map.get(item.id)
    if (existing === undefined) continue
    // 内容一致不算冲突（只是同一条被重复导出）。
    if (JSON.stringify(existing) !== JSON.stringify(item)) conflicts += 1
  }
  return conflicts
}

/**
 * 导入前先算一份预览：双方各有几条、有多少 id 冲突。
 *
 * 这一步不做任何写入 —— UI 拿它渲染确认框，用户确认后才真正落库。
 */
export function previewImport(
  local: LocalSnapshot,
  incoming: BackupPayload,
  mode: ImportMode = 'merge',
): ImportPreview {
  return {
    mode,
    incoming: {
      tasks: incoming.tasks.length,
      logs: incoming.logs.length,
      projects: incoming.projects.length,
      friction: incoming.friction.length,
    },
    local: {
      tasks: local.tasks.length,
      logs: local.logs.length,
      projects: local.projects.length,
      friction: local.friction.length,
    },
    conflicts: {
      tasks: countConflicts(local.tasks, incoming.tasks),
      logs: countConflicts(local.logs, incoming.logs),
      projects: countConflicts(local.projects, incoming.projects),
      friction: countConflicts(local.friction, incoming.friction),
    },
    exportedAt: incoming.exportedAt,
    ...(incoming.scope === undefined ? {} : { scope: incoming.scope }),
    extra: {
      memory: incoming.memory?.length ?? 0,
      knowledge: incoming.knowledge?.nodes.length ?? 0,
      reviews: incoming.reviews?.length ?? 0,
      timeline: incoming.timeline?.length ?? 0,
      history: incoming.history?.length ?? 0,
      daily: incoming.daily?.length ?? 0,
    },
  }
}

/**
 * 按 id 合并：备份里的同 id 记录**覆盖**本地，其余保留。
 *
 * 为什么不是「保留本地优先」：用户导入备份通常是想「恢复成备份里的样子」，
 * 保留本地会让恢复不彻底；而新增的本地记录又不想丢，所以做成合并。
 * 真正想要完全一致的用户会选「覆盖导入」。
 */
function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const incomingIds = new Set(incoming.map(item => item.id))
  return [...incoming, ...local.filter(item => !incomingIds.has(item.id))]
}

/**
 * 记忆合并：同一个项目取版本更高的那一份。
 *
 * 为什么不是「备份覆盖本地」：记忆是累积文档，用一份旧备份覆盖掉更新的记忆
 * 等于丢工作量；版本号就是用来判新的。
 */
function mergeMemory(local: ProjectMemory[], incoming: ProjectMemory[]): ProjectMemory[] {
  const map = new Map(local.map(item => [item.projectId, item]))
  for (const item of incoming) {
    const existing = map.get(item.projectId)
    if (existing === undefined || item.version >= existing.version) map.set(item.projectId, item)
  }
  return [...map.values()]
}

/** 图谱合并：节点按 id 覆盖，边按语义去重（related 无向）。 */
function mergeGraph(local: KnowledgeGraph, incoming: KnowledgeGraph): KnowledgeGraph {
  const nodes = new Map(local.nodes.map(node => [node.id, node]))
  for (const node of incoming.nodes) nodes.set(node.id, node)

  const edges = new Map<string, KnowledgeGraph['edges'][number]>()
  const keyOf = (edge: KnowledgeGraph['edges'][number]): string =>
    edge.kind === 'related'
      ? `r|${[edge.fromId, edge.toId].sort().join('|')}`
      : `p|${edge.fromId}|${edge.toId}`
  for (const edge of [...local.edges, ...incoming.edges]) {
    if (!nodes.has(edge.fromId) || !nodes.has(edge.toId)) continue
    edges.set(keyOf(edge), edge)
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

/** 日聚合合并：同一天以备份为准（备份是「恢复」，不是「累加」）。 */
function mergeDaily(local: DailyAggregate[], incoming: DailyAggregate[]): DailyAggregate[] {
  const map = new Map(local.map(item => [item.day, item]))
  for (const item of incoming) map.set(item.day, item)
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

export interface MergeResult extends LocalSnapshot {
  settings: BoardSettings
  meta: BoardMeta
}

/**
 * 生成合并结果。
 *
 * @param mode - `merge` 按 id 合并；`overwrite` 整体替换（本地独有的记录会被丢弃）
 */
export function applyImport(
  local: LocalSnapshot & { settings: BoardSettings; meta: BoardMeta },
  incoming: BackupPayload,
  mode: ImportMode,
  now = Date.now(),
): MergeResult {
  const settings: BoardSettings = coerceSettings(
    mode === 'overwrite' ? incoming.settings : { ...local.settings, ...incoming.settings },
    now,
  )
  const meta: BoardMeta =
    mode === 'overwrite'
      ? incoming.meta
      : {
          ...local.meta,
          ...incoming.meta,
          sessionTaskMap: { ...local.meta.sessionTaskMap, ...incoming.meta.sessionTaskMap },
        }

  if (mode === 'overwrite') {
    return {
      tasks: incoming.tasks,
      logs: [...incoming.logs].sort((a, b) => b.at - a.at),
      projects: incoming.projects,
      friction: incoming.friction,
      memory: incoming.memory ?? [],
      knowledge: incoming.knowledge ?? { nodes: [], edges: [] },
      reviews: incoming.reviews ?? [],
      timeline: [...(incoming.timeline ?? [])].sort((a, b) => b.at - a.at).slice(0, 1200),
      // 覆盖导入也必须服从「每项目 12 个」的上限
      history: pruneSnapshots(incoming.history ?? []),
      daily: incoming.daily ?? [],
      settings,
      meta,
    }
  }

  return {
    tasks: mergeById(local.tasks, incoming.tasks),
    logs: mergeById(local.logs, incoming.logs).sort((a, b) => b.at - a.at),
    projects: mergeById(local.projects, incoming.projects),
    friction: mergeById(local.friction, incoming.friction),
    memory: mergeMemory(local.memory ?? [], incoming.memory ?? []),
    knowledge: mergeGraph(local.knowledge ?? { nodes: [], edges: [] }, incoming.knowledge ?? { nodes: [], edges: [] }),
    reviews: mergeById(local.reviews ?? [], incoming.reviews ?? []),
    timeline: mergeById(local.timeline ?? [], incoming.timeline ?? [])
      .sort((a, b) => b.at - a.at)
      .slice(0, 1200),
    history: pruneSnapshots(mergeById(local.history ?? [], incoming.history ?? [])),
    daily: mergeDaily(local.daily ?? [], incoming.daily ?? []),
    settings,
    meta,
  }
}

/** 预览 → 一句人话，直接用在国际提示里。 */
export function describePreview(preview: ImportPreview): string {
  const scopeText = preview.scope === undefined ? '' : `（${BACKUP_SCOPE_LABELS[preview.scope]}）`
  const conflictTotal =
    preview.conflicts.tasks + preview.conflicts.logs + preview.conflicts.projects + preview.conflicts.friction
  const extra = preview.extra
  const extraText =
    extra === undefined
      ? ''
      : ` 记忆 ${extra.memory} · 知识 ${extra.knowledge} · 复习 ${extra.reviews} · 事件 ${extra.timeline} · 快照 ${extra.history} · 日聚合 ${extra.daily}。`

  if (preview.mode === 'overwrite') {
    return `将用备份${scopeText}整体替换：${preview.incoming.tasks} 个任务、${preview.incoming.logs} 条日志。本地 ${conflictTotal > 0 ? `${conflictTotal} 条同 id 记录会被覆盖` : '数据会被清空'}。${extraText}`
  }
  return `将合并备份${scopeText}：新增约 ${Math.max(0, preview.incoming.tasks - preview.conflicts.tasks)} 个任务、${Math.max(0, preview.incoming.logs - preview.conflicts.logs)} 条日志；${conflictTotal} 条同 id 记录以备份为准。${extraText}`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Browser I/O
 * ──────────────────────────────────────────────────────────────────────────── */

/** Push a string to the user's downloads folder. */
export function downloadText(fileName: string, text: string, mime = 'application/json'): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Give the click a tick to start before the blob is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch (error) {
    warn('backup', 'download failed', error)
    return false
  }
}

/** Read a picked file as UTF-8 text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsText(file, 'utf-8')
  })
}

/** 清空时用的设置（保留默认值，不是空对象）。 */
export function settingsAfterClear(): BoardSettings {
  return createDefaultSettings()
}
