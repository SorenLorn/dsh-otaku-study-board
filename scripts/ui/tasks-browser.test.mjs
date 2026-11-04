/** Tasks 页面 1440 / 1100 / 720 浏览器布局测试（不是 DSH 宿主）。 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-tasks')
const PORT = 8774
const DEBUG = 9338
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const WIDTHS = [1440, 1100, 720]
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
  if (req.url === '/harness.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' })
    res.end(harness)
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(HTML)
})
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve))

const profile = join(DIR, 'profile')
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
      const pending = this.pending.get(message.id)
      if (pending === undefined) return
      this.pending.delete(message.id)
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('timeout ' + method))
      }, 10000)
    })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval')
    return result.result.value
  }
}

let exitCode = 0
try {
  let ready = false
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG}/json/version`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      /* not ready */
    }
    await sleep(250)
  }
  if (!ready) throw new Error('devtools 未就绪')

  const target = await (
    await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })
  ).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')
  for (let index = 0; index < 60; index += 1) {
    if ((await session.eval('return Boolean(window.__ready)')) === true) break
    await sleep(100)
  }

  for (const width of WIDTHS) {
    await session.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(400)
    await session.eval(
      "const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='新建任务'); if(button) button.click(); return true",
    )
    await sleep(250)
    const data = await session.eval(`
      const root = document.documentElement;
      const client = root.clientWidth;
      const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) }; };
      const offenders = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > client + 1 || r.left < -1); }).slice(0, 6).map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 50), ...rect(el) }));
      const form = document.querySelector('.v4-task-form');
      const rows = [...document.querySelectorAll('.v4-task-row')].map(rect);
      const fields = [...document.querySelectorAll('.v4-field')].map(rect);
      return {
        viewport: innerWidth,
        clientWidth: client,
        scrollWidth: root.scrollWidth,
        overflowX: root.scrollWidth > client,
        offenders,
        form: form ? rect(form) : null,
        formCols: form ? getComputedStyle(form).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        rowCount: rows.length,
        minRow: rows.length ? Math.min(...rows.map(row => row.w)) : 0,
        fieldOverflow: fields.filter(field => field.right > client + 1),
      };
    `)
    console.log(`\n[${width}px]`, JSON.stringify({ client: data.clientWidth, scroll: data.scrollWidth, formCols: data.formCols, rows: data.rowCount }))
    check(`${width}px 无横向溢出`, data.overflowX === false, { scrollWidth: data.scrollWidth, clientWidth: data.clientWidth })
    check(`${width}px 无越界元素`, data.offenders.length === 0, data.offenders)
    check(`${width}px 表单不超出视口`, data.form !== null && data.form.right <= data.clientWidth + 1, data.form)
    check(`${width}px 输入框不超出视口`, data.fieldOverflow.length === 0, data.fieldOverflow)
    if (width === 1440) check('1440px 表单 3 列', data.formCols === 3, data.formCols)
    if (width === 1100) check('1100px 表单 3 列', data.formCols === 3, data.formCols)
    if (width === 720) check('720px 表单 1 列', data.formCols === 1, data.formCols)
    const shot = await session.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join('reports', `tasks-harness-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
} catch (error) {
  console.error('Tasks 布局测试异常：', error)
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

const failed = results.filter(result => !result.ok).length
console.log(`\nTasks 布局结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
