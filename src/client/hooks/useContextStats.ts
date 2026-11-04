/**
 * useContextStats — 当前会话的上下文画像（需求 3.1）。
 *
 * 输入只有「已落库的日志摘要」，不碰 DSH 原始消息，所以这个 hook 天然满足
 * 「只做统计、不读取完整原文」。
 *
 * 两个用途：
 *   1. 面板展示：条数、token、构成占比、预警；
 *   2. 一键精简：生成「建议折叠多少条 + 一份可粘贴的摘要」，**不改宿主会话**。
 *
 * 会话选择顺序：`sessionId` 参数 → 最近一条日志的 sessionId → 今日全部日志。
 * 这样即使宿主没传 sessionId，面板也不是空的。
 */
import { useMemo } from 'react'
import type { ContextStats, SessionLog } from '../types'
import { STORAGE_KEYS } from '../types'
import { buildPrunePlan, analyzeContext, type PrunePlan } from '../lib/context'
import { dayKey } from '../lib/time'
import { useBoardSettings } from './useBoardSettings'
import { useLocalStore } from './useLocalStore'
import { createDefaultMeta } from '../lib/defaults'
import type { BoardMeta } from '../types'

export interface ContextInsight {
  /** 参与统计的日志（已按会话过滤）。 */
  logs: SessionLog[]
  stats: ContextStats
  plan: PrunePlan
  /** 面板标题里显示「哪个会话」。 */
  sessionLabel: string
  /** 上一次精简建议被采纳的时间（毫秒），没有则 undefined。 */
  lastPrunedAt: number | undefined
  /** 记录「这次精简建议被采纳了」（只写 meta，不动会话）。 */
  markPruned: () => void
}

export function useContextStats(
  allLogs: SessionLog[],
  sessionId?: string,
  now = Date.now(),
): ContextInsight {
  const { settings } = useBoardSettings()
  const [meta, setMeta] = useLocalStore<BoardMeta>(STORAGE_KEYS.meta, createDefaultMeta())

  const { logs, label } = useMemo(() => {
    const target = sessionId !== undefined && sessionId !== '' ? sessionId : pickLatestSession(allLogs)
    if (target === undefined) {
      // 没有任何 sessionId：退到「今天的日志」，仍然能给出数量级判断。
      const today = dayKey(now)
      return { logs: allLogs.filter(log => dayKey(log.at) === today), label: '今日全部会话' }
    }
    const scoped = allLogs.filter(log => log.sessionId === target)
    return { logs: scoped, label: `会话 ${target.slice(0, 12)}` }
  }, [allLogs, sessionId, now])

  const stats = useMemo(
    () =>
      analyzeContext(logs, {
        warnMessages: settings.contextWarnMessages,
        dangerMessages: settings.contextDangerMessages,
      }, now),
    [logs, settings.contextWarnMessages, settings.contextDangerMessages, now],
  )

  const plan = useMemo(() => buildPrunePlan(logs, now), [logs, now])

  const markPruned = () => {
    setMeta(previous => ({ ...previous, lastContextPruneAt: Date.now() }))
  }

  return { logs, stats, plan, sessionLabel: label, lastPrunedAt: meta.lastContextPruneAt, markPruned }
}

/** 最近一条带 sessionId 的日志的会话 id。 */
function pickLatestSession(logs: SessionLog[]): string | undefined {
  let latest: SessionLog | undefined
  for (const log of logs) {
    if (log.sessionId === undefined || log.sessionId === '') continue
    if (latest === undefined || log.at > latest.at) latest = log
  }
  return latest?.sessionId
}
