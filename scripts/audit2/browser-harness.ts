/**
 * browser-harness.ts — 浏览器测试用的最小暴露面（仅审计用，不进插件包）。
 *
 * 只暴露仓储的读写与事件计数，用来在真实 Chrome 里验证：
 *   写入 → 刷新 → 读取、配额满、存储被禁用、双标签页并发、事件次数。
 */
import { createLocalRepo, resetStorageModeCache } from '../../src/client/lib/repo/local'
import { STORE_EVENT } from '../../src/client/lib/bus'
import { STORAGE_KEYS } from '../../src/client/types'

const repo = createLocalRepo()
let customEvents = 0
let storageEvents = 0

window.addEventListener(STORE_EVENT, () => {
  customEvents += 1
})
window.addEventListener('storage', () => {
  storageEvents += 1
})

interface AuditApi {
  keys: typeof STORAGE_KEYS
  writeMemory: (intro: string) => boolean
  readMemory: () => Array<{ projectId: string; intro: string }>
  writeKey: (key: string, value: unknown) => boolean
  readKey: (key: string) => unknown
  clearAll: () => void
  counters: () => { custom: number; storage: number }
  resetCounters: () => void
  fillQuota: () => { filled: number; error: string }
  clearFillers: () => void
  resetStorageMode: () => void
}

const api: AuditApi = {
  keys: STORAGE_KEYS,
  writeMemory(intro: string): boolean {
    return repo.writeMemory([
      {
        projectId: 'p1',
        intro,
        stack: [],
        architecture: '',
        done: [],
        progress: '',
        openIssues: [],
        resolvedIssues: [],
        decisions: [],
        nextSteps: [],
        updatedAt: Date.now(),
        version: 1,
        source: 'manual',
      },
    ])
  },
  readMemory() {
    return repo.readMemory().map(item => ({ projectId: item.projectId, intro: item.intro }))
  },
  writeKey(key: string, value: unknown): boolean {
    return repo.rawWrite(key, value)
  },
  readKey(key: string) {
    return repo.rawRead(key, null)
  },
  clearAll(): void {
    for (const key of Object.values(STORAGE_KEYS)) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
  },
  counters() {
    return { custom: customEvents, storage: storageEvents }
  },
  resetCounters(): void {
    customEvents = 0
    storageEvents = 0
  },
  fillQuota() {
    let filled = 0
    let error = ''
    const chunk = 'x'.repeat(512 * 1024)
    try {
      for (;;) {
        window.localStorage.setItem(`__filler_${filled}`, chunk)
        filled += 1
        if (filled > 40) break
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.name : 'unknown'
    }
    return { filled, error }
  },
  clearFillers(): void {
    for (let index = 0; index < 60; index += 1) {
      try {
        window.localStorage.removeItem(`__filler_${index}`)
      } catch {
        /* ignore */
      }
    }
  },
  resetStorageMode(): void {
    resetStorageModeCache()
  },
}

;(window as unknown as { __audit: AuditApi }).__audit = api
