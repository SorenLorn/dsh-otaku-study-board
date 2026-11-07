/**
 * Shared types for dsh-otaku-study-board（溯时学习工作台）— V3.
 *
 * 三组形状，边界很清楚：
 *
 *   1. **业务模型** —— Task / SessionLog / Project / FrictionRecord / settings /
 *      timer / meta。只有这些会进 localStorage。
 *   2. **宿主契约** —— 本插件实际用到的 DSH 客户端运行时切片
 *      （`ctx.slots` / `ctx.effect` / `ctx.on` / `ctx.get`）。
 *   3. **导出信封** —— 备份文件与项目快照的 JSON 形状。
 *
 * ── 多版本兼容（V1 → V2 → V3，一次都不能丢数据）─────────────────────────────
 * 所有新字段都是**可选**的，读取端一律用 `??` 兜底（见 lib/schema.ts 的 coerce*）：
 *
 *   • V1 的裸数组 / 裸对象        → unwrapEnvelope 认出 legacy，走 coerce 补齐
 *   • V2 的 `{schemaVersion:2,...}` → 同一条 coerce 路径，只是少了 V3 的字段
 *   • V3 新增：Subtask / dueAt / phase / FrictionRecord / activeProjectId
 *
 * 因此升级**不需要迁移脚本**，也不需要清库。写回永远是当前版本（`SCHEMA_VERSION`）。
 */

/* ────────────────────────────────────────────────────────────────────────────
 * 0. V4 实体（单独文件，避免把历史包袱和新能力搅在一起）
 * ──────────────────────────────────────────────────────────────────────────── */

export * from './v4'

// 同一文件里也要能直接用这些名字（`export *` 只导出，不引入作用域）。
import type {
  DailyAggregate,
  HistorySnapshot,
  KnowledgeGraph,
  MemoryDraft,
  ProjectMemory,
  ReviewRecord,
  TimelineEvent,
} from './v4'

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Board models
 * ──────────────────────────────────────────────────────────────────────────── */

/** A task's life-cycle state. `done` mirrors `status === 'done'` for the checkbox. */
export type TaskStatus = 'todo' | 'doing' | 'done'

/** Priority marker drawn as a three-colour dot in the task row. */
export type TaskPriority = 'normal' | 'important' | 'urgent'

/** Filter tabs above the task list. */
export type TaskFilter = 'all' | 'active' | 'done' | 'overdue'

/**
 * 子任务：主任务下的一步。
 *
 * 刻意不存进度百分比 —— 进度永远由 `done` 的子任务数 / 总数算出来（lib/subtask.ts），
 * 存下来就会有「改了子任务忘了改百分比」这种不一致。
 */
export interface Subtask {
  id: string
  title: string
  done: boolean
  doneAt?: number
  createdAt: number
}

/** One check-in item on the board. */
export interface Task {
  id: string
  title: string
  note?: string
  status: TaskStatus
  done: boolean
  /** V1 字段，保留兼容；V2 起真实时长看 `focusedMinutes`。 */
  pomodoros: number
  focusedMinutes?: number
  estimateMinutes?: number
  priority?: TaskPriority
  /** 归属项目（V3 起真正用于隔离）。 */
  projectId?: string
  /** V3：子任务。缺失视为「没有拆解」。 */
  subtasks?: Subtask[]
  /** V3：截止时间（epoch ms）。缺失 = 不设截止，永不逾期。 */
  dueAt?: number
  /** V3：绑定的 DSH 会话 id；该会话的自动采集日志会归属到本任务。 */
  sessionId?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/**
 * 会话类型 —— V3 把 V2 的五个粗类拆成六个（对应需求 2.1.5）：
 *
 *   dev       代码开发（写了新代码）
 *   debug     排错调试（报错、堆栈、反复重试）
 *   refactor  代码重构（结构调整但功能不变）
 *   design    方案架构（选型、拆解、设计）
 *   reading   文档查阅（查文档、读教程）
 *   other     其他
 *
 * V2 的 `design` / `reading` 取值不变，只是展示名从「方案构思 / 文档阅读」变成
 * 「方案架构 / 文档查阅」，所以旧数据不需要迁移。
 */
export type SessionType = 'dev' | 'debug' | 'reading' | 'design' | 'refactor' | 'other'

/** 日志种类；V3 新增 `friction`（自动沉淀的开发阻碍）。 */
export type LogKind =
  | 'message'
  | 'code-block'
  | 'tool-call'
  | 'milestone'
  | 'manual'
  | 'focus'
  | 'friction'

/** One row of the session behaviour log. */
export interface SessionLog {
  id: string
  at: number
  kind: LogKind
  sessionType?: SessionType
  /** 项目**名称**（展示 + 文本筛选用）；项目实体见 `projectId`。 */
  project?: string
  /** V3：项目 id，用于严格隔离。 */
  projectId?: string
  /** V3：归属任务 id（来自会话绑定或手动绑定）。 */
  taskId?: string
  title: string
  /** Never source code. */
  detail?: string
  source: 'auto' | 'manual'
  edited: boolean
  sessionId?: string
  /** 说话人；`tool` 表示工具调用结果。 */
  role?: 'user' | 'assistant' | 'tool'
  /** V3：估算 token 数（只存数字，不存原文）。 */
  tokens?: number
  /** V2：合并进来的事件条数。 */
  hits?: number
  minutes?: number
}

/** A study project; grouping for tasks, logs and friction records. */
export interface Project {
  id: string
  name: string
  color?: string
  note?: string
  archived: boolean
  /** V3：创建时套用的模板 id（便于统计「模板有没有用」）。 */
  templateId?: string
  /** V3：归档时间，用于「归档项目不参与日常统计」。 */
  archivedAt?: number
  createdAt: number
}

/**
 * 开发阻碍记录（需求 3.4）。
 *
 * 来源是「会话里出现报错 / 反复调试」的自动识别，也允许手动补一条。
 * `hits` 表示同一类报错累计出现几次 —— 反复踩同一个坑才是真正的时间黑洞。
 */
export interface FrictionRecord {
  id: string
  at: number
  updatedAt: number
  projectId?: string
  taskId?: string
  sessionId?: string
  /** 报错摘要（一行，不含源码）。 */
  summary: string
  /** 上下文说明：在做什么的时候炸的。 */
  detail?: string
  /** 同一类阻碍重复出现的次数。 */
  hits: number
  /** 是否已解决（填了解决方案通常意味着已解决）。 */
  resolved: boolean
  /** 解决方案备注 —— 这条记录的全部价值所在。 */
  solution?: string
  /** 关联的会话日志 id。 */
  logId?: string
  /** 解决耗时（毫秒），来自「首次出现 → 标记解决」。 */
  resolveMs?: number
}

/** Numbers the Overview card renders. */
export interface BoardStats {
  tasksDoneToday: number
  tasksTotal: number
  focusMinutesToday: number
  streakDays: number
  logsToday: number
  /** V3：逾期任务数（只看未完成且过了截止时间的）。 */
  overdueTasks?: number
  /** V3：本周阻碍次数。 */
  frictionThisWeek?: number
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1b. settings / timer / meta
 * ──────────────────────────────────────────────────────────────────────────── */

/** One keyword → project auto-binding rule. V3 起 `keyword` 支持正则。 */
export interface ProjectRule {
  id: string
  keyword: string
  /** 目标项目**名称**（V2 遗留字段，保持兼容）。 */
  project: string
  /** V3：目标项目 id；有它时优先按 id 归属。 */
  projectId?: string
  /** V3：把 keyword 当正则解释（默认 false，按子串匹配）。 */
  regex?: boolean
}

export interface MonthlyGoal {
  month: string
  targetMinutes: number
  targetTasks: number
}

/** Everything the settings panel writes. One JSON key, so backup stays simple. */
export interface BoardSettings {
  autoCapture: boolean
  lastDurationMinutes: number
  projectRules: ProjectRule[]
  monthlyGoal: MonthlyGoal
  /** V3：当前活跃项目；`''` 表示「全部项目」。 */
  activeProjectId: string
  /** V3：番茄钟休息阶段开关。 */
  breakEnabled: boolean
  shortBreakMinutes: number
  longBreakMinutes: number
  roundsBeforeLongBreak: number
  /** V3：上下文膨胀预警阈值（消息条数）。 */
  contextWarnMessages: number
  contextDangerMessages: number
  /* ── V4 ── */
  /** 每天首次打开时自动生成今日诊断（只发统计档）。 */
  aiAutoDaily: boolean
  /** 外部输入档位：统计 / 统计+摘要。 */
  aiTier: 'stats' | 'summary'
  /** 热力图默认展示的年份；`0` 表示跟随当前年。 */
  heatmapYear: number
}

/** 计时器阶段：专注 / 短休 / 长休。休息时间**不计入**专注时长。 */
export type TimerPhase = 'focus' | 'short' | 'long'

/**
 * Persisted timer state.
 *
 * 只存「边界」（running / deadline / length / 绑定 / 阶段），`remainingSeconds`
 * 只在暂停、重置、完成这些状态边界写一次 —— 250ms 的显示刷新不碰 localStorage。
 */
export interface TimerPersistedState {
  running: boolean
  deadline: number | null
  durationMinutes: number
  boundTaskId: string
  startedAt: number | null
  remainingSeconds: number
  /** V3：当前处于哪一段。缺失（旧数据）一律视为 `focus`。 */
  phase?: TimerPhase
  /** V3：本轮专注在「四轮一长休」环里的序号（0–3）。 */
  roundInCycle?: number
  /** V3：专注段长度。休息期间 `durationMinutes` 是休息长度，靠这个记住专注要回到几分钟。 */
  focusMinutes?: number
  /**
   * Phase 5.5：本轮的唯一标识（幂等键）。
   *
   * 为什么必须有：结束一轮时要写一条 SessionLog，如果每轮没有稳定 id，「重复点结束 /
   * 刷新重放 / 两个标签页同时结算」就会各写一条新 id 的日志，`addFocusLog` 的同 id
   * 幂等判断形同虚设。缺失（旧数据）时由 `endRound` 用 `startedAt` 派生，仍然幂等。
   */
  roundId?: string
  /**
   * Phase 5.5：上一轮的实际结算结果。
   *
   * 为什么必须单独存：本轮结束后剩余时间是 0（用它表示 completed 状态），
   * 此时 `duration - remaining` 会算出「目标时长」而不是「实际时长」。
   * 刷新后要能显示「本轮 18 分钟」而不是「25 分钟」，所以把结算值记下来。
   */
  lastMinutes?: number
  lastEndedAt?: number
  lastTaskId?: string
  /**
   * Phase 5.5.1：**还没成功落盘**的一次结算。
   *
   * 为什么放在计时状态里而不是新开一个键：结束一轮时 `roundId` 会被清掉（防重放），
   * 一旦 4 个键的结算事务失败，如果没有这个字段就再也拼不回同一笔专注 ——
   * 用户只能看着「本轮完成」但数据没写进去。存下来之后：
   *   • 失败可重试（同一个 roundId，仍然是幂等的）；
   *   • 刷新后能自动补写；
   *   • 写成功就删掉，不会重复。
   * timer 是瞬态键（不进备份），所以不涉及备份格式兼容。
   */
  pendingResult?: PendingSettlement
}

/** 待落盘的一次结算（字段与 `lib/focus.ts` 的 `FocusResult` 子集一致）。 */
export interface PendingSettlement {
  roundId: string
  minutes: number
  elapsedSeconds: number
  targetMinutes: number
  taskId: string
  startedAt: number
  endedAt: number
  /**
   * 结算前的基线快照（Phase 5.5.2）。
   *
   * 用途：部分写入之后，靠它判断「Daily 是否已经加上这一轮的分钟」——
   * `现在 === 基线` 说明没加过，`现在 ≥ 基线 + 本轮` 说明加过了。
   * 没有它就只能猜，而猜错就是重复累计或漏记，所以宁可保留未保存状态。
   */
  before?: PendingBaseline
}

/** 基线快照（与 `lib/settlement.ts` 的 `SettlementBaseline` 结构一致）。 */
export interface PendingBaseline {
  day: string
  dailyMinutes: number | null
  taskId: string
  taskMinutes: number | null
  taskPomodoros: number | null
}

/** 不属于业务数据、但需要跨会话记住的运行时状态。 */
export interface BoardMeta {
  /** 会话 id → 任务 id：在该会话里采集到的日志自动归属这个任务。 */
  sessionTaskMap: Record<string, string>
  /** 上次精简会话建议被采纳的时间。 */
  lastContextPruneAt?: number
  /** 上次写入时的版本号，便于调试面板显示。 */
  schemaStamp?: number
  /* ── V4 ── */
  /** 记忆草稿：按项目存放，确认后才写主文档（不进备份主数据）。 */
  memoryDrafts?: Record<string, MemoryDraft>
  /** 从哪个 schema 版本升级上来的（首次以 v4 打开时写入）。 */
  upgradedFrom?: number
  /** 上次自动生成周报的时间。 */
  lastWeeklyAt?: number
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1c. V3 派生形状（不落盘）
 * ──────────────────────────────────────────────────────────────────────────── */

/** 上下文构成里的一类。 */
export interface ContextSlice {
  key: 'user' | 'assistant' | 'tool' | 'code' | 'error'
  label: string
  count: number
  tokens: number
}

/** 会话上下文观测结果（需求 3.1）。只统计，不保留原文。 */
export interface ContextStats {
  /** 参与统计的消息条数。 */
  messages: number
  /** 估算 token 总量。 */
  tokens: number
  /** 估算字符总量（用于「只做统计」的口径说明）。 */
  chars: number
  slices: ContextSlice[]
  codeBlocks: number
  errorMessages: number
  level: 'ok' | 'warn' | 'danger'
  /** 一句话结论。 */
  verdict: string
  /** 可执行的建议（精简 / 归档 / 拆会话）。 */
  suggestions: string[]
  /** 建议精简的消息条数。 */
  pruneCandidates: number
}

/** 项目投入排行的一行。 */
export interface ProjectRankRow {
  projectId: string
  name: string
  minutes: number
  sessions: number
  tasksDone: number
  archived: boolean
}

/** 甘特视图的一行：一天里完成了哪些任务。 */
export interface GanttRow {
  dayKey: string
  label: string
  items: Array<{ id: string; title: string; at: number; minutes: number }>
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Local storage
 * ──────────────────────────────────────────────────────────────────────────── */

export const STORAGE_PREFIX = 'dsh-otaku-study-board'

export const STORAGE_KEYS = {
  tasks: `${STORAGE_PREFIX}:tasks`,
  logs: `${STORAGE_PREFIX}:logs`,
  projects: `${STORAGE_PREFIX}:projects`,
  settings: `${STORAGE_PREFIX}:settings`,
  timer: `${STORAGE_PREFIX}:timer`,
  /** V3 */
  friction: `${STORAGE_PREFIX}:friction`,
  /** V3 */
  meta: `${STORAGE_PREFIX}:meta`,
  /* ── V4 新增（每个实体一个键，互不影响；缺失即视为空） ── */
  memory: `${STORAGE_PREFIX}:memory`,
  knowledge: `${STORAGE_PREFIX}:knowledge`,
  reviews: `${STORAGE_PREFIX}:reviews`,
  timeline: `${STORAGE_PREFIX}:timeline`,
  history: `${STORAGE_PREFIX}:history`,
  daily: `${STORAGE_PREFIX}:daily`,
  /** 审计日志：不进备份、不参与统计。 */
  aiRuns: `${STORAGE_PREFIX}:aiRuns`,
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/** 参与备份的键（timer 是瞬态，永不导出）。 */
export const BACKUP_KEYS: readonly StorageKey[] = [
  STORAGE_KEYS.tasks,
  STORAGE_KEYS.logs,
  STORAGE_KEYS.projects,
  STORAGE_KEYS.settings,
  STORAGE_KEYS.friction,
  STORAGE_KEYS.meta,
  /* V4：以下六个进备份；timer（瞬态）与 aiRuns（审计）不进 */
  STORAGE_KEYS.memory,
  STORAGE_KEYS.knowledge,
  STORAGE_KEYS.reviews,
  STORAGE_KEYS.timeline,
  STORAGE_KEYS.history,
  STORAGE_KEYS.daily,
]

/* ────────────────────────────────────────────────────────────────────────────
 * 3. DSH client host contract
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SidebarGuideEntry {
  id: string
  order?: number
  title: () => string
  description?: () => string
  icon?: (props: { size?: number }) => unknown
}

export interface SidebarGuideFace {
  register(entry: SidebarGuideEntry): () => void
}

export type SlotComponent = (props: Record<string, unknown> & { sessionId?: string }) => unknown

export interface SlotRegisterOptions {
  name: string
  id?: string
  key?: string
  order?: number
  label?: () => string
  locale?: string
  inject?: (ownerProps?: { sessionId?: string }) => Record<string, unknown>
}

export interface SlotsFace {
  register(options: SlotRegisterOptions, component: SlotComponent): () => void
  inject(name: string, factory: () => () => void): () => void
  sidebarGuide?: SidebarGuideFace
}

export interface EmitterFace {
  on(event: string, listener: (payload: unknown) => void): unknown
  off?(event: string, listener: (payload: unknown) => void): unknown
}

/**
 * 命令注册面（**可选**）。
 *
 * 当前 DSH 构建没有对外承诺命令注册 API —— 本插件按「有就用、没有就退回消息
 * 捕获 + window 桥」处理，见 hooks/useSlashCommand.ts 的三条通道说明。
 */
export interface CommandsFace {
  register?(command: {
    name: string
    description?: string
    run: (args: string) => unknown
  }): unknown
}

/** The cordis client context as this plugin uses it. */
export interface ClientCtx {
  slots: SlotsFace
  effect(callback: () => void | (() => void), label?: string): void
  inject(dependencies: string[], callback: (scoped: ClientCtx) => void | (() => void)): unknown
  get<T = unknown>(name: string): T | undefined
  on?(event: string, listener: (payload: unknown) => void): unknown
  logger?: { warn?(message: string): void }
}

/** A normalised harness event, produced by hooks/useHarnessEvent. */
export interface HarnessEvent {
  type: string
  at: number
  sessionId?: string
  payload?: unknown
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. 导出信封（备份 + 快照）
 * ──────────────────────────────────────────────────────────────────────────── */

/** 备份范围：全量 / 近 7 天 / 当月。 */
export type BackupScope = 'all' | 'week' | 'month'

/** 导入模式：合并（按 id 去重） / 覆盖（整体替换）。 */
export type ImportMode = 'merge' | 'overwrite'

/**
 * 备份 JSON。`version: 3` 只是标记「含 V3 字段」，读取端对 1 / 2 / 3 一视同仁
 * —— 因为所有字段都可选，缺了就走默认值。
 */
export interface BackupPayload {
  kind: 'sorchron-study-board-backup'
  version: 4
  exportedAt: number
  /** V3：导出范围，导入时用于提示（不参与合并逻辑）。 */
  scope?: BackupScope
  tasks: Task[]
  logs: SessionLog[]
  projects: Project[]
  settings: BoardSettings
  /** V3 */
  friction: FrictionRecord[]
  /** V3 */
  meta: BoardMeta
  /* ── V4：全部可选，缺了按空处理（V3 备份可直接导入） ── */
  memory?: ProjectMemory[]
  knowledge?: KnowledgeGraph
  reviews?: ReviewRecord[]
  timeline?: TimelineEvent[]
  history?: HistorySnapshot[]
  daily?: DailyAggregate[]
}

/** 导入前的冲突预览。 */
export interface ImportPreview {
  mode: ImportMode
  incoming: { tasks: number; logs: number; projects: number; friction: number }
  local: { tasks: number; logs: number; projects: number; friction: number }
  /** 相同 id 但内容不同 —— 合并时会以备份为准的条数。 */
  conflicts: { tasks: number; logs: number; projects: number; friction: number }
  exportedAt: number
  scope?: BackupScope
  /** V4：备份里包含的新实体条数（没有这些字段时不出现）。 */
  extra?: {
    memory: number
    knowledge: number
    reviews: number
    timeline: number
    history: number
    daily: number
  }
}

/**
 * 项目记忆快照（需求 3.5）：纯本地导出的 JSON，用来在新建项目时延续上下文。
 * 只带**摘要**，不带日志原文。
 */
export interface MemorySnapshot {
  kind: 'sorchron-project-snapshot'
  version: 3
  exportedAt: number
  project: Pick<Project, 'id' | 'name' | 'note' | 'templateId'>
  tasks: Task[]
  friction: FrictionRecord[]
  /** 重点会话摘要（最多 N 条）。 */
  highlights: Array<{
    at: number
    title: string
    detail?: string
    sessionType?: SessionType
    taskId?: string
  }>
  /** 汇总数字，方便导入时直接展示「延续了什么」。 */
  totals: {
    tasks: number
    tasksDone: number
    focusMinutes: number
    friction: number
    openFriction: number
  }
}
