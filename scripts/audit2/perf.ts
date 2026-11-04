/**
 * perf.ts — 满规模数据集性能实测（第二轮审计第六节）。
 * 规模按运行时可容纳的上限取：任务 500（MAX_TASK_ENTRIES）、日志 400、阻碍 200、
 * 知识 1000 节点 / 900 边、日聚合 800 天、事件 1200、快照 12。
 */
import { buildBackup, parseBackup, serializeBackup, applyImport } from '../../src/client/lib/backup'
import { rebuildDaily } from '../../src/client/lib/daily'
import { buildHeatmap } from '../../src/client/lib/heatmap'
import { coerceKnowledge } from '../../src/client/lib/schema'
import { appendEvent, makeEvent } from '../../src/client/lib/timeline'
import { buildHistorySnapshot } from '../../src/client/lib/history'
import { createNode, addEdge } from '../../src/client/lib/knowledge'
import { dayKey } from '../../src/client/lib/time'
import type { BoardSettings, DailyAggregate, KnowledgeGraph, Project, SessionLog, Task, TimelineEvent, HistorySnapshot } from '../../src/client/types'

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

function ms(fn: () => void): string {
  const start = performance.now()
  fn()
  return (performance.now() - start).toFixed(1) + ' ms'
}

const project: Project = { id: 'p1', name: '满规模', archived: false, createdAt: NOW }
const tasks: Task[] = Array.from({ length: 500 }, (_, index) => ({
  id: `t${index}`,
  title: `任务 ${index}`,
  status: index % 3 === 0 ? 'done' : 'todo',
  done: index % 3 === 0,
  pomodoros: 0,
  projectId: 'p1',
  createdAt: NOW - (index % 60) * DAY,
  updatedAt: NOW,
  ...(index % 3 === 0 ? { completedAt: NOW - (index % 60) * DAY } : {}),
}))
const logs: SessionLog[] = Array.from({ length: 400 }, (_, index) => ({
  id: `l${index}`,
  at: NOW - index * 3_600_000,
  kind: index % 4 === 0 ? 'focus' : 'message',
  title: `日志 ${index}`,
  ...(index % 4 === 0 ? { minutes: 25 } : {}),
  source: 'auto',
  edited: false,
}))
const friction = Array.from({ length: 200 }, (_, index) => ({
  id: `f${index}`,
  at: NOW - index * DAY,
  updatedAt: NOW,
  summary: `阻碍 ${index}`,
  hits: 1,
  resolved: index % 2 === 0,
  projectId: 'p1',
}))
const daily: DailyAggregate[] = Array.from({ length: 800 }, (_, index) => {
  const date = new Date(2025, 0, 1 + index)
  return {
    day: dayKey(date.getTime()),
    focusMinutes: index % 150,
    tasksDone: index % 4,
    sessions: 2,
    friction: 0,
  }
})
let timeline: TimelineEvent[] = []
for (let index = 0; index < 1200; index += 1) {
  timeline = appendEvent(timeline, makeEvent({ type: 'focus.completed', title: `专注 ${index}`, refId: `f${index}` }, NOW - index * 61_000), { dedupeMs: 0 }).list
}
const history: HistorySnapshot[] = Array.from({ length: 12 }, (_, index) =>
  buildHistorySnapshot({ project, tasks, friction, now: NOW - index * DAY, label: `s${index}` }),
)
let graph: KnowledgeGraph = { nodes: [], edges: [] }
const nodes = Array.from({ length: 500 }, (_, index) => createNode({ title: `K${index}` }, NOW + index))
graph = { nodes, edges: [] }
for (let index = 0; index < 499; index += 1) {
  const from = nodes[index]
  const to = nodes[index + 1]
  if (from === undefined || to === undefined) continue
  const result = addEdge(graph, from.id, to.id, 'prereq', NOW)
  if (result.ok) graph = result.graph
}

console.log('数据规模：任务 500 / 日志 400 / 阻碍 200 / 日聚合 800 / 事件 1200 / 快照 12 / 知识 500 节点 499 边（运行时可容纳上限）')
console.log('rebuildDaily（含全部日志与任务）：', ms(() => void rebuildDaily({ logs, tasks, friction })))
console.log('buildHeatmap（800 天）：', ms(() => void buildHeatmap(daily, 2026, NOW)))
console.log('coerceKnowledge（500 节点 / 499 边）：', ms(() => void coerceKnowledge(graph)))

let text = ''
console.log('buildBackup + serialize：', ms(() => {
  const payload = buildBackup({
    tasks,
    logs,
    projects: [project],
    settings,
    friction,
    meta: { sessionTaskMap: {} },
    memory: [],
    knowledge: graph,
    reviews: [],
    timeline,
    history,
    daily,
    now: NOW,
  })
  text = serializeBackup(payload)
}))
console.log(`备份体积：${(text.length / 1024).toFixed(0)} KB`)
console.log('parseBackup：', ms(() => void parseBackup(text)))
const parsed = parseBackup(text)
console.log('applyImport（merge）：', ms(() => {
  if (parsed.ok) {
    applyImport(
      { tasks: [], logs: [], projects: [], friction: [], settings, meta: { sessionTaskMap: {} } },
      parsed.payload,
      'merge',
      NOW,
    )
  }
}))
console.log('parseBackup 解析结果：', parsed.ok ? `${parsed.payload.tasks.length} 任务 / ${parsed.payload.timeline?.length} 事件 / ${parsed.payload.knowledge?.nodes.length} 节点` : parsed.error)
