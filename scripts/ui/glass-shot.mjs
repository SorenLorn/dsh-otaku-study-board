/**
 * glass-shot.mjs — 截取 V4 六个视角（Dashboard/Tasks × 浅/深 × 三档宽度）。
 *
 * 用法：node scripts/ui/glass-shot.mjs before|after
 * 产物：reports/glass-<tag>-<page>-<theme>-<width>.png
 *       reports/glass-metrics-<tag>.json
 *
 * 这是独立 Chromium 视觉测试，不是 DSH 宿主截图。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tag = process.argv[2] ?? 'after'
const DIR = join(tmpdir(), 'sorchron-glass')
const PORT = 8781
const DEBUG = 9343
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const WIDTHS = [1440, 1100, 720]
const PAGES = ['dashboard', 'tasks']
const THEMES = ['light', 'dark']

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

const metrics = []
let exitCode = 0
try {
  let ready = false
  for (let i = 0; i < 80; i += 1) { try { const r = await fetch(`http://127.0.0.1:${DEBUG}/json/version`); if (r.ok) { ready = true; break } } catch {} await sleep(250) }
  if (!ready) throw new Error('devtools 未就绪')
  const t = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?page=dashboard&theme=light`)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const s = new S(ws)
  await s.send('Runtime.enable'); await s.send('Page.enable')

  for (const theme of THEMES) {
    for (const page of PAGES) {
      await s.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?page=${page}&theme=${theme}` })
      await sleep(300)
      for (let i = 0; i < 80; i += 1) { try { if (await s.eval('return Boolean(window.__ready)') === true) break } catch {} await sleep(100) }
      for (const width of WIDTHS) {
        await s.send('Emulation.setDeviceMetricsOverride', { width, height: 940, deviceScaleFactor: 1, mobile: false })
        await sleep(420)
        const data = await s.eval(`
          const de = document.documentElement;
          const client = de.clientWidth;
          const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
          const g1 = document.querySelector('.v4-glass-1');
          const g2 = document.querySelector('.v4-glass-2');
          const cs = el => el ? getComputedStyle(el) : null;
          const read = el => { const c = cs(el); return c === null ? null : { bg: c.backgroundColor, filter: c.backdropFilter || c.webkitBackdropFilter, border: c.borderTopColor, shadow: c.boxShadow.slice(0, 220), radius: c.borderTopLeftRadius }; };
          // 热力图自带的横向滚动容器（首页与历史页都有）：里面越界的格子是被裁剪的
          // 滚动内容，不算页面越界 —— 真正的判据是下面 documentElement 的 scrollWidth。
          const offenders = [...document.querySelectorAll('body *')]
            .filter(el => {
              if (el.closest('.v4-heat-scroll') !== null) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && (r.right > client + 1 || r.left < -1);
            })
            .slice(0, 4).map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40) }));
          return {
            overflowX: de.scrollWidth > client, scrollWidth: de.scrollWidth, clientWidth: client,
            offenders,
            page: rect(document.querySelector('.v4-page')),
            g1: read(g1), g2: read(g2),
            cardCount: document.querySelectorAll('.v4-glass-1,.v4-glass-2').length,
            statCols: getComputedStyle(document.querySelector('.v4-stat-row') ?? document.body).gridTemplateColumns.split(' ').filter(Boolean).length,
            bg: getComputedStyle(document.querySelector('.v4-page')).backgroundColor,
            text: getComputedStyle(document.querySelector('.v4-page')).color,
          };
        `)
        const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        const file = `glass-${tag}-${page}-${theme}-${width}.png`
        await writeFile(join('reports', file), Buffer.from(shot.data, 'base64'))
        metrics.push({ tag, page, theme, width, ...data, file })
        console.log(`${file}  overflow=${data.overflowX}  cards=${data.cardCount}  bg=${data.g1?.bg ?? '-'}`)
      }
    }
  }
} catch (error) {
  console.error('glass shot 异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch {}
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
await writeFile(join('reports', `glass-metrics-${tag}.json`), JSON.stringify(metrics, null, 2))
const bad = metrics.filter(m => m.overflowX || m.offenders.length > 0)
console.log(`\n截图 ${metrics.length} 张，横向溢出 ${bad.length} 张`)
if (bad.length > 0) exitCode = 1
process.exit(exitCode)
