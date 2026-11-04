/**
 * settlement.test.ts — 专注结算的事务性与恢复（Phase 5.5.1，纯逻辑 + 假存储）。
 *
 * 用 `lib/tx` 的 `createFakeStore` 精确控制「第几次写入失败」，因此可以稳定复现：
 *   S1 正常完整结算
 *   S2 第一个键失败（logs）
 *   S3 中间键失败（tasks）
 *   S4 最后键失败（timeline）
 *   S5 失败后重试成功
 *   S6 同一 roundId 重复提交（幂等）
 *   S7 真正的并发：两个读者都在写前读到旧快照 → 双写 → 靠修复收敛
 *   S8 重复副本修复（日志 / Daily / 任务 / 时间轴各回退一份）
 *   S9  删除日志后聚合回退
 *   S10 结算后 Daily / Task / Timeline 与 SessionLog 一致
 *   E   放弃这一笔：安全清理 / 拒绝清理 / 清理失败 / 数据隔离（Phase 6.1）
 *
 * 跑法：
 *   npx esbuild scripts/ui/settlement.test.ts --bundle --platform=node --format=cjs \
 *     --outfile=scripts/ui/.build/settlement.cjs && node scripts/ui/.build/settlement.cjs
 */
import { STORAGE_KEYS, type DailyAggregate, type SessionLog, type Task, type TimelineEvent } from '../../src/client/types'
import { createFakeStore, type RawStore } from '../../src/client/lib/tx'
import { wrapEnvelope, unwrapEnvelope } from '../../src/client/lib/schema'
import {
  detectDuplicateRounds,
  discardSettlement,
  planDiscard,
  readSettlementState,
  repairDuplicateSettlements,
  repairSettlementStore,
  settleFocus,
  snapshotBaseline,
  verifySettlement,
  type SettlementBaseline,
} from '../../src/client/lib/settlement'
import { rebuildDaily, getDaily } from '../../src/client/lib/daily'
import { deleteLog } from '../../src/client/lib/actions'
import { endRound, pauseRound, startRound } from '../../src/client/lib/focus'
import type { FocusSettings } from '../../src/client/lib/focus'
import { createDefaultTimerState } from '../../src/client/lib/defaults'
import { dayKey } from '../../src/client/lib/time'

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
const T0 = new Date(2026, 10, 4, 9, 0, 0, 0).getTime()
const SETTINGS: FocusSettings = { breakEnabled: true, shortBreakMinutes: 5, longBreakMinutes: 15, roundsBeforeLongBreak: 4 }

const TASK: Task = {
  id: 't1',
  title: '练习条件类型',
  status: 'todo',
  done: false,
  pomodoros: 0,
  focusedMinutes: 0,
  projectId: 'p1',
  createdAt: T0 - MIN,
  updatedAt: T0 - MIN,
}

/** 造一轮「已经专注 18 分钟」的结算结果。 */
function round18(): ReturnType<typeof endRound>['result'] {
  const state = { ...createDefaultTimerState(T0), durationMinutes: 25, remainingSeconds: 1500, focusMinutes: 25, boundTaskId: 't1' }
  const started = startRound(state, T0)
  const paused = pauseRound(started, T0 + 18 * MIN)
  return endRound(paused, T0 + 18 * MIN, SETTINGS).result
}

function seedStore(): Record<string, string> {
  return {
    [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope([])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([TASK])),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([])),
    [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope([])),
  }
}

function dump(store: { dump(): Record<string, string> }): {
  logs: SessionLog[]
  tasks: Task[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
} {
  const raw = store.dump()
  const parse = <T>(key: string, fallback: T): T => {
    const text = raw[key]
    if (text === undefined) return fallback
    try {
      return (unwrapEnvelope(JSON.parse(text) as unknown).data as T) ?? fallback
    } catch {
      return fallback
    }
  }
  return {
    logs: parse<SessionLog[]>(STORAGE_KEYS.logs, []),
    tasks: parse<Task[]>(STORAGE_KEYS.tasks, []),
    daily: parse<DailyAggregate[]>(STORAGE_KEYS.daily, []),
    timeline: parse<TimelineEvent[]>(STORAGE_KEYS.timeline, []),
  }
}

console.log('\n[S1] 正常完整结算')
{
  const store = createFakeStore(seedStore())
  const result = round18()
  const outcome = settleFocus({ result, store, projects: [{ id: 'p1', name: 'TS 前端', archived: false, createdAt: T0 }] })
  const data = dump(store)
  check('S1.1 事务成功并写 4 个键', outcome.ok && outcome.written === 4, outcome)
  check('S1.2 日志写入 1 条（18 分钟）', data.logs.length === 1 && data.logs[0]?.minutes === 18, data.logs)
  check('S1.3 Daily focusMinutes = 18', getDaily(data.daily, dayKey(T0)).focusMinutes === 18, data.daily)
  check('S1.4 任务累计 18 分钟 + 1 个 pomodoro', data.tasks[0]?.focusedMinutes === 18 && data.tasks[0]?.pomodoros === 1, data.tasks[0])
  check('S1.5 时间轴 1 条 focus.completed', data.timeline.length === 1 && data.timeline[0]?.type === 'focus.completed', data.timeline)
  check('S1.6 返回 next 与落盘一致', outcome.next?.logs.length === 1 && outcome.next.daily.length === 1, outcome.next)
}

console.log('\n[S2..S4] 单键失败 → 全部回滚（部分写入已被消除）')
{
  const cases: Array<{ name: string; at: number }> = [
    { name: 'S2 第一个键（logs）失败', at: 1 },
    { name: 'S3 中间键（tasks）失败', at: 2 },
    { name: 'S4 最后键（timeline）失败', at: 4 },
  ]
  for (const item of cases) {
    const store = createFakeStore(seedStore(), item.at)
    const outcome = settleFocus({ result: round18(), store })
    const data = dump(store)
    check(
      `${item.name}：四个实体都没变`,
      data.logs.length === 0 &&
        getDaily(data.daily, dayKey(T0)).focusMinutes === 0 &&
        (data.tasks[0]?.focusedMinutes ?? 0) === 0 &&
        data.timeline.length === 0,
      { data, outcome },
    )
    check(`${item.name}：如实报失败 + 回滚成功`, outcome.ok === false && outcome.restored === true && outcome.failedKey !== undefined, outcome)
    check(`${item.name}：失败时不返回 next（不把半成品交给 UI）`, outcome.next === undefined, outcome.next)
    check(`${item.name}：提示里点名失败键`, /没有保存/.test(outcome.message) && outcome.message.includes('回滚'), outcome.message)
  }
}

console.log('\n[S5] 失败后重试')
{
  // 第 3 次写入（daily）失败一次；重试时不再失败
  const store = createFakeStore(seedStore(), 3)
  const result = round18()
  const first = settleFocus({ result, store })
  check('S5.1 首次失败且回滚', first.ok === false && dump(store).logs.length === 0, { first, data: dump(store) })
  const second = settleFocus({ result, store })
  const data = dump(store)
  check('S5.2 重试成功', second.ok === true && second.written === 4, second)
  check('S5.3 重试后只有一份数据', data.logs.length === 1 && getDaily(data.daily, dayKey(T0)).focusMinutes === 18, data)
  check('S5.4 任务只加一次', data.tasks[0]?.focusedMinutes === 18 && data.tasks[0]?.pomodoros === 1, data.tasks[0])
}

console.log('\n[S6] 同一 roundId 重复提交')
{
  const store = createFakeStore(seedStore())
  const result = round18()
  settleFocus({ result, store })
  const again = settleFocus({ result, store })
  const data = dump(store)
  check('S6.1 第二次是 duplicate 且不写', again.ok && again.duplicate && again.written === 0, again)
  check('S6.2 数据没有翻倍', data.logs.length === 1 && getDaily(data.daily, dayKey(T0)).focusMinutes === 18, data)
  check('S6.3 任务没有翻倍', data.tasks[0]?.focusedMinutes === 18 && data.tasks[0]?.pomodoros === 1, data.tasks[0])
  check('S6.4 时间轴没有翻倍', data.timeline.length === 1, data.timeline.length)
}

console.log('\n[S7] 并发：同 round 不翻倍、被覆盖时能发现')
{
  /**
   * 现实里能复现的最坏情况：两个标签页各自在写前读了一次，都读到「还没写过」。
   * 用「冻结读」模拟第二个标签页手里的旧快照。
   *
   * 结论（不是假设，下面逐条断言）：
   *   • 因为写的是**整份数组**，两边算出的结果相同 → 最终只有一条，Daily 不会翻倍；
   *   • 代价是后写覆盖先写 —— 所以同 round 是「幂等」，跨 round 是「最后写赢」。
   */
  /**
   * `freezeOnce`：每个键只让**第一次**读到旧值（模拟「这个标签页写前读的是旧快照」），
   * 之后的读取（写后校验）读真实值 —— 与真实浏览器里第二个标签页的行为一致。
   */
  let frozen: Record<string, string> | null = null
  const inner = createFakeStore(seedStore())
  const racy: RawStore = {
    readRaw: key => {
      if (frozen !== null && key in frozen) {
        const stale = frozen[key]!
        delete frozen[key]
        return stale
      }
      return inner.readRaw(key)
    },
    writeRaw: (key, raw) => inner.writeRaw(key, raw),
    removeRaw: key => inner.removeRaw(key),
  }
  const result = round18()
  const first = settleFocus({ result, store: racy })
  check('S7.1 第一个标签页写入成功', first.ok && first.written === 4, first)

  frozen = seedStore()
  const second = settleFocus({ result, store: racy })
  frozen = null
  const data = dump(inner)
  check('S7.2 同 round 并发不会写出两条日志', data.logs.length === 1, data.logs.length)
  check('S7.3 Daily 不会翻倍（仍是 18）', getDaily(data.daily, dayKey(T0)).focusMinutes === 18, data.daily)
  check('S7.4 任务不会翻倍', data.tasks[0]?.focusedMinutes === 18 && data.tasks[0]?.pomodoros === 1, data.tasks[0])
  check('S7.5 时间轴不会翻倍', data.timeline.length === 1, data.timeline.length)
  check('S7.6 第二个标签页的写入被当成「新写」而不是重复（它看到的是旧快照）', second.ok === true, second)

  // 写后立刻被第三方覆盖：校验必须发现「我们这一笔不见了」
  const overlord = createFakeStore(seedStore())
  let hijacked = false
  const hostile: RawStore = {
    readRaw: key => overlord.readRaw(key),
    writeRaw: (key, raw) => {
      const ok = overlord.writeRaw(key, raw)
      // 第一次写 logs 成功后，模拟另一个标签页立刻用「空日志」覆盖回来
      if (ok && key === STORAGE_KEYS.logs && !hijacked) {
        hijacked = true
        overlord.writeRaw(key, JSON.stringify(wrapEnvelope([])))
      }
      return ok
    },
    removeRaw: key => overlord.removeRaw(key),
  }
  const overwritten = settleFocus({ result, store: hostile })
  check('S7.7 写入后被覆盖 → 报失败而不是谎报成功', overwritten.ok === false, overwritten)
  check('S7.8 提示说明「校验未通过、已保留待重试」', /校验未通过/.test(overwritten.message) && /待重试|保留/.test(overwritten.message), overwritten.message)
  check('S7.9 不会返回 next（界面不会显示已保存）', overwritten.next === undefined)
}

console.log('\n[S8] 修复写回存储')
{
  const duplicated: Record<string, string> = {
    ...seedStore(),
    [STORAGE_KEYS.logs]: JSON.stringify(
      wrapEnvelope([
        { id: 'focus-x', at: T0, kind: 'focus', title: '专注 18', minutes: 18, source: 'manual', edited: false, taskId: 't1' },
        { id: 'focus-x', at: T0, kind: 'focus', title: '专注 18', minutes: 18, source: 'manual', edited: false, taskId: 't1' },
      ]),
    ),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([{ day: dayKey(T0), focusMinutes: 36, tasksDone: 0, sessions: 0, friction: 0 }])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([{ ...TASK, focusedMinutes: 36, pomodoros: 2 }])),
    [STORAGE_KEYS.timeline]: JSON.stringify(
      wrapEnvelope([
        { id: 'e1', at: T0, type: 'focus.completed', title: '专注', refId: 'focus-x' },
        { id: 'e2', at: T0 + 1, type: 'focus.completed', title: '专注', refId: 'focus-x' },
      ]),
    ),
  }
  const store = createFakeStore(duplicated)
  const outcome = repairSettlementStore(store)
  const data = dump(store)
  check('S8.1 修复确实发生了', outcome.changed && outcome.ok && outcome.removedLogs === 1, outcome)
  check('S8.2 存储里只剩一条日志', data.logs.length === 1, data.logs.length)
  check('S8.3 存储里 Daily = 18', getDaily(data.daily, dayKey(T0)).focusMinutes === 18, data.daily)
  check('S8.4 存储里任务回退', data.tasks[0]?.focusedMinutes === 18 && data.tasks[0]?.pomodoros === 1, data.tasks[0])
  check('S8.5 存储里时间轴只剩一条', data.timeline.length === 1, data.timeline.length)

  const clean = createFakeStore(seedStore())
  const noop = repairSettlementStore(clean)
  check('S8.6 没有重复时不写盘', noop.changed === false && noop.ok, noop)
}

console.log('\n[S9] 删除日志后的聚合')
{
  const store = createFakeStore(seedStore())
  settleFocus({ result: round18(), store })
  const before = dump(store)
  const removed = deleteLog({ logs: before.logs, daily: before.daily, logId: before.logs[0]!.id })
  check('S9.1 删除后 focusMinutes 归零', getDaily(removed.daily ?? [], dayKey(T0)).focusMinutes === 0, removed.daily)
  check('S9.2 删除后与 rebuildDaily 一致', rebuildDaily({ logs: removed.logs ?? [], tasks: before.tasks, friction: [] }).length === 0)
  check('S9.3 任务副本不因删日志回退（按任务的历史投入，不反向扣）', before.tasks[0]?.focusedMinutes === 18)
}

console.log('\n[S10] 四个实体最终一致')
{
  const store = createFakeStore(seedStore())
  const result = round18()
  settleFocus({ result, store })
  const data = readSettlementState(store)
  const rebuilt = rebuildDaily({ logs: data.logs, tasks: data.tasks, friction: [] }).find(item => item.day === dayKey(T0))
  const live = getDaily(data.daily, dayKey(T0))
  check(
    'S10.1 Daily 与「从日志重建」逐字段一致',
    rebuilt !== undefined && rebuilt.focusMinutes === live.focusMinutes && rebuilt.sessions === live.sessions,
    { rebuilt, live },
  )
  check('S10.2 时间轴事件指向真实日志 id', data.timeline[0]?.refId === data.logs[0]?.id, data.timeline[0])
  check('S10.3 日志的 taskId 指向真实任务', data.logs[0]?.taskId === data.tasks[0]?.id, data.logs[0])
  check('S10.4 任务累计 = 日志分钟', (data.tasks[0]?.focusedMinutes ?? 0) === (data.logs[0]?.minutes ?? 0))
}


const EMPTY_STATE: { logs: SessionLog[]; tasks: Task[]; daily: DailyAggregate[]; timeline: TimelineEvent[] } = {
  logs: [],
  tasks: [],
  daily: [],
  timeline: [],
}


/**
 * 失败窗口存储：第 `from`..`to` 次写入失败（含回滚写入），之后恢复正常。
 *
 * 这是复现「回滚也失败」的关键：`createFakeStore` 的 `alwaysFailAfter` 会连重试
 * 一起挡住，没法验证「失败后重试能补齐」。窗口模式则精确对应真实场景 ——
 * 配额瞬间满 → 写入与回滚都失败 → 用户清理后重试成功。
 */
function createWindowStore(initial: Record<string, string>, from: number, to: number) {
  const inner = createFakeStore(initial)
  let attempts = 0
  return {
    readRaw: (key: string) => inner.readRaw(key),
    writeRaw: (key: string, raw: string) => {
      attempts += 1
      if (attempts >= from && attempts <= to) return false
      return inner.writeRaw(key, raw)
    },
    removeRaw: (key: string) => inner.removeRaw(key),
    dump: () => inner.dump(),
    get attempts() {
      return attempts
    },
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * T. Phase 5.5.2：回滚失败 / 部分写入 / 四实体校验 / 修复
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 可编程存储：能精确控制「第几次写哪个键失败」「哪个键的回滚失败」。
 *
 * `createFakeStore` 只能按写入序号失败，模拟不了「logs 回滚失败」这种场景，
 * 所以这里用一个小实现，行为与 localStorage 等价（读不到的键返回 null）。
 */
function createScriptedStore(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial))
  const failWrites = new Set<string>()
  const failRestore = new Set<string>()
  let writes = 0
  return {
    get writes() {
      return writes
    },
    /** 下一次写这个键失败（一次性）。 */
    failNextWrite(key: string) {
      failWrites.add(key)
    },
    /** 下一次「写回旧值」失败（一次性，用来模拟回滚失败）。 */
    failNextRestore(key: string) {
      failRestore.add(key)
    },
    readRaw: (key: string) => map.get(key) ?? null,
    writeRaw: (key: string, raw: string) => {
      // 回滚写入的是旧值：用 failRestore 单独控制
      if (failRestore.size > 0 && raw === map.get(key)) {
        if (failRestore.has(key)) {
          failRestore.delete(key)
          return false
        }
        return true
      }
      writes += 1
      if (failWrites.has(key)) {
        failWrites.delete(key)
        return false
      }
      map.set(key, raw)
      return true
    },
    removeRaw: (key: string) => map.delete(key),
    dump: () => Object.fromEntries(map.entries()),
    raw: (key: string) => map.get(key) ?? null,
  }
}

function dumpScripted(store: ReturnType<typeof createScriptedStore>): {
  logs: SessionLog[]
  tasks: Task[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
} {
  const raw = store.dump()
  const parse = <T>(key: string, fallback: T): T => {
    const text = raw[key]
    if (text === undefined) return fallback
    try {
      return (unwrapEnvelope(JSON.parse(text) as unknown).data as T) ?? fallback
    } catch {
      return fallback
    }
  }
  return {
    logs: parse<SessionLog[]>(STORAGE_KEYS.logs, []),
    tasks: parse<Task[]>(STORAGE_KEYS.tasks, []),
    daily: parse<DailyAggregate[]>(STORAGE_KEYS.daily, []),
    timeline: parse<TimelineEvent[]>(STORAGE_KEYS.timeline, []),
  }
}

function assertAllFour(
  label: string,
  data: { logs: SessionLog[]; tasks: Task[]; daily: DailyAggregate[]; timeline: TimelineEvent[] },
  minutes: number,
  roundId: string,
): void {
  const day = dayKey(T0)
  check(
    `${label}：日志 1 条且分钟数正确`,
    data.logs.filter(log => log.id === roundId).length === 1 &&
      data.logs.find(log => log.id === roundId)?.minutes === minutes,
    data.logs.map(log => `${log.id}:${log.minutes}`),
  )
  check(`${label}：Daily 恰好 +${minutes}`, getDaily(data.daily, day).focusMinutes === minutes, getDaily(data.daily, day))
  check(
    `${label}：任务恰好 +${minutes} 分钟 / +1 个番茄`,
    data.tasks[0]?.focusedMinutes === minutes && data.tasks[0]?.pomodoros === 1,
    { focusedMinutes: data.tasks[0]?.focusedMinutes, pomodoros: data.tasks[0]?.pomodoros },
  )
  check(
    `${label}：时间轴恰好 1 条 focus.completed`,
    data.timeline.filter(event => event.type === 'focus.completed' && event.refId === roundId).length === 1,
    data.timeline.map(event => event.refId),
  )
}

console.log('\n[T1] logs 写入成功、daily 失败、回滚 logs 也失败 → 重试必须补齐')
{
  /**
   * 用 `createFakeStore(initial, failAtWrite=3, alwaysFailAfter=3)` 精确复现：
   * 写 ① logs 成功、② tasks 成功、③ daily 失败 → 回滚 ② 失败 → 回滚 ① 失败。
   * 最终存储：logs/tasks 已是新值（回滚没写回去），daily/timeline 是旧值 —— 这正是
   * 「日志在、其余缺失」的部分写入状态。
   */
  // 写 1=logs 成功、2=tasks 成功；3=daily 失败 → 4=回滚 tasks 失败 → 5=回滚 logs 失败；6 起恢复
  const store = createWindowStore(seedStore(), 3, 5)
  const result = round18()
  const first = settleFocus({ result, store })
  const partial = dump(store)
  check('T1.1 首次结算报失败且回滚不完整', first.ok === false && first.restored === false, {
    ok: first.ok,
    restored: first.restored,
    message: first.message,
  })
  check(
    'T1.2 确实留下「日志在、其余缺失」的部分状态',
    partial.logs.length === 1 && getDaily(partial.daily, dayKey(T0)).focusMinutes === 0 && partial.timeline.length === 0,
    {
      logs: partial.logs.length,
      daily: partial.daily.length,
      timeline: partial.timeline.length,
      task: partial.tasks[0]?.focusedMinutes,
    },
  )
  check('T1.3 失败结果带回基线快照', first.baseline !== undefined && first.baseline.dailyMinutes === null, first.baseline)
  check('T1.4 提示写明「回滚未完成」且要求重试', /回滚未完成/.test(first.message) && /重试/.test(first.message), first.message)

  // 关键：旧实现会因为「日志已存在」直接返回 duplicate + ok，从而清掉 pending
  const retry = settleFocus({ result, store, ...(first.baseline === undefined ? {} : { baseline: first.baseline }) })
  const repaired = dump(store)
  check('T1.5 重试走修复路径（不是 duplicate 直接成功）', retry.ok === true && retry.repaired === true, retry)
  check('T1.6 重试后提示说明补齐了哪些实体', /补齐/.test(retry.message), retry.message)
  assertAllFour('T1.7', repaired, 18, result.roundId)
}

console.log('\n[T2..T5] 部分实体缺失的单点修复')
{
  const cases: Array<{ name: string; mutate: (state: typeof EMPTY_STATE) => typeof EMPTY_STATE; expectRepaired: RegExp }> = [
    {
      name: 'T2 只有任务缺失',
      mutate: state => ({ ...state, tasks: [{ ...TASK }] }),
      expectRepaired: /任务/,
    },
    {
      name: 'T3 只有时间轴缺失',
      mutate: state => ({ ...state, timeline: [] }),
      expectRepaired: /时间轴/,
    },
    {
      name: 'T4 只有 Daily 缺失',
      mutate: state => ({ ...state, daily: [] }),
      expectRepaired: /日聚合/,
    },
    {
      name: 'T5 三个都缺失',
      mutate: state => ({ ...state, tasks: [{ ...TASK }], daily: [], timeline: [] }),
      expectRepaired: /(日聚合|任务|时间轴)/,
    },
  ]
  for (const item of cases) {
    const store = createScriptedStore(seedStore())
    const result = round18()
    const baseline = snapshotBaseline(readSettlementState(store), result)
    // 手工构造「日志已写入，其余按用例缺失」的部分状态
    const base = readSettlementState(store)
    const withLog: typeof EMPTY_STATE = {
      ...base,
      logs: [
        {
          id: result.roundId,
          at: result.endedAt,
          kind: 'focus',
          title: '18 分钟专注',
          minutes: 18,
          taskId: 't1',
          projectId: 'p1',
          source: 'manual',
          edited: false,
        },
      ],
      daily: [{ day: dayKey(result.endedAt), focusMinutes: 18, tasksDone: 0, sessions: 0, friction: 0 }],
      tasks: [{ ...TASK, focusedMinutes: 18, pomodoros: 1 }],
      timeline: [
        { id: 'evt-1', at: result.endedAt, type: 'focus.completed', title: '专注 18 分钟', refId: result.roundId },
      ],
    }
    const partial = item.mutate(withLog)
    const store2 = createScriptedStore(seedStore())
    // 写入部分状态（绕过事务）
    const wrap = (value: unknown): string => JSON.stringify(wrapEnvelope(value))
    store2.writeRaw(STORAGE_KEYS.logs, wrap(partial.logs))
    store2.writeRaw(STORAGE_KEYS.tasks, wrap(partial.tasks))
    store2.writeRaw(STORAGE_KEYS.daily, wrap(partial.daily))
    store2.writeRaw(STORAGE_KEYS.timeline, wrap(partial.timeline))
    const outcome = settleFocus({ result, store: store2, baseline })
    const data = dumpScripted(store2)
    check(`${item.name}：进入修复并成功`, outcome.ok === true && outcome.repaired === true, outcome)
    check(`${item.name}：提示点名补齐的实体`, item.expectRepaired.test(outcome.message), outcome.message)
    assertAllFour(`${item.name}`, data, 18, result.roundId)
    check(`${item.name}：没有重复累计`, getDaily(data.daily, dayKey(result.endedAt)).focusMinutes === 18)
  }
}

console.log('\n[T6..T7] 修复后再次重试 / 「刷新」后重试')
{
  const store = createWindowStore(seedStore(), 3, 5)
  const result = round18()
  const first = settleFocus({ result, store })
  const baseline = first.baseline as SettlementBaseline
  const retry = settleFocus({ result, store, baseline })
  check('T6.1 第一次修复成功', retry.ok && retry.repaired, retry)
  const again = settleFocus({ result, store, baseline })
  check('T6.2 再次重试是「已完整」而不是再修一次', again.ok && again.duplicate && !again.repaired, again)
  const data = dump(store)
  check('T6.3 反复重试不会重复累计', getDaily(data.daily, dayKey(T0)).focusMinutes === 18 && data.tasks[0]?.pomodoros === 1, {
    daily: getDaily(data.daily, dayKey(T0)),
    task: data.tasks[0],
  })

  // 「刷新」= 重新从存储读 pending（同一个 baseline）
  const store2 = createWindowStore(seedStore(), 3, 5)
  const beforeRefresh = settleFocus({ result, store: store2 })
  const afterRefresh = settleFocus({ result, store: store2, baseline: beforeRefresh.baseline })
  check('T7.1 刷新后自动恢复成功', afterRefresh.ok && afterRefresh.repaired, afterRefresh)
  assertAllFour('T7.2', dump(store2), 18, result.roundId)
}

console.log('\n[T8..T9] 判断不了时：不猜、不写、保留 pending')
{
  // 没有基线
  const store = createScriptedStore(seedStore())
  const result = round18()
  const wrap = (value: unknown): string => JSON.stringify(wrapEnvelope(value))
  store.writeRaw(
    STORAGE_KEYS.logs,
    wrap([{ id: result.roundId, at: result.endedAt, kind: 'focus', title: '18 分钟专注', minutes: 18, taskId: 't1', source: 'manual', edited: false }]),
  )
  const outcome = settleFocus({ result, store })
  const data = dumpScripted(store)
  check('T8.1 无基线时不假装成功', outcome.ok === false && outcome.duplicate === true, outcome)
  check(
    'T8.2 只补可确定的时间轴，Daily / 任务一律不动',
    data.daily.length === 0 && (data.tasks[0]?.focusedMinutes ?? 0) === 0 && data.timeline.length === 1,
    { daily: data.daily.length, task: data.tasks[0]?.focusedMinutes, timeline: data.timeline.length },
  )
  check('T8.3 报告「无法确定」并列出缺失实体', /无法确定/.test(outcome.message) && outcome.failedEntities !== undefined, outcome)
  check('T8.4 明确列出判断不了的实体', (outcome.ambiguousEntities ?? []).length > 0, outcome.ambiguousEntities)

  // 有基线，但 Daily 被别人改成了「中间值」
  const store2 = createScriptedStore(seedStore())
  const baseline = snapshotBaseline(readSettlementState(store2), result)
  store2.writeRaw(
    STORAGE_KEYS.logs,
    wrap([{ id: result.roundId, at: result.endedAt, kind: 'focus', title: '18 分钟专注', minutes: 18, taskId: 't1', source: 'manual', edited: false }]),
  )
  store2.writeRaw(
    STORAGE_KEYS.daily,
    wrap([{ day: dayKey(result.endedAt), focusMinutes: 5, tasksDone: 0, sessions: 0, friction: 0 }]),
  )
  const outcome2 = settleFocus({ result, store: store2, baseline })
  const data2 = dumpScripted(store2)
  check(
    'T9.1 Daily 处于中间值时判断为「无法确定」',
    outcome2.ok === false && (outcome2.ambiguousEntities ?? []).includes('日聚合') && /无法确定/.test(outcome2.message),
    outcome2,
  )
  check('T9.2 不会把 Daily 改成错误的数字', getDaily(data2.daily, dayKey(result.endedAt)).focusMinutes === 5, data2.daily)
}

console.log('\n[T10..T12] 边界：任务被删 / 未绑定 / 时间轴重复')
{
  // 任务被删：不重建、verify 不因任务缺失而失败
  const store = createScriptedStore({
    ...seedStore(),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([])),
  })
  const result = round18()
  const outcome = settleFocus({ result, store })
  const data = dumpScripted(store)
  check('T10.1 任务已被删除时仍能完成结算', outcome.ok === true, outcome)
  check('T10.2 不会重新创建任务', data.tasks.length === 0, data.tasks)
  check('T10.3 任务已删除时日志不带 taskId（沿用既有语义）', data.logs[0]?.taskId === undefined, data.logs[0])

  // 未绑定任务
  const store2 = createScriptedStore(seedStore())
  const result2 = { ...round18(), taskId: '' }
  const outcome2 = settleFocus({ result: result2, store: store2 })
  const data2 = dumpScripted(store2)
  check('T11.1 未绑定任务时结算成功', outcome2.ok === true, outcome2)
  check('T11.2 不改动任何任务的副本', data2.tasks[0]?.focusedMinutes === 0 && data2.tasks[0]?.pomodoros === 0, data2.tasks[0])
  check('T11.3 Daily 仍然正确累计', getDaily(data2.daily, dayKey(T0)).focusMinutes === 18, data2.daily)

  // 时间轴重复（多标签遗留）
  const store3 = createScriptedStore(seedStore())
  const result3 = round18()
  const baseline3 = snapshotBaseline(readSettlementState(store3), result3)
  const wrap = (value: unknown): string => JSON.stringify(wrapEnvelope(value))
  store3.writeRaw(
    STORAGE_KEYS.logs,
    wrap([{ id: result3.roundId, at: result3.endedAt, kind: 'focus', title: '18 分钟专注', minutes: 18, taskId: 't1', source: 'manual', edited: false }]),
  )
  store3.writeRaw(STORAGE_KEYS.daily, wrap([{ day: dayKey(result3.endedAt), focusMinutes: 18, tasksDone: 0, sessions: 0, friction: 0 }]))
  store3.writeRaw(STORAGE_KEYS.tasks, wrap([{ ...TASK, focusedMinutes: 18, pomodoros: 1 }]))
  store3.writeRaw(
    STORAGE_KEYS.timeline,
    wrap([
      { id: 'e1', at: result3.endedAt, type: 'focus.completed', title: '专注', refId: result3.roundId },
      { id: 'e2', at: result3.endedAt + 1, type: 'focus.completed', title: '专注', refId: result3.roundId },
    ]),
  )
  const outcome3 = settleFocus({ result: result3, store: store3, baseline: baseline3 })
  const data3 = dumpScripted(store3)
  check('T12.1 重复事件被去重', outcome3.ok === true && data3.timeline.length === 1, { timeline: data3.timeline.length, outcome3 })
  check('T12.2 去重不重复加分钟', getDaily(data3.daily, dayKey(T0)).focusMinutes === 18, data3.daily)
}

console.log('\n[D] verifySettlement 四实体校验')
{
  const result = round18()
  const baseline = { day: dayKey(T0), dailyMinutes: 0, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 }
  const log: SessionLog = {
    id: result.roundId,
    at: result.endedAt,
    kind: 'focus',
    title: '18 分钟专注',
    minutes: 18,
    taskId: 't1',
    source: 'manual',
    edited: false,
  }
  const good = {
    logs: [log],
    tasks: [{ ...TASK, focusedMinutes: 18, pomodoros: 1 }],
    daily: [{ day: dayKey(T0), focusMinutes: 18, tasksDone: 0, sessions: 0, friction: 0 }],
    timeline: [{ id: 'e1', at: result.endedAt, type: 'focus.completed' as const, title: '专注', refId: result.roundId }],
  }
  check('D1 四份齐全时通过', verifySettlement(good, result, baseline).ok === true, verifySettlement(good, result, baseline))

  const noLog = { ...good, logs: [] }
  check('D2 缺日志 → 只报日志', JSON.stringify(verifySettlement(noLog, result, baseline).failed) === JSON.stringify(['会话日志']), verifySettlement(noLog, result, baseline))
  const badMinutes = { ...good, logs: [{ ...log, minutes: 25 }] }
  check('D3 日志分钟数不符 → 报日志', verifySettlement(badMinutes, result, baseline).failed.includes('会话日志'))
  const lowDaily = { ...good, daily: [{ day: dayKey(T0), focusMinutes: 5, tasksDone: 0, sessions: 0, friction: 0 }] }
  check('D4 Daily 不足 → 报日聚合', verifySettlement(lowDaily, result, baseline).failed.includes('日聚合'))
  const noTaskCredit = { ...good, tasks: [{ ...TASK }] }
  check('D5 任务未累计 → 报任务', verifySettlement(noTaskCredit, result, baseline).failed.includes('任务'))
  const noEvent = { ...good, timeline: [] }
  check('D6 时间轴缺失 → 报时间轴', verifySettlement(noEvent, result, baseline).failed.includes('时间轴'))
  const twoEvents = { ...good, timeline: [...good.timeline, { ...good.timeline[0]!, id: 'e2' }] }
  check('D7 时间轴重复 → 报时间轴', verifySettlement(twoEvents, result, baseline).failed.includes('时间轴'))
  const taskDeleted = { ...good, tasks: [] }
  check('D8 任务被删不算失败', verifySettlement(taskDeleted, result, baseline).ok === true, verifySettlement(taskDeleted, result, baseline))
  const unboundLog = { ...log }
  delete unboundLog.taskId
  const unbound = { ...good, logs: [unboundLog], tasks: [{ ...TASK }] }
  check(
    'D9 未绑定任务时忽略任务校验',
    verifySettlement(unbound, { ...result, taskId: '' }, { ...baseline, taskId: '' }).ok === true,
    verifySettlement(unbound, { ...result, taskId: '' }, { ...baseline, taskId: '' }),
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * E. Phase 6.1：「放弃这一笔」的清理安全性
 *
 * 目标不是「能删就删」，而是**只删能证明属于本轮的东西**：
 *   • 证明得了（日聚合与任务都还等于基线）→ 删本轮日志 + 本轮事件；
 *   • 证明不了（缺基线 / 已累计 / 日志对不上）→ 一个字节都不动，保留待保存状态；
 *   • 删的过程失败 → 保留恢复标记，如实报告失败原因。
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 按「第几次写这个键」失败，用来精确复刻「清理写一半」「回滚也失败」。
 * `fails` 形如 `{ logs: [2] }` —— 第 2 次写 logs 失败。
 */
function createAtStore(initial: Record<string, string>, fails: Record<string, number[]>) {
  const map = new Map(Object.entries(initial))
  const hits = new Map<string, number>()
  return {
    dump: () => Object.fromEntries(map.entries()),
    readRaw: (key: string) => map.get(key) ?? null,
    writeRaw: (key: string, raw: string) => {
      const n = (hits.get(key) ?? 0) + 1
      hits.set(key, n)
      if ((fails[key] ?? []).includes(n)) return false
      map.set(key, raw)
      return true
    },
    removeRaw: (key: string) => map.delete(key),
    raw: (key: string) => map.get(key) ?? null,
  }
}

/** 造「本轮日志 + 时间轴事件已写、日聚合与任务未累计」的现场。 */
function partialWrite(base?: {
  logs?: SessionLog[]
  daily?: DailyAggregate[]
  tasks?: Task[]
  timeline?: TimelineEvent[]
  baseline?: SettlementBaseline
}) {
  const result = round18()
  const ownLog: SessionLog = {
    id: result.roundId,
    at: result.endedAt,
    kind: 'focus',
    title: '18 分钟专注 · 练习条件类型',
    minutes: 18,
    taskId: 't1',
    source: 'manual',
    edited: false,
  }
  const ownEvent: TimelineEvent = {
    id: 'ev-own',
    at: result.endedAt,
    type: 'focus.completed',
    title: '专注 18 分钟',
    refId: result.roundId,
  }
  const baseline: SettlementBaseline = base?.baseline ?? {
    day: dayKey(result.endedAt),
    dailyMinutes: null,
    taskId: 't1',
    taskMinutes: 0,
    taskPomodoros: 0,
  }
  const initial: Record<string, string> = {
    [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope(base?.logs ?? [ownLog])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope(base?.tasks ?? [TASK])),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope(base?.daily ?? [])),
    [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope(base?.timeline ?? [ownEvent])),
  }
  return { result, ownLog, ownEvent, baseline, initial }
}

const TIMER_KEY = 'test:timer'
const pendingTimerRaw = (roundId: string): string => JSON.stringify(wrapEnvelope({ pendingResult: { roundId } }))

console.log('\n[E1] 部分写入后安全放弃：只删本轮日志与事件')
{
  const { result, baseline, initial } = partialWrite()
  const store = createFakeStore({ ...initial, [TIMER_KEY]: pendingTimerRaw(result.roundId) })
  const plan = planDiscard(readSettlementState(store), result, baseline)
  check('E1.1 判定可安全清理', plan.safe === true && plan.blockers.length === 0, plan.blockers)
  check('E1.2 计划删除 1 条日志 + 1 条事件', plan.removedLogs === 1 && plan.removedEvents === 1, plan)

  const outcome = discardSettlement({
    result,
    store,
    baseline,
    timer: { key: TIMER_KEY, value: { pendingResult: undefined } },
  })
  const data = dump(store)
  check('E1.3 清理成功', outcome.ok === true, outcome)
  check('E1.4 本轮日志被删除', data.logs.length === 0, data.logs)
  check('E1.5 本轮时间轴事件被删除', data.timeline.length === 0, data.timeline)
  check('E1.6 日聚合一个字节都没改', data.daily.length === 0, data.daily)
  check('E1.7 任务一个字节都没改', (data.tasks[0]?.focusedMinutes ?? 0) === 0 && (data.tasks[0]?.pomodoros ?? 0) === 0, data.tasks[0])
  const timerRaw = store.readRaw(TIMER_KEY)
  const timerData = timerRaw === null ? {} : (JSON.parse(timerRaw) as { data?: { pendingResult?: unknown } }).data ?? {}
  check('E1.8 pendingResult 在同一事务里被清掉', timerData.pendingResult === undefined, timerData)
  check('E1.9 删除与清标记都算进了一次事务', outcome.written === 3, outcome.written)
  check('E1.10 文案说「未完整保存」，绝不说「已记入」', outcome.message.includes('未完整保存') && !outcome.message.includes('已记入'), outcome.message)
  check('E1.11 文案点明删了什么', outcome.message.includes('1 条日志') && outcome.message.includes('1 条时间轴事件'), outcome.message)
}

console.log('\n[E2] 其他数据隔离：别的轮次 / 普通会话日志 / 别的任务')
{
  const otherRound: SessionLog = {
    id: 'focus-other-1',
    at: T0 - 40 * MIN,
    kind: 'focus',
    title: '25 分钟专注',
    minutes: 25,
    taskId: 't2',
    source: 'manual',
    edited: false,
  }
  const sessionLog: SessionLog = {
    id: 'sess-1',
    at: T0 - 30 * MIN,
    kind: 'session',
    title: '阅读会话',
    minutes: 0,
    source: 'capture',
    edited: false,
  }
  const otherTask: Task = { ...TASK, id: 't2', title: '复习闭包', focusedMinutes: 25, pomodoros: 1 }
  const otherEvent: TimelineEvent = { id: 'ev-other', at: T0 - 40 * MIN, type: 'focus.completed', title: '专注 25 分钟', refId: 'focus-other-1' }

  const { result, ownLog, ownEvent } = partialWrite()
  /** 这一天已经有别的轮次的 25 分钟与 1 条会话；任务 t1 仍是 0。 */
  const baseline: SettlementBaseline = { day: dayKey(T0), dailyMinutes: 25, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 }
  const store = createFakeStore({
    [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope([ownLog, otherRound, sessionLog])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([TASK, otherTask])),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([{ day: dayKey(T0), focusMinutes: 25, tasksDone: 0, sessions: 1, friction: 0 }])),
    [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope([ownEvent, otherEvent])),
    [TIMER_KEY]: pendingTimerRaw(result.roundId),
  })

  const outcome = discardSettlement({ result, store, baseline, timer: { key: TIMER_KEY, value: {} } })
  const data = dump(store)
  check('E2.1 清理成功', outcome.ok === true, outcome)
  check('E2.2 只剩别人的 2 条日志（另一轮 + 会话）', data.logs.length === 2, data.logs.map(log => log.id))
  check('E2.3 本轮日志确实不在了', data.logs.every(log => log.id !== result.roundId))
  check('E2.4 普通会话日志被保留', data.logs.some(log => log.id === 'sess-1'))
  check('E2.5 别的轮次日志被保留', data.logs.some(log => log.id === 'focus-other-1'))
  check('E2.6 别的轮次事件被保留', data.timeline.length === 1 && data.timeline[0]?.refId === 'focus-other-1', data.timeline)
  check('E2.7 当天日聚合仍是 25（不含本轮）', getDaily(data.daily, dayKey(T0)).focusMinutes === 25, data.daily)
  check('E2.8 别的任务副本没被动', data.tasks.find(task => task.id === 't2')?.focusedMinutes === 25, data.tasks)
}

console.log('\n[E3] 无法确认 → 禁止清理（缺基线）')
{
  const { result, initial } = partialWrite()
  const store = createFakeStore({ ...initial, [TIMER_KEY]: pendingTimerRaw(result.roundId) })
  const outcome = discardSettlement({ result, store, timer: { key: TIMER_KEY, value: {} } })
  const data = dump(store)
  check('E3.1 拒绝清理', outcome.ok === false && outcome.blockers.length > 0, outcome)
  check('E3.2 日志没被删', data.logs.length === 1, data.logs.length)
  check('E3.3 时间轴没被删', data.timeline.length === 1, data.timeline.length)
  check('E3.4 pendingResult 保留', store.readRaw(TIMER_KEY) === pendingTimerRaw(result.roundId), store.readRaw(TIMER_KEY))
  check('E3.5 一个字节都没写', outcome.written === 0, outcome.written)
  check('E3.6 文案说明「数据可能部分写入」', outcome.message.includes('部分写入'), outcome.message)
  check('E3.7 文案提醒先导出备份', outcome.message.includes('导出备份'), outcome.message)
  check('E3.8 文案不说「已记入」', !outcome.message.includes('已记入'), outcome.message)
}

console.log('\n[E4] 已累计 → 禁止清理（日聚合 / 任务）')
{
  // 日聚合已经加过：基线说 0，现在是 18
  const dailyCase = partialWrite({
    daily: [{ day: dayKey(T0), focusMinutes: 18, tasksDone: 0, sessions: 0, friction: 0 }],
    baseline: { day: dayKey(T0), dailyMinutes: 0, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 },
  })
  const store1 = createFakeStore({ ...dailyCase.initial, [TIMER_KEY]: pendingTimerRaw(dailyCase.result.roundId) })
  const out1 = discardSettlement({ result: dailyCase.result, store: store1, baseline: dailyCase.baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E4.1 日聚合已累计 → 拒绝', out1.ok === false && out1.blockers.some(text => text.includes('日聚合')), out1.blockers)
  check('E4.2 日聚合的 18 分钟没被抹掉', getDaily(dump(store1).daily, dayKey(T0)).focusMinutes === 18)
  check('E4.3 日志也没被删', dump(store1).logs.length === 1)

  // 任务已经加过
  const taskCase = partialWrite({
    tasks: [{ ...TASK, focusedMinutes: 18, pomodoros: 1 }],
    baseline: { day: dayKey(T0), dailyMinutes: null, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 },
  })
  const store2 = createFakeStore({ ...taskCase.initial, [TIMER_KEY]: pendingTimerRaw(taskCase.result.roundId) })
  const out2 = discardSettlement({ result: taskCase.result, store: store2, baseline: taskCase.baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E4.4 任务已累计 → 拒绝', out2.ok === false && out2.blockers.some(text => text.includes('任务')), out2.blockers)
  check('E4.5 任务副本没被反扣', dump(store2).tasks[0]?.focusedMinutes === 18)
  check('E4.6 日志没被删', dump(store2).logs.length === 1)
}

console.log('\n[E5] 日志对不上 → 禁止清理（分钟 / 日期 / 类型 / 重复）')
{
  const cases: Array<{ name: string; log: SessionLog; expect: string }> = []
  const { result, ownLog: base } = partialWrite()
  cases.push({ name: 'E5.1 分钟不符', log: { ...base, minutes: 25 }, expect: '分钟' })
  cases.push({ name: 'E5.2 日期不符', log: { ...base, at: T0 - 24 * 60 * MIN }, expect: '日期' })
  cases.push({ name: 'E5.3 不是专注记录', log: { ...base, kind: 'session' }, expect: '不是专注记录' })

  for (const item of cases) {
    const store = createFakeStore({
      [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope([item.log])),
      [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([TASK])),
      [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([])),
      [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope([])),
      [TIMER_KEY]: pendingTimerRaw(result.roundId),
    })
    const outcome = discardSettlement({
      result,
      store,
      baseline: { day: dayKey(T0), dailyMinutes: null, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 },
      timer: { key: TIMER_KEY, value: {} },
    })
    check(`${item.name} → 拒绝并说明原因`, outcome.ok === false && outcome.blockers.some(text => text.includes(item.expect)), outcome.blockers)
    check(`${item.name} 日志未被删`, dump(store).logs.length === 1)
  }

  // 同一轮出现两条日志：交给重复收敛，放弃流程不碰
  const store2 = createFakeStore({
    [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope([base, { ...base }])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([TASK])),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([])),
    [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope([])),
    [TIMER_KEY]: pendingTimerRaw(result.roundId),
  })
  const out2 = discardSettlement({
    result,
    store: store2,
    baseline: { day: dayKey(T0), dailyMinutes: null, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 },
    timer: { key: TIMER_KEY, value: {} },
  })
  check('E5.4 同一轮多条日志 → 拒绝（交给重复收敛）', out2.ok === false && out2.blockers.some(text => text.includes('多条')), out2.blockers)
  check('E5.5 两条日志都还在', dump(store2).logs.length === 2)
}

console.log('\n[E6] 什么都没写 / 回滚留下脏日聚合')
{
  const { result } = partialWrite()
  const baseline: SettlementBaseline = { day: dayKey(T0), dailyMinutes: null, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 }

  const empty = createFakeStore({
    [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope([])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([TASK])),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([])),
    [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope([])),
    [TIMER_KEY]: pendingTimerRaw(result.roundId),
  })
  const out1 = discardSettlement({ result, store: empty, baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E6.1 确实没写过 → 允许清标记', out1.ok === true && out1.removedLogs === 0 && out1.removedEvents === 0, out1)
  check('E6.2 文案说明「没有写入任何记录」', out1.message.includes('没有写入任何记录'), out1.message)
  check('E6.3 不碰日聚合与任务', dump(empty).daily.length === 0 && (dump(empty).tasks[0]?.focusedMinutes ?? 0) === 0)

  /**
   * 反向用例：日志被回滚掉了，但 Daily 已经加上 18。
   * 「没东西可删」**不等于**「可以放行」—— 直接清标记会把 18 分钟永久留在日聚合里。
   */
  const dirty = createFakeStore({
    [STORAGE_KEYS.logs]: JSON.stringify(wrapEnvelope([])),
    [STORAGE_KEYS.tasks]: JSON.stringify(wrapEnvelope([TASK])),
    [STORAGE_KEYS.daily]: JSON.stringify(wrapEnvelope([{ day: dayKey(T0), focusMinutes: 18, tasksDone: 0, sessions: 0, friction: 0 }])),
    [STORAGE_KEYS.timeline]: JSON.stringify(wrapEnvelope([])),
    [TIMER_KEY]: pendingTimerRaw(result.roundId),
  })
  const out2 = discardSettlement({ result, store: dirty, baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E6.4 无痕迹但日聚合已累计 → 拒绝清理', out2.ok === false, out2)
  check('E6.5 保留待保存状态', dirty.readRaw(TIMER_KEY) === pendingTimerRaw(result.roundId))
  check('E6.6 日聚合没被偷偷改回 0', getDaily(dump(dirty).daily, dayKey(T0)).focusMinutes === 18)
}

console.log('\n[E7] 任务已被删除：没有可回退的副本，仍可安全清理')
{
  const { result, initial } = partialWrite({ tasks: [] })
  const store = createFakeStore({ ...initial, [TIMER_KEY]: pendingTimerRaw(result.roundId) })
  const outcome = discardSettlement({
    result,
    store,
    baseline: { day: dayKey(T0), dailyMinutes: null, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 },
    timer: { key: TIMER_KEY, value: {} },
  })
  check('E7.1 任务不在 → 不阻塞', outcome.ok === true, outcome)
  check('E7.2 不重建任务', dump(store).tasks.length === 0)
  check('E7.3 日志与事件仍被清理', dump(store).logs.length === 0 && dump(store).timeline.length === 0)
}

console.log('\n[E8] 清理本身失败：不谎报成功')
{
  const { result, initial, baseline } = partialWrite()
  const store = createAtStore({ ...initial, [TIMER_KEY]: pendingTimerRaw(result.roundId) }, { [STORAGE_KEYS.logs]: [1] })
  const outcome = discardSettlement({ result, store, baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E8.1 报失败并点名失败的键', outcome.ok === false && outcome.failedKey === STORAGE_KEYS.logs, outcome)
  check('E8.2 数据一个字节都没动', dump(store).logs.length === 1 && dump(store).timeline.length === 1)
  check('E8.3 回滚成功（restored=true）', outcome.restored === true, outcome)
  check('E8.4 待保存标记还在', store.readRaw(TIMER_KEY) === pendingTimerRaw(result.roundId))
  check('E8.5 文案说明「没有改动、可以再试」', outcome.message.includes('没有改动') && outcome.message.includes('再试'), outcome.message)
  check('E8.6 文案不说成功', !outcome.message.includes('已清理') && !outcome.message.includes('已放弃'), outcome.message)
}

console.log('\n[E9] 清理写一半 + 回滚失败：保留恢复标记并明说风险')
{
  const { result, initial, baseline } = partialWrite()
  // 第 1 次写 timeline 失败；回滚 logs（第 2 次写）也失败
  const store = createAtStore(
    { ...initial, [TIMER_KEY]: pendingTimerRaw(result.roundId) },
    { [STORAGE_KEYS.timeline]: [1], [STORAGE_KEYS.logs]: [2] },
  )
  const outcome = discardSettlement({ result, store, baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E9.1 报失败', outcome.ok === false, outcome)
  check('E9.2 如实报告回滚未完成', outcome.restored === false, outcome.restored)
  check('E9.3 保留恢复标记（pendingResult 还在）', store.readRaw(TIMER_KEY) === pendingTimerRaw(result.roundId))
  check('E9.4 文案提示「中间状态」并要求先导出备份', outcome.message.includes('中间状态') && outcome.message.includes('导出备份'), outcome.message)
  check('E9.5 不显示成功', !outcome.message.includes('已清理'), outcome.message)
}

console.log('\n[E10] 删除后校验失败：把待保存标记写回，不留下「标记没了数据还在」')
{
  const { result, initial, baseline } = partialWrite()
  const inner = createAtStore({ ...initial, [TIMER_KEY]: pendingTimerRaw(result.roundId) }, {})
  const originalLogs = initial[STORAGE_KEYS.logs]!
  let hijacked = false
  const hostile: RawStore = {
    readRaw: key => inner.readRaw(key),
    writeRaw: (key, raw) => {
      const ok = inner.writeRaw(key, raw)
      // 模拟另一个标签页：我们刚删掉日志，它立刻把旧日志整份写回来
      if (ok && key === STORAGE_KEYS.logs && !hijacked) {
        hijacked = true
        inner.writeRaw(key, originalLogs)
      }
      return ok
    },
    removeRaw: key => inner.removeRaw(key),
  }
  const outcome = discardSettlement({ result, store: hostile, baseline, timer: { key: TIMER_KEY, value: {} } })
  check('E10.1 校验发现日志还在 → 报失败', outcome.ok === false && outcome.message.includes('校验'), outcome)
  check('E10.2 待保存标记被写回去', hostile.readRaw(TIMER_KEY) === pendingTimerRaw(result.roundId), hostile.readRaw(TIMER_KEY))
  check('E10.3 文案说明「可以再试一次」', outcome.message.includes('再试'), outcome.message)
}

console.log(`\n结果：${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)