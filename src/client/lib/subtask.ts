/**
 * subtask.ts — 子任务进度（需求 2.2.1）。
 *
 * 一条纪律：**进度永远是算出来的**，不存 `progress` 字段。存下来一定会出现
 * 「子任务勾完了但主任务是未完成」这种自相矛盾的状态。
 *
 * 另一个方向的一致性在这里也处理：勾完最后一条子任务 → 主任务自动完成；
 * 取消勾选任意一条 → 主任务退回未完成。两个方向都走 `syncParent`，所以不会
 * 出现只修一半的情况。
 */
import type { Subtask, Task } from '../types'

/** 进度快照。没有子任务时 `total = 0`，此时进度按主任务自身的 done 算。 */
export interface SubtaskProgress {
  total: number
  done: number
  /** 0–1 */
  rate: number
  /** 全部完成（没有子任务时为 false，交给主任务状态决定）。 */
  allDone: boolean
}

/** 算一条任务的子任务进度。 */
export function subtaskProgress(task: Pick<Task, 'subtasks'>): SubtaskProgress {
  const list = task.subtasks ?? []
  const total = list.length
  const done = list.reduce((sum, item) => (item.done ? sum + 1 : sum), 0)
  return {
    total,
    done,
    rate: total === 0 ? 0 : done / total,
    allDone: total > 0 && done === total,
  }
}

/** 生成一条子任务。 */
export function createSubtask(title: string, now = Date.now()): Subtask {
  return {
    id: `sub-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    done: false,
    createdAt: now,
  }
}

/**
 * 勾选 / 取消一条子任务，并把结果同步到主任务。
 *
 * @param task - 原任务（不修改）
 * @param subtaskId - 要切换的子任务
 * @returns 新任务对象
 */
export function toggleSubtask(task: Task, subtaskId: string, now = Date.now()): Task {
  const list = task.subtasks ?? []
  const subtasks = list.map(item => {
    if (item.id !== subtaskId) return item
    const done = !item.done
    const next: Subtask = { ...item, done }
    if (done) next.doneAt = now
    else delete next.doneAt
    return next
  })
  return syncParent({ ...task, subtasks }, now)
}

/** 批量勾选（需求 2.2.1「支持批量勾选子任务」）。 */
export function setAllSubtasks(task: Task, done: boolean, now = Date.now()): Task {
  const subtasks = (task.subtasks ?? []).map(item => {
    const next: Subtask = { ...item, done }
    if (done) next.doneAt = now
    else delete next.doneAt
    return next
  })
  return syncParent({ ...task, subtasks }, now)
}

/**
 * 主任务 ← 子任务的一致性同步。
 *
 * 规则：
 *   • 有子任务且全部完成 → 主任务完成（写 completedAt，供「今日完成」「周完成率」统计）
 *   • 有子任务但没全完成 → 主任务未完成（保留已有的 completedAt？不，要清掉，
 *     否则「完成了又取消勾选」会让统计永远多算一条）
 *   • 没有子任务 → 不动主任务（用户可能只想要一个粗粒度任务）
 */
export function syncParent(task: Task, now = Date.now()): Task {
  const list = task.subtasks ?? []
  if (list.length === 0) return { ...task, updatedAt: now }

  const allDone = list.every(item => item.done)
  if (allDone) {
    if (task.done && task.status === 'done') return { ...task, updatedAt: now }
    return {
      ...task,
      done: true,
      status: 'done',
      completedAt: task.completedAt ?? now,
      updatedAt: now,
    }
  }

  if (!task.done && task.status !== 'done') return { ...task, updatedAt: now }
  return { ...task, done: false, status: 'todo', completedAt: undefined, updatedAt: now }
}

/** 任务是否全部子任务完成（用于列表上的小角标）。 */
export function isFullyBrokenDown(task: Task): boolean {
  const list = task.subtasks ?? []
  return list.length > 0 && list.every(item => item.done)
}
