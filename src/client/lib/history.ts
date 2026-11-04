/**
 * history.ts — 真实历史快照与两个时间点的对比（V4 §四.2）。
 *
 * ── 为什么必须「真实取样」─────────────────────────────────────────────────
 * 需求明确：不能拿当前数据假装历史。所以每次快照都存下当时的 **id 集合**与
 * **记忆摘要**；对比时只做集合运算，不反推、不估算。
 *
 * ── 为什么只存 id 不存对象 ────────────────────────────────────────────────
 * 存全量对象会让单个快照几百 KB，12 个就撑爆 localStorage。而「对比」需要的
 * 只是「谁在 / 谁不在 / 谁从 open 变成 done」，id 就够；要看详情，点回原始记录。
 */
import type {
  FrictionRecord,
  HistoryDiff,
  HistorySnapshot,
  KnowledgeGraph,
  Project,
  ProjectMemory,
  Task,
} from '../types'
import { BOARD_CONFIG } from './config'
import { memoryDigest } from './memory'

export interface BuildHistoryInput {
  project: Project
  tasks: Task[]
  friction: FrictionRecord[]
  memory?: ProjectMemory
  knowledge?: KnowledgeGraph
  label?: string
  now?: number
}

/** 采样一份当前状态。 */
export function buildHistorySnapshot(input: BuildHistoryInput): HistorySnapshot {
  const now = input.now ?? Date.now()
  const tasks = input.tasks.filter(task => (task.projectId ?? '') === input.project.id)
  const friction = input.friction.filter(item => (item.projectId ?? '') === input.project.id)
  const knowledgeNodes = (input.knowledge?.nodes ?? []).filter(node => node.projectIds.includes(input.project.id))

  const done = tasks.filter(task => task.done).map(task => task.id)
  const open = tasks.filter(task => !task.done).map(task => task.id)
  const openFriction = friction.filter(item => !item.resolved).map(item => item.id)

  return {
    id: `snap-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    projectId: input.project.id,
    at: now,
    label: (input.label ?? '手动快照').slice(0, 40),
    counts: {
      tasks: tasks.length,
      done: done.length,
      openFriction: openFriction.length,
      knowledgeLearned: knowledgeNodes.filter(node => node.status === 'learned').length,
    },
    taskDoneIds: done,
    taskOpenIds: open,
    openFrictionIds: openFriction,
    memoryVersion: input.memory?.version ?? 0,
    memoryDigest: memoryDigest(input.memory),
  }
}

function diffIds(from: string[], to: string[]): { added: string[]; removed: string[] } {
  const fromSet = new Set(from)
  const toSet = new Set(to)
  return {
    added: to.filter(id => !fromSet.has(id)),
    removed: from.filter(id => !toSet.has(id)),
  }
}

/**
 * 两个快照的差异。
 *
 * 「完成任务」的定义：在 to 的 done 里，且**不在** from 的 done 里（可能来自
 * from 的 open，也可能 from 里根本还没有这个任务 —— 那就是「新建并完成」，
 * 同样值得记一笔）。
 */
export function diffHistory(from: HistorySnapshot, to: HistorySnapshot): HistoryDiff {
  const fromAll = [...from.taskDoneIds, ...from.taskOpenIds]
  const toAll = [...to.taskDoneIds, ...to.taskOpenIds]
  const taskDiff = diffIds(fromAll, toAll)

  const completedTasks = to.taskDoneIds.filter(id => !from.taskDoneIds.includes(id))
  const reopenedTasks = to.taskOpenIds.filter(id => from.taskDoneIds.includes(id))

  const frictionDiff = diffIds(from.openFrictionIds, to.openFrictionIds)
  const decisionDiff = diffIds(from.memoryDigest.decisions, to.memoryDigest.decisions)

  const memoryChanged =
    from.memoryVersion !== to.memoryVersion ||
    from.memoryDigest.intro !== to.memoryDigest.intro ||
    from.memoryDigest.stack.join('|') !== to.memoryDigest.stack.join('|') ||
    decisionDiff.added.length > 0 ||
    decisionDiff.removed.length > 0

  const pieces: string[] = []
  if (taskDiff.added.length > 0) pieces.push(`新增任务 ${taskDiff.added.length}`)
  if (completedTasks.length > 0) pieces.push(`完成 ${completedTasks.length}`)
  if (reopenedTasks.length > 0) pieces.push(`重开 ${reopenedTasks.length}`)
  if (frictionDiff.added.length > 0) pieces.push(`新增阻碍 ${frictionDiff.added.length}`)
  if (frictionDiff.removed.length > 0) pieces.push(`解决阻碍 ${frictionDiff.removed.length}`)
  if (decisionDiff.added.length > 0) pieces.push(`新增决策 ${decisionDiff.added.length}`)
  if (memoryChanged && pieces.length === 0) pieces.push('记忆有更新')

  return {
    from,
    to,
    addedTasks: taskDiff.added.length,
    removedTasks: taskDiff.removed.length,
    completedTasks,
    reopenedTasks,
    addedFriction: frictionDiff.added.length,
    resolvedFriction: frictionDiff.removed.length,
    addedDecisions: decisionDiff.added,
    removedDecisions: decisionDiff.removed,
    memoryChanged,
    memoryVersionDelta: to.memoryVersion - from.memoryVersion,
    summary: pieces.length === 0 ? '两个时间点之间没有结构性变化' : pieces.join(' · '),
  }
}

/** 某项目的快照（新→旧）。 */
export function snapshotsOf(list: HistorySnapshot[], projectId: string): HistorySnapshot[] {
  return list
    .filter(item => item.projectId === projectId)
    .sort((a, b) => b.at - a.at)
}

/**
 * 裁剪快照：每个项目最多保留 N 个，**但永远保留最早的一个**作为基线
 * （没有基线就没法回答「这个项目从开始到现在变了多少」）。
 */
export function pruneSnapshots(list: HistorySnapshot[], perProject = BOARD_CONFIG.history.maxPerProject): HistorySnapshot[] {
  const grouped = new Map<string, HistorySnapshot[]>()
  for (const item of list) {
    const bucket = grouped.get(item.projectId)
    if (bucket === undefined) grouped.set(item.projectId, [item])
    else bucket.push(item)
  }

  const keep: HistorySnapshot[] = []
  for (const bucket of grouped.values()) {
    const sorted = [...bucket].sort((a, b) => a.at - b.at)
    if (sorted.length <= perProject) {
      keep.push(...sorted)
      continue
    }
    const baseline = sorted[0]!
    const recent = sorted.slice(sorted.length - (perProject - 1))
    keep.push(baseline, ...recent.filter(item => item.id !== baseline.id))
  }
  return keep.sort((a, b) => a.at - b.at)
}

/** 最近一次快照（用于判断「要不要自动补一个」）。 */
export function latestSnapshot(list: HistorySnapshot[], projectId: string): HistorySnapshot | undefined {
  return snapshotsOf(list, projectId)[0]
}

/** 是否需要自动补快照。 */
export function needsAutoSnapshot(
  list: HistorySnapshot[],
  projectId: string,
  now = Date.now(),
  intervalMs = BOARD_CONFIG.history.autoIntervalMs,
): boolean {
  const latest = latestSnapshot(list, projectId)
  if (latest === undefined) return true
  return now - latest.at >= intervalMs
}
