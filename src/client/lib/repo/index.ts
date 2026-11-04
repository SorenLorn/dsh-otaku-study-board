/**
 * repo/index.ts — 仓储单例。
 *
 * 为什么是单例而不是 Context：仓储本身无状态（每次读写都直接落在 localStorage），
 * 用 Context 只会让 hooks 多一层 provider 依赖，对换实现毫无帮助。将来若要换
 * IndexedDB，在这里改一行 `createLocalRepo()` → `createIdbRepo()` 即可。
 *
 * hooks 里请用 `getRepo()`，不要在组件里 new —— 那是 V3 之前就定下的规矩。
 */
import type { BoardRepo } from './types'
import { createLocalRepo } from './local'

let repo: BoardRepo | null = null

/** 取仓储实例（首次调用时创建）。 */
export function getRepo(): BoardRepo {
  if (repo === null) repo = createLocalRepo()
  return repo
}

/** 仅供测试 / 调试面板：替换实现。 */
export function setRepo(next: BoardRepo | null): void {
  repo = next
}

export type { BoardRepo } from './types'
