/**
 * browser-test.mjs — 用本机 Chrome + CDP 做真实浏览器存储测试（第二轮审计 U-02）。
 *
 * 不依赖 Playwright：Node 22 自带 fetch 与 WebSocket，直接跟 DevTools Protocol 说话。
 *
 * 跑法（先构建 harness）：
 *   ESBUILD_BINARY_PATH=<esbuild.exe> npx esbuild scripts/audit2/browser-harness.ts \
 *     --bundle --platform=browser --format=iife --outfile=$TEMP/audit/harness.js
 *   node scripts/audit2/browser-test.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(dirname(HERE))
const DIR = join(tmpdir(), 'sorchron-audit')
const PORT = 8765
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DEBUG_PORT = 9333

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
}

/* ---------- 静态服务器 ---------- */
await mkdir(DIR, { recursive: true })
const harness = await readFile(join(DIR, 'harness.js'), 'utf8')
const HTML = '<!doctype html><meta charset="utf-8"><title>audit</title><script src="/harness.js"></script>'
const server = createServer((req, res) => {
  if (req.url === '/harness.js') {
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
    res.end(harness)
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(HTML)
})
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve))

/* ---------- 启动 Chrome ---------- */
const profile = join(DIR, 'profile')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      if (response.ok) return await response.json()
    } catch {
      /* not ready */
    }
    await sleep(250)
  }
  throw new Error('Chrome 调试端口没有就绪')
}

/* ---------- 极简 CDP 客户端 ---------- */
class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 10_000)
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    }
    return result.result.value
  }
}

async function newTarget(url, initScript) {
  const created = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  const target = await created.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')
  if (initScript !== undefined) {
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript })
    await session.send('Page.reload', { ignoreCache: true })
  }
  await waitReady(session)
  return { session, targetId: target.id }
}

async function waitReady(session) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const ready = await session.evaluate('return Boolean(window.__audit)')
      if (ready === true) return
    } catch {
      /* 页面还在加载 */
    }
    await sleep(100)
  }
  throw new Error('harness 没有加载')
}

let exitCode = 0
try {
  await waitForDevtools()
  const url = `http://127.0.0.1:${PORT}/`

  /* ── T1 正常读写 ── */
  const tabA = await newTarget(url)
  await tabA.session.evaluate("__audit.clearAll(); __audit.resetCounters(); return true")
  const wrote = await tabA.session.evaluate("return __audit.writeMemory('v1')")
  const read = await tabA.session.evaluate('return __audit.readMemory()')
  record('T1 正常写入返回 true', wrote === true, wrote)
  record('T1 读回内容一致', read?.[0]?.intro === 'v1', read)

  /* ── T2 刷新后持久化 ── */
  await tabA.session.send('Page.reload', { ignoreCache: false })
  await waitReady(tabA.session)
  const afterReload = await tabA.session.evaluate('return __audit.readMemory()')
  record('T2 刷新后数据仍在', afterReload?.[0]?.intro === 'v1', afterReload)

  /* ── T3 配额耗尽：读仍可用、写如实失败、清理后恢复 ── */
  await tabA.session.evaluate("__audit.clearAll(); __audit.writeMemory('before'); return true")
  const filled = await tabA.session.evaluate('return __audit.fillQuota()')
  const readWhenFull = await tabA.session.evaluate('return __audit.readMemory()')
  // 等长覆盖在配额满时仍可能成功（浏览器先释放旧值），所以用「写入 1MB 新数据」来触发失败。
  const writeWhenFull = await tabA.session.evaluate("return __audit.writeMemory('z'.repeat(1024 * 1024))")
  record('T3 配额满时仍能读到已有数据', readWhenFull?.[0]?.intro === 'before', readWhenFull)
  record('T3 配额满时写入大值返回 false', writeWhenFull === false, writeWhenFull)
  const unchanged = await tabA.session.evaluate('return __audit.readMemory()')
  record('T3 写入失败没有破坏原值', unchanged?.[0]?.intro === 'before', unchanged)
  await tabA.session.evaluate('__audit.clearFillers(); return true')
  const writeAfterClean = await tabA.session.evaluate("return __audit.writeMemory('after')")
  record('T3 清理后写入恢复', writeAfterClean === true, writeAfterClean)
  record('T3 填充过程确实触发配额错误', filled?.error === 'QuotaExceededError', filled)

  /* ── T4 双标签页：跨标签读取 + 事件计数 ── */
  const tabB = await newTarget(url)
  await tabA.session.evaluate("__audit.writeMemory('from-A'); return true")
  const bSees = await tabB.session.evaluate('return __audit.readMemory()')
  record('T4 标签页 B 能读到 A 的写入', bSees?.[0]?.intro === 'from-A', bSees)

  await tabA.session.evaluate('__audit.resetCounters(); return true')
  await tabB.session.evaluate("__audit.writeMemory('from-B'); return true")
  await sleep(300)
  const countersA = await tabA.session.evaluate('return __audit.counters()')
  record('T4 跨标签写入触发 storage 事件', (countersA?.storage ?? 0) >= 1, countersA)
  record('T4 跨标签不触发同页自定义事件', (countersA?.custom ?? 0) === 0, countersA)

  await tabB.session.evaluate('__audit.resetCounters(); return true')
  await sleep(100)
  const lastWrite = await tabB.session.evaluate("__audit.writeMemory('from-B-2'); return __audit.counters()")
  record('T4 同页写入触发自定义事件', (lastWrite?.custom ?? 0) >= 1, lastWrite)

  /* ── T5 并发写同一键：记录「后写覆盖」的真实行为 ── */
  const bothA = await tabA.session.evaluate("__audit.writeMemory('A-last'); return __audit.readMemory()")
  const bothB = await tabB.session.evaluate("__audit.writeMemory('B-last'); return __audit.readMemory()")
  const finalRead = await tabA.session.evaluate('return __audit.readMemory()')
  record(
    'T5 两标签页各写一次后，最后一次写入胜出（无合并）',
    bothA?.[0]?.intro === 'A-last' && bothB?.[0]?.intro === 'B-last' && finalRead?.[0]?.intro === 'B-last',
    { bothA, bothB, finalRead },
  )

  /* ── T6 存储被禁用（隐私模式等价）：读空、写 false ── */
  const blockedScript = `
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('denied', 'SecurityError') },
      })
    } catch (error) { /* ignore */ }
  `
  const tabC = await newTarget(url, blockedScript)
  const blockedRead = await tabC.session.evaluate('return __audit.readMemory()')
  const blockedWrite = await tabC.session.evaluate("return __audit.writeMemory('nope')")
  record('T6 存储被禁用时读到空（降级）', Array.isArray(blockedRead) && blockedRead.length === 0, blockedRead)
  record('T6 存储被禁用时写入返回 false', blockedWrite === false, blockedWrite)
} catch (error) {
  console.error('浏览器测试异常：', error)
  exitCode = 1
} finally {
  try {
    chrome.kill()
  } catch {
    /* ignore */
  }
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

const failed = results.filter(item => !item.ok).length
console.log(`\n浏览器结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
