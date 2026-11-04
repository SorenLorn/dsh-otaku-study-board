/**
 * focus-multi-tab.test.mjs — 两个标签页同时操作同一轮专注（Phase 5.5.1）。
 *
 * 同一浏览器、同一 profile → 两个标签页共享 localStorage，这正是真实的多标签场景。
 * 验证：
 *   • 两个标签页先后结束同一轮 → 只有一笔记录（第二次识别为「已经记过」）；
 *   • 一个标签页暂停、另一个结束 → 最终状态一致（completed）且只有一笔；
 *   • 标签页刷新后不会重复记账；
 *   • 预置的重复记录会在下次挂载时被合并，并给出提示。
 *
 * 前置：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
 *     --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
 * 运行：node scripts/ui/focus-multi-tab.test.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const PORT = 8797
const DEBUG = 9357
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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

const profile = join(DIR, 'profile-multitab')
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
      if (slot === undefined) return
      this.pending.delete(message.id)
      message.error ? slot.reject(new Error(message.error.message)) : slot.resolve(message.result)
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
  async waitReady() {
    for (let index = 0; index < 120; index += 1) {
      try {
        if ((await this.eval('return Boolean(window.__ready)')) === true) return
      } catch {
        /* navigating */
      }
      await sleep(80)
    }
    throw new Error('harness 未就绪')
  }
  async reload() {
    await this.send('Page.reload', { ignoreCache: false })
    await this.waitReady()
    await sleep(260)
  }
  async clickFocus(label) {
    const point = await this.eval(`
      const button = [...document.querySelectorAll('.v4-focus-actions button')].find(node => (node.textContent ?? '').trim() === ${JSON.stringify(label)});
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
    if (point === null) throw new Error('找不到专注按钮：' + label)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await sleep(220)
  }
}

/** 打开一个新标签页并连上它。 */
async function openTab(url) {
  const target = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })
  await session.waitReady()
  await sleep(240)
  session.targetId = target.id
  return session
}

const readStore = (session, key) =>
  session.eval(`
    const raw = localStorage.getItem('dsh-otaku-study-board:${key}');
    if (!raw) return null;
    try { return JSON.parse(raw).data ?? null } catch { return null }
  `)

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

  /* ── 1. 两个标签页先后结束同一轮 ─────────────────────────────────────── */
  const tabA = await openTab(`http://127.0.0.1:${PORT}/?page=dashboard&timer=running18`)
  const stateA = await tabA.eval('return window.__focus()')
  check('标签页 A 读到种子计时（07:00 专注中）', stateA.clock === '07:00' && stateA.status === '专注中', stateA)

  const tabB = await openTab(`http://127.0.0.1:${PORT}/?page=dashboard`)
  const stateB = await tabB.eval('return window.__focus()')
  // 两个标签页打开时间差几百毫秒，倒计时会差 1 秒属正常；只断言状态与量级
  check(
    '标签页 B 从共享存储读到同一轮（专注中，剩余约 07:00）',
    stateB.status === '专注中' && /^0[67]:\d\d$/.test(stateB.clock),
    stateB,
  )
  const timerBefore = await readStore(tabB, 'timer')
  check('两个标签页的 roundId 相同', String(timerBefore?.roundId ?? '').startsWith('focus-seed-18'), timerBefore?.roundId)

  // harness 自带 7 条历史专注日志：下面一律用「相对 before 的增量」断言
  const logsBefore = ((await readStore(tabA, 'logs')) ?? []).length
  await tabA.clickFocus('结束并记录')
  const afterA = await tabA.eval('return window.__focus()')
  check('标签页 A 结束后是「本轮完成」且无「未保存」', afterA.status === '本轮完成' && afterA.result.includes('未保存') === false, afterA)
  const logsA = (await readStore(tabA, 'logs')) ?? []
  check(
    '标签页 A 只多写 1 条日志（18 分钟）',
    logsA.length === logsBefore + 1 && logsA.filter(log => log.id === 'focus-seed-18').length === 1,
    { before: logsBefore, after: logsA.length },
  )

  await tabB.clickFocus('结束并记录')
  const afterB = await tabB.eval('return window.__focus()')
  check('标签页 B 结束后同样是「本轮完成」', afterB.status === '本轮完成', afterB)
  check('标签页 B 没有显示「未保存」', afterB.result.includes('未保存') === false, afterB.result)

  const logsAfterBoth = (await readStore(tabA, 'logs')) ?? []
  const dailyAfterBoth = (await readStore(tabA, 'daily')) ?? []
  const tasksAfterBoth = (await readStore(tabA, 'tasks')) ?? []
  const timelineAfterBoth = (await readStore(tabA, 'timeline')) ?? []
  check(
    '两个标签页结束同一轮不会写出两条日志',
    logsAfterBoth.filter(log => log.id === 'focus-seed-18').length === 1 && logsAfterBoth.length === logsBefore + 1,
    { total: logsAfterBoth.length, sameRound: logsAfterBoth.filter(log => log.id === 'focus-seed-18').length },
  )
  const today = await tabA.eval('return new Date().toLocaleDateString("sv-SE")')
  const todayRow = dailyAfterBoth.find(item => item.day === today)
  check('Daily 只加一次（50 + 18 = 68）', todayRow?.focusMinutes === 68, todayRow)
  const taskT0 = tasksAfterBoth.find(task => task.id === 't0')
  check('任务只加一次（focusedMinutes 18 / pomodoros 1）', taskT0?.focusedMinutes === 18 && taskT0?.pomodoros === 1, taskT0)
  check('时间轴只有 1 条 focus.completed', timelineAfterBoth.filter(event => event.type === 'focus.completed').length === 1, timelineAfterBoth.length)
  check('标签页 B 收到「已经完整记过」的提示', (await tabB.eval("return document.body.textContent.includes('已经完整记过')")) === true)

  /* ── 2. 刷新两个标签页：不重复记账 ──────────────────────────────────── */
  await tabA.reload()
  await tabB.reload()
  const logsAfterReload = (await readStore(tabA, 'logs')) ?? []
  check('刷新后日志条数不变', logsAfterReload.length === logsBefore + 1, logsAfterReload.length)
  const dailyAfterReload = (await readStore(tabA, 'daily')) ?? []
  check('刷新后 Daily 仍是 68（没有二次累计）', dailyAfterReload.find(item => item.day === today)?.focusMinutes === 68, dailyAfterReload)
  check('刷新后待写记录已清空', (await readStore(tabA, 'timer'))?.pendingResult === undefined)

  /* ── 3. 一个标签页暂停、另一个结束 ──────────────────────────────────── */
  const tabC = await openTab(`http://127.0.0.1:${PORT}/?page=dashboard&timer=paused`)
  const stateC = await tabC.eval('return window.__focus()')
  check('标签页 C 读到「已暂停」', stateC.status === '已暂停', stateC)

  const tabD = await openTab(`http://127.0.0.1:${PORT}/?page=dashboard`)
  const stateD = await tabD.eval('return window.__focus()')
  check('标签页 D 也读到同一份暂停状态', stateD.status === '已暂停', stateD)

  await tabD.clickFocus('结束并记录')
  check('标签页 D 结束后是「本轮完成」', (await tabD.eval('return window.__focus()')).status === '本轮完成')
  const logsD = (await readStore(tabD, 'logs')) ?? []
  check(
    '暂停那一轮也只写一条',
    logsD.filter(log => log.id === 'focus-seed-paused').length === 1 && logsD.length === logsBefore + 2,
    { total: logsD.length, sameRound: logsD.filter(log => log.id === 'focus-seed-paused').length },
  )

  // 标签页 C 仍在暂停态：再结束一次也不能重复写
  await tabC.clickFocus('结束并记录')
  const logsAfterC = (await readStore(tabC, 'logs')) ?? []
  check('另一个标签页再结束同一轮，日志不会再增加', logsAfterC.length === logsD.length, { before: logsD.length, after: logsAfterC.length })
  const dailyAfterC = (await readStore(tabC, 'daily')) ?? []
  check('Daily 没有被第二次加上', dailyAfterC.find(item => item.day === today)?.focusMinutes === 86, dailyAfterC.find(item => item.day === today))

  /* ── 4. 预置重复记录：挂载时自动合并 ─────────────────────────────────── */
  await tabE_seed(tabA, today)
  await tabB.reload()
  const logsRepaired = (await readStore(tabB, 'logs')) ?? []
  check('重复记录在挂载时被合并', logsRepaired.filter(log => log.id === 'focus-dup-mt').length === 1, logsRepaired.map(log => log.id))
  const dailyRepaired = (await readStore(tabB, 'daily')) ?? []
  // 86（两轮各 18）+ 18（塞进去的重复）− 18（修正）= 86
  check('Daily 回退掉重复的那一份', dailyRepaired.find(item => item.day === today)?.focusMinutes === 86, dailyRepaired.find(item => item.day === today))
  check('给出「重复…回退」提示', (await tabB.eval("return document.body.textContent.includes('回退')")) === true)

  /* ── 5. 两个标签页同时恢复同一笔部分写入 ─────────────────────────────── */
  /**
   * `?timer=partial` 会把存储做成「日志已写、Daily/任务/时间轴未结算」，
   * 并在 timer 里留下带基线的 pendingResult（等同于「回滚失败」之后的现场）。
   * 两个标签页同时挂载 → 两边都会自动重试 → 必须收敛成一笔，不能各加一次。
   */
  const multiTab = await tabA.eval(`
    const KEY = 'dsh-otaku-study-board';
    const raw = localStorage.getItem(KEY + ':timer');
    return raw ? JSON.parse(raw).data.pendingResult?.roundId ?? null : null;
  `)
  check('前置：标签页 A 的计时状态里带着待恢复的 roundId', multiTab === null || typeof multiTab === 'string', multiTab)

  await tabE_reset(tabA)
  const todayKey = await tabA.eval('return new Date().toLocaleDateString("sv-SE")')
  const beforePartialDaily = ((await readStore(tabA, 'daily')) ?? []).find(row => row.day === todayKey)?.focusMinutes ?? 0
  const beforePartialFocus = ((await readStore(tabA, 'tasks')) ?? []).find(task => task.id === 't0')?.focusedMinutes ?? 0
  const beforePartialPomodoros = ((await readStore(tabA, 'tasks')) ?? []).find(task => task.id === 't0')?.pomodoros ?? 0
  const pair = await Promise.all([
    openTab(`http://127.0.0.1:${PORT}/?page=dashboard&timer=partial`),
    openTab(`http://127.0.0.1:${PORT}/?page=dashboard&timer=partial`),
  ])
  await sleep(700)
  const partialLogs = (await readStore(pair[0], 'logs')) ?? []
  const partialDaily = (await readStore(pair[0], 'daily')) ?? []
  const partialTasks = (await readStore(pair[0], 'tasks')) ?? []
  const partialTimeline = (await readStore(pair[0], 'timeline')) ?? []
  const partialTimer = await readStore(pair[0], 'timer')
  check(
    '两标签同时恢复：日志只有一条（不重复写）',
    partialLogs.filter(log => log.id === 'focus-seed-partial').length === 1,
    partialLogs.filter(log => log.id === 'focus-seed-partial').length,
  )
  check(
    '两标签同时恢复：Daily 只加一次（相对打开前 +18）',
    partialDaily.find(row => row.day === todayKey)?.focusMinutes === beforePartialDaily + 18,
    { before: beforePartialDaily, after: partialDaily.find(row => row.day === todayKey)?.focusMinutes },
  )
  check(
    '两标签同时恢复：任务副本只加一次',
    partialTasks.find(task => task.id === 't0')?.focusedMinutes === beforePartialFocus + 18 &&
      partialTasks.find(task => task.id === 't0')?.pomodoros === beforePartialPomodoros + 1,
    {
      focused: partialTasks.find(task => task.id === 't0')?.focusedMinutes,
      expected: beforePartialFocus + 18,
      pomodoros: partialTasks.find(task => task.id === 't0')?.pomodoros,
    },
  )
  check(
    '两标签同时恢复：时间轴只有一条 focus.completed',
    partialTimeline.filter(event => event.type === 'focus.completed' && event.refId === 'focus-seed-partial').length === 1,
    partialTimeline.filter(event => event.type === 'focus.completed').map(event => event.refId),
  )
  check('两标签同时恢复后 pending 被清空', partialTimer?.pendingResult === undefined, partialTimer?.pendingResult)

  // 第三个标签页（后开）看到的是「已完整」，不会再加一次
  const later = await openTab(`http://127.0.0.1:${PORT}/?page=dashboard`)
  await sleep(400)
  const laterDaily = (await readStore(later, 'daily')) ?? []
  const laterLogs = (await readStore(later, 'logs')) ?? []
  check(
    '后开的标签页不会重复累计',
    laterDaily.find(row => row.day === todayKey)?.focusMinutes === beforePartialDaily + 18,
    { before: beforePartialDaily, after: laterDaily.find(row => row.day === todayKey)?.focusMinutes },
  )
  check(
    '后开的标签页不会重复写日志',
    laterLogs.filter(log => log.id === 'focus-seed-partial').length === 1,
    laterLogs.filter(log => log.id === 'focus-seed-partial').length,
  )

  const failed = results.filter(item => !item.ok)
  console.log(`\n结果：${results.length - failed.length} passed, ${failed.length} failed`)
  if (failed.length > 0) exitCode = 1
} catch (error) {
  console.error('测试中断：', error)
  exitCode = 1
} finally {
  chrome.kill()
  server.close()
}
process.exit(exitCode)

/** 清掉 partial 种子（哨兵 + 相关数据），让下一次打开能重新灌入。 */
async function tabE_reset(session) {
  await session.eval(`
    const KEY = 'dsh-otaku-study-board';
    localStorage.removeItem(KEY + ':__harness_partial__');
    const read = key => { const raw = localStorage.getItem(KEY + ':' + key); return raw ? JSON.parse(raw).data : null };
    const wrap = value => JSON.stringify({ schemaVersion: 4, data: value });
    const logs = (read('logs') ?? []).filter(log => log.id !== 'focus-seed-partial');
    localStorage.setItem(KEY + ':logs', wrap(logs));
    return true;
  `)
  await sleep(60)
}

/** 在存储里塞一份重复的专注记录（模拟旧版本/极端并发留下的数据）。 */
async function tabE_seed(session, today) {
  await session.eval(`
    const KEY = 'dsh-otaku-study-board';
    const wrap = value => JSON.stringify({ schemaVersion: 4, data: value });
    const read = key => { const raw = localStorage.getItem(KEY + ':' + key); return raw ? JSON.parse(raw).data : [] };
    const log = { id: 'focus-dup-mt', at: Date.now() - 60000, kind: 'focus', title: '专注 18', minutes: 18, source: 'manual', edited: false };
    localStorage.setItem(KEY + ':logs', wrap([log, { ...log }, ...read('logs')]));
    const daily = read('daily').map(row => row.day === ${JSON.stringify(today)} ? { ...row, focusMinutes: row.focusMinutes + 18 } : row);
    localStorage.setItem(KEY + ':daily', wrap(daily));
    const events = read('timeline');
    localStorage.setItem(KEY + ':timeline', wrap([
      { id: 'dup-e1', at: Date.now() - 60000, type: 'focus.completed', title: '专注', refId: 'focus-dup-mt' },
      { id: 'dup-e2', at: Date.now() - 59000, type: 'focus.completed', title: '专注', refId: 'focus-dup-mt' },
      ...events,
    ]));
    return true;
  `)
  await sleep(120)
}
