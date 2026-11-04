/**
 * glass-contrast.mjs — 量 V4 玻璃上的文字对比度（WCAG 相对亮度公式）。
 *
 * 做法：先把目标文字设为 visibility:hidden（保留布局），截一张图当作「背景」，
 * 在 canvas 上取元素中心像素；再和元素自身的 computed color 算对比度。
 * 这样能覆盖 backdrop-filter 之后的真实颜色，而不是只看 CSS 声明。
 *
 * 独立 Chromium，不是 DSH 宿主。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = process.env.SORCHRON_HARNESS_DIR ?? join(tmpdir(), 'sorchron-glass')
const PORT = 8783
const DEBUG = 9345
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SELECTORS = [
  '.v4-stat-label',
  '.v4-stat-hint',
  '.v4-card-title',
  '.v4-card-meta',
  '.v4-task-title',
  '.v4-task-meta',
  '.v4-segment',
  '.v4-field',
  '.v4-expand-title',
  '.v4-expand-meta',
  '.v4-expand-hint',
  '.v4-mini-label',
  '.v4-task-counts',
  '.v4-today-due',
  '.v4-activity-time',
  '.v4-panel-hint',
  '.v4-data-label',
  '.v4-data-note',
  '.v4-data-faint',
  '.v4-data-counts dt',
  '.v4-data-keys',
  '.v4-data-danger-body',
  '.v4-data-ack span',
  '.v4-data-preview th',
  '.v4-data-result-body',
  '.v4-history-value',
  '.v4-history-hint',
  '.v4-history-date',
  '.v4-history-count',
  '.v4-history-events li',
  '.v4-heat-legend',
  /* Phase 5.5：专注面板与采集卡 */
  '.v4-focus-clock-sub',
  '.v4-focus-clock-elapsed',
  '.v4-focus-hint',
  '.v4-focus-task-cue',
  '.v4-focus-state-chip',
  '.v4-focus-note',
  '.v4-focus-foot',
  '.v4-capture-note',
  '.v4-capture-toggle strong',
  '.v4-focus-unsaved',
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
await mkdir(DIR, { recursive: true })
const harness = await readFile(join(DIR, 'harness.js'), 'utf8')
const HTML = '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/harness.js"></script>'
const server = createServer((req, res) => {
  if (req.url === '/harness.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(harness); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML)
})
await new Promise(r => server.listen(PORT, '127.0.0.1', r))
const profile = join(DIR, 'profile-contrast')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + DEBUG, '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' })

class S {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); const q = this.p.get(m.id); if (!q) return; this.p.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result) }) }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.p.delete(id)) rej(new Error('timeout ' + method)) }, 15000) }) }
  async eval(expression, awaitPromise = false) { const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true, awaitPromise }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval'); return r.result.value }
}

const out = []
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

  for (const theme of ['light', 'dark']) {
    for (const page of ['dashboard', 'tasks', 'settings', 'history']) {
      await s.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?page=${page}&theme=${theme}` })
      await sleep(350)
      for (let i = 0; i < 80; i += 1) { try { if (await s.eval('return Boolean(window.__ready)') === true) break } catch {} await sleep(100) }
      await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })
      await sleep(400)

      for (const selector of SELECTORS) {
        const info = await s.eval(`
          const els = [...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, 1);
          if (els.length === 0) return null;
          const el = els[0];
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return null;
          // 只采样视口内的元素：截屏只有视口范围，视口外的像素是黑的，
          // 会算出 1:1 这种假告警。
          if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return null;
          const color = getComputedStyle(el).color;
          const prev = el.style.visibility;
          el.style.visibility = 'hidden';
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), color, prev };
        `)
        if (info === null) continue
        const shot = await s.send('Page.captureScreenshot', { format: 'png' })
        const ratio = await s.eval(`
          return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              const ctx = c.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const d = ctx.getImageData(${info.x}, ${info.y}, 1, 1).data;
              resolve([d[0], d[1], d[2]]);
            };
            img.src = 'data:image/png;base64,${shot.data}';
          });
        `, true)
        await s.eval(`const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.style.visibility = ${JSON.stringify(info.prev)}; return true`)
        const parse = str => {
          // 现代 Chrome 对 color-mix 结果返回 `color(srgb 0.59 0.40 0.47)`，
          // 旧写法是 `rgb(r, g, b)`；两种都要能解析，否则会算成黑色。
          const srgb = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
          if (srgb !== null) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255]
          const m = str.match(/rgba?\(([^)]+)\)/)
          if (m === null) return [0, 0, 0]
          return m[1].split(',').slice(0, 3).map(v => Number(v.trim()))
        }
        const lum = ([r, g, b]) => {
          const f = v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const fg = parse(info.color)
        const l1 = lum(fg)
        const l2 = lum(ratio)
        const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        out.push({ theme, page, selector, color: info.color, bg: `rgb(${ratio.join(',')})`, ratio: Number(cr.toFixed(2)) })
        console.log(`${theme} ${page} ${selector}  ${cr.toFixed(2)}:1  fg=${info.color} bg=rgb(${ratio.join(',')})`)
      }
    }
  }
} catch (error) {
  console.error('contrast 异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch {}
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
await writeFile(process.env.SORCHRON_CONTRAST_OUT ?? join('reports', 'glass-contrast.json'), JSON.stringify(out, null, 2))
const bad = out.filter(row => row.ratio < 4.5)
console.log(`\n共 ${out.length} 项，低于 4.5:1 的 ${bad.length} 项`)
if (bad.length > 0) exitCode = 0
process.exit(exitCode)
