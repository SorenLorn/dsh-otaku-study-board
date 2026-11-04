/**
 * button-browser.test.mjs — Button 的浅/深色对比度、loading 宽度、hover/focus、键盘。
 * 真实 Chromium + 真实 Button/board.css；宿主 token 用代表性值注入（不是 DSH 宿主）。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-button')
const PORT = 8772
const DEBUG = 9337
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
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
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.p.delete(id)) rej(new Error('timeout ' + method)) }, 10000) }) }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval'); return r.result.value }
}

const parse = value => {
  const text = (value || '').trim()
  const rgba = /rgba?\(([^)]+)\)/.exec(text)
  if (rgba) {
    const parts = rgba[1].split(',').map(Number)
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(text)
  if (srgb) {
    return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: srgb[4] === undefined ? 1 : Number(srgb[4]) }
  }
  return null
}
const over = (fg, bg) => {
  if (fg === null) return bg
  if (fg.a >= 1) return fg
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
}
const lum = c => {
  const f = v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}
const contrast = (a, b) => {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

let exitCode = 0
try {
  let ready = false
  for (let i = 0; i < 80; i += 1) { try { const r = await fetch(`http://127.0.0.1:${DEBUG}/json/version`); if (r.ok) { ready = true; break } } catch {} await sleep(250) }
  if (!ready) throw new Error('devtools 未就绪')
  const t = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const s = new S(ws)
  await s.send('Runtime.enable'); await s.send('Page.enable'); await s.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 60; i += 1) { if (await s.eval('return Boolean(window.__ready)') === true) break; await sleep(100) }

  const measure = () => s.eval(`
    const ids = ['b-primary','b-secondary','b-ghost','b-danger','b-icon','b-loading'];
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      out[id] = { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, w: r.width, h: r.height, disabled: el.disabled };
    }
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    out.pageBg = getComputedStyle(document.querySelector('.v4-page')).backgroundColor;
    return out;
  `)

  const light = await measure()
  const pageL = parse(light.pageBg) || { r: 255, g: 255, b: 255, a: 1 }
  for (const id of ['b-primary', 'b-secondary', 'b-ghost']) {
    const bg = over(parse(light[id].bg), pageL)
    const c = contrast(parse(light[id].color), bg)
    check(`浅色 ${id} 对比度 ≥ 4.5`, c >= 4.5, { ratio: Number(c.toFixed(2)), color: light[id].color, bg, page: light.pageBg })
  }

  const baseTransform = await s.eval("const b=document.getElementById('b-primary'); return { t: getComputedStyle(b).transform, r: b.getBoundingClientRect().toJSON() }")
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(baseTransform.r.x + baseTransform.r.width / 2), y: Math.round(baseTransform.r.y + baseTransform.r.height / 2) })
  await sleep(220)
  const hoverTransform = await s.eval("return getComputedStyle(document.getElementById('b-primary')).transform")
  check('hover 有位移反馈', hoverTransform !== baseTransform.t, { base: baseTransform.t, hover: hoverTransform })
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(baseTransform.r.x + baseTransform.r.width / 2), y: Math.round(baseTransform.r.y + baseTransform.r.height / 2), button: 'left', clickCount: 1 })
  await sleep(120)
  const activeTransform = await s.eval("return getComputedStyle(document.getElementById('b-primary')).transform")
  check('active 有压缩反馈', activeTransform !== hoverTransform, { hover: hoverTransform, active: activeTransform })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(baseTransform.r.x + baseTransform.r.width / 2), y: Math.round(baseTransform.r.y + baseTransform.r.height / 2), button: 'left', clickCount: 1 })

  await s.eval("document.body.setAttribute('data-ds-dark-theme',''); return true")
  await sleep(300)
  const dark = await measure()
  const pageD = parse(dark.pageBg) || { r: 0, g: 0, b: 0, a: 1 }
  for (const id of ['b-primary', 'b-secondary', 'b-ghost']) {
    const bg = over(parse(dark[id].bg), pageD)
    const c = contrast(parse(dark[id].color), bg)
    check(`深色 ${id} 对比度 ≥ 4.5`, c >= 4.5, { ratio: Number(c.toFixed(2)), color: dark[id].color, bg, page: dark.pageBg })
  }

  const before = dark['b-loading'].w
  await s.eval('window.__setLoading(true); return true')
  await sleep(250)
  const loading = await measure()
  check('loading 宽度变化 ≤ 1px', Math.abs(loading['b-loading'].w - before) <= 1, { before, after: loading['b-loading'].w })
  check('loading 被禁用', loading['b-loading'].disabled === true)
  const clicksBefore = await s.eval('return window.__clicks')
  await s.eval("document.getElementById('b-loading').click(); return true")
  check('loading 点击不触发回调', (await s.eval('return window.__clicks')) === clicksBefore)

  // 键盘：聚焦主按钮后按 Enter
  await s.eval("document.getElementById('b-primary').focus(); return true")
  const focused = await s.eval("return { id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName }")
  const clicks2 = await s.eval('return window.__clicks')
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await sleep(150)
  check('键盘 Space 触发按钮', (await s.eval('return window.__clicks')) === clicks2 + 1, { focused, before: clicks2, after: await s.eval('return window.__clicks') })

  // focus-visible：用键盘 Tab 进入按钮，而不是 programmatic focus
  await s.eval('document.body.focus(); return true')
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await sleep(200)
  const outline = await s.eval("const b=document.activeElement; const cs=getComputedStyle(b); return { tag: b.tagName, width: cs.outlineWidth, style: cs.outlineStyle }")
  check('键盘 Tab 可聚焦且轮廓可见', outline.tag === 'BUTTON' && outline.style !== 'none' && parseFloat(outline.width) >= 1, outline)
} catch (error) {
  console.error('Button 浏览器测试异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch {}
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

const failed = results.filter(r => !r.ok).length
console.log(`\nButton 浏览器结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
