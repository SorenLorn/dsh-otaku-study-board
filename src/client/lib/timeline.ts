/**
 * timeline.ts — 时间轴事件（V4「开发时间机器」的事实层）。
 *
 * ── 三条硬规则 ────────────────────────────────────────────────────────────
 *   1. **白名单**：只有 `BoardEventType` 里的类型会被写入。别的模块想记一件事，
 *      必须先回答「它对回顾有没有价值」，再往白名单里加，而不是随手 push。
 *   2. **降噪去重**：同 `type + refId` 在 60 秒内只留一条（例如连续勾选/取消
 *      任务，不该产生四条事件）。
 *   3. **环形上限**：超过 1200 条丢最旧的，且磁盘上永远是「新→旧」排序，
 *      时间轴渲染不需要再排一次。
 *
 * 事件标题在写入时就渲染成短句（`task.completed` →「完成任务：重构 TaskList」），
 * 这样时间轴不必回查任务表 —— 任务被删了，历史照样读得懂。
 */
import type { BoardEventType, TimelineEvent } from '../types'
import { BOARD_CONFIG } from './config'
import { dayKey, startOfDay, startOfMonth, startOfWeek } from './time'

/** 事件类型 → 展示元数据（分类决定筛选条的颜色与分组）。 */
export const EVENT_META: Record<
  BoardEventType,
  { label: string; category: 'project' | 'task' | 'focus' | 'debug' | 'memory' | 'knowledge' }
> = {
  'project.created': { label: '项目创建', category: 'project' },
  'project.archived': { label: '项目归档', category: 'project' },
  'project.restored': { label: '项目解封', category: 'project' },
  'task.created': { label: '新建任务', category: 'task' },
  'task.completed': { label: '完成任务', category: 'task' },
  'task.reopened': { label: '任务重开', category: 'task' },
  'task.deleted': { label: '删除任务', category: 'task' },
  'focus.completed': { label: '专注完成', category: 'focus' },
  'log.debug': { label: '排错记录', category: 'debug' },
  'log.milestone': { label: '里程碑', category: 'debug' },
  'friction.created': { label: '出现阻碍', category: 'debug' },
  'friction.resolved': { label: '解决阻碍', category: 'debug' },
  'memory.updated': { label: '记忆更新', category: 'memory' },
  'decision.added': { label: '技术决策', category: 'memory' },
  'knowledge.learned': { label: '知识掌握', category: 'knowledge' },
  'knowledge.reviewed': { label: '知识复习', category: 'knowledge' },
  'history.snapshot': { label: '历史快照', category: 'memory' },
}

/** 所有类型（筛选条直接用）。 */
export const EVENT_TYPES = Object.keys(EVENT_META) as BoardEventType[]

export interface MakeEventInput {
  type: BoardEventType
  title: string
  projectId?: string
  refId?: string
  detail?: string
  at?: number
}

/** 造一条事件（不负责去重，去重在 `appendEvent` 里做）。 */
export function makeEvent(input: MakeEventInput, now = Date.now()): TimelineEvent {
  const at = input.at ?? now
  const event: TimelineEvent = {
    id: `evt-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at,
    type: input.type,
    title: input.title.slice(0, 120),
  }
  if (input.projectId !== undefined && input.projectId !== '') event.projectId = input.projectId
  if (input.refId !== undefined && input.refId !== '') event.refId = input.refId
  if (input.detail !== undefined) event.detail = input.detail.slice(0, 200)
  return event
}

export interface AppendResult {
  list: TimelineEvent[]
  /** false 表示被去重挡下（调用方不必提示）。 */
  added: boolean
}

/**
 * 追加一条事件（带降噪与截断）。
 *
 * @param list - 现有事件（新→旧）
 * @param event - 新事件
 * @returns 新数组 + 是否真的写入
 */
export function appendEvent(
  list: TimelineEvent[],
  event: TimelineEvent,
  options: { dedupeMs?: number; maxEvents?: number } = {},
): AppendResult {
  const dedupeMs = options.dedupeMs ?? BOARD_CONFIG.timeline.dedupeMs
  const maxEvents = options.maxEvents ?? BOARD_CONFIG.timeline.maxEvents
  /**
   * 去重键必须带 projectId：任务 id 在不同项目里是独立的，但「同类型 + 同 refId」
   * 如果不分项目，两个项目在同一分钟完成同 id 任务时，第二条会被静默吞掉（审计 F2）。
   */
  const key = `${event.type}|${event.projectId ?? ''}|${event.refId ?? ''}`
  const keyOf = (item: TimelineEvent): string => `${item.type}|${item.projectId ?? ''}|${item.refId ?? ''}`

  for (const item of list) {
    if (Math.abs(item.at - event.at) > dedupeMs) continue
    if (keyOf(item) === key) return { list, added: false }
  }

  // 保持「新→旧」不变式：乱序写入（导入、补录）时插到正确位置，
  // 否则头部会变成较旧的事件，去重窗口与时间轴展示都会错位（审计 F1）。
  const index = list.findIndex(item => item.at <= event.at)
  const next = index < 0 ? [...list, event] : [...list.slice(0, index), event, ...list.slice(index)]
  return { list: next.length > maxEvents ? next.slice(0, maxEvents) : next, added: true }
}

export type RangeMode = 'day' | 'week' | 'month'

/** 范围 → [from, to]（闭区间）。 */
export function rangeOf(mode: RangeMode, anchor: number, now = Date.now()): { from: number; to: number } {
  void now
  const base = anchor
  if (mode === 'day') {
    const from = startOfDay(base)
    return { from, to: from + 86_400_000 - 1 }
  }
  if (mode === 'week') {
    const from = startOfWeek(base)
    return { from, to: from + 7 * 86_400_000 - 1 }
  }
  const from = startOfMonth(base)
  const next = new Date(from)
  next.setMonth(next.getMonth() + 1)
  return { from, to: next.getTime() - 1 }
}

export interface EventFilter {
  from?: number
  to?: number
  types?: BoardEventType[]
  projectId?: string
}

/** 过滤（全部条件是「与」关系）。 */
export function filterEvents(list: TimelineEvent[], filter: EventFilter): TimelineEvent[] {
  const typeSet = filter.types === undefined || filter.types.length === 0 ? undefined : new Set(filter.types)
  return list.filter(event => {
    if (filter.from !== undefined && event.at < filter.from) return false
    if (filter.to !== undefined && event.at > filter.to) return false
    if (typeSet !== undefined && !typeSet.has(event.type)) return false
    if (filter.projectId !== undefined && filter.projectId !== '') {
      if ((event.projectId ?? '') !== filter.projectId) return false
    }
    return true
  })
}

/** 按天分组（用于时间轴的分段标题）。 */
export function groupByDay(list: TimelineEvent[]): Array<{ day: string; events: TimelineEvent[] }> {
  const map = new Map<string, TimelineEvent[]>()
  for (const event of list) {
    const key = dayKey(event.at)
    const bucket = map.get(key)
    if (bucket === undefined) map.set(key, [event])
    else bucket.push(event)
  }
  return [...map.entries()].map(([day, events]) => ({ day, events }))
}

/** 统计每个分类的事件数（筛选条上的角标）。 */
export function countByCategory(list: TimelineEvent[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const event of list) {
    const category = EVENT_META[event.type].category
    out[category] = (out[category] ?? 0) + 1
  }
  return out
}
