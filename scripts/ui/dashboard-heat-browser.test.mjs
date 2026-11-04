/**
 * dashboard-heat-browser.test.mjs — Dashboard 首页热力图的真实 Chromium 验收（Phase 6.2）。
 *
 * 覆盖 jsdom 测不到的部分：
 *   • 真实布局：1440 / 1100 / 720 三档宽度下「卡片内滚动、页面不横向溢出」；
 *   • 真实鼠标：悬停出 tooltip、点击打开当天详情抽屉；
 *   • 真实主题：深色下格子的计算色值与浅色不同（变量跟着组件走）；
 *   • 真实截图：reports/v4-dash-heat-*.png。
 *
 * 数据来自 harness 的 `?demo=year`（跨 365 天、daily 与日志对得上），
 * 与 History 页用的是同一份种子 —— 不是为首页单独编的数据。
 *
 * 前置：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
 *     --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
 * 运行：node scripts/ui/dashboard-heat-browser.test.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const PORT = 8794
const DEBUG = 9354
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

const profile = join(DIR, 'profile-heat')
await rm(profile, { recursive: true, force: true })
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${DEBUG}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
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
        if (this.pending.delete(id)) reject(new Error(`timeout ${method}`))
      }, 12000)
    })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval')
    return result.result.value
  }
  async goto(query) {
    await this.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${query}` })
    for (let index = 0; index < 80; index += 1) {
      try {
        if ((await this.eval('return Boolean(window.__ready)')) === true) return
      } catch {
        /* navigation in flight */
      }
      await sleep(80)
    }
    throw new Error(`harness 未就绪：${query}`)
  }
  async box(selector) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
  }
  async moveTo(selector) {
    const point = await this.box(selector)
    if (point === null) throw new Error(`找不到元素：${selector}`)
    await sleep(80)
    const fresh = await this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fresh.x, y: fresh.y })
    return fresh
  }
  async clickAt(selector) {
    const point = await this.box(selector)
    if (point === null) throw new Error(`找不到元素：${selector}`)
    await sleep(80)
    const fresh = await this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fresh.x, y: fresh.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fresh.x, y: fresh.y, button: 'left', clickCount: 1 })
  }
  async shot(name) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(join('reports', name), Buffer.from(shot.data, 'base64'))
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
    await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?page=dashboard&demo=year`)}`, { method: 'PUT' })
  ).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&demo=year&theme=light')
  await sleep(320)

  /* ── 1. 1440：首页直接看到热力图 ─────────────────────────────────────── */
  const wide = await session.eval(`
    const card = document.querySelector('.v4-dash-heat');
    const grid = document.querySelector('.v4-dash-heat .v4-heat-grid');
    const cells = document.querySelectorAll('.v4-dash-heat .v4-heat-cell[data-day]');
    const levels = {};
    for (const cell of cells) levels[cell.dataset.level] = (levels[cell.dataset.level] ?? 0) + 1;
    const root = document.documentElement;
    return {
      card: card !== null,
      onDashboard: card !== null && card.closest('.v4-dashboard') !== null,
      cells: cells.length,
      months: document.querySelectorAll('.v4-dash-heat .v4-heat-months span').length,
      weekdays: [...document.querySelectorAll('.v4-dash-heat .v4-heat-weekdays span')].map(node => node.textContent).join(''),
      levels,
      gridW: grid === null ? 0 : Math.round(grid.getBoundingClientRect().width),
      cardW: card === null ? 0 : Math.round(card.getBoundingClientRect().width),
      overflowX: root.scrollWidth > root.clientWidth,
    };
  `)
  check('1440 · Dashboard 首页直接渲染热力图卡片（不需要跳转）', wide.card === true && wide.onDashboard === true, wide)
  check('1440 · 渲染 365 个可点格子', wide.cells === 365, wide.cells)
  check('1440 · 12 个月份标签 + 一/三/五 星期标签', wide.months >= 12 && wide.weekdays === '一三五', wide)
  check('1440 · 出现 3 档以上真实强度（不是全空）', Object.keys(wide.levels).filter(level => level !== '0').length >= 3, wide.levels)
  check('1440 · 热力图不宽于卡片、页面无横向溢出', wide.gridW <= wide.cardW && wide.overflowX === false, {
    gridW: wide.gridW,
    cardW: wide.cardW,
    overflowX: wide.overflowX,
  })
  await session.shot('v4-dash-heat-1440-light.png')

  /* ── 2. 悬停：三项指标与格子数据一致 ──────────────────────────────────── */
  const targetDay = await session.eval(`
    const cell = [...document.querySelectorAll('.v4-dash-heat .v4-heat-cell[data-day]')].reverse().find(node => Number(node.dataset.level) >= 2);
    if (!cell) return null;
    return { day: cell.dataset.day, level: cell.dataset.level, label: cell.getAttribute('aria-label') ?? '' };
  `)
  check('找到一格中等强度以上的日期用于悬停', targetDay !== null, targetDay)
  if (targetDay !== null) {
    await session.moveTo(`.v4-dash-heat .v4-heat-cell[data-day="${targetDay.day}"]`)
    await sleep(220)
    const tip = await session.eval(`
      const el = document.querySelector('.v4-heat-tip');
      return el === null ? null : { text: el.textContent ?? '', visible: el.getBoundingClientRect().height > 0 };
    `)
    const done = /完成 (\d+) 个任务/.exec(targetDay.label)?.[1] ?? ''
    const minutes = /专注 (\d+) 分钟/.exec(targetDay.label)?.[1] ?? ''
    const times = /专注 (\d+) 次/.exec(targetDay.label)?.[1] ?? ''
    check('悬停出现 tooltip', tip !== null && tip.visible === true, tip)
    check(
      'tooltip 含 完成任务 / 专注时长 / 专注次数',
      tip !== null &&
        tip.text.includes(`完成任务：${done}`) &&
        tip.text.includes(`专注时间：${minutes} 分钟`) &&
        tip.text.includes(`专注次数：${times} 次`),
      { tip: tip?.text, done, minutes, times },
    )
    check('tooltip 的日期就是悬停的那一天', tip !== null && tip.text.startsWith(targetDay.day), tip?.text)
  }

  /* ── 3. 点击：打开当天详情抽屉 ────────────────────────────────────────── */
  if (targetDay !== null) {
    await session.clickAt(`.v4-dash-heat .v4-heat-cell[data-day="${targetDay.day}"]`)
    await sleep(420)
    const drawer = await session.eval(`
      const el = document.querySelector('.v4-drawer');
      return el === null ? null : { text: (el.textContent ?? '').slice(0, 160), overlay: el.closest('.v4-overlay') !== null };
    `)
    check('点击格子打开当天详情抽屉', drawer !== null && drawer.overlay === true, drawer)
    check('抽屉标题带日期与星期', drawer !== null && /周[一二三四五六日]/.test(drawer.text), drawer?.text)
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await sleep(200)
  }

  /* ── 4. 深色主题 ─────────────────────────────────────────────────────── */
  const lightColor = await session.eval(`
    const cell = document.querySelector('.v4-dash-heat .v4-heat-cell[data-level="3"]');
    return cell === null ? null : getComputedStyle(cell).backgroundColor;
  `)
  await session.goto('?page=dashboard&demo=year&theme=dark')
  await sleep(320)
  const dark = await session.eval(`
    const cell = document.querySelector('.v4-dash-heat .v4-heat-cell[data-level="3"]');
    const legend = document.querySelector('.v4-dash-heat .v4-heat-legend i[data-level="3"]');
    const root = document.documentElement;
    return {
      cell: cell === null ? null : getComputedStyle(cell).backgroundColor,
      legend: legend === null ? null : getComputedStyle(legend).backgroundColor,
      overflowX: root.scrollWidth > root.clientWidth,
    };
  `)
  check('深色下热力图仍然有颜色（不是透明）', dark.cell !== null && dark.cell !== 'rgba(0, 0, 0, 0)', dark.cell)
  check('深色档位与浅色不同（主题变量生效）', dark.cell !== lightColor, { light: lightColor, dark: dark.cell })
  check('图例与格子同源（同一套变量）', dark.legend === dark.cell, { legend: dark.legend, cell: dark.cell })
  check('深色下页面无横向溢出', dark.overflowX === false)
  await session.shot('v4-dash-heat-1440-dark.png')

  /* ── 5. 1100 / 720 ───────────────────────────────────────────────────── */
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&demo=year&theme=light')
  await sleep(320)
  const mid = await session.eval(`
    const root = document.documentElement;
    const card = document.querySelector('.v4-dash-heat');
    const grid = document.querySelector('.v4-dash-heat .v4-heat-grid');
    return {
      cells: document.querySelectorAll('.v4-dash-heat .v4-heat-cell[data-day]').length,
      overflowX: root.scrollWidth > root.clientWidth,
      cardW: card === null ? 0 : Math.round(card.getBoundingClientRect().width),
      gridW: grid === null ? 0 : Math.round(grid.getBoundingClientRect().width),
    };
  `)
  check('1100 · 仍是 365 个格子', mid.cells === 365, mid.cells)
  check('1100 · 无横向溢出', mid.overflowX === false, mid)
  await session.eval("document.querySelector('.v4-dash-heat').scrollIntoView({ block: 'center' }); return true")
  await sleep(160)
  await session.shot('v4-dash-heat-1100-light.png')

  await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 900, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&demo=year&theme=light')
  await sleep(320)
  const narrow = await session.eval(`
    const root = document.documentElement;
    const scroll = document.querySelector('.v4-dash-heat .v4-heat-scroll');
    const card = document.querySelector('.v4-dash-heat');
    const hint = document.querySelector('.v4-dash-heat .v4-heat-scrollhint');
    const offenders = [...document.querySelectorAll('body *')]
      .filter(node => {
        // 热力图自己的滚动容器会「越界」，那是被裁剪的滚动内容，不算页面溢出
        if (node.closest('.v4-heat-scroll') !== null) return false
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.right > root.clientWidth + 1 || box.left < -1);
      })
      .slice(0, 4)
      .map(node => String(node.className).slice(0, 40));
    return {
      cells: document.querySelectorAll('.v4-dash-heat .v4-heat-cell[data-day]').length,
      overflowX: root.scrollWidth > root.clientWidth,
      offenders,
      cardW: card === null ? 0 : Math.round(card.getBoundingClientRect().width),
      scrollClient: scroll === null ? 0 : scroll.clientWidth,
      scrollWidth: scroll === null ? 0 : scroll.scrollWidth,
      hint: hint === null ? '' : getComputedStyle(hint).display,
    };
  `)
  check('720 · 卡片宽度不超出视口', narrow.cardW <= 720, narrow.cardW)
  check('720 · 由卡片内部滚动吃掉宽度，页面无横向溢出', narrow.overflowX === false && narrow.offenders.length === 0, narrow)
  check('720 · 出现了「左右滑动」提示', narrow.hint === 'block', narrow.hint)
  check('720 · 365 个格子仍在（可横向查看全年）', narrow.cells === 365 && narrow.scrollWidth > narrow.scrollClient, narrow)
  await session.eval("document.querySelector('.v4-dash-heat').scrollIntoView({ block: 'center' }); return true")
  await sleep(160)
  await session.shot('v4-dash-heat-720-light.png')

  // 深色 + 窄屏也留一张：卡片内滚动与深色档位在这张里同时可见
  await session.goto('?page=dashboard&demo=year&theme=dark')
  await sleep(320)
  await session.eval("document.querySelector('.v4-dash-heat').scrollIntoView({ block: 'center' }); return true")
  await sleep(160)
  const darkNarrow = await session.eval(`
    const root = document.documentElement;
    const cell = document.querySelector('.v4-dash-heat .v4-heat-cell[data-level="3"]');
    return { overflowX: root.scrollWidth > root.clientWidth, cell: cell === null ? null : getComputedStyle(cell).backgroundColor };
  `)
  check('720 深色 · 无横向溢出且格子仍有着色', darkNarrow.overflowX === false && darkNarrow.cell !== null, darkNarrow)
  await session.shot('v4-dash-heat-720-dark.png')
} catch (error) {
  console.error('Dashboard 热力图浏览器测试异常：', error)
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

const failed = results.filter(item => !item.ok).length
console.log(`\n结果：${results.length - failed} passed, ${failed} failed`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
