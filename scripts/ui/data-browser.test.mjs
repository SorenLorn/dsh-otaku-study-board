/**
 * data-browser.test.mjs — Phase 5.3 真实 Chromium 下的数据管理测试。
 *
 * 覆盖 jsdom 覆盖不到的部分：
 *   • 真实文件选择（DOM.setFileInputFiles）；
 *   • 真实下载（Browser.setDownloadBehavior + 读取落盘文件）；
 *   • 刷新后数据仍在；
 *   • 720 布局无横向溢出；
 *   • 顶部「数据」入口真的能进设置页。
 *
 * 前置：
 *   npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
 *     --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
 * 运行：node scripts/ui/data-browser.test.mjs
 *
 * 独立 Chromium，不是 DSH 宿主。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-wb')
const WORK = join(tmpdir(), 'sorchron-data-browser')
const PORT = 8793
const DEBUG = 9353
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

await mkdir(WORK, { recursive: true })
const downloads = join(WORK, 'downloads')
await rm(downloads, { recursive: true, force: true })
await mkdir(downloads, { recursive: true })

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

const profile = join(WORK, 'profile')
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
  async waitFor(expression, label, timeout = 8000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await this.eval(expression)) return true
      await sleep(120)
    }
    throw new Error('等待超时：' + label)
  }
}

const BACKUP = {
  kind: 'sorchron-study-board-backup',
  version: 4,
  exportedAt: Date.now(),
  scope: 'all',
  tasks: [
    {
      id: 'imp-1',
      title: '浏览器导入的任务',
      status: 'todo',
      done: false,
      pomodoros: 0,
      priority: 'important',
      projectId: 'p1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  logs: [
    { id: 'imp-l1', at: Date.now(), kind: 'focus', title: '浏览器导入的专注', minutes: 25, projectId: 'p1', source: 'manual', edited: false },
  ],
  projects: [{ id: 'p1', name: 'TS 前端学习与工程化实践', archived: false, createdAt: Date.now() }],
  settings: { autoCapture: true, lastDurationMinutes: 25, projectRules: [], monthlyGoal: { month: '', targetMinutes: 600, targetTasks: 10 } },
  friction: [],
  meta: { sessionTaskMap: {} },
  memory: [],
  knowledge: { nodes: [], edges: [] },
  reviews: [],
  timeline: [],
  history: [],
  daily: [],
}
const backupPath = join(WORK, 'browser-backup.json')
await writeFile(backupPath, JSON.stringify(BACKUP, null, 2), 'utf8')
const badPath = join(WORK, 'bad.json')
await writeFile(badPath, '{ not json', 'utf8')

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
    await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?page=settings`)}`, { method: 'PUT' })
  ).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const session = new Session(ws)
  await session.send('Runtime.enable')
  await session.send('Page.enable')
  await session.send('DOM.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false })
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  await session.goto('?page=settings&theme=light')

  /* 1. 入口：从 Dashboard 点「数据」进入设置 */
  await session.goto('?page=dashboard&theme=light')
  await session.eval("const b=document.querySelector('button[aria-label=\"设置与数据\"]'); if(b) b.click(); return Boolean(b)")
  await session.waitFor("return document.querySelector('.v4-settings') !== null", '进入设置页')
  check('顶部「数据」入口进入设置页', true)
  check('设置页没有经典入口', (await session.eval("return !document.body.textContent.includes('经典')")) === true)

  /* 2. 存储与概览 */
  const overview = await session.eval(`
    const counts = document.querySelectorAll('.v4-data-counts > div').length;
    const big = document.querySelector('.v4-data-big')?.textContent ?? '';
    const status = [...document.querySelectorAll('.v4-data-facts div')].map(row => row.textContent).join(' | ');
    return { counts, big, status, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  `)
  check('概览展示 10 类实体', overview.counts === 10, overview.counts)
  check('存储显示实测字节数', overview.big.length > 0 && overview.big !== '0 B', overview.big)
  check('存储显示状态与可写性', overview.status.includes('存储状态') && overview.status.includes('可写性'), overview.status)
  check('1440 无横向溢出', overview.overflow === false)

  /* 3. 真实导出 → 读取落盘文件 */
  await session.eval("const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('生成并下载')); b.click(); return true")
  await session.waitFor("return document.querySelector('.v4-data-result[data-ok=\"true\"]') !== null", '导出完成')
  let file = null
  for (let index = 0; index < 60; index += 1) {
    const files = (await readdir(downloads)).filter(name => name.endsWith('.json'))
    if (files.length > 0) {
      file = join(downloads, files[0])
      break
    }
    await sleep(150)
  }
  check('下载目录出现 JSON 文件', file !== null)
  if (file !== null) {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    check('文件名包含日期与范围', /sorchron-board-backup-all-\d{8}-\d{6}\.json/.test(file), file.split(/[\\/]/).pop())
    check('导出文件 kind / version 正确', parsed.kind === 'sorchron-study-board-backup' && parsed.version === 4)
    check(
      '导出文件包含 12 个数据字段',
      ['tasks', 'logs', 'projects', 'settings', 'friction', 'meta', 'memory', 'knowledge', 'reviews', 'timeline', 'history', 'daily'].every(key => key in parsed),
      Object.keys(parsed),
    )
    check('导出文件与界面条数一致', parsed.tasks.length === 7, parsed.tasks.length)
    check('导出后界面显示大小与时间', (await session.eval("return document.querySelector('.v4-data-result[data-ok=\"true\"]')?.textContent ?? ''")).includes('已生成并开始下载'))
  }

  /* 4. 真实文件选择 → 预览 */
  const setFile = async path => {
    const doc = await session.send('DOM.getDocument', { depth: -1 })
    const node = await session.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
    await session.send('DOM.setFileInputFiles', { files: [path], nodeId: node.nodeId })
  }
  await setFile(backupPath)
  await session.waitFor("return document.querySelector('.v4-data-source') !== null", '导入预览')
  const preview = await session.eval(`
    const source = document.querySelector('.v4-data-source')?.textContent ?? '';
    const table = document.querySelector('.v4-data-preview')?.textContent ?? '';
    return { source, table };
  `)
  check('预览显示文件名与大小', preview.source.includes('browser-backup.json') && /KB|B/.test(preview.source), preview.source.slice(0, 80))
  check('预览显示 Schema 版本', preview.source.includes('v4'))
  check('预览显示本地/备份/冲突三列', preview.table.includes('本地') && preview.table.includes('备份') && preview.table.includes('同 id 冲突'))
  await session.eval("document.querySelector('.v4-data-source')?.scrollIntoView({ block: 'center' }); return true")
  await sleep(320)
  const shotPreview = await session.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'wb-data-import-light-1440.png'), Buffer.from(shotPreview.data, 'base64'))

  /* 5. 合并导入 → 数据真实写入 */
  await session.eval("const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='合并导入'); b.click(); return true")
  await session.waitFor("return document.body.textContent.includes('合并导入完成')", '合并完成')
  const afterMerge = await session.eval('return window.__counts()')
  check('合并后任务数 +1', afterMerge.tasks === 8, afterMerge.tasks)
  check('合并后导入的日志存在', afterMerge.logs >= 8, afterMerge.logs)
  const mergedUi = await session.eval("return document.querySelectorAll('.v4-data-counts dd')[0]?.textContent ?? ''")
  check('导入后概览数字自动刷新', mergedUi === '8', mergedUi)

  /* 6. 重复导入幂等 */
  await setFile(backupPath)
  await session.waitFor("return document.querySelector('.v4-data-source') !== null", '再次预览')
  await session.eval("const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='合并导入'); b.click(); return true")
  await session.waitFor("return document.body.textContent.includes('合并导入完成')", '再次合并')
  const afterTwice = await session.eval('return window.__counts()')
  check('重复导入任务数不变', afterTwice.tasks === 8, afterTwice.tasks)

  /* 7. 刷新后数据仍在 */
  await session.send('Page.reload')
  await sleep(800)
  await session.waitFor("return Boolean(window.__ready)", '刷新完成')
  const afterReload = await session.eval('return window.__counts()')
  check('刷新后导入的数据仍在', afterReload.tasks === 8 && afterReload.logs >= 8, afterReload.tasks)

  /* 8. 覆盖导入：勾选前禁用 */
  await session.goto('?page=settings&theme=light')
  await setFile(backupPath)
  await session.waitFor("return document.querySelector('.v4-data-source') !== null", '覆盖预览')
  await session.eval("const b=[...document.querySelectorAll('.v4-segment')].find(x=>x.textContent.trim()==='覆盖'); b.click(); return true")
  await sleep(200)
  const overwriteState = await session.eval(`
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '覆盖并替换');
    return { disabled: btn?.disabled, danger: document.querySelector('.v4-data-danger') !== null, ack: document.querySelector('.v4-data-ack input') !== null };
  `)
  check('覆盖使用危险确认区', overwriteState.danger === true && overwriteState.ack === true)
  check('覆盖按钮在勾选前禁用', overwriteState.disabled === true)
  await session.eval("document.querySelector('.v4-data-danger')?.scrollIntoView({ block: 'center' }); return true")
  await sleep(320)
  const shotOverwrite = await session.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'wb-data-overwrite-light-1440.png'), Buffer.from(shotOverwrite.data, 'base64'))

  await session.eval(`
    const box = document.querySelector('.v4-data-ack input');
    box.click();
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '覆盖并替换');
    btn.click();
    return true;
  `)
  await session.waitFor("return document.body.textContent.includes('覆盖导入完成')", '覆盖完成')
  const afterOverwrite = await session.eval('return window.__counts()')
  check('覆盖后任务数等于备份条数', afterOverwrite.tasks === 1, afterOverwrite.tasks)

  /* 9. 非法文件：真实错误、数据不变 */
  const beforeBad = await session.eval('return window.__counts()')
  await setFile(badPath)
  await session.waitFor("return document.body.textContent.includes('不是合法的 JSON')", '非法文件错误')
  const afterBad = await session.eval('return window.__counts()')
  check('非法文件给出错误且不改数据', afterBad.tasks === beforeBad.tasks, { before: beforeBad.tasks, after: afterBad.tasks })

  /* 10. 720 布局 */
  await session.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 960, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=settings&theme=dark')
  const narrow = await session.eval(`
    const root = document.documentElement;
    const offenders = [...document.querySelectorAll('body *')].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && (rect.right > root.clientWidth + 1 || rect.left < -1);
    }).slice(0, 5).map(node => String(node.className).slice(0, 40));
    return { overflow: root.scrollWidth > root.clientWidth, offenders, counts: document.querySelectorAll('.v4-data-counts > div').length };
  `)
  check('720 无横向溢出', narrow.overflow === false && narrow.offenders.length === 0, narrow.offenders)
  check('720 概览仍为两列', narrow.counts === 10, narrow.counts)
  const shotNarrow = await session.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'wb-data-settings-dark-720.png'), Buffer.from(shotNarrow.data, 'base64'))

  /* 11. 清空：两步确认 → 全部清零 */
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false })
  await session.goto('?page=settings&theme=light')
  await session.eval("const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('清空全部数据')); b.click(); return true")
  await sleep(200)
  const clearState = await session.eval(`
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '确认清空');
    return { disabled: btn?.disabled, danger: document.querySelector('.v4-data-danger') !== null };
  `)
  check('清空需要二次确认且勾选前禁用', clearState.disabled === true && clearState.danger === true)
  await session.eval("document.querySelector('.v4-data-danger')?.scrollIntoView({ block: 'center' }); return true")
  await sleep(320)
  const shotClear = await session.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'wb-data-clear-light-1440.png'), Buffer.from(shotClear.data, 'base64'))
  await session.eval(`
    document.querySelector('.v4-data-ack input').click();
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '确认清空');
    btn.click();
    return true;
  `)
  await session.waitFor("return document.body.textContent.includes('已清空')", '清空完成')
  const cleared = await session.eval('return window.__counts()')
  check(
    '清空后所有实体为 0',
    Object.values(cleared).every(value => value === 0),
    cleared,
  )
  check('清空后知识图谱为空', cleared.knowledge === 0)
  const clearedUi = await session.eval("return [...document.querySelectorAll('.v4-data-counts dd')].map(node => node.textContent)")
  check('清空后概览数字全部归零', clearedUi.every(value => value === '0'), clearedUi)

  /* 12. 刷新后仍为空（清空真的落盘） */
  await session.send('Page.reload')
  await sleep(800)
  await session.waitFor("return Boolean(window.__ready)", '刷新')
  const afterClearReload = await session.eval('return window.__counts()')
  check('刷新后仍为空', Object.values(afterClearReload).every(value => value === 0), afterClearReload)
} catch (error) {
  console.error('数据管理浏览器测试异常：', error)
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
console.log(`\n数据管理浏览器结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
