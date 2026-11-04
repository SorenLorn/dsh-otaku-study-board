/**
 * layout-browser.test.mjs — 1440 / 1100 / 720 三档浏览器布局测试。
 *
 * 说明：这是「浏览器尺寸测试」，用真实 V4 组件 + 真实 board.css，但不是 DSH 宿主。
 * 报告里必须与宿主截图分开标注。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-layout')
const PORT = 8770
const DEBUG = 9335
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const WIDTHS = [1440, 1100, 720]
const results = []
const check = (name, ok, detail) => {
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
  '--remote-debugging-port=' + DEBUG, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))

class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', event => {
      const m = JSON.parse(event.data)
      const p = this.pending.get(m.id)
      if (p === undefined) return
      this.pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error('timeout ' + method)) }, 10000)
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval error')
    return r.result.value
  }
}

async function waitDevtools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG}/json/version`)
      if (res.ok) return
    } catch { /* not ready */ }
    await sleep(250)
  }
  throw new Error('Chrome devtools 未就绪')
}

let exitCode = 0
try {
  await waitDevtools()
  const created = await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })
  const target = await created.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const s = new Session(ws)
  await s.send('Runtime.enable')
  await s.send('Page.enable')
  for (let i = 0; i < 60; i += 1) {
    if (await s.eval('return Boolean(window.__ready)') === true) break
    await sleep(100)
  }

  for (const width of WIDTHS) {
    await s.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(450)
    const data = await s.eval(`
      const de = document.documentElement;
      const client = de.clientWidth;
      const page = document.querySelector('.v4-page');
      const stat = document.querySelector('.v4-stat-row');
      const dash = document.querySelector('.v4-dash');
      const cols = el => el ? getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) }; };
      // 热力图自带横向滚动容器（History 与 6.2 起的 Dashboard 都有），
      // 里面越界的格子是被裁剪的滚动内容，不算页面越界；判据看 documentElement 的 overflowX。
      const inScroller = el => el.closest('.v4-heat-scroll') !== null;
      const offenders = [...document.querySelectorAll('body *')]
        .filter(el => { if (inScroller(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > client + 1 || r.left < -1); })
        .slice(0, 6)
        .map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60), ...rect(el) }));
      const tabs = [...document.querySelectorAll('.v4-nav-item')].map(el => ({ text: (el.textContent || '').trim(), ...rect(el) }));
      const cards = [...document.querySelectorAll('.v4-glass-1, .v4-glass-2')].map(el => rect(el));
      const buttons = [...document.querySelectorAll('.v4-page button')]
        .filter(el => !inScroller(el))
        .map(el => ({ text: (el.textContent || '').trim(), ...rect(el) }));
      const innerOverflow = [...document.querySelectorAll('.v4-glass-1, .v4-glass-2')]
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => ({ cls: String(el.className).slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth }));
      return {
        viewport: innerWidth, clientWidth: client, scrollWidth: de.scrollWidth,
        overflowX: de.scrollWidth > client,
        statCols: cols(stat), dashCols: cols(dash),
        page: page ? rect(page) : null,
        offenders, tabs, cards, buttons, innerOverflow,
        cardCount: cards.length,
      };
    `)
    data.viewport = width
    console.log(`\n[${width}px]`, JSON.stringify({ clientWidth: data.clientWidth, scrollWidth: data.scrollWidth, statCols: data.statCols, dashCols: data.dashCols, cards: data.cardCount }))
    check(`${width}px 无横向溢出`, data.overflowX === false, { scrollWidth: data.scrollWidth, clientWidth: data.clientWidth })
    check(`${width}px 无越界元素`, data.offenders.length === 0, data.offenders)
    // 导航项数量随产品演进（5.4 加入「历史」），这里只断言「没被裁切」而不是写死条数
    check(`${width}px 顶部导航未被裁切`, data.tabs.length >= 2 && data.tabs.every(t => t.right <= data.clientWidth + 1 && t.w >= 30), data.tabs)
    check(`${width}px 按钮未被裁切`, data.buttons.every(b => b.right <= data.clientWidth + 1 && b.w > 0), data.buttons)
    check(`${width}px 卡片内部无内容溢出`, data.innerOverflow.length === 0, data.innerOverflow)
    if (width === 1440) {
      check('1440px 统计 4 列', data.statCols === 4, data.statCols)
      check('1440px Dashboard 双列', data.dashCols === 2, data.dashCols)
    }
    if (width === 1100) {
      check('1100px 统计 2 列', data.statCols === 2, data.statCols)
      check('1100px Dashboard 单列', data.dashCols === 1, data.dashCols)
    }
    if (width === 720) {
      check('720px Dashboard 单列', data.dashCols === 1, data.dashCols)
      check('720px 卡片宽度合理', data.cards.every(c => c.w >= 240), data.cards.slice(0, 3))
    }
    const shot = await s.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join('reports', `layout-harness-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
} catch (error) {
  console.error('布局测试异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch { /* ignore */ }
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

const failed = results.filter(r => !r.ok).length
console.log(`\n布局结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
