/**
 * probe2.ts — 第二轮审计探针（只读，不写入真实存储）。
 *
 * 与第一轮 probe 的区别：这里专打 **模块之间** 的边界，而不是单个函数。
 * 跑法同 audit-probe.ts。
 */
import { applyImport, buildBackup, parseBackup, previewImport, serializeBackup, filterByScope } from '../../src/client/lib/backup'
import { createLocalRepo, __resetMemoryStore } from '../../src/client/lib/repo/local'
import { STORAGE_KEYS, type BoardSettings, type HistorySnapshot, type ProjectMemory } from '../../src/client/types'
import { createEmptyMemory, applyMemoryPatch } from '../../src/client/lib/memory'
import { buildHistorySnapshot, pruneSnapshots } from '../../src/client/lib/history'
import { wrapEnvelope } from '../../src/client/lib/schema'

const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime()
const DAY = 86_400_000

function show(id: string, expect: string, actual: unknown): void {
  const text = typeof actual === 'string' ? actual : JSON.stringify(actual)
  console.log(`${id.padEnd(6)} 期望：${expect}\n       实际：${text}\n`)
}

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

/* ── L：配额耗尽时，repo 是否会把「有数据」误判成「存储被禁用」并读到空 ── */
console.log('=== L. 配额耗尽下的读语义 ===')
{
  __resetMemoryStore()
  const repo = createLocalRepo()
  const memory: ProjectMemory = createEmptyMemory('p1', NOW)
  // 先往 localStorage 里放一份真实数据（模拟用户已有的记忆）
  const raw = JSON.stringify(wrapEnvelope([memory]))
  const store = new Map<string, string>([[STORAGE_KEYS.memory, raw]])
  const original = (globalThis as { window?: unknown }).window
  try {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        get length() {
          return store.size
        },
        getItem(key: string): string | null {
          return store.get(key) ?? null
        },
        // 配额满：任何写入都抛 QuotaExceededError（getItem 仍然正常）
        setItem(): void {
          const error = new Error('QuotaExceededError')
          error.name = 'QuotaExceededError'
          throw error
        },
        removeItem(key: string): void {
          store.delete(key)
        },
      },
      dispatchEvent(): boolean {
        return true
      },
    }
    const readBack = repo.readMemory()
    show('L1', '配额满时仍能读到已有的记忆（1 条）', readBack.length)
    // 写一个**不同**的值：no-op 写入会被短路（说明配额满时相同内容仍算成功，合理）。
    const changed: ProjectMemory = { ...memory, intro: '新内容' }
    const writeOk = repo.writeMemory([changed])
    show('L2', '配额满时写入返回 false（如实报告）', writeOk)
  } finally {
    if (original === undefined) delete (globalThis as { window?: unknown }).window
    else (globalThis as { window?: unknown }).window = original
    __resetMemoryStore()
  }
}

/* ── P：备份是否保留 meta 里的记忆草稿 ── */
console.log('=== P. meta 字段的备份完整性 ===')
{
  const payload = buildBackup({
    tasks: [],
    logs: [],
    projects: [],
    settings,
    friction: [],
    meta: {
      sessionTaskMap: { s1: 't1' },
      memoryDrafts: {
        p1: {
          projectId: 'p1',
          at: NOW,
          source: 'ai',
          patch: { done: ['草稿项'] },
          rationale: '测试',
          items: [{ field: 'done', text: '草稿项', accepted: false }],
        },
      },
      upgradedFrom: 3,
      lastWeeklyAt: NOW - DAY,
    },
    now: NOW,
  })
  const parsed = parseBackup(serializeBackup(payload))
  show('P1', '导入后 meta 保留草稿 / upgradedFrom / lastWeeklyAt', parsed.ok ? {
    drafts: Object.keys(parsed.payload.meta.memoryDrafts ?? {}),
    upgradedFrom: parsed.payload.meta.upgradedFrom,
    lastWeeklyAt: parsed.payload.meta.lastWeeklyAt,
  } : parsed)
}

/* ── Z：导入后历史快照是否仍受「每项目 12 个」约束 ── */
console.log('=== Z. 导入后的数量上限 ===')
{
  const project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }
  const snapshots: HistorySnapshot[] = Array.from({ length: 20 }, (_, index) =>
    buildHistorySnapshot({ project, tasks: [], friction: [], now: NOW + index * DAY, label: `s${index}` }),
  )
  const payload = buildBackup({
    tasks: [],
    logs: [],
    projects: [project],
    settings,
    friction: [],
    meta: { sessionTaskMap: {} },
    history: snapshots,
    now: NOW,
  })
  const merged = applyImport(
    {
      tasks: [],
      logs: [],
      projects: [],
      friction: [],
      memory: [],
      knowledge: { nodes: [], edges: [] },
      reviews: [],
      timeline: [],
      history: [],
      daily: [],
      settings,
      meta: { sessionTaskMap: {} },
    },
    payload,
    'merge',
    NOW,
  )
  show('Z1', '导入后同项目快照 ≤ 12', merged.history?.length)
  show('Z2', 'pruneSnapshots 能把 20 个裁到 12', pruneSnapshots(snapshots, 12).length)
}

/* ── R：超大/超量备份是否被限制 ── */
console.log('=== R. 导入体积与条数上限 ===')
{
  const hugeTasks = Array.from({ length: 5000 }, (_, index) => ({
    id: `t${index}`,
    title: `任务 ${index}`,
    status: 'todo',
    done: false,
    pomodoros: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }))
  const raw = JSON.stringify({
    kind: 'sorchron-study-board-backup',
    version: 4,
    exportedAt: NOW,
    tasks: hugeTasks,
    logs: [],
    projects: [],
    settings,
    friction: [],
    meta: { sessionTaskMap: {} },
  })
  const parsed = parseBackup(raw)
  show('R1', '超量任务被拒或截断（服务端上限 500）', parsed.ok ? parsed.payload.tasks.length : parsed.error)
  show('R2', '文件体积（字符数）', raw.length)
}

/* ── K：导入中途写入失败，是否会把数据写成半截 ── */
console.log('=== K. 导入中途失败的可见后果 ===')
{
  const payload = buildBackup({
    tasks: [{ id: 't1', title: '任务', status: 'todo', done: false, pomodoros: 0, createdAt: NOW, updatedAt: NOW }],
    logs: [],
    projects: [{ id: 'p1', name: 'P', archived: false, createdAt: NOW }],
    settings,
    friction: [],
    meta: { sessionTaskMap: {} },
    memory: [createEmptyMemory('p1', NOW)],
    daily: [{ day: '2026-11-01', focusMinutes: 30, tasksDone: 1, sessions: 1, friction: 0 }],
    now: NOW,
  })
  // applyImport 本身是纯函数：它不知道写入会失败。这里验证「返回结果是否完整」，
  // 真正的写入失败要由 DataPanel 的写入序列承担（见报告 K 项）。
  const merged = applyImport(
    { tasks: [], logs: [], projects: [], friction: [], settings, meta: { sessionTaskMap: {} } },
    payload,
    'overwrite',
    NOW,
  )
  show('K1', 'applyImport 的返回是完整快照（写入失败需调用方处理）', {
    tasks: merged.tasks.length,
    memory: merged.memory?.length,
    daily: merged.daily?.length,
  })
  const preview = previewImport(
    { tasks: [], logs: [], projects: [], friction: [] },
    payload,
    'overwrite',
  )
  show('K2', '预览能报出新实体数量', preview.extra)
}

/* ── D：项目隔离下的同名 ID ── */
console.log('=== D. 隔离与 ID 复用 ===')
{
  const p1Memory = applyMemoryPatch(createEmptyMemory('p1', NOW), { intro: '项目一' }, 'manual', NOW)
  const p2Memory = applyMemoryPatch(createEmptyMemory('p2', NOW), { intro: '项目二' }, 'manual', NOW)
  const merged = applyImport(
    {
      tasks: [],
      logs: [],
      projects: [],
      friction: [],
      memory: [p1Memory],
      settings,
      meta: { sessionTaskMap: {} },
    },
    buildBackup({
      tasks: [],
      logs: [],
      projects: [],
      settings,
      friction: [],
      meta: { sessionTaskMap: {} },
      memory: [p2Memory],
      now: NOW,
    }),
    'merge',
    NOW,
  )
  show('D1', '两个项目的同名 id 记忆各自保留', merged.memory?.map(item => `${item.projectId}:${item.intro}`))

  const scoped = filterByScope(
    { tasks: [], logs: [], friction: [], projects: [], memory: [p1Memory, p2Memory] },
    'week',
    NOW,
  )
  show('D2', '增量导出仍带全量记忆（按项目隔离由使用方负责）', scoped.memory?.length)
}
