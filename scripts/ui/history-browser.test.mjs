/**
 * history-browser.test.mjs — 真实 Chromium 下的历史页测试（Phase 5.4）。
 *
 * 覆盖 jsdom 测不到的部分：真实悬停 tooltip 与边缘夹取、12px 格子的真实点击、
 * 键盘漫游、720 横向滚动容器、深色色阶、reduced-motion。
 *
 * 前置：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
 *     --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
 * 运行：node scripts/ui/history-browser.test.mjs
 *
 * 独立 Chromium，不是 DSH 宿主。
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

const profile = join(DIR, 'profile-history')
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
  async goto(query) {
    await this.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${query}` })
    for (let index = 0; index < 100; index += 1) {
      try {
        if ((await this.eval('return Boolean(window.__ready)')) === true) return
      } catch {
        /* navigating */
      }
      await sleep(80)
    }
    throw new Error('harness 未就绪：' + query)
  }
  async box(selector) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
    `)
  }
  async moveTo(selector) {
    const point = await this.box(selector)
    if (point === null) throw new Error('找不到元素：' + selector)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    return point
  }
  async clickAt(selector) {
    const point = await this.box(selector)
    if (point === null) throw new Error('找不到元素：' + selector)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }
  async key(key, code, keyCode) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
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
    await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?page=history&theme=light`)}`, { method: 'PUT' })
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
  await session.goto('?page=history&theme=light')
  await sleep(300)

  /* 1. 结构 */
  const base = await session.eval(`
    const cells = document.querySelectorAll('.v4-heat-cell[data-day]');
    const levels = [...new Set([...cells].map(cell => cell.dataset.level))].sort();
    return {
      cells: cells.length,
      months: document.querySelectorAll('.v4-heat-months span').length,
      levels,
      stats: [...document.querySelectorAll('.v4-history-value')].map(node => node.textContent),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      size: Math.round(cells[0]?.getBoundingClientRect().width ?? 0),
    };
  `)
  check('1440 渲染 365 个格子', base.cells === 365, base.cells)
  check('月份标签 >= 12', base.months >= 12, base.months)
  check('至少出现 3 种强度（真实分布）', base.levels.length >= 3, base.levels)
  check('格子 12px（不是难以辨认的微缩方块）', base.size === 12, base.size)
  check('1440 无横向溢出', base.overflow === false)

  /* 2. tooltip 悬停 + 边缘夹取 */
  const hover = await session.moveTo('.v4-heat-cell[data-day]')
  await sleep(220)
  const tip = await session.eval(`
    const el = document.querySelector('.v4-heat-tip');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), text: el.textContent, vw: innerWidth };
  `)
  check('悬停显示 tooltip 且不遮挡出屏', tip !== null && tip.left >= 0 && tip.right <= tip.vw, tip)
  check(
    'tooltip 包含日期 / 完成 / 专注 / 活动',
    tip?.text?.includes('完成任务：') === true && tip?.text?.includes('专注时间：') === true && tip?.text?.includes('学习活动：') === true,
    tip?.text,
  )
  check(
    '最左列 tooltip 被夹在视口内（left >= 8）',
    tip !== null && tip.left >= 8,
    tip?.left,
  )
  const shotTip = await session.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'wb-history-tooltip-light-1440.png'), Buffer.from(shotTip.data, 'base64'))

  /* 3. 点击今天 → 抽屉 */
  await session.moveTo('.v4-heat-cell.is-today')
  await session.clickAt('.v4-heat-cell.is-today')
  await sleep(420)
  const drawer = await session.eval(`
    const el = document.querySelector('.v4-drawer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), text: el.textContent, overlay: document.querySelector('.v4-overlay')?.getAttribute('data-overlay') };
  `)
  check('点击日期打开统一抽屉', drawer !== null && drawer.overlay === 'drawer' && drawer.w === 440, drawer)
  check('抽屉显示当天真实数据', drawer?.text?.includes('当天活动') === true && drawer?.text?.includes('当天完成的专注') === true, drawer?.text)
  const shotDrawer = await session.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'wb-history-day-light-1440.png'), Buffer.from(shotDrawer.data, 'base64'))
  await session.key('Escape', 'Escape', 27)
  await sleep(360)
  check('Esc 关闭日期详情', (await session.eval("return document.querySelector('.v4-drawer') === null")) === true)

  /* 4. 键盘漫游 */
  await session.eval(`
    const cell = document.querySelector('.v4-heat-cell.is-today');
    cell.focus();
    return document.activeElement?.dataset.day ?? '';
  `)
  const before = await session.eval("return document.activeElement?.dataset.day ?? ''")
  await session.key('ArrowLeft', 'ArrowLeft', 37)
  await sleep(160)
  const after = await session.eval("return document.activeElement?.dataset.day ?? ''")
  check('方向键移动焦点（左移一周）', before !== '' && after !== '' && before !== after, { before, after })
  await session.key('Enter', 'Enter', 13)
  await sleep(360)
  const keyDrawer = await session.eval("return document.querySelector('.v4-drawer')?.textContent?.slice(0, 40) ?? ''")
  check('Enter 打开焦点所在日期', keyDrawer.includes(after), { after, keyDrawer })
  await session.key('Escape', 'Escape', 27)
  await sleep(300)

  /* 5. 范围切换 */
  await session.eval("[...document.querySelectorAll('.v4-segment')].find(b => b.textContent === '90 天').click(); return true")
  await sleep(320)
  const range90 = await session.eval(`
    return {
      cells: document.querySelectorAll('.v4-heat-cell[data-day]').length,
      stats: [...document.querySelectorAll('.v4-history-value')].map(node => node.textContent),
    };
  `)
  check('切到 90 天后只渲染 90 个格子', range90.cells === 90, range90.cells)
  check('统计分母同步为 90', range90.stats[0]?.endsWith('/ 90') === true, range90.stats)
  await session.eval("[...document.querySelectorAll('.v4-segment')].find(b => b.textContent === '30 天').click(); return true")
  await sleep(280)
  check('切到 30 天后只渲染 30 个格子', (await session.eval("return document.querySelectorAll('.v4-heat-cell[data-day]').length")) === 30)
  await session.eval("[...document.querySelectorAll('.v4-segment')].find(b => b.textContent === '365 天').click(); return true")
  await sleep(280)

  /* 6. 列表分页 */
  const list = await session.eval(`
    return {
      groups: document.querySelectorAll('.v4-history-group').length,
      more: [...document.querySelectorAll('button')].some(b => b.textContent.includes('加载更早')),
    };
  `)
  check('列表默认只渲染 8 天', list.groups === 8 && list.more === true, list)
  await session.eval("[...document.querySelectorAll('button')].find(b => b.textContent.includes('加载更早')).click(); return true")
  await sleep(260)
  const moreGroups = await session.eval("return document.querySelectorAll('.v4-history-group').length")
  check('加载更多后展示更多天', moreGroups > list.groups, { before: list.groups, after: moreGroups })

  /* 7. 1100 / 720 */
  for (const width of [1100, 720]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width, height: 940, deviceScaleFactor: 1, mobile: false })
    await session.goto(`?page=history&theme=dark&w=${width}`)
    await sleep(320)
    const layout = await session.eval(`
      const root = document.documentElement;
      const scroll = document.querySelector('.v4-heat-scroll');
      const cell = document.querySelector('.v4-heat-cell[data-day]');
      return {
        overflow: root.scrollWidth > root.clientWidth,
        scrollable: scroll ? scroll.scrollWidth > scroll.clientWidth : false,
        cell: Math.round(cell?.getBoundingClientRect().width ?? 0),
        stats: getComputedStyle(document.querySelector('.v4-history-stats')).gridTemplateColumns.split(' ').filter(Boolean).length,
        dark: document.body.hasAttribute('data-ds-dark-theme'),
      };
    `)
    check(`${width}px 无页面横向溢出`, layout.overflow === false, layout)
    // 1100 时 53 列仍能塞进 1040 内容宽度，不需要滚动；720 才交给滚动容器。
    check(`${width}px 热力图宽度策略正确`, width === 1100 ? layout.scrollable === false : layout.scrollable === true, layout)
    check(`${width}px 格子仍为 12px`, layout.cell === 12, layout.cell)
    check(`${width}px 深色生效`, layout.dark === true)
    if (width === 720) {
      const shot = await session.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join('reports', 'wb-history-dark-720.png'), Buffer.from(shot.data, 'base64'))
    }
  }

  /* 8. 深色色阶与浅色不同 */
  const darkCell = await session.eval("return getComputedStyle(document.querySelector('.v4-heat-cell[data-level=\"3\"]')).backgroundColor")
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=history&theme=light')
  await sleep(300)
  const lightCell = await session.eval("return getComputedStyle(document.querySelector('.v4-heat-cell[data-level=\"3\"]')).backgroundColor")
  check('深色与浅色使用不同色阶', darkCell !== lightCell && darkCell.length > 0, { darkCell, lightCell })

  /* 9. reduced-motion */
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await session.goto('?page=history&theme=light')
  await sleep(300)
  await session.moveTo('.v4-heat-cell[data-day]')
  await sleep(150)
  const reduced = await session.eval(`
    const tip = document.querySelector('.v4-heat-tip');
    const cell = document.querySelector('.v4-heat-cell[data-day]');
    return {
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      tip: tip ? getComputedStyle(tip).animationDuration : 'none',
      cell: getComputedStyle(cell).transitionDuration,
    };
  `)
  check('reduced-motion 下 tooltip/格子动效为 0s', reduced.matches === true && reduced.tip === '0s' && reduced.cell === '0s', reduced)
  await session.send('Emulation.setEmulatedMedia', { features: [] })
} catch (error) {
  console.error('历史浏览器测试异常：', error)
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
console.log(`\n历史浏览器结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
