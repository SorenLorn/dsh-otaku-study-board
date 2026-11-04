/**
 * 挂载自检：确认 V2 改完之后「左导航 + 独立页面」的注册链路没有被碰坏。
 *
 * 不渲染 React（宿主才会渲染），只做三件事：
 *   1. 用 `window.__ModuleLoader__` 的手交接住 client 产物；
 *   2. 用假的 `ctx.slots` 调用 apply()，记录每一次 register / inject；
 *   3. 断言：main 面板 + sidebar.panellist 行用的是同一个 id，且样式表已注入。
 *
 * 跑法：node scripts/register-check.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

const registrations = []
const injected = []
const styleTags = []

const styleTag = { dataset: {}, textContent: '', remove() {} }

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  crypto: { randomUUID: () => 'uuid-0000' },
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  },
  document: {
    head: { appendChild: tag => styleTags.push(tag) },
    querySelector: () => null,
    createElement: () => styleTag,
    body: { appendChild() {}, removeChild() {} },
  },
  localStorage: {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null
    },
    setItem(key, value) {
      this.store.set(key, String(value))
    },
    removeItem(key) {
      this.store.delete(key)
    },
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setInterval: () => 0,
  clearInterval() {},
}

sandbox.window = sandbox
sandbox.globalThis = sandbox

const requireShim = (id) => {
  if (id === 'react') {
    return {
      useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect() {},
      useLayoutEffect() {},
      useRef: initial => ({ current: initial ?? null }),
      useMemo: factory => factory(),
      useCallback: fn => fn,
      memo: component => component,
      createContext: () => ({ Provider: {}, Consumer: {} }),
      useContext: () => null,
      createElement: () => null,
      Fragment: {},
    }
  }
  if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: {} }
  if (id === 'react-dom') return { createPortal: () => null }
  throw new Error(`unexpected require: ${id}`)
}

let exportsRef = null
sandbox.__ModuleLoader__ = {
  load({ id, factory }) {
    exportsRef = factory(requireShim)
  },
}

vm.createContext(sandbox)
vm.runInContext(bundle, sandbox, { filename: 'client.js' })

let passed = 0
let failed = 0
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}`, detail ?? '')
  }
}

check('bundle 通过 __ModuleLoader__ 交出模块', exportsRef !== null)
check('模块名一致', exportsRef?.name === 'dsh-otaku-study-board', exportsRef?.name)
check('声明 inject = ["slots"]', JSON.stringify(exportsRef?.inject) === '["slots"]', exportsRef?.inject)
check('apply 是函数', typeof exportsRef?.apply === 'function')

const ctx = {
  slots: {
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
    inject(name, factory) {
      injected.push(name)
      return factory()
    },
  },
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  get: () => undefined,
}

try {
  exportsRef.apply(ctx)
} catch (error) {
  console.log('  FAIL  apply threw:', error)
  process.exitCode = 1
}

const mainReg = registrations.find(item => item.options.name === 'main')
const rowReg = registrations.find(item => item.options.name === 'sidebar.panellist')

check('注册了 main 面板', mainReg !== undefined)
check('注册了 sidebar.panellist 行', rowReg !== undefined)
check('两侧共用同一个 id', mainReg?.options.key === rowReg?.options.id, {
  key: mainReg?.options.key,
  id: rowReg?.options.id,
})
check('id 仍是 dsh-otaku-study-board', mainReg?.options.key === 'dsh-otaku-study-board')
check('order = 20', rowReg?.options.order === 20, rowReg?.options.order)
check('导航行标题函数可用', typeof rowReg?.options.label === 'function' && rowReg.options.label() === '溯时学习工作台')
check('图标组件可调用', typeof rowReg?.component === 'function' && rowReg.component({ size: 16 }) !== undefined)
check('样式表已注入', styleTags.length === 1 && styleTags[0].textContent.includes('.osb-page'))
check('注入了 slots 依赖', injected.includes('main') && injected.includes('sidebar.panellist'), injected)

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`)
if (failed > 0) process.exitCode = 1
