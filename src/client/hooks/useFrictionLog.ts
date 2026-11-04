/**
 * useFrictionLog — 开发阻碍记录（需求 3.4）。
 *
 * 数据流：
 *   useSessionCapture（认出 debug 类日志）
 *        → buildFrictionDraft（摘要，不含源码）
 *        → record()（相似度合并，同一类坑只留一条，hits+1）
 *        → localStorage `:friction`
 *
 * 为什么要合并而不是每条都记：一次调试过程中同一句报错可能出现十次，十行记录
 * 没有任何信息量；而「这个坑踩了十次」才是值得回看的信息 —— 尤其是解决方案
 * 填上去之后，它就是一条可复用的知识。
 */
import { useCallback, useMemo, useRef } from 'react'
import type { FrictionRecord } from '../types'
import { STORAGE_KEYS } from '../types'
import { mergeFriction, resolveFriction, removeFriction, frictionStats, type FrictionStats } from '../lib/friction'
import { debug } from '../lib/debug'
import { useLocalStore } from './useLocalStore'

export interface RecordFrictionResult {
  id: string
  merged: boolean
}

export interface FrictionApi {
  records: FrictionRecord[]
  stats: FrictionStats
  /** 写入一条（自动合并相似项）。返回 id 与是否合并。 */
  record: (draft: Omit<FrictionRecord, 'id'>) => RecordFrictionResult | undefined
  /** 填解决方案 / 标记解决。 */
  resolve: (id: string, solution: string) => void
  remove: (id: string) => void
  /** 批量删除已解决且超过 N 天的记录（清理用）。 */
  pruneResolved: (olderThanMs?: number) => number
}

export function useFrictionLog(): FrictionApi {
  const [records, setRecords] = useLocalStore<FrictionRecord[]>(STORAGE_KEYS.friction, [])

  /** 采集回调里读的是 ref，避免闭包里拿到旧的列表。 */
  const ref = useRef(records)
  ref.current = records

  const record = useCallback(
    (draft: Omit<FrictionRecord, 'id'>): RecordFrictionResult | undefined => {
      try {
        const outcome = mergeFriction(ref.current, draft)
        ref.current = outcome.records
        setRecords(outcome.records)
        debug('friction', `${outcome.merged ? 'merged into' : 'new record'} ${outcome.id}`, draft.summary)
        return { id: outcome.id, merged: outcome.merged }
      } catch {
        // 阻碍记录写失败不能影响主采集链路。
        return undefined
      }
    },
    [setRecords],
  )

  const resolve = useCallback(
    (id: string, solution: string) => {
      setRecords(previous => resolveFriction(previous, id, solution))
    },
    [setRecords],
  )

  const remove = useCallback(
    (id: string) => {
      setRecords(previous => removeFriction(previous, id))
    },
    [setRecords],
  )

  const pruneResolved = useCallback(
    (olderThanMs = 30 * 24 * 60 * 60 * 1000): number => {
      const cutoff = Date.now() - olderThanMs
      const before = ref.current.length
      const kept = ref.current.filter(item => !(item.resolved && item.updatedAt < cutoff))
      if (kept.length === before) return 0
      ref.current = kept
      setRecords(kept)
      return before - kept.length
    },
    [setRecords],
  )

  const stats = useMemo(() => frictionStats(records), [records])

  return { records, stats, record, resolve, remove, pruneResolved }
}
