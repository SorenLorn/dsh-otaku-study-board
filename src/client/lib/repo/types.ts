/**
 * repo/types.ts — V4 数据访问层接口（需求 §七.2）。
 *
 * ── 为什么只给新实体做 Repository ──────────────────────────────────────────
 * 现有 7 个键已经跑在 `useLocalStore` 上 —— 它本身就是「版本信封 + 逐字段兜底 +
 * 跨标签同步 + 写入广播」的仓储实现，跑了一年没出过问题。把 V3 的读写全改成
 * repo 只会制造大面积回归，收益是零。
 *
 * 所以 V4 的策略是**局部抽象**：新实体（记忆/知识/复习/时间轴/历史/日聚合/AI 审计）
 * 从第一天就走接口，未来要换 IndexedDB 只需要换 `local.ts`，组件与 hooks 一行不动。
 */
import type {
  AiRun,
  DailyAggregate,
  HistorySnapshot,
  KnowledgeGraph,
  ProjectMemory,
  ReviewRecord,
  TimelineEvent,
} from '../../types'

/** 所有读写都是同步的 —— 与现有 localStorage 模型保持一致，组件不必处理 loading。 */
export interface BoardRepo {
  /* 记忆 */
  readMemory(): ProjectMemory[]
  writeMemory(list: ProjectMemory[]): boolean

  /* 知识图谱（单对象，避免 nodes/edges 两次写入的中间态） */
  readGraph(): KnowledgeGraph
  writeGraph(graph: KnowledgeGraph): boolean

  /* 复习 */
  readReviews(): ReviewRecord[]
  writeReviews(list: ReviewRecord[]): boolean

  /* 时间轴 */
  readTimeline(): TimelineEvent[]
  writeTimeline(list: TimelineEvent[]): boolean

  /* 历史快照 */
  readHistory(): HistorySnapshot[]
  writeHistory(list: HistorySnapshot[]): boolean

  /* 日聚合 */
  readDaily(): DailyAggregate[]
  writeDaily(list: DailyAggregate[]): boolean

  /* AI 审计 */
  readAiRuns(): AiRun[]
  writeAiRuns(list: AiRun[]): boolean

  /** 底层读（调试面板 / 测试用），已过 coerce。 */
  rawRead<T>(key: string, fallback: T): T
  /** 底层写（调试面板 / 测试用）。 */
  rawWrite<T>(key: string, value: T): boolean
}
