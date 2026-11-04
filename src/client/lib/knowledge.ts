/**
 * knowledge.ts — 知识图谱的图操作（V4「程序员知识成长系统」的数据层）。
 *
 * 只做**纯函数**：进一个图，出一个图，不碰存储、不碰 React。
 *
 * 四条图约束（都在这一个文件里强制，UI 不许自己判断）：
 *   1. 节点 id 唯一；重复插入视为更新；
 *   2. 边不能自环；
 *   3. `prereq` 是有向边且**禁止成环**（A 是 B 的前置、B 是 C 的前置，就不能再让
 *      C 成为 A 的前置）；插入前用 DFS 检测；
 *   4. `related` 视为无向，A–B 与 B–A 只保留一条。
 *
 * 删除节点时级联删除它的边，并把它从其它节点的关联里摘掉 —— 悬空引用是图结构
 * 最容易出的 bug，必须在一处收口。
 */
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode, KnowledgeStatus, Mastery } from '../types'
import { BOARD_CONFIG } from './config'

/** 建一个节点（默认 todo / mastery 0）。 */
export function createNode(
  input: {
    title: string
    summary?: string
    category?: string
    projectIds?: string[]
    origin?: 'manual' | 'ai'
  },
  now = Date.now(),
): KnowledgeNode {
  const node: KnowledgeNode = {
    id: `kn-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim().slice(0, 80),
    status: 'todo',
    mastery: 0,
    projectIds: input.projectIds ?? [],
    taskIds: [],
    logIds: [],
    frictionIds: [],
    origin: input.origin ?? 'manual',
    createdAt: now,
    updatedAt: now,
    reviewCount: 0,
  }
  if (input.summary !== undefined && input.summary.trim() !== '') node.summary = input.summary.trim().slice(0, 400)
  if (input.category !== undefined && input.category.trim() !== '') node.category = input.category.trim().slice(0, 30)
  return node
}

/** 按 id 找节点。 */
export function nodeById(graph: KnowledgeGraph, id: string): KnowledgeNode | undefined {
  return graph.nodes.find(node => node.id === id)
}

/** 插入或更新节点（按 id）。 */
export function upsertNode(graph: KnowledgeGraph, node: KnowledgeNode): KnowledgeGraph {
  const index = graph.nodes.findIndex(item => item.id === node.id)
  if (index < 0) {
    if (graph.nodes.length >= BOARD_CONFIG.knowledge.maxNodes) return graph
    return { ...graph, nodes: [...graph.nodes, node] }
  }
  return { ...graph, nodes: graph.nodes.map((item, i) => (i === index ? node : item)) }
}

/**
 * 删除节点：级联清理它的边。
 *
 * 这里**不**删除关联的任务 / 日志 / 阻碍本体 —— 知识点只是「引用」它们，
 * 删知识不该把开发记录一起带走；反方向的引用（其它节点指向自己）不存在，
 * 因为关联是单向存在节点上的 id 列表。
 */
export function removeNode(graph: KnowledgeGraph, id: string): KnowledgeGraph {
  return {
    nodes: graph.nodes.filter(node => node.id !== id),
    edges: graph.edges.filter(edge => edge.fromId !== id && edge.toId !== id),
  }
}

/** 判断再加一条 `from → to` 的 prereq 边会不会成环。 */
export function wouldCreateCycle(graph: KnowledgeGraph, fromId: string, toId: string): boolean {
  if (fromId === toId) return true
  // 从 toId 出发，看能不能走回 fromId（能走回去就说明成环）。
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (edge.kind !== 'prereq') continue
    const list = adjacency.get(edge.fromId)
    if (list === undefined) adjacency.set(edge.fromId, [edge.toId])
    else list.push(edge.toId)
  }
  const stack = [toId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === fromId) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of adjacency.get(current) ?? []) stack.push(next)
  }
  return false
}

export type AddEdgeResult =
  | { ok: true; graph: KnowledgeGraph; edge: KnowledgeEdge }
  | { ok: false; reason: 'self' | 'missing' | 'cycle' | 'duplicate' | 'limit' }

/**
 * 加一条边。
 *
 * @param kind - `related`（无向）或 `prereq`（from 是 to 的前置）
 */
export function addEdge(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string,
  kind: 'related' | 'prereq',
  now = Date.now(),
): AddEdgeResult {
  if (fromId === toId) return { ok: false, reason: 'self' }
  if (nodeById(graph, fromId) === undefined || nodeById(graph, toId) === undefined) {
    return { ok: false, reason: 'missing' }
  }
  if (graph.edges.length >= BOARD_CONFIG.knowledge.maxEdges) return { ok: false, reason: 'limit' }

  const exists = graph.edges.some(edge => {
    if (edge.kind !== kind) return false
    if (kind === 'related') {
      return (edge.fromId === fromId && edge.toId === toId) || (edge.fromId === toId && edge.toId === fromId)
    }
    return edge.fromId === fromId && edge.toId === toId
  })
  if (exists) return { ok: false, reason: 'duplicate' }

  if (kind === 'prereq' && wouldCreateCycle(graph, fromId, toId)) return { ok: false, reason: 'cycle' }

  const edge: KnowledgeEdge = {
    id: `ke-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    fromId,
    toId,
    kind,
  }
  return { ok: true, graph: { ...graph, edges: [...graph.edges, edge] }, edge }
}

/** 删除一条边。 */
export function removeEdge(graph: KnowledgeGraph, edgeId: string): KnowledgeGraph {
  return { ...graph, edges: graph.edges.filter(edge => edge.id !== edgeId) }
}

/** 某个节点的全部邻居（无向视角，含前置与被前置）。 */
export function neighborsOf(graph: KnowledgeGraph, id: string): KnowledgeNode[] {
  const ids = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.fromId === id) ids.add(edge.toId)
    else if (edge.toId === id) ids.add(edge.fromId)
  }
  return [...ids].map(item => nodeById(graph, item)).filter((node): node is KnowledgeNode => node !== undefined)
}

/** 关联某条阻碍的全部知识点（3.3 的反向查询）。 */
export function nodesForFriction(graph: KnowledgeGraph, frictionId: string): KnowledgeNode[] {
  return graph.nodes.filter(node => node.frictionIds.includes(frictionId))
}

/** 把知识节点关联到某个对象（项目 / 任务 / 日志 / 阻碍）。 */
export function linkTo(
  graph: KnowledgeGraph,
  nodeId: string,
  target: { projectId?: string; taskId?: string; logId?: string; frictionId?: string },
  now = Date.now(),
): KnowledgeGraph {
  const node = nodeById(graph, nodeId)
  if (node === undefined) return graph
  const limit = BOARD_CONFIG.knowledge.maxLinks
  const add = (list: string[], id: string | undefined): string[] => {
    if (id === undefined || id === '' || list.includes(id)) return list
    return [...list, id].slice(-limit)
  }
  const next: KnowledgeNode = {
    ...node,
    projectIds: add(node.projectIds, target.projectId),
    taskIds: add(node.taskIds, target.taskId),
    logIds: add(node.logIds, target.logId),
    frictionIds: add(node.frictionIds, target.frictionId),
    updatedAt: now,
  }
  return upsertNode(graph, next)
}

/** 把节点从某个对象上解绑（删日志/阻碍时调用，避免悬空引用）。 */
export function unlinkFrom(
  graph: KnowledgeGraph,
  target: { taskId?: string; logId?: string; frictionId?: string; projectId?: string },
): KnowledgeGraph {
  const strip = (list: string[], id: string | undefined): string[] =>
    id === undefined || id === '' ? list : list.filter(item => item !== id)
  return {
    ...graph,
    nodes: graph.nodes.map(node => ({
      ...node,
      projectIds: strip(node.projectIds, target.projectId),
      taskIds: strip(node.taskIds, target.taskId),
      logIds: strip(node.logIds, target.logId),
      frictionIds: strip(node.frictionIds, target.frictionId),
    })),
  }
}

export interface NodeFilter {
  query?: string
  status?: KnowledgeStatus | 'all'
  category?: string | 'all'
  projectId?: string | 'all'
  origin?: 'manual' | 'ai' | 'all'
}

/** 搜索 + 筛选（全部条件「与」）。 */
export function searchNodes(graph: KnowledgeGraph, filter: NodeFilter = {}): KnowledgeNode[] {
  const needle = (filter.query ?? '').trim().toLowerCase()
  return graph.nodes.filter(node => {
    if (filter.status !== undefined && filter.status !== 'all' && node.status !== filter.status) return false
    if (filter.category !== undefined && filter.category !== 'all' && (node.category ?? '') !== filter.category) return false
    if (filter.origin !== undefined && filter.origin !== 'all' && node.origin !== filter.origin) return false
    if (filter.projectId !== undefined && filter.projectId !== 'all' && filter.projectId !== '') {
      if (!node.projectIds.includes(filter.projectId)) return false
    }
    if (needle !== '') {
      const haystack = `${node.title} ${node.summary ?? ''} ${node.category ?? ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

/** 分类列表（去重、排序）。 */
export function categoriesOf(graph: KnowledgeGraph): string[] {
  const set = new Set<string>()
  for (const node of graph.nodes) {
    if (node.category !== undefined && node.category !== '') set.add(node.category)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** 把状态与掌握度对齐（状态改了 mastery 该跟上，反之亦然）。 */
export function normalizeNodeState(node: KnowledgeNode, now = Date.now()): KnowledgeNode {
  if (node.status === 'learned' && node.mastery < 3) return { ...node, mastery: 3 as Mastery, updatedAt: now }
  if (node.status === 'todo' && node.mastery > 2) return { ...node, mastery: 2 as Mastery, updatedAt: now }
  return node
}

/** 复习结果落到节点上（排期由 review.ts 算好传入）。 */
export function applyReviewResult(
  graph: KnowledgeGraph,
  nodeId: string,
  result: { at: number; nextAt: number; mastery: Mastery; status: KnowledgeStatus },
): KnowledgeGraph {
  const node = nodeById(graph, nodeId)
  if (node === undefined) return graph
  const next: KnowledgeNode = {
    ...node,
    mastery: result.mastery,
    status: result.status,
    lastReviewedAt: result.at,
    nextReviewAt: result.nextAt,
    reviewCount: node.reviewCount + 1,
    updatedAt: result.at,
  }
  return upsertNode(graph, next)
}

/** 图谱概览：用于面板顶部的一行统计。 */
export function graphStats(graph: KnowledgeGraph): {
  total: number
  learned: number
  learning: number
  todo: number
  review: number
  edges: number
  dueCount: number
} {
  let learned = 0
  let learning = 0
  let todo = 0
  let review = 0
  const now = Date.now()
  let dueCount = 0
  for (const node of graph.nodes) {
    if (node.status === 'learned') learned += 1
    else if (node.status === 'learning') learning += 1
    else if (node.status === 'review') review += 1
    else todo += 1
    if (node.nextReviewAt !== undefined && node.nextReviewAt <= now) dueCount += 1
  }
  return { total: graph.nodes.length, learned, learning, todo, review, edges: graph.edges.length, dueCount }
}
