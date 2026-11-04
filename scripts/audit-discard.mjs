/**
 * 一次性审计（Phase 6.1 · 风险 A）：部分写入的现场点「放弃这一笔」，会留下什么？
 *
 * 做法：用 `?timer=partial` 把存储做成「日志已写、Daily/任务/时间轴未结算」，
 * 页面挂载后自动修复会先把这一笔补齐 —— 所以要先让修复失败才看得到「未保存」态。
 * 更简单的等价现场：直接把 pendingResult 放回去 + 只留日志，然后点放弃。
 *
 * 读法：点「放弃这一笔」之后，日志还在不在？Daily 有没有补？
 * 只读审计，不修改任何源码。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const PORT = 8799
const DEBUG = 9359
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

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

const profile = join(DIR, 'profile-discard')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
   '--remote-debugging-port=' + DEBUG, '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'],
  { stdio: 'ignore' },
)

class Session {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data); const slot = this.pending.get(m.id)
      if (!slot) return
      this.pending.delete(m.id)
      m.error ? slot.reject(new Error(m.error.message)) : slot.resolve(m.result)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error('timeout ' + method)) }, 15000)
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval')
    return r.result.value
  }
  async waitReady() {
    for (let i = 0; i < 120; i += 1) {
      try { if ((await this.eval('return Boolean(window.__ready)')) === true) return } catch { /* navigating */ }
      await sleep(80)
    }
    throw new Error('harness 未就绪')
  }
  async click(label) {
    const point = await this.eval(`
      const b = [...document.querySelectorAll('button')].find(n => (n.textContent ?? '').trim() === ${JSON.stringify(label)});
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
    if (point === null) throw new Error('找不到按钮：' + label)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await sleep(260)
  }
}

async function open(url) {
  const target = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const s = new Session(ws)
  await s.send('Runtime.enable')
  await s.waitReady()
  return s
}

try {
  let ready = false
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG}/json/version`)
      if (response.ok) { ready = true; break }
    } catch { /* not ready */ }
    await sleep(250)
  }
  if (!ready) throw new Error('devtools 未就绪')

  // 1) 先用 partial 种子进页面，拿到一个「已写入日志」的现场
  const tab = await open(`http://127.0.0.1:${PORT}/?page=dashboard&timer=partial`)
  await sleep(700)

  // 2) 造一个「日志在、Daily 却是中间值」的现场：基线 68、当前 73、本轮 18。
  //    73 既不等于 68 也不 ≥ 86 → planRepair 判「判断不了」→ 不写、保留 pending、界面「未保存」。
  const planted = await tab.eval(`
    const KEY = 'dsh-otaku-study-board';
    const read = k => { const raw = localStorage.getItem(KEY + ':' + k); return raw ? JSON.parse(raw).data : null };
    const wrap = v => JSON.stringify({ schemaVersion: 4, data: v });
    const day = new Date().toLocaleDateString('sv-SE');
    const base = (read('daily') ?? []).find(r => r.day === day)?.focusMinutes ?? 0;
    const daily = (read('daily') ?? []).map(r => r.day === day ? { ...r, focusMinutes: base + 5 } : r);
    localStorage.setItem(KEY + ':daily', wrap(daily));
    const task = (read('tasks') ?? []).find(t => t.id === 't0');
    const timer = read('timer');
    timer.pendingResult = {
      roundId: 'focus-seed-partial', minutes: 18, elapsedSeconds: 1080, targetMinutes: 25,
      taskId: 't0', startedAt: Date.now() - 1200000, endedAt: Date.now() - 60000,
      before: { day, dailyMinutes: base, taskId: 't0', taskMinutes: task?.focusedMinutes ?? 0, taskPomodoros: task?.pomodoros ?? 0 },
    };
    localStorage.setItem(KEY + ':timer', wrap(timer));
    return { day, base, now: base + 5, logs: (read('logs') ?? []).filter(l => l.id === 'focus-seed-partial').length };
  `)
  console.log('现场：日志条数 =', planted.logs, '｜基线 Daily =', planted.base, '｜当前 Daily =', planted.now)

  // 注意：不能带着 `timer=partial` 重载 —— 那个种子会用自己的基线覆盖掉刚种下的 pendingResult。
  await tab.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?page=dashboard` })
  await tab.waitReady()
  await sleep(700)

  const beforeDiscard = await tab.eval(`
    const KEY = 'dsh-otaku-study-board';
    const read = k => { const raw = localStorage.getItem(KEY + ':' + k); return raw ? JSON.parse(raw).data : null };
    const day = new Date().toLocaleDateString('sv-SE');
    return {
      unsaved: (document.body.textContent ?? '').includes('未保存'),
      hasDiscard: [...document.querySelectorAll('button')].some(b => (b.textContent ?? '').trim() === '放弃这一笔'),
      logs: (read('logs') ?? []).filter(l => l.id === 'focus-seed-partial').length,
      daily: (read('daily') ?? []).find(r => r.day === day)?.focusMinutes ?? null,
      pending: read('timer')?.pendingResult?.roundId ?? null,
      timeline: (read('timeline') ?? []).filter(e => e.refId === 'focus-seed-partial').length,
      text: (document.querySelector('.v4-focus-body')?.textContent ?? '').slice(0, 200),
    }
  `)
  console.log('放弃前：', beforeDiscard)

  // 4) 点「放弃这一笔」：先看坐标命中谁，再用 DOM click 兜底，区分「产品没反应」和「点击没落到按钮上」
  const hit = await tab.eval(`
    const b = [...document.querySelectorAll('button')].find(n => (n.textContent ?? '').trim() === '放弃这一笔');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, inViewport: r.y >= 0 && r.bottom <= innerHeight, hitTag: at?.tagName ?? null, hitText: (at?.textContent ?? '').slice(0, 20) };
  `)
  console.log('按钮命中检查：', hit)
  await tab.click('放弃这一笔')
  await sleep(400)
  const viaMouse = await tab.eval(`
    const KEY = 'dsh-otaku-study-board';
    const raw = localStorage.getItem(KEY + ':timer');
    return raw ? (JSON.parse(raw).data.pendingResult?.roundId ?? null) : null;
  `)
  console.log('鼠标点击后 pending =', viaMouse)
  if (viaMouse !== null) {
    await tab.eval(`
      const b = [...document.querySelectorAll('button')].find(n => (n.textContent ?? '').trim() === '放弃这一笔');
      if (b) b.click();
      return true;
    `)
    await sleep(400)
  }

  const after = await tab.eval(`
    const KEY = 'dsh-otaku-study-board';
    const read = k => { const raw = localStorage.getItem(KEY + ':' + k); return raw ? JSON.parse(raw).data : null };
    const day = new Date().toLocaleDateString('sv-SE');
    return {
      logs: (read('logs') ?? []).filter(l => l.id === 'focus-seed-partial').length,
      daily: (read('daily') ?? []).find(r => r.day === day)?.focusMinutes ?? null,
      pending: read('timer')?.pendingResult?.roundId ?? null,
      timeline: (read('timeline') ?? []).filter(e => e.refId === 'focus-seed-partial').length,
      text: (document.querySelector('.v4-focus-body')?.textContent ?? '').slice(0, 160),
    }
  `)
  console.log('放弃后：', after)
  console.log(
    '\n判定：放弃后日志仍在 =', after.logs === 1,
    '｜Daily 未补 =', after.daily === beforeDiscard.daily,
    '｜pending 已清 =', after.pending === null,
  )
} finally {
  chrome.kill()
  server.close()
}
process.exit(0)
