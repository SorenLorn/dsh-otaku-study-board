/**
 * settlement.ts — 专注结算的**原子落盘**、四实体校验与部分写入修复
 * （Phase 5.5.1 建立 / Phase 5.5.2 补齐恢复闭环）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * Phase 5.5 的 `finishFocus` 只算「新数据长什么样」，落盘由 `useBoardActions`
 * 拆成四次独立的 `useLocalStore.update`：logs → tasks → daily → timeline。
 * 四次写盘各自独立，任何一个失败都会留下**部分写入**（实测：daily 写失败时
 * 日志和任务已经加上了；logs 写失败时 daily/task/时间轴已经加上了，日志却没有）。
 *
 * ── 5.5.2 修掉的致命漏洞 ──────────────────────────────────────────────────
 * 5.5.1 用「日志 id 已存在」作为「这一轮已经结算过」的判据。可是**事务回滚也可能
 * 失败**：logs 写入成功、daily 写入失败、随后回滚 logs 又失败 —— 最终存储里
 * 「日志在、Daily/任务/时间轴不在」。此时重试会因为看到日志而直接返回 duplicate，
 * 上层据此清掉 pendingResult，那一笔专注的日聚合与任务投入就永久丢了。
 *
 * 现在的判据是**四个实体各自校验**（`verifySettlement`），日志只是其中之一：
 *   • 四份都完整 → 才算「已经记过」；
 *   • 日志在但其他缺失 → 进入**修复路径**（`planRepair`），按基线快照判断每个实体
 *     是否已经应用过，只补缺失的部分；
 *   • 判断不了（基线缺失、或该实体被别人改过）→ 不猜、不写、保留 pending，
 *     并明确告诉用户「无法确定是否已保存」。
 *
 * ── 能保证什么、不能保证什么 ──────────────────────────────────────────────
 * 能保证：
 *   • 单标签页内，4 个键要么全写、要么全不写（失败逆序回滚）；
 *   • 同一 roundId 只对应一笔逻辑专注，重试/刷新/多次恢复都不会重复累计；
 *   • 部分写入之后可以按快照精确补齐缺失的实体；
 *   • 失败后不谎报成功。
 * 不能保证：
 *   • 两个标签页在同一毫秒内各自完成「读 → 写」的竞争（localStorage 无锁无 CAS）；
 *   • 跨不同 round 的并发（最后写赢）；
 *   • 基线丢失 + 数据已被第三方改动时，无法判断某实体是否已累计 —— 此时保留 pending
 *     并如实报告，不做猜测式补齐。
 */
import type { DailyAggregate, Project, SessionLog, StorageKey, Task, TimelineEvent } from '../types'
import { STORAGE_KEYS } from '../types'
import { coercePayload, unwrapEnvelope } from './schema'
import { finishFocus } from './actions'
import type { FocusResult } from './focus'
import { makeEvent } from './timeline'
import { writeTransaction, type RawStore } from './tx'
import { dayKey } from './time'

export interface SettlementState {
  logs: SessionLog[]
  tasks: Task[]
  daily: DailyAggregate[]
  timeline: TimelineEvent[]
}

/**
 * 结算前的**基线快照**（Phase 5.5.2）。
 *
 * 为什么必须有：判断「Daily 是否已经加上这一轮的分钟」「任务是否已经加过」不能靠
 * 猜，也不能靠日志在不在（日志先写）。在写之前把这两个值记下来，事后就有确定依据：
 *   current === before        → 还没应用
 *   current === before + 差值  → 已经应用
 *   其它                       → 被别人改过，判断不了（不写、报告）
 *
 * 它跟着 `pendingResult` 存在 timer 里（瞬态、不进备份），刷新后仍然可查。
 */
export interface SettlementBaseline {
  /** 结算落到的日期（`YYYY-MM-DD`）。 */
  day: string
  /** 该日 focusMinutes 的快照；`null` 表示写入前还没有这一天的记录。 */
  dailyMinutes: number | null
  /** 绑定的任务 id；`''` 表示未绑定。 */
  taskId: string
  /** 该任务 focusedMinutes 的快照。 */
  taskMinutes: number | null
  /** 该任务 pomodoros 的快照。 */
  taskPomodoros: number | null
}

export interface SettleFocusInput {
  result: FocusResult
  projects?: Project[]
  activeProjectId?: string
  /** 存储端口；缺省表示无 window（纯逻辑测试），此时只计算不落盘。 */
  store?: RawStore
  /** 读不到时用的兜底快照（通常是调用方手里的当前状态）。 */
  fallback?: SettlementState
  /** 上次失败时记下的基线；用于判断各实体是否已经应用过。 */
  baseline?: SettlementBaseline
}

export interface SettleFocusOutcome {
  /** 这一笔逻辑专注是否**四份数据都已就位**（含「本来就已经完整」与「刚补齐」）。 */
  ok: boolean
  /** 结算前就已经存在同一 roundId 的日志（本次不是首次写入）。 */
  duplicate: boolean
  /** 本次是否执行了「补齐缺失实体」。 */
  repaired: boolean
  /** 失败键（事务写入失败时）。 */
  failedKey?: string
  /** 校验未通过的实体（中文名），`ok=false` 时非空。 */
  failedEntities?: string[]
  /** 无法判断是否已应用的实体（此时不会写，只报告）。 */
  ambiguousEntities?: string[]
  /** 回滚是否全部成功；false 表示数据可能不一致。 */
  restored: boolean
  /** 事务实际写入的键数。 */
  written: number
  /** 给用户看的一句话（真实、不粉饰）。 */
  message: string
  /** 结算前的基线，上层应在失败时把它存进 pendingResult。 */
  baseline?: SettlementBaseline
  /** 结算后的四份数据；失败时为空（不把半成品交给 UI）。 */
  next?: SettlementState
}

const EMPTY: SettlementState = { logs: [], tasks: [], daily: [], timeline: [] }

const LABEL = {
  logs: '会话日志',
  daily: '日聚合',
  tasks: '任务',
  timeline: '时间轴',
} as const

/** 从原始 JSON 里安全读出一份实体（洗数据与 useLocalStore 完全同一套）。 */
function readKey<T>(store: RawStore, key: StorageKey): T | undefined {
  const raw = store.readRaw(key)
  if (raw === null || raw === '') return undefined
  try {
    const { data } = unwrapEnvelope(JSON.parse(raw) as unknown)
    return coercePayload(key, data) as T
  } catch {
    return undefined
  }
}

/**
 * 读四个键的当前状态。
 *
 * 读不出来时用兜底值而不是空数组：宁可基于旧快照多算一次（会被四实体校验拦下），
 * 也不要因为一次读取抖动就当成「什么都没有」而把 daily 覆盖成 0。
 */
export function readSettlementState(store: RawStore, fallback?: SettlementState): SettlementState {
  const base = fallback ?? EMPTY
  return {
    logs: readKey<SessionLog[]>(store, STORAGE_KEYS.logs) ?? base.logs,
    tasks: readKey<Task[]>(store, STORAGE_KEYS.tasks) ?? base.tasks,
    daily: readKey<DailyAggregate[]>(store, STORAGE_KEYS.daily) ?? base.daily,
    timeline: readKey<TimelineEvent[]>(store, STORAGE_KEYS.timeline) ?? base.timeline,
  }
}

function findTask(tasks: Task[], taskId: string): Task | undefined {
  if (taskId === '') return undefined
  return tasks.find(task => task.id === taskId)
}

function labelOfKey(key: string | undefined): string {
  switch (key) {
    case STORAGE_KEYS.logs:
      return LABEL.logs
    case STORAGE_KEYS.tasks:
      return LABEL.tasks
    case STORAGE_KEYS.daily:
      return LABEL.daily
    case STORAGE_KEYS.timeline:
      return LABEL.timeline
    default:
      return '本地存储'
  }
}

function dailyMinutesOf(state: SettlementState, day: string): number | null {
  const row = state.daily.find(item => item.day === day)
  return row === undefined ? null : Math.max(0, Math.round(row.focusMinutes))
}

/** 结算前的基线快照。 */
export function snapshotBaseline(state: SettlementState, result: FocusResult): SettlementBaseline {
  const day = dayKey(result.endedAt)
  const task = findTask(state.tasks, result.taskId)
  return {
    day,
    dailyMinutes: dailyMinutesOf(state, day),
    taskId: task === undefined ? '' : task.id,
    taskMinutes: task === undefined ? null : Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25)),
    taskPomodoros: task === undefined ? null : Math.max(0, Math.round(task.pomodoros ?? 0)),
  }
}

function timelineCountFor(state: SettlementState, roundId: string): number {
  return state.timeline.filter(event => event.type === 'focus.completed' && event.refId === roundId).length
}

/**
 * 四实体校验（Phase 5.5.2）。
 *
 * 只校验**本轮结算相关的关键字段**，不做整对象深比较 —— 别的标签页可能同时改了
 * 无关字段（任务标题、其他天的聚合），深比较会误报。
 *
 * @param baseline - 有基线时用「基线 + 增量」判断，更严格；没有基线时退化为下限判断。
 */
export function verifySettlement(
  state: SettlementState,
  result: FocusResult,
  baseline?: SettlementBaseline,
): { ok: boolean; failed: string[] } {
  const failed: string[] = []
  const minutes = Math.max(0, Math.round(result.minutes))

  // ① SessionLog：有且只有一条，分钟数一致，绑定关系一致（任务被删时允许 taskId 缺失）
  const matches = state.logs.filter(log => log.id === result.roundId)
  if (matches.length !== 1) {
    failed.push(LABEL.logs)
  } else {
    const log = matches[0]!
    const sameMinutes = Math.max(0, Math.round(log.minutes ?? 0)) === minutes
    const sameDay = dayKey(log.at) === dayKey(result.endedAt)
    const taskStillExists = result.taskId === '' || state.tasks.some(task => task.id === result.taskId)
    const sameTask = !taskStillExists || log.taskId === result.taskId || log.taskId === undefined
    if (!sameMinutes || !sameDay || !sameTask) failed.push(LABEL.logs)
  }

  // ② DailyAggregate：该日必须包含这一轮的分钟（有基线时要求恰好是「基线 + 本轮」之上）
  const day = dayKey(result.endedAt)
  const dailyNow = dailyMinutesOf(state, day)
  const dailyFloor = baseline?.day === day && baseline.dailyMinutes !== null
    ? baseline.dailyMinutes + minutes
    : minutes
  if (dailyNow === null || dailyNow < dailyFloor) failed.push(LABEL.daily)

  // ③ Task：只在「有绑定任务且任务还在」时校验；任务被删不重建、不改别的任务
  if (result.taskId !== '') {
    const task = findTask(state.tasks, result.taskId)
    if (task !== undefined) {
      const focused = Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25))
      const pomodoros = Math.max(0, Math.round(task.pomodoros ?? 0))
      const focusFloor = baseline?.taskId === task.id && baseline.taskMinutes !== null
        ? baseline.taskMinutes + minutes
        : minutes
      const pomodoroFloor = baseline?.taskId === task.id && baseline.taskPomodoros !== null
        ? baseline.taskPomodoros + 1
        : 1
      if (focused < focusFloor || pomodoros < pomodoroFloor) failed.push(LABEL.tasks)
    }
  }

  // ④ TimelineEvent：有且只有一条指向本轮的 focus.completed
  if (timelineCountFor(state, result.roundId) !== 1) failed.push(LABEL.timeline)

  return { ok: failed.length === 0, failed }
}

interface RepairPlan {
  next: SettlementState
  /** 本次要补齐的实体。 */
  repaired: string[]
  /** 判断不了、不能乱写的实体。 */
  ambiguous: string[]
}

/**
 * 日志已存在时的修复计划（Phase 5.5.2）。
 *
 * 每个实体的判定都只有三种结果：**已应用 / 未应用 / 判断不了**。
 * 「判断不了」时不写，交给上层保留 pending 并报告 —— 绝不做猜测式的再加一次。
 */
function planRepair(
  state: SettlementState,
  result: FocusResult,
  baseline: SettlementBaseline | undefined,
): RepairPlan {
  const repaired: string[] = []
  const ambiguous: string[] = []
  const minutes = Math.max(0, Math.round(result.minutes))
  const day = dayKey(result.endedAt)
  let daily = state.daily
  let tasks = state.tasks
  let timeline = state.timeline

  /* ① Daily：只有「基线证明没算过」才补；证明不了就不动。 */
  const dailyNow = dailyMinutesOf(state, day)
  const dailyHasBaseline = baseline !== undefined && baseline.day === day
  if (dailyHasBaseline) {
    const before = baseline.dailyMinutes
    if (before === null) {
      // 写入前这一天没有记录：仍是空 → 补一条；已经 ≥ 本轮分钟 → 算过；
      // 介于 0 与 minutes 之间 → 被别人改过，判断不了。
      if (dailyNow === null) {
        daily = [...daily, { day, focusMinutes: minutes, tasksDone: 0, sessions: 0, friction: 0 }]
        repaired.push(LABEL.daily)
      } else if (dailyNow > 0 && dailyNow < minutes) {
        ambiguous.push(LABEL.daily)
      }
    } else if (dailyNow === null) {
      // 基线说有 50，现在整行都没了（被外部删了）→ 不重建，避免凭空造数
      ambiguous.push(LABEL.daily)
    } else if (dailyNow === before) {
      daily = daily.map(item => (item.day === day ? { ...item, focusMinutes: item.focusMinutes + minutes } : item))
      repaired.push(LABEL.daily)
    } else if (dailyNow >= before + minutes) {
      // 已经包含本轮（或多算了别人的轮次）：不下调、不重复加
    } else {
      // 介于两者之间（before < now < before+minutes）：被别人改过，判断不了
      ambiguous.push(LABEL.daily)
    }
  } else {
    ambiguous.push(LABEL.daily)
  }

  /* ② Task：有绑定且任务还在时才处理；任务被删 → 跳过（不重建）。 */
  if (result.taskId !== '') {
    const task = findTask(state.tasks, result.taskId)
    if (task !== undefined) {
      const focusedNow = Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25))
      const pomodorosNow = Math.max(0, Math.round(task.pomodoros ?? 0))
      const taskHasBaseline = baseline !== undefined && baseline.taskId === task.id && baseline.taskMinutes !== null
      if (taskHasBaseline) {
        const focusBefore = baseline.taskMinutes ?? 0
        const pomodoroBefore = baseline.taskPomodoros ?? 0
        const focusApplied = focusedNow >= focusBefore + minutes
        const pomodoroApplied = pomodorosNow >= pomodoroBefore + 1
        const focusMissing = !focusApplied && focusedNow === focusBefore
        const pomodoroMissing = !pomodoroApplied && pomodorosNow === pomodoroBefore
        if (!focusApplied && !focusMissing) ambiguous.push(`${LABEL.tasks}·专注`)
        if (!pomodoroApplied && !pomodoroMissing) ambiguous.push(`${LABEL.tasks}·番茄`)
        if (focusMissing || pomodoroMissing) {
          tasks = tasks.map(item =>
            item.id === task.id
              ? {
                  ...item,
                  ...(focusMissing ? { focusedMinutes: focusBefore + minutes } : {}),
                  ...(pomodoroMissing ? { pomodoros: pomodoroBefore + 1 } : {}),
                }
              : item,
          )
          if (focusMissing) repaired.push(`${LABEL.tasks}·专注`)
          if (pomodoroMissing) repaired.push(`${LABEL.tasks}·番茄`)
        }
      } else {
        ambiguous.push(LABEL.tasks)
      }
    }
  }

  /* ③ Timeline：按 refId 判断，天然幂等（重复就只留最早一条）。 */
  const count = timelineCountFor(state, result.roundId)
  if (count === 0) {
    const log = state.logs.find(item => item.id === result.roundId)
    timeline = [
      makeEvent(
        {
          type: 'focus.completed',
          title: `专注 ${minutes} 分钟（已补齐）`,
          refId: result.roundId,
          ...(log?.projectId === undefined ? {} : { projectId: log.projectId }),
        },
        result.endedAt,
      ),
      ...timeline,
    ]
    repaired.push(LABEL.timeline)
  } else if (count > 1) {
    // 数组是新→旧：保留最后一条（最早写入的那条），其余删掉
    let kept = false
    const reversed = [...timeline].reverse().filter(event => {
      if (event.type !== 'focus.completed' || event.refId !== result.roundId) return true
      if (kept) return false
      kept = true
      return true
    })
    timeline = reversed.reverse()
    repaired.push(`${LABEL.timeline}·去重`)
  }

  return { next: { logs: state.logs, tasks, daily, timeline }, repaired, ambiguous }
}

/**
 * 结算一轮专注：**一次事务写 4 个键**，然后逐个实体校验。
 *
 * 三条分支（顺序不能变）：
 *   1. 日志不存在 → 正常结算（算 → 写事务 → 校验）；
 *   2. 日志存在 → **先校验四实体**：都完整才算「已经记过」；
 *      有缺失 → 按基线修复；判断不了 → 保留 pending 并报告；
 *   3. 任何写入/校验失败 → `ok=false`，不返回 next，让上层保留 pendingResult。
 */
export function settleFocus(input: SettleFocusInput): SettleFocusOutcome {
  const { result, store } = input
  const fallback = input.fallback ?? EMPTY

  if (store === undefined) {
    const computed = finishFocus({
      logs: fallback.logs,
      daily: fallback.daily,
      timeline: fallback.timeline,
      tasks: fallback.tasks,
      result,
      ...(findTask(fallback.tasks, result.taskId) === undefined
        ? {}
        : { task: findTask(fallback.tasks, result.taskId) }),
      ...(input.projects === undefined ? {} : { projects: input.projects }),
      ...(input.activeProjectId === undefined ? {} : { activeProjectId: input.activeProjectId }),
    })
    if (computed.logs === undefined) {
      return {
        ok: false,
        duplicate: false,
        repaired: false,
        restored: true,
        written: 0,
        message: '这一轮没有可写入的记录（时长不足 1 分钟或缺少幂等键）',
      }
    }
    const next: SettlementState = {
      logs: computed.logs,
      tasks: computed.tasks ?? fallback.tasks,
      daily: computed.daily ?? fallback.daily,
      timeline: computed.timeline ?? fallback.timeline,
    }
    const baseline = snapshotBaseline(fallback, result)
    return {
      ok: true,
      duplicate: false,
      repaired: false,
      restored: true,
      written: 0,
      message: '仅计算，未落盘（当前环境没有存储）',
      baseline,
      next,
    }
  }

  const fresh = readSettlementState(store, fallback)
  const baseline = input.baseline ?? snapshotBaseline(fresh, result)

  /* ── 分支 2：日志已存在 → 校验 + 修复，绝不直接当成功 ─────────────────── */
  if (fresh.logs.some(log => log.id === result.roundId)) {
    const check = verifySettlement(fresh, result, input.baseline)
    if (check.ok) {
      return {
        ok: true,
        duplicate: true,
        repaired: false,
        restored: true,
        written: 0,
        message: '这一轮已经完整记过了，同一次专注不会重复累计',
        baseline,
        next: fresh,
      }
    }

    /**
     * 修复只能用**持久化的**基线（`input.baseline`）。
     * 绝不能拿「刚刚读到的当前状态」当基线 —— 那已经是失败之后的值，
     * 用它判断「Daily 是否算过」永远得出「算过」，等于放弃修复还假装成功。
     */
    const plan = planRepair(fresh, result, input.baseline)
    if (plan.repaired.length === 0) {
      return {
        ok: false,
        duplicate: true,
        repaired: false,
        failedEntities: check.failed,
        ambiguousEntities: plan.ambiguous,
        restored: true,
        written: 0,
        message:
          plan.ambiguous.length > 0
            ? `这一轮的记录只写了一部分（缺 ${check.failed.join('、')}），但无法确定它们是否已经累计过，已保留待保存状态：${plan.ambiguous.join('、')}。请先导出备份再重试。`
            : `这一轮的记录不完整（缺 ${check.failed.join('、')}），且没有可用于修复的基线，已保留待保存状态`,
        baseline,
      }
    }

    const tx = writeTx(store, plan.next)
    if (!tx.ok) {
      return {
        ok: false,
        duplicate: true,
        repaired: false,
        ...(tx.failedKey === undefined ? {} : { failedKey: tx.failedKey }),
        failedEntities: check.failed,
        restored: tx.restored,
        written: tx.written,
        message: tx.restored
          ? `补齐失败（${labelOfKey(tx.failedKey)}），这一轮仍未保存，已回滚；可以再次重试`
          : `补齐失败且回滚未完成（${labelOfKey(tx.failedKey)}），数据可能不一致：请先导出备份再重试`,
        baseline,
      }
    }

    const after = readSettlementState(store)
    const recheck = verifySettlement(after, result, input.baseline)
    if (!recheck.ok) {
      return {
        ok: false,
        duplicate: true,
        repaired: plan.repaired.length > 0,
        failedEntities: recheck.failed,
        ...(plan.ambiguous.length === 0 ? {} : { ambiguousEntities: plan.ambiguous }),
        restored: true,
        written: tx.written,
        message:
          plan.ambiguous.length > 0
            ? `这一轮的记录只写了一部分（仍缺 ${recheck.failed.join('、')}）；其中 ${plan.ambiguous.join('、')} 无法确定是否已经累计过，已保留待保存状态，请先导出备份再重试`
            : `补齐后校验仍未通过（${recheck.failed.join('、')}），已保留待保存状态`,
        baseline,
      }
    }

    return {
      ok: true,
      duplicate: true,
      repaired: true,
      restored: true,
      written: tx.written,
      message: `这一轮之前只写了一部分，已补齐：${plan.repaired.join('、')}`,
      baseline,
      next: after,
    }
  }

  /* ── 分支 1：正常首次结算 ─────────────────────────────────────────────── */
  const task = findTask(fresh.tasks, result.taskId)
  const computed = finishFocus({
    logs: fresh.logs,
    daily: fresh.daily,
    timeline: fresh.timeline,
    tasks: fresh.tasks,
    result,
    ...(task === undefined ? {} : { task }),
    ...(input.projects === undefined ? {} : { projects: input.projects }),
    ...(input.activeProjectId === undefined ? {} : { activeProjectId: input.activeProjectId }),
  })
  if (computed.logs === undefined) {
    return {
      ok: false,
      duplicate: false,
      repaired: false,
      restored: true,
      written: 0,
      message: '这一轮没有可写入的记录（时长不足 1 分钟或缺少幂等键）',
      baseline,
    }
  }

  const next: SettlementState = {
    logs: computed.logs,
    tasks: computed.tasks ?? fresh.tasks,
    daily: computed.daily ?? fresh.daily,
    timeline: computed.timeline ?? fresh.timeline,
  }

  const tx = writeTx(store, next)
  if (!tx.ok) {
    const rollbackFailed = !tx.restored
    return {
      ok: false,
      duplicate: false,
      repaired: false,
      ...(tx.failedKey === undefined ? {} : { failedKey: tx.failedKey }),
      restored: tx.restored,
      written: tx.written,
      message: rollbackFailed
        ? `写入失败（${labelOfKey(tx.failedKey)}）且回滚未完成，数据可能只写了一半；已保留待保存状态，重试会自动补齐。建议先导出备份。`
        : `写入失败（${labelOfKey(tx.failedKey)}），这一轮没有保存，已回滚到写入前；可以点「重试写入」`,
      baseline,
    }
  }

  /* ── 写后校验：四个实体逐个检查，不再只看日志 ─────────────────────────── */
  const after = readSettlementState(store)
  const verify = verifySettlement(after, result, baseline)
  if (!verify.ok) {
    return {
      ok: false,
      duplicate: false,
      repaired: false,
      failedEntities: verify.failed,
      restored: true,
      written: tx.written,
      message: `写入后校验未通过（${verify.failed.join('、')}），这一轮不算保存成功；记录已保留待重试`,
      baseline,
    }
  }

  return {
    ok: true,
    duplicate: false,
    repaired: false,
    restored: true,
    written: tx.written,
    message: '已记录本轮专注',
    baseline,
    next: after,
  }
}

interface TxOutcome {
  ok: boolean
  failedKey?: string
  restored: boolean
  written: number
}

/** 四个键的事务写入（集中一处，失败时的回滚由 lib/tx 负责）。 */
function writeTx(store: RawStore, next: SettlementState): TxOutcome {
  const result = writeTransaction(store, [
    { key: STORAGE_KEYS.logs, value: next.logs },
    { key: STORAGE_KEYS.tasks, value: next.tasks },
    { key: STORAGE_KEYS.daily, value: next.daily },
    { key: STORAGE_KEYS.timeline, value: next.timeline },
  ])
  return result.ok
    ? { ok: true, restored: true, written: result.written }
    : {
        ok: false,
        ...(result.failedKey === undefined ? {} : { failedKey: result.failedKey }),
        restored: result.restored,
        written: result.written,
      }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 重复结算的检测与修复（多标签页竞争后的收敛，Phase 5.5.1）
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DuplicateRound {
  roundId: string
  count: number
  minutes: number
}

/** 找出被写入多次的 roundId（同一个 id 出现多次 = 同一轮被结算了多次）。 */
export function detectDuplicateRounds(logs: SessionLog[]): DuplicateRound[] {
  const seen = new Map<string, { count: number; minutes: number }>()
  for (const log of logs) {
    if (log.kind !== 'focus') continue
    const entry = seen.get(log.id) ?? { count: 0, minutes: Math.max(0, Math.round(log.minutes ?? 0)) }
    entry.count += 1
    seen.set(log.id, entry)
  }
  return [...seen.entries()]
    .filter(([, entry]) => entry.count > 1)
    .map(([roundId, entry]) => ({ roundId, count: entry.count, minutes: entry.minutes }))
}

export interface RepairResult extends SettlementState {
  removedLogs: number
  rolledBackMinutes: number
  removedEvents: number
  changed: boolean
}

/**
 * 按 roundId 修复重复结算。
 *
 * 为什么这不是「猜测」：同一个 roundId 出现两次，只可能是同一轮被应用了两次；
 * 每次应用都恰好做了「日志 +1、daily +minutes、task +minutes/+1、事件 +1」，
 * 所以把多出来的那一份按同一口径扣回是确定性的。
 */
export function repairDuplicateSettlements(input: SettlementState): RepairResult {
  const duplicates = detectDuplicateRounds(input.logs)
  if (duplicates.length === 0) {
    return { ...input, removedLogs: 0, rolledBackMinutes: 0, removedEvents: 0, changed: false }
  }

  const extraById = new Map<string, number>()
  for (const item of duplicates) extraById.set(item.roundId, item.count - 1)

  const kept = new Set<string>()
  const logs: SessionLog[] = []
  const removed: SessionLog[] = []
  for (const log of input.logs) {
    const remaining = extraById.get(log.id) ?? 0
    if (log.kind === 'focus' && remaining > 0 && kept.has(log.id)) {
      extraById.set(log.id, remaining - 1)
      removed.push(log)
      continue
    }
    if (log.kind === 'focus') kept.add(log.id)
    logs.push(log)
  }

  let daily = input.daily
  let rolledBackMinutes = 0
  for (const log of removed) {
    const minutes = Math.max(0, Math.round(log.minutes ?? 0))
    rolledBackMinutes += minutes
    daily = daily.map(item =>
      item.day === dayKey(log.at) ? { ...item, focusMinutes: Math.max(0, item.focusMinutes - minutes) } : item,
    )
  }

  let tasks = input.tasks
  for (const log of removed) {
    if (log.taskId === undefined) continue
    const minutes = Math.max(0, Math.round(log.minutes ?? 0))
    tasks = tasks.map(task =>
      task.id === log.taskId
        ? {
            ...task,
            focusedMinutes: Math.max(0, (task.focusedMinutes ?? (task.pomodoros ?? 0) * 25) - minutes),
            pomodoros: Math.max(0, (task.pomodoros ?? 0) - 1),
          }
        : task,
    )
  }

  const duplicatedIds = new Set(duplicates.map(item => item.roundId))
  const seenEvents = new Set<string>()
  const timeline: TimelineEvent[] = []
  let removedEvents = 0
  for (const event of input.timeline) {
    const refId = event.refId
    if (event.type === 'focus.completed' && refId !== undefined && duplicatedIds.has(refId)) {
      if (seenEvents.has(refId)) {
        removedEvents += 1
        continue
      }
      seenEvents.add(refId)
    }
    timeline.push(event)
  }

  return {
    logs,
    tasks,
    daily,
    timeline,
    removedLogs: removed.length,
    rolledBackMinutes,
    removedEvents,
    changed: removed.length > 0 || removedEvents > 0,
  }
}

/** 对存储跑一次修复；有变化就写回（同样走事务）。 */
export function repairSettlementStore(store: RawStore): {
  changed: boolean
  removedLogs: number
  rolledBackMinutes: number
  removedEvents: number
  ok: boolean
} {
  const repaired = repairDuplicateSettlements(readSettlementState(store))
  if (!repaired.changed) {
    return { changed: false, removedLogs: 0, rolledBackMinutes: 0, removedEvents: 0, ok: true }
  }
  const tx = writeTx(store, repaired)
  return {
    changed: true,
    removedLogs: repaired.removedLogs,
    rolledBackMinutes: repaired.rolledBackMinutes,
    removedEvents: repaired.removedEvents,
    ok: tx.ok,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 「放弃这一笔」：安全的清理计划与执行（Phase 6.1）
 *
 * 背景：5.5.2 的 `discardPending` 只清标记、不碰数据。当结算停在中途
 * （日志写了、日聚合/任务没写）时，用户点「放弃」会留下「日志在、日聚合不在」，
 * 而界面回到「已记入」—— 陈述与数据不一致。
 *
 * 现在「放弃」必须先**证明**这一轮除了我们自己写的那条日志与那条事件之外，
 * 没有别的实体被本轮改过；证明得了才删，证明不了就不动。
 *
 * 判据（缺一不可，全部满足才算安全）：
 *   • 本轮日志：最多 1 条（多条说明同一 roundId 被写了多次，交给重复收敛处理）；
 *     必须是 focus 记录、分钟与本轮一致、任务绑定与本轮一致、日期与本轮一致；
 *   • 日聚合：有同一天的基线，且**当前值仍等于基线**（说明本轮没加过）；
 *   • 任务副本：任务仍在时，有该任务的基线，且 focusedMinutes / pomodoros 都仍等于基线；
 *   • 时间轴：按 `refId === roundId` 定位，天然只属于本轮，不需要额外证据。
 *
 * 两个容易踩空的地方（Phase 6.1 专门补的）：
 *   • **「日志没了」不等于「可以放行」**：事务顺序是 logs → tasks → daily → timeline，
 *     回滚失败的组合会留下「日志已回滚、Daily 却加上了」。这时因为「没东西可删」而
 *     直接清标记，那 18 分钟就永久留在日聚合里、没有任何日志支撑。所以即使日志与
 *     事件都不在，日聚合/任务两条证据校验照常执行。
 *   • **写后不假设成功**：删除与「清标记」在同一事务里，事务成功还要回读校验；
 *     校验不过就把标记写回去，绝不留下「标记没了、数据还在」的死角。
 *
 * 注意：这里**不做任何回退计算**。Daily / Task 一个字节都不写 —— 只有在证明它们
 * 从未被本轮改过之后，才允许删除日志与事件。任何「已累计」或「判断不了」都拒绝执行。
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DiscardPlan {
  /** 是否可以安全清理。 */
  safe: boolean
  /** 不能清理的原因（中文，直接给用户看）。 */
  blockers: string[]
  /** 计划删除的本轮日志条数（0 / 1）。 */
  removedLogs: number
  /** 计划删除的本轮 focus.completed 事件条数。 */
  removedEvents: number
  next: SettlementState
}

/** 只做判断，不写任何东西（可单独测试）。 */
export function planDiscard(
  state: SettlementState,
  result: FocusResult,
  baseline: SettlementBaseline | undefined,
): DiscardPlan {
  const blockers: string[] = []
  const roundId = result.roundId
  const minutes = Math.max(0, Math.round(result.minutes))
  const day = dayKey(result.endedAt)

  const own = state.logs.filter(log => log.id === roundId)
  const ownEvents = state.timeline.filter(event => event.type === 'focus.completed' && event.refId === roundId)

  /* ① 本轮日志：id 是唯一线索，但还要确认它确实是这一轮写的那条。 */
  if (own.length > 1) {
    blockers.push(`${LABEL.logs}·同一轮有多条`)
  } else if (own.length === 1) {
    const log = own[0]!
    if (log.kind !== 'focus') blockers.push(`${LABEL.logs}·不是专注记录`)
    if (Math.max(0, Math.round(log.minutes ?? 0)) !== minutes) blockers.push(`${LABEL.logs}·分钟与本轮不符`)
    if ((log.taskId ?? '') !== result.taskId) blockers.push(`${LABEL.logs}·任务绑定与本轮不符`)
    // 同 id 却落在别的日子：只可能是被手改过的脏数据，不删。
    if (dayKey(log.at) !== day) blockers.push(`${LABEL.logs}·日期与本轮不符`)
  }

  /* ② 日聚合：必须「有基线 + 当前值仍等于基线」才能证明没加过。 */
  const dailyNow = dailyMinutesOf(state, day)
  if (baseline === undefined || baseline.day !== day) {
    blockers.push(`${LABEL.daily}·缺少基线`)
  } else {
    const before = baseline.dailyMinutes
    const untouched = before === null ? dailyNow === null : dailyNow === before
    if (!untouched) blockers.push(`${LABEL.daily}·已累计或无法确定`)
  }

  /* ③ 任务副本：任务还在时才需要证明；任务已被删就没有可回退的副本。 */
  if (result.taskId !== '') {
    const task = findTask(state.tasks, result.taskId)
    if (task !== undefined) {
      const usable = baseline !== undefined && baseline.taskId === task.id && baseline.taskMinutes !== null && baseline.taskPomodoros !== null
      if (!usable) {
        blockers.push(`${LABEL.tasks}·缺少基线`)
      } else {
        const focused = Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25))
        const pomodoros = Math.max(0, Math.round(task.pomodoros ?? 0))
        if (focused !== baseline.taskMinutes) blockers.push(`${LABEL.tasks}·专注已累计或无法确定`)
        if (pomodoros !== baseline.taskPomodoros) blockers.push(`${LABEL.tasks}·番茄已累计或无法确定`)
      }
    }
  }

  /* ④ 时间轴：refId 唯一指向本轮，删除不需要额外证据。 */
  const removableLogs = own.length === 1 && own[0]!.kind === 'focus' ? 1 : 0

  return {
    safe: blockers.length === 0,
    blockers,
    removedLogs: removableLogs,
    removedEvents: ownEvents.length,
    next: {
      logs: removableLogs === 1 ? state.logs.filter(log => log.id !== roundId) : state.logs,
      tasks: state.tasks,
      daily: state.daily,
      timeline: state.timeline.filter(event => !(event.type === 'focus.completed' && event.refId === roundId)),
    },
  }
}

export interface DiscardSettlementInput {
  result: FocusResult
  /** 存储端口；缺省表示纯逻辑（只规划、不落盘）。 */
  store?: RawStore
  /** 上一次失败时持久化下来的基线 —— 没有它就不允许删除任何东西。 */
  baseline?: SettlementBaseline
  fallback?: SettlementState
  /**
   * 「待保存标记」随清理一起写。
   *
   * 为什么要放进同一个事务：如果先删数据、再清标记，而清标记失败，下次挂载会
   * 重新补写这一轮（把用户刚放弃的那笔又记回来）。放进同一个事务就只有两种结果 ——
   * 都成功，或都不发生。
   */
  timer?: { key: string; value: unknown }
}

export interface DiscardSettlementOutcome {
  /** 清理是否完成（true 才允许清除待保存标记并显示「已放弃」）。 */
  ok: boolean
  removedLogs: number
  removedEvents: number
  /** 拒绝清理的原因。 */
  blockers: string[]
  failedKey?: string
  restored: boolean
  written: number
  message: string
  next?: SettlementState
}

/** 执行「放弃这一笔」：先规划，证明安全才在一个事务里删除 + 清标记。 */
export function discardSettlement(input: DiscardSettlementInput): DiscardSettlementOutcome {
  const { result, store } = input
  const fallback = input.fallback ?? EMPTY

  if (store === undefined) {
    const plan = planDiscard(fallback, result, input.baseline)
    return {
      ok: plan.safe,
      removedLogs: plan.safe ? plan.removedLogs : 0,
      removedEvents: plan.safe ? plan.removedEvents : 0,
      blockers: plan.blockers,
      restored: true,
      written: 0,
      message: plan.safe ? discardMessage(plan) : discardBlockedMessage(plan.blockers),
      next: plan.next,
    }
  }

  const fresh = readSettlementState(store, fallback)
  const plan = planDiscard(fresh, result, input.baseline)

  /* ── 情况 B：证明不了 → 不动数据、不清标记 ─────────────────────────────── */
  if (!plan.safe) {
    return {
      ok: false,
      removedLogs: 0,
      removedEvents: 0,
      blockers: plan.blockers,
      restored: true,
      written: 0,
      message: discardBlockedMessage(plan.blockers),
      next: fresh,
    }
  }

  /* ── 情况 A：能证明 ─────────────────────────────────────────────────────── */
  /** 待保存标记的原值：写后校验失败时要把它写回去，恢复入口不能丢。 */
  const timerBefore = input.timer === undefined ? null : store.readRaw(input.timer.key)
  /**
   * 只写**真的变了的键**：没删日志就不碰 logs、没删事件就不碰 timeline。
   * 少写一个键就少一次覆盖别人的机会（localStorage 整份数组写，写多一次就是多一次竞争）。
   */
  const entries: Array<{ key: string; value: unknown }> = []
  if (plan.removedLogs > 0) entries.push({ key: STORAGE_KEYS.logs, value: plan.next.logs })
  if (plan.removedEvents > 0) entries.push({ key: STORAGE_KEYS.timeline, value: plan.next.timeline })
  if (input.timer !== undefined) entries.push({ key: input.timer.key, value: input.timer.value })

  if (entries.length === 0) {
    // 没有存储端口也没有要写的东西：纯逻辑路径，直接给结论。
    return {
      ok: true,
      removedLogs: 0,
      removedEvents: 0,
      blockers: [],
      restored: true,
      written: 0,
      message: discardMessage(plan),
      next: plan.next,
    }
  }

  const tx = writeTransaction(store, entries)
  /* ── 情况 C：写入失败（含回滚失败）→ 保留可恢复状态，如实报告 ─────────── */
  if (!tx.ok) {
    return {
      ok: false,
      removedLogs: 0,
      removedEvents: 0,
      blockers: [],
      ...(tx.failedKey === undefined ? {} : { failedKey: tx.failedKey }),
      restored: tx.restored,
      written: tx.written,
      message: tx.restored
        ? `放弃失败（${labelOfKey(tx.failedKey)}写入被拒绝），这一轮的数据一个字节都没有改动，待保存状态仍在，可以再试一次`
        : `放弃失败且回滚未完成（${labelOfKey(tx.failedKey)}），数据可能处于中间状态：请先导出备份，再重试写入`,
      next: fresh,
    }
  }

  /* 写后校验：只确认「本轮痕迹已清掉」，不假设成功。 */
  const after = readSettlementState(store)
  const logGone = !after.logs.some(log => log.id === result.roundId)
  const eventsGone = timelineCountFor(after, result.roundId) === 0
  if (!logGone || !eventsGone) {
    /**
     * 数据没清干净，但「待保存标记」已经随同一个事务写掉了。
     * 如果就这样返回失败，存储里会出现「标记已清、数据还在」—— 刷新后既不提示
     * 恢复，也无法再放弃一次，正好是最糟的中间态。所以这里**把标记写回**，
     * 让恢复入口继续存在；写回失败则如实报告。
     */
    const restored = input.timer === undefined
      ? true
      : timerBefore === null
        ? store.removeRaw(input.timer.key)
        : store.writeRaw(input.timer.key, timerBefore)
    return {
      ok: false,
      removedLogs: 0,
      removedEvents: 0,
      blockers: [],
      restored,
      written: tx.written,
      message: restored
        ? '放弃后的校验没有通过（本轮记录仍然存在），待保存状态已保留，可以再试一次或先导出备份'
        : '放弃后的校验没有通过，且恢复标记写回失败：数据可能部分写入，请立即导出备份',
      next: after,
    }
  }

  return {
    ok: true,
    removedLogs: plan.removedLogs,
    removedEvents: plan.removedEvents,
    blockers: [],
    restored: true,
    written: tx.written,
    message: discardMessage(plan),
    next: after,
  }
}

function discardMessage(plan: DiscardPlan): string {
  if (plan.removedLogs === 0 && plan.removedEvents === 0) {
    return '本轮没有写入任何记录，已取消待保存状态（没有删除任何数据）'
  }
  const parts: string[] = []
  if (plan.removedLogs > 0) parts.push(`${plan.removedLogs} 条日志`)
  if (plan.removedEvents > 0) parts.push(`${plan.removedEvents} 条时间轴事件`)
  return `本轮未完整保存，已清理能够确认属于本轮的部分记录（${parts.join('、')}）；日聚合与任务从未计入，未改动，其他记录不受影响`
}

function discardBlockedMessage(blockers: string[]): string {
  return `无法安全放弃：${blockers.join('、')}。这一笔的数据可能已经部分写入，待保存状态（可恢复标记）已保留、没有删除任何记录；请先导出备份，再点「重试写入」补齐`
}

