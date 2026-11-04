/**
 * types/v4.ts — V4 新增实体（与 V3 的 Task / SessionLog / Project 并列，不改它们的语义）。
 *
 * 为什么单独一个文件：`types/index.ts` 已经承载了 V1–V3 的全部形状与宿主契约，
 * 继续往里堆会把「历史包袱」和「新能力」搅在一起。这里只放 V4 的新结构，
 * 由 index.ts 统一 `export *` 出去，调用方仍然只 `import from '../types'`。
 *
 * 七组实体 → 七个存储键（详见 STORAGE_KEYS）：
 *   memory   项目记忆（活文档）      knowledge  知识图谱（nodes + edges）
 *   reviews  复习记录与排期          timeline   时间轴事件（append-only）
 *   history  历史快照（真实取样）    daily      日聚合（热力图数据源）
 *   aiRuns   AI 调用审计（不进备份）
 */

/* ────────────────────────────────────────────────────────────────────────────
 * 1. 项目记忆（需求 2.3）
 * ──────────────────────────────────────────────────────────────────────────── */

/** 一条技术决策。`superseded` 表示被后续决策取代（保留历史，不删除）。 */
export interface Decision {
  id: string
  at: number
  text: string
  status: 'active' | 'superseded'
}

/** 每个项目一份记忆文档。字段全部可选内容语义，缺省为空串 / 空数组。 */
export interface ProjectMemory {
  /** 主键，与 Project.id 一一对应。 */
  projectId: string
  intro: string
  stack: string[]
  architecture: string
  done: string[]
  progress: string
  openIssues: string[]
  resolvedIssues: string[]
  decisions: Decision[]
  nextSteps: string[]
  updatedAt: number
  /** 每次「确认更新」+1，用于历史对比。 */
  version: number
  source: 'manual' | 'draft' | 'ai'
}

/** 记忆草稿：AI 或「从日志生成」的产物，**必须用户确认后才写主文档**。 */
export interface MemoryDraft {
  projectId: string
  at: number
  source: 'ai' | 'logs'
  /** 建议写入的字段（只包含有变化的字段）。 */
  patch: Partial<Pick<ProjectMemory, 'intro' | 'stack' | 'architecture' | 'done' | 'progress' | 'openIssues' | 'resolvedIssues' | 'nextSteps' | 'decisions'>>
  /** 生成理由 / 依据，展示在确认界面。 */
  rationale: string
  /** 每条建议的文本，用户可逐条勾选采纳。 */
  items: Array<{ field: keyof MemoryDraft['patch']; text: string; accepted: boolean }>
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. 知识图谱（需求 3.1 / 3.3）
 * ──────────────────────────────────────────────────────────────────────────── */

export type KnowledgeStatus = 'todo' | 'learning' | 'learned' | 'review'

/** 0 = 完全不会，5 = 能讲给别人听。 */
export type Mastery = 0 | 1 | 2 | 3 | 4 | 5

export interface KnowledgeNode {
  id: string
  title: string
  summary?: string
  category?: string
  status: KnowledgeStatus
  mastery: Mastery
  /** 关联维度：项目 / 任务 / 日志 / 阻碍。全部只存 id，删除时由 knowledge.ts 级联清理。 */
  projectIds: string[]
  taskIds: string[]
  logIds: string[]
  frictionIds: string[]
  /** `ai` 表示由 AI 建议产生，可一键过滤。 */
  origin: 'manual' | 'ai'
  createdAt: number
  updatedAt: number
  lastReviewedAt?: number
  nextReviewAt?: number
  reviewCount: number
}

/** 边：`prereq` 表示 from 是 to 的前置（有向，禁止成环）；`related` 视为无向。 */
export interface KnowledgeEdge {
  id: string
  fromId: string
  toId: string
  kind: 'related' | 'prereq'
}

/** 整个图谱存成一个键，避免 nodes / edges 两次写入产生中间态。 */
export interface KnowledgeGraph {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. 间隔复习（需求 3.2）
 * ──────────────────────────────────────────────────────────────────────────── */

/** 四种复习形式：概念回忆 / 代码阅读 / 错误排查 / 应用场景。 */
export type ReviewForm = 'recall' | 'code' | 'debug' | 'scenario'

/** 0 忘了 / 1 模糊 / 2 记住 / 3 熟练。 */
export type ReviewGrade = 0 | 1 | 2 | 3

export interface ReviewRecord {
  id: string
  nodeId: string
  at: number
  form: ReviewForm
  grade: ReviewGrade
  note?: string
  /** 本次排期后的下次复习时间。 */
  nextAt: number
  intervalDays: number
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. 时间轴事件（需求 4.1）
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 事件白名单。
 *
 * 刻意只有这些 —— 时间轴一旦开始记录「任务改了个标题」这种噪声，就会退化成
 * 第二份日志，用户再也不会看。新增类型必须同时想清楚「它对回顾有没有价值」。
 */
export type BoardEventType =
  | 'project.created'
  | 'project.archived'
  | 'project.restored'
  | 'task.created'
  | 'task.completed'
  | 'task.reopened'
  | 'task.deleted'
  | 'focus.completed'
  | 'log.debug'
  | 'log.milestone'
  | 'friction.created'
  | 'friction.resolved'
  | 'memory.updated'
  | 'decision.added'
  | 'knowledge.learned'
  | 'knowledge.reviewed'
  | 'history.snapshot'

export interface TimelineEvent {
  id: string
  at: number
  type: BoardEventType
  projectId?: string
  /** 关联对象 id（任务 / 日志 / 阻碍 / 知识节点）。 */
  refId?: string
  /** 已经在写入时渲染好的短句，时间轴直接显示，不再二次查表。 */
  title: string
  detail?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. 历史快照（需求 4.2）
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 轻量历史快照：只存 **id 集合 + 计数 + 记忆摘要**。
 *
 * 为什么不存完整对象：存全量会让每个快照几百 KB，12 个快照就撑爆 localStorage；
 * 而「对比两个时间点」真正需要的只是集合差异与记忆文本。
 */
export interface HistorySnapshot {
  id: string
  projectId: string
  at: number
  label: string
  counts: {
    tasks: number
    done: number
    openFriction: number
    knowledgeLearned: number
  }
  taskDoneIds: string[]
  taskOpenIds: string[]
  openFrictionIds: string[]
  memoryVersion: number
  memoryDigest: {
    intro: string
    stack: string[]
    decisions: string[]
  }
}

/** 两个快照的差异（纯集合运算，不做任何推测）。 */
export interface HistoryDiff {
  from: HistorySnapshot
  to: HistorySnapshot
  addedTasks: number
  removedTasks: number
  completedTasks: string[]
  reopenedTasks: string[]
  addedFriction: number
  resolvedFriction: number
  addedDecisions: string[]
  removedDecisions: string[]
  memoryChanged: boolean
  memoryVersionDelta: number
  /** 一句话摘要，用于时间轴 / 回顾。 */
  summary: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. 日聚合（需求 5）
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 一天一行。
 *
 * **唯一职责**：让「年度热力图 / 周报」不必保留 400 条日志上限之外的历史。
 * 所有字段都是**真实事件的计数**，不做任何推算；没有 focus 记录就是 0。
 */
export interface DailyAggregate {
  /** `YYYY-MM-DD`（本地日历日）。 */
  day: string
  focusMinutes: number
  tasksDone: number
  sessions: number
  friction: number
}

/** 热力图色阶：0 = 无记录，1–4 由配置阈值决定。 */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4

/** 热力图一格。 */
export interface HeatmapDay {
  day: string
  /** 0–4；0 表示没有任何专注记录。 */
  level: HeatmapLevel
  minutes: number
  tasksDone: number
  /** 是否属于当前显示的年份（跨年周会出现相邻年份的格子，置灰不显示数字）。 */
  inYear: boolean
}

/** 热力图按周组织的列。 */
export interface HeatmapWeek {
  /** 该周周一的 dayKey。 */
  weekStart: string
  days: HeatmapDay[]
}

export interface HeatmapSummary {
  year: number
  totalMinutes: number
  /** 有专注记录的天数。 */
  activeDays: number
  tasksDone: number
  /** 最长连续学习天数（按 activeDays 计算，允许从今天/昨天回看）。 */
  longestStreak: number
  weeks: HeatmapWeek[]
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. AI 调用审计（需求 2.2）
 * ──────────────────────────────────────────────────────────────────────────── */

export type AiRunKind = 'daily' | 'weekly' | 'project' | 'memory' | 'knowledge'

export type AiErrorCode =
  | 'no-config'
  | 'network'
  | 'timeout'
  | 'bad-json'
  | 'rate-limit'
  | 'auth'
  | 'unknown'

export interface AiRun {
  id: string
  at: number
  kind: AiRunKind
  provider: 'local' | 'openai-compatible'
  model?: string
  ok: boolean
  errorCode?: AiErrorCode
  inputCharsApprox?: number
  outputChars?: number
  /** 是否降级到本地规则分析。 */
  fallbackUsed: boolean
}

/** AI 返回的诊断结构（本地降级也产出同样形状，UI 只认这一种）。 */
export interface CoachReport {
  kind: 'daily' | 'weekly'
  /** 生成时间。 */
  at: number
  /** `local` 表示规则分析，UI 必须显示这个来源。 */
  provider: 'local' | 'ai'
  /** 客观数据区（永远由本地计算，AI 不许改）。 */
  facts: {
    focusMinutes: number
    tasksDone: number
    sessions: number
    friction: number
    projects: Array<{ name: string; minutes: number }>
    overdue: number
  }
  /** 主观推断区（AI 或规则）：必须与 facts 分开渲染。 */
  insights: {
    headline: string
    achievements: string[]
    difficulties: string[]
    repeatedProblems: string[]
    reviewPoints: string[]
    nextActions: string[]
    /** 置信度说明：数据不足时明确写出来，不编造。 */
    confidence: 'high' | 'medium' | 'low'
    confidenceNote: string
  }
}
