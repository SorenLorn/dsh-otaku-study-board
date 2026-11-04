/**
 * workbench-shot.mjs — Phase 5.2 截图（Dashboard / Tasks / 抽屉 / 弹层 / 展开）。
 *
 * 用法：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
 *     --format=iife --jsx=automatic --loader:.css=text \
 *     --outfile="$TEMP/sorchron-wb/harness.js"
 *   node scripts/ui/workbench-shot.mjs
 *
 * 产物：reports/wb-<view>-<theme>-<width>.png
 *       reports/wb-metrics.json
 *
 * 独立 Chromium，不是 DSH 宿主。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const PORT = 8791
const DEBUG = 9351
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const WIDTHS = [1440, 1100, 720]
const THEMES = ['light', 'dark']
const VIEWS = [
  { key: 'dashboard', query: 'page=dashboard' },
  { key: 'tasks', query: 'page=tasks' },
  { key: 'history', query: 'page=history' },
  { key: 'settings', query: 'page=settings' },
  { key: 'drawer', query: 'page=dashboard&open=drawer' },
  { key: 'modal', query: 'page=dashboard&open=modal' },
  { key: 'expand', query: 'page=dashboard&open=expand' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
await mkdir(DIR, { recursive: true })
const harness = await readFile(join(DIR, 'harness.js'), 'utf8')
const HTML = '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/harness.js"></script>'
const server = createServer((req, res) => {
  if (req.url === '/harness.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' })
    res.end(harness)
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(HTML)
})
await new Promise(r => server.listen(PORT, '127.0.0.1', r))
const profile = join(DIR, 'profile-shot')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + DEBUG,
    '--remote-allow-origins=*',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      const slot = this.pending.get(message.id)
      if (!slot) return
      this.pending.delete(message.id)
      if (message.error) slot.reject(new Error(message.error.message))
      else slot.resolve(message.result)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('timeout ' + method))
      }, 15000)
    })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval')
    return result.result.value
  }
}

const metrics = []
let exitCode = 0
try {
  let ready = false
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG}/json/version`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await sleep(250)
  }
  if (!ready) throw new Error('devtools 未就绪')
  const tab = await (
    await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?${VIEWS[0].query}&theme=light`)}`, { method: 'PUT' })
  ).json()
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      await session.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${view.query}&theme=${theme}` })
      await sleep(320)
      for (let i = 0; i < 80; i += 1) {
        try {
          if ((await session.eval('return Boolean(window.__ready)')) === true) break
        } catch {}
        await sleep(100)
      }
      for (const width of WIDTHS) {
        await session.send('Emulation.setDeviceMetricsOverride', { width, height: 940, deviceScaleFactor: 1, mobile: false })
        await sleep(400)
        const data = await session.eval(`
          const de = document.documentElement;
          const client = de.clientWidth;
          const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
          const offenders = [...document.querySelectorAll('body *')]
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > client + 1 || r.left < -1); })
            .slice(0, 4)
            .map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 48) }));
          return {
            overflowX: de.scrollWidth > client,
            scrollWidth: de.scrollWidth,
            clientWidth: client,
            offenders,
            drawer: rect(document.querySelector('.v4-drawer')),
            modal: rect(document.querySelector('.v4-modal')),
            overlay: document.querySelector('.v4-overlay')?.getAttribute('data-overlay') ?? null,
            bodyLocked: document.body.style.overflow === 'hidden',
            panelOpen: Boolean(document.querySelector('.v4-expand-body')),
            glass1: document.querySelectorAll('.v4-glass-1').length,
            glass2: document.querySelectorAll('.v4-glass-2').length,
            glass3: document.querySelectorAll('.v4-glass-3').length,
          };
        `)
        const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        const file = `wb-${view.key}-${theme}-${width}.png`
        await writeFile(join('reports', file), Buffer.from(shot.data, 'base64'))
        metrics.push({ view: view.key, theme, width, ...data, file })
        console.log(`${file}  overflow=${data.overflowX}  overlay=${data.overlay ?? '-'}  drawer=${data.drawer?.w ?? '-'}`)
      }
    }
  }
} catch (error) {
  console.error('workbench shot 异常：', error)
  exitCode = 1
} finally {
  try {
    chrome.kill()
  } catch {}
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
await writeFile(join('reports', 'wb-metrics.json'), JSON.stringify(metrics, null, 2))
// 只以「文档真的能横向滚动」为准：热力图自己的 overflow:auto 容器里，
// 子元素超出可视宽度是正常滚动内容，不算页面溢出。
const bad = metrics.filter(row => row.overflowX)
console.log(`\n截图 ${metrics.length} 张，横向溢出 ${bad.length} 张`)
if (bad.length > 0) exitCode = 1
process.exit(exitCode)
