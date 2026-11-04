/**
 * projects.ts — 项目隔离、模板与排行（需求 3.3）。
 *
 * ── 隔离口径（重要，别在组件里各写一套）────────────────────────────────────
 * 「当前项目」是一个**视图作用域**，不是一个存储分区：所有数据仍然在一个数组里，
 * 但每条记录带 `projectId`。这样做的好处是：
 *   • 切换项目不需要搬数据，不会出现「切回来少了一半」；
 *   • 归档只改一个 `archived` 标志，历史记录原封不动；
 *   • 导出备份天然是全量的。
 *
 * 三种作用域：
 *   1. `activeId === ''`  → 全部项目，但**排除已归档项目**的数据（需求 3.3.3
 *      「归档项目不再参与日常统计」）；
 *   2. `activeId === 某项目` → 只保留该项目；
 *   3. 未归属项目的数据（`projectId` 为空）只在「全部」里出现。
 *
 * 所有过滤都走这里的函数，组件不许自己 `filter(r => r.projectId === x)` ——
 * 否则「归档排除」这条规则迟早会漏在某个卡片里。
 */
import type { FrictionRecord, Project, ProjectRankRow, SessionLog, Task } from '../types'
import { BOARD_CONFIG } from './config'
import { assignLogMinutes } from './stats'

/** 项目模板：一键初始化配套任务清单。 */
export interface ProjectTemplate {
  id: string
  name: string
  /** 新建项目时的默认名。 */
  projectName: string
  note: string
  color: string
  tasks: string[]
}

/**
 * 三套预设模板（需求 3.3.4）。
 *
 * 任务写得具体一点才有用 —— 「搭建项目骨架」比「开始做」更能推进第一步。
 */
export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'template-plugin',
    name: '插件开发',
    projectName: 'DSH 插件开发',
    note: '宿主 + 客户端双半、注册链路、打包与自测',
    color: 'var(--osb-accent)',
    tasks: [
      '梳理插件需要注册的槽位与生命周期',
      '搭好 host / client 双产物与构建脚本',
      '实现主面板与左导航入口',
      '补齐本地存储与版本兼容层',
      '写自测脚本（注册链路 + 纯逻辑断言）',
    ],
  },
  {
    id: 'template-frontend',
    name: '前端学习',
    projectName: 'TS 前端学习',
    note: '类型系统、组件设计、状态管理、可访问性',
    color: 'var(--osb-ok)',
    tasks: [
      '过一遍 TS 泛型与条件类型',
      '手写一个受控组件（含键盘可达性）',
      '拆一次「巨型组件」并说明拆分依据',
      '用原生 SVG 画一张图（不引图表库）',
      '整理一份踩坑笔记',
    ],
  },
  {
    id: 'template-debug',
    name: '代码调试',
    projectName: '排错专项',
    note: '复现、定位、修复、回归，四步闭环',
    color: 'var(--osb-danger)',
    tasks: [
      '把问题复现成最小可执行片段',
      '定位到具体文件与行号',
      '写出根因假设并验证',
      '修复并补一条回归用例',
      '把这次阻碍写进阻碍记录',
    ],
  },
]

/** 按 id 取模板。 */
export function findTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(item => item.id === id)
}

/** 已归档项目的 id 集合。 */
export function archivedProjectIds(projects: Project[]): Set<string> {
  const set = new Set<string>()
  for (const project of projects) {
    if (project.archived) set.add(project.id)
  }
  return set
}

/**
 * 某条记录是否在当前作用域内。
 *
 * @param recordProjectId - 记录上的项目 id（可能是空）
 * @param activeId - 当前活跃项目（`''` = 全部）
 * @param archived - 已归档项目 id 集合（只在「全部」时用得上）
 */
export function inScope(
  recordProjectId: string | undefined,
  activeId: string,
  archived: Set<string>,
): boolean {
  const id = recordProjectId ?? ''
  if (activeId !== BOARD_CONFIG.projects.allId) return id === activeId
  // 全部项目：排除归档项目的数据；未归属数据保留。
  return id === '' || !archived.has(id)
}

/** 任务 → 当前作用域。 */
export function scopedTasks(tasks: Task[], activeId: string, projects: Project[]): Task[] {
  const archived = archivedProjectIds(projects)
  return tasks.filter(task => inScope(task.projectId, activeId, archived))
}

/** 日志 → 当前作用域。 */
export function scopedLogs(logs: SessionLog[], activeId: string, projects: Project[]): SessionLog[] {
  const archived = archivedProjectIds(projects)
  return logs.filter(log => inScope(log.projectId, activeId, archived))
}

/** 阻碍记录 → 当前作用域。 */
export function scopedFriction(
  records: FrictionRecord[],
  activeId: string,
  projects: Project[],
): FrictionRecord[] {
  const archived = archivedProjectIds(projects)
  return records.filter(item => inScope(item.projectId, activeId, archived))
}

/** 项目名（找不到 id 时退到记录上的文本，再退到「未归属项目」）。 */
export function projectNameOf(
  projects: Project[],
  projectId: string | undefined,
  fallbackText?: string,
): string {
  if (projectId !== undefined && projectId !== '') {
    const found = projects.find(item => item.id === projectId)
    if (found !== undefined) return found.name
  }
  if (fallbackText !== undefined && fallbackText.trim() !== '') return fallbackText
  return '未归属项目'
}

/**
 * 按项目排行（需求 2.4.2）：总专注时长 / 会话数 / 任务完成数。
 *
 * 时长只来自 `kind === 'focus'` 的日志（与全局口径一致）；会话数用
 * `assignLogMinutes` 的估算值做权重没有意义，所以直接数条数。
 */
export function projectRanking(
  logs: SessionLog[],
  tasks: Task[],
  projects: Project[],
  activeId: string = BOARD_CONFIG.projects.allId,
  options: { includeEmpty?: boolean } = {},
): ProjectRankRow[] {
  const archived = archivedProjectIds(projects)
  const rows = new Map<string, { minutes: number; sessions: number; tasksDone: number }>()

  const ensure = (id: string): { minutes: number; sessions: number; tasksDone: number } => {
    const existing = rows.get(id)
    if (existing !== undefined) return existing
    const created = { minutes: 0, sessions: 0, tasksDone: 0 }
    rows.set(id, created)
    return created
  }

  // 先把「真实存在的项目」铺进结果，零投入也保留；否则「有 5 个任务」和
  // 「0 个项目」会同时出现在界面上（真实宿主 P0）。
  if (options.includeEmpty === true) {
    for (const project of projects) {
      if (!inScope(project.id, activeId, archived)) continue
      ensure(project.id)
    }
  }

  for (const { log, minutes } of assignLogMinutes(logs)) {
    const id = log.projectId ?? ''
    if (!inScope(id, activeId, archived)) continue
    const row = ensure(id)
    // 只有专注日志计入分钟数；自动采集的估算值单独看没有意义。
    if (log.kind === 'focus') row.minutes += Math.max(0, log.minutes ?? minutes)
    row.sessions += 1
  }

  for (const task of tasks) {
    if (!task.done) continue
    const id = task.projectId ?? ''
    if (!inScope(id, activeId, archived)) continue
    ensure(id).tasksDone += 1
  }

  return [...rows.entries()]
    .map(([projectId, row]) => {
      const found = projects.find(item => item.id === projectId)
      return {
        projectId,
        name: found?.name ?? (projectId === '' ? '未归属项目' : projectId),
        minutes: Math.round(row.minutes),
        sessions: row.sessions,
        tasksDone: row.tasksDone,
        archived: found?.archived === true,
      }
    })
    .sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions || b.tasksDone - a.tasksDone)
}

/** 活跃项目是否仍然可用（被删 / 被归档时退回「全部」）。 */
export function normalizeActiveId(activeId: string, projects: Project[]): string {
  if (activeId === '') return ''
  const found = projects.find(item => item.id === activeId)
  if (found === undefined || found.archived) return ''
  return activeId
}
