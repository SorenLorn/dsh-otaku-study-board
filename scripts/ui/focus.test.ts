/**
 * focus.test.ts — Phase 5.5 计时状态机 + 会话数据链路（纯逻辑，无 DOM）。
 *
 * 用**可控时钟**：所有时间都是参数，不 sleep、不等真实时间。覆盖：
 *   F. 状态机（开始 / 暂停 / 继续 / 多次暂停 / 结束 / 取消 / 休息 / 刷新恢复 /
 *      后台节流 / 睡眠跨日 / 系统时间回拨 / 重复结束 / 非法状态）
 *   G. 数据链路（finishFocus → logs + daily + timeline + task；幂等；
 *      deleteLog 回退 focusMinutes 与 sessions；与 rebuildDaily 口径一致；
 *      400 条日志、1200 条时间轴）
 *
 * 跑法：
 *   npx esbuild scripts/ui/focus.test.ts --bundle --platform=node --format=cjs \
 *     --outfile=.build/focus.cjs && node .build/focus.cjs
 */
import {
  actualFocusMinutes,
  cancelRound,
  createRoundId,
  elapsedSecondsAt,
  endRound,
  finishBreak,
  focusStatus,
  idleState,
  pauseRound,
  remainingSecondsAt,
  resumeRound,
  startBreak,
  startRound,
  type FocusSettings,
} from '../../src/client/lib/focus'
import { finishFocus, addSessionLog, deleteLog, deleteLogs, addFocusLog } from '../../src/client/lib/actions'
import { rebuildDaily, applyDailyDelta, getDaily, syncDailyTasks } from '../../src/client/lib/daily'
import { appendEvent, makeEvent } from '../../src/client/lib/timeline'
import { restoreTimerState } from '../../src/client/lib/schema'
import { buildActivityWindow } from '../../src/client/lib/activity'
import { createDefaultTimerState } from '../../src/client/lib/defaults'
import { dayKey } from '../../src/client/lib/time'
import type { DailyAggregate, SessionLog, Task, TimelineEvent, TimerPersistedState } from '../../src/client/types'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
  }
}

const MIN = 60_000
const SETTINGS: FocusSettings = { breakEnabled: true, shortBreakMinutes: 5, longBreakMinutes: 15, roundsBeforeLongBreak: 4 }

/** 2026-11-04 09:00 本地时间（用本地构造，避免 UTC 偏移影响日键断言）。 */
const T0 = new Date(2026, 10, 4, 9, 0, 0, 0).getTime()

function fresh(minutes = 25): TimerPersistedState {
  const state = createDefaultTimerState(T0)
  state.durationMinutes = minutes
  state.remainingSeconds = minutes * 60
  state.focusMinutes = minutes
  state.roundId = ''
  return state
}

/* ────────────────────────────────────────────────────────────────────────────
 * F. 计时状态机
 * ──────────────────────────────────────────────────────────────────────────── */

console.log('\n[F] 计时状态机')
{
  const idle = fresh()
  check('F1 初始为 idle', focusStatus(idle) === 'idle', focusStatus(idle))

  const running = startRound(idle, T0)
  check('F2 idle → running', focusStatus(running) === 'running', focusStatus(running))
  check('F3 开始后 deadline = now + 25min', running.deadline === T0 + 25 * MIN, running.deadline)
  check('F4 开始后生成 roundId', /^focus-/.test(running.roundId ?? ''), running.roundId)
  check('F5 开始后 startedAt = now', running.startedAt === T0, running.startedAt)

  check('F6 重复 start 无副作用', startRound(running, T0 + 1000) === running)

  const paused = pauseRound(running, T0 + 10 * MIN)
  check('F7 running → paused', focusStatus(paused) === 'paused', focusStatus(paused))
  check('F8 暂停冻结剩余 15 分钟', remainingSecondsAt(paused, T0 + 10 * MIN) === 900, remainingSecondsAt(paused, T0 + 10 * MIN))
  check('F9 暂停后时间流逝不再减少剩余', remainingSecondsAt(paused, T0 + 60 * MIN) === 900)
  check('F10 暂停保留 startedAt（刷新后时间区间不跑偏）', paused.startedAt === T0, paused.startedAt)

  // 多次暂停：10 分钟 + 5 分钟 = 15 分钟
  const resumed = startRound(paused, T0 + 30 * MIN)
  check('F11 paused → running 沿用同一轮 id', resumed.roundId === running.roundId, resumed.roundId)
  check('F12 继续后 deadline = now + 剩余', resumed.deadline === T0 + 30 * MIN + 900_000, resumed.deadline)
  const pausedAgain = pauseRound(resumed, T0 + 35 * MIN)
  check('F13 多次暂停累计 15 分钟', elapsedSecondsAt(pausedAgain, T0 + 35 * MIN) === 900, elapsedSecondsAt(pausedAgain, T0 + 35 * MIN))
  check('F14 多次暂停后实际分钟 = 15', actualFocusMinutes(pausedAgain, T0 + 35 * MIN) === 15)

  const { state: done, result } = endRound(pausedAgain, T0 + 35 * MIN, SETTINGS)
  check('F15 paused → completed', focusStatus(done) === 'completed', focusStatus(done))
  check('F16 提前结束记实际 15 分钟（不是目标 25）', result.minutes === 15, result)
  check('F17 结算保留 roundId 作为幂等键', result.roundId === running.roundId, result.roundId)
  check('F18 completed 状态记住真实分钟', done.lastMinutes === 15, done.lastMinutes)
  check('F19 结算后清空 startedAt（防重放）', done.startedAt === null)
  check('F20 结算后不再 running', done.running === false)

  const again = endRound(done, T0 + 40 * MIN, SETTINGS)
  check('F21 重复结束不再产生记录', again.result.recorded === false && again.result.minutes === 0, again.result)

  // 完整跑完
  const full = startRound(fresh(), T0)
  const { result: fullResult } = endRound(full, T0 + 25 * MIN + 400, SETTINGS)
  check('F22 跑满 25 分钟记 25 分钟', fullResult.minutes === 25, fullResult)

  // 不足 1 分钟
  const tiny = pauseRound(startRound(fresh(), T0), T0 + 30_000)
  const tinyResult = endRound(tiny, T0 + 30_000, SETTINGS).result
  check('F23 不足 1 分钟不记录', tinyResult.recorded === false && tinyResult.minutes === 0, tinyResult)

  // 取消
  const cancelled = cancelRound(pauseRound(startRound(fresh(), T0), T0 + 5 * MIN))
  check('F24 取消回到 idle', focusStatus(cancelled) === 'idle', focusStatus(cancelled))
  check('F25 取消清空 roundId 与开始时间', cancelled.roundId === '' && cancelled.startedAt === null)
  check('F26 取消后剩余回满', cancelled.remainingSeconds === 25 * 60)

  // running → completed（到点自动结算）
  const auto = startRound(fresh(), T0)
  const autoResult = endRound(auto, T0 + 25 * MIN, SETTINGS).result
  check('F27 到点自动结算记满', autoResult.minutes === 25 && autoResult.recorded, autoResult)

  // 休息
  const afterRound = endRound(startRound(fresh(), T0), T0 + 25 * MIN, SETTINGS).state
  const shortBreak = startBreak(afterRound, T0 + 26 * MIN, SETTINGS)
  check('F28 第 1 轮后是短休', shortBreak.info.phase === 'short' && shortBreak.info.minutes === 5, shortBreak.info)
  check('F29 休息状态 = break', focusStatus(shortBreak.state) === 'break', focusStatus(shortBreak.state))
  check('F30 休息有独立 deadline', shortBreak.state.deadline === T0 + 26 * MIN + 5 * MIN, shortBreak.state.deadline)
  const pausedBreak = pauseRound(shortBreak.state, T0 + 27 * MIN)
  check('F31 休息暂停 = break-paused', focusStatus(pausedBreak) === 'break-paused', focusStatus(pausedBreak))
  const resumedBreak = resumeRound(pausedBreak, T0 + 29 * MIN)
  check('F32 休息继续沿用剩余时间', remainingSecondsAt(resumedBreak, T0 + 29 * MIN) === 240, remainingSecondsAt(resumedBreak, T0 + 29 * MIN))
  const backToFocus = finishBreak(resumedBreak)
  check('F33 休息结束回专注待机', focusStatus(backToFocus) === 'idle' && backToFocus.phase === 'focus', focusStatus(backToFocus))
  check('F34 回专注用专注长度（不是休息长度）', backToFocus.durationMinutes === 25 && backToFocus.remainingSeconds === 1500, backToFocus)

  // 长休：第 4 轮之后
  const round4 = { ...afterRound, roundInCycle: 4 }
  const longBreak = startBreak(round4, T0, SETTINGS)
  check('F35 第 4 轮后是长休 15 分钟', longBreak.info.phase === 'long' && longBreak.info.minutes === 15, longBreak.info)
  check('F36 长休后环序号归零', longBreak.state.roundInCycle === 0, longBreak.state.roundInCycle)

  // 休息时间不计入专注
  const breakElapsed = elapsedSecondsAt(shortBreak.state, T0 + 30 * MIN)
  check('F37 休息段 elapsed 恒为 0（不计入专注）', breakElapsed === 0, breakElapsed)
}

console.log('\n[F] 刷新恢复 / 后台节流 / 睡眠 / 系统时间')
{
  const running = startRound(fresh(), T0)
  // 正常刷新：deadline 还在未来
  const restored = restoreTimerState(running, T0 + 5 * MIN).state
  check('F38 刷新后仍在跑，剩余 20 分钟', restored.running && remainingSecondsAt(restored, T0 + 5 * MIN) === 1200, remainingSecondsAt(restored, T0 + 5 * MIN))
  check('F39 刷新保留 roundId（重放不重复记账）', restored.roundId === running.roundId, restored.roundId)

  // 暂停后刷新：startedAt 不能丢（Phase 5.5 修）
  const paused = pauseRound(running, T0 + 8 * MIN)
  const restoredPaused = restoreTimerState(paused, T0 + 20 * MIN).state
  check('F40 暂停刷新后仍是 paused', focusStatus(restoredPaused) === 'paused', focusStatus(restoredPaused))
  check('F41 暂停刷新保留 startedAt', restoredPaused.startedAt === T0, restoredPaused.startedAt)
  check('F42 暂停刷新保留剩余 17 分钟', restoredPaused.remainingSeconds === 1020, restoredPaused.remainingSeconds)

  // 后台节流：没有任何 tick，30 分钟后回来
  const expired = restoreTimerState(running, T0 + 30 * MIN).state
  check('F43 后台节流 30 分钟后识别为到点', remainingSecondsAt(expired, T0 + 30 * MIN) === 0)
  const settled = endRound(expired, T0 + 30 * MIN, SETTINGS).result
  check('F44 到点结算记满 25 分钟', settled.minutes === 25, settled)
  check('F45 睡眠跨过午夜时结束时间取 deadline（不跨到第二天）', settled.endedAt === T0 + 25 * MIN, new Date(settled.endedAt).toISOString())

  // 睡眠 3 小时后回来：仍判到点，结束时间仍是 deadline
  const longSleep = restoreTimerState(running, T0 + 3 * 60 * MIN).state
  const sleepResult = endRound(longSleep, T0 + 3 * 60 * MIN, SETTINGS).result
  check('F46 睡眠 3 小时回来：记满且结束时间 = deadline', sleepResult.minutes === 25 && sleepResult.endedAt === T0 + 25 * MIN, sleepResult)

  // 超过 24 小时的残留：不补记
  const stale = restoreTimerState(running, T0 + 30 * 60 * MIN).state
  check('F47 超过 24 小时的残留被重置且不补记', stale.running === false, stale.running)

  // 系统时间回拨（now 早于 startedAt）
  const rollback = endRound(running, T0 - 5 * MIN, SETTINGS)
  check('F48 系统时间回拨：剩余夹到全长、实际 0 分钟', rollback.result.minutes === 0 && rollback.result.recorded === false, rollback.result)

  // 非法状态
  const broken = restoreTimerState({ running: true, deadline: 'x', durationMinutes: 999, remainingSeconds: -5 }, T0).state
  check('F49 非法状态被夹到合法值', broken.durationMinutes === 90 && broken.remainingSeconds === 0, broken)
  check('F50 非法状态的 roundId 被丢弃', (broken.roundId ?? '') === '')
  check('F51 时钟回拨时 elapsed 不为负', elapsedSecondsAt({ ...fresh(), remainingSeconds: 1500 }, T0 + 10 * MIN) === 0)

  const id = createRoundId(T0, () => 0.5)
  check('F52 roundId 可注入随机数（测试可复现）', id.startsWith('focus-') && id === createRoundId(T0, () => 0.5), id)
}

/* ────────────────────────────────────────────────────────────────────────────
 * G. 数据链路
 * ──────────────────────────────────────────────────────────────────────────── */

console.log('\n[G] SessionLog / DailyAggregate / TimelineEvent')
{
  const task: Task = {
    id: 't1',
    title: '练习条件类型',
    status: 'todo',
    done: false,
    pomodoros: 0,
    focusedMinutes: 10,
    projectId: 'p1',
    createdAt: T0 - MIN,
    updatedAt: T0 - MIN,
  }
  const project = { id: 'p1', name: 'TS 前端', archived: false, createdAt: T0 - MIN }

  const state = startRound({ ...fresh(), boundTaskId: 't1' }, T0)
  const { result } = endRound(pauseRound(state, T0 + 18 * MIN), T0 + 18 * MIN, SETTINGS)

  const outcome = finishFocus({
    logs: [],
    daily: [],
    timeline: [],
    tasks: [task],
    result,
    task,
    projects: [project],
  })
  const log = outcome.logs?.[0]
  check('G1 写入一条 focus 日志', outcome.logs?.length === 1 && log?.kind === 'focus', log)
  check('G2 日志分钟 = 实际 18（不是目标 25）', log?.minutes === 18, log?.minutes)
  check('G3 日志 id = roundId（幂等键）', log?.id === result.roundId, log?.id)
  check('G4 日志带 taskId 与 projectId', log?.taskId === 't1' && log?.projectId === 'p1', log)
  check('G5 日志带项目名（列表可直接显示）', log?.project === 'TS 前端', log?.project)
  check('G6 日志带时间区间 detail', typeof log?.detail === 'string' && log.detail.includes('→'), log?.detail)
  check('G7 日志标题含任务名', (log?.title ?? '').includes('练习条件类型'), log?.title)
  check('G8 Daily focusMinutes = 18', getDaily(outcome.daily ?? [], dayKey(T0)).focusMinutes === 18, outcome.daily)
  check('G9 Daily sessions 不因专注增加', getDaily(outcome.daily ?? [], dayKey(T0)).sessions === 0)
  check('G10 时间轴写入 focus.completed', outcome.timeline?.[0]?.type === 'focus.completed', outcome.timeline)
  check('G11 时间轴 refId = 日志 id', outcome.timeline?.[0]?.refId === log?.id)
  check('G12 任务累计 focusedMinutes = 10 + 18', outcome.tasks?.[0]?.focusedMinutes === 28, outcome.tasks?.[0]?.focusedMinutes)
  check('G13 任务 pomodoros +1', outcome.tasks?.[0]?.pomodoros === 1, outcome.tasks?.[0]?.pomodoros)

  // 幂等
  const repeat = finishFocus({
    logs: outcome.logs ?? [],
    daily: outcome.daily ?? [],
    timeline: outcome.timeline ?? [],
    tasks: outcome.tasks ?? [],
    result,
    task,
    projects: [project],
  })
  check('G14 同一轮重复提交返回空结果', Object.keys(repeat).length === 0, repeat)

  // 0 分钟 / 空 id
  const zero = finishFocus({ logs: [], daily: [], timeline: [], tasks: [], result: { ...result, minutes: 0 } })
  check('G15 0 分钟不写入', Object.keys(zero).length === 0)
  const noId = finishFocus({ logs: [], daily: [], timeline: [], tasks: [], result: { ...result, roundId: '' } })
  check('G16 没有幂等键不写入', Object.keys(noId).length === 0)

  // 任务已删除
  const orphan = finishFocus({
    logs: [],
    daily: [],
    timeline: [],
    tasks: [],
    result: { ...result, roundId: 'focus-orphan-1', taskId: 'gone' },
    projects: [project],
    activeProjectId: 'p1',
  })
  check('G17 任务已删除：日志仍写入，但没有 taskId', orphan.logs?.[0] !== undefined && orphan.logs[0].taskId === undefined, orphan.logs?.[0])
  check('G18 任务已删除：归属退到当前活跃项目', orphan.logs?.[0]?.projectId === 'p1', orphan.logs?.[0]?.projectId)

  // 自由专注（没有任务、没有项目）
  const free = finishFocus({ logs: [], daily: [], timeline: [], tasks: [], result: { ...result, roundId: 'focus-free-1', taskId: '' } })
  check('G19 自由专注也能写入', free.logs?.[0]?.minutes === 18 && free.logs[0].taskId === undefined, free.logs?.[0])

  // 多次专注累计
  let logs = outcome.logs ?? []
  let daily = outcome.daily ?? []
  let timeline = outcome.timeline ?? []
  let tasks = outcome.tasks ?? []
  for (let index = 0; index < 2; index += 1) {
    const s = startRound({ ...fresh(25), boundTaskId: 't1' }, T0 + (index + 1) * 60 * MIN)
    const r = endRound(s, T0 + (index + 1) * 60 * MIN + 25 * MIN, SETTINGS).result
    const out = finishFocus({ logs, daily, timeline, tasks, result: r, task: tasks[0], projects: [project] })
    logs = out.logs ?? logs
    daily = out.daily ?? daily
    timeline = out.timeline ?? timeline
    tasks = out.tasks ?? tasks
  }
  check('G20 同一天多次专注累计 68 分钟', getDaily(daily, dayKey(T0)).focusMinutes === 18 + 25 + 25, getDaily(daily, dayKey(T0)))
  check('G21 三条日志都在', logs.length === 3, logs.length)
  check('G22 任务累计 18+25+25+10', tasks[0]?.focusedMinutes === 78, tasks[0]?.focusedMinutes)

  // 与 rebuildDaily 口径一致
  const rebuilt = rebuildDaily({ logs, tasks, friction: [] })
  const live = getDaily(daily, dayKey(T0))
  const expected = rebuilt.find(item => item.day === dayKey(T0))
  check(
    'G23 增量写入与 rebuildDaily 完全一致',
    expected !== undefined &&
      expected.focusMinutes === live.focusMinutes &&
      expected.tasksDone === live.tasksDone &&
      expected.sessions === live.sessions,
    { live, expected },
  )

  // 删除回退
  const target = logs[0]!
  const afterDelete = deleteLog({ logs, daily, logId: target.id })
  // logs 是「新→旧」，logs[0] 是最后写的那一轮（25 分钟），去掉的就是它自己的分钟数
  const removedMinutes = Math.max(0, Math.round(target.minutes ?? 0))
  check(
    'G24 删除专注日志回退 focusMinutes',
    getDaily(afterDelete.daily ?? daily, dayKey(T0)).focusMinutes === live.focusMinutes - removedMinutes,
    { got: getDaily(afterDelete.daily ?? daily, dayKey(T0)), removedMinutes, live },
  )
  check('G25 删除后日志剩 2 条', afterDelete.logs?.length === 2)
  const deleteAgain = deleteLog({ logs: afterDelete.logs ?? [], daily: afterDelete.daily ?? daily, logId: target.id })
  check('G26 重复删除不产生负数也不改数据', Object.keys(deleteAgain).length === 0)
}

console.log('\n[G] 会话日志与 sessions 回退（Phase 5.5 修）')
{
  const day = dayKey(T0)
  const sessionLog: SessionLog = {
    id: 'log-1',
    at: T0,
    kind: 'message',
    title: '讨论了类型收窄',
    source: 'auto',
    edited: false,
  }
  const added = addSessionLog({ logs: [], daily: [], timeline: [], log: sessionLog })
  check('G27 会话日志写入 logs', added.logs?.[0]?.id === 'log-1')
  check('G28 会话日志计入 sessions = 1', getDaily(added.daily ?? [], day).sessions === 1, added.daily)
  check('G29 会话日志不计入 focusMinutes', getDaily(added.daily ?? [], day).focusMinutes === 0)
  check('G30 会话日志不写时间轴（降噪）', added.timeline === undefined)
  const dup = addSessionLog({ logs: added.logs ?? [], daily: added.daily ?? [], timeline: [], log: sessionLog })
  check('G31 同 id 重复投递不重复计数', Object.keys(dup).length === 0)

  const milestone = addSessionLog({
    logs: added.logs ?? [],
    daily: added.daily ?? [],
    timeline: [],
    log: { ...sessionLog, id: 'log-2', kind: 'milestone', title: '完成第一版' },
  })
  check('G32 里程碑写一条 log.milestone', milestone.timeline?.[0]?.type === 'log.milestone', milestone.timeline)

  const removed = deleteLog({ logs: milestone.logs ?? [], daily: milestone.daily ?? [], logId: 'log-1' })
  check('G33 删除会话日志回退 sessions（原缺陷已修）', getDaily(removed.daily ?? [], day).sessions === 1, getDaily(removed.daily ?? [], day))

  const removedAll = deleteLogs({ logs: removed.logs ?? [], daily: removed.daily ?? [], logIds: ['log-2'] })
  check('G34 批量删除同样回退 sessions 到 0', getDaily(removedAll.daily ?? [], day).sessions === 0, removedAll.daily)
  const negative = deleteLogs({ logs: [], daily: removedAll.daily ?? [], logIds: ['log-2'] })
  check('G35 删不存在的 id 返回空结果（不会减成负数）', Object.keys(negative).length === 0)

  // 混合删除：focus + 会话
  const mixedDaily = applyDailyDelta(applyDailyDelta([], day, { focusMinutes: 50 }, T0), day, { sessions: 2 }, T0)
  const mixedLogs: SessionLog[] = [
    { id: 'f1', at: T0, kind: 'focus', title: '专注 25', minutes: 25, source: 'manual', edited: false },
    { id: 'f2', at: T0 + 1000, kind: 'focus', title: '专注 25', minutes: 25, source: 'manual', edited: false },
    { id: 's1', at: T0 + 2000, kind: 'message', title: '聊天', source: 'auto', edited: false },
    { id: 's2', at: T0 + 3000, kind: 'tool-call', title: '工具', source: 'auto', edited: false },
  ]
  const mixed = deleteLogs({ logs: mixedLogs, daily: mixedDaily, logIds: ['f1', 's1'] })
  const mixedDay = getDaily(mixed.daily ?? [], day)
  check('G36 混合删除：focusMinutes 50 → 25', mixedDay.focusMinutes === 25, mixedDay)
  check('G37 混合删除：sessions 2 → 1', mixedDay.sessions === 1, mixedDay)

  // 与 rebuild 的一致性（在删掉一半之后）
  const rebuiltMixed = rebuildDaily({ logs: mixed.logs ?? [], tasks: [], friction: [] }).find(item => item.day === day)
  check('G38 删除后的 daily 仍与 rebuildDaily 一致', rebuiltMixed?.focusMinutes === 25 && rebuiltMixed?.sessions === 1, rebuiltMixed)
}

console.log('\n[G] 上限与历史一致性')
{
  const day = dayKey(T0)
  // 400 条日志 + daily → 窗口统计仍取 daily（不被裁掉的日志影响）
  const logs: SessionLog[] = Array.from({ length: 400 }, (_, index) => ({
    id: `l${index}`,
    at: T0 - index * MIN,
    kind: 'focus' as const,
    title: `专注 ${index}`,
    minutes: 25,
    source: 'manual' as const,
    edited: false,
  }))
  const daily: DailyAggregate[] = [{ day, focusMinutes: 100, tasksDone: 0, sessions: 0, friction: 0 }]
  const win = buildActivityWindow({ daily, tasks: [], logs }, { range: 30, now: T0 })
  check('G39 400 条日志时仍以 daily 为准（不重复累计）', win.summary.focusMinutes >= 100, win.summary.focusMinutes)
  check('G40 7 天窗口可用（专注面板复用同一套口径）', buildActivityWindow({ daily, tasks: [], logs }, { range: 7, now: T0 }).days.length === 7)

  // 1200 条时间轴环形上限
  let timeline: TimelineEvent[] = []
  for (let index = 0; index < 1250; index += 1) {
    timeline = appendEvent(timeline, makeEvent({ type: 'focus.completed', title: `e${index}`, refId: `r${index}` }, T0 + index * 1000)).list
  }
  check('G41 时间轴超过 1200 条时裁到 1200', timeline.length === 1200, timeline.length)
  check('G42 保留的是最新的（头部最新）', timeline[0]?.refId === 'r1249', timeline[0]?.refId)

  // 同一天任务完成数用绝对值
  const tasks: Task[] = [
    { id: 'a', title: 'A', status: 'done', done: true, pomodoros: 0, createdAt: T0, updatedAt: T0, completedAt: T0 },
    { id: 'b', title: 'B', status: 'todo', done: false, pomodoros: 0, createdAt: T0, updatedAt: T0 },
  ]
  const synced = syncDailyTasks([], tasks, day, T0)
  check('G43 tasksDone 用绝对值（重开再完成不会变 2）', getDaily(synced, day).tasksDone === 1, synced)

  // addFocusLog 旧接口仍在（同 id 幂等）
  const legacy = addFocusLog({
    logs: [],
    daily: [],
    timeline: [],
    log: { id: 'legacy-1', at: T0, kind: 'focus', title: '旧接口', minutes: 12, source: 'manual', edited: false },
  })
  const legacyDup = addFocusLog({
    logs: legacy.logs ?? [],
    daily: legacy.daily ?? [],
    timeline: legacy.timeline ?? [],
    log: { id: 'legacy-1', at: T0, kind: 'focus', title: '旧接口', minutes: 12, source: 'manual', edited: false },
  })
  check('G44 addFocusLog 同 id 幂等', legacy.logs?.length === 1 && Object.keys(legacyDup).length === 0)
}

console.log(`\n结果：${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
