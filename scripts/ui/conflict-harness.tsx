/**
 * conflict-harness.tsx — 供真实 Chrome 双标签页测试使用的 React 页面。
 *
 * 只使用**生产代码**：`useLocalStore`（含冲突逻辑）、`ConflictHost`、`writeTransaction`。
 * 不是模拟实现。测试键单独命名，避免污染真实实体。
 */
import { createRoot } from 'react-dom/client'
import { useRef } from 'react'
import { useLocalStore } from '../../src/client/hooks/useLocalStore'
import { ConflictHost } from '../../src/client/ui/ConflictHost'
import { NoticeHost } from '../../src/client/ui/NoticeHost'
import { getNotices } from '../../src/client/lib/bus'
import { listConflicts, clearConflicts } from '../../src/client/lib/conflict'
import { createBrowserStore, writeTransaction } from '../../src/client/lib/tx'

const KEY = 'dsh-otaku-study-board:__conflict_probe'

let setter: ((n: number) => void) | null = null
let current = 0
let originalSetItem: Storage['setItem'] | null = null

function patchStorage(fail: boolean): void {
  const proto = Object.getPrototypeOf(window.localStorage) as Storage
  if (originalSetItem === null) originalSetItem = proto.setItem
  proto.setItem = function patched(key: string, value: string): void {
    if (fail && key === KEY) {
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }
    originalSetItem!.call(this, key, value)
  }
}

function App(): unknown {
  const [value, setValue] = useLocalStore<{ n: number }>(KEY, { n: 0 }, {
    coerce: data => (typeof data === 'object' && data !== null ? (data as { n: number }) : { n: 0 }),
  })
  const setRef = useRef(setValue)
  setRef.current = setValue
  setter = (n: number) => setRef.current({ n })
  current = value.n

  return (
    <div>
      <div id="state">{value.n}</div>
      <button type="button" onClick={() => setter?.(value.n + 1)}>
        inc
      </button>
      <ConflictHost />
      <NoticeHost />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

;(window as unknown as { __t: unknown }).__t = {
  state: () => current,
  raw: () => window.localStorage.getItem(KEY),
  write: (n: number) => {
    setter?.(n)
    return true
  },
  fail: (on: boolean) => {
    patchStorage(on)
    return true
  },
  conflicts: () => listConflicts().length,
  clearConflicts: () => clearConflicts(),
  notices: () => getNotices().map(item => item.text),
  click: (text: string) => {
    const buttons = [...document.querySelectorAll('button')]
    const target = buttons.find(button => (button.textContent ?? '').includes(text))
    if (target === undefined) return false
    ;(target as HTMLButtonElement).click()
    return true
  },
  bulk: () => {
    const store = createBrowserStore()
    if (store === undefined) return false
    return writeTransaction(store, [
      { key: KEY, value: { n: 100 } },
      { key: `${KEY}:2`, value: { n: 1 } },
    ])
  },
}
