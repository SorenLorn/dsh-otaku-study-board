/**
 * tx.ts — 导入的「全写或回滚」事务（第二轮审计 NEW-05）。
 *
 * 问题：备份导入要写 12 个键，逐个 `setItem`。如果第 7 个因为配额失败，前 6 个
 * 已经落盘 —— 用户得到一份**半新半旧**的数据，而且原来的数据已经被覆盖，无法恢复。
 *
 * 做法（不引入任何依赖）：
 *   1. **先序列化全部条目**：任何一条序列化失败就整体放弃，一个字节都不写；
 *   2. 记录每个键写入前的原始值；
 *   3. 逐条写入，任何一条失败 → 把已写的键**按原值回滚**（原来没有就删除）；
 *   4. 回滚本身也可能失败（空间真满），此时如实返回 `restored: false`，由 UI 明确
 *      告诉用户「数据可能处于中间状态，请立即导出备份」。
 *
 * 局限（必须说清楚）：localStorage 没有真正的事务，回滚也可能失败；这个模块能保证
 * 的是「失败时尽力恢复 + 绝不谎报成功」，而不是 ACID。
 */
import { STORE_EVENT } from './bus'
import { wrapEnvelope } from './schema'

/** 最小存储接口，便于在 Node 里用假实现测试。 */
export interface RawStore {
  readRaw(key: string): string | null
  writeRaw(key: string, raw: string): boolean
  removeRaw(key: string): boolean
}

export interface TxEntry {
  key: string
  value: unknown
}

export interface TxResult {
  ok: boolean
  /** 第一个写入失败的键。 */
  failedKey?: string
  /** 回滚是否全部成功；`ok=false` 且 `restored=false` 表示数据可能不一致。 */
  restored: boolean
  written: number
  error?: 'serialize' | 'write'
}

/**
 * 在一个事务里写入多个键。
 *
 * @param store - 底层存储
 * @param entries - 要写入的键值（值会被套上 `{ schemaVersion, data }` 信封）
 */
export function writeTransaction(store: RawStore, entries: TxEntry[]): TxResult {
  // 1) 先全部序列化：这一步失败不会产生任何副作用。
  const prepared: Array<{ key: string; raw: string; previous: string | null }> = []
  for (const entry of entries) {
    let raw: string
    try {
      raw = JSON.stringify(wrapEnvelope(entry.value))
    } catch {
      return { ok: false, restored: true, written: 0, error: 'serialize', failedKey: entry.key }
    }
    prepared.push({ key: entry.key, raw, previous: store.readRaw(entry.key) })
  }

  // 2) 逐条写入。
  const done: Array<{ key: string; previous: string | null }> = []
  for (const item of prepared) {
    if (store.writeRaw(item.key, item.raw)) {
      done.push({ key: item.key, previous: item.previous })
      continue
    }
    // 3) 失败 → 逆序回滚。
    const restored = rollback(store, done)
    return { ok: false, failedKey: item.key, restored, written: done.length, error: 'write' }
  }

  return { ok: true, restored: true, written: prepared.length }
}

/** 逆序回滚：后写的先恢复，尽量回到「写入前」的状态。 */
function rollback(store: RawStore, done: Array<{ key: string; previous: string | null }>): boolean {
  let ok = true
  for (let index = done.length - 1; index >= 0; index -= 1) {
    const item = done[index]
    if (item === undefined) continue
    const restored = item.previous === null ? store.removeRaw(item.key) : store.writeRaw(item.key, item.previous)
    if (!restored) ok = false
  }
  return ok
}

/**
 * 浏览器存储适配器。
 *
 * @returns `undefined` 表示没有 window（Node / 测试），调用方应走内存路径。
 */
export function createBrowserStore(): RawStore | undefined {
  if (typeof window === 'undefined') return undefined
  return {
    readRaw(key: string): string | null {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    writeRaw(key: string, raw: string): boolean {
      try {
        window.localStorage.setItem(key, raw)
        broadcast(key, raw)
        return true
      } catch {
        return false
      }
    },
    removeRaw(key: string): boolean {
      try {
        window.localStorage.removeItem(key)
        broadcast(key, '')
        return true
      } catch {
        return false
      }
    },
  }
}

function broadcast(key: string, raw: string): void {
  try {
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key, raw } }))
  } catch {
    /* 无 CustomEvent：界面靠下一次挂载读取 */
  }
}

/**
 * 仅测试：内存版 RawStore。
 *
 * @param failAtWrite - **只让这一次**写入失败（模拟瞬时失败，回滚可成功）。
 *   如果要模拟「配额一直满」，传 `alwaysFailAfter`。
 * @param alwaysFailAfter - 达到这个次数后**所有**写入都失败（模拟持久性故障，
 *   此时回滚也会失败，调用方必须看到 `restored:false`）。
 */
export function createFakeStore(
  initial: Record<string, string> = {},
  failAtWrite?: number,
  alwaysFailAfter?: number,
): RawStore & {
  dump(): Record<string, string>
  writes: number
} {
  const map = new Map(Object.entries(initial))
  let writes = 0
  return {
    get writes() {
      return writes
    },
    readRaw: (key: string) => map.get(key) ?? null,
    writeRaw: (key: string, raw: string) => {
      writes += 1
      if (alwaysFailAfter !== undefined && writes >= alwaysFailAfter) return false
      if (failAtWrite !== undefined && writes === failAtWrite) return false
      map.set(key, raw)
      return true
    },
    removeRaw: (key: string) => map.delete(key),
    dump: () => Object.fromEntries(map.entries()),
  }
}
