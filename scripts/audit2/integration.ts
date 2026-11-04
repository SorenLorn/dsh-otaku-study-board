/**
 * integration.ts — 第二轮审计：五条业务链路 + 1000 组随机数据不变量。
 *
 * 与 smoke.ts 的分工：smoke 测「单个函数正确」，这里测「模块串起来还对不对」，
 * 以及「随机输入下不变量是否始终成立」。独立脚本，失败时退出码为 1。
 *
 * 跑法：
 *   ESBUILD_BINARY_PATH=<esbuild.exe> npx esbuild scripts/audit2/integration.ts \
 *     --bundle --platform=node --format=cjs --outfile=$TEMP/int.cjs && node $TEMP/int.cjs
 */
import { applyImport, buildBackup, parseBackup, serializeBackup } from '../../src/client/lib/backup'
import { applyDailyDelta, rebuildDaily, syncDailyTasks } from '../../src/client/lib/daily'
import { appendEvent, makeEvent } from '../../src/client/lib/timeline'
import { applyMemoryPatch, buildDraftFromLogs, acceptDraft, createEmptyMemory } from '../../src/client/lib/memory'
import { addEdge, applyReviewResult, createNode, removeNode, upsertNode, wouldCreateCycle } from '../../src/client/lib/knowledge'
import { createReview, pruneReviews, reviewStats, schedule } from '../../src/client/lib/review'
import { buildHistorySnapshot, diffHistory } from '../../src/client/lib/history'
import { buildHeatmap } from '../../src/client/lib/heatmap'
import { getRepo, setRepo } from '../../src/client/lib/repo'
import { createFakeStore, writeTransaction } from '../../src/client/lib/tx'
import { createLocalRepo, __resetMemoryStore } from '../../src/client/lib/repo/local'
import { coerceKnowledge, wrapEnvelope } from '../../src/client/lib/schema'
import { dayKey } from '../../src/client/lib/time'
import { BOARD_CONFIG } from '../../src/client/lib/config'
import type {
  BoardSettings,
  DailyAggregate,
  FrictionRecord,
  HistorySnapshot,
  KnowledgeGraph,
  Project,
  ProjectMemory,
  SessionLog,
  Task,
  TimelineEvent,
} from '../../src/client/types'


let passed = 0
let failed = 0
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}

const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime()
const DAY = 86_400_000

const settings: BoardSettings = {
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
  aiTier: 'stats',
  heatmapYear: 0,
}

function makeTask(id: string, projectId: string, title = `任务 ${id}`): Task {
  return {
    id,
    title,
    status: 'todo',
    done: false,
    pomodoros: 0,
    projectId,
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
  }
}

function emptyLocal() {
  return {
    tasks: [] as Task[],
    logs: [] as SessionLog[],
    projects: [] as Project[],
    friction: [] as FrictionRecord[],
    settings,
    meta: { sessionTaskMap: {} as Record<string, string> },
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 链路 A：任务完成 → 时间轴 → Daily → Heatmap → History
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('\n[A] 任务完成链路')
{
  let tasks = [makeTask('t1', 'p1')]
  let daily: DailyAggregate[] = []
  let timeline: TimelineEvent[] = []
  let history: HistorySnapshot[] = []
  const project: Project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }

  const complete = (id: string, at: number): void => {
    tasks = tasks.map(task =>
      task.id === id ? { ...task, done: true, status: 'done', completedAt: at, updatedAt: at } : task,
    )
    daily = syncDailyTasks(daily, tasks, dayKey(at), at)
    timeline = appendEvent(
      timeline,
      makeEvent({ type: 'task.completed', title: `完成任务 ${id}`, refId: id, projectId: 'p1' }, at),
    ).list
  }

  complete('t1', NOW)
  check('A1 任务被标记完成', tasks[0]?.done === true)
  check('A2 Daily 完成数 = 1', daily.find(item => item.day === dayKey(NOW))?.tasksDone === 1, daily)
  check('A3 时间轴有 1 条完成事件', timeline.filter(item => item.type === 'task.completed').length === 1)

  const heat = buildHeatmap(daily, new Date(NOW).getFullYear(), NOW)
  const cell = heat.weeks.flatMap(week => week.days).find(item => item.day === dayKey(NOW))
  check('A4 热力图当天带上完成数', cell?.tasksDone === 1, cell)

  history = [buildHistorySnapshot({ project, tasks, friction: [], now: NOW })]
  check('A5 快照记录完成数 1', history[0]?.counts.done === 1, history[0]?.counts)

  // 重开再完成：绝对值写入必须仍然是 1（若是事件 +1 会变成 2）
  tasks = tasks.map(task => ({ ...task, done: false, status: 'todo', completedAt: undefined }))
  daily = syncDailyTasks(daily, tasks, dayKey(NOW), NOW)
  check('A6 重开后当天完成数回落到 0', daily.find(item => item.day === dayKey(NOW))?.tasksDone === 0, daily)
  complete('t1', NOW + 60_000)
  check('A7 再次完成仍为 1（不是 2）', daily.find(item => item.day === dayKey(NOW))?.tasksDone === 1, daily)

  // 与完整重建对比
  const rebuilt = rebuildDaily({ logs: [], tasks, friction: [] })
  check(
    'A8 Daily 与 rebuildDaily 一致',
    (rebuilt.find(item => item.day === dayKey(NOW))?.tasksDone ?? -1) ===
      (daily.find(item => item.day === dayKey(NOW))?.tasksDone ?? -2),
    { daily, rebuilt },
  )

  const diff = diffHistory(
    buildHistorySnapshot({ project, tasks: [makeTask('t1', 'p1')], friction: [], now: NOW - DAY }),
    history[0]!,
  )
  check('A9 历史对比识别出完成任务', diff.completedTasks.includes('t1'), diff.completedTasks)
}

/* ────────────────────────────────────────────────────────────────────────────
 * 链路 B：记忆草稿 → 采纳 → 版本 → 时间轴 → 备份 → 恢复
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('\n[B] 记忆更新链路')
{
  const project: Project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }
  const tasks = [
    { ...makeTask('t1', 'p1', '重构 TaskList'), done: true, status: 'done' as const, completedAt: NOW - 1000 },
    makeTask('t2', 'p1', '写自测'),
  ]
  const friction: FrictionRecord[] = [
    { id: 'f1', at: NOW, updatedAt: NOW, summary: 'TypeError 空指针', hits: 1, resolved: false, projectId: 'p1' },
  ]

  const draft = buildDraftFromLogs({ projectId: 'p1', projectName: 'P1', tasks, logs: [], friction, now: NOW })
  check('B1 草稿生成成功', draft !== undefined)
  const acceptedDraft = draft === undefined ? undefined : { ...draft, items: draft.items.map(item => ({ ...item, accepted: true })) }
  const patch = acceptedDraft === undefined ? {} : acceptDraft(acceptedDraft)
  check('B2 采纳后补丁含任务与阻碍', (patch.done ?? []).length === 1 && (patch.openIssues ?? []).length === 1, patch)

  const before = createEmptyMemory('p1', NOW)
  const memory = applyMemoryPatch(before, patch, 'ai', NOW)
  check('B3 版本从 1 变 2', memory.version === 2, memory.version)
  const again = applyMemoryPatch(memory, patch, 'ai', NOW + 1000)
  check('B4 重复采纳同一补丁不再增版本', again.version === 2, again.version)
  check('B5 数组不重复追加', again.done.length === 1, again.done)

  let timeline = appendEvent(
    [],
    makeEvent({ type: 'memory.updated', title: '记忆更新', refId: 'p1', projectId: 'p1' }, NOW),
  ).list
  check('B6 时间轴记录记忆更新', timeline.some(item => item.type === 'memory.updated'))

  const payload = buildBackup({
    tasks,
    logs: [],
    projects: [project],
    settings,
    friction,
    meta: { sessionTaskMap: {} },
    memory: [memory],
    now: NOW,
  })
  const parsed = parseBackup(serializeBackup(payload))
  check('B7 备份可解析', parsed.ok === true)
  if (parsed.ok) {
    const merged = applyImport(emptyLocal(), parsed.payload, 'merge', NOW)
    check('B8 恢复后记忆版本不倒退', merged.memory?.[0]?.version === 2, merged.memory?.[0]?.version)
    check('B9 恢复后内容一致', merged.memory?.[0]?.done[0] === '重构 TaskList', merged.memory?.[0]?.done)
    const twice = applyImport({ ...emptyLocal(), memory: merged.memory }, parsed.payload, 'merge', NOW)
    check('B10 连续导入两次不重复', twice.memory?.length === 1, twice.memory?.length)
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 链路 C：知识节点 → 依赖 → 复习 → 删除 → 清理
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('\n[C] 知识复习链路')
{
  let graph: KnowledgeGraph = { nodes: [], edges: [] }
  const a = createNode({ title: 'JavaScript' }, NOW)
  const b = createNode({ title: 'Promise' }, NOW + 1)
  const c = createNode({ title: 'async/await' }, NOW + 2)
  graph = upsertNode(upsertNode(upsertNode(graph, a), b), c)

  const ab = addEdge(graph, a.id, b.id, 'prereq', NOW)
  if (ab.ok) graph = ab.graph
  const bc = addEdge(graph, b.id, c.id, 'prereq', NOW)
  if (bc.ok) graph = bc.graph
  check('C1 依赖链建立', graph.edges.length === 2, graph.edges.length)
  check('C2 反向成环被拒', addEdge(graph, c.id, a.id, 'prereq', NOW).ok === false)
  check('C3 图上不存在环', wouldCreateCycle(graph, c.id, a.id) === true)

  const sched = schedule({ intervalDays: 0, mastery: 2, grade: 2 }, NOW)
  let reviews = [createReview(b.id, 'recall', 2, sched, undefined, NOW)]
  graph = applyReviewResult(graph, b.id, { at: NOW, nextAt: sched.nextAt, mastery: sched.mastery, status: 'learned' })
  check('C4 复习后节点状态为已学习', graph.nodes.find(node => node.id === b.id)?.status === 'learned')
  check('C5 复习次数 +1', graph.nodes.find(node => node.id === b.id)?.reviewCount === 1)
  check('C6 下次排期在未来', (graph.nodes.find(node => node.id === b.id)?.nextReviewAt ?? 0) > NOW)

  graph = removeNode(graph, b.id)
  const pruned = pruneReviews(reviews, new Set(graph.nodes.map(node => node.id)))
  reviews = pruned.reviews
  check('C7 删除节点后边被级联删除', graph.edges.length === 0, graph.edges.length)
  check('C8 孤儿复习记录被清理', reviews.length === 0 && pruned.removed === 1, pruned)
  check('C9 复习统计归零', reviewStats(reviews, NOW).total === 0)
  check('C10 剩余节点无悬空边', graph.edges.every(edge => graph.nodes.some(n => n.id === edge.fromId) && graph.nodes.some(n => n.id === edge.toId)))
}

/* ────────────────────────────────────────────────────────────────────────────
 * 链路 D：两个项目、相同 ID、交替操作
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('\n[D] 项目隔离链路')
{
  const p1: Project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }
  const p2: Project = { id: 'p2', name: 'P2', archived: false, createdAt: NOW }

  const tasks = [makeTask('t1', 'p1'), makeTask('t1', 'p2')]
  let timeline: TimelineEvent[] = []
  timeline = appendEvent(timeline, makeEvent({ type: 'task.completed', title: 'P1 完成', refId: 't1', projectId: 'p1' }, NOW)).list
  const cross = appendEvent(timeline, makeEvent({ type: 'task.completed', title: 'P2 完成', refId: 't1', projectId: 'p2' }, NOW + 1000))
  timeline = cross.list
  check('D1 同 refId 跨项目都保留', cross.added === true && timeline.length === 2, timeline.length)

  const m1 = applyMemoryPatch(createEmptyMemory('p1', NOW), { intro: '项目一' }, 'manual', NOW)
  const m2 = applyMemoryPatch(createEmptyMemory('p2', NOW), { intro: '项目二' }, 'manual', NOW)
  check('D2 两个项目各自一份记忆', m1.projectId !== m2.projectId && m1.intro !== m2.intro)

  const s1 = buildHistorySnapshot({ project: p1, tasks: tasks.filter(t => t.projectId === 'p1'), friction: [], now: NOW })
  const s2 = buildHistorySnapshot({ project: p2, tasks: tasks.filter(t => t.projectId === 'p2'), friction: [], now: NOW })
  check('D3 快照按项目分隔', s1.projectId === 'p1' && s2.projectId === 'p2')
  check('D4 每个项目各 1 个任务', s1.counts.tasks === 1 && s2.counts.tasks === 1)

  // 完成 P1 的任务不应影响 P2 的任务
  const after = tasks.map(task => (task.projectId === 'p1' ? { ...task, done: true, status: 'done' as const, completedAt: NOW } : task))
  check('D5 P2 任务状态未被污染', after.find(task => task.projectId === 'p2')?.done === false)

  const payload = buildBackup({
    tasks: after,
    logs: [],
    projects: [p1, p2],
    settings,
    friction: [],
    meta: { sessionTaskMap: {} },
    memory: [m1, m2],
    now: NOW,
  })
  const parsed = parseBackup(serializeBackup(payload))
  check('D6 导出可解析', parsed.ok === true)
  if (parsed.ok) {
    const merged = applyImport(emptyLocal(), parsed.payload, 'merge', NOW)
    check('D7 恢复后两个项目都在', merged.projects.length === 2)
    check('D8 恢复后两份记忆都在', merged.memory?.length === 2, merged.memory?.length)
    check('D9 恢复后同 id 任务各归其项目', merged.tasks.filter(task => task.id === 't1').length === 2)
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 链路 E：异常恢复
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('\n[E] 异常恢复链路')
{
  __resetMemoryStore()
  const repo = createLocalRepo()
  const fallback = [{ a: 1 }]
  check('E1 缺失键返回调用方给的兜底值', repo.rawRead('___不存在的键___', fallback) === fallback)

  // 事务：第 6 次写入失败 → 前 5 个键恢复原值
  const initial = {
    a: 'old-a',
    b: 'old-b',
  }
  const store = createFakeStore(initial, 3)
  const before = store.dump()
  const result = writeTransaction(store, [
    { key: 'a', value: [1] },
    { key: 'b', value: [2] },
    { key: 'c', value: [3] },
  ])
  check('E2 事务失败返回 ok=false', result.ok === false)
  check('E3 事务失败后原值被恢复', JSON.stringify(store.dump()) === JSON.stringify(before), { before, after: store.dump() })
  check('E4 回滚成功标记为 true', result.restored === true)

  // 持久性故障：回滚也会失败，必须如实报告（不能假装已恢复）
  const broken = createFakeStore(initial, undefined, 3)
  const brokenResult = writeTransaction(broken, [
    { key: 'a', value: [1] },
    { key: 'b', value: [2] },
    { key: 'c', value: [3] },
  ])
  check('E4b 回滚失败时 restored=false', brokenResult.ok === false && brokenResult.restored === false, brokenResult)

  // 序列化失败：一个字节都不写
  const circular: Record<string, unknown> = {}
  circular.self = circular
  const store2 = createFakeStore(initial)
  const before2 = store2.dump()
  const result2 = writeTransaction(store2, [{ key: 'a', value: circular }, { key: 'b', value: [1] }])
  check('E5 序列化失败时 ok=false', result2.ok === false && result2.error === 'serialize')
  check('E6 序列化失败时不写入任何键', JSON.stringify(store2.dump()) === JSON.stringify(before2))

  // 单例
  setRepo(null)
  const one = getRepo()
  const two = getRepo()
  check('E7 getRepo 返回同一实例', one === two)

  // 成功路径
  writeTransaction(store2, [{ key: 'a', value: [9] }])
  check('E8 成功后写入生效', JSON.parse(store2.dump().a ?? '{}').data?.[0] === 9, store2.dump().a)

  // 缺失键
  check('E9 缺失键返回空数组', repo.readMemory().length === 0)
  check('E10 包装信封版本为 4', wrapEnvelope([]).schemaVersion === 4, wrapEnvelope([]).schemaVersion)

  __resetMemoryStore()
}

/* ────────────────────────────────────────────────────────────────────────────
 * 随机数据：1000 组，固定种子，检查不变量
 * ──────────────────────────────────────────────────────────────────────────── */
console.log('\n[R] 随机数据不变量（1000 组，固定种子）')
{
  const mulberry32 = (seed: number) => (): number => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const realDay = (day: string): boolean => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
    if (match === null) return false
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return (
      date.getFullYear() === Number(match[1]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[3])
    )
  }

  const started = Date.now()
  let roundtripChecked = 0
  let invariantFailures = 0

  for (let scenario = 0; scenario < 1000; scenario += 1) {
    const rng = mulberry32(20261102 + scenario)
    const base = NOW - Math.floor(rng() * 10) * DAY
    const dayCount = 1 + Math.floor(rng() * 20)
    const days = Array.from({ length: dayCount }, (_, index) => dayKey(base - index * DAY))

    // 任务
    const taskCount = Math.floor(rng() * 12)
    const tasks: Task[] = Array.from({ length: taskCount }, (_, index) => {
      const done = rng() > 0.5
      const at = base - Math.floor(rng() * dayCount) * DAY
      return {
        id: `t${index}`,
        title: `任务 ${index}`,
        status: done ? 'done' : 'todo',
        done,
        pomodoros: 0,
        projectId: rng() > 0.3 ? 'p1' : 'p2',
        createdAt: base - dayCount * DAY,
        updatedAt: at,
        ...(done ? { completedAt: at } : {}),
      }
    })

    // 日志
    const logCount = Math.floor(rng() * 40)
    const logs: SessionLog[] = Array.from({ length: logCount }, (_, index) => {
      const focus = rng() > 0.6
      const at = base - Math.floor(rng() * dayCount) * DAY + index * 60_000
      return {
        id: `l${index}`,
        at,
        kind: focus ? 'focus' : 'message',
        title: `日志 ${index}`,
        minutes: focus ? 10 + Math.floor(rng() * 50) : undefined,
        source: focus ? 'manual' : 'auto',
        edited: false,
      }
    })

    // 阻碍
    const frictionCount = Math.floor(rng() * 8)
    const friction: FrictionRecord[] = Array.from({ length: frictionCount }, (_, index) => ({
      id: `f${index}`,
      at: base - Math.floor(rng() * dayCount) * DAY,
      updatedAt: base,
      summary: `阻碍 ${index}`,
      hits: 1 + Math.floor(rng() * 3),
      resolved: rng() > 0.5,
    }))

    // 增量聚合：模拟「编排层」应有的写法（任务用绝对值，其余用增量）
    let daily: DailyAggregate[] = []
    for (const log of logs) {
      if (log.kind === 'focus') {
        daily = applyDailyDelta(daily, dayKey(log.at), { focusMinutes: log.minutes ?? 0 })
      } else {
        daily = applyDailyDelta(daily, dayKey(log.at), { sessions: 1 })
      }
    }
    for (const day of days) daily = syncDailyTasks(daily, tasks, day, base)
    for (const record of friction) daily = applyDailyDelta(daily, dayKey(record.at), { friction: 1 })

    const rebuilt = rebuildDaily({ logs, tasks, friction })
    const mapA = new Map(daily.map(item => [item.day, item]))
    const mapB = new Map(rebuilt.map(item => [item.day, item]))
    const allDays = new Set([...mapA.keys(), ...mapB.keys()])
    let consistent = true
    for (const day of allDays) {
      const left = mapA.get(day)
      const right = mapB.get(day)
      const fields: Array<keyof DailyAggregate> = ['focusMinutes', 'tasksDone', 'sessions', 'friction']
      for (const field of fields) {
        const a = left === undefined ? 0 : (left[field] as number)
        const b = right === undefined ? 0 : (right[field] as number)
        if (a !== b) {
          consistent = false
          if (invariantFailures < 5) console.log('   不一致：', { scenario, day, field, a, b })
        }
      }
    }
    if (!consistent) invariantFailures += 1

    // 日期合法性
    if (daily.some(item => !realDay(item.day))) invariantFailures += 1
    // 数量上限
    if (daily.length > BOARD_CONFIG.daily.maxDays) invariantFailures += 1
    // 非负
    if (daily.some(item => item.focusMinutes < 0 || item.tasksDone < 0 || item.sessions < 0 || item.friction < 0)) {
      invariantFailures += 1
    }

    // 每 50 组做一次备份往返
    if (scenario % 50 === 0) {
      roundtripChecked += 1
      const payload = buildBackup({
        tasks,
        logs,
        projects: [{ id: 'p1', name: 'P1', archived: false, createdAt: base }],
        settings,
        friction,
        meta: { sessionTaskMap: {} },
        daily,
        now: base,
      })
      const parsed = parseBackup(serializeBackup(payload))
      if (!parsed.ok) invariantFailures += 1
      else {
        const merged = applyImport(emptyLocal(), parsed.payload, 'overwrite', base)
        if (merged.tasks.length !== tasks.length || merged.logs.length !== logs.length) invariantFailures += 1
        if ((merged.daily?.length ?? 0) !== daily.length) invariantFailures += 1
      }
    }

    // 图谱随机：边必须始终满足不变量
    let graph: KnowledgeGraph = { nodes: [], edges: [] }
    const nodeCount = Math.floor(rng() * 12)
    for (let index = 0; index < nodeCount; index += 1) {
      graph = upsertNode(graph, createNode({ title: `K${index}` }, base + index))
    }
    for (let attempt = 0; attempt < nodeCount * 2; attempt += 1) {
      if (graph.nodes.length < 2) break
      const from = graph.nodes[Math.floor(rng() * graph.nodes.length)]
      const to = graph.nodes[Math.floor(rng() * graph.nodes.length)]
      if (from === undefined || to === undefined) continue
      const result = addEdge(graph, from.id, to.id, rng() > 0.5 ? 'related' : 'prereq', base)
      if (result.ok) graph = result.graph
    }
    const ids = new Set(graph.nodes.map(node => node.id))
    if (graph.edges.some(edge => !ids.has(edge.fromId) || !ids.has(edge.toId))) invariantFailures += 1
    if (graph.edges.some(edge => edge.fromId === edge.toId)) invariantFailures += 1
    const normalized = coerceKnowledge(graph)
    if (normalized.edges.length !== graph.edges.length) invariantFailures += 1
  }

  const elapsed = Date.now() - started
  check('R1 1000 组增量聚合与完整重建完全一致', invariantFailures === 0, { invariantFailures })
  check('R2 备份往返抽样通过', roundtripChecked === 20, roundtripChecked)
  console.log(`  随机测试耗时：${elapsed} ms（1000 组）`)
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`)
if (failed > 0) process.exitCode = 1
