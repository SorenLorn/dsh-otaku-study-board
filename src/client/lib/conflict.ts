/**
 * conflict.ts — 跨标签页冲突策略（阶段 2 · B2，策略 A：检测 + 用户确认）。
 *
 * ── 为什么不自动合并 ──────────────────────────────────────────────────────
 * 「字段级合并」需要每个实体都有可靠的 updatedAt 与三方合并规则，任何一条漏了
 * 就会静默丢数据。策略 A 的选择是：**发现冲突就停下来问人**，把决定权交给用户，
 * 这在个人本地工具里比「聪明地合并」更可靠。
 *
 * ── 什么算「未保存」──────────────────────────────────────────────────────
 * 不是「最近 2 秒写过」这种时间猜测，而是显式状态：
 *   • `dirty = true`  ← 用户刚改了值（update 调用）
 *   • `dirty = false` ← 该值成功写入 localStorage 之后
 * 如果写入失败（配额满），dirty 保持 true —— 这时远端变更**必须**弹冲突，
 * 否则用户的修改会被无声丢弃。
 *
 * ── 冲突生命周期 ─────────────────────────────────────────────────────────
 *   远端 storage 事件 + 本地 dirty  →  reportConflict(key, remoteRaw)
 *        → UI 显示「重新载入 / 保留本页」
 *        → reload：采用远端值；keep：把本页值重新写入（失败则提示并保留冲突）
 *   同一个键重复冲突会被合并，避免刷屏。
 */
import { pushNotice } from './bus'

export type ConflictAction = 'reload' | 'keep'

export interface ConflictEntry {
  key: string
  remoteRaw: string
  at: number
  /** 已经提示过用户（用于去重统计）。 */
  reported: number
}

/** 冲突决议事件：由 UI 派发，对应 key 的 useLocalStore 实例处理。 */
export const CONFLICT_EVENT = 'sorchron:conflict-resolve'

export interface ConflictResolution {
  key: string
  action: ConflictAction
}

/**
 * 纯决策函数（可单测）：
 *   本地有未保存修改 → 冲突；否则直接采用远端。
 */
export function decideRemoteChange(input: { dirty: boolean; remoteRaw: string | null; baseRaw: string | null }): 'apply' | 'conflict' {
  if (input.remoteRaw === null) return 'apply' // 远端删除：允许应用（清空）
  if (input.remoteRaw === input.baseRaw) return 'apply' // 内容一致，无需提示
  return input.dirty ? 'conflict' : 'apply'
}

let entries = new Map<string, ConflictEntry>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* 单个订阅者出错不影响其它订阅者 */
    }
  }
}

/** 登记一次冲突（同键合并，只更新远端值与次数）。 */
export function reportConflict(key: string, remoteRaw: string, now = Date.now()): void {
  const existing = entries.get(key)
  entries.set(key, {
    key,
    remoteRaw,
    at: now,
    reported: (existing?.reported ?? 0) + 1,
  })
  emit()
}

export function listConflicts(): ConflictEntry[] {
  return [...entries.values()].sort((a, b) => b.at - a.at)
}

export function getConflict(key: string): ConflictEntry | undefined {
  return entries.get(key)
}

export function resolveConflict(key: string): void {
  if (!entries.has(key)) return
  entries.delete(key)
  emit()
}

export function clearConflicts(): void {
  if (entries.size === 0) return
  entries.clear()
  emit()
}

export function subscribeConflicts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 派发决议（UI 调用；对应 key 的 store 实例会监听并执行）。 */
export function requestResolution(key: string, action: ConflictAction): void {
  try {
    window.dispatchEvent(new CustomEvent<ConflictResolution>(CONFLICT_EVENT, { detail: { key, action } }))
  } catch (error) {
    pushNotice('冲突处理失败：当前环境不支持事件派发', 'error')
    void error
  }
}

/** 监听决议；返回解绑函数。 */
export function onResolution(handler: (resolution: ConflictResolution) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<ConflictResolution>).detail
    if (detail === undefined || typeof detail.key !== 'string') return
    if (detail.action !== 'reload' && detail.action !== 'keep') return
    handler(detail)
  }
  window.addEventListener(CONFLICT_EVENT, listener)
  return () => window.removeEventListener(CONFLICT_EVENT, listener)
}
