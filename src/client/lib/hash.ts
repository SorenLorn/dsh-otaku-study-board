/**
 * hash.ts — 内容指纹与去重窗口（需求 2.1.1「增加消息去重哈希」）。
 *
 * 为什么不用 crypto.subtle：它是异步的，而采集管线必须是同步的（防抖回调里不能
 * await，否则顺序会乱）。去重只需要「相同输入 → 相同输出、碰撞够低」，FNV-1a
 * 32 位足够，而且是纯函数、零依赖、极快。
 *
 * 这里**不存原文**：指纹只从「类型 + 归一化后的前 N 个字符」算出来，缓冲区里
 * 只留哈希和类型，用完即弃（隐私口径与 lib/detect.ts 一致）。
 */
import { BOARD_CONFIG } from './config'

/** FNV-1a 32 位，返回 8 位十六进制字符串。 */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    // hash *= 16777619，用移位避免大数精度问题
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 内容签名：只取归一化文本的**前 600 字符**参与哈希。
 *
 * 取前缀而不是全文，是为了让「同一句话后面追加了流式片段」也能命中同一条；
 * 而流式片段的中间态本来就该合并（配合防抖）。
 */
export function contentSignature(kind: string, text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 600)
  return `${kind}:${fnv1a(normalized)}`
}

/**
 * 去重窗口：一个定长环形缓冲，记 `${signature}@${timestamp}`。
 *
 * 为什么不用 Map：Map 需要定期清理才不涨；环形缓冲容量固定，天然有界，且
 * 「5 分钟窗口 + 200 条容量」在本地笔记本场景下完全够用。
 */
export interface DedupeWindow {
  /** @returns true = 这条是新的，可以继续；false = 命中重复，应丢弃 */
  admit(signature: string, now?: number): boolean
  /** 清空（关闭监听 / 卸载时调用）。 */
  clear(): void
  /** 当前缓冲里的条数（调试面板显示用）。 */
  size(): number
}

export function createDedupeWindow(
  windowMs = BOARD_CONFIG.capture.hashWindowMs,
  capacity = BOARD_CONFIG.capture.hashBufferSize,
): DedupeWindow {
  const ring: Array<{ signature: string; at: number }> = []

  return {
    admit(signature: string, now = Date.now()): boolean {
      try {
        // 从尾部往前扫：最近的命中概率最高。
        for (let index = ring.length - 1; index >= 0; index -= 1) {
          const item = ring[index]
          if (item === undefined) continue
          if (now - item.at > windowMs) break
          if (item.signature === signature) {
            // 命中后刷新时间戳：持续重复的内容应该一直被压住。
            item.at = now
            return false
          }
        }
        ring.push({ signature, at: now })
        if (ring.length > capacity) ring.splice(0, ring.length - capacity)
        return true
      } catch {
        // 去重本身出错时宁可放行，也不能把采集整条链路卡死。
        return true
      }
    },
    clear(): void {
      ring.length = 0
    },
    size(): number {
      return ring.length
    },
  }
}

/**
 * 文本相似度（0–1），用 bigram 重合度。
 *
 * 用于阻碍记录合并：同一类报错每次的堆栈行号不同，精确哈希对不上，但
 * 「Cannot read properties of undefined」这种主干是重合的。
 */
export function similarity(a: string, b: string): number {
  const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim()
  const left = normalize(a)
  const right = normalize(b)
  if (left === '' || right === '') return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0

  const grams = (text: string): Map<string, number> => {
    const map = new Map<string, number>()
    for (let index = 0; index < text.length - 1; index += 1) {
      const gram = text.slice(index, index + 2)
      map.set(gram, (map.get(gram) ?? 0) + 1)
    }
    return map
  }

  const leftGrams = grams(left)
  const rightGrams = grams(right)
  let overlap = 0
  let total = 0
  for (const [gram, count] of leftGrams) {
    total += count
    overlap += Math.min(count, rightGrams.get(gram) ?? 0)
  }
  for (const count of rightGrams.values()) total += count
  // total 是两边 gram 数之和，交集最多占一半，乘 2 归一化到 0–1。
  return total === 0 ? 0 : (2 * overlap) / total
}
