/**
 * useLocalStore — 唯一的持久化通道（V2 加固版）。
 *
 * 这一版在原有 API 上加了四层防护，调用方一行都不用改：
 *
 *   1. **版本信封**：写入 `{ schemaVersion, data }`，读取同时兼容 V1 的裸数组
 *      （`lib/schema.ts` 的 `unwrapEnvelope`）。旧数据照常读，不会被拒绝。
 *   2. **字段级兜底**：读回来的每一条都过 `coercePayload`，缺字段、类型错、超界
 *      一律夹取，读到的永远是组件敢直接用的形状。
 *   3. **全程 try/catch**：`getItem` 可能因为隐私模式抛错，`JSON.parse` 可能因为
 *      半截数据抛错，`setItem` 可能因为超限抛错 —— 三种都在这里被吃掉，降级成
 *      「用空数据 + 一条角落提示」，绝不让异常冒到 React 渲染里（场景 1 / 10）。
 *   4. **不主动改写旧数据**：只有用户真的动了数据（setValue / reset）才写回新格式。
 *      打开看板这一步不会重写存储，所以回退到 V1 也不会读到半迁移的状态。
 *
 * 同页同步仍然走自定义事件，跨标签页仍然走 `storage`，行为与 V1 一致。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { pushNotice, STORE_EVENT } from '../lib/bus'
import { decideRemoteChange, getConflict, onResolution, reportConflict, resolveConflict } from '../lib/conflict'
import { coercePayload, unwrapEnvelope, wrapEnvelope } from '../lib/schema'
import type { StorageKey } from '../types'

/** Either a new value or an updater, exactly like `setState`. */
export type LocalStoreUpdater<T> = T | ((previous: T) => T)

/** `[value, setValue, reset]`. */
export type LocalStoreTuple<T> = [T, (next: LocalStoreUpdater<T>) => void, () => void]

/** 每个 key 的同类问题只提示一次，避免渲染循环里刷屏。 */
const reported = new Set<string>()

/** 存储键 → 用户看得懂的名字。 */
const KEY_LABELS: Record<string, string> = {
  'dsh-otaku-study-board:tasks': '任务',
  'dsh-otaku-study-board:logs': '会话日志',
  'dsh-otaku-study-board:projects': '项目',
  'dsh-otaku-study-board:settings': '设置',
  'dsh-otaku-study-board:timer': '计时状态',
  'dsh-otaku-study-board:friction': '阻碍记录',
  'dsh-otaku-study-board:meta': '运行状态',
}

function labelOf(key: string): string {
  return KEY_LABELS[key] ?? '本地数据'
}

/** 只在第一次遇到该 key 的该类问题时提示。 */
function reportOnce(key: string, kind: string, message: string, level: 'warn' | 'error' = 'warn'): void {
  const token = `${key}:${kind}`
  if (reported.has(token)) return
  reported.add(token)
  pushNotice(message, level)
}

/** 判断是不是「存储空间满了」这一类错误。 */
function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
  if (candidate.name === 'QuotaExceededError' || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  if (candidate.code === 22) return true
  return typeof candidate.message === 'string' && /quota|exceeded/i.test(candidate.message)
}

/**
 * Generate a stable id for tasks / logs / projects.
 * @param prefix - short namespace, e.g. `task`
 */
export function createId(prefix = 'osb'): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    /* older engines / insecure contexts: fall through */
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 一次安全读取的结果。 */
export interface ReadResult<T> {
  value: T
  /** 存储里原本那条记录（用于避免挂载时无意义的回写）。 */
  raw: string | null
  /** 数据损坏、已回退到默认值。 */
  recovered: boolean
  /** 是否是从 V1 裸数据读出来的。 */
  legacy: boolean
}

/**
 * 安全读取一个键：解析 → 拆信封 → 洗数据，任一步失败都回退到 `fallback`。
 *
 * @param key - 存储键
 * @param fallback - 读不出来时用的值
 * @param coerce - 自定义洗数据函数；默认按 key 走 `coercePayload`
 */
export function readStoreEnvelope<T>(
  key: string,
  fallback: T,
  coerce?: (data: unknown) => T,
): ReadResult<T> {
  if (typeof window === 'undefined') return { value: fallback, raw: null, recovered: false, legacy: false }

  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch (error) {
    // 隐私模式 / 存储被策略禁用：整块降级为内存态。
    reportOnce(key, 'unavailable', `无法访问本地存储（${labelOf(key)}），本次修改不会被保存`, 'error')
    void error
    return { value: fallback, raw: null, recovered: true, legacy: false }
  }

  if (raw === null || raw === '') return { value: fallback, raw: null, recovered: false, legacy: false }

  try {
    const parsed: unknown = JSON.parse(raw)
    const { data, legacy } = unwrapEnvelope(parsed)
    const mapper = coerce ?? ((input: unknown) => coercePayload(key as StorageKey, input) as T)
    const value = mapper(data)
    if (value === undefined || value === null) {
      return { value: fallback, raw, recovered: true, legacy }
    }
    return { value, raw, recovered: false, legacy }
  } catch (error) {
    // JSON 截断 / 手改成非 JSON / 迁移函数自己抛错 —— 全部在这里收口。
    reportOnce(
      key,
      'corrupt',
      `本地${labelOf(key)}已损坏，已用空数据重新开始（原值保留在存储里待排查）`,
      'error',
    )
    void error
    return { value: fallback, raw: null, recovered: true, legacy: false }
  }
}

/**
 * Read and parse one key (带兜底，不带版本信息)。
 * @param key - storage key
 * @param fallback - returned when the key is missing or unreadable
 */
export function readStore<T>(key: string, fallback: T): T {
  return readStoreEnvelope<T>(key, fallback).value
}

/**
 * Serialise and write one key，外层套版本信封，并广播给同页的其它持有者。
 *
 * @returns whether the write succeeded（失败时已经提示过用户）
 */
export function writeStore<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false

  let raw: string
  try {
    raw = JSON.stringify(wrapEnvelope(value))
  } catch (error) {
    reportOnce(key, 'serialize', `${labelOf(key)}包含无法保存的内容，本次修改已跳过`, 'error')
    void error
    return false
  }

  try {
    window.localStorage.setItem(key, raw)
  } catch (error) {
    reportOnce(
      key,
      isQuotaError(error) ? 'quota' : 'write',
      isQuotaError(error)
        ? '本地存储已满，本次修改没能保存。可以导出备份后清理旧日志'
        : `写入${labelOf(key)}失败，本次修改没能保存`,
      'error',
    )
    return false
  }

  emit(key, raw)
  return true
}

/** Broadcast a committed raw value to every holder on this page. */
function emit(key: string, raw: string): void {
  try {
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key, raw } }))
  } catch {
    /* no CustomEvent (very old engine) — cross-card updates degrade to remount */
  }
}

/** 从一次广播的原始 JSON 里安全取出值。 */
function parseBroadcast<T>(raw: string, key: string): T | undefined {
  try {
    const { data } = unwrapEnvelope(JSON.parse(raw) as unknown)
    return coercePayload(key as StorageKey, data) as T
  } catch {
    return undefined
  }
}

export interface UseLocalStoreOptions<T> {
  /** 自定义洗数据函数；默认按 key 走 `coercePayload`。 */
  coerce?: (data: unknown) => T
}

/**
 * Persisted state.
 *
 * @param key - storage key, ideally one of `STORAGE_KEYS`
 * @param initialValue - value used when the key is empty (read once)
 * @param options - 可选的自定义兜底函数
 * @returns `[value, setValue, reset]`
 */
export function useLocalStore<T>(
  key: string,
  initialValue: T,
  options?: UseLocalStoreOptions<T>,
): LocalStoreTuple<T> {
  const initialRef = useRef(initialValue)
  const coerceRef = useRef(options?.coerce)
  coerceRef.current = options?.coerce

  /** 首次读取只做一次；StrictMode 的重复渲染复用同一份结果。 */
  const firstRead = useRef<ReadResult<T> | null>(null)
  if (firstRead.current === null) {
    firstRead.current = readStoreEnvelope<T>(key, initialRef.current, coerceRef.current)
  }

  const [value, setValue] = useState<T>(firstRead.current.value)
  /** 已知与存储一致的原始 JSON；用来打断写 → 广播 → 写的回环。 */
  const rawRef = useRef<string | null>(firstRead.current.raw)
  /** 用户是否真的改过数据 —— 没改过就不回写，保证「打开页面不改存储」。 */
  const touchedRef = useRef(false)
  /** 是否存在**尚未成功写入**的修改（跨标签冲突的判断依据，不是时间窗口）。 */
  const dirtyRef = useRef(false)
  /** 最新值的镜像，供冲突决议回调读取。 */
  const valueRef = useRef(value)
  valueRef.current = value

  // Persist after every committed render of a new value.
  useEffect(() => {
    if (!touchedRef.current) return
    let raw: string
    try {
      raw = JSON.stringify(wrapEnvelope(value))
    } catch {
      return
    }
    if (raw === rawRef.current) return
    rawRef.current = raw
    // 写入失败时保持 dirty：下次远端变更必须弹冲突，不能静默丢掉用户改动。
    dirtyRef.current = !writeStore(key, value)
  }, [key, value])

  // Same-page sync: another card on this page wrote the same key.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onLocal = (event: Event): void => {
      const detail = (event as CustomEvent<{ key?: string; raw?: string }>).detail
      if (detail?.key !== key || typeof detail.raw !== 'string') return
      if (detail.raw === rawRef.current) return
      const next = parseBroadcast<T>(detail.raw, key)
      if (next === undefined) return
      rawRef.current = detail.raw
      setValue(next)
    }
    window.addEventListener(STORE_EVENT, onLocal)
    return () => {
      window.removeEventListener(STORE_EVENT, onLocal)
    }
  }, [key])

  // Cross-tab sync: another window wrote the same key.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return
      if (event.newValue === null) {
        rawRef.current = null
        setValue(initialRef.current)
        return
      }
      const decision = decideRemoteChange({
        dirty: dirtyRef.current,
        remoteRaw: event.newValue,
        baseRaw: rawRef.current,
      })
      if (decision === 'conflict') {
        // 不覆盖本地未保存的修改，交给用户决定（B2 策略 A）。
        reportConflict(key, event.newValue)
        return
      }
      const next = parseBroadcast<T>(event.newValue, key)
      if (next === undefined) return
      rawRef.current = event.newValue
      setValue(next)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [key])

  // 冲突决议：reload 采用远端，keep 重写本页（失败则保留冲突并提示）。
  useEffect(() => {
    return onResolution(({ key: target, action }) => {
      if (target !== key) return
      const entry = getConflict(key)
      if (entry === undefined) return
      if (action === 'reload') {
        const next = parseBroadcast<T>(entry.remoteRaw, key)
        if (next !== undefined) {
          rawRef.current = entry.remoteRaw
          setValue(next)
          dirtyRef.current = false
        }
        resolveConflict(key)
        return
      }
      touchedRef.current = true
      if (writeStore(key, valueRef.current)) {
        dirtyRef.current = false
        rawRef.current = JSON.stringify(wrapEnvelope(valueRef.current))
        resolveConflict(key)
      } else {
        pushNotice('保留本页失败：本地存储不可写，改动仍未保存', 'error')
      }
    })
  }, [key])

  /**
   * 写入策略：**动作发生时立即落盘**，effect 只做兜底。
   *
   * 为什么不能只依赖 `useEffect`：调用方常常在同一次事件里「写数据 + 卸载自己」。
   * 例如新建任务弹层提交后立刻关闭、抽屉里删除任务后关闭抽屉 —— 如果写入只发生在
   * 提交后的 effect 里，组件已经卸载，这次更新连同 effect 一起被丢掉，
   * 界面看起来成功了，存储里却没有（Phase 5.2 实测到的真实数据丢失）。
   *
   * 立即写入的额外好处：同页其它卡片通过 `STORE_EVENT` 同步，不需要等下一帧。
   * 写入失败时保留 dirty 标记，effect 会再试一次并给出提示。
   */
  const update = useCallback(
    (next: LocalStoreUpdater<T>) => {
      touchedRef.current = true
      const previous = valueRef.current
      const value = typeof next === 'function' ? (next as (p: T) => T)(previous) : next
      valueRef.current = value
      try {
        const raw = JSON.stringify(wrapEnvelope(value))
        const ok = writeStore(key, value)
        // 成功才认账；失败时保留旧的 rawRef，让 effect 再试一次并提示一次。
        if (ok) rawRef.current = raw
        dirtyRef.current = !ok
      } catch {
        // 序列化失败：交给 effect 里的 catch 统一报告，这里不吞掉状态更新。
        dirtyRef.current = true
      }
      setValue(value)
    },
    [key],
  )

  const reset = useCallback(() => {
    touchedRef.current = true
    setValue(initialRef.current)
    writeStore(key, initialRef.current)
  }, [key])

  return [value, update, reset]
}
