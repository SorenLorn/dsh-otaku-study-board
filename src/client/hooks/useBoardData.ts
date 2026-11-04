/**
 * useBoardData — 看板唯一的数据入口（V3：按项目作用域返回）。
 *
 * 两张面孔：
 *   • `tasks` / `logs` / `friction` —— **当前项目作用域内**的数据，组件直接渲染；
 *   • `allTasks` / `allLogs` / `allFriction` —— 全量数据，给「需要跨项目」的地方
 *     （备份导出、项目排行）用。
 *
 * 为什么隔离放在这一层：V3 有五个卡片都要过滤，如果每个卡片自己写
 * `tasks.filter(t => t.projectId === activeId)`，迟早有一处漏掉「归档项目排除」
 * 那条规则。集中在 hook 里，组件想不隔离都难。
 *
 * 注意 setter 始终操作**全量数组** —— 存储里从来没有分区，只有视图分区。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardMeta, FrictionRecord, Project, SessionLog, Task } from '../types'
import { STORAGE_KEYS } from '../types'
import { createDefaultMeta } from '../lib/defaults'
import { normalizeActiveId, scopedFriction, scopedLogs, scopedTasks } from '../lib/projects'
import { sanitizeAll } from '../lib/schema'
import { warn } from '../lib/debug'
import { BOARD_CONFIG } from '../lib/config'
import { useBoardSettings } from './useBoardSettings'
import { useLocalStore, type LocalStoreTuple } from './useLocalStore'

export interface BoardData {
  /** 当前作用域内的任务（已排除归档项目）。 */
  tasks: Task[]
  logs: SessionLog[]
  friction: FrictionRecord[]
  /** 全量，含归档项目。 */
  allTasks: Task[]
  allLogs: SessionLog[]
  allFriction: FrictionRecord[]
  projects: Project[]
  activeProjects: Project[]
  activeProjectId: string
  activeProject: Project | undefined
  meta: BoardMeta
  setTasks: LocalStoreTuple<Task[]>[1]
  setLogs: LocalStoreTuple<SessionLog[]>[1]
  setFriction: LocalStoreTuple<FrictionRecord[]>[1]
  setMeta: LocalStoreTuple<BoardMeta>[1]
  setProjects: LocalStoreTuple<Project[]>[1]
  setActiveProject: (id: string) => void
}

/** 读三个列表 + 项目 + meta，并按当前项目切片。 */
export function useBoardData(): BoardData {
  const [allTasks, setTasks] = useLocalStore<Task[]>(STORAGE_KEYS.tasks, [])
  const [allLogs, setLogs] = useLocalStore<SessionLog[]>(STORAGE_KEYS.logs, [])
  const [allFriction, setFriction] = useLocalStore<FrictionRecord[]>(STORAGE_KEYS.friction, [])
  const [projects, setProjects] = useLocalStore<Project[]>(STORAGE_KEYS.projects, [])
  const [meta, setMeta] = useLocalStore<BoardMeta>(STORAGE_KEYS.meta, createDefaultMeta())
  const { settings, patch } = useBoardSettings()

  const activeProjectId = useMemo(
    () => normalizeActiveId(settings.activeProjectId, projects),
    [settings.activeProjectId, projects],
  )

  /**
   * 启动时清理脏数据（需求 4.1.3）。
   *
   * 只在「真的丢了东西」时写回，且只跑一次 —— 否则每次渲染都可能触发一次写盘。
   */
  const [sanitized, setSanitized] = useState(false)
  useEffect(() => {
    if (sanitized || !BOARD_CONFIG.features.autoSanitize) return
    setSanitized(true)
    try {
      const result = sanitizeAll({ tasks: allTasks, logs: allLogs, friction: allFriction })
      if (!result.report.changed) return
      warn('storage', `dropped ${result.report.dropped} dirty records on startup`, result.report)
      if (result.tasks.length !== allTasks.length) setTasks(result.tasks)
      if (result.logs.length !== allLogs.length) setLogs(result.logs)
      if (result.friction.length !== allFriction.length) setFriction(result.friction)
    } catch (error) {
      warn('storage', 'startup sanitize failed — data left untouched', error)
    }
    // 只在首次挂载时跑；后续列表变化由写入端自己保证形状。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scopedTaskList = useMemo(
    () => scopedTasks(allTasks, activeProjectId, projects),
    [allTasks, activeProjectId, projects],
  )
  const scopedLogList = useMemo(
    () => scopedLogs(allLogs, activeProjectId, projects),
    [allLogs, activeProjectId, projects],
  )
  const scopedFrictionList = useMemo(
    () => scopedFriction(allFriction, activeProjectId, projects),
    [allFriction, activeProjectId, projects],
  )

  /**
   * 切项目。
   *
   * 刻意**不**在这里对 id 做 normalize：快照导入 / 模板创建会在同一次事件里
   * 「先加项目、再切过去」，此刻闭包里的 `projects` 还是旧列表，如果在这里
   * normalize 就会把一个刚创建、列表里还没有的 id 判成无效、直接退回「全部」。
   * 真正无效的 id 会在下一次读取时被 `activeProjectId` 的 normalize 抹掉，
   * 所以这里保持「写什么就是什么」。
   */
  const setActiveProject = useCallback(
    (id: string) => {
      patch({ activeProjectId: id })
    },
    [patch],
  )

  return {
    tasks: scopedTaskList,
    logs: scopedLogList,
    friction: scopedFrictionList,
    allTasks,
    allLogs,
    allFriction,
    projects,
    activeProjects: projects.filter(item => !item.archived),
    activeProjectId,
    activeProject: projects.find(item => item.id === activeProjectId),
    meta,
    setTasks,
    setLogs,
    setFriction,
    setMeta,
    setProjects,
    setActiveProject,
  }
}

/**
 * Current epoch-ms, refreshed on an interval.
 *
 * 30 s 足够处理日期边界；计时器有自己 250ms 的循环，不用这个。
 * 另外它在**跨零点**时会自然推进 `now`，所以「今天」的统计会自动切到新的一天
 * （需求 2.4.4：跨日期自动结算）。
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => {
      window.clearInterval(id)
    }
  }, [intervalMs])

  return now
}
