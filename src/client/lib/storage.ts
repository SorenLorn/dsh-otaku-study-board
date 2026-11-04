/**
 * storage.ts — 存储状态探测（给设置页用的**真实**信号）。
 *
 * 为什么不直接在组件里读 localStorage：
 *   1. 组件要能跑在 jsdom / 宿主里，直接访问会散落 try-catch；
 *   2. 「能否写」这件事必须用一次真实写入来回答，不能靠猜；
 *   3. 探测必须是**显式动作**（按钮），否则每次渲染都写一个探针键，会触发
 *      其它标签页的 `storage` 事件，也会在配额告急时制造噪声。
 *
 * 与 `lib/repo/local.ts` 的三态保持一致（persistent / memory / blocked），
 * 但这里只做只读探测，不复用它的缓存，避免「缓存说 persistent、实际已满」的误导。
 */

export type StorageMode = 'persistent' | 'memory' | 'blocked'

export interface StorageStatus {
  mode: StorageMode
  label: string
  /** 是否具备写入能力的结构性判断；`false` 时不必再试。 */
  structurallyWritable: boolean
  detail: string
}

const PROBE_KEY = 'dsh-otaku-study-board:__write_probe__'

/** 只读探测：不产生任何写入。 */
export function storageStatus(): StorageStatus {
  if (typeof window === 'undefined') {
    return {
      mode: 'memory',
      label: '内存模式',
      structurallyWritable: false,
      detail: '当前环境没有 localStorage（测试 / SSR），数据只存在于内存。',
    }
  }
  try {
    const storage = window.localStorage
    if (storage === undefined || storage === null) {
      return {
        mode: 'blocked',
        label: '被禁用',
        structurallyWritable: false,
        detail: '浏览器没有提供 localStorage，数据无法持久化。',
      }
    }
    // 只读访问：能读就说明接口可用；配额满不会让读失败。
    void storage.length
    void storage.getItem(PROBE_KEY)
    return {
      mode: 'persistent',
      label: '可持久化',
      structurallyWritable: true,
      detail: '数据保存在本机 localStorage；清理浏览器数据会一并删除。',
    }
  } catch {
    return {
      mode: 'blocked',
      label: '被禁用',
      structurallyWritable: false,
      detail: '浏览器拒绝访问 localStorage（可能是隐私模式或站点设置）。',
    }
  }
}

/**
 * 真实写一次再删掉，回答「现在能不能写」。
 *
 * @returns `true` 写入成功；`false` 存储不可用或配额已满
 */
export function probeWritable(): boolean {
  if (typeof window === 'undefined') return false
  const key = `${PROBE_KEY}:${Date.now().toString(36)}`
  try {
    window.localStorage.setItem(key, '1')
    window.localStorage.removeItem(key)
    return true
  } catch {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* 删不掉也没关系，键只有 1 字节 */
    }
    return false
  }
}

export interface OriginEstimate {
  /** 整个站点已用字节（含宿主与其它插件）。 */
  usage: number
  /** 浏览器给出的站点配额。 */
  quota: number
}

/**
 * 浏览器提供的**站点级**用量（不是本插件用量）。
 *
 * 必须单独标注口径：这个数字包含 DSH 宿主与其它插件，不能当作本插件的剩余空间。
 * 浏览器不支持时返回 `null`，UI 显示「浏览器不提供」。
 */
export async function readOriginEstimate(): Promise<OriginEstimate | null> {
  try {
    if (typeof navigator === 'undefined' || navigator.storage === undefined) return null
    if (typeof navigator.storage.estimate !== 'function') return null
    const result = await navigator.storage.estimate()
    if (typeof result.usage !== 'number' || typeof result.quota !== 'number') return null
    if (!Number.isFinite(result.usage) || !Number.isFinite(result.quota) || result.quota <= 0) return null
    return { usage: result.usage, quota: result.quota }
  } catch {
    return null
  }
}
