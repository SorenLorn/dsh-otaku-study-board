/**
 * focus-browser.test.mjs — 真实 Chromium 下的专注系统测试（Phase 5.5）。
 *
 * 独立 Chromium（不是 DSH 宿主）。覆盖 jsdom 测不到的部分：
 *   • 真实倒计时（250ms tick）与布局稳定性；
 *   • 1440 / 1100 / 720 三档宽度、深色、reduced-motion；
 *   • 真实点击 / 键盘 / 触屏；
 *   • 刷新恢复（真实 Page.reload）；
 *   • Dashboard → 历史 → 热力图的联动（同一次写入，三个视图都能看到）；
 *   • 自动采集：window 桥推事件 → 落日志 → 切页面仍能采集。
 *
 * 前置：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
 *     --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
 * 运行：node scripts/ui/focus-browser.test.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const PORT = 8795
const DEBUG = 9355
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

const profile = join(DIR, 'profile-focus')
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
    for (let index = 0; index < 100; index += 1) {
      try {
        if ((await this.eval('return Boolean(window.__ready)')) === true) return
      } catch {
        /* navigating */
      }
      await sleep(80)
    }
    throw new Error('harness 未就绪')
  }
  async goto(query) {
    await this.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${query}` })
    await this.waitReady()
    await sleep(160)
  }
  async reload() {
    await this.send('Page.reload', { ignoreCache: false })
    await this.waitReady()
    await sleep(200)
  }
  async box(selector) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
  }
  async click(selector) {
    const point = await this.box(selector)
    if (point === null) throw new Error('找不到元素：' + selector)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }
  async tap(selector) {
    const point = await this.box(selector)
    if (point === null) throw new Error('找不到元素：' + selector)
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] })
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  async key(key, code, keyCode) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
  }
  async shot(name) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join('reports', name), Buffer.from(shot.data, 'base64'))
  }
  /** 按文字点专注动作区里的按钮（真实鼠标事件）。 */
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
    await sleep(120)
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
    await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?page=dashboard`)}`, { method: 'PUT' })
  ).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })

  const readStore = async key =>
    session.eval(`
      const raw = localStorage.getItem('dsh-otaku-study-board:${key}');
      if (!raw) return null;
      try { return JSON.parse(raw).data ?? null } catch { return null }
    `)

  /* ── 1. 初始状态（1440） ─────────────────────────────────────────────── */
  await session.goto('?page=dashboard')
  const idle = await session.eval('return window.__focus()')
  check('1440 初始 25:00', idle.clock === '25:00', idle.clock)
  check('1440 初始状态「待开始」', idle.status === '待开始', idle.status)
  check('1440 有「开始专注」', idle.buttons.includes('开始专注'), idle.buttons)
  check('1440 无横向溢出', idle.overflow === false)
  const clockWidthIdle = idle.width
  await session.shot('wb-focus-idle-light-1440.png')

  /* ── 2. 真实倒计时 + 布局稳定 + 暂停/继续 ─────────────────────────────── */
  await session.clickFocus('开始专注')
  const running = await session.eval('return window.__focus()')
  check('点击后进入「专注中」', running.status === '专注中', running.status)
  check('运行中出现暂停 / 结束', running.buttons.includes('暂停') && running.buttons.includes('结束并记录'), running.buttons)
  check('倒计时宽度固定（不因数字变化推布局）', Math.abs(running.width - clockWidthIdle) <= 1, { idle: clockWidthIdle, running: running.width })
  await sleep(2100)
  const ticked = await session.eval('return window.__focus()')
  check('2 秒后真实倒计时前进', ticked.clock !== running.clock, { before: running.clock, after: ticked.clock })
  check('倒计时变化后宽度仍不变', Math.abs(ticked.width - clockWidthIdle) <= 1, { idle: clockWidthIdle, after: ticked.width })
  await session.shot('wb-focus-running-light-1440.png')

  await session.clickFocus('暂停')
  const paused = await session.eval('return window.__focus()')
  check('暂停后状态「已暂停」', paused.status === '已暂停', paused.status)
  await sleep(1200)
  const stillPaused = await session.eval('return window.__focus()')
  check('暂停期间倒计时冻结', stillPaused.clock === paused.clock, { paused: paused.clock, after: stillPaused.clock })
  await session.clickFocus('继续')
  check('继续后回到「专注中」', (await session.eval('return window.__focus()')).status === '专注中')

  /* ── 3. 结束（0 分钟）不写脏数据 ──────────────────────────────────────── */
  const beforeDirty = (await readStore('logs')) ?? []
  await session.clickFocus('结束并记录')
  await sleep(200)
  const zero = await session.eval('return window.__focus()')
  check('不足 1 分钟结束后进入「本轮完成」', zero.status === '本轮完成', zero.status)
  const afterDirty = (await readStore('logs')) ?? []
  check('不足 1 分钟不写日志', afterDirty.length === beforeDirty.length, { before: beforeDirty.length, after: afterDirty.length })
  check('给出「不足 1 分钟」提示', (await session.eval("return document.body.textContent.includes('不足 1 分钟')")) === true)

  /* ── 4. 完整链路：18 分钟 → 日志 + Daily + 时间轴 + 三个视图 ───────────── */
  await session.goto('?page=dashboard&timer=running18')
  const seeded = await session.eval('return window.__focus()')
  check('种子计时器按时间戳恢复（18 分钟已过 → 剩余 07:00）', seeded.clock === '07:00', seeded.clock)
  check('种子计时器状态为「专注中」', seeded.status === '专注中', seeded.status)
  check('绑定任务显示在面板上', seeded.task.includes('第 1 个任务'), seeded.task)

  const dailyBefore = (await readStore('daily')).find(item => item.day === new Date().toLocaleDateString('sv-SE'))
  await session.clickFocus('结束并记录')
  await sleep(300)
  const done = await session.eval('return window.__focus()')
  check('结束后显示「本轮完成」', done.status === '本轮完成', done.status)
  check('完成反馈写明实际 18 分钟', done.result.includes('18m'), done.result)
  await session.shot('wb-focus-completed-light-1440.png')

  const logs = (await readStore('logs')) ?? []
  const focusLog = logs.find(log => log.kind === 'focus' && log.minutes === 18)
  check('写入一条 18 分钟的专注日志', focusLog !== undefined, logs.slice(0, 2))
  check('日志带 taskId 与 projectId', focusLog?.taskId === 't0' && focusLog?.projectId === 'p1', focusLog)
  check('日志 id 是幂等键（focus- 前缀）', String(focusLog?.id ?? '').startsWith('focus-'), focusLog?.id)
  check('日志 detail 是真实时间区间', typeof focusLog?.detail === 'string' && focusLog.detail.includes('→'), focusLog?.detail)

  const dailyAfter = (await readStore('daily')).find(item => item.day === new Date().toLocaleDateString('sv-SE'))
  check(
    'Daily 今日专注 +18 分钟',
    dailyAfter.focusMinutes === (dailyBefore?.focusMinutes ?? 0) + 18,
    { before: dailyBefore?.focusMinutes, after: dailyAfter?.focusMinutes },
  )
  const timeline = (await readStore('timeline')) ?? []
  check('时间轴多了一条 focus.completed', timeline.some(event => event.type === 'focus.completed' && event.refId === focusLog?.id), timeline.slice(0, 2))
  const taskAfter = (await readStore('tasks')).find(task => task.id === 't0')
  check('任务 focusedMinutes 累加 18', taskAfter?.focusedMinutes === 18, taskAfter?.focusedMinutes)
  check('任务 pomodoros +1', taskAfter?.pomodoros === 1, taskAfter?.pomodoros)
  const statText = await session.eval("return [...document.querySelectorAll('.v4-stat-shelf .v4-stat')].map(node => node.textContent).join(' | ')")
  check('Dashboard 今日专注数字同步为 1h 8m（50+18）', statText.includes('1h 8m'), statText)

  /* ── 5. 历史 / 热力图联动（页面内切换，不重新灌种子） ──────────────────── */
  await session.eval("return window.__click('历史')")
  await sleep(320)
  const today = await session.eval('return new Date().toLocaleDateString("sv-SE")')
  const history = await session.eval(`
    const cell = document.querySelector('.v4-heat-cell[data-day="${today}"]');
    return {
      level: cell?.dataset.level ?? null,
      minutes: cell?.getAttribute('aria-label') ?? '',
      stats: [...document.querySelectorAll('.v4-history-value')].map(node => node.textContent),
    };
  `)
  check('热力图当天强度 = 3 档（50+18 分钟）', history.level === '3', history)
  check('热力图当天标签含 68 分钟', history.minutes.includes('68'), history.minutes)
  await session.eval('return window.__click("Dashboard")')
  await sleep(260)

  /* ── 6. 刷新恢复（真实 Page.reload） ──────────────────────────────────── */
  await session.goto('?page=dashboard&timer=running18')
  await sleep(200)
  await session.reload()
  const restored = await session.eval('return window.__focus()')
  check('刷新后仍是「专注中」', restored.status === '专注中', restored.status)
  check('刷新后剩余时间按时间戳重算', restored.clock === '07:00', restored.clock)
  const timerRaw = await readStore('timer')
  check('刷新后 roundId 保留（重放不重复记账）', String(timerRaw?.roundId ?? '').startsWith('focus-seed-18'), timerRaw?.roundId)

  /* ── 7. 任务绑定：展开后下拉可选 ──────────────────────────────────────── */
  await session.goto('?page=dashboard')
  await session.eval('return window.__focusExpand()')
  await sleep(280)
  const detail = await session.eval(`
    const select = document.querySelector('#v4-focus-task');
    const options = select ? [...select.options].map(o => o.textContent) : [];
    return { hasSelect: Boolean(select), options, expanded: document.querySelector('[data-panel="focus"]')?.classList.contains('is-open') ?? false };
  `)
  check('展开后出现任务下拉', detail.hasSelect && detail.expanded, detail)
  check('下拉含「不绑定」+ 任务', detail.options.length >= 2 && detail.options[0].includes('不绑定'), detail.options)

  await session.eval(`
    const select = document.querySelector('#v4-focus-task');
    select.value = 't2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `)
  await sleep(160)
  check('选择任务后显示任务名', (await session.eval('return window.__focus()')).task.includes('第 3 个任务'), (await session.eval('return window.__focus()')).task)
  await session.shot('wb-focus-settings-light-1100.png')

  /* ── 8. 休息段 ───────────────────────────────────────────────────────── */
  await session.goto('?page=dashboard&timer=break')
  const breakState = await session.eval('return window.__focus()')
  check('休息态显示「休息中」', breakState.status === '休息中', breakState.status)
  check('休息有「跳过休息」', breakState.buttons.includes('跳过休息'), breakState.buttons)
  check('休息时钟是 5 分钟段', /^0[0-4]:\d\d$/.test(breakState.clock), breakState.clock)
  await session.shot('wb-focus-break-light-1440.png')
  await session.clickFocus('暂停休息')
  check('休息可暂停', (await session.eval('return window.__focus()')).status === '休息暂停')
  await session.clickFocus('结束休息')
  check('结束休息回专注待机', (await session.eval('return window.__focus()')).status === '待开始')

  /* ── 9. 键盘 / 触屏 ─────────────────────────────────────────────────── */
  await session.goto('?page=dashboard')
  const focused = await session.eval(`
    const button = [...document.querySelectorAll('.v4-focus-actions button')].find(node => (node.textContent ?? '').trim() === '开始专注');
    button.focus();
    return document.activeElement === button;
  `)
  check('按钮可获得键盘焦点', focused === true, focused)
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' })
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await sleep(200)
  check('键盘 Enter 可开始专注', (await session.eval('return window.__focus()')).status === '专注中')

  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  const beforeTap = await session.eval('return window.__focus()')
  const tapPoint = await session.eval(`
    const button = [...document.querySelectorAll('.v4-focus-actions button')].find(node => (node.textContent ?? '').trim() === '暂停');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
  `)
  if (tapPoint !== null) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tapPoint.x, y: tapPoint.y }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await sleep(260)
  const afterTap = await session.eval('return window.__focus()')
  check('触屏点击可暂停', afterTap.status === '已暂停', { before: beforeTap.status, after: afterTap.status, tapPoint })

  /* ── 10. 自动采集：window 桥 → 落库 → 切页面仍采集 ────────────────────── */
  await session.goto('?page=dashboard')
  const sessionsBefore = ((await readStore('daily')).find(item => item.day === new Date().toLocaleDateString('sv-SE'))?.sessions) ?? 0
  const logsBefore = ((await readStore('logs')) ?? []).length
  await session.eval("return window.__pushEvent('修复了 focus 状态机里 deadline 的推导')")
  await sleep(420)
  // 同一条事件重复投递：内容哈希 + 业务合并应该只留一行
  await session.eval("return window.__pushEvent('修复了 focus 状态机里 deadline 的推导')")
  await sleep(420)
  const logsAfter = (await readStore('logs')) ?? []
  const captured = logsAfter.find(log => String(log.title ?? '').includes('deadline'))
  check('采集事件落库（1 条）', logsAfter.length === logsBefore + 1, { before: logsBefore, after: logsAfter.length })
  check('采集日志 kind 不是 focus（不污染专注）', captured !== undefined && captured.kind !== 'focus', captured)
  check('采集日志 source = auto', captured?.source === 'auto', captured?.source)
  const sessionsAfter = ((await readStore('daily')).find(item => item.day === new Date().toLocaleDateString('sv-SE'))?.sessions) ?? 0
  check('Daily sessions +1（不入 focusMinutes）', sessionsAfter === sessionsBefore + 1, { before: sessionsBefore, after: sessionsAfter })

  await session.eval("return window.__click('任务')")
  await sleep(260)
  await session.eval("return window.__pushEvent('在任务页继续记录：切页面监听不中断')")
  await sleep(420)
  const afterSwitch = (await readStore('logs')) ?? []
  check('切换页面后采集仍工作', afterSwitch.length === logsAfter.length + 1, { before: logsAfter.length, after: afterSwitch.length })
  const captureStatus = await session.eval("return document.querySelector('.osb-page')?.getAttribute('data-capture')")
  check('采集状态为 on（window 桥已绑定）', captureStatus === 'on', captureStatus)

  /* ── 11. 1100 / 720 / 深色 ───────────────────────────────────────────── */
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&timer=running18')
  const mid = await session.eval('return window.__focus()')
  check('1100 无横向溢出', mid.overflow === false)
  await session.shot('wb-focus-light-1100.png')

  await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 900, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&timer=running18')
  const small = await session.eval('return window.__focus()')
  check('720 无横向溢出', small.overflow === false, small.overflow)
  check('720 倒计时字号收敛到 26px', (await session.eval("return getComputedStyle(document.querySelector('.v4-focus-clock')).fontSize")) === '26px')
  check('720 动作按钮仍可用', small.buttons.includes('暂停'), small.buttons)
  await session.shot('wb-focus-light-720.png')

  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&timer=completed&theme=dark')
  const dark = await session.eval(`
    const clock = document.querySelector('.v4-focus-clock');
    const chip = document.querySelector('.v4-focus-state-chip');
    return {
      status: chip?.textContent ?? '',
      clock: clock?.textContent ?? '',
      color: clock ? getComputedStyle(clock).color : '',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `)
  check('深色下仍是「本轮完成」', dark.status === '本轮完成', dark.status)
  check('深色下显示真实 18 分钟', dark.clock === '00:00' && (await session.eval("return document.body.textContent.includes('18m')")), dark)
  check('深色下倒计时颜色不是纯黑', dark.color !== 'rgb(0, 0, 0)', dark.color)
  check('深色无横向溢出', dark.overflow === false)
  await session.shot('wb-focus-dark-1440.png')

  /* ── 12. 未保存的结算：注入真实写入失败，界面不撒谎，刷新能补 ─────────── */
  /**
   * 真实浏览器里的失败注入：在文档加载前把 `Storage.prototype.setItem` 包一层，
   * 只让 `:daily` 这个键抛 QuotaExceededError。这样走的是**生产代码的真实路径**
   * （createBrowserStore → writeTransaction → 回滚），不是模拟函数。
   */
  const injected = await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function () {
        if (!location.search.includes('fault=daily')) return;
        var proto = Storage.prototype;
        var original = proto.setItem;
        proto.setItem = function (key, value) {
          if (String(key).indexOf(':daily') >= 0) {
            var error = new Error('quota');
            error.name = 'QuotaExceededError';
            throw error;
          }
          return original.call(this, key, value);
        };
      })();
    `,
  })

  await session.goto('?page=dashboard&timer=fault&fault=daily')
  const logsBeforeFault = ((await readStore('logs')) ?? []).length
  await session.clickFocus('结束并记录')
  await sleep(400)
  const faultView = await session.eval(`
    return {
      title: document.querySelector('.v4-focus-result-title')?.textContent ?? '',
      buttons: [...document.querySelectorAll('.v4-focus-actions button')].map(node => (node.textContent ?? '').trim()),
      notice: document.querySelector('[data-osb-notices]')?.textContent ?? '',
      elapsed: document.querySelector('.v4-focus-clock-elapsed')?.textContent ?? '',
      pending: (() => { try { return JSON.parse(localStorage.getItem('dsh-otaku-study-board:timer')).data.pendingResult ?? null } catch { return null } })(),
    };
  `)
  const logsAfterFault = (await readStore('logs')) ?? []
  check('写入失败时界面显示「未保存」', faultView.title.includes('未保存'), faultView.title)
  check('写入失败时没有「开始下一轮」（避免丢记录）', faultView.buttons.includes('开始下一轮') === false, faultView.buttons)
  check('写入失败时给出重试入口', faultView.buttons.includes('重试写入'), faultView.buttons)
  check('写入失败时四个实体都没被写（事务回滚）', logsAfterFault.length === logsBeforeFault, { before: logsBeforeFault, after: logsAfterFault.length })
  check('提示点名失败键（日聚合）', faultView.notice.includes('日聚合'), faultView.notice)
  check('待写记录落进计时状态（刷新不丢）', faultView.pending !== null, faultView.pending)
  check('完成态的「已专注」显示真实 18 分（不是目标 25）', faultView.elapsed === '已专注 18 分', faultView.elapsed)
  await session.shot('wb-focus-unsaved-light-1440.png')

  /**
   * Phase 6.1：失败 / 拒绝放弃的说明变长了（点名实体 + 备份建议）。
   * 确认它在 720 下是换行，而不是把面板顶出横向滚动条。
   */
  await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 900, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&timer=fault&fault=daily')
  await sleep(300)
  // 720 下按钮在首屏之外，坐标点击会打空 —— 这里用程序化点击，位置不影响判定
  const settledSmall = await session.eval("return window.__click('结束并记录')")
  check('720 · 能触发结算（按钮在首屏外也点得到）', settledSmall === true, settledSmall)
  await sleep(500)
  const unsavedSmall = await session.eval(`
    const page = window.__focus();
    const el = document.querySelector('.v4-focus-result-sub');
    const style = el ? getComputedStyle(el) : null;
    return {
      overflow: page.overflow,
      whiteSpace: style?.whiteSpace ?? '',
      scrollWidth: el ? el.scrollWidth : 0,
      clientWidth: el ? el.clientWidth : 0,
      text: (el?.textContent ?? '').slice(0, 16),
    };
  `)
  check('720 · 失败说明不撑出横向溢出', unsavedSmall.overflow === false, unsavedSmall.overflow)
  check('720 · 失败说明允许换行（不是 nowrap 截断）', unsavedSmall.whiteSpace === 'normal', unsavedSmall)
  check(
    '720 · 失败说明没有被截断（scrollWidth 不超过容器）',
    unsavedSmall.scrollWidth <= unsavedSmall.clientWidth + 1,
    unsavedSmall,
  )
  await session.shot('wb-focus-unsaved-720.png')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })

  // 解除注入并重新打开：挂载时应自动补写
  await session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier })
  await session.goto('?page=dashboard')
  await sleep(420)
  const logsAfterRecovery = (await readStore('logs')) ?? []
  const recoveryView = await session.eval(`
    return {
      title: document.querySelector('.v4-focus-result-title')?.textContent ?? '',
      pending: (() => { try { return JSON.parse(localStorage.getItem('dsh-otaku-study-board:timer')).data.pendingResult ?? null } catch { return null } })(),
      buttons: [...document.querySelectorAll('.v4-focus-actions button')].map(node => (node.textContent ?? '').trim()),
    };
  `)
  check('刷新后自动补写这一笔', logsAfterRecovery.length === logsBeforeFault + 1, { before: logsBeforeFault, after: logsAfterRecovery.length })
  check('补写的日志 id 就是那一轮的 roundId', logsAfterRecovery.some(log => log.id === 'focus-seed-fault'), logsAfterRecovery.map(log => log.id).slice(0, 3))
  check('刷新后待写记录被清空', recoveryView.pending === null, recoveryView.pending)
  check('刷新后恢复「开始下一轮」', recoveryView.buttons.includes('开始下一轮'), recoveryView.buttons)

  /* ── 13. reduced-motion ─────────────────────────────────────────────── */
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await session.goto('?page=dashboard&timer=running18')
  const reduced = await session.eval(`
    const fill = document.querySelector('.v4-focus-track-fill');
    return { reduced: window.__reduced(), duration: fill ? getComputedStyle(fill).transitionDuration : '' };
  `)
  check('reduced-motion 生效', reduced.reduced === true, reduced)
  check('reduced-motion 下进度条无过渡', reduced.duration === '0s', reduced.duration)
  await session.send('Emulation.setEmulatedMedia', { features: [] })

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
