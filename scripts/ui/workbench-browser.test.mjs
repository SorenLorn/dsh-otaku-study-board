/**
 * workbench-browser.test.mjs — 真实 Chromium 下的统一工作台交互测试。
 *
 * 覆盖 jsdom 测不到的部分：真实焦点、真实键盘事件、真实滚动锁、
 * reduced-motion 生效、抽屉在小屏的铺满、以及刷新后数据仍在。
 *
 * 前置（先构建测试页）：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
 *     --format=iife --jsx=automatic --loader:.css=text \
 *     --outfile="$TEMP/sorchron-wb/harness.js"
 * 运行：node scripts/ui/workbench-browser.test.mjs
 *
 * 独立 Chromium，不是 DSH 宿主。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const PORT = 8792
const DEBUG = 9352
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

const profile = join(DIR, 'profile-test')
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
      }, 10000)
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
    throw new Error('harness 未就绪：' + query)
  }
  async click(selector, offset) {
    const point = await this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(${offset !== undefined ? offset.x : 'r.x + r.width / 2'}), y: Math.round(${offset !== undefined ? offset.y : 'r.y + r.height / 2'}) };
    `)
    if (point === null) throw new Error('找不到元素：' + selector)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    return point
  }
  async key(key, code, keyCode, modifiers = 0) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers })
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
  await session.goto('?page=dashboard&theme=light')

  /* 1. 初始结构 */
  const initial = await session.eval(`
    return {
      stats: document.querySelectorAll('.v4-stat-button').length,
      classic: document.body.textContent.includes('经典'),
      tabs: document.querySelectorAll('[role="tab"]').length,
      osbCards: document.querySelectorAll('.osb-card, .osb-hero').length,
      hasV3Css: [...document.querySelectorAll('style')].some(node => node.textContent.includes('.osb-card')),
      glass3: document.querySelectorAll('.v4-glass-3').length,
    };
  `)
  check('1440 四个指标可点', initial.stats === 4, initial.stats)
  check('页面没有经典入口文案', initial.classic === false)
  check('没有双工作台切换器', initial.tabs === 0, initial.tabs)
  check('不再渲染 V3 卡片 / Hero', initial.osbCards === 0, initial.osbCards)
  check('V3 样式仍随包注入（样式隔离而非删除）', initial.hasV3Css === true)

  /* 2. 点击指标 → 抽屉 */
  await session.click('.v4-stat-button')
  await sleep(460)
  const drawer = await session.eval(`
    const el = document.querySelector('.v4-drawer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    const close = document.querySelector('.v4-close');
    return {
      w: Math.round(r.width), x: Math.round(r.x), h: Math.round(r.height),
      overlay: document.querySelector('.v4-overlay')?.getAttribute('data-overlay'),
      locked: document.body.style.overflow === 'hidden',
      active: document.activeElement?.className,
      closeLabel: close?.getAttribute('aria-label'),
      bg: c.backgroundColor, filter: c.backdropFilter, radius: c.borderTopLeftRadius,
      text: el.textContent.slice(0, 60),
    };
  `)
  check('点击指标打开右侧抽屉', drawer !== null && drawer.overlay === 'drawer')
  check('抽屉宽 440 且贴右', drawer?.w === 440 && drawer.x + drawer.w === 1440, { w: drawer?.w, x: drawer?.x })
  check('抽屉是独立浮层材质（半透明 + 模糊 + 圆角）', Boolean(drawer?.filter?.includes('blur')) && drawer.radius !== '0px', { filter: drawer?.filter, bg: drawer?.bg })
  check('打开时背景滚动被锁', drawer?.locked === true)
  check('初始焦点落在关闭按钮', drawer?.active?.includes('v4-close') === true && drawer?.closeLabel === '关闭', drawer?.active)
  check('抽屉正文是统计内容', drawer?.text?.includes('今日任务') === true, drawer?.text)

  /* 3. Tab 焦点陷阱 */
  const trap = []
  for (let index = 0; index < 8; index += 1) {
    await session.key('Tab', 'Tab', 9)
    trap.push(
      await session.eval(`
        const panel = document.querySelector('.v4-drawer');
        return { inside: panel?.contains(document.activeElement) ?? false, cls: document.activeElement?.className };
      `),
    )
  }
  check('连续 Tab 焦点始终留在抽屉内', trap.every(item => item.inside), trap.map(item => item.cls))

  /* 4. Esc 关闭 + 焦点回到触发按钮 */
  await session.key('Escape', 'Escape', 27)
  await sleep(420)
  const afterEsc = await session.eval(`
    return {
      drawer: document.querySelector('.v4-drawer') !== null,
      locked: document.body.style.overflow === 'hidden',
      active: document.activeElement?.className,
      activeText: document.activeElement?.textContent?.slice(0, 12),
    };
  `)
  check('Esc 关闭抽屉并解除滚动锁', afterEsc.drawer === false && afterEsc.locked === false, afterEsc)
  check('关闭后焦点回到触发按钮', afterEsc.active?.includes('v4-stat-button') === true, afterEsc)

  /* 5. 点遮罩关闭 */
  await session.click('.v4-stat-button')
  await sleep(420)
  await session.click('.v4-overlay', { x: 40, y: 700 })
  await sleep(420)
  check('点击遮罩关闭浮层', (await session.eval("return document.querySelector('.v4-overlay') === null")) === true)

  /* 6. 弹层新建 → 刷新后仍在 */
  const before = await session.eval('return window.__tasks().length')
  await session.eval(
    "const button=[...document.querySelectorAll('button')].find(item=>item.textContent.includes('新建任务')); button.click(); return true",
  )
  await sleep(420)
  const modal = await session.eval(`
    const el = document.querySelector('.v4-modal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), x: Math.round(r.x), overlay: document.querySelector('.v4-overlay')?.getAttribute('data-overlay'), title: el.querySelector('h2')?.textContent };
  `)
  check('顶部新建打开居中弹层', modal !== null && modal.overlay === 'modal' && modal.title === '新建任务', modal)
  check('弹层宽度 520 且水平居中', modal?.w === 520 && Math.abs(modal.x + modal.w / 2 - 720) <= 1, modal)

  await session.eval(`
    const input = document.querySelector('.v4-modal input[aria-label="任务标题"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '浏览器测试创建的任务');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const create = [...document.querySelectorAll('.v4-modal button')].find(item => item.textContent.trim() === '创建');
    create.click();
    return true;
  `)
  await sleep(460)
  const afterCreate = await session.eval('return { count: window.__tasks().length, closed: document.querySelector(".v4-modal") === null }')
  check('弹层创建写入并关闭', afterCreate.count === before + 1 && afterCreate.closed === true, afterCreate)

  await session.send('Page.reload')
  await sleep(700)
  for (let index = 0; index < 60; index += 1) {
    try {
      if ((await session.eval('return Boolean(window.__ready)')) === true) break
    } catch {
      /* reloading */
    }
    await sleep(100)
  }
  const persisted = await session.eval('return { count: window.__tasks().length, has: window.__tasks().some(task => task.title === "浏览器测试创建的任务") }')
  check('刷新后新任务仍在（写盘不依赖组件存活）', persisted.count === before + 1 && persisted.has === true, persisted)

  /* 7. 任务行内展开 */
  await session.goto('?page=tasks&theme=light')
  await session.click('.v4-task-open')
  await sleep(420)
  const expanded = await session.eval(`
    return {
      panel: document.querySelector('.v4-task-inline') !== null,
      expanded: document.querySelector('.v4-task-open')?.getAttribute('aria-expanded'),
      actions: getComputedStyle(document.querySelector('.v4-task-actions')).opacity,
    };
  `)
  check('任务行点击展开行内详情', expanded.panel === true && expanded.expanded === 'true', expanded)
  check('展开后操作区可见', expanded.actions === '1', expanded.actions)

  /* 8. reduced-motion */
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await session.goto('?page=dashboard&theme=light')
  const reduced = await session.eval(`
    const btn = document.querySelector('.v4-btn');
    const c = getComputedStyle(btn);
    return { matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches, transition: c.transitionDuration, animation: c.animationDuration };
  `)
  check('reduced-motion 下匹配并禁用过渡/动画', reduced.matches === true && reduced.transition === '0s' && reduced.animation === '0s', reduced)
  await session.send('Emulation.setEmulatedMedia', { features: [] })

  /* 9. 720：抽屉铺满、无横向溢出 */
  await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 900, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=dashboard&theme=dark')
  await session.click('.v4-stat-button')
  await sleep(460)
  const narrow = await session.eval(`
    const el = document.querySelector('.v4-drawer');
    const r = el.getBoundingClientRect();
    const root = document.documentElement;
    // 热力图自己的横向滚动容器里，内容「越界」是被裁剪的滚动内容（Phase 6.2 首页也有一个），
    // 不算页面溢出：真正的判据是下面的 overflowX（documentElement 是否出现横向滚动）。
    const overflow = [...document.querySelectorAll('body *')]
      .filter(node => {
        if (node.closest('.v4-heat-scroll') !== null) return false;
        const b = node.getBoundingClientRect();
        return b.width > 0 && (b.right > root.clientWidth + 1 || b.left < -1);
      })
      .slice(0, 4)
      .map(node => String(node.className).slice(0, 40));
    return { w: Math.round(r.width), x: Math.round(r.x), radius: getComputedStyle(el).borderTopLeftRadius, overflowX: root.scrollWidth > root.clientWidth, overflow };
  `)
  check('720 抽屉铺满宽度且无圆角', narrow.w === 720 && narrow.x <= 1 && narrow.radius === '0px', narrow)
  check('720 无横向溢出', narrow.overflowX === false && narrow.overflow.length === 0, narrow.overflow)

  await session.key('Escape', 'Escape', 27)
  await sleep(200)
  await session.eval(
    "const button=[...document.querySelectorAll('button')].find(item=>item.textContent.includes('新建任务')); button.click(); return true",
  )
  await sleep(420)
  const narrowModal = await session.eval(`
    const el = document.querySelector('.v4-modal');
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), x: Math.round(r.x), right: Math.round(r.right), inner: window.innerWidth };
  `)
  check('720 弹层不超出视口', narrowModal.right <= narrowModal.inner && narrowModal.x >= 0, narrowModal)

  /* 10. 深浅两套材质确实不同 */
  const darkVars = await session.eval(`
    const page = document.querySelector('.v4-page');
    const c = getComputedStyle(page);
    return { bg: c.getPropertyValue('--v4-bg-base').trim(), fill: c.getPropertyValue('--v4-glass-1-fill').trim(), text: c.color };
  `)
  check('深色使用深紫灰底而不是浅色反色', darkVars.bg === '#15131a', darkVars)
} catch (error) {
  console.error('工作台浏览器测试异常：', error)
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
console.log(`\n工作台浏览器结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
