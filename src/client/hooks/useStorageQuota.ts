/**
 * useStorageQuota — 本地容量监控（需求 2.3.3）。
 *
 * 为什么值得单独做一个 hook：localStorage 写满时**不会**报错给用户看，只会让
 * `setItem` 抛一个 `QuotaExceededError`，而那时用户往往正在记一条重要的东西。
 * 与其等写入失败，不如在 80% 就提示「该清理旧日志了」。
 *
 * 口径：
 *   • 只统计本插件自己的 7 个 key，不把别人的数据算进来；
 *   • 字节数按 UTF-16 估算（`length * 2`）—— 浏览器配额也是按字符量算的，
 *     这个近似足够触发预警；
 *   • 配额按 5 MB 估（主流浏览器的默认值），可在 config 里改。
 */
import { useCallback, useEffect, useState } from 'react'
import { BOARD_CONFIG } from '../lib/config'
import { STORAGE_KEYS } from '../types'

/** 一个键的占用。 */
export interface KeyUsage {
  key: string
  label: string
  bytes: number
  /** 占本插件总用量的比例（0–1）。 */
  share: number
}

export type QuotaLevel = 'ok' | 'warn' | 'danger'

export interface StorageQuota {
  /** 本插件占用的总字节数。 */
  bytes: number
  /** 占浏览器配额的比例（0–1）。 */
  ratio: number
  level: QuotaLevel
  /** 一句人话。 */
  detail: string
  breakdown: KeyUsage[]
  /** 手动重算（导入 / 清空之后调用）。 */
  refresh: () => void
}

const LABELS: Record<string, string> = {
  [STORAGE_KEYS.tasks]: '任务',
  [STORAGE_KEYS.logs]: '会话日志',
  [STORAGE_KEYS.projects]: '项目',
  [STORAGE_KEYS.settings]: '设置',
  [STORAGE_KEYS.timer]: '计时',
  [STORAGE_KEYS.friction]: '阻碍记录',
  [STORAGE_KEYS.meta]: '运行状态',
}

/** 读一次占用（纯同步，任何异常都退化为 0）。 */
export function measureStorage(): { bytes: number; breakdown: KeyUsage[] } {
  const breakdown: KeyUsage[] = []
  let total = 0
  for (const key of Object.values(STORAGE_KEYS)) {
    let bytes = 0
    try {
      const raw = window.localStorage.getItem(key)
      // UTF-16：每字符 2 字节。
      if (raw !== null) bytes = raw.length * 2
    } catch {
      bytes = 0
    }
    total += bytes
    breakdown.push({ key, label: LABELS[key] ?? key, bytes, share: 0 })
  }
  return {
    bytes: total,
    breakdown: breakdown
      .map(item => ({ ...item, share: total === 0 ? 0 : item.bytes / total }))
      .sort((a, b) => b.bytes - a.bytes),
  }
}

/** `123456` → `120.6 KB`。 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function levelOf(ratio: number): QuotaLevel {
  if (ratio >= BOARD_CONFIG.storage.dangerRatio) return 'danger'
  if (ratio >= BOARD_CONFIG.storage.warnRatio) return 'warn'
  return 'ok'
}

function detailOf(level: QuotaLevel, bytes: number, ratio: number): string {
  const size = formatBytes(bytes)
  const percent = Math.round(ratio * 100)
  if (level === 'danger') return `已用 ${size}（约 ${percent}%），再写就可能失败：先导出备份再清理旧日志`
  if (level === 'warn') return `已用 ${size}（约 ${percent}%），建议清理三个月前的日志`
  return `已用 ${size}（约 ${percent}%）`
}

/**
 * 监听容量变化。
 *
 * @param refreshKey - 传一个「数据变了」的信号（通常是 tasks.length + logs.length），
 *                     变了就重算；不传则只靠定时器与 storage 事件。
 */
export function useStorageQuota(refreshKey?: string | number): StorageQuota {
  const [state, setState] = useState(() => {
    try {
      return measureStorage()
    } catch {
      return { bytes: 0, breakdown: [] }
    }
  })

  const refresh = useCallback(() => {
    try {
      setState(measureStorage())
    } catch {
      /* 读不到就当 0，不影响页面 */
    }
  }, [])

  // 数据变化时重算（依赖 key 由调用方给）。
  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  // 定时兜底 + 跨标签变化。
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setInterval(refresh, 15_000)
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key.startsWith('dsh-otaku-study-board')) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  const ratio = Math.min(1, state.bytes / BOARD_CONFIG.storage.assumeQuotaBytes)
  const level = levelOf(ratio)

  return {
    bytes: state.bytes,
    ratio,
    level,
    detail: detailOf(level, state.bytes, ratio),
    breakdown: state.breakdown,
    refresh,
  }
}
