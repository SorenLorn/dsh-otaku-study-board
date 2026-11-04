/**
 * useBackup — 备份的三个原子操作（V3 精简版 + Phase 5.3 增强）。
 *
 * 本文件只做「不带 UI 的部分」：
 *   • `prepareExport` —— 组装 + 序列化 + 统计字节数（不触发下载），供设置页显示
 *     「文件大小 / 导出时间」，也让测试可以在不点浏览器下载的情况下验证内容；
 *   • `exportAll` —— `prepareExport` + 下载，失败如实返回 false；
 *   • `clearAll` —— 一次事务清空 14 个键，失败回滚并返回真实结果。
 *
 * Phase 5.3 的两处必要修正（详见 reports/PHASE-5.3-PRE-IMPLEMENTATION-AUDIT.md）：
 *   1. 原来的 `clearAll` 只清 7 个键，memory / knowledge / reviews / timeline /
 *      history / daily 会残留；而且逐个 `writeStore` 没有回滚。
 *   2. 导出原来只有布尔结果，无法展示大小与时间。
 *
 * 备份格式、合并语义、键名全部未改。
 */
import { useCallback } from 'react'
import type { BackupPayload, BackupScope, BoardMeta, DailyAggregate, HistorySnapshot, KnowledgeGraph, ProjectMemory, ReviewRecord, SessionLog, TimelineEvent, FrictionRecord, Task } from '../types'
import { STORAGE_KEYS } from '../types'
import { buildBackup, downloadText, serializeBackup, backupFileName, filterByScope } from '../lib/backup'
import { createDefaultMeta, createDefaultSettings, createDefaultTimerState } from '../lib/defaults'
import { info, warn } from '../lib/debug'
import { writeStore } from './useLocalStore'
import { useBoardData } from './useBoardData'
import { useBoardSettings } from './useBoardSettings'
import { getRepo } from '../lib/repo'
import { createBrowserStore, writeTransaction } from '../lib/tx'

export interface BackupOutcome {
  ok: boolean
  message: string
}

/** 导出的可测结果：文件内容、字节数、各实体条数。 */
export interface PreparedExport {
  ok: true
  payload: BackupPayload
  text: string
  fileName: string
  /** UTF-8 字节数（与下载文件大小一致；取不到编码器时退回字符数）。 */
  bytes: number
  scope: BackupScope
  generatedAt: number
  counts: {
    tasks: number
    logs: number
    projects: number
    friction: number
    memory: number
    knowledge: number
    reviews: number
    timeline: number
    history: number
    daily: number
  }
}

export interface BackupApi {
  /** 组装导出内容，不下载（设置页用来展示大小 / 时间 / 条数）。 */
  prepareExport: (scope?: BackupScope) => PreparedExport | { ok: false; message: string }
  /** 全量 / 增量导出并触发下载。 */
  exportAll: (scope?: BackupScope) => BackupOutcome
  /** 事务清空所有本地键（含 V4 实体），失败回滚。 */
  clearAll: () => BackupOutcome
}

/** 与下载文件一致的字节数（UTF-8）；没有 TextEncoder 时退回字符数并明确近似。 */
function byteLength(text: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length
  } catch {
    /* fall through */
  }
  return text.length
}

export function useBackup(): BackupApi {
  const board = useBoardData()
  const { settings } = useBoardSettings()

  const prepareExport = useCallback(
    (scope: BackupScope = 'all'): PreparedExport | { ok: false; message: string } => {
      try {
        const repo = getRepo()
        const filtered = filterByScope(
          {
            tasks: board.allTasks,
            logs: board.allLogs,
            friction: board.allFriction,
            projects: board.projects,
            memory: repo.readMemory(),
            knowledge: repo.readGraph(),
            reviews: repo.readReviews(),
            timeline: repo.readTimeline(),
            history: repo.readHistory(),
            daily: repo.readDaily(),
          },
          scope,
        )
        const payload = buildBackup({
          tasks: filtered.tasks,
          logs: filtered.logs,
          // 全量导出保留归档项目：归档不等于删除，恢复时也要能还原。
          projects: scope === 'all' ? board.projects : board.projects.filter(item => !item.archived),
          settings,
          friction: filtered.friction,
          meta: board.meta,
          scope,
          memory: filtered.memory ?? [],
          knowledge: filtered.knowledge ?? { nodes: [], edges: [] },
          reviews: filtered.reviews ?? [],
          timeline: filtered.timeline ?? [],
          history: filtered.history ?? [],
          daily: filtered.daily ?? [],
        })
        const text = serializeBackup(payload)
        return {
          ok: true,
          payload,
          text,
          fileName: backupFileName(scope),
          bytes: byteLength(text),
          scope,
          generatedAt: payload.exportedAt,
          counts: {
            tasks: filtered.tasks.length,
            logs: filtered.logs.length,
            projects: payload.projects.length,
            friction: filtered.friction.length,
            memory: filtered.memory?.length ?? 0,
            knowledge: filtered.knowledge?.nodes.length ?? 0,
            reviews: filtered.reviews?.length ?? 0,
            timeline: filtered.timeline?.length ?? 0,
            history: filtered.history?.length ?? 0,
            daily: filtered.daily?.length ?? 0,
          },
        }
      } catch (error) {
        warn('backup', 'prepare export failed', error)
        return { ok: false, message: '导出准备失败，详见控制台' }
      }
    },
    [board.allTasks, board.allLogs, board.allFriction, board.projects, board.meta, settings],
  )

  const exportAll = useCallback(
    (scope: BackupScope = 'all'): BackupOutcome => {
      const prepared = prepareExport(scope)
      if (!prepared.ok) return { ok: false, message: prepared.message }
      const ok = downloadText(prepared.fileName, prepared.text)
      info('backup', `export ${scope}${ok ? '' : ' failed'}`)
      return {
        ok,
        message: ok
          ? `已导出 ${prepared.counts.tasks} 个任务、${prepared.counts.logs} 条日志（${Math.round(prepared.bytes / 1024)} KB）`
          : '导出失败：浏览器拒绝了下载',
      }
    },
    [prepareExport],
  )

  const clearAll = useCallback((): BackupOutcome => {
    const entries = [
      { key: STORAGE_KEYS.tasks, value: [] as Task[] },
      { key: STORAGE_KEYS.logs, value: [] as SessionLog[] },
      { key: STORAGE_KEYS.projects, value: [] },
      { key: STORAGE_KEYS.friction, value: [] as FrictionRecord[] },
      { key: STORAGE_KEYS.meta, value: createDefaultMeta() as BoardMeta },
      { key: STORAGE_KEYS.settings, value: createDefaultSettings() },
      { key: STORAGE_KEYS.timer, value: createDefaultTimerState() },
      { key: STORAGE_KEYS.memory, value: [] as ProjectMemory[] },
      { key: STORAGE_KEYS.knowledge, value: { nodes: [], edges: [] } as KnowledgeGraph },
      { key: STORAGE_KEYS.reviews, value: [] as ReviewRecord[] },
      { key: STORAGE_KEYS.timeline, value: [] as TimelineEvent[] },
      { key: STORAGE_KEYS.history, value: [] as HistorySnapshot[] },
      { key: STORAGE_KEYS.daily, value: [] as DailyAggregate[] },
      { key: STORAGE_KEYS.aiRuns, value: [] },
    ]

    const store = createBrowserStore()
    if (store === undefined) {
      // 无 window（Node / 测试）：逐键写，仍然返回真实结果。
      const ok = entries.every(entry => writeStore(entry.key, entry.value))
      info('backup', `clear all${ok ? '' : ' (partial)'}`)
      return {
        ok,
        message: ok ? '已清空本机所有看板数据' : '部分数据写入失败（存储可能已满），请重试',
      }
    }

    const result = writeTransaction(store, entries)
    if (!result.ok) {
      const why = result.error === 'serialize' ? '数据无法序列化' : `写入「${result.failedKey ?? '未知键'}」失败`
      warn('backup', `clear all failed: ${why} (restored=${String(result.restored)})`)
      return {
        ok: false,
        message: result.restored
          ? `清空已中止（${why}），原有数据已回滚`
          : `清空中止且回滚失败（${why}），数据可能不一致：请立刻导出备份`,
      }
    }
    info('backup', `clear all: ${entries.length} keys`)
    return { ok: true, message: `已清空本机所有看板数据（${entries.length} 个键）` }
  }, [])

  return { prepareExport, exportAll, clearAll }
}
