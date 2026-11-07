/**
 * friction.ts — 开发阻碍的识别、合并与量化（需求 3.4）。
 *
 * 「阻碍」和「调试日志」不是一回事：
 *   • 调试日志是**流水**（每处理一次报错就可能有一条）；
 *   • 阻碍记录是**问题**（同一个坑踩了五次，应该只有一条，`hits` 涨到 5）。
 *
 * 所以这里做两件事：从日志里认出「这是个阻碍」，以及用相似度把重复的坑合并掉。
 * 合并用 bigram 相似度而不是精确哈希 —— 每次堆栈的行号都会变，但主干是同一句。
 */
import type { FrictionRecord, SessionLog } from '../types'
import { BOARD_CONFIG } from './config'
import { summarizeError, type LogDraft } from './detect'
import { similarity } from './hash'

/** 相似度阈值：低于这个值就算两个不同的问题。 */
export const SIMILARITY_THRESHOLD = 0.55

/** 一条日志是否够格成为阻碍记录。 */
export function isFrictionCandidate(log: Pick<SessionLog, 'sessionType' | 'kind' | 'title'>): boolean {
  if (log.kind === 'focus') return false
  if (log.kind === 'friction') return false
  if (log.sessionType !== 'debug') return false
  return log.title.trim() !== ''
}

export interface BuildFrictionOptions {
  projectId?: string
  taskId?: string
  sessionId?: string
  logId?: string
  now?: number
}

/**
 * 从一条日志草稿生成阻碍记录的草表（还没有 id）。
 *
 * @returns `undefined` 表示「这不是阻碍」，调用方直接跳过
 */
export function buildFrictionDraft(
  draft: LogDraft,
  options: BuildFrictionOptions = {},
): Omit<FrictionRecord, 'id'> | undefined {
  if (!isFrictionCandidate(draft)) return undefined
  const at = options.now ?? draft.at
  const summary = summarizeError(draft.detail ?? draft.title)
  if (summary.trim() === '') return undefined

  const record: Omit<FrictionRecord, 'id'> = {
    at,
    updatedAt: at,
    summary: summary.slice(0, 160),
    hits: 1,
    resolved: false,
  }
  if (draft.detail !== undefined) record.detail = draft.detail.slice(0, 300)
  if (options.projectId !== undefined && options.projectId !== '') record.projectId = options.projectId
  else if (draft.projectId !== undefined) record.projectId = draft.projectId
  if (options.taskId !== undefined && options.taskId !== '') record.taskId = options.taskId
  else if (draft.taskId !== undefined) record.taskId = draft.taskId
  if (options.sessionId !== undefined && options.sessionId !== '') record.sessionId = options.sessionId
  else if (draft.sessionId !== undefined) record.sessionId = draft.sessionId
  if (options.logId !== undefined) record.logId = options.logId
  return record
}

/**
 * 合并进已有列表。
 *
 * 匹配规则（按顺序）：
 *   1. 同一个项目（避免把两个项目的同名报错并成一条）；
 *   2. 7 天内；
 *   3. 相似度 ≥ {@link SIMILARITY_THRESHOLD}。
 *
 * 命中就把 `hits + 1`、`at` 更新为最新时间 —— 但**不覆盖**已经填好的解决方案，
 * 那是用户的知识，不能被后续事件冲掉。
 */
export function mergeFriction(
  records: FrictionRecord[],
  incoming: Omit<FrictionRecord, 'id'>,
  now = Date.now(),
): { records: FrictionRecord[]; merged: boolean; id: string } {
  const windowStart = now - BOARD_CONFIG.friction.weekMs
  const hitIndex = records.findIndex(record => {
    if (record.at < windowStart) return false
    if ((record.projectId ?? '') !== (incoming.projectId ?? '')) return false
    return similarity(record.summary, incoming.summary) >= SIMILARITY_THRESHOLD
  })

  if (hitIndex >= 0) {
    const existing = records[hitIndex]
    if (existing === undefined) {
      // 理论上不会发生（findIndex 已经确认存在），保持函数全路径安全。
      const id = `friction-${now.toString(36)}`
      const next: FrictionRecord = { ...incoming, id }
      return { records: [next, ...records], merged: false, id }
    }
    const next: FrictionRecord = {
      ...existing,
      hits: existing.hits + 1,
      at: Math.max(existing.at, incoming.at),
      updatedAt: now,
    }
    // 只有原本为空时才补 detail / taskId，避免覆盖人工补充的信息。
    if (next.detail === undefined && incoming.detail !== undefined) next.detail = incoming.detail
    if (next.taskId === undefined && incoming.taskId !== undefined) next.taskId = incoming.taskId
    if (next.logId === undefined && incoming.logId !== undefined) next.logId = incoming.logId
    const copy = [...records]
    copy[hitIndex] = next
    return { records: copy, merged: true, id: next.id }
  }

  const id = `friction-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const next: FrictionRecord = { ...incoming, id }
  return { records: [next, ...records].slice(0, BOARD_CONFIG.friction.maxRecords), merged: false, id }
}

/**
 * 标记解决并写解决方案。
 *
 * `resolveMs` 只在第一次标记解决时计算（再次编辑不重算），这样「平均耗时」
 * 反映的是真实的首次定位时间。
 */
export function resolveFriction(
  records: FrictionRecord[],
  id: string,
  solution: string,
  now = Date.now(),
): FrictionRecord[] {
  return records.map(record => {
    if (record.id !== id) return record
    const resolved = solution.trim() !== ''
    const next: FrictionRecord = {
      ...record,
      solution: solution.trim(),
      resolved,
      updatedAt: now,
    }
    if (resolved && record.resolveMs === undefined) {
      next.resolveMs = Math.max(BOARD_CONFIG.friction.minResolveMs, now - record.at)
    }
    if (!resolved) {
      next.resolved = false
      delete next.resolveMs
    }
    return next
  })
}

/** 删除一条阻碍记录（UI 会先二次确认）。 */
export function removeFriction(records: FrictionRecord[], id: string): FrictionRecord[] {
  return records.filter(record => record.id !== id)
}

export interface FrictionStats {
  /** 本周新增 + 复发的次数。 */
  weekHits: number
  /** 本周涉及的不同问题数。 */
  weekProblems: number
  /** 未解决的问题数。 */
  open: number
  /** 反复踩坑（hits ≥ 阈值）的问题数。 */
  repeated: number
  /** 平均解决耗时（毫秒）；没有样本时为 0。 */
  avgResolveMs: number
  /** 最常复发的一条。 */
  worst?: FrictionRecord
}

/**
 * 量化开发效率（需求 3.4.3）。
 *
 * 「单次问题平均耗时」用 `resolveMs` 的样本平均；没有样本时退化为
 * 「已解决问题里（最后更新 - 首次出现）」的平均值，仍然没有就返回 0 ——
 * 显示 0 比显示一个编造的数字诚实。
 */
export function frictionStats(records: FrictionRecord[], now = Date.now()): FrictionStats {
  const windowStart = now - BOARD_CONFIG.friction.weekMs
  const weekRecords = records.filter(record => record.at >= windowStart)

  const samples: number[] = []
  let fallbackTotal = 0
  let fallbackCount = 0
  for (const record of records) {
    if (!record.resolved) continue
    if (record.resolveMs !== undefined) samples.push(record.resolveMs)
    else {
      fallbackTotal += Math.max(0, record.updatedAt - record.at)
      fallbackCount += 1
    }
  }
  const avgResolveMs =
    samples.length > 0
      ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : fallbackCount > 0
        ? Math.round(fallbackTotal / fallbackCount)
        : 0

  let weekHits = 0
  for (const record of weekRecords) weekHits += record.hits

  const worst = [...records].sort((a, b) => b.hits - a.hits)[0]

  return {
    weekHits,
    weekProblems: weekRecords.length,
    open: records.filter(record => !record.resolved).length,
    repeated: records.filter(record => record.hits >= BOARD_CONFIG.friction.repeatThreshold).length,
    avgResolveMs,
    ...(worst === undefined ? {} : { worst }),
  }
}

/** 毫秒 → `1h 20m` / `12m` / `不到 1 分钟`。 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
