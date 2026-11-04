/**
 * useBoardActions — 把 `lib/actions.ts` 的纯动作接到存储上（B3.5）。
 *
 * 组件只调用这里的语义方法；Daily / timeline / snapshot 的写入全部在这一层发生，
 * 组件不再自己拼 `setTasks + setLogs + ...`。
 */
import { useCallback } from 'react'
import type { DailyAggregate, FrictionRecord, HistorySnapshot, KnowledgeGraph, ReviewRecord, SessionLog, Task, TimelineEvent } from '../types'
import { STORAGE_KEYS } from '../types'
import {
  completeTask as completeTaskAction,
  reopenTask as reopenTaskAction,
  deleteTask as deleteTaskAction,
  createTask as createTaskAction,
  updateTask as updateTaskAction,
  addFocusLog as addFocusLogAction,
  addSessionLog as addSessionLogAction,
  addFriction as addFrictionAction,
  resolveFriction as resolveFrictionAction,
  deleteKnowledgeNode as deleteKnowledgeNodeAction,
  deleteLog as deleteLogAction,
  deleteLogs as deleteLogsAction,
  addFrictionMerged as addFrictionMergedAction,
} from '../lib/actions'
import type { FocusResult } from '../lib/focus'
import { discardSettlement, settleFocus, type SettlementBaseline } from '../lib/settlement'
import { createBrowserStore } from '../lib/tx'
import { pushNotice } from '../lib/bus'
import { pruneSnapshots } from '../lib/history'
import { useBoardData } from './useBoardData'
import { createId, useLocalStore } from './useLocalStore'

export interface FocusSettleReport {
  ok: boolean
  /** 失败时带回的基线快照（供计时器存进 pendingResult）。 */
  baseline?: SettlementBaseline
  message: string
}

/** 「放弃这一笔」的结果（Phase 6.1）。 */
export interface FocusDiscardReport {
  ok: boolean
  message: string
  /** 实际清理掉的本轮日志条数。 */
  removedLogs: number
  /** 实际清理掉的本轮时间轴事件条数。 */
  removedEvents: number
  /**
   * 待保存标记是否**已经在同一个事务里**写掉。
   * `false` 表示调用方必须自己再写一次（例如没有存储端口时）。
   */
  persisted: boolean
}

export interface BoardActions {
  completeTask: (taskId: string) => void
  reopenTask: (taskId: string) => void
  removeTask: (taskId: string) => void
  createTask: (draft: { title: string; note?: string; priority?: Task['priority']; dueAt?: number; projectId?: string }) => void
  updateTask: (taskId: string, patch: { title?: string; note?: string; priority?: Task['priority']; dueAt?: number | null; projectId?: string }) => void
  addFocus: (log: SessionLog) => void
  /**
   * 专注结束记账：日志 + Daily + 任务副本 + 时间轴，一次事务写完并逐实体校验。
   *
   * @param baseline - 上次失败时记下的基线快照，用于判断各实体是否已经应用过
   * @returns `ok=false` 表示四份数据没有全部就位（界面必须显示「未保存」）
   */
  finishFocus: (result: FocusResult, baseline?: SettlementBaseline) => FocusSettleReport
  /**
   * 放弃一笔没落盘的专注：只清理**能证明属于本轮**的日志与时间轴事件（Phase 6.1）。
   * 证明不了就拒绝清理并保留待保存状态。
   */
  discardFocus: (
    result: FocusResult,
    baseline?: SettlementBaseline,
    timer?: { key: string; value: unknown },
  ) => FocusDiscardReport
  /** 写入一条非专注的会话日志（自动采集 / 手动补记）。 */
  addSessionLog: (log: SessionLog) => void
  addFriction: (record: FrictionRecord) => void
  resolveFriction: (frictionId: string, solution: string) => void
  removeKnowledgeNode: (nodeId: string) => void
  deleteLog: (logId: string) => void
  deleteLogs: (logIds: string[]) => void
  addFrictionMerged: (draft: Omit<FrictionRecord, 'id'>) => boolean
}

export function useBoardActions(): BoardActions {
  const board = useBoardData()
  const [daily, setDaily] = useLocalStore<DailyAggregate[]>(STORAGE_KEYS.daily, [])
  const [timeline, setTimeline] = useLocalStore<TimelineEvent[]>(STORAGE_KEYS.timeline, [])
  const [graph, setGraph] = useLocalStore<KnowledgeGraph>(STORAGE_KEYS.knowledge, { nodes: [], edges: [] })
  const [reviews, setReviews] = useLocalStore<ReviewRecord[]>(STORAGE_KEYS.reviews, [])
  const [history, setHistory] = useLocalStore<HistorySnapshot[]>(STORAGE_KEYS.history, [])

  const pushSnapshot = useCallback(
    (snapshot: HistorySnapshot | undefined) => {
      if (snapshot === undefined) return
      setHistory(previous => pruneSnapshots([...previous, snapshot]))
    },
    [setHistory],
  )

  const completeTask = useCallback(
    (taskId: string) => {
      const result = completeTaskAction({
        tasks: board.allTasks,
        daily,
        timeline,
        taskId,
        project: board.activeProject,
        friction: board.allFriction,
        history,
      })
      if (result.tasks !== undefined) board.setTasks(result.tasks)
      if (result.daily !== undefined) setDaily(result.daily)
      if (result.timeline !== undefined) setTimeline(result.timeline)
      pushSnapshot(result.snapshot)
    },
    [board, daily, timeline, history, setDaily, setTimeline, pushSnapshot],
  )

  const reopenTask = useCallback(
    (taskId: string) => {
      const result = reopenTaskAction({ tasks: board.allTasks, daily, timeline, taskId })
      if (result.tasks !== undefined) board.setTasks(result.tasks)
      if (result.daily !== undefined) setDaily(result.daily)
      if (result.timeline !== undefined) setTimeline(result.timeline)
    },
    [board.allTasks, board.setTasks, daily, timeline, setDaily, setTimeline],
  )

  const createTask = useCallback(
    (draft: { title: string; note?: string; priority?: Task['priority']; dueAt?: number; projectId?: string }) => {
      const result = createTaskAction({
        tasks: board.allTasks,
        timeline,
        id: createId('task'),
        projects: board.projects,
        ...draft,
      })
      if (result.tasks !== undefined) board.setTasks(result.tasks)
      if (result.timeline !== undefined) setTimeline(result.timeline)
    },
    [board.allTasks, board.setTasks, board.projects, timeline, setTimeline],
  )

  const updateTask = useCallback(
    (taskId: string, patch: { title?: string; note?: string; priority?: Task['priority']; dueAt?: number | null; projectId?: string }) => {
      const result = updateTaskAction({
        tasks: board.allTasks,
        taskId,
        patch,
        projects: board.projects,
      })
      if (result.tasks !== undefined) board.setTasks(result.tasks)
    },
    [board.allTasks, board.setTasks, board.projects],
  )

  const removeTask = useCallback(
    (taskId: string) => {
      const result = deleteTaskAction({
        tasks: board.allTasks,
        logs: board.allLogs,
        graph,
        meta: board.meta,
        daily,
        timeline,
        taskId,
      })
      if (result.tasks !== undefined) board.setTasks(result.tasks)
      if (result.logs !== undefined) board.setLogs(result.logs)
      if (result.graph !== undefined) setGraph(result.graph)
      if (result.meta !== undefined) board.setMeta(result.meta)
      if (result.daily !== undefined) setDaily(result.daily)
      if (result.timeline !== undefined) setTimeline(result.timeline)
    },
    [board, graph, daily, timeline, setDaily, setTimeline, setGraph],
  )

  const addFocus = useCallback(
    (log: SessionLog) => {
      const result = addFocusLogAction({ logs: board.allLogs, daily, timeline, log })
      if (result.logs !== undefined) board.setLogs(result.logs)
      if (result.daily !== undefined) setDaily(result.daily)
      if (result.timeline !== undefined) setTimeline(result.timeline)
    },
    [board.allLogs, board.setLogs, daily, timeline, setDaily, setTimeline],
  )

  /**
   * 专注结束的唯一写入路径（Phase 5.5.1 起改为**一次事务写 4 个键**）。
   *
   * 为什么不再用四个 setter：`useLocalStore.update` 是「动作发生即写盘」，四次调用
   * 就是四次独立写盘 —— 任何一个失败都会留下部分写入（实测 daily 失败时日志与任务
   * 已经加上了）。现在交给 `settleFocus`：先读最新存储、判幂等、再一次事务写入，
   * 失败逆序回滚，成功后靠 `STORE_EVENT` 广播让四个 hook 自然同步。
   *
   * 返回值给计时器用：`false` 表示没落盘，界面据此显示「未保存 · 重试」。
   */
  const finishFocus = useCallback(
    (result: FocusResult, baseline?: SettlementBaseline): FocusSettleReport => {
      const store = createBrowserStore()
      const outcome = settleFocus({
        result,
        ...(store === undefined ? {} : { store }),
        ...(baseline === undefined ? {} : { baseline }),
        projects: board.projects,
        activeProjectId: board.activeProjectId,
        fallback: { logs: board.allLogs, tasks: board.allTasks, daily, timeline },
      })

      if (!outcome.ok) {
        // 真实失败：明确告知「没保存 / 没补全」，不显示成功。pendingResult 会留在计时状态里。
        pushNotice(outcome.message, 'error')
        return {
          ok: false,
          message: outcome.message,
          ...(outcome.baseline === undefined ? {} : { baseline: outcome.baseline }),
        }
      }
      if (outcome.duplicate) {
        pushNotice(outcome.message, outcome.repaired ? 'warn' : 'info')
        // 修复成功后界面要立刻反映补上的数据（事务广播通常会同步，这里兜一层）
        if (outcome.next !== undefined && outcome.repaired) {
          board.setLogs(outcome.next.logs)
          board.setTasks(outcome.next.tasks)
          setDaily(outcome.next.daily)
          setTimeline(outcome.next.timeline)
        }
        return { ok: true, message: outcome.message }
      }
      /**
       * 没有存储端口（Node / SSR）：事务没写盘，直接把算好的结果灌进内存态，
       * 保证界面与测试仍能看到一致的四个实体。
       */
      if (store === undefined && outcome.next !== undefined) {
        board.setLogs(outcome.next.logs)
        board.setTasks(outcome.next.tasks)
        setDaily(outcome.next.daily)
        setTimeline(outcome.next.timeline)
      }
      return { ok: true, message: outcome.message }
    },
    [board, daily, timeline, setDaily, setTimeline],
  )

  /**
   * 放弃一笔没落盘的专注（Phase 6.1）。
   *
   * **只在能证明「本轮除了日志与时间轴之外没改过别的实体」时才删**：
   * 日聚合与任务必须仍等于持久化基线；证明不了就一个字节都不动，把原因交回调用方。
   * 删除与「清掉待保存标记」写在同一个事务里（`timer` 入参），避免「数据删了、标记还在
   * → 下次挂载又补写回来」。
   */
  const discardFocus = useCallback(
    (
      result: FocusResult,
      baseline?: SettlementBaseline,
      timer?: { key: string; value: unknown },
    ): FocusDiscardReport => {
      const store = createBrowserStore()
      const outcome = discardSettlement({
        result,
        ...(store === undefined ? {} : { store }),
        ...(baseline === undefined ? {} : { baseline }),
        ...(timer === undefined ? {} : { timer }),
        fallback: { logs: board.allLogs, tasks: board.allTasks, daily, timeline },
      })

      if (!outcome.ok) {
        // 真实失败：不清理、不清标记，把原因原样交给用户。
        pushNotice(outcome.message, 'error')
        return {
          ok: false,
          message: outcome.message,
          removedLogs: 0,
          removedEvents: 0,
          persisted: false,
        }
      }

      if (outcome.removedLogs > 0 || outcome.removedEvents > 0) {
        pushNotice(outcome.message, 'info')
      }
      /**
       * 没有存储端口时事务没写盘：把删好的结果灌回内存态。
       * 有存储端口时靠 `STORE_EVENT` 广播，四个 hook 会自己同步，绝不重复写盘。
       */
      if (store === undefined && outcome.next !== undefined) {
        board.setLogs(outcome.next.logs)
        setTimeline(outcome.next.timeline)
      }
      return {
        ok: true,
        message: outcome.message,
        removedLogs: outcome.removedLogs,
        removedEvents: outcome.removedEvents,
        persisted: store !== undefined && timer !== undefined && outcome.written > 0,
      }
    },
    [board, daily, timeline, setTimeline],
  )

  const addSessionLog = useCallback(
    (log: SessionLog) => {
      const outcome = addSessionLogAction({ logs: board.allLogs, daily, timeline, log })
      if (outcome.logs !== undefined) board.setLogs(outcome.logs)
      if (outcome.daily !== undefined) setDaily(outcome.daily)
      if (outcome.timeline !== undefined) setTimeline(outcome.timeline)
    },
    [board.allLogs, board.setLogs, daily, timeline, setDaily, setTimeline],
  )

  const addFriction = useCallback(    (record: FrictionRecord) => {
      const result = addFrictionAction({ friction: board.allFriction, daily, timeline, record })
      if (result.friction !== undefined) board.setFriction(result.friction)
      if (result.daily !== undefined) setDaily(result.daily)
      if (result.timeline !== undefined) setTimeline(result.timeline)
    },
    [board.allFriction, board.setFriction, daily, timeline, setDaily, setTimeline],
  )

  const resolveFriction = useCallback(
    (frictionId: string, solution: string) => {
      const result = resolveFrictionAction({ friction: board.allFriction, timeline, frictionId, solution })
      if (result.friction !== undefined) board.setFriction(result.friction)
      if (result.timeline !== undefined) setTimeline(result.timeline)
    },
    [board.allFriction, board.setFriction, timeline, setTimeline],
  )

  const removeKnowledgeNode = useCallback(
    (nodeId: string) => {
      const result = deleteKnowledgeNodeAction({ graph, reviews, nodeId })
      if (result.graph !== undefined) setGraph(result.graph)
      if (result.reviews !== undefined) setReviews(result.reviews)
    },
    [graph, reviews, setGraph, setReviews],
  )

  const deleteLog = useCallback((logId: string) => {
    const result = deleteLogAction({ logs: board.allLogs, daily, logId })
    if (result.logs !== undefined) board.setLogs(result.logs)
    if (result.daily !== undefined) setDaily(result.daily)
  }, [board.allLogs, board.setLogs, daily, setDaily])

  const deleteLogs = useCallback((logIds: string[]) => {
    const result = deleteLogsAction({ logs: board.allLogs, daily, logIds })
    if (result.logs !== undefined) board.setLogs(result.logs)
    if (result.daily !== undefined) setDaily(result.daily)
  }, [board.allLogs, board.setLogs, daily, setDaily])

  const addFrictionMerged = useCallback((draft: Omit<FrictionRecord, 'id'>): boolean => {
    const result = addFrictionMergedAction({ friction: board.allFriction, daily, timeline, draft })
    if (result.friction !== undefined) board.setFriction(result.friction)
    if (result.daily !== undefined) setDaily(result.daily)
    if (result.timeline !== undefined) setTimeline(result.timeline)
    return result.created
  }, [board.allFriction, board.setFriction, daily, timeline, setDaily, setTimeline])

  return { completeTask, reopenTask, removeTask, createTask, updateTask, addFocus, finishFocus, discardFocus, addSessionLog, addFriction, resolveFriction, removeKnowledgeNode, deleteLog, deleteLogs, addFrictionMerged }
}
