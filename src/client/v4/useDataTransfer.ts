/**
 * v4/useDataTransfer.ts — 导入的完整状态机（读取 → 预览 → 写入 → 结果）。
 *
 * 只做「把 lib/backup 与 lib/tx 串起来 + 维护 UI 状态」，不重写合并逻辑：
 *   • 解析与校验：`parseBackup`
 *   • 冲突预览：`previewImport`
 *   • 合并 / 覆盖：`applyImport`
 *   • 落盘：`writeTransaction`（12 个键一次写，失败逆序回滚）
 *
 * 三条纪律：
 *   1. 预览阶段**一个字节都不写**；
 *   2. 写入阶段任何失败都必须把真实原因交给 UI（含「回滚失败」这种最坏情况）；
 *   3. 不伪造进度百分比：只有 reading / preview / importing / done / error 五个阶段。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { BackupPayload, ImportMode, ImportPreview, BackupScope } from '../types'
import { STORAGE_KEYS } from '../types'
import {
  MAX_IMPORT_CHARS,
  applyImport,
  parseBackup,
  previewImport,
  readFileAsText,
  type ImportReport,
} from '../lib/backup'
import { buildImportSnapshot } from '../lib/actions'
import { pruneSnapshots } from '../lib/history'
import { createBrowserStore, writeTransaction } from '../lib/tx'
import { getRepo } from '../lib/repo'
import { warn } from '../lib/debug'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { writeStore } from '../hooks/useLocalStore'

export type TransferPhase = 'idle' | 'reading' | 'preview' | 'importing' | 'done' | 'error'

export interface ImportCounts {
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

export interface ImportSource {
  fileName: string
  /** 文件在本机的字节数（不是字符数）。 */
  sizeBytes: number
  /** 文件自带的 version；0 = 未标注。 */
  version: number
  exportedAt: number
  scope?: BackupScope
  counts: ImportCounts
  dropped: ImportReport['dropped']
  droppedTotal: number
  /** 记忆草稿条数（存在 meta 里，不在主数据里）。 */
  draftCount: number
}

export interface ImportResult {
  ok: boolean
  title: string
  detail: string
  at: number
}

export interface DataTransferApi {
  phase: TransferPhase
  source: ImportSource | null
  preview: ImportPreview | null
  mode: ImportMode
  error: string
  result: ImportResult | null
  /** 读取并校验；不写存储。 */
  pick: (file: File | undefined) => Promise<void>
  setMode: (mode: ImportMode) => void
  /** 真正写库。 */
  commit: () => Promise<void>
  /** 丢弃当前预览（不写任何东西）。 */
  discard: () => void
  /** 清掉结果 / 错误，回到初始。 */
  reset: () => void
}

function countsOf(payload: BackupPayload): ImportCounts {
  return {
    tasks: payload.tasks.length,
    logs: payload.logs.length,
    projects: payload.projects.length,
    friction: payload.friction.length,
    memory: payload.memory?.length ?? 0,
    knowledge: payload.knowledge?.nodes.length ?? 0,
    reviews: payload.reviews?.length ?? 0,
    timeline: payload.timeline?.length ?? 0,
    history: payload.history?.length ?? 0,
    daily: payload.daily?.length ?? 0,
  }
}

export function useDataTransfer(): DataTransferApi {
  const board = useBoardData()
  const { settings } = useBoardSettings()
  const [phase, setPhase] = useState<TransferPhase>('idle')
  const [source, setSource] = useState<ImportSource | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mode, setModeState] = useState<ImportMode>('merge')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  /** 解析后的 payload 与报告：预览与写入都读它，避免重复解析。 */
  const parsedRef = useRef<{ payload: BackupPayload; report: ImportReport } | null>(null)

  const localSnapshot = useMemo(
    () => ({
      tasks: board.allTasks,
      logs: board.allLogs,
      projects: board.projects,
      friction: board.allFriction,
    }),
    [board.allTasks, board.allLogs, board.projects, board.allFriction],
  )

  const pick = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (file === undefined) return
      setPhase('reading')
      setError('')
      setResult(null)
      try {
        // 先按字节挡一次：读取整份超大字串会直接卡住页面。
        if (file.size > MAX_IMPORT_CHARS * 2) {
          const mb = (file.size / 1024 / 1024).toFixed(1)
          setPhase('error')
          setError(`文件过大（${mb} MB），上限约 ${MAX_IMPORT_CHARS / 1024 / 1024} MB 文本`)
          return
        }
        const text = await readFileAsText(file)
        const parsed = parseBackup(text)
        if (!parsed.ok) {
          setPhase('error')
          setError(parsed.error)
          return
        }
        const payload = parsed.payload
        parsedRef.current = { payload, report: parsed.report }
        const counts = countsOf(payload)
        const droppedTotal = Object.values(parsed.report.dropped).reduce((sum, value) => sum + value, 0)
        setSource({
          fileName: file.name === '' ? '未命名备份.json' : file.name,
          sizeBytes: file.size,
          version: parsed.report.sourceVersion,
          exportedAt: payload.exportedAt,
          ...(payload.scope === undefined ? {} : { scope: payload.scope }),
          counts,
          dropped: parsed.report.dropped,
          droppedTotal,
          draftCount: Object.keys(payload.meta.memoryDrafts ?? {}).length,
        })
        setPreview(previewImport(localSnapshot, payload, mode))
        setPhase('preview')
      } catch (caught) {
        warn('backup', 'read import file failed', caught)
        setPhase('error')
        setError('读取文件失败：文件可能已被移动，或浏览器拒绝访问')
      }
    },
    [localSnapshot, mode],
  )

  const setMode = useCallback((next: ImportMode): void => {
    setModeState(next)
    const parsed = parsedRef.current
    if (parsed !== null) setPreview(previewImport(localSnapshot, parsed.payload, next))
  }, [localSnapshot])

  const commit = useCallback(async (): Promise<void> => {
    const parsed = parsedRef.current
    if (parsed === null) return
    setPhase('importing')
    setError('')
    // 让浏览器先画一帧「写入中」，否则大文件会看起来像卡死。
    await new Promise(resolve => setTimeout(resolve, 0))
    try {
      const repo = getRepo()
      const merged = applyImport(
        {
          ...localSnapshot,
          settings,
          meta: board.meta,
          memory: repo.readMemory(),
          knowledge: repo.readGraph(),
          reviews: repo.readReviews(),
          timeline: repo.readTimeline(),
          history: repo.readHistory(),
          daily: repo.readDaily(),
        },
        parsed.payload,
        mode,
      )

      // 导入成功后追加一条历史快照；放进同一次事务，避免「导入成功但快照写失败」的中间态。
      let history = merged.history ?? []
      const project = board.activeProject
      if (project !== undefined) {
        const snapshot = buildImportSnapshot({
          project,
          tasks: merged.tasks,
          friction: merged.friction,
          ...(merged.memory?.[0] === undefined ? {} : { memory: merged.memory[0] }),
        })
        history = pruneSnapshots([...history, snapshot])
      }

      const entries = [
        { key: STORAGE_KEYS.tasks, value: merged.tasks },
        { key: STORAGE_KEYS.logs, value: merged.logs },
        { key: STORAGE_KEYS.projects, value: merged.projects },
        { key: STORAGE_KEYS.friction, value: merged.friction },
        { key: STORAGE_KEYS.meta, value: merged.meta },
        { key: STORAGE_KEYS.settings, value: merged.settings },
        { key: STORAGE_KEYS.memory, value: merged.memory ?? [] },
        { key: STORAGE_KEYS.knowledge, value: merged.knowledge ?? { nodes: [], edges: [] } },
        { key: STORAGE_KEYS.reviews, value: merged.reviews ?? [] },
        { key: STORAGE_KEYS.timeline, value: merged.timeline ?? [] },
        { key: STORAGE_KEYS.history, value: history },
        { key: STORAGE_KEYS.daily, value: merged.daily ?? [] },
      ]

      const store = createBrowserStore()
      if (store === undefined) {
        // 无 window：逐键写，仍然逐个检查结果；任何失败都如实回报。
        const failed = entries.find(entry => !writeStore(entry.key, entry.value))
        if (failed !== undefined) {
          setPhase('error')
          setError(`导入失败：写入「${failed.key}」未成功，数据可能只写入了一部分，请立刻导出备份`)
          return
        }
      } else {
        const tx = writeTransaction(store, entries)
        if (!tx.ok) {
          const why = tx.error === 'serialize' ? '数据无法序列化' : `写入「${tx.failedKey ?? '未知键'}」失败`
          setPhase('error')
          setError(
            tx.restored
              ? `导入已中止（${why}），原有数据已回滚，可以重试`
              : `导入中止且回滚失败（${why}）：数据可能不一致，请立刻导出备份`,
          )
          return
        }
      }

      const counts: ImportCounts = {
        tasks: merged.tasks.length,
        logs: merged.logs.length,
        projects: merged.projects.length,
        friction: merged.friction.length,
        memory: merged.memory?.length ?? 0,
        knowledge: merged.knowledge?.nodes.length ?? 0,
        reviews: merged.reviews?.length ?? 0,
        timeline: merged.timeline?.length ?? 0,
        history: history.length,
        daily: merged.daily?.length ?? 0,
      }
      setResult({
        ok: true,
        title: mode === 'overwrite' ? '覆盖导入完成' : '合并导入完成',
        detail: `${counts.tasks} 个任务 / ${counts.logs} 条日志 / ${counts.projects} 个项目 / ${counts.memory} 份记忆 / ${counts.knowledge} 个知识点`,
        at: Date.now(),
      })
      setPhase('done')
      setPreview(null)
      setSource(null)
      parsedRef.current = null
    } catch (caught) {
      warn('backup', 'import commit failed', caught)
      setPhase('error')
      setError('导入过程出现意外错误，未写入任何数据；详见控制台')
    }
  }, [board.activeProject, board.meta, localSnapshot, mode, settings])

  return {
    phase,
    source,
    preview,
    mode,
    error,
    result,
    pick,
    setMode,
    commit,
    discard: () => {
      parsedRef.current = null
      setSource(null)
      setPreview(null)
      setPhase('idle')
      setError('')
    },
    reset: () => {
      parsedRef.current = null
      setSource(null)
      setPreview(null)
      setResult(null)
      setError('')
      setPhase('idle')
    },
  }
}
