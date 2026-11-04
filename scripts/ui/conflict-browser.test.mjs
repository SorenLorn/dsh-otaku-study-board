/**
 * conflict-browser.test.mjs — 6 个真实 Chrome 双标签页冲突场景（B3 收尾）。
 * 跑法：先构建 harness，再 node scripts/ui/conflict-browser.test.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-conflict')
const PORT = 8766
const DEBUG = 9334
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const results = []
const log = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
}

await mkdir(DIR, { recursive: true })
const harness = await readFile(join(DIR, 'harness.js'), 'utf8')
const HTML = '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/harness.js"></script>'
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

const profile = join(DIR, 'profile')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + DEBUG, '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitDevtools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG}/json/version`)
      if (response.ok) return
    } catch { /* not ready */ }
    await sleep(250)
  }
  throw new Error('devtools 未就绪')
}

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } }) }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.pending.delete(id)) reject(new Error('timeout ' + method)) }, 10000) }) }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval error'); return r.result.value }
}

async function openTab() {
  const created = await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })
  const target = await created.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  for (let i = 0; i < 60; i += 1) {
    try { if (await session.eval('return Boolean(window.__t)') === true) return session } catch { /* loading */ }
    await sleep(100)
  }
  throw new Error('harness 未加载')
}

async function waitFor(session, expr, timeout = 2500) {
  const start = Date.now()
  for (;;) {
    try { if (await session.eval(expr) === true) return true } catch { /* retry */ }
    if (Date.now() - start > timeout) return false
    await sleep(80)
  }
}

async function reset(a) {
  await a.eval("localStorage.removeItem('dsh-otaku-study-board:__conflict_probe'); localStorage.removeItem('dsh-otaku-study-board:__conflict_probe:2'); window.__t.clearConflicts(); return true")
  await a.eval('location.reload(); return true')
  await sleep(400)
  await waitFor(a, 'return Boolean(window.__t)')
}

let exitCode = 0
try {
  await waitDevtools()
  const a = await openTab()
  const b = await openTab()
  const st = async s => await s.eval('return window.__t.state()')
  const raw = async s => await s.eval('return window.__t.raw()')
  const nRaw = async s => { const r = await raw(s); return r === null ? null : JSON.parse(r).data.n }

  /* 场景 1：A/B 交替写同一键，无未保存状态 */
  await reset(a)
  await a.eval('window.__t.write(1); return true')
  await sleep(250)
  await b.eval('window.__t.write(2); return true')
  await sleep(350)
  const s1 = { aState: await st(a), raw: await nRaw(a), conflicts: await a.eval('return window.__t.conflicts()') }
  log('S1 交替写入：B 覆盖后 A 同步、无冲突', s1.aState === 2 && s1.raw === 2 && s1.conflicts === 0, s1)

  /* 场景 2：A 未保存（写入失败）时 B 修改 */
  await reset(a)
  await a.eval('window.__t.fail(true); window.__t.write(5); return true')
  await sleep(300)
  const aDirty = { state: await st(a), raw: await nRaw(a), conflicts: await a.eval('return window.__t.conflicts()') }
  await b.eval('window.__t.write(7); return true')
  await sleep(400)
  const s2 = { before: aDirty, aState: await st(a), raw: await nRaw(a), conflicts: await a.eval('return window.__t.conflicts()') }
  log('S2 未保存时收到远端：A 保持本地值并出现冲突', s2.aState === 5 && s2.raw === 7 && s2.conflicts >= 1, s2)

  /* 场景 3：A 点「重新载入」 */
  await a.eval('window.__t.fail(false); window.__t.click("重新载入"); return true')
  await sleep(400)
  const s3 = { aState: await st(a), raw: await nRaw(a), conflicts: await a.eval('return window.__t.conflicts()') }
  log('S3 重新载入后与远端一致', s3.aState === 7 && s3.raw === 7 && s3.conflicts === 0, s3)

  /* 场景 4：A 点「保留本页」 */
  await reset(a)
  await a.eval('window.__t.fail(true); window.__t.write(9); return true')
  await sleep(250)
  await b.eval('window.__t.write(3); return true')
  await sleep(350)
  const before4 = await a.eval('return window.__t.conflicts()')
  await a.eval('window.__t.fail(false); window.__t.click("保留本页"); return true')
  await sleep(400)
  const s4 = { conflictsBefore: before4, aState: await st(a), raw: await nRaw(a), conflicts: await a.eval('return window.__t.conflicts()') }
  log('S4 保留本页后本地值写回、冲突清除', s4.conflictsBefore >= 1 && s4.aState === 9 && s4.raw === 9 && s4.conflicts === 0, s4)

  /* 场景 5：导入式批量写之后，另一标签页写入不被回滚 */
  await reset(a)
  const bulk = await a.eval('return window.__t.bulk()')
  await sleep(300)
  const afterBulk = { aState: await st(a), raw: await nRaw(a), raw2: await a.eval("const r=localStorage.getItem('dsh-otaku-study-board:__conflict_probe:2'); return r===null?null:JSON.parse(r).data.n") }
  await b.eval('window.__t.write(5); return true')
  await sleep(400)
  const s5 = { bulk, afterBulk, aState: await st(a), raw: await nRaw(a), raw2: afterBulk.raw2 }
  log('S5 批量写后 B 写入生效且两键都在', s5.bulk?.ok === true && s5.aState === 5 && s5.raw === 5 && s5.raw2 === 1, s5)

  /* 场景 6：配额不足时「保留本页」失败 */
  await reset(a)
  await a.eval('window.__t.fail(true); window.__t.write(11); return true')
  await sleep(250)
  await b.eval('window.__t.write(2); return true')
  await sleep(350)
  await a.eval('window.__t.click("保留本页"); return true')
  await sleep(400)
  const s6 = {
    aState: await st(a),
    raw: await nRaw(a),
    conflicts: await a.eval('return window.__t.conflicts()'),
    notices: await a.eval('return window.__t.notices()'),
  }
  const noticeOk = Array.isArray(s6.notices) && s6.notices.some(t => t.includes('保留本页失败') || t.includes('没有保存'))
  log('S6 保留本页写入失败：保留冲突 + 明确提示', s6.aState === 11 && s6.raw === 2 && s6.conflicts >= 1 && noticeOk, s6)
} catch (error) {
  console.error('冲突测试异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch { /* ignore */ }
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

const failed = results.filter(r => !r.ok).length
console.log(`\nChrome 冲突结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0 || results.length < 6) exitCode = 1
process.exit(exitCode)
