/**
 * review.ts — 间隔复习排期（V4，SM-2 的极简版）。
 *
 * ── 为什么不做「算法」 ────────────────────────────────────────────────────
 * 复习的价值在「按时想起来」，不在算法复杂度。四档自评 + 一个倍率已经能覆盖
 * 95% 的场景，再往上加 ease factor、lapse 计数，用户看不出差别，代码先复杂到
 * 难以验证。所以这里只有一个纯函数 `schedule()`：输入上次间隔和本次评分，
 * 输出下次间隔与掌握度。
 *
 * ── 与知识节点的关系 ──────────────────────────────────────────────────────
 *   review.ts  只算「什么时候再复习、掌握度变成几」
 *   knowledge.ts 负责把结果落到节点上（applyReviewResult）
 *   谁都不直接写存储。
 */
import type { KnowledgeNode, Mastery, ReviewForm, ReviewGrade, ReviewRecord } from '../types'
import { BOARD_CONFIG } from './config'
import { dayKey, startOfDay } from './time'

/** 评分 → 掌握度的增量。 */
const MASTERY_DELTA: Record<ReviewGrade, number> = { 0: -1, 1: 0, 2: 1, 3: 1 }

/** 评分 → 状态（0 退回学习中，其余按掌握度决定）。 */
function statusFor(grade: ReviewGrade, mastery: Mastery): KnowledgeNode['status'] {
  if (grade === 0) return 'learning'
  if (mastery >= 4) return 'learned'
  if (mastery >= 1) return 'learning'
  return 'todo'
}

export interface ScheduleInput {
  /** 上次间隔（天）；首次复习传 0。 */
  intervalDays: number
  /** 当前掌握度。 */
  mastery: Mastery
  grade: ReviewGrade
}

export interface ScheduleResult {
  intervalDays: number
  nextAt: number
  mastery: Mastery
  status: KnowledgeNode['status']
}

/**
 * 计算下一次复习。
 *
 * 规则（写死在代码里，也写在文档里，避免「算法黑箱」）：
 *   grade 0 忘了 → 明天再来，掌握度 -1
 *   grade 1 模糊 → 2 天后，掌握度不变
 *   grade 2 记住 → max(3, 上次 × 2) 天，掌握度 +1
 *   grade 3 熟练 → max(7, 上次 × 2.5) 天，掌握度 +1
 * 上限 180 天，掌握度夹在 0–5。
 */
export function schedule(input: ScheduleInput, now = Date.now()): ScheduleResult {
  const { grade } = input
  const base = Math.max(0, input.intervalDays)
  const config = BOARD_CONFIG.review

  let intervalDays: number
  if (grade === 0) intervalDays = config.intervals[0] ?? 1
  else if (grade === 1) intervalDays = config.intervals[1] ?? 2
  else if (grade === 2) intervalDays = Math.max(config.intervals[2] ?? 3, Math.round(base * (config.multipliers[2] ?? 2)))
  else intervalDays = Math.max(config.intervals[3] ?? 7, Math.round(base * (config.multipliers[3] ?? 2.5)))

  intervalDays = Math.min(config.maxIntervalDays, Math.max(1, intervalDays))
  const masteryRaw = input.mastery + (MASTERY_DELTA[grade] ?? 0)
  const mastery = Math.max(0, Math.min(5, masteryRaw)) as Mastery

  // 下次复习落在「当天 0 点 + N 天」，这样同一天多次复习不会漂移到奇怪的时间。
  const nextAt = startOfDay(now) + intervalDays * 86_400_000

  return { intervalDays, nextAt, mastery, status: statusFor(grade, mastery) }
}

/** 造一条复习记录（id 由调用方或这里生成均可）。 */
export function createReview(
  nodeId: string,
  form: ReviewForm,
  grade: ReviewGrade,
  scheduleResult: ScheduleResult,
  note?: string,
  now = Date.now(),
): ReviewRecord {
  const record: ReviewRecord = {
    id: `rv-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    nodeId,
    at: now,
    form,
    grade,
    nextAt: scheduleResult.nextAt,
    intervalDays: scheduleResult.intervalDays,
  }
  if (note !== undefined && note.trim() !== '') record.note = note.trim().slice(0, 400)
  return record
}

/**
 * 待复习队列。
 *
 * 排序：过期越久越靠前；同一过期程度下，掌握度低的优先（先把不会的补上）。
 * 只收 `nextReviewAt <= now` 的节点；没有排期的节点不算「待复习」。
 */
export function dueNodes(nodes: KnowledgeNode[], now = Date.now(), limit = BOARD_CONFIG.review.queueLimit): KnowledgeNode[] {
  return nodes
    // 手动标记「待复习」也是待复习：只认 nextReviewAt 会让这个状态变成死状态（审计 E1）。
    .filter(node => node.status === 'review' || (node.nextReviewAt !== undefined && node.nextReviewAt <= now))
    .sort((a, b) => {
      const overdueA = now - (a.nextReviewAt ?? now)
      const overdueB = now - (b.nextReviewAt ?? now)
      if (overdueA !== overdueB) return overdueB - overdueA
      return a.mastery - b.mastery
    })
    .slice(0, limit)
}

/**
 * 清理孤儿复习记录（节点已被删除）。
 *
 * 复习记录按 nodeId 挂，节点删除后记录不会自动消失。不清理的话统计里的
 * 「总复习次数 / 连续天数」会一直涨，但对应的知识已经不存在了（审计 E2）。
 *
 * @param validNodeIds - 当前图谱里还存在的节点 id
 * @returns 新数组与被清理的条数
 */
export function pruneReviews(
  reviews: ReviewRecord[],
  validNodeIds: Set<string>,
): { reviews: ReviewRecord[]; removed: number } {
  const kept = reviews.filter(record => validNodeIds.has(record.nodeId))
  return { reviews: kept, removed: reviews.length - kept.length }
}

/** 复习统计（面板顶部一行）。 */
export function reviewStats(
  reviews: ReviewRecord[],
  now = Date.now(),
): { total: number; today: number; week: number; avgGrade: number; streakDays: number } {
  const today = dayKey(now)
  const weekStart = now - 7 * 86_400_000
  let todayCount = 0
  let weekCount = 0
  let gradeSum = 0
  for (const record of reviews) {
    if (dayKey(record.at) === today) todayCount += 1
    if (record.at >= weekStart) weekCount += 1
    gradeSum += record.grade
  }

  // 连续复习天数：从今天（或昨天）往前数。
  const days = new Set(reviews.map(record => dayKey(record.at)))
  let streak = 0
  const cursor = new Date(startOfDay(now))
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (streak < 400 && days.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    total: reviews.length,
    today: todayCount,
    week: weekCount,
    avgGrade: reviews.length === 0 ? 0 : Math.round((gradeSum / reviews.length) * 10) / 10,
    streakDays: streak,
  }
}

/**
 * 复习形式轮换：同一个知识点连续复习时，不要总是「概念回忆」。
 * 规律：第 1 次回忆 → 第 2 次代码阅读 → 第 3 次错误排查 → 第 4 次应用场景 → 循环。
 */
export function suggestForm(reviewCount: number): ReviewForm {
  const order: ReviewForm[] = ['recall', 'code', 'debug', 'scenario']
  return order[Math.max(0, reviewCount) % order.length] ?? 'recall'
}
