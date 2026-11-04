/**
 * 输入与数值校验 —— 所有用户输入、所有从存储读回的数字都从这里过一遍。
 *
 * 设计原则：**夹取（clamp）而不是抛错**。
 * 看板是一个笔记本，不是编译器；用户把时长输成 `abc` 时最合理的行为是恢复到上
 * 一个合法值并给一句提示，而不是让 React 渲染出一个 `NaN:NaN` 的计时器。
 *
 * 场景对照（见 TESTING.md 场景 10）：
 *   • 非法时长 `abc` / `-5` / `1e9` → 被夹到 10–90 或回退到原值
 *   • 空白任务标题 → 拒绝创建，不产生空行
 *   • 目标输入 `999999999999` → 夹到上限
 */

import {
  MAX_GOAL_MINUTES,
  MAX_GOAL_TASKS,
  MAX_MINUTES,
  MAX_SUBTASK_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
} from './defaults'
import { BOARD_CONFIG } from './config'

/** 是否是一个可用的有限数字。 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 把任意值夹到 `[min, max]`。
 * @param value - 任意输入
 * @param min - 下界
 * @param max - 上界
 * @param fallback - 无法解析成数字时用的值
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

/** 取整并夹取，用于「分钟 / 条数」这类必须为整数的字段。 */
export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback))
}

/** 计时时长专用夹取（10–90 分钟）。 */
export function clampDurationMinutes(value: unknown, fallback = 25): number {
  return clampInteger(value, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES, fallback)
}

/** 单轮专注分钟数的夹取（用于累加进任务的脏数据保护）。 */
export function clampFocusMinutes(value: unknown): number {
  return clampInteger(value, 0, MAX_MINUTES, 0)
}

/** 月度目标：非负、有上限。 */
export function clampGoalMinutes(value: unknown, fallback = 0): number {
  return clampInteger(value, 0, MAX_GOAL_MINUTES, fallback)
}

export function clampGoalTasks(value: unknown, fallback = 0): number {
  return clampInteger(value, 0, MAX_GOAL_TASKS, fallback)
}

/** 文本是否可以参与业务（非空白）。 */
export function isBlankText(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/**
 * 是否是合法的 `YYYY-MM`。
 *
 * 只挡形状不够：`2026-13` 也符合 `\d{4}-\d{2}`，但它会让「目标未设为本月」的
 * 判断永远成立。月份必须落在 01–12。
 */
export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** 去掉首尾空白并截断到上限；非字符串返回空串。 */
export function sanitizeTitle(value: unknown, max = MAX_TITLE_LENGTH): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

/** 备注 / 详情：保留换行，只做长度裁剪。 */
export function sanitizeText(value: unknown, max = 4000): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

/**
 * 解析输入框里的字符串数字。
 * @returns 合法整数，或 `null`（调用方据此决定「恢复原值 + 提示」）
 */
export function parseIntegerInput(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  // 只接受纯数字（允许前导 +/-, 但负数会在区间校验时被拒）
  if (!/^[+-]?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/* ────────────────────────────────────────────────────────────────────────────
 * V3 新增
 * ──────────────────────────────────────────────────────────────────────────── */

/** 休息时长夹取（1–30 分钟）。 */
export function clampBreakMinutes(value: unknown, fallback = 5): number {
  return clampInteger(value, BOARD_CONFIG.timer.minBreakMinutes, BOARD_CONFIG.timer.maxBreakMinutes, fallback)
}

/** 子任务标题：与任务标题同一套清洗，只是上限更短。 */
export function sanitizeSubtask(value: unknown): string {
  return sanitizeTitle(value, MAX_SUBTASK_LENGTH)
}

/**
 * 截止时间夹取。
 *
 * 规则：`0` / 负数 / 非数字 / 明显荒谬（1970 年前、+100 年后）一律视为「不设截止」，
 * 返回 `undefined`。这样 `task.dueAt === undefined` 是唯一的「无截止」表示，
 * 避免出现 `0` 和 `undefined` 两种语义。
 */
export function clampDueAt(value: unknown, now = Date.now()): number | undefined {
  if (!isFiniteNumber(value) || value <= 0) return undefined
  const floor = Date.UTC(2000, 0, 1)
  const ceiling = now + 100 * 365 * 24 * 60 * 60 * 1000
  if (value < floor || value > ceiling) return undefined
  return Math.round(value)
}

/** 进度比例（0–1），NaN 归零。 */
export function clampRatio(value: unknown): number {
  return clampNumber(value, 0, 1, 0)
}
