/**
 * audit-probe.ts — 只读审计探针（不属于正式测试，不参与构建）。
 *
 * 目的：把「读代码时的怀疑」变成可复现的证据。每条探针只打印观测值，
 * 不修改任何存储，也不会让进程以非零码退出。
 *
 * 跑法：
 *   ESBUILD_BINARY_PATH=<esbuild.exe> npx esbuild scripts/audit-probe.ts \
 *     --bundle --platform=node --format=cjs --outfile=$TEMP/probe.cjs && node $TEMP/probe.cjs
 */
import { applyMemoryPatch, createEmptyMemory } from '../src/client/lib/memory'
import { coerceDaily, coerceKnowledge, coerceMemoryDrafts, coerceMeta, coerceReview, wrapEnvelope } from '../src/client/lib/schema'
import { parseBackup, buildBackup } from '../src/client/lib/backup'
import { applyDailyDelta, rebuildDaily, rebuildDay } from '../src/client/lib/daily'
import { appendEvent, makeEvent } from '../src/client/lib/timeline'
import { dueNodes, pruneReviews, reviewStats, schedule, createReview } from '../src/client/lib/review'
import { addEdge, createNode, removeNode, upsertNode, wouldCreateCycle } from '../src/client/lib/knowledge'
import { buildHeatmap } from '../src/client/lib/heatmap'
import { createLocalRepo } from '../src/client/lib/repo/local'
import type { BoardSettings, KnowledgeGraph, SessionLog, Task } from '../src/client/types'

const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime()
const DAY = 86_400_000

function show(id: string, expect: string, actual: unknown): void {
  const text = typeof actual === 'object' ? JSON.stringify(actual) : String(actual)
  console.log(`${id.padEnd(6)} 期望：${expect}\n       实际：${text}\n`)
}

console.log('=== A. 时间戳与排期 ===')

/* A1: 知识节点的下次复习时间是否能活过 30 天 */
const node30 = coerceKnowledge({
  nodes: [{ id: 'n1', title: 'Promise', nextReviewAt: NOW + 30 * DAY }],
  edges: [],
}).nodes[0]
show('A1', `nextReviewAt = NOW+30d (${NOW + 30 * DAY})`, node30?.nextReviewAt)
console.log(`       差值：${node30?.nextReviewAt === undefined ? 'n/a' : ((node30.nextReviewAt - NOW) / DAY).toFixed(2)} 天\n`)

/* A2: 复习记录的 nextAt 同样 */
const review30 = coerceReview({ nodeId: 'n1', at: NOW, nextAt: NOW + 90 * DAY, intervalDays: 90, grade: 2 })
show('A2', `nextAt = NOW+90d`, review30?.nextAt)
console.log(`       差值：${review30 === undefined ? 'n/a' : ((review30.nextAt - NOW) / DAY).toFixed(2)} 天\n`)

/* A3: 90 天排期经过 restore 后是否还能让节点出现在队列里 */
const graphWithSchedule: KnowledgeGraph = {
  nodes: [{ ...createNode({ title: 'TS 泛型' }, NOW), nextReviewAt: NOW + 90 * DAY }],
  edges: [],
}
show('A3', '内存中节点下一轮复习在未来', graphWithSchedule.nodes[0]?.nextReviewAt)

console.log('=== B. 备份 v4 ===')

/* B1: 导出后 v4 实体是否真的进了备份 payload */
const settings = {
  autoCapture: true,
  lastDurationMinutes: 25,
  projectRules: [],
  monthlyGoal: { month: '2026-11', targetMinutes: 600, targetTasks: 10 },
  activeProjectId: '',
  breakEnabled: true,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  contextWarnMessages: 40,
  contextDangerMessages: 80,
  aiAutoDaily: false,
  aiTier: 'stats' as const,
  heatmapYear: 0,
} satisfies BoardSettings

const payload = buildBackup({
  tasks: [],
  logs: [],
  projects: [],
  settings,
  friction: [],
  meta: { sessionTaskMap: {} },
  scope: 'all',
  now: NOW,
})
show('B1', 'payload 含 memory / daily / knowledge 字段', {
  memory: (payload as Record<string, unknown>).memory,
  daily: (payload as Record<string, unknown>).daily,
  knowledge: (payload as Record<string, unknown>).knowledge,
})

/* B2: 导入一份带 v4 数据的备份，是否会保留 */
const file = JSON.stringify({
  kind: 'sorchron-study-board-backup',
  version: 4,
  exportedAt: NOW,
  tasks: [],
  logs: [],
  projects: [],
  settings,
  friction: [],
  meta: { sessionTaskMap: {} },
  memory: [{ projectId: 'p1', intro: '记忆', version: 3 }],
  daily: [{ day: '2026-11-01', focusMinutes: 120 }],
  knowledge: { nodes: [{ id: 'n1', title: 'Promise' }], edges: [] },
})
const parsed = parseBackup(file)
show('B2', '导入后 memory / daily / knowledge 均保留', parsed.ok ? {
  memory: (parsed.payload as Record<string, unknown>).memory,
  daily: (parsed.payload as Record<string, unknown>).daily,
  knowledge: (parsed.payload as Record<string, unknown>).knowledge,
} : parsed)

console.log('=== C. 原型污染与草稿清洗 ===')

/* C1: meta.memoryDrafts 里的 __proto__ 键 */
const drafts = coerceMemoryDrafts(
  JSON.parse('{"__proto__":{"projectId":"x","items":[],"patch":{},"rationale":"r"}}') as unknown,
)
const draftsProto = Object.getPrototypeOf(drafts)
show('C1', 'drafts 的原型不是草稿对象（null 或 Object.prototype）', draftsProto === null || draftsProto === Object.prototype)
console.log(`       实际原型：${draftsProto === null ? 'null' : draftsProto === Object.prototype ? 'Object.prototype' : '被替换'}\n`)

/* C2: 草稿 patch 未清洗，透传到 applyMemoryPatch 会怎样 */
const dirtyDrafts = coerceMemoryDrafts({
  p1: { projectId: 'p1', at: NOW, source: 'ai', patch: { done: [123, null] }, rationale: 'r', items: [] },
})
const dirtyPatch = dirtyDrafts.p1?.patch
let crash = '未崩溃'
try {
  applyMemoryPatch(createEmptyMemory('p1', NOW), dirtyPatch ?? {}, 'ai', NOW)
} catch (error) {
  crash = `崩溃：${(error as Error).message}`
}
show('C2', '应用脏草稿不崩溃（或已被清洗）', crash)

console.log('=== D. 日聚合一致性与幂等 ===')

const logs: SessionLog[] = [
  { id: 'l1', at: new Date(2026, 10, 1, 9, 0).getTime(), kind: 'focus', title: '专注', minutes: 25, source: 'manual', edited: false },
]
const task: Task = {
  id: 't1', title: '任务', status: 'done', done: true, pomodoros: 0,
  createdAt: NOW, updatedAt: NOW, completedAt: new Date(2026, 10, 1, 10, 0).getTime(),
}

/* D1: 增量接口天然非幂等（设计如此），幂等的是 rebuildDay */
let twice = applyDailyDelta([], '2026-11-01', { focusMinutes: 25, tasksDone: 1 }, NOW)
twice = applyDailyDelta(twice, '2026-11-01', { focusMinutes: 25, tasksDone: 1 }, NOW)
const idempotent = rebuildDay({ logs, tasks: [task], friction: [] }, '2026-11-01')
show('D1', 'rebuildDay 跑两次结果一致且等于真实数据', {
  增量两次_预期翻倍: twice[0],
  rebuildDay_第一次: idempotent,
  rebuildDay_第二次: rebuildDay({ logs, tasks: [task], friction: [] }, '2026-11-01'),
})

/* D2: 超过 24 小时的极端值 */
let overflow = applyDailyDelta([], '2026-11-01', { focusMinutes: 900 }, NOW)
overflow = applyDailyDelta(overflow, '2026-11-01', { focusMinutes: 900 }, NOW)
show('D2', '增量 900+900 与重建同样被夹到 1440', overflow[0]?.focusMinutes)

/* D3: 跨午夜归属 */
const lateNight = applyDailyDelta([], '2026-11-01', { focusMinutes: 25 }, NOW)
const midnightLogs: SessionLog[] = [
  { id: 'x1', at: new Date(2026, 10, 1, 23, 59, 59).getTime(), kind: 'focus', title: '专注', minutes: 25, source: 'manual', edited: false },
  { id: 'x2', at: new Date(2026, 10, 2, 0, 0, 1).getTime(), kind: 'focus', title: '专注', minutes: 25, source: 'manual', edited: false },
]
const midnight = rebuildDaily({ logs: midnightLogs, tasks: [], friction: [] })
void lateNight
show('D3', '23:59:59 与 00:00:01 分属两天', midnight.map(item => `${item.day}:${item.focusMinutes}`))

console.log('=== E. 复习队列与孤儿数据 ===')

/* E1: 状态标记为「待复习」但没有 nextReviewAt 的节点 */
const manualReviewNode = { ...createNode({ title: '闭包' }, NOW), status: 'review' as const }
show('E1', 'status=review 的节点进入待复习队列', dueNodes([manualReviewNode], NOW).length)

/* E2: 删除知识节点后，它的复习记录是否还在 */
let graph: KnowledgeGraph = { nodes: [], edges: [] }
const target = createNode({ title: 'React State' }, NOW)
graph = upsertNode(graph, target)
const reviews = [createReview(target.id, 'recall', 2, schedule({ intervalDays: 0, mastery: 0, grade: 2 }, NOW), undefined, NOW)]
graph = removeNode(graph, target.id)
const pruned = pruneReviews(reviews, new Set(graph.nodes.map(node => node.id)))
show('E2', 'pruneReviews 能清掉孤儿复习记录', {
  节点数: graph.nodes.length,
  清理前: reviews.length,
  清理后: pruned.reviews.length,
  清理条数: pruned.removed,
  清理后统计: reviewStats(pruned.reviews, NOW),
})

console.log('=== F. 时间轴顺序与去重 ===')

/* F1: 乱序写入后是否仍保持「新→旧」 */
let events = appendEvent([], makeEvent({ type: 'task.created', title: '较新', refId: 'a' }, NOW)).list
events = appendEvent(events, makeEvent({ type: 'focus.completed', title: '较旧', refId: 'b' }, NOW - 10_000)).list
show('F1', '列表严格新→旧', events.map(item => item.title))

/* F2: 不同项目、同 refId 是否被误去重 */
let cross = appendEvent([], makeEvent({ type: 'task.completed', title: 'A 项目', refId: 'same', projectId: 'p1' }, NOW)).list
const crossResult = appendEvent(cross, makeEvent({ type: 'task.completed', title: 'B 项目', refId: 'same', projectId: 'p2' }, NOW + 1000))
show('F2', '不同项目不应被去重（当前策略按 type|refId，不含 projectId）', {
  写入成功: crossResult.added,
  条数: crossResult.list.length,
})

console.log('=== G. 其他边界 ===')

/* G1: 非法日历日期 */
show('G1', '2026-02-31 被拒绝', coerceDaily({ day: '2026-02-31', focusMinutes: 10 })?.day ?? '已拒绝')

/* G2: 空补丁是否让版本虚增 */
const memory = createEmptyMemory('p1', NOW)
const bumped = applyMemoryPatch(memory, {}, 'ai', NOW)
show('G2', '空补丁不递增版本', bumped.version)

/* G3: 包装信封的版本号 */
show('G3', 'wrapEnvelope 版本 = 4', wrapEnvelope([]).schemaVersion)

/* G4: coerceMeta 对 sessionTaskMap 的 __proto__ 处理 */
const meta = coerceMeta(JSON.parse('{"sessionTaskMap":{"__proto__":"x","p":"t1"}}') as unknown)
show('G4', 'sessionTaskMap 只保留合法字符串绑定', meta.sessionTaskMap)


/* ────────────────────────────────────────────────────────────────────────────
 * H. 性能实测（数字来自本次运行，不估算）
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('=== H. 性能实测 ===')

function ms(fn: () => void): string {
  const start = performance.now()
  fn()
  return (performance.now() - start).toFixed(2) + ' ms'
}

const perfNodes = Array.from({ length: 1000 }, (_, index) => createNode({ title: 'K' + index }, NOW + index))
let perfGraph: KnowledgeGraph = { nodes: perfNodes, edges: [] }
console.log('构图 1000 节点 / 至多 900 边：', ms(() => {
  let temp: KnowledgeGraph = { nodes: perfNodes, edges: [] }
  for (let index = 0; index < 999; index += 1) {
    const from = perfNodes[index]
    const to = perfNodes[index + 1]
    if (from === undefined || to === undefined) continue
    const result = addEdge(temp, from.id, to.id, 'prereq', NOW)
    if (result.ok) temp = result.graph
  }
  perfGraph = temp
}))
console.log('DFS 成环检测（900 边链）：', ms(() => {
  const tail = perfNodes[900]
  if (tail !== undefined) wouldCreateCycle(perfGraph, tail.id, perfNodes[0]!.id)
}))

const perfDays = Array.from({ length: 800 }, (_, index) => {
  const date = new Date(2025, 0, 1 + index)
  const day = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
  return { day, focusMinutes: index % 120, tasksDone: index % 3, sessions: 1, friction: 0 }
})
console.log('800 天热力图（53 周网格）：', ms(() => void buildHeatmap(perfDays, 2026, NOW)))

const perfLogs: SessionLog[] = Array.from({ length: 2000 }, (_, index) => ({
  id: 'p' + index,
  at: NOW - index * 60_000,
  kind: index % 5 === 0 ? 'focus' as const : 'message' as const,
  title: '日志 ' + index,
  minutes: index % 5 === 0 ? 25 : undefined,
  source: 'auto' as const,
  edited: false,
}))
console.log('rebuildDaily（2000 条日志）：', ms(() => void rebuildDaily({ logs: perfLogs, tasks: [], friction: [] })))

const perfEvents = Array.from({ length: 1200 }, (_, index) =>
  makeEvent({ type: 'focus.completed', title: '专注 ' + index, refId: 'f' + index }, NOW - index * 61_000),
)
console.log('连续写入 100 次（内存模式，每次 50 条事件）：', ms(() => {
  const repo = createLocalRepo()
  for (let index = 0; index < 100; index += 1) repo.writeTimeline(perfEvents.slice(index, index + 50))
}))
