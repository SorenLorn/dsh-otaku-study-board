/**
 * repo/local.ts — localStorage 实现（V4 新实体的唯一落盘处）。
 *
 * 三个设计点：
 *   1. **复用同一套信封与兜底**：读走 `unwrapEnvelope` + `coercePayload`，写走
 *      `wrapEnvelope`，和 V3 的 7 个键完全一致 —— 备份、迁移、脏数据清理全部通用。
 *   2. **无 window 时降级为内存**：Node / 测试环境没有 localStorage，这里用一个
 *      Map 顶着，让纯逻辑断言能跑（也让 SSR 不会炸）。
 *   3. **写入后广播**：复用 `STORE_EVENT`，与 `useLocalStore` 共用一个频道，所以
 *      「记忆页改一个字 → 时间轴卡片立即更新」不需要任何额外机制。
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
import { STORAGE_KEYS } from '../../types'
import { pushNotice, STORE_EVENT } from '../bus'
import { warn } from '../debug'
import { coercePayload, unwrapEnvelope, wrapEnvelope } from '../schema'
import type { BoardRepo } from './types'

/** 无 localStorage 时的内存兜底（进程内有效）。 */
const memoryStore = new Map<string, string>()

/**
 * 存储可用性三态。
 *
 *   有 window 且 localStorage 可用   → 'persistent'
 *   没有 window（Node / 测试 / SSR） → 'memory'      （降级是预期行为）
 *   有 window 但存储被禁用/抛错      → 'blocked'     （**不能**假装成功）
 *
 * 之前用 boolean 把后两种混在一起，导致隐私模式下写入只落在内存、却向 UI 返回
 * true —— 用户以为存住了（审计 B 项，静态确认）。
 */
type StorageMode = 'persistent' | 'memory' | 'blocked'

/**
 * 只读探测 + 缓存。
 *
 * 第一版用一个 setItem/removeItem 探针，带来两个真实问题（第二轮审计 NEW-01）：
 *   1. 配额满时探针写失败 → 被误判成「存储被禁用」→ 读路径退回内存 Map →
 *      **明明有数据却读出空**，用户以为看板被清空了；
 *   2. 每次读写都写一次探针键 → 触发其它标签页的 storage 事件（噪声与误解）。
 * 现在改成纯读探测（`length` + `getItem` 不产生写入），并缓存结果。
 */
let cachedMode: StorageMode | null = null

function detectMode(): StorageMode {
  if (typeof window === 'undefined') return 'memory'
  try {
    const storage = window.localStorage
    if (storage === undefined || storage === null) return 'blocked'
    // 只读访问：能读就说明 localStorage 可用；配额满不影响读。
    void storage.length
    void storage.getItem('__sorchron_probe__')
    return 'persistent'
  } catch {
    return 'blocked'
  }
}

function storageMode(): StorageMode {
  if (cachedMode === null) cachedMode = detectMode()
  return cachedMode
}

/** 测试 / 存储恢复后重新探测。 */
export function resetStorageModeCache(): void {
  cachedMode = null
  blockedNotified = false
}

let blockedNotified = false

/** 存储被禁用时提示一次，避免每次写入都弹。 */
function notifyBlocked(): void {
  if (blockedNotified) return
  blockedNotified = true
  pushNotice('浏览器禁用了本地存储，本次修改只在当前页面有效，刷新会丢失', 'error')
}

function readRaw(key: string): string | null {
  const mode = storageMode()
  if (mode !== 'persistent') {
    if (mode === 'blocked') notifyBlocked()
    return memoryStore.get(key) ?? null
  }
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    warn('repo', `read failed: ${key}`, error)
    return null
  }
}

function writeRaw(key: string, raw: string): boolean {
  const mode = storageMode()
  if (mode === 'blocked') {
    // 浏览器明确禁用存储：写内存保证当前会话可用，但必须如实报告失败。
    memoryStore.set(key, raw)
    broadcast(key, raw)
    notifyBlocked()
    return false
  }
  if (mode === 'memory') {
    memoryStore.set(key, raw)
    broadcast(key, raw)
    return true
  }
  try {
    // 值没变就不写、也不广播：避免「订阅 → 写入 → 广播」的回环（审计 B 项）。
    if (window.localStorage.getItem(key) === raw) return true
    window.localStorage.setItem(key, raw)
    broadcast(key, raw)
    return true
  } catch (error) {
    const name = typeof error === 'object' && error !== null ? (error as { name?: string }).name : ''
    // 配额满说明存储仍然可读，不能把模式改成 blocked（否则读路径会退回内存）。
    if (name === 'SecurityError' || name === 'NotAllowedError') cachedMode = 'blocked'
    warn('repo', `write failed: ${key}`, error)
    pushNotice(
      name === 'QuotaExceededError'
        ? '本地存储已满，本次修改没有保存；可以先导出备份再清理旧日志'
        : '本地存储写入失败，本次修改没有保存',
      'error',
    )
    return false
  }
}

function broadcast(key: string, raw: string): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key, raw } }))
  } catch {
    /* 无 CustomEvent 的环境（测试）—— 广播降级为无操作 */
  }
}

/** 读 + 拆信封 + 洗数据，任何异常都回退到 fallback。 */
function readTyped<T>(key: string, fallback: T): T {
  const raw = readRaw(key)
  if (raw === null || raw === '') return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    const { data } = unwrapEnvelope(parsed)
    const value = coercePayload(key as never, data)
    return (value === undefined || value === null ? fallback : value) as T
  } catch (error) {
    warn('repo', `corrupt payload: ${key}`, error)
    return fallback
  }
}

/** 写 + 套信封。 */
function writeTyped<T>(key: string, value: T): boolean {
  try {
    return writeRaw(key, JSON.stringify(wrapEnvelope(value)))
  } catch (error) {
    warn('repo', `serialize failed: ${key}`, error)
    return false
  }
}

/** localStorage 实现。 */
export function createLocalRepo(): BoardRepo {
  return {
    readMemory: () => readTyped<ProjectMemory[]>(STORAGE_KEYS.memory, []),
    writeMemory: list => writeTyped(STORAGE_KEYS.memory, list),

    readGraph: () => readTyped<KnowledgeGraph>(STORAGE_KEYS.knowledge, { nodes: [], edges: [] }),
    writeGraph: graph => writeTyped(STORAGE_KEYS.knowledge, graph),

    readReviews: () => readTyped<ReviewRecord[]>(STORAGE_KEYS.reviews, []),
    writeReviews: list => writeTyped(STORAGE_KEYS.reviews, list),

    readTimeline: () => readTyped<TimelineEvent[]>(STORAGE_KEYS.timeline, []),
    writeTimeline: list => writeTyped(STORAGE_KEYS.timeline, list),

    readHistory: () => readTyped<HistorySnapshot[]>(STORAGE_KEYS.history, []),
    writeHistory: list => writeTyped(STORAGE_KEYS.history, list),

    readDaily: () => readTyped<DailyAggregate[]>(STORAGE_KEYS.daily, []),
    writeDaily: list => writeTyped(STORAGE_KEYS.daily, list),

    readAiRuns: () => readTyped<AiRun[]>(STORAGE_KEYS.aiRuns, []),
    writeAiRuns: list => writeTyped(STORAGE_KEYS.aiRuns, list),

    rawRead: <T,>(key: string, fallback: T): T => readTyped<T>(key, fallback),
    rawWrite: <T,>(key: string, value: T): boolean => writeTyped<T>(key, value),
  }
}

/** 仅供测试：清空内存兜底（localStorage 环境无副作用）。 */
export function __resetMemoryStore(): void {
  memoryStore.clear()
}
