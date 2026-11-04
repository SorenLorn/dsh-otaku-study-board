/**
 * shell-browser.test.mjs — 整页入口行为测试（独立 Chromium，不是 DSH 宿主）。
 *
 * 验证：默认 V4、无双工作台切换器、三个导航可达、顶部新建任务打开统一弹层、
 * **没有任何经典入口**（Phase 5.2 起经典工作台不再作为用户界面存在）。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-shell')
const PORT = 8785
const DEBUG = 9347
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
await mkdir(DIR, { recursive: true })
const harness = await readFile(join(DIR, 'harness.js'), 'utf8')
const HTML = '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/harness.js"></script>'
const server = createServer((req, res) => {
  if (req.url === '/harness.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(harness); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML)
})
await new Promise(r => server.listen(PORT, '127.0.0.1', r))
const profile = join(DIR, 'profile')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + DEBUG, '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' })

class S {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); const q = this.p.get(m.id); if (!q) return; this.p.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result) }) }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.p.delete(id)) rej(new Error('timeout ' + method)) }, 15000) }) }
  async eval(expression, awaitPromise = false) { const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true, awaitPromise }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval'); return r.result.value }
}

const click = async (s, label) => {
  const p = await s.eval(`
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === ${JSON.stringify(label)});
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `)
  if (p === null) return false
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await sleep(260)
  return true
}

let exitCode = 0
try {
  let ready = false
  for (let i = 0; i < 80; i += 1) { try { const r = await fetch(`http://127.0.0.1:${DEBUG}/json/version`); if (r.ok) { ready = true; break } } catch {} await sleep(250) }
  if (!ready) throw new Error('devtools 未就绪')
  const t = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const consoleErrors = []
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails?.exception?.description ?? 'exception')
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '))
    }
  })
  const s = new S(ws)
  await s.send('Runtime.enable'); await s.send('Page.enable')
  for (let i = 0; i < 80; i += 1) { if (await s.eval('return Boolean(window.__ready)') === true) break; await sleep(100) }
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(500)

  const initial = await s.eval(`
    const de = document.documentElement;
    return {
      shell: document.querySelector('.v4-shell') !== null,
      hero: document.querySelector('.osb-hero') !== null,
      nav: document.querySelectorAll('.v4-nav-item').length,
      switchTab: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '经典工作台'),
      stat: document.querySelectorAll('.v4-stat').length,
      overflow: de.scrollWidth > de.clientWidth,
    };
  `)
  check('默认进入 V4（shell 存在、无 Hero）', initial.shell === true && initial.hero === false, initial)
  check('没有 Classic/V4 双工作台切换器', initial.switchTab === false, initial)
  check('顶部导航 3 项（Dashboard / 任务 / 历史）+ 统计 4 格', initial.nav === 3 && initial.stat === 4, initial)
  check('1440 无横向溢出', initial.overflow === false, initial)

  check('点击「任务」进入 Tasks', await click(s, '任务') && (await s.eval("return document.querySelector('.v4-task-panel') !== null")) === true)
  check('点击「Dashboard」返回首页', await click(s, 'Dashboard') && (await s.eval("return document.querySelector('.v4-dash') !== null")) === true)

  /**
   * Phase 5.5 更新：顶部「新建任务」自 Phase 5.2 起打开**统一弹层**（不再跳页），
   * 这里断言弹层与表单字段，而不是「进入任务页」。
   */
  check('顶部「新建任务」打开统一弹层（不跳页）', (await click(s, '新建任务')) && (await s.eval("return document.querySelector('.v4-composer') !== null")) === true)
  check('弹层表单标题输入框获得焦点', (await s.eval("return document.activeElement?.getAttribute('aria-label')")) === '任务标题')
  check('新建任务后仍停留在 Dashboard（没有第二套导航）', (await s.eval("return document.querySelector('.v4-dash') !== null")) === true)
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await sleep(260)
  check('Esc 可关闭弹层', (await s.eval("return document.querySelector('.v4-composer') === null")) === true)

  /* 经典入口必须彻底消失（Phase 5.2 的产品约束） */
  const classic = await s.eval(`
    const labels = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim());
    return {
      hasClassicButton: labels.some(text => text === '经典工具' || text === '经典工作台' || text === '← 返回工作台'),
      hero: document.querySelector('.osb-hero') !== null,
      classicBar: document.querySelector('.v4-classic-bar') !== null,
      osbCards: document.querySelectorAll('.osb-card').length,
    };
  `)
  check('没有经典入口 / Hero / 旧卡片', classic.hasClassicButton === false && classic.hero === false && classic.classicBar === false && classic.osbCards === 0, classic)

  check('无 JS 异常 / 控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 3))

  const shot = await s.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'ux-shell-1440.png'), Buffer.from(shot.data, 'base64'))
} catch (error) {
  console.error('入口测试异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch {}
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
const failed = results.filter(r => !r.ok).length
console.log(`\n入口结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
