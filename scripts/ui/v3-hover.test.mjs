/**
 * V3 弹窗 + 卡片 hover 抖动复现（Chromium，不是 DSH 宿主）。
 *
 * 步骤：真实 TaskList → 点「删除任务」打开确认弹窗 → 鼠标移到卡片外
 * → 采样 .osb-modal-backdrop 的尺寸，看它是否在两个尺寸之间反复跳。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = join(tmpdir(), 'sorchron-v3-hover')
const PORT = 8779
const DEBUG = 9341
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
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
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.p.delete(id)) rej(new Error('timeout ' + method)) }, 15000) }) }
  async eval(expression, awaitPromise = false) { const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true, awaitPromise }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval'); return r.result.value }
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
  await s.send('Runtime.enable'); await s.send('Page.enable')
  for (let i = 0; i < 60; i += 1) { if (await s.eval('return Boolean(window.__ready)') === true) break; await sleep(100) }
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(400)

  const boxes = await s.eval(`
    const card = document.querySelector('.osb-tasks').getBoundingClientRect();
    const btn = [...document.querySelectorAll('.osb-task-actions button')].find(b => b.getAttribute('aria-label') === '删除任务');
    const r = btn.getBoundingClientRect();
    return { card: { x: Math.round(card.x), y: Math.round(card.y), w: Math.round(card.width), h: Math.round(card.height) }, btn: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } };
  `)
  console.log('boxes', JSON.stringify(boxes))

  // 打开真实确认弹窗（V3 删除任务）
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: boxes.btn.x, y: boxes.btn.y, buttons: 0 })
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: boxes.btn.x, y: boxes.btn.y, button: 'left', clickCount: 1 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: boxes.btn.x, y: boxes.btn.y, button: 'left', clickCount: 1 })
  await sleep(300)
  const opened = await s.eval(`return document.querySelector('.osb-modal-backdrop') !== null`)
  check('确认弹窗已打开（真实删除流程）', opened === true)

  // 把鼠标移到任务卡之外（右侧计时器卡区域）
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 500, buttons: 0 })
  await sleep(250)

  const sample = await s.eval(`
    return new Promise(resolve => {
      const seen = [];
      const t0 = performance.now();
      const tick = () => {
        const el = document.querySelector('.osb-modal-backdrop');
        if (el) {
          const r = el.getBoundingClientRect();
          seen.push([Math.round(r.width), Math.round(r.height)]);
        } else seen.push(null);
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
        else {
          const unique = [...new Set(seen.map(v => v === null ? 'none' : v.join('x')))];
          resolve({ frames: seen.length, unique, first: seen[0], last: seen[seen.length - 1] });
        }
      };
      requestAnimationFrame(tick);
    });
  `, true)

  console.log('sample', JSON.stringify(sample))
  check('遮罩尺寸稳定（无 hover 反馈循环）', sample.unique.length === 1, sample.unique)

  const hoverInfo = await s.eval(`
    const el = document.elementFromPoint(1200, 500);
    return { tag: el ? el.tagName.toLowerCase() : null, cls: el ? String(el.className).slice(0, 60) : null, cardHover: document.querySelector('.osb-tasks').matches(':hover') };
  `)
  console.log('hoverInfo', JSON.stringify(hoverInfo))

  // 场景二：关掉弹窗，把指针停在卡片最后 1px，看卡片是否上下抖
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(300)
  const edge = await s.eval(`const r = document.querySelector('.osb-tasks').getBoundingClientRect(); return { x: Math.round(r.x + 40), y: Math.round(r.bottom - 1) };`)
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: edge.x, y: edge.y, buttons: 0 })
  await sleep(200)
  const edgeSample = await s.eval(`
    return new Promise(resolve => {
      const seen = []; const t0 = performance.now();
      const tick = () => {
        seen.push(Math.round(document.querySelector('.osb-tasks').getBoundingClientRect().top * 10) / 10);
        if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
        else resolve({ frames: seen.length, unique: [...new Set(seen)] });
      };
      requestAnimationFrame(tick);
    });
  `, true)
  console.log('edgeSample', JSON.stringify(edgeSample))
  check('卡片底边 hover 不再上下跳', edgeSample.unique.length === 1, edgeSample.unique)

  // 场景二 B：Portal 之后，Esc / 取消 仍然能关掉弹窗
  const reopen = async () => {
    const p = await s.eval(`
      const btn = [...document.querySelectorAll('.osb-task-actions button')].find(b => b.getAttribute('aria-label') === '删除任务');
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `)
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await sleep(200)
  }
  await reopen()
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(200)
  check('Portal 后 Esc 仍可关闭确认弹窗', (await s.eval(`return document.querySelector('.osb-modal-backdrop') === null`)) === true)

  await reopen()
  const cancel = await s.eval(`const b=[...document.querySelectorAll('.osb-modal-actions button')].find(x=>x.textContent==='取消'); const r=b.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) };`)
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cancel.x, y: cancel.y, button: 'left', clickCount: 1 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cancel.x, y: cancel.y, button: 'left', clickCount: 1 })
  await sleep(200)
  check('Portal 后「取消」仍可关闭确认弹窗', (await s.eval(`return document.querySelector('.osb-modal-backdrop') === null`)) === true)

  // 场景三：真实「计时结束」提示（截图里的那个弹窗）
  await s.eval(`
    localStorage.setItem('dsh-otaku-study-board:timer', JSON.stringify({
      schemaVersion: 4,
      data: {
        running: true,
        deadline: Date.now() - 1000,
        durationMinutes: 25,
        boundTaskId: '',
        startedAt: Date.now() - 1_500_000,
        remainingSeconds: 0,
        phase: 'focus',
        roundInCycle: 1,
        focusMinutes: 25,
      },
    }));
    return true;
  `)
  await s.send('Page.reload')
  for (let i = 0; i < 60; i += 1) { try { if (await s.eval('return Boolean(window.__ready)') === true) break } catch {} await sleep(100) }
  await sleep(900)
  const noticeOpen = await s.eval(`return { has: document.querySelector('.osb-modal-backdrop') !== null, title: document.querySelector('.osb-modal-title')?.textContent ?? null, inCard: document.querySelector('.osb-card .osb-modal-backdrop') !== null }`)
  check('计时结束提示使用 Portal（不在卡片内）', noticeOpen.has === true && noticeOpen.inCard === false, noticeOpen)

  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 400, buttons: 0 })
  await sleep(250)
  const noticeSample = await s.eval(`
    return new Promise(resolve => {
      const seen = []; const t0 = performance.now();
      const tick = () => {
        const el = document.querySelector('.osb-modal-backdrop');
        seen.push(el === null ? 'none' : Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
        if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
        else resolve({ frames: seen.length, unique: [...new Set(seen)] });
      };
      requestAnimationFrame(tick);
    });
  `, true)
  console.log('noticeSample', JSON.stringify(noticeSample))
  check('计时结束遮罩在任务清单上不闪', noticeSample.unique.length === 1, noticeSample.unique)

  const shot = await s.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'v3-dialog-after.png'), Buffer.from(shot.data, 'base64'))

  // 关掉提示，把指针停在任务卡上，看悬停反馈（边框 + 阴影，不再位移）
  const know = await s.eval(`const b=[...document.querySelectorAll('.osb-modal-actions button')].find(x=>x.textContent==='知道了'); const r=b.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) };`)
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: know.x, y: know.y, button: 'left', clickCount: 1 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: know.x, y: know.y, button: 'left', clickCount: 1 })
  await sleep(250)
  const center = await s.eval(`const r=document.querySelector('.osb-tasks').getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+120) };`)
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y, buttons: 0 })
  await sleep(300)
  const shot2 = await s.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join('reports', 'v3-card-hover.png'), Buffer.from(shot2.data, 'base64'))
  const hoverStyle = await s.eval(`
    const el = document.querySelector('.osb-tasks');
    const cs = getComputedStyle(el);
    return { transform: cs.transform, borderColor: cs.borderColor, shadow: cs.boxShadow };
  `)
  check('卡片悬停仍保留边框/阴影反馈且不再位移', hoverStyle.transform === 'none' && hoverStyle.shadow !== 'none', hoverStyle)
} catch (error) {
  console.error('hover 复现异常：', error)
  exitCode = 1
} finally {
  try { chrome.kill() } catch {}
  server.close()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
const failed = results.filter(r => !r.ok).length
console.log(`\nhover 复现结果：${results.length - failed} 通过 / ${failed} 失败`)
if (failed > 0) exitCode = 1
process.exit(exitCode)
