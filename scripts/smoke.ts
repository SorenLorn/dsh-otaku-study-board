/**
 * 逻辑自检（不进包，`scripts/` 不在 tsconfig 的 include 里）。
 *
 * 直接对着 lib/ 下的纯函数跑断言，覆盖三条最容易出错的链路：
 *   1. 事件归一化 + 分类（模块 4）
 *   2. 聚合口径（模块 1 / 5，尤其「专注分钟只来自 focus 日志」）
 *   3. 备份往返（模块 6，导出 → 序列化 → 解析 → 字段还在）
 *
 * 跑法：esbuild 打成 CJS 后直接用 node 执行（见下方命令）。
 */
import {
  DEFAULT_PROJECT_RULES,
  buildLogDraft,
  classifySession,
  classifyTitle,
  dedupeKey,
  normalizeHarnessEvent,
} from '../src/client/lib/detect'
import {
  assignLogMinutes,
  computeBoardStats,
  dailyFocusSeries,
  monthlyProgress,
  projectTotals,
  typeBreakdown,
  weekCompletion,
} from '../src/client/lib/stats'
import { countStreak } from '../src/client/lib/stats'
import { buildBackup, parseBackup, serializeBackup } from '../src/client/lib/backup'
import { dayKey, recentDayKeys } from '../src/client/lib/time'
import {
  SCHEMA_VERSION,
  coerceLog,
  coerceMeta,
  coercePayload,
  coerceSettings,
  coerceTask,
  restoreTimerState,
  unwrapEnvelope,
  wrapEnvelope,
} from '../src/client/lib/schema'
import {
  clampDurationMinutes,
  clampGoalMinutes,
  parseIntegerInput,
  sanitizeTitle,
} from '../src/client/lib/validate'
import { MAX_TITLE_LENGTH, STALE_TIMER_MS } from '../src/client/lib/defaults'
import { STORAGE_KEYS } from '../src/client/types'
import { createDedupeWindow, similarity } from '../src/client/lib/hash'
import { setAllSubtasks, subtaskProgress, toggleSubtask } from '../src/client/lib/subtask'
import { analyzeContext, buildPrunePlan, countPruneCandidates } from '../src/client/lib/context'
import { buildFrictionDraft, frictionStats, mergeFriction, resolveFriction } from '../src/client/lib/friction'
import {
  PROJECT_TEMPLATES,
  findTemplate,
  normalizeActiveId,
  projectRanking,
  scopedFriction,
  scopedLogs,
  scopedTasks,
} from '../src/client/lib/projects'
import { buildSnapshot, importSnapshot, parseSnapshot, serializeSnapshot } from '../src/client/lib/snapshot'
import { applyImport, filterByScope, previewImport } from '../src/client/lib/backup'
import { parseCommand } from '../src/client/lib/commands'
import { completeTask, reopenTask, deleteTask, createTask, updateTask, addFocusLog, addFriction, addFrictionMerged, resolveFriction as resolveFrictionAction, deleteKnowledgeNode, saveMemory, adoptDraft, deleteLog, buildImportSnapshot } from '../src/client/lib/actions'
import { decideRemoteChange, reportConflict, listConflicts, resolveConflict, clearConflicts } from '../src/client/lib/conflict'
import { createFakeStore, writeTransaction } from '../src/client/lib/tx'
import { applyDailyDelta, emptyDaily, getDaily, rebuildDaily, rebuildDay, summarizeDaily, syncDailyTasks } from '../src/client/lib/daily'
import { appendEvent, countByCategory, filterEvents, groupByDay, makeEvent, rangeOf } from '../src/client/lib/timeline'
import {
  acceptDraft,
  applyMemoryPatch,
  buildDraftFromLogs,
  createEmptyMemory,
  memoryCompleteness,
  memoryOf,
  memoryToMarkdown,
  memoryToPrompt,
  upsertMemory,
} from '../src/client/lib/memory'
import {
  addEdge,
  applyReviewResult,
  createNode,
  graphStats,
  linkTo,
  neighborsOf,
  nodesForFriction,
  removeNode,
  searchNodes,
  unlinkFrom,
  upsertNode,
  wouldCreateCycle,
} from '../src/client/lib/knowledge'
import { createReview, dueNodes, pruneReviews, reviewStats, schedule, suggestForm } from '../src/client/lib/review'
import { availableYears, buildHeatmap, levelOf } from '../src/client/lib/heatmap'
import { buildHistorySnapshot, diffHistory, needsAutoSnapshot, pruneSnapshots, snapshotsOf } from '../src/client/lib/history'
import { __resetMemoryStore, createLocalRepo, resetStorageModeCache } from '../src/client/lib/repo/local'
import {
  coerceDaily,
  coerceDraftPatch,
  coerceKnowledge,
  coerceMemory,
  coerceMemoryDrafts,
  coerceReview,
  coerceTimelineEvent,
} from '../src/client/lib/schema'
import type { BoardSettings, FrictionRecord, KnowledgeGraph, Project } from '../src/client/types'
import type { HarnessEvent, SessionLog, Task } from '../src/client/types'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : detail)
  }
}

function event(payload: unknown, type = 'bridge/message'): HarnessEvent {
  return { type, at: Date.UTC(2026, 9, 27, 4, 0, 0), payload }
}

const NOW = new Date(2026, 9, 27, 12, 0, 0).getTime()
const HOUR = 3_600_000

console.log('\n[1] 事件归一化与分类')

{
  const normalized = normalizeHarnessEvent(event({ text: '```ts\nconst a = 1\n```' }))
  check('fenced 代码块被识别', normalized.codeBlocks.length === 1, normalized.codeBlocks)
  check('语言标记正确', normalized.codeBlocks[0]?.lang === 'ts', normalized.codeBlocks[0])
}

{
  const normalized = normalizeHarnessEvent(event({ message: { role: 'user', content: [{ type: 'text', text: '怎么用 useEffect' }] } }))
  check('嵌套 content 数组被摊平', normalized.text.includes('useEffect'), normalized.text)
  check('role 被读出', normalized.role === 'user')
}

check('报错文本 → 调试排错', classifySession('TypeError: Cannot read property x of undefined', []) === 'debug')
check(
  '网页代码块 → 代码开发',
  classifySession('写一个组件', [{ lang: 'tsx', chars: 20, lines: 2 }]) === 'dev',
)
check('架构讨论 → 方案构思', classifySession('帮我设计一下插件的架构方案', []) === 'design')
check('查文档 → 文档阅读', classifySession('React 官方文档教程里怎么写的', []) === 'reading')
check('闲聊 → 其他', classifySession('今天天气不错', []) === 'other')
check('标题分类：调试优先', classifyTitle('调试 useTimer 的报错') === 'debug')

{
  const longCode = '```ts\n' + 'const x = 1\n'.repeat(200) + '```'
  const normalized = normalizeHarnessEvent(event({ text: longCode }))
  const draft = buildLogDraft(normalized, { rules: DEFAULT_PROJECT_RULES, now: NOW })
  check('超长代码被截断标注', draft?.detail?.includes('截断') === true, draft?.detail)
  check('摘要里不含源码', draft !== undefined && !(draft.detail ?? '').includes('const x'), draft?.detail)
  check('摘要含语言与行数', draft?.title.includes('TS') === true && draft?.title.includes('行') === true, draft?.title)
}

{
  const draft = buildLogDraft(normalizeHarnessEvent(event({ text: '' })), {
    rules: DEFAULT_PROJECT_RULES,
    now: NOW,
  })
  check('空事件不产生记录', draft === undefined)
}

{
  const draft = buildLogDraft(
    normalizeHarnessEvent(event({ text: 'dsh 插件注册失败，帮我排查一下报错' })),
    { rules: DEFAULT_PROJECT_RULES, now: NOW },
  )
  check('关键词自动绑定项目', draft?.project === 'DSH 插件开发', draft?.project)
  check('去重键稳定', draft !== undefined && dedupeKey(draft) === dedupeKey({ ...draft }))
}

console.log('\n[2] 聚合口径')

const tasks: Task[] = [
  {
    id: 't1',
    title: '写 useTimer',
    status: 'done',
    done: true,
    pomodoros: 0,
    focusedMinutes: 50,
    createdAt: NOW - 2 * HOUR,
    updatedAt: NOW,
    completedAt: NOW - HOUR,
  },
  {
    id: 't2',
    title: '读文档',
    status: 'todo',
    done: false,
    pomodoros: 2,
    createdAt: NOW - 30 * HOUR,
    updatedAt: NOW,
  },
]

const logs: SessionLog[] = [
  {
    id: 'l1',
    at: NOW - HOUR,
    kind: 'focus',
    sessionType: 'dev',
    title: '25 分钟专注',
    source: 'manual',
    edited: false,
    minutes: 25,
    project: '溯时工作台',
  },
  {
    id: 'l2',
    at: NOW - 40 * 60_000,
    kind: 'focus',
    sessionType: 'reading',
    title: '25 分钟专注',
    source: 'manual',
    edited: false,
    minutes: 25,
    project: '前端学习',
  },
  {
    id: 'l3',
    at: NOW - 20 * 60_000,
    kind: 'code-block',
    sessionType: 'dev',
    title: 'TSX · 12 行',
    source: 'auto',
    edited: false,
  },
]

{
  const stats = computeBoardStats(tasks, logs, NOW)
  check('今日完成数', stats.tasksDoneToday === 1, stats.tasksDoneToday)
  check('任务总数', stats.tasksTotal === 2)
  check('当日专注 = 只有 focus 日志', stats.focusMinutesToday === 50, stats.focusMinutesToday)
  check('今日日志数', stats.logsToday === 3, stats.logsToday)
  check('连续天数为正', stats.streakDays >= 1, stats.streakDays)
}

{
  const keys = recentDayKeys(7, NOW)
  const series = dailyFocusSeries(logs, keys)
  check('七日序列长度', series.length === 7)
  check('今天落在最后一天', series[6]?.key === dayKey(NOW), series[6])
  check('今日柱值', series[6]?.minutes === 50, series[6])
}

{
  const slices = typeBreakdown(logs, dayKey(NOW))
  const total = slices.reduce((sum, slice) => sum + slice.minutes, 0)
  check('饼图总时长 = 两类之和', total === 55, { total, slices })
  check('自动记录按间隔估算', slices.some(slice => slice.type === 'dev' && slice.minutes === 30), slices)
}

{
  const rows = projectTotals(logs)
  check('项目聚合条数', rows.length === 3, rows)
  check('最长项目在前', rows[0]?.minutes === 25, rows[0])
}

{
  const week = weekCompletion(tasks, NOW)
  check('本周新增 / 完成', week.created === 2 && week.done === 1, week)
  check('完成率上限 1', week.rate <= 1)
}

{
  const progress = monthlyProgress(tasks, logs, { month: '2026-10', targetMinutes: 100, targetTasks: 2 }, NOW)
  check('月进度：时长', progress.focusMinutes === 50)
  check('月进度：月标记命中', progress.inCurrentMonth === true)
  check('月进度：比率', Math.abs(progress.minutesRate - 0.5) < 1e-6, progress.minutesRate)
}

{
  const withMinutes = assignLogMinutes(logs)
  check('每条记录都有分钟数', withMinutes.every(item => item.minutes > 0), withMinutes)
}

console.log('\n[3] 备份往返')

{
  const payload = buildBackup({
    tasks,
    logs,
    projects: [],
    settings: {
      autoCapture: true,
      lastDurationMinutes: 45,
      projectRules: DEFAULT_PROJECT_RULES,
      monthlyGoal: { month: '2026-10', targetMinutes: 1200, targetTasks: 20 },
    },
    now: NOW,
  })
  const text = serializeBackup(payload)
  const parsed = parseBackup(text)
  check('往返成功', parsed.ok === true, parsed.ok ? '' : parsed.error)
  if (parsed.ok) {
    check('任务数一致', parsed.payload.tasks.length === 2)
    check('日志数一致', parsed.payload.logs.length === 3)
    check('设置保留', parsed.payload.settings.lastDurationMinutes === 45)
    check('规则保留', parsed.payload.settings.projectRules.length === DEFAULT_PROJECT_RULES.length)
  }
}

{
  const bad = parseBackup('{"kind":"something-else","tasks":[]}')
  check('错误 kind 被拒', bad.ok === false, bad)
  const broken = parseBackup('not json')
  check('非 JSON 被拒', broken.ok === false)
  const partial = parseBackup(
    JSON.stringify({ kind: 'sorchron-study-board-backup', version: 2, tasks: [{ id: 'x', title: 'ok' }], logs: [] }),
  )
  check('缺字段的历史数据可被兜底', partial.ok === true && partial.payload.tasks.length === 1, partial)
}

console.log('\n[5] 存储版本 / 兜底 / 输入校验')
{
  // ── 信封与 V1 兼容 ──────────────────────────────────────────────────────
  const legacy = unwrapEnvelope([{ id: 'a', title: 'old task' }])
  check('裸数组被识别为 V1 历史数据', legacy.legacy === true && legacy.version === 1, legacy)

  const modern = unwrapEnvelope(wrapEnvelope([{ id: 'b' }]))
  check('信封能正确拆出', modern.legacy === false && modern.version === SCHEMA_VERSION, modern)

  const noVersion = unwrapEnvelope({ data: [1, 2, 3] })
  check('只有 data 没有版本号时按 V1 处理', noVersion.version === 1 && noVersion.legacy === false, noVersion)

  // ── 单条记录兜底 ────────────────────────────────────────────────────────
  const minimalTask = coerceTask({ id: 't1', title: '  写文档  ' })
  check(
    '缺字段的任务被补齐默认值',
    minimalTask !== undefined && minimalTask.status === 'todo' && minimalTask.done === false && minimalTask.pomodoros === 0,
    minimalTask,
  )
  check('标题被 trim', minimalTask?.title === '写文档', minimalTask?.title)

  check('空白标题的任务被丢弃', coerceTask({ id: 't2', title: '   ' }) === undefined)
  check('非对象被丢弃', coerceTask('not-an-object') === undefined)
  check('缺 id 被丢弃', coerceTask({ title: 'x' }) === undefined)

  const dirtyTask = coerceTask({
    id: 't3',
    title: 'x'.repeat(500),
    status: 'weird-status',
    pomodoros: -8,
    estimateMinutes: 1e9,
    priority: 'unknown',
  })
  check('超长标题被截断', dirtyTask?.title.length === MAX_TITLE_LENGTH, dirtyTask?.title.length)
  check('非法状态退回 todo', dirtyTask?.status === 'todo', dirtyTask?.status)
  check('负数番茄数夹到 0', dirtyTask?.pomodoros === 0, dirtyTask?.pomodoros)
  check('非法优先级被丢弃', dirtyTask?.priority === undefined, dirtyTask?.priority)

  const doneTask = coerceTask({ id: 't4', title: 'done', status: 'done' })
  check('status=done 时 done 标志同步为 true', doneTask?.done === true, doneTask)

  // ── 日志兜底 ────────────────────────────────────────────────────────────
  const dirtyLog = coerceLog({ id: 'l1', title: 'x', kind: 'hacked-kind', sessionType: 'nope' })
  check('未知 kind 退回 manual', dirtyLog?.kind === 'manual', dirtyLog?.kind)
  check('未知 sessionType 被移除', dirtyLog?.sessionType === undefined, dirtyLog)

  const focusLog = coerceLog({ id: 'l2', title: '专注', kind: 'focus', minutes: 9e9 })
  check('focus 日志的分钟数被夹到上限', focusLog?.minutes !== undefined && focusLog.minutes <= 24 * 60, focusLog?.minutes)

  // ── 列表：坏一条不拖垮整表 ───────────────────────────────────────────────
  const mixed = coercePayload(STORAGE_KEYS.tasks, [
    { id: 'a', title: 'ok-1' },
    null,
    'garbage',
    { id: 'b', title: 'ok-2' },
  ])
  check('脏数据只丢自己那条', Array.isArray(mixed) && mixed.length === 2, mixed)
  check('非数组输入返回空表', Array.isArray(coercePayload(STORAGE_KEYS.tasks, { nope: 1 })))

  // ── 设置兜底 ────────────────────────────────────────────────────────────
  const defaults = coerceSettings(undefined)
  check('undefined 设置退回默认值', defaults.lastDurationMinutes === 25 && defaults.autoCapture === true, defaults)

  const brokenSettings = coerceSettings({
    autoCapture: 'yes',
    lastDurationMinutes: 9999,
    projectRules: [{ keyword: 'react', project: 'React 学习' }, { keyword: '', project: 'x' }],
    monthlyGoal: { month: '2026-13', targetMinutes: -1, targetTasks: 1e18 },
  })
  check('非法时长夹到 90', brokenSettings.lastDurationMinutes === 90, brokenSettings.lastDurationMinutes)
  check('autoCapture 非 false 时保持开启', brokenSettings.autoCapture === true)
  check('空白关键词的规则被剔除', brokenSettings.projectRules.length === 1, brokenSettings.projectRules)
  check('非法月份被清空', brokenSettings.monthlyGoal.month === '', brokenSettings.monthlyGoal.month)
  const goodMonth = coerceSettings({ monthlyGoal: { month: '2026-10', targetMinutes: 100, targetTasks: 5 } })
  check('合法月份被保留', goodMonth.monthlyGoal.month === '2026-10', goodMonth.monthlyGoal.month)
  check('负数目标夹到 0', brokenSettings.monthlyGoal.targetMinutes === 0)
  check('超大任务目标被夹取', brokenSettings.monthlyGoal.targetTasks === 10_000, brokenSettings.monthlyGoal.targetTasks)

  // ── 计时状态：残留 / 时间戳异常 ──────────────────────────────────────────
  const liveTimer = restoreTimerState({
    running: true,
    deadline: NOW + 10 * 60_000,
    durationMinutes: 25,
    startedAt: NOW - 15 * 60_000,
    remainingSeconds: 600,
  }, NOW)
  check('正常运行的计时被保留', liveTimer.state.running === true && liveTimer.warning === undefined, liveTimer)

  const staleTimer = restoreTimerState({
    running: true,
    deadline: NOW - STALE_TIMER_MS - 60_000,
    durationMinutes: 25,
    startedAt: NOW - STALE_TIMER_MS - 30 * 60_000,
  }, NOW)
  check('超过 24 小时的残留被重置', staleTimer.state.running === false && staleTimer.state.deadline === null, staleTimer)
  check('残留重置会给出提示', typeof staleTimer.warning === 'string' && staleTimer.warning.length > 0, staleTimer.warning)

  const futureTimer = restoreTimerState({
    running: true,
    deadline: NOW + 5 * 24 * 3_600_000,
    durationMinutes: 25,
  }, NOW)
  check('指向未来的异常时间戳被重置', futureTimer.state.running === false, futureTimer.state)
  check('时间戳异常会给出提示', typeof futureTimer.warning === 'string', futureTimer.warning)

  const noTimer = restoreTimerState(null, NOW)
  check('空计时状态退回默认值', noTimer.state.running === false && noTimer.state.durationMinutes === 25, noTimer.state)

  // ── 边界夹取与输入解析 ──────────────────────────────────────────────────
  check('时长 abc → 回退默认 25', clampDurationMinutes('abc') === 25)
  check('时长 5 → 夹到 10', clampDurationMinutes(5) === 10)
  check('时长 999 → 夹到 90', clampDurationMinutes(999) === 90)
  check('目标 1e18 → 夹到上限', clampGoalMinutes(1e18) === 1_000_000)
  check('NaN 目标 → 回退 0', clampGoalMinutes(Number.NaN) === 0)
  check('超长输入被截断到 120', sanitizeTitle('字'.repeat(300)).length === MAX_TITLE_LENGTH)
  check('parseIntegerInput 拒绝 abc', parseIntegerInput('abc') === null)
  check('parseIntegerInput 拒绝空串', parseIntegerInput('  ') === null)
  check('parseIntegerInput 接受 45', parseIntegerInput('45') === 45)
  check('parseIntegerInput 接受负数（交给区间校验）', parseIntegerInput('-5') === -5)
}

console.log('\n[6] 子任务与主任务一致性')
{
  const empty = subtaskProgress({ subtasks: [] })
  check('没有子任务时进度为 0', empty.total === 0 && empty.rate === 0 && empty.allDone === false, empty)

  let task: Task = {
    id: 't-sub',
    title: '拆解任务',
    status: 'todo',
    done: false,
    pomodoros: 0,
    createdAt: NOW,
    updatedAt: NOW,
    subtasks: [
      { id: 's1', title: '第一步', done: false, createdAt: NOW },
      { id: 's2', title: '第二步', done: false, createdAt: NOW },
    ],
  }

  task = toggleSubtask(task, 's1', NOW + 1000)
  check('勾一条后主任务仍未完成', task.done === false, task.done)
  check('进度为 1/2', subtaskProgress(task).done === 1, subtaskProgress(task))

  task = toggleSubtask(task, 's2', NOW + 2000)
  check('勾完最后一条 → 主任务自动完成', task.done === true && task.status === 'done', task)
  check('自动写入 completedAt', task.completedAt === NOW + 2000, task.completedAt)

  task = toggleSubtask(task, 's1', NOW + 3000)
  check('取消一条 → 主任务退回未完成', task.done === false && task.status === 'todo', task)
  check('退回时清掉 completedAt', task.completedAt === undefined, task.completedAt)

  task = setAllSubtasks(task, true, NOW + 4000)
  check('批量勾选全部完成', task.done === true && subtaskProgress(task).allDone === true, task)

  const noSub = setAllSubtasks({ ...task, subtasks: [] }, true, NOW)
  check('没有子任务时不动主任务状态', noSub.done === true, noSub.done)
}

console.log('\n[7] 内容哈希去重与相似度')
{
  const window = createDedupeWindow(60_000, 10)
  check('第一次放行', window.admit('sig-a', NOW) === true)
  check('同签名短时间内再次进入被拦截', window.admit('sig-a', NOW + 1000) === false)
  check('不同签名放行', window.admit('sig-b', NOW + 1000) === true)
  check('窗口过期后放行', window.admit('sig-c', NOW + 70_000) === true)
  window.clear()
  check('clear 后计数归零', window.size() === 0)

  const similar = similarity(
    'TypeError: Cannot read properties of undefined (reading "map")',
    'TypeError: Cannot read properties of null (reading "map")',
  )
  check('同一类报错相似度 > 0.55', similar > 0.55, similar)
  check('完全不同的文本相似度低', similarity('今天天气不错', '重构 useTimer 的 deadline') < 0.2)
}

console.log('\n[8] 上下文统计与精简计划')
{
  const logs: SessionLog[] = [
    { id: 'c1', at: NOW - 3000, kind: 'message', sessionType: 'dev', title: '帮我看看 useTimer', role: 'user', source: 'auto', edited: false },
    { id: 'c2', at: NOW - 2000, kind: 'code-block', sessionType: 'dev', title: 'TS · 12 行', role: 'assistant', detail: '未保存源码（120 字符）', source: 'auto', edited: false },
    { id: 'c3', at: NOW - 1000, kind: 'message', sessionType: 'debug', title: 'TypeError', role: 'assistant', source: 'auto', edited: false },
  ]
  const stats = analyzeContext(logs, { warnMessages: 2, dangerMessages: 3 }, NOW)
  check('消息条数正确', stats.messages === 3, stats.messages)
  check('识别出代码块', stats.codeBlocks === 1, stats.codeBlocks)
  check('识别出报错', stats.errorMessages === 1, stats.errorMessages)
  check('达到 danger 阈值', stats.level === 'danger', stats.level)
  check('构成里有用户/代码/报错', ['user', 'code', 'error'].every(key => stats.slices.some(slice => slice.key === key)), stats.slices)
  check('token 为正数', stats.tokens > 0, stats.tokens)

  const dupLogs: SessionLog[] = Array.from({ length: 14 }, (_, index) => ({
    id: `dup-${index}`,
    at: NOW - index * 1000,
    kind: 'message' as const,
    sessionType: (index < 4 ? 'debug' : 'dev') as SessionLog['sessionType'],
    title: index % 2 === 0 ? '重复的问题' : `问题 ${index}`,
    source: 'auto' as const,
    edited: false,
  }))
  check('重复标题被计为可精简', countPruneCandidates(dupLogs) > 0, countPruneCandidates(dupLogs))

  const plan = buildPrunePlan(dupLogs, NOW)
  check('精简计划保留最近 10 条', plan.keep <= 10, plan.keep)
  check('计划里有摘要正文', plan.summary.includes('【会话摘要'), plan.summary.slice(0, 20))
}

console.log('\n[9] 阻碍识别与合并')
{
  const debugDraft = {
    at: NOW,
    kind: 'message' as const,
    sessionType: 'debug' as const,
    title: 'TypeError: Cannot read properties of undefined',
    detail: 'TypeError: Cannot read properties of undefined (reading "map")\n    at TaskList (TaskList.tsx:42:18)',
    source: 'auto' as const,
    edited: false,
    projectId: 'p1',
  }
  const draft = buildFrictionDraft(debugDraft)
  check('排错类日志生成阻碍草表', draft !== undefined && draft.summary.length > 0, draft)
  check('摘要里不含源码路径噪声', draft !== undefined && !draft.summary.includes('TaskList.tsx:42'), draft?.summary)

  const devDraft = { ...debugDraft, sessionType: 'dev' as const }
  check('开发类日志不生成阻碍', buildFrictionDraft(devDraft) === undefined)

  const first = mergeFriction([], draft!, NOW)
  check('第一条不合并', first.merged === false && first.records.length === 1, first)
  const second = mergeFriction(first.records, { ...draft!, at: NOW + 1000 }, NOW + 1000)
  check('相似报错被合并', second.merged === true && second.records.length === 1, second)
  check('hits 累加', second.records[0]?.hits === 2, second.records[0]?.hits)

  const solved = resolveFriction(second.records, second.id, '加空值判断', NOW + 60_000)
  check('填方案后标记已解决', solved[0]?.resolved === true, solved[0])
  check('记录解决耗时', (solved[0]?.resolveMs ?? 0) > 0, solved[0]?.resolveMs)

  const stats = frictionStats(solved, NOW + 120_000)
  check('本周阻碍次数 ≥ 2', stats.weekHits >= 2, stats.weekHits)
  check('未解决数为 0', stats.open === 0, stats.open)
  check('平均耗时为正', stats.avgResolveMs > 0, stats.avgResolveMs)
}

console.log('\n[10] 项目隔离与排行')
{
  const projects: Project[] = [
    { id: 'p1', name: '插件开发', archived: false, createdAt: NOW },
    { id: 'p2', name: '前端学习', archived: false, createdAt: NOW },
    { id: 'p3', name: '已归档项目', archived: true, createdAt: NOW, archivedAt: NOW },
  ]
  const tasks: Task[] = [
    { id: 'a1', title: '任务 A', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
    { id: 'a2', title: '任务 B', status: 'done', done: true, pomodoros: 0, projectId: 'p2', createdAt: NOW, updatedAt: NOW, completedAt: NOW },
    { id: 'a3', title: '归档任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p3', createdAt: NOW, updatedAt: NOW },
    { id: 'a4', title: '未归属任务', status: 'todo', done: false, pomodoros: 0, createdAt: NOW, updatedAt: NOW },
  ]
  check('切到 p1 只剩自己的任务', scopedTasks(tasks, 'p1', projects).length === 1)
  check('全部项目排除归档数据', scopedTasks(tasks, '', projects).every(task => task.projectId !== 'p3'))
  check('全部项目保留未归属数据', scopedTasks(tasks, '', projects).some(task => task.projectId === undefined))
  check('归档项目 id 不再被当作活跃', normalizeActiveId('p3', projects) === '', normalizeActiveId('p3', projects))

  const logs: SessionLog[] = [
    { id: 'l1', at: NOW, kind: 'focus', title: '专注', minutes: 25, projectId: 'p1', source: 'manual', edited: false },
    { id: 'l2', at: NOW, kind: 'focus', title: '专注', minutes: 50, projectId: 'p2', source: 'manual', edited: false },
    { id: 'l3', at: NOW, kind: 'message', title: '提问', projectId: 'p2', source: 'auto', edited: false },
  ]
  check('日志按项目隔离', scopedLogs(logs, 'p2', projects).length === 2, scopedLogs(logs, 'p2', projects).length)

  const ranking = projectRanking(logs, tasks, projects, '')
  check('排行第一是专注更长的项目', ranking[0]?.minutes === 50, ranking)
  check('排行不含归档项目', ranking.every(row => row.projectId !== 'p3'))
  const archivedLogs: SessionLog[] = [
    ...logs,
    { id: 'l4', at: NOW, kind: 'focus', title: '归档项目的专注', minutes: 10, projectId: 'p3', source: 'manual', edited: false },
  ]
  check(
    '显式切到归档项目时仍可查看历史',
    projectRanking(archivedLogs, tasks, projects, 'p3')[0]?.archived === true,
    projectRanking(archivedLogs, tasks, projects, 'p3'),
  )

  const friction: FrictionRecord[] = [
    { id: 'f1', at: NOW, updatedAt: NOW, summary: 'x', hits: 1, resolved: false, projectId: 'p1' },
    { id: 'f2', at: NOW, updatedAt: NOW, summary: 'y', hits: 1, resolved: false, projectId: 'p3' },
  ]
  check('阻碍记录同样按项目隔离', scopedFriction(friction, '', projects).length === 1)

  check('内置三套模板', PROJECT_TEMPLATES.length === 3)
  check('模板能按 id 找到', findTemplate('template-plugin') !== undefined)
  check('模板带任务清单', (findTemplate('template-debug')?.tasks.length ?? 0) >= 3)
}

console.log('\n[11] 项目快照往返')
{
  const project: Project = { id: 'p1', name: '插件开发', note: '自测项目', archived: false, createdAt: NOW }
  const tasks: Task[] = [
    { id: 'a1', title: '任务 A', status: 'done', done: true, pomodoros: 1, focusedMinutes: 25, projectId: 'p1', createdAt: NOW, updatedAt: NOW, completedAt: NOW },
    { id: 'a2', title: '任务 B', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
  ]
  const friction: FrictionRecord[] = [
    { id: 'f1', at: NOW, updatedAt: NOW, summary: 'TypeError', hits: 3, resolved: false, projectId: 'p1', taskId: 'a2' },
  ]
  const logs: SessionLog[] = [
    { id: 'l1', at: NOW, kind: 'message', sessionType: 'dev', title: '讨论实现', projectId: 'p1', source: 'auto', edited: false },
    { id: 'l2', at: NOW, kind: 'focus', title: '专注', minutes: 25, projectId: 'p1', source: 'manual', edited: false },
  ]

  const snapshot = buildSnapshot({ project, tasks, friction, logs, now: NOW })
  check('快照统计任务数', snapshot.totals.tasks === 2, snapshot.totals)
  check('快照统计完成数', snapshot.totals.tasksDone === 1)
  check('快照只带非 focus 摘要', snapshot.highlights.length === 1, snapshot.highlights)
  check('快照统计专注分钟', snapshot.totals.focusMinutes === 25, snapshot.totals.focusMinutes)

  const roundtrip = parseSnapshot(serializeSnapshot(snapshot))
  check('快照序列化往返成功', roundtrip.ok === true, roundtrip.ok ? '' : roundtrip.error)

  const bad = parseSnapshot('{"kind":"not-a-snapshot"}')
  check('非快照文件被拒', bad.ok === false)

  if (roundtrip.ok) {
    const imported = importSnapshot(roundtrip.snapshot, { projectNames: ['插件开发'], now: NOW })
    check('导入生成新项目 id', imported.project.id !== project.id)
    check('重名时自动加后缀', imported.project.name !== '插件开发', imported.project.name)
    check('任务数量一致', imported.tasks.length === 2)
    check('任务 id 被重编号', imported.tasks.every(task => task.id !== 'a1' && task.projectId === imported.project.id))
    check('阻碍记录跟着换项目', imported.friction.every(item => item.projectId === imported.project.id))
    check('阻碍的任务引用被映射到新 id', imported.friction[0]?.taskId === imported.tasks[1]?.id, {
      mapped: imported.friction[0]?.taskId,
      expected: imported.tasks[1]?.id,
    })
  }
}

console.log('\n[12] 增量导出与导入合并')
{
  const old = NOW - 30 * 24 * 60 * 60 * 1000
  const tasks: Task[] = [
    { id: 'old', title: '很久以前', status: 'todo', done: false, pomodoros: 0, createdAt: old, updatedAt: old },
    { id: 'recent', title: '最近创建', status: 'todo', done: false, pomodoros: 0, createdAt: NOW, updatedAt: NOW },
    { id: 'done-now', title: '今天完成', status: 'done', done: true, pomodoros: 0, createdAt: old, updatedAt: old, completedAt: NOW },
  ]
  const logs: SessionLog[] = [
    { id: 'l-old', at: old, kind: 'message', title: '旧日志', source: 'auto', edited: false },
    { id: 'l-new', at: NOW, kind: 'message', title: '新日志', source: 'auto', edited: false },
  ]
  const filtered = filterByScope({ tasks, logs, friction: [], projects: [] }, 'week', NOW)
  check('近 7 天导出丢掉旧任务', filtered.tasks.every(task => task.id !== 'old'), filtered.tasks.map(t => t.id))
  check('近 7 天导出保留今天完成的老任务', filtered.tasks.some(task => task.id === 'done-now'))
  check('近 7 天导出只留新日志', filtered.logs.length === 1 && filtered.logs[0]?.id === 'l-new')

  const settings: BoardSettings = {
    autoCapture: true,
    lastDurationMinutes: 25,
    projectRules: [],
    monthlyGoal: { month: '2026-10', targetMinutes: 100, targetTasks: 5 },
    activeProjectId: '',
    breakEnabled: true,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    roundsBeforeLongBreak: 4,
    contextWarnMessages: 40,
    contextDangerMessages: 80,
  }
  const local = {
    tasks: [{ ...tasks[1]!, title: '本地改过的标题' }],
    logs: [logs[1]!],
    projects: [] as Project[],
    friction: [] as FrictionRecord[],
    settings,
    meta: { sessionTaskMap: {} },
  }
  const incoming = {
    kind: 'sorchron-study-board-backup' as const,
    version: 3 as const,
    exportedAt: NOW,
    tasks: [{ ...tasks[0]!, title: '备份里的标题' }, { ...tasks[2]! }],
    logs: [logs[0]!],
    projects: [] as Project[],
    settings,
    friction: [] as FrictionRecord[],
    meta: { sessionTaskMap: {} },
  }

  const preview = previewImport(local, incoming, 'merge')
  check('预览统计本地条数', preview.local.tasks === 1, preview.local)
  check('预览统计备份条数', preview.incoming.tasks === 2)
  check('预览无冲突（id 不同）', preview.conflicts.tasks === 0, preview.conflicts)

  const merged = applyImport(local, incoming, 'merge', NOW)
  check('合并后保留本地独有记录', merged.tasks.some(task => task.title === '本地改过的标题'))
  check('合并后新增备份记录', merged.tasks.length === 3, merged.tasks.length)
  check('合并后日志按时间倒序', (merged.logs[0]?.at ?? 0) >= (merged.logs[1]?.at ?? 0))

  const overwritten = applyImport(local, incoming, 'overwrite', NOW)
  check('覆盖后只剩备份数据', overwritten.tasks.length === 2, overwritten.tasks.length)
  check('覆盖后本地标题消失', overwritten.tasks.every(task => task.title !== '本地改过的标题'))
}

console.log('\n[13] 斜杠命令解析')
{
  const todo = parseCommand('/board-todo 写一份自测清单')
  check('解析 /board-todo 与参数', todo?.name === '/board-todo' && todo.args === '写一份自测清单', todo)
  check('命令名大小写不敏感', parseCommand('/BOARD-REPORT')?.name === '/board-report')
  check('无参数时 args 为空串', parseCommand('/board-report')?.args === '')
  check('非本插件命令返回 null', parseCommand('/clear') === null)
  check('普通消息返回 null', parseCommand('帮我看看这个报错') === null)
  check('空字符串返回 null', parseCommand('') === null)
  check('参数保留内部空格', parseCommand('/board-todo   a   b')?.args === 'a   b', parseCommand('/board-todo   a   b'))
}

console.log('\n[14] V3 schema 兼容')
{
  const envelope = wrapEnvelope([{ id: 'x' }])
  check('写入版本号为 4', envelope.schemaVersion === 4, envelope.schemaVersion)

  const breakTimer = restoreTimerState(
    { running: false, deadline: null, durationMinutes: 99, remainingSeconds: 600, phase: 'short', roundInCycle: 2 },
    NOW,
  )
  check('休息阶段时长按休息上限夹取', breakTimer.state.durationMinutes <= 30, breakTimer.state.durationMinutes)
  check('阶段被保留', breakTimer.state.phase === 'short', breakTimer.state.phase)
  check('环序号被保留', breakTimer.state.roundInCycle === 2, breakTimer.state.roundInCycle)

  const badPhase = restoreTimerState({ phase: 'hacked' }, NOW)
  check('非法阶段退回 focus', badPhase.state.phase === 'focus', badPhase.state.phase)

  const taskWithSubs = coerceTask({
    id: 's1',
    title: '带子任务',
    subtasks: [
      { id: 'x1', title: '一', done: true },
      { id: 'x2', title: '二', done: true },
    ],
  })
  check('子任务全部完成时主任务自动完成', taskWithSubs?.done === true, taskWithSubs)

  const badDue = coerceTask({ id: 's2', title: '坏截止', dueAt: -5 })
  check('非法截止时间被丢弃', badDue?.dueAt === undefined, badDue?.dueAt)

  const meta = coerceMeta({ sessionTaskMap: { a: 't1', b: '', ' ': 't2' }, lastContextPruneAt: NOW })
  check('meta 只保留有效绑定', Object.keys(meta.sessionTaskMap).length === 1, meta.sessionTaskMap)
  check('meta 保留精简时间', meta.lastContextPruneAt === NOW)

  const settings = coerceSettings({ activeProjectId: '  p1  ', breakEnabled: false, shortBreakMinutes: 99 })
  check('activeProjectId 被 trim', settings.activeProjectId === 'p1', settings.activeProjectId)
  check('breakEnabled=false 被保留', settings.breakEnabled === false)
  check('休息时长被夹到 30', settings.shortBreakMinutes === 30, settings.shortBreakMinutes)
}

console.log('\n[15] 日聚合（热力图数据源）')
{
  const day = '2026-11-01'
  let list = applyDailyDelta([], day, { focusMinutes: 25, sessions: 1 }, NOW)
  check('首次写入创建一行', list.length === 1 && list[0]?.day === day, list)
  check('分钟数写入', getDaily(list, day).focusMinutes === 25)

  list = applyDailyDelta(list, day, { focusMinutes: 30, tasksDone: 1 }, NOW)
  check('同一天累加', getDaily(list, day).focusMinutes === 55, getDaily(list, day))
  check('计数独立累加', getDaily(list, day).tasksDone === 1)

  list = applyDailyDelta(list, day, { focusMinutes: -999 }, NOW)
  check('负数增量把当天夹到 0（不是保持原值）', getDaily(list, day).focusMinutes === 0, getDaily(list, day).focusMinutes)

  const other = applyDailyDelta(list, '2026-10-31', { focusMinutes: 10 }, NOW)
  check('列表按日期升序', other[0]?.day === '2026-10-31', other.map(item => item.day))

  // 增量与重建必须一致
  const logs = [
    { id: 'f1', at: new Date(2026, 10, 1, 9, 0, 0).getTime(), kind: 'focus' as const, title: '专注', minutes: 25, source: 'manual' as const, edited: false },
    { id: 'f2', at: new Date(2026, 10, 1, 10, 0, 0).getTime(), kind: 'focus' as const, title: '专注', minutes: 30, source: 'manual' as const, edited: false },
    { id: 'm1', at: new Date(2026, 10, 1, 11, 0, 0).getTime(), kind: 'message' as const, title: '提问', source: 'auto' as const, edited: false },
  ]
  const tasks = [
    { id: 't1', title: '完成任务', status: 'done' as const, done: true, pomodoros: 0, createdAt: NOW, updatedAt: NOW, completedAt: new Date(2026, 10, 1, 12, 0, 0).getTime() },
  ]
  const friction = [
    { id: 'fr1', at: new Date(2026, 10, 1, 13, 0, 0).getTime(), updatedAt: NOW, summary: '报错', hits: 1, resolved: false },
  ]
  const rebuilt = rebuildDaily({ logs, tasks, friction })
  const rebuiltDay = rebuilt.find(item => item.day === '2026-11-01')
  check('重建：专注分钟 = 55', rebuiltDay?.focusMinutes === 55, rebuiltDay)
  check('重建：会话数只数非 focus', rebuiltDay?.sessions === 1, rebuiltDay?.sessions)
  check('重建：完成数 1', rebuiltDay?.tasksDone === 1, rebuiltDay?.tasksDone)
  check('重建：阻碍数 1', rebuiltDay?.friction === 1, rebuiltDay?.friction)
  check('空的日聚合为零值', emptyDaily('2026-01-01').focusMinutes === 0)

  const summary = summarizeDaily(rebuilt)
  check('汇总：活跃天数 1', summary.activeDays === 1, summary)
  check('汇总：总分钟 55', summary.minutes === 55, summary.minutes)
}

console.log('\n[16] 时间轴事件与降噪')
{
  const first = makeEvent({ type: 'task.completed', title: '完成任务：重构', refId: 't1', projectId: 'p1' }, NOW)
  let list = appendEvent([], first).list
  check('首条事件写入', list.length === 1 && list[0]?.title === '完成任务：重构')

  const duplicate = makeEvent({ type: 'task.completed', title: '完成任务：重构', refId: 't1', projectId: 'p1' }, NOW + 1000)
  const blocked = appendEvent(list, duplicate)
  check('60 秒内同类型同对象被去重', blocked.added === false && blocked.list.length === 1, blocked)

  const later = makeEvent({ type: 'task.completed', title: '又完成一次', refId: 't1' }, NOW + 61_000)
  const allowed = appendEvent(list, later)
  check('超出窗口后允许写入', allowed.added === true && allowed.list.length === 2)

  // 环形截断
  let ring: ReturnType<typeof makeEvent>[] = []
  for (let index = 0; index < 5; index += 1) {
    ring = appendEvent(ring, makeEvent({ type: 'focus.completed', title: `第 ${index} 轮`, refId: `f${index}` }, NOW + index * 1000), { maxEvents: 3 }).list
  }
  check('环形上限生效', ring.length === 3, ring.length)
  check('保留最新的事件', ring[0]?.title === '第 4 轮', ring[0]?.title)

  const events = [
    makeEvent({ type: 'task.created', title: '建任务', projectId: 'p1' }, NOW - 5000),
    makeEvent({ type: 'focus.completed', title: '专注', projectId: 'p2' }, NOW - 1000),
    makeEvent({ type: 'friction.resolved', title: '解决', projectId: 'p1' }, NOW),
  ]
  check('按项目过滤', filterEvents(events, { projectId: 'p1' }).length === 2)
  check('按类型过滤', filterEvents(events, { types: ['focus.completed'] }).length === 1)
  check('按时间范围过滤', filterEvents(events, { from: NOW - 2000 }).length === 2)
  check('分组按天', groupByDay(events).length === 1, groupByDay(events))
  check('分类计数', (countByCategory(events).task ?? 0) === 1, countByCategory(events))

  const dayRange = rangeOf('day', NOW)
  check('日范围宽度为一天', dayRange.to - dayRange.from === 86_400_000 - 1, dayRange)
  const weekRange = rangeOf('week', NOW)
  check('周范围宽度为七天', Math.round((weekRange.to - weekRange.from + 1) / 86_400_000) === 7)
}

console.log('\n[17] 项目记忆与草稿确认')
{
  const empty = createEmptyMemory('p1', NOW)
  check('空记忆版本为 1', empty.version === 1 && empty.done.length === 0, empty)

  const tasks: Task[] = [
    { id: 't1', title: '重构 TaskList', status: 'done', done: true, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW, completedAt: NOW - 1000 },
    { id: 't2', title: '写自测', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
    { id: 't3', title: '别的项目的任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p2', createdAt: NOW, updatedAt: NOW },
  ]
  const friction: FrictionRecord[] = [
    { id: 'f1', at: NOW, updatedAt: NOW, summary: 'TypeError 空指针', hits: 2, resolved: false, projectId: 'p1' },
    { id: 'f2', at: NOW, updatedAt: NOW, summary: 'CSS 错位', hits: 1, resolved: true, solution: '改用 flex', projectId: 'p1' },
  ]

  const draft = buildDraftFromLogs({ projectId: 'p1', projectName: '插件开发', tasks, logs: [], friction, now: NOW })
  check('草稿能从任务与阻碍提取内容', draft !== undefined && draft.items.length >= 3, draft?.items.length)
  check('草稿含已完成任务', draft?.items.some(item => item.field === 'done' && item.text === '重构 TaskList') === true)
  check('草稿含未解决阻碍', draft?.items.some(item => item.field === 'openIssues') === true)
  check('草稿含已解决阻碍的方案', draft?.items.some(item => item.field === 'resolvedIssues' && item.text.includes('flex')) === true)
  check('草稿含下一步', draft?.items.some(item => item.field === 'nextSteps' && item.text === '写自测') === true)
  check('草稿不会跨项目取数据', draft?.items.every(item => item.text !== '别的项目的任务') === true)

  // 用户只勾一条
  const accepted = draft === undefined ? undefined : {
    ...draft,
    items: draft.items.map((item, index) => ({ ...item, accepted: index === 0 })),
  }
  const patch = accepted === undefined ? {} : acceptDraft(accepted)
  check('只采纳勾选项', (patch.done ?? []).length === 1, patch)

  const merged = applyMemoryPatch(empty, { intro: '一个 DSH 插件', done: ['重构 TaskList'] }, 'draft', NOW + 1000)
  check('合并后版本 +1', merged.version === 2, merged.version)
  check('字符串字段写入', merged.intro === '一个 DSH 插件')
  check('数组字段写入', merged.done.length === 1)

  const again = applyMemoryPatch(merged, { intro: '', done: ['重构 TaskList', '写自测'] }, 'ai', NOW + 2000)
  check('空字符串不覆盖已有内容', again.intro === '一个 DSH 插件', again.intro)
  check('数组追加去重', again.done.length === 2, again.done)
  check('版本继续递增', again.version === 3)

  const list = upsertMemory([empty], merged)
  check('upsert 按 projectId 替换', list.length === 1 && memoryOf(list, 'p1')?.version === 2)
  check('查不到时返回 undefined', memoryOf(list, 'p9') === undefined)

  const prompt = memoryToPrompt(merged, '插件开发')
  check('提示词含项目名', prompt.includes('插件开发'))
  check('提示词含已完成项', prompt.includes('重构 TaskList'))
  check('提示词不含日志原文', !prompt.includes('TypeError'))
  const markdown = memoryToMarkdown(merged, '插件开发')
  check('Markdown 含标题与版本', markdown.includes('# 插件开发') && markdown.includes('v2'), markdown.slice(0, 40))
  check('完成度在 0–1 之间', memoryCompleteness(merged) > 0 && memoryCompleteness(merged) <= 1, memoryCompleteness(merged))
}

console.log('\n[18] 知识图谱约束')
{
  let graph: KnowledgeGraph = { nodes: [], edges: [] }
  const a = createNode({ title: 'JavaScript' }, NOW)
  const b = createNode({ title: 'Promise' }, NOW + 1)
  const c = createNode({ title: 'async/await' }, NOW + 2)
  graph = upsertNode(upsertNode(upsertNode(graph, a), b), c)
  check('节点插入', graph.nodes.length === 3)

  const self = addEdge(graph, a.id, a.id, 'related', NOW)
  check('自环被拒', self.ok === false && self.reason === 'self', self)

  const ab = addEdge(graph, a.id, b.id, 'prereq', NOW)
  check('前置边可以添加', ab.ok === true, ab)
  if (ab.ok) graph = ab.graph

  const bc = addEdge(graph, b.id, c.id, 'prereq', NOW)
  if (bc.ok) graph = bc.graph
  check('链式前置成立', graph.edges.length === 2, graph.edges.length)

  const cycle = addEdge(graph, c.id, a.id, 'prereq', NOW)
  check('成环被拒', cycle.ok === false && cycle.reason === 'cycle', cycle)
  check('wouldCreateCycle 判定一致', wouldCreateCycle(graph, c.id, a.id) === true)

  const dup = addEdge(graph, b.id, a.id, 'related', NOW)
  if (dup.ok) graph = dup.graph
  const dupReverse = addEdge(graph, a.id, b.id, 'related', NOW)
  check('related 反向重复被拒', dupReverse.ok === false && dupReverse.reason === 'duplicate', dupReverse)

  graph = linkTo(graph, b.id, { projectId: 'p1', frictionId: 'f1' }, NOW)
  check('关联记录写入', (graph.nodes.find(node => node.id === b.id)?.frictionIds ?? []).includes('f1'))
  check('可按阻碍反查知识点', nodesForFriction(graph, 'f1').length === 1)

  graph = unlinkFrom(graph, { frictionId: 'f1' })
  check('解绑后引用清空', nodesForFriction(graph, 'f1').length === 0)

  check('邻居包含前后两端', neighborsOf(graph, b.id).length >= 2, neighborsOf(graph, b.id).map(n => n.title))
  check('搜索命中标题', searchNodes(graph, { query: 'promise' }).length === 1)
  check('按状态筛选', searchNodes(graph, { status: 'todo' }).length === 3)

  const before = graph.edges.length
  graph = removeNode(graph, b.id)
  check('删除节点级联删边', graph.edges.length < before && graph.nodes.length === 2, graph.edges.length)

  const reviewed = applyReviewResult(graph, c.id, { at: NOW, nextAt: NOW + 86_400_000, mastery: 3, status: 'learned' })
  check('复习结果落到节点', reviewed.nodes.find(node => node.id === c.id)?.reviewCount === 1)

  const stats = graphStats(upsertNode(graph, { ...c, status: 'learned' }))
  check('图谱统计含已学习数', stats.learned >= 1, stats)
}

console.log('\n[19] 间隔复习排期')
{
  const forgot = schedule({ intervalDays: 10, mastery: 3, grade: 0 }, NOW)
  check('grade 0 → 明天再来', forgot.intervalDays === 1, forgot.intervalDays)
  check('grade 0 → 掌握度 -1', forgot.mastery === 2, forgot.mastery)

  const fuzzy = schedule({ intervalDays: 10, mastery: 3, grade: 1 }, NOW)
  check('grade 1 → 2 天', fuzzy.intervalDays === 2, fuzzy.intervalDays)
  check('grade 1 → 掌握度不变', fuzzy.mastery === 3)

  const good = schedule({ intervalDays: 4, mastery: 2, grade: 2 }, NOW)
  check('grade 2 → 间隔翻倍', good.intervalDays === 8, good.intervalDays)
  check('grade 2 → 掌握度 +1', good.mastery === 3)

  const easy = schedule({ intervalDays: 30, mastery: 4, grade: 3 }, NOW)
  check('grade 3 → 2.5 倍', easy.intervalDays === 75, easy.intervalDays)
  check('掌握度上限 5', schedule({ intervalDays: 1, mastery: 5, grade: 3 }, NOW).mastery === 5)

  const capped = schedule({ intervalDays: 100, mastery: 5, grade: 3 }, NOW)
  check('间隔上限 180 天', capped.intervalDays === 180, capped.intervalDays)

  const nodes = [
    { ...createNode({ title: '旧的' }, NOW), nextReviewAt: NOW - 10 * 86_400_000, mastery: 0 as const },
    { ...createNode({ title: '新的' }, NOW), nextReviewAt: NOW - 1 * 86_400_000, mastery: 4 as const },
    { ...createNode({ title: '没排期' }, NOW) },
  ]
  const due = dueNodes(nodes, NOW)
  check('只收已到期的节点', due.length === 2, due.map(node => node.title))
  check('过期更久的排前面', due[0]?.title === '旧的', due[0]?.title)

  const review = createReview('kn-1', 'recall', 2, good, '记住了', NOW)
  check('复习记录写入排期', review.intervalDays === good.intervalDays && review.nextAt === good.nextAt)
  check('复习形式轮换', suggestForm(0) === 'recall' && suggestForm(1) === 'code' && suggestForm(4) === 'recall')

  const stats = reviewStats([review], NOW)
  check('今日复习数', stats.today === 1, stats)
  check('平均评分', stats.avgGrade === 2, stats.avgGrade)
  check('连续天数 ≥ 1', stats.streakDays >= 1, stats.streakDays)
}

console.log('\n[20] 热力图色阶与年度汇总')
{
  check('0 分钟为 0 档', levelOf(0) === 0)
  check('1 分钟为 1 档', levelOf(1) === 1)
  check('24 分钟仍为 1 档', levelOf(24) === 1)
  check('25 分钟为 2 档', levelOf(25) === 2)
  check('60 分钟为 3 档', levelOf(60) === 3)
  check('120 分钟为 4 档', levelOf(120) === 4)
  check('NaN 视为 0 档', levelOf(Number.NaN) === 0)

  const daily = [
    { day: '2026-01-01', focusMinutes: 30, tasksDone: 2, sessions: 3, friction: 0 },
    { day: '2026-06-15', focusMinutes: 130, tasksDone: 4, sessions: 1, friction: 1 },
    { day: '2026-12-31', focusMinutes: 5, tasksDone: 0, sessions: 0, friction: 0 },
    { day: '2025-12-31', focusMinutes: 90, tasksDone: 9, sessions: 9, friction: 9 },
  ]
  const summary = buildHeatmap(daily, 2026, NOW)
  check('年视图覆盖 53 或 54 周', summary.weeks.length === 53 || summary.weeks.length === 54, summary.weeks.length)
  check('每周 7 天', summary.weeks.every(week => week.days.length === 7))
  check('年度总分钟只统计本年', summary.totalMinutes === 165, summary.totalMinutes)
  check('活跃天数 3', summary.activeDays === 3, summary.activeDays)
  check('年度完成任务数', summary.tasksDone === 6, summary.tasksDone)
  check('最长连续 1 天', summary.longestStreak === 1, summary.longestStreak)
  const outside = summary.weeks.flatMap(week => week.days).filter(day => day.inYear).length
  check('本年格子数 = 365', outside === 365, outside)
  check('年份列表包含当前年', availableYears(daily, NOW).includes(new Date(NOW).getFullYear()))
}

console.log('\n[21] 历史快照与差异')
{
  const project: Project = { id: 'p1', name: '插件开发', archived: false, createdAt: NOW }
  const baseTasks: Task[] = [
    { id: 't1', title: '任务一', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
    { id: 't2', title: '任务二', status: 'done', done: true, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW, completedAt: NOW },
  ]
  const baseFriction: FrictionRecord[] = [
    { id: 'f1', at: NOW, updatedAt: NOW, summary: '报错一', hits: 1, resolved: false, projectId: 'p1' },
  ]
  const memory = createEmptyMemory('p1', NOW)

  const from = buildHistorySnapshot({ project, tasks: baseTasks, friction: baseFriction, memory, now: NOW, label: '起点' })
  check('快照统计任务总数', from.counts.tasks === 2, from.counts)
  check('快照统计完成数', from.counts.done === 1)
  check('快照记录未解决阻碍', from.openFrictionIds.length === 1)
  check('快照记录记忆版本', from.memoryVersion === 1)

  const laterTasks: Task[] = [
    { ...baseTasks[0]!, done: true, status: 'done', completedAt: NOW + 1000 },
    { ...baseTasks[1]!, done: false, status: 'todo', completedAt: undefined },
    { id: 't3', title: '任务三', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
  ]
  const to = buildHistorySnapshot({
    project,
    tasks: laterTasks,
    friction: [],
    memory: applyMemoryPatch(memory, { intro: '新增简介' }, 'manual', NOW),
    now: NOW + 2000,
    label: '两天后',
  })

  const diff = diffHistory(from, to)
  check('差异：新增任务 1', diff.addedTasks === 1, diff)
  check('差异：完成任务 1', diff.completedTasks.includes('t1'), diff.completedTasks)
  check('差异：重开任务 1', diff.reopenedTasks.includes('t2'), diff.reopenedTasks)
  check('差异：解决阻碍 1', diff.resolvedFriction === 1, diff.resolvedFriction)
  check('差异：记忆变更', diff.memoryChanged === true)
  check('差异：版本差 +1', diff.memoryVersionDelta === 1, diff.memoryVersionDelta)
  check('差异有摘要', diff.summary.includes('完成 1'), diff.summary)

  const many = Array.from({ length: 15 }, (_, index) => ({
    ...from,
    id: `snap-${index}`,
    at: NOW + index * 1000,
  }))
  const pruned = pruneSnapshots(many, 12)
  check('快照裁剪到上限', snapshotsOf(pruned, 'p1').length === 12, pruned.length)
  check('保留最早基线', snapshotsOf(pruned, 'p1').some(item => item.id === 'snap-0'))
  check('快照按时间倒序', snapshotsOf(pruned, 'p1')[0]?.at === NOW + 14_000)

  check('没有快照时需要自动补', needsAutoSnapshot([], 'p1', NOW) === true)
  check('刚打过快照不需要补', needsAutoSnapshot([from], 'p1', NOW + 1000) === false)
}

console.log('\n[22] Repository 读写（无 window 时降级内存）')
{
  __resetMemoryStore()
  const repo = createLocalRepo()
  repo.writeMemory([createEmptyMemory('p1', NOW)])
  check('记忆写读往返', repo.readMemory().length === 1)
  check('项目隔离靠 projectId', repo.readMemory()[0]?.projectId === 'p1')

  repo.writeGraph({ nodes: [createNode({ title: 'TS' }, NOW)], edges: [] })
  check('图谱往返', repo.readGraph().nodes.length === 1)

  repo.writeDaily([{ day: '2026-11-01', focusMinutes: 30, tasksDone: 1, sessions: 2, friction: 0 }])
  check('日聚合往返', repo.readDaily()[0]?.focusMinutes === 30)

  check('未写过的键返回空数组', repo.readReviews().length === 0)
  check('rawRead 未知键返回兜底', repo.rawRead('不存在的键', { a: 1 }).a === 1)
  __resetMemoryStore()
}

console.log('\n[23] V4 schema 兜底')
{
  const graph = coerceKnowledge({
    nodes: [
      { id: 'n1', title: 'A' },
      { id: 'n2', title: 'B' },
      { id: 'n1', title: '重复 id' },
      { id: 'n3', title: '   ' },
    ],
    edges: [
      { fromId: 'n1', toId: 'n2', kind: 'related' },
      { fromId: 'n2', toId: 'n1', kind: 'related' },
      { fromId: 'n1', toId: 'n1', kind: 'prereq' },
      { fromId: 'n1', toId: 'missing', kind: 'related' },
    ],
  })
  check('重复节点被去重', graph.nodes.length === 2, graph.nodes)
  check('空标题节点被丢弃', graph.nodes.every(node => node.title !== ''))
  check('悬空边被丢弃', graph.edges.length === 1, graph.edges)
  check('related 反向去重', graph.edges[0]?.kind === 'related')

  check('记忆缺 projectId 被丢弃', coerceMemory({ intro: 'x' }) === undefined)
  check('记忆版本至少为 1', coerceMemory({ projectId: 'p1' })?.version === 1)
  check('非法日聚合日期被丢弃', coerceDaily({ day: '2026-13-01' }) === undefined)
  check('合法日聚合保留', coerceDaily({ day: '2026-12-31', focusMinutes: 30 })?.focusMinutes === 30)
  check('时间轴未知类型被丢弃', coerceTimelineEvent({ type: 'task.updated', title: 'x' }) === undefined)
  check('时间轴白名单类型保留', coerceTimelineEvent({ type: 'task.completed', title: '完成任务' })?.type === 'task.completed')

  const settings = coerceSettings({ aiTier: 'summary' })
  check('aiTier 被保留', settings.aiTier === 'summary', settings.aiTier)
  check('aiTier 非法值回退 stats', coerceSettings({ aiTier: 'hacked' }).aiTier === 'stats')
  check('aiAutoDaily 默认关闭', coerceSettings({}).aiAutoDaily === false)
}

console.log('\n[24] 审计回归（docs/V4-QUALITY-AUDIT.md 对应缺陷）')
{
  /* ── A1/A2：排期时间不能被「事件时间钳制」压成 24 小时 ── */
  const DAY = 86_400_000
  const scheduled = coerceKnowledge({
    nodes: [{ id: 'n1', title: 'Promise', nextReviewAt: NOW + 90 * DAY }],
    edges: [],
  }).nodes[0]
  check('A1 知识节点的 90 天排期被保留', scheduled?.nextReviewAt === NOW + 90 * DAY, scheduled?.nextReviewAt)
  const reviewRecord = coerceReview({ nodeId: 'n1', at: NOW, nextAt: NOW + 30 * DAY, intervalDays: 30, grade: 2 })
  check('A2 复习记录的 30 天排期被保留', reviewRecord?.nextAt === NOW + 30 * DAY, reviewRecord?.nextAt)
  const eventLog = coerceLog({ id: 'l1', title: '未来日志', at: NOW + 10 * DAY })
  // 钳制基准是真实的 Date.now()，不是测试常量 NOW（NOW 是 10/27，真实现在是 11/02）。
  check(
    'A3 事件时间仍被钳到「真实现在 + 24h」内（防止脏数据）',
    (eventLog?.at ?? 0) <= Date.now() + DAY + 1000,
    eventLog?.at,
  )

  /* ── B1/B2/B3：备份 v4 往返不丢实体 ── */
  const settingsForBackup: BoardSettings = {
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

  const barePayload = buildBackup({
    tasks: [],
    logs: [],
    projects: [],
    settings: settingsForBackup,
    friction: [],
    meta: { sessionTaskMap: {} },
  })
  check('B1 导出恒带 v4 字段', Array.isArray(barePayload.memory) && Array.isArray(barePayload.daily), {
    memory: barePayload.memory,
    daily: barePayload.daily,
  })

  const memoryV3 = applyMemoryPatch(createEmptyMemory('p1', NOW), { intro: '记忆', done: ['A'] }, 'manual', NOW)
  const graphB = { nodes: [createNode({ title: 'Promise' }, NOW)], edges: [] }
  const dailyB = [{ day: '2026-11-01', focusMinutes: 120, tasksDone: 2, sessions: 3, friction: 1 }]
  const timelineB = [makeEvent({ type: 'task.completed', title: '完成任务', refId: 't1', projectId: 'p1' }, NOW)]
  const historyB = [buildHistorySnapshot({ project: { id: 'p1', name: 'P', archived: false, createdAt: NOW }, tasks: [], friction: [], now: NOW })]
  const reviewsB = [createReview('n1', 'recall', 2, schedule({ intervalDays: 0, mastery: 0, grade: 2 }, NOW), undefined, NOW)]

  const fullPayload = buildBackup({
    tasks: [],
    logs: [],
    projects: [],
    settings: settingsForBackup,
    friction: [],
    meta: { sessionTaskMap: {} },
    memory: [memoryV3],
    knowledge: graphB,
    reviews: reviewsB,
    timeline: timelineB,
    history: historyB,
    daily: dailyB,
    now: NOW,
  })
  const roundtrip = parseBackup(serializeBackup(fullPayload))
  check('B2 备份文件可被解析', roundtrip.ok === true, roundtrip.ok ? '' : roundtrip.error)
  if (roundtrip.ok) {
    const p = roundtrip.payload
    check('B2 记忆往返保留版本与内容', p.memory?.[0]?.version === memoryV3.version && p.memory?.[0]?.intro === '记忆', p.memory?.[0])
    check('B2 知识图谱往返保留节点', p.knowledge?.nodes.length === 1, p.knowledge?.nodes.length)
    check('B2 日聚合往返保留分钟数', p.daily?.[0]?.focusMinutes === 120, p.daily?.[0])
    check('B2 时间轴往返保留事件', p.timeline?.[0]?.type === 'task.completed', p.timeline?.[0])
    check('B2 快照往返保留项目 id', p.history?.[0]?.projectId === 'p1', p.history?.[0])
    check('B2 复习记录往返保留排期', p.reviews?.[0]?.intervalDays === reviewsB[0]?.intervalDays, p.reviews?.[0])
  }

  const localForImport = {
    tasks: [],
    logs: [],
    projects: [] as Project[],
    friction: [] as FrictionRecord[],
    memory: [{ ...memoryV3, version: 5, intro: '本地更新' }],
    knowledge: { nodes: [] as ReturnType<typeof createNode>[], edges: [] },
    reviews: [],
    timeline: [],
    history: [],
    daily: [] as Array<{ day: string; focusMinutes: number; tasksDone: number; sessions: number; friction: number }>,
    settings: settingsForBackup,
    meta: { sessionTaskMap: {} },
  }
  const incomingForImport = roundtrip.ok ? roundtrip.payload : fullPayload
  const mergedImport = applyImport(localForImport, incomingForImport, 'merge', NOW)
  check('B3 合并时记忆取版本更高的一份', mergedImport.memory?.[0]?.version === 5, mergedImport.memory?.[0])
  check('B3 合并保留记忆条目', mergedImport.memory?.length === 1, mergedImport.memory?.length)
  check('B3 合并写入日聚合', mergedImport.daily?.length === 1, mergedImport.daily?.length)
  const overwrittenImport = applyImport(localForImport, incomingForImport, 'overwrite', NOW)
  check('B4 覆盖导入以备份为准', overwrittenImport.memory?.[0]?.version === memoryV3.version, overwrittenImport.memory?.[0]?.version)

  const scoped = filterByScope(
    { tasks: [], logs: [], friction: [], projects: [], memory: [memoryV3], timeline: timelineB, daily: dailyB },
    'week',
    NOW + 60 * DAY,
  )
  check('B5 近 7 天导出保留记忆（活文档不切）', (scoped.memory?.length ?? 0) === 1)
  check('B5 近 7 天导出会过滤过期日聚合', (scoped.daily?.length ?? 0) === 0, scoped.daily)

  /* ── C：原型与脏草稿 ── */
  const drafts = coerceMemoryDrafts(
    JSON.parse('{"__proto__":{"projectId":"x","items":[],"patch":{},"rationale":"r"}}') as unknown,
  )
  const proto = Object.getPrototypeOf(drafts)
  check('C1 草稿表原型未被替换', proto === null || proto === Object.prototype, proto === null ? 'null' : 'object')
  check('C1 __proto__ 键不会被当作项目', Object.prototype.hasOwnProperty.call(drafts, '__proto__') === false, Object.keys(drafts))
  const dirtyPatch = coerceDraftPatch({ done: [123, null, '真实项'], intro: 42 })
  check('C2 脏补丁被清洗为字符串数组', Array.isArray(dirtyPatch.done) && dirtyPatch.done.every(item => typeof item === 'string'), dirtyPatch)
  check('C2 非字符串 intro 被丢弃', dirtyPatch.intro === undefined, dirtyPatch.intro)
  let crashed = false
  try {
    applyMemoryPatch(createEmptyMemory('p1', NOW), dirtyPatch, 'ai', NOW)
  } catch {
    crashed = true
  }
  check('C2 应用清洗后的补丁不崩溃', crashed === false)
  const metaWithProto = coerceMeta(JSON.parse('{"sessionTaskMap":{"__proto__":"x","p":"t1"}}') as unknown)
  check('C3 meta 忽略 __proto__ 键', Object.keys(metaWithProto.sessionTaskMap).length === 1, metaWithProto.sessionTaskMap)

  /* ── D：日聚合幂等 ── */
  const dayLogs = [
    { id: 'd1', at: new Date(2026, 10, 1, 9, 0).getTime(), kind: 'focus' as const, title: '专注', minutes: 40, source: 'manual' as const, edited: false },
  ]
  const first = rebuildDay({ logs: dayLogs, tasks: [], friction: [] }, '2026-11-01')
  const second = rebuildDay({ logs: dayLogs, tasks: [], friction: [] }, '2026-11-01')
  const third = rebuildDay({ logs: dayLogs, tasks: [], friction: [] }, '2026-11-01')
  check('D1 rebuildDay 连续三次结果一致', first.focusMinutes === 40 && second.focusMinutes === 40 && third.focusMinutes === 40, first)
  const doubled = applyDailyDelta(applyDailyDelta([], '2026-11-01', { focusMinutes: 40 }, NOW), '2026-11-01', { focusMinutes: 40 }, NOW)
  check('D1 增量接口保持文档化语义（重复即累加）', doubled[0]?.focusMinutes === 80, doubled[0]?.focusMinutes)

  /* ── E：复习队列与孤儿记录 ── */
  const statusReview = { ...createNode({ title: '闭包' }, NOW), status: 'review' as const }
  check('E1 status=review 进入待复习队列', dueNodes([statusReview], NOW).length === 1)
  const orphan = pruneReviews([createReview('ghost', 'recall', 1, schedule({ intervalDays: 0, mastery: 0, grade: 1 }, NOW), undefined, NOW)], new Set(['n1']))
  check('E2 孤儿复习记录被清理', orphan.reviews.length === 0 && orphan.removed === 1, orphan)

  /* ── F：时间轴顺序与跨项目去重 ── */
  let ordered = appendEvent([], makeEvent({ type: 'task.created', title: '较新', refId: 'a' }, NOW)).list
  ordered = appendEvent(ordered, makeEvent({ type: 'focus.completed', title: '较旧', refId: 'b' }, NOW - 10_000)).list
  check('F1 乱序写入后仍保持新→旧', ordered[0]?.title === '较新' && ordered[1]?.title === '较旧', ordered.map(item => item.title))
  const crossProject = appendEvent(
    appendEvent([], makeEvent({ type: 'task.completed', title: 'A', refId: 'same', projectId: 'p1' }, NOW)).list,
    makeEvent({ type: 'task.completed', title: 'B', refId: 'same', projectId: 'p2' }, NOW + 1000),
  )
  check('F2 不同项目同 refId 不被误去重', crossProject.added === true && crossProject.list.length === 2, crossProject.list.length)
  const sameProject = appendEvent(
    appendEvent([], makeEvent({ type: 'task.completed', title: 'A', refId: 'same', projectId: 'p1' }, NOW)).list,
    makeEvent({ type: 'task.completed', title: 'A2', refId: 'same', projectId: 'p1' }, NOW + 1000),
  )
  check('F2 同项目同 refId 仍会被去重', sameProject.added === false)

  /* ── F3/F4：环形边界与热力图逐日一致 ── */
  let ring = [] as ReturnType<typeof makeEvent>[]
  for (let index = 0; index < 1205; index += 1) {
    ring = appendEvent(
      ring,
      makeEvent({ type: 'focus.completed', title: `轮 ${index}`, refId: `r${index}` }, NOW + index * 1000),
    ).list
  }
  check('F3 环形上限 1200 生效', ring.length === 1200, ring.length)
  check('F3 截断后保留最新一条', ring[0]?.title === '轮 1204', ring[0]?.title)
  check('F3 截断丢的是最旧的一条', ring[ring.length - 1]?.title === '轮 5', ring[ring.length - 1]?.title)

  const heatDaily = [{ day: '2026-03-05', focusMinutes: 60, tasksDone: 2, sessions: 1, friction: 0 }]
  const heatOne = buildHeatmap(heatDaily, 2026, NOW)
  const cell = heatOne.weeks.flatMap(week => week.days).find(item => item.day === '2026-03-05')
  check('F4 热力图与日聚合逐日一致', cell?.minutes === 60 && cell.level === levelOf(60), cell)
  check('F4 无记录的日期为 0 档', (heatOne.weeks.flatMap(week => week.days).find(item => item.day === '2026-03-06')?.level ?? -1) === 0)

  /* ── G：日历与版本 ── */
  check('G1 拒绝 2026-02-31', coerceDaily({ day: '2026-02-31' }) === undefined)
  check('G1 接受闰年 2024-02-29', coerceDaily({ day: '2024-02-29' })?.day === '2024-02-29')
  check('G2 空补丁不递增版本', applyMemoryPatch(createEmptyMemory('p1', NOW), {}, 'ai', NOW).version === 1)
  const leap = buildHeatmap([], 2024, NOW)
  const leapCells = leap.weeks.flatMap(week => week.days).filter(item => item.inYear).length
  check('G3 闰年格子数为 366', leapCells === 366, leapCells)

  // 跨年排期：12 月 31 日 + 7 天必须落在次年 1 月 7 日，而不是被截断。
  const yearEnd = new Date(2026, 11, 31, 22, 0, 0).getTime()
  const crossed = schedule({ intervalDays: 1, mastery: 2, grade: 3 }, yearEnd)
  const crossedDate = new Date(crossed.nextAt)
  check('G4 跨年排期落在下一年 1 月', crossedDate.getFullYear() === 2027 && crossedDate.getMonth() === 0, crossedDate.toISOString())

  // 历史差异：同 id 的标题变化不算「新增任务」（快照只存 id）。
  const snapA = buildHistorySnapshot({
    project: { id: 'p9', name: 'P9', archived: false, createdAt: NOW },
    tasks: [{ id: 'same', title: '旧标题', status: 'todo', done: false, pomodoros: 0, projectId: 'p9', createdAt: NOW, updatedAt: NOW }],
    friction: [],
    now: NOW,
  })
  const snapB = buildHistorySnapshot({
    project: { id: 'p9', name: 'P9', archived: false, createdAt: NOW },
    tasks: [{ id: 'same', title: '新标题', status: 'todo', done: false, pomodoros: 0, projectId: 'p9', createdAt: NOW, updatedAt: NOW + 1000 }],
    friction: [],
    now: NOW + 1000,
  })
  check('G5 同 id 改标题不算新增任务', diffHistory(snapA, snapB).addedTasks === 0, diffHistory(snapA, snapB))
}

console.log('\n[25] 性能与大数据量（实测，非估算）')
{
  /* 1000 节点 / 999 条前置边，检测成环 DFS 的耗时 */
  const nodes = Array.from({ length: 1000 }, (_, index) => createNode({ title: `K${index}` }, NOW + index))
  let graph: KnowledgeGraph = { nodes, edges: [] }
  for (let index = 0; index < 999; index += 1) {
    const from = nodes[index]
    const to = nodes[index + 1]
    if (from === undefined || to === undefined) continue
    const result = addEdge(graph, from.id, to.id, 'prereq', NOW)
    if (result.ok) graph = result.graph
  }
  const startedAt = Date.now()
  // 边数上限是 900，链尾是 nodes[900]（不是 nodes[999]）。
  const chainTail = nodes[900]
  const cycle = chainTail === undefined ? false : wouldCreateCycle(graph, chainTail.id, nodes[0]!.id)
  const elapsed = Date.now() - startedAt
  check('P1 1000 节点链式图成环检测为 true', cycle === true)
  check('P2 成环检测耗时 < 50ms', elapsed < 50, `${elapsed}ms`)
  check(
    'P3 节点全保留、边被 config 上限截到 900',
    graph.nodes.length === 1000 && graph.edges.length === 900,
    { nodes: graph.nodes.length, edges: graph.edges.length },
  )

  /* 800 天日聚合 → 热力图 */
  const manyDays = Array.from({ length: 800 }, (_, index) => {
    const date = new Date(2025, 0, 1 + index)
    return {
      day: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      focusMinutes: index % 120,
      tasksDone: index % 3,
      sessions: 1,
      friction: 0,
    }
  })
  const heatStarted = Date.now()
  const heat = buildHeatmap(manyDays, 2026, NOW)
  const heatElapsed = Date.now() - heatStarted
  check('P4 800 天数据生成热力图 < 80ms', heatElapsed < 80, `${heatElapsed}ms`)
  check('P5 热力图周数合理', heat.weeks.length >= 53 && heat.weeks.length <= 54, heat.weeks.length)
}

console.log('\n[26] 存储被禁用时的写入语义（模拟浏览器）')
{
  __resetMemoryStore()
  // 仓储会缓存存储模式；前面的用例在「无 window」环境跑过，这里必须重置缓存，
  // 才能模拟「浏览器里 window 存在但存储被禁用」。
  resetStorageModeCache()
  const repo = createLocalRepo()
  const original = (globalThis as { window?: unknown }).window
  try {
    // 有 window 但 localStorage 一用就抛：隐私模式 / 被策略禁用。
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem(): string {
          throw new Error('SecurityError')
        },
        setItem(): void {
          throw new Error('SecurityError')
        },
        removeItem(): void {
          throw new Error('SecurityError')
        },
      },
      dispatchEvent(): boolean {
        return true
      },
    }
    const wrote = repo.writeMemory([createEmptyMemory('p1', NOW)])
    check('S1 存储被禁用时写入返回 false（不谎报成功）', wrote === false, wrote)
    check('S2 当前会话仍可读回内存中的值', repo.readMemory().length === 1)
  } finally {
    if (original === undefined) delete (globalThis as { window?: unknown }).window
    else (globalThis as { window?: unknown }).window = original
    resetStorageModeCache()
  }
  __resetMemoryStore()
}

function settingsForBackupRef(): BoardSettings {
  return {
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
}

console.log('\n[27] 第二轮集成审计回归（docs/V4-INTEGRATION-AUDIT.md）')
{
  /* ── NEW-01：配额满时「读」不能被误判成存储禁用 ── */
  __resetMemoryStore()
  resetStorageModeCache()
  const repo = createLocalRepo()
  const memorySeed = applyMemoryPatch(createEmptyMemory('p1', NOW), { intro: '已有记忆' }, 'manual', NOW)
  const envelope = JSON.stringify(wrapEnvelope([memorySeed]))
  const bag = new Map<string, string>([[STORAGE_KEYS.memory, envelope]])
  const originalWindow = (globalThis as { window?: unknown }).window
  try {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        get length() {
          return bag.size
        },
        getItem: (key: string) => bag.get(key) ?? null,
        setItem(): void {
          const error = new Error('QuotaExceededError')
          error.name = 'QuotaExceededError'
          throw error
        },
        removeItem: (key: string) => {
          bag.delete(key)
        },
      },
      dispatchEvent(): boolean {
        return true
      },
    }
    const readFull = repo.readMemory()
    check('N1 配额满时仍能读到已有记忆', readFull.length === 1 && readFull[0]?.intro === '已有记忆', readFull)
    const writeFull = repo.writeMemory([{ ...memorySeed, intro: '新' }])
    check('N2 配额满时写入返回 false', writeFull === false, writeFull)
  } finally {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window
    else (globalThis as { window?: unknown }).window = originalWindow
    resetStorageModeCache()
    __resetMemoryStore()
  }

  /* ── NEW-02：备份必须保留 meta 的草稿与升级标记 ── */
  const metaPayload = buildBackup({
    tasks: [],
    logs: [],
    projects: [],
    settings: settingsForBackupRef(),
    friction: [],
    meta: {
      sessionTaskMap: {},
      memoryDrafts: {
        p1: { projectId: 'p1', at: NOW, source: 'ai', patch: {}, rationale: 'r', items: [] },
      },
      upgradedFrom: 3,
    },
    now: NOW,
  })
  const metaParsed = parseBackup(serializeBackup(metaPayload))
  check(
    'N3 备份保留 meta.memoryDrafts 与 upgradedFrom',
    metaParsed.ok && Object.keys(metaParsed.payload.meta.memoryDrafts ?? {}).length === 1 && metaParsed.payload.meta.upgradedFrom === 3,
    metaParsed.ok ? metaParsed.payload.meta : metaParsed,
  )

  /* ── NEW-03：导入后历史快照服从「每项目 12 个」 ── */
  const manySnapshots = Array.from({ length: 20 }, (_, index) =>
    buildHistorySnapshot({
      project: { id: 'p1', name: 'P1', archived: false, createdAt: NOW },
      tasks: [],
      friction: [],
      now: NOW + index * 1000,
      label: `s${index}`,
    }),
  )
  const historyPayload = buildBackup({
    tasks: [],
    logs: [],
    projects: [],
    settings: settingsForBackupRef(),
    friction: [],
    meta: { sessionTaskMap: {} },
    history: manySnapshots,
    now: NOW,
  })
  const mergedHistory = applyImport(
    { tasks: [], logs: [], projects: [], friction: [], settings: settingsForBackupRef(), meta: { sessionTaskMap: {} } },
    historyPayload,
    'merge',
    NOW,
  )
  check('N4 导入后同项目快照 ≤ 12', (mergedHistory.history?.length ?? 0) <= 12, mergedHistory.history?.length)

  /* ── NEW-04：超量导入必须拒绝而不是静默截断 ── */
  const tooMany = JSON.stringify({
    kind: 'sorchron-study-board-backup',
    version: 4,
    exportedAt: NOW,
    tasks: Array.from({ length: 501 }, (_, index) => ({ id: `t${index}`, title: `t${index}` })),
    logs: [],
    projects: [],
    settings: settingsForBackupRef(),
    friction: [],
    meta: { sessionTaskMap: {} },
  })
  const rejected = parseBackup(tooMany)
  check('N5 超过 500 条任务的备份被拒绝', rejected.ok === false, rejected.ok ? 'accepted' : rejected.error)

  /* ── NEW-09：V4 实体超量也要拒绝（不能静默截断） ── */
  const tooManyNodes = JSON.stringify({
    kind: 'sorchron-study-board-backup',
    version: 4,
    exportedAt: NOW,
    tasks: [],
    logs: [],
    projects: [],
    settings: settingsForBackupRef(),
    friction: [],
    meta: { sessionTaskMap: {} },
    knowledge: { nodes: Array.from({ length: 501 }, (_, i) => ({ id: `k${i}`, title: `k${i}` })), edges: [] },
  })
  const rejectedNodes = parseBackup(tooManyNodes)
  check('N12 超过 500 个知识节点的备份被拒绝', rejectedNodes.ok === false, rejectedNodes.ok ? 'accepted' : rejectedNodes.error)

  /* ── NEW-05：事务写入失败要回滚；序列化失败不写任何键 ── */
  const fake = createFakeStore({ a: 'old-a', b: 'old-b' }, 2)
  const snapshot = JSON.stringify(fake.dump())
  const txFail = writeTransaction(fake, [
    { key: 'a', value: [1] },
    { key: 'b', value: [2] },
    { key: 'c', value: [3] },
  ])
  check('N6 事务中途失败返回 ok=false', txFail.ok === false, txFail)
  check('N7 事务失败后原值被回滚', JSON.stringify(fake.dump()) === snapshot, fake.dump())
  const circular: Record<string, unknown> = {}
  circular.self = circular
  const fake2 = createFakeStore({ a: 'keep' })
  const before2 = JSON.stringify(fake2.dump())
  const txSerialize = writeTransaction(fake2, [{ key: 'a', value: circular }])
  check('N8 序列化失败时不写入任何键', txSerialize.ok === false && JSON.stringify(fake2.dump()) === before2, txSerialize)

  /* ── NEW-07：任务完成数必须用绝对值，重开再完成不能累计 ── */
  let absoluteDaily = syncDailyTasks([], [{ id: 'x', title: 'x', status: 'done', done: true, pomodoros: 0, createdAt: NOW, updatedAt: NOW, completedAt: NOW }], dayKey(NOW), NOW)
  check('N9 完成一次为 1', absoluteDaily[0]?.tasksDone === 1, absoluteDaily)
  absoluteDaily = syncDailyTasks(absoluteDaily, [{ id: 'x', title: 'x', status: 'todo', done: false, pomodoros: 0, createdAt: NOW, updatedAt: NOW }], dayKey(NOW), NOW)
  check('N10 重开后回到 0', absoluteDaily[0]?.tasksDone === 0)
  absoluteDaily = syncDailyTasks(absoluteDaily, [{ id: 'x', title: 'x', status: 'done', done: true, pomodoros: 0, createdAt: NOW, updatedAt: NOW, completedAt: NOW }], dayKey(NOW), NOW)
  check('N11 再完成仍为 1（不累计）', absoluteDaily[0]?.tasksDone === 1, absoluteDaily[0]?.tasksDone)
}

console.log('\n[28] B1 业务动作层 / B2 冲突决策')
{
  const project: Project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }
  const task: Task = { id: 't1', title: '动作任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW }

  /* completeTask */
  const completed = completeTask({ tasks: [task], daily: [], timeline: [], taskId: 't1', at: NOW, project, history: [] })
  check('A1 完成任务写入 done/completedAt', completed.tasks?.[0]?.done === true && completed.tasks?.[0]?.completedAt === NOW)
  check('A2 完成任务写 Daily=1', completed.daily?.[0]?.tasksDone === 1, completed.daily)
  check('A3 完成任务写时间轴', completed.timeline?.[0]?.type === 'task.completed', completed.timeline)
  check('A4 首次完成生成历史快照', completed.snapshot?.counts.done === 1, completed.snapshot?.counts)
  check('A5 重复完成是幂等的', Object.keys(completeTask({ tasks: completed.tasks ?? [], daily: completed.daily ?? [], timeline: completed.timeline ?? [], taskId: 't1', at: NOW + 1000 })).length === 0)

  /* reopen + 再完成 */
  const reopened = reopenTask({ tasks: completed.tasks ?? [], daily: completed.daily ?? [], timeline: completed.timeline ?? [], taskId: 't1', at: NOW + 2000 })
  check('A6 重开后 Daily 回落到 0', reopened.daily?.[0]?.tasksDone === 0, reopened.daily)
  const again = completeTask({ tasks: reopened.tasks ?? [], daily: reopened.daily ?? [], timeline: reopened.timeline ?? [], taskId: 't1', at: NOW + 3000, project, history: [] })
  check('A7 再完成仍为 1（不累计）', again.daily?.[0]?.tasksDone === 1, again.daily)

  /* deleteTask 清理引用 */
  const graph = { nodes: [{ ...createNode({ title: 'K' }, NOW), taskIds: ['t1'] }], edges: [] }
  const meta = { sessionTaskMap: { s1: 't1', s2: 't2' } }
  const logs = [{ id: 'l1', at: NOW, kind: 'message' as const, title: 'x', taskId: 't1', source: 'auto' as const, edited: false }]
  const removed = deleteTask({ tasks: [task], logs, graph, meta, taskId: 't1' })
  check('A8 删除任务清空日志 taskId', removed.logs?.[0]?.taskId === undefined)
  check('A9 删除任务清空知识节点 taskIds', (removed.graph?.nodes[0]?.taskIds ?? ['x']).length === 0)
  check('A10 删除任务清空会话绑定', Object.keys(removed.meta?.sessionTaskMap ?? { a: 1 }).length === 1)

  /* 专注 / 阻碍 */
  const log: SessionLog = { id: 'f1', at: NOW, kind: 'focus', title: '专注', minutes: 25, projectId: 'p1', source: 'manual', edited: false }
  const focus = addFocusLog({ logs: [], daily: [], timeline: [], log })
  check('A11 专注写 Daily 25 分钟', focus.daily?.[0]?.focusMinutes === 25, focus.daily)
  check('A12 同 id 重复提交不双计', Object.keys(addFocusLog({ logs: focus.logs ?? [], daily: focus.daily ?? [], timeline: focus.timeline ?? [], log })).length === 0)

  const frictionRecord: FrictionRecord = { id: 'fr1', at: NOW, updatedAt: NOW, summary: 'TypeError', hits: 1, resolved: false, projectId: 'p1' }
  const added = addFriction({ friction: [], daily: [], timeline: [], record: frictionRecord })
  check('A13 新增阻碍 Daily+1', added.daily?.[0]?.friction === 1)
  const resolved = resolveFrictionAction({ friction: added.friction ?? [], timeline: added.timeline ?? [], frictionId: 'fr1', solution: '加空值判断', at: NOW + 1000 })
  check('A14 解决阻碍写方案与耗时', resolved.friction?.[0]?.resolved === true && (resolved.friction?.[0]?.resolveMs ?? 0) > 0, resolved.friction)

  /* 知识删除 */
  let graph2 = { nodes: [createNode({ title: 'A' }, NOW), createNode({ title: 'B' }, NOW + 1)], edges: [] }
  const edge = addEdge(graph2, graph2.nodes[0]!.id, graph2.nodes[1]!.id, 'related', NOW)
  if (edge.ok) graph2 = edge.graph
  const nodeId = graph2.nodes[0]!.id
  const reviews = [createReview(nodeId, 'recall', 2, schedule({ intervalDays: 0, mastery: 0, grade: 2 }, NOW), undefined, NOW)]
  const deleted = deleteKnowledgeNode({ graph: graph2, reviews, nodeId })
  check('A15 删节点同时删边与复习', deleted.graph?.edges.length === 0 && deleted.reviews?.length === 0, deleted)

  /* 记忆 */
  const saved = saveMemory({ memory: [], timeline: [], projectId: 'p1', patch: { intro: '简介' }, at: NOW })
  check('A16 保存记忆版本为 2', saved.memory?.[0]?.version === 2, saved.memory?.[0]?.version)
  check('A17 空补丁不产生事件', Object.keys(saveMemory({ memory: saved.memory ?? [], timeline: saved.timeline ?? [], projectId: 'p1', patch: {}, at: NOW + 1 })).length === 0)

  const draft = {
    projectId: 'p1',
    at: NOW,
    source: 'logs' as const,
    patch: {},
    rationale: 'r',
    items: [
      { field: 'done' as const, text: '已采纳', accepted: true },
      { field: 'done' as const, text: '未采纳', accepted: false },
    ],
  }
  const adopted = adoptDraft({ memory: [], drafts: { p1: draft }, timeline: [], projectId: 'p1', at: NOW })
  check('A18 只采纳勾选项', adopted.memory?.[0]?.done.includes('已采纳') === true && adopted.memory?.[0]?.done.includes('未采纳') === false, adopted.memory?.[0]?.done)
  check('A19 采纳后草稿被移除', adopted.drafts?.p1 === undefined, adopted.drafts)

  /* B2 冲突决策 */
  check('B1 已保存状态收到远端 → 直接应用', decideRemoteChange({ dirty: false, remoteRaw: 'x', baseRaw: 'y' }) === 'apply')
  check('B2 未保存状态收到远端 → 冲突', decideRemoteChange({ dirty: true, remoteRaw: 'x', baseRaw: 'y' }) === 'conflict')
  check('B3 远端与本地基线一致 → 不提示', decideRemoteChange({ dirty: true, remoteRaw: 'y', baseRaw: 'y' }) === 'apply')
  clearConflicts()
  reportConflict('k', 'r1', NOW)
  reportConflict('k', 'r2', NOW + 1)
  check('B4 同键冲突合并为一条', listConflicts().length === 1)
  resolveConflict('k')
  check('B5 决议后冲突清除', listConflicts().length === 0)
}

console.log('\n[29] B3.5 第二批：删除日志 / 阻碍合并 / 导入快照')
{
  const focusLog: SessionLog = { id: 'dlog1', at: new Date(2026, 10, 2, 9, 0).getTime(), kind: 'focus', title: '专注', minutes: 40, source: 'manual', edited: false }
  const added = addFocusLog({ logs: [], daily: [], timeline: [], log: focusLog })
  const dailyBefore = added.daily?.[0]?.focusMinutes ?? -1
  const removed = deleteLog({ logs: added.logs ?? [], daily: added.daily ?? [], logId: 'dlog1' })
  check('D1 删除专注日志后 Daily 归零', removed.daily?.[0]?.focusMinutes === 0, removed.daily)
  check('D2 删除后与 rebuildDaily 一致', rebuildDay({ logs: removed.logs ?? [], tasks: [], friction: [] }, dayKey(focusLog.at)).focusMinutes === 0)
  check('D3 重复删除幂等', Object.keys(deleteLog({ logs: removed.logs ?? [], daily: removed.daily ?? [], logId: 'dlog1' })).length === 0)
  /**
   * D4 的语义在 Phase 5.5 变了（审计 F5）：
   * 旧断言要求「删非专注日志时 daily 原样不动」，那正是缺陷本身 ——
   * `rebuildDaily` 把 `sessions` 定义为「非 focus 日志条数」，删除却不回退，
   * 于是 daily 永久偏高。现在删会话日志只回退 sessions，绝不碰 focusMinutes。
   */
  check('D4 删非专注日志：回退 sessions、不动 focusMinutes', (() => {
    const msg: SessionLog = { id: 'm1', at: focusLog.at, kind: 'message', title: 'x', source: 'auto', edited: false }
    const r = addFocusLog({ logs: [], daily: [], timeline: [], log: focusLog })
    const withSession = applyDailyDelta(r.daily ?? [], dayKey(focusLog.at), { sessions: 1 }, focusLog.at)
    const d = deleteLog({ logs: [{ ...msg }, ...(r.logs ?? [])], daily: withSession, logId: 'm1' })
    const entry = d.daily?.[0]
    return entry !== undefined && entry.sessions === 0 && entry.focusMinutes === 40
  })())
  void dailyBefore

  const draft = { at: NOW, updatedAt: NOW, summary: 'TypeError 同一处', hits: 1, resolved: false, projectId: 'p1' }
  const first = addFrictionMerged({ friction: [], daily: [], timeline: [], draft, now: NOW })
  check('F1 首次阻碍 New + Daily=1', first.created === true && first.daily?.[0]?.friction === 1, first.daily)
  const second = addFrictionMerged({ friction: first.friction ?? [], daily: first.daily ?? [], timeline: first.timeline ?? [], draft: { ...draft, at: NOW + 1000 }, now: NOW + 1000 })
  check('F2 相似阻碍合并后不再 +1', second.created === false && (second.daily?.[0]?.friction ?? 0) === 1, { created: second.created, daily: second.daily })
  check('F3 合并保留 hits 累加', (second.friction?.[0]?.hits ?? 0) === 2, second.friction?.[0]?.hits)

  const project: Project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }
  const openOnly = [
    { id: 'z1', title: '零投入任务', status: 'todo' as const, done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
    { id: 'z2', title: '零投入任务2', status: 'todo' as const, done: false, pomodoros: 0, projectId: 'p1', createdAt: NOW, updatedAt: NOW },
  ]
  const withEmpty = projectRanking([], openOnly, [project], '', { includeEmpty: true })
  check('P1 零投入项目仍被统计', withEmpty.length === 1 && withEmpty[0]?.minutes === 0, withEmpty)
  check('P2 默认仍不返回零投入项目（不影响旧调用）', projectRanking([], openOnly, [project], '').length === 0)
  check('P3 项目数量不受任务完成数影响', withEmpty[0]?.name === 'P1' && withEmpty[0]?.tasksDone === 0, withEmpty[0])

  const snapshot = buildImportSnapshot({ project, tasks: [], friction: [], now: NOW })
  check('I1 导入快照带标签与项目', snapshot.label === '导入后' && snapshot.projectId === 'p1', snapshot.label)
  check('I2 导入快照计数为 0', snapshot.counts.tasks === 0 && snapshot.counts.openFriction === 0)
}

console.log('\n[30] P0.5 连续记录口径')
{
  const today = dayKey(NOW)
  const yesterday = dayKey(NOW - 86_400_000)
  const createdOnly: Task[] = [{ id: 'c1', title: '只创建', status: 'todo', done: false, pomodoros: 0, createdAt: NOW, updatedAt: NOW }]
  check('S1 仅创建任务不算学习记录', countStreak(createdOnly, [], NOW) === 0)

  const doneYesterday: Task[] = [{ id: 'c2', title: '昨天完成', status: 'done', done: true, pomodoros: 0, createdAt: NOW - 2 * 86_400_000, updatedAt: NOW, completedAt: NOW - 86_400_000 }]
  check('S2 昨天完成、今天无记录 → 1（截至昨天）', countStreak(doneYesterday, [], NOW) === 1)

  const focusToday: SessionLog = { id: 's1', at: NOW, kind: 'focus', title: '专注', minutes: 25, source: 'manual', edited: false }
  check('S3 昨天完成 + 今天专注 → 2', countStreak(doneYesterday, [focusToday], NOW) === 2)

  const focusAgain: SessionLog = { ...focusToday, id: 's2', at: NOW - 1000 }
  check('S4 同一天多条只算一天', countStreak([], [focusToday, focusAgain], NOW) === 1)

  const message: SessionLog = { id: 'm1', at: NOW, kind: 'message', title: '消息', source: 'auto', edited: false }
  const zeroFocus: SessionLog = { id: 'z1', at: NOW, kind: 'focus', title: '0 分钟', minutes: 0, source: 'manual', edited: false }
  check('S5 消息与 0 分钟专注都不算', countStreak([], [message, zeroFocus], NOW) === 0)
  void today
  void yesterday
}

console.log('\n[31] Phase 5.1：任务创建/编辑/删除一致性')
{
  const project: Project = { id: 'p1', name: 'P1', archived: false, createdAt: NOW }
  const created = createTask({
    tasks: [], timeline: [], id: 't9', title: '  新任务  ', priority: 'urgent',
    dueAt: NOW + 86_400_000, projectId: 'p1', projects: [project], at: NOW,
  })
  check('T1 创建任务写入标题/优先级/项目', created.tasks?.[0]?.title === '新任务' && created.tasks?.[0]?.priority === 'urgent' && created.tasks?.[0]?.projectId === 'p1', created.tasks?.[0])
  check('T2 创建任务写 task.created 事件', created.timeline?.[0]?.type === 'task.created', created.timeline)
  check('T3 空标题被拒', Object.keys(createTask({ tasks: [], timeline: [], id: 't10', title: '   ', at: NOW })).length === 0)
  check('T4 无效项目被拒', Object.keys(createTask({ tasks: [], timeline: [], id: 't11', title: 'x', projectId: 'nope', projects: [project] })).length === 0)
  check('T5 重复 id 被拒', Object.keys(createTask({ tasks: created.tasks ?? [], timeline: [], id: 't9', title: 'x' })).length === 0)

  const updated = updateTask({ tasks: created.tasks ?? [], taskId: 't9', patch: { title: '改名', priority: 'normal' }, projects: [project], at: NOW + 1000 })
  check('T6 编辑更新标题与 updatedAt', updated.tasks?.[0]?.title === '改名' && updated.tasks?.[0]?.updatedAt === NOW + 1000, updated.tasks?.[0])
  check('T7 空补丁不产生变更', Object.keys(updateTask({ tasks: updated.tasks ?? [], taskId: 't9', patch: {}, at: NOW + 2000 })).length === 0)
  check('T8 编辑不改变 done/status', updated.tasks?.[0]?.done === false && updated.tasks?.[0]?.status === 'todo')

  const completed = completeTask({ tasks: updated.tasks ?? [], daily: [], timeline: [], taskId: 't9', at: NOW })
  check('T9 完成后 Daily=1', completed.daily?.[0]?.tasksDone === 1)
  const removed = deleteTask({
    tasks: completed.tasks ?? [], daily: completed.daily ?? [], timeline: completed.timeline ?? [],
    taskId: 't9', at: NOW + 3000,
  })
  check('T10 删除已完成任务回退 Daily', removed.daily?.[0]?.tasksDone === 0, removed.daily)
  check('T11 删除写 task.deleted 事件', removed.timeline?.some(event => event.type === 'task.deleted') === true, removed.timeline?.map(event => event.type))
  check('T12 重复删除幂等', Object.keys(deleteTask({ tasks: removed.tasks ?? [], daily: removed.daily ?? [], taskId: 't9' })).length === 0)
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`)
if (failed > 0) process.exitCode = 1
