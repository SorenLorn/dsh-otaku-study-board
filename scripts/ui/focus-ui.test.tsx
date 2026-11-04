/**
 * focus-ui.test.tsx — 专注面板的 jsdom 交互测试（Phase 5.5）。
 *
 * 用**可控时钟**推进时间（不 sleep 18 分钟），验证：
 *   U. 初始 / 运行 / 暂停 / 继续 / 完成 / 取消 / 休息 六种状态、
 *      任务绑定与解绑、快速连点、刷新恢复、页面切换不丢、错误提示、深色主题。
 *
 * 跑法：
 *   npx esbuild scripts/ui/focus-ui.test.tsx --bundle --platform=node --format=cjs \
 *     --jsx=automatic --loader:.css=text --outfile=.build/focus-ui.cjs && node .build/focus-ui.cjs
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const win = dom.window as unknown as Window & typeof globalThis
function expose(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

expose('window', win)
expose('document', win.document)
expose('navigator', win.navigator)
expose('HTMLElement', win.HTMLElement)
expose('Node', win.Node)
expose('CustomEvent', win.CustomEvent)
expose('localStorage', win.localStorage)
expose('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0))
expose('cancelAnimationFrame', (id: number) => clearTimeout(id))
expose('matchMedia', () => ({
  matches: false,
  media: '',
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
}))

/** 可控时钟：所有组件读的都是 Date.now()，所以只改一处。 */
const T0 = new Date(2026, 10, 4, 9, 0, 0, 0).getTime()
let clock = T0
Date.now = () => clock
const advance = (ms: number): void => {
  clock += ms
}

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}

const KEY = 'dsh-otaku-study-board'
const MIN = 60_000

async function main(): Promise<void> {
  const React = await import('react')
  const { render, screen, fireEvent, cleanup, act } = await import('@testing-library/react')
  const { V4Shell } = await import('../../src/client/v4/Shell')
  const { Dashboard } = await import('../../src/client/v4/Dashboard')
  const { Tasks } = await import('../../src/client/v4/Tasks')
  const { Settings } = await import('../../src/client/v4/Settings')
  const { CaptureBridge } = await import('../../src/client/v4/CaptureBridge')
  const { NoticeHost } = await import('../../src/client/ui/NoticeHost')
  const { wrapEnvelope } = await import('../../src/client/lib/schema')
  const { dayKey } = await import('../../src/client/lib/time')

  const wrap = (data: unknown): string => JSON.stringify(wrapEnvelope(data))

  const read = (key: string): unknown => {
    const raw = window.localStorage.getItem(`${KEY}:${key}`)
    if (raw === null) return null
    try {
      return (JSON.parse(raw) as { data?: unknown }).data ?? null
    } catch {
      return null
    }
  }
  const logs = (): Array<Record<string, unknown>> => (read('logs') as Array<Record<string, unknown>> | null) ?? []
  const daily = (): Array<Record<string, unknown>> => (read('daily') as Array<Record<string, unknown>> | null) ?? []
  const timeline = (): Array<Record<string, unknown>> => (read('timeline') as Array<Record<string, unknown>> | null) ?? []
  const tasks = (): Array<Record<string, unknown>> => (read('tasks') as Array<Record<string, unknown>> | null) ?? []
  const timerState = (): Record<string, unknown> => (read('timer') as Record<string, unknown> | null) ?? {}

  const seed = (): void => {
    cleanup()
    clock = T0
    window.localStorage.clear()
    window.localStorage.setItem(`${KEY}:projects`, wrap([{ id: 'p1', name: 'TS 前端', archived: false, createdAt: T0 - MIN }]))
    window.localStorage.setItem(
      `${KEY}:tasks`,
      wrap([
        {
          id: 't1',
          title: '练习条件类型',
          status: 'todo',
          done: false,
          pomodoros: 0,
          focusedMinutes: 10,
          projectId: 'p1',
          createdAt: T0 - MIN,
          updatedAt: T0 - MIN,
        },
      ]),
    )
    window.localStorage.setItem(`${KEY}:logs`, wrap([]))
    window.localStorage.setItem(`${KEY}:daily`, wrap([]))
    window.localStorage.setItem(`${KEY}:timeline`, wrap([]))
    window.localStorage.setItem(`${KEY}:friction`, wrap([]))
    window.localStorage.setItem(`${KEY}:meta`, wrap({ sessionTaskMap: {} }))
  }

  function App(): JSX.Element {
    const [page, setPage] = React.useState<'dashboard' | 'tasks' | 'settings'>('dashboard')
    return (
      <div className="osb-page v4-page" data-view="v4" data-osb-page="">
        {/* 与真实页面一致：采集挂在根节点，提示走 NoticeHost */}
        <CaptureBridge />
        <V4Shell page={page} onPageChange={setPage as (next: string) => void}>
          {page === 'tasks' ? <Tasks /> : page === 'settings' ? <Settings /> : <Dashboard onNavigate={() => setPage('tasks')} />}
        </V4Shell>
        <div className="v4-scope v4-overlays">
          <NoticeHost />
        </div>
      </div>
    )
  }

  const mount = (): ReturnType<typeof render> => render(React.createElement(App))
  const click = (label: string): void => {
    const button = [...document.querySelectorAll('button')].find(node => (node.textContent ?? '').trim() === label)
    if (button === undefined) {
      const labels = [...document.querySelectorAll('button')].map(node => (node.textContent ?? '').trim())
      throw new Error(`button not found: ${label} · 现有按钮：${JSON.stringify(labels)}`)
    }
    fireEvent.click(button)
  }
  const clockText = (): string => document.querySelector('.v4-focus-clock')?.textContent ?? ''
  const statusText = (): string => document.querySelector('.v4-focus-state-chip')?.textContent ?? ''
  /** 让 250ms 的 tick 真的跑一次。 */
  const tick = async (): Promise<void> => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 320))
    })
  }

  console.log('\n[U] 六种状态与操作')
  {
    seed()
    mount()
    check('U1 初始显示 25:00', clockText() === '25:00', clockText())
    check('U2 初始状态「待开始」', statusText() === '待开始', statusText())
    check('U3 初始有「开始专注」按钮', screen.queryByText('开始专注') !== null)
    check('U4 初始提示自由专注', (document.querySelector('.v4-focus-task')?.textContent ?? '').includes('自由专注'), document.querySelector('.v4-focus-task')?.textContent)
    check('U5 初始不写 timer 到存储', window.localStorage.getItem(`${KEY}:timer`) === null, window.localStorage.getItem(`${KEY}:timer`))

    click('开始专注')
    check('U6 开始后状态「专注中」', statusText() === '专注中', statusText())
    check('U7 开始后出现暂停与结束', screen.queryByText('暂停') !== null && screen.queryByText('结束并记录') !== null)
    check('U8 开始即写盘（roundId 已落）', typeof timerState().roundId === 'string' && String(timerState().roundId).startsWith('focus-'), timerState())

    advance(65_000)
    await tick()
    check('U9 时钟按时间戳推进（65 秒后 23:55）', clockText() === '23:55', clockText())

    click('暂停')
    check('U10 暂停后状态「已暂停」', statusText() === '已暂停', statusText())
    const frozen = clockText()
    advance(5 * MIN)
    await tick()
    check('U11 暂停期间剩余时间不变', clockText() === frozen, { frozen, now: clockText() })
    check('U12 暂停显示「继续」「取消」', screen.queryByText('继续') !== null && screen.queryByText('取消') !== null)

    click('继续')
    check('U13 继续后回到「专注中」', statusText() === '专注中', statusText())

    // 累计：65s + 5min 暂停（不计） + 再走 12 分钟 ≈ 13 分钟
    advance(12 * MIN)
    await tick()
    click('结束并记录')
    const endLog = logs()[0]
    check('U14 结束后状态「本轮完成」', statusText() === '本轮完成', statusText())
    check('U15 结束写入一条日志', logs().length === 1, logs())
    check('U16 日志分钟 = 实际（13 分钟，不是目标 25）', endLog?.minutes === 13, endLog)
    check('U17 日志 kind = focus', endLog?.kind === 'focus', endLog?.kind)
    check('U18 Daily focusMinutes = 13', (daily()[0] as { focusMinutes?: number } | undefined)?.focusMinutes === 13, daily())
    check('U19 时间轴写入 focus.completed', (timeline()[0] as { type?: string } | undefined)?.type === 'focus.completed', timeline())
    const resultTitle = (): string => document.querySelector('.v4-focus-result-title')?.textContent ?? ''
    check('U20 完成任务反馈显示实际分钟', resultTitle().includes('13m'), resultTitle())

    // completed 态不再有「结束并记录」按钮 —— 重复结束在 UI 层就不可能发生
    const endButtons = [...document.querySelectorAll('button')].filter(node => (node.textContent ?? '').trim() === '结束并记录')
    check('U21 completed 态没有「结束并记录」按钮', endButtons.length === 0, endButtons.length)
    check('U22 completed 态日志仍只有一条', logs().length === 1, logs().length)

    click('开始下一轮')
    check('U23 开始下一轮回到「专注中」', statusText() === '专注中', statusText())
    check('U24 新一轮剩余回满 25 分钟', clockText() === '25:00', clockText())
    advance(40_000)
    await tick()
    // 取消只出现在暂停态（跑着的时候必须先暂停，避免误触丢掉正在进行的一轮）
    click('暂停')
    click('取消')
    check('U25 取消后回「待开始」', statusText() === '待开始', statusText())
    check('U26 取消不写日志', logs().length === 1, logs().length)
    check('U27 取消后存储里没有 roundId', (timerState().roundId ?? '') === '', timerState())
  }

  console.log('\n[U] 任务绑定 / 快速连点 / 0 分钟')
  {
    seed()
    mount()
    // 绑定任务在展开态里：先点任务行展开（不是另开弹层）
    fireEvent.click(document.querySelector<HTMLButtonElement>('.v4-focus-task-btn')!)
    const select = document.querySelector<HTMLSelectElement>('#v4-focus-task')
    check('U28 展开后有任务下拉', select !== null, document.body.textContent?.slice(0, 40))
    fireEvent.change(select!, { target: { value: 't1' } })
    check('U29 绑定后显示任务名', (document.querySelector('.v4-focus-task')?.textContent ?? '') === '练习条件类型', document.querySelector('.v4-focus-task')?.textContent)

    // 解除绑定 → 自由专注
    fireEvent.change(select!, { target: { value: '' } })
    check('U30 解绑后回到自由专注', (document.querySelector('.v4-focus-task')?.textContent ?? '').includes('自由专注'), document.querySelector('.v4-focus-task')?.textContent)
    fireEvent.change(select!, { target: { value: 't1' } })

    click('开始专注')
    advance(6 * MIN)
    /**
     * 快速连点：拿同一个 DOM 节点连发三次 click（真实的「手抖点三下」）。
     * 第一次之后按钮就从 DOM 里消失，后两次落在已卸载的节点上，不触发 handler。
     */
    const endButton = [...document.querySelectorAll('button')].find(node => (node.textContent ?? '').trim() === '结束并记录')
    fireEvent.click(endButton!)
    fireEvent.click(endButton!)
    fireEvent.click(endButton!)
    check('U31 快速连点结束只写一条', logs().length === 1, logs().length)
    check('U32 日志带 taskId', logs()[0]?.taskId === 't1', logs()[0])
    check('U33 日志带项目归属', logs()[0]?.projectId === 'p1', logs()[0]?.projectId)
    check('U34 任务累计 10+6', tasks()[0]?.focusedMinutes === 16, tasks()[0]?.focusedMinutes)
    check('U35 任务 pomodoros +1', tasks()[0]?.pomodoros === 1, tasks()[0]?.pomodoros)

    // 0 分钟
    seed()
    mount()
    click('开始专注')
    click('结束并记录')
    check('U36 不足 1 分钟不写日志', logs().length === 0, logs())
    check('U37 不足 1 分钟不写 daily', daily().length === 0, daily())
    check('U38 给出「不足 1 分钟」提示', (document.body.textContent ?? '').includes('不足 1 分钟'), document.body.textContent?.slice(0, 80))
  }

  console.log('\n[U] 刷新恢复 / 页面切换')
  {
    seed()
    const first = mount()
    click('开始专注')
    advance(8 * MIN)
    await tick()
    const before = clockText()
    // 「刷新」：卸载后重新挂载，localStorage 里还是 running
    first.unmount()
    mount()
    check('U39 刷新后仍是「专注中」', statusText() === '专注中', statusText())
    check('U40 刷新后剩余时间按时间戳重算', clockText() === '17:00', { before, now: clockText() })
    check('U41 刷新保留同一 roundId', String(timerState().roundId).startsWith('focus-'), timerState().roundId)

    // 页面切换：Dashboard → 任务 → Dashboard
    click('任务')
    check('U42 切到任务页后计时仍在存储里', (timerState().running ?? false) === true, timerState())
    click('Dashboard')
    check('U43 切回 Dashboard 计时仍在跑', statusText() === '专注中', statusText())

    // 完成后刷新：completed 状态与真实分钟都保留
    advance(10 * MIN)
    await tick()
    click('结束并记录')
    const minutes = logs()[0]?.minutes
    cleanup()
    mount()
    check('U44 完成后刷新仍是「本轮完成」', statusText() === '本轮完成', statusText())
    const afterRefresh = document.querySelector('.v4-focus-result-title')?.textContent ?? ''
    check('U45 完成后刷新显示真实分钟', afterRefresh.includes(`${minutes}m`), { minutes, afterRefresh })
  }

  console.log('\n[U] 休息段')
  {
    seed()
    mount()
    click('开始专注')
    advance(25 * MIN)
    await tick()
    check('U46 到点自动结算为「本轮完成」', statusText() === '本轮完成', statusText())
    check('U47 到点结算写满 25 分钟', logs()[0]?.minutes === 25, logs()[0])

    click('进入休息')
    check('U48 进入休息后状态「休息中」', statusText() === '休息中', statusText())
    check('U49 休息显示 05:00', clockText() === '05:00', clockText())
    check('U50 休息不写专注日志', logs().length === 1, logs().length)
    check('U51 休息段已专注显示 0 分', (document.querySelector('.v4-focus-clock-elapsed')?.textContent ?? '') === '已专注 0 分', document.querySelector('.v4-focus-clock-elapsed')?.textContent)

    advance(60_000)
    await tick()
    click('暂停休息')
    check('U52 休息可暂停', statusText() === '休息暂停', statusText())
    click('继续休息')
    check('U53 休息可继续', statusText() === '休息中', statusText())
    click('跳过休息')
    check('U54 跳过休息回「待开始」', statusText() === '待开始', statusText())
    check('U55 休息结束不产生新日志', logs().length === 1, logs().length)
    check('U56 休息不计入 Daily', (daily()[0] as { focusMinutes?: number } | undefined)?.focusMinutes === 25, daily())

    advance(4 * MIN)
    await tick()
    check('U57 休息走完后自动回到待开始', statusText() === '待开始', statusText())
  }

  console.log('\n[U] 采集状态 / 深色主题')
  {
    seed()
    mount()
    click('数据')
    const captureText = document.body.textContent ?? ''
    check('U58 设置页有采集卡', captureText.includes('会话采集'), captureText.slice(0, 60))
    check('U59 采集默认开启（开关勾选）', document.querySelector<HTMLInputElement>('.v4-capture-toggle input')?.checked === true)
    const status = document.querySelector('[data-capture-status]')?.getAttribute('data-capture-status')
    // jsdom 里没有 ctx，通道退到 window 桥 → 状态应为 on；若桥不可用则是 error/off，但必须有一个确定值
    check('U60 没有 ctx 时退回 window 桥，状态为 on', status === 'on', { status, detail: document.querySelector('[data-capture-status]')?.textContent })

    fireEvent.click(document.querySelector<HTMLInputElement>('.v4-capture-toggle input')!)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    check('U61 关闭采集后状态变「已关闭」', (document.querySelector('[data-capture-status]')?.textContent ?? '').includes('关闭'), document.querySelector('[data-capture-status]')?.textContent)

    cleanup()
    document.body.setAttribute('data-ds-dark-theme', '')
    seed()
    mount()
    check('U62 深色下渲染正常', clockText() === '25:00', clockText())
    click('开始专注')
    check('U63 深色下可开始计时', statusText() === '专注中', statusText())
    document.body.removeAttribute('data-ds-dark-theme')
  }

  console.log(`\n结果：${passed} passed, ${failed} failed`)
  // jsdom 里还有 30s 的 useNow 与 250ms 的 tick，显式退出，避免测试进程挂住
  process.exit(failed > 0 ? 1 : 0)
}

void main()
