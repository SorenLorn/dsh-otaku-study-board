/**
 * dashboard-heat.test.tsx — Dashboard 首页热力图的 jsdom 验收（Phase 6.2）。
 *
 * 要证明的东西只有一条：**首页看到的就是 History 那份聚合**。
 * 所以断言不写死颜色，而是拿 `buildActivityWindow` 现算一遍再比对 ——
 * 组件如果偷偷另算一套，这里立刻会挂。
 *
 * 覆盖：
 *   D1–D4  365 格渲染 / 强度与聚合一致 / tooltip 三项指标
 *   D5–D6  点击与键盘都能打开当天详情
 *   D7     同一份数据下，Dashboard 与 History 的格子强度逐日相同
 *   D8     空数据：仍然画满 365 格、全 0 档、给出空态提示、不伪造记录
 *   D9     渲染热力图不改动任何数据键
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

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`)
  }
}

const KEY = 'dsh-otaku-study-board'

async function main(): Promise<void> {
  const React = await import('react')
  const { render, screen, fireEvent, cleanup, waitFor, act } = await import('@testing-library/react')
  const { Dashboard } = await import('../../src/client/v4/Dashboard')
  const { History } = await import('../../src/client/v4/History')
  const { WorkspaceProvider } = await import('../../src/client/v4/workspace')
  const { OverlayHost } = await import('../../src/client/v4/Detail')
  const { wrapEnvelope } = await import('../../src/client/lib/schema')
  const { dayKey } = await import('../../src/client/lib/time')
  const { buildActivityWindow } = await import('../../src/client/lib/activity')

  const now = 1793789000000 // 固定时间：2026-11-04 左右，避免跨零点抖动
  const atDay = (offset: number, hour = 12): number => {
    const date = new Date(now)
    date.setHours(hour, 0, 0, 0)
    date.setDate(date.getDate() - offset)
    return date.getTime()
  }
  const key = (offset: number): string => dayKey(atDay(offset))
  const today = key(0)
  const wrap = (data: unknown): string => JSON.stringify(wrapEnvelope(data))
  const withWorkspace = (node: unknown) =>
    React.createElement(WorkspaceProvider, null, node, React.createElement(OverlayHost))

  const TASKS = [
    { id: 't1', title: '今天的任务', status: 'done', done: true, pomodoros: 1, focusedMinutes: 25, projectId: 'p1', createdAt: atDay(0, 9), updatedAt: atDay(0, 18), completedAt: atDay(0, 18) },
    { id: 't2', title: '三天前的任务', status: 'done', done: true, pomodoros: 1, focusedMinutes: 25, projectId: 'p1', createdAt: atDay(3, 9), updatedAt: atDay(3, 18), completedAt: atDay(3, 18) },
  ]
  const DAILY = [
    { day: key(0), focusMinutes: 60, tasksDone: 1, sessions: 0, friction: 0 },
    { day: key(1), focusMinutes: 25, tasksDone: 0, sessions: 0, friction: 0 },
    { day: key(2), focusMinutes: 0, tasksDone: 0, sessions: 0, friction: 0 },
  ]

  const seed = (): void => {
    cleanup()
    window.localStorage.clear()
    window.localStorage.setItem(`${KEY}:projects`, wrap([{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: now }]))
    window.localStorage.setItem(`${KEY}:daily`, wrap(DAILY))
    window.localStorage.setItem(`${KEY}:tasks`, wrap(TASKS))
    window.localStorage.setItem(`${KEY}:logs`, wrap([]))
    window.localStorage.setItem(`${KEY}:timeline`, wrap([]))
    window.localStorage.setItem(`${KEY}:friction`, wrap([]))
    window.localStorage.setItem(`${KEY}:meta`, wrap({ sessionTaskMap: {} }))
  }

  const renderDashboard = () => render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined })))
  const levelsIn = (root: ParentNode): Map<string, string> => {
    const map = new Map<string, string>()
    root.querySelectorAll<HTMLElement>('.v4-dash-heat .v4-heat-cell[data-day]').forEach(cell => {
      map.set(cell.dataset.day ?? '', cell.dataset.level ?? '')
    })
    return map
  }

  /** 与页面同源的期望值：直接跑纯函数，不复制实现。 */
  const expected = buildActivityWindow({ daily: DAILY as never, tasks: TASKS as never, logs: [] }, { range: 365, now })

  /* ── D1 结构 ──────────────────────────────────────────────────────────── */
  seed()
  const view = renderDashboard()
  const heat = view.container.querySelector<HTMLElement>('.v4-dash-heat')
  check('D1.1 Dashboard 首页直接渲染热力图卡片', heat !== null)
  check('D1.2 卡片就在 Dashboard 容器里（不是跳转后才出现）', heat?.closest('.v4-dashboard') !== null)
  check(
    'D1.3 渲染 365 个可点格子',
    view.container.querySelectorAll('.v4-dash-heat .v4-heat-cell[data-day]').length === 365,
    view.container.querySelectorAll('.v4-dash-heat .v4-heat-cell[data-day]').length,
  )
  check(
    'D1.4 12 个月份标签 + 一/三/五 星期标签',
    view.container.querySelectorAll('.v4-dash-heat .v4-heat-months span').length >= 12 &&
      [...view.container.querySelectorAll('.v4-dash-heat .v4-heat-weekdays span')].map(node => node.textContent).join('') === '一三五',
  )

  /* ── D2 强度与聚合一致 ────────────────────────────────────────────────── */
  const levels = levelsIn(view.container)
  const mismatch = expected.days.filter(day => levels.get(day.day) !== String(day.level))
  check('D2.1 365 天的强度与 buildActivityWindow 完全一致', mismatch.length === 0, mismatch.slice(0, 3))
  check('D2.2 今天 60 分钟（1 个完成任务）落在 3 档', levels.get(today) === String(expected.days[expected.days.length - 1]!.level), {
    level: levels.get(today),
    expect: expected.days[expected.days.length - 1]!.level,
  })
  check('D2.3 昨天 25 分钟不是 0 档', levels.get(key(1)) !== '0', levels.get(key(1)))
  check('D2.4 没有数据的日子是 0 档', levels.get(key(200)) === '0', levels.get(key(200)))

  /* ── D3 tooltip 三项指标 ─────────────────────────────────────────────── */
  const todayCell = view.container.querySelector<HTMLElement>(`.v4-dash-heat [data-day="${today}"]`)!
  act(() => {
    fireEvent.mouseOver(todayCell)
  })
  const tip = document.querySelector('.v4-heat-tip')
  check(
    'D3.1 悬停显示完成 / 专注时长 / 专注次数',
    tip !== null &&
      tip.textContent?.includes('完成任务：1') === true &&
      tip.textContent?.includes('专注时间：60 分钟') === true &&
      tip.textContent?.includes('专注次数：1 次') === true,
    tip?.textContent,
  )
  check('D3.2 同时给出学习活动总数（不重复累计）', tip?.textContent?.includes('学习活动：2 项') === true, tip?.textContent)
  act(() => {
    fireEvent.mouseLeave(view.container.querySelector('.v4-dash-heat .v4-heat-grid')!)
  })
  check('D3.3 移出后 tooltip 消失', document.querySelector('.v4-heat-tip') === null)

  /* ── D4 点击打开当天详情 ─────────────────────────────────────────────── */
  act(() => {
    fireEvent.click(todayCell)
  })
  const dialog = await screen.findByRole('dialog')
  check('D4.1 点击格子打开当天详情抽屉', dialog.textContent?.includes(today) === true, dialog.textContent?.slice(0, 50))
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  await waitFor(() => {
    if (screen.queryByRole('dialog') !== null) throw new Error('not closed')
  })

  /* ── D5 键盘操作 ─────────────────────────────────────────────────────── */
  const focusable = view.container.querySelector<HTMLElement>(`.v4-dash-heat [data-day="${today}"]`)!
  act(() => {
    focusable.focus()
  })
  act(() => {
    fireEvent.keyDown(focusable, { key: 'ArrowLeft' })
  })
  check('D5.1 方向键把焦点移到上一周', document.activeElement?.getAttribute('data-day') === key(7), document.activeElement?.getAttribute('data-day'))
  act(() => {
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
  })
  const keyDialog = await screen.findByRole('dialog')
  check('D5.2 Enter 打开当天详情', keyDialog.textContent?.includes(key(7)) === true, keyDialog.textContent?.slice(0, 40))
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  await waitFor(() => {
    if (screen.queryByRole('dialog') !== null) throw new Error('not closed')
  })

  /* ── D6 Dashboard 与 History 同日一致 ────────────────────────────────── */
  const dashboardLevels = levelsIn(view.container)
  // 必须在 cleanup 之前取：卸载会清空 container。
  const dashAria = view.container.querySelector(`.v4-dash-heat [data-day="${today}"]`)?.getAttribute('aria-label')
  cleanup()
  const historyView = render(
    withWorkspace(React.createElement(History)),
  )
  const historyLevels = new Map<string, string>()
  historyView.container.querySelectorAll<HTMLElement>('.v4-heat-cell[data-day]').forEach(cell => {
    historyLevels.set(cell.dataset.day ?? '', cell.dataset.level ?? '')
  })
  const diff = [...dashboardLevels.entries()].filter(([day, level]) => historyLevels.get(day) !== level)
  check('D6.1 两个页面 365 天的强度逐日相同', historyLevels.size === 365 && diff.length === 0, diff.slice(0, 3))
  const histAria = historyView.container.querySelector(`[data-day="${today}"]`)?.getAttribute('aria-label')
  check('D6.2 同一天的 aria 描述也一致（分钟/次数/任务数同源）', typeof dashAria === 'string' && dashAria === histAria, {
    dash: dashAria,
    history: histAria,
  })
  cleanup()

  /* ── D7 空数据 ───────────────────────────────────────────────────────── */
  window.localStorage.clear()
  const emptyView = renderDashboard()
  const emptyCells = [...emptyView.container.querySelectorAll<HTMLElement>('.v4-dash-heat .v4-heat-cell[data-day]')]
  check('D7.1 没有数据也画满 365 格', emptyCells.length === 365, emptyCells.length)
  check('D7.2 没有数据时全部是 0 档（不伪造活动）', emptyCells.every(cell => cell.dataset.level === '0'))
  check('D7.3 给出空态提示而不是假数据', emptyView.container.querySelector('.v4-heat-empty')?.textContent?.includes('还没有活跃记录') === true)
  check(
    'D7.4 统计归零',
    emptyView.container.querySelector('.v4-dash-heat')?.textContent?.includes('0 天有活动') === true,
    emptyView.container.querySelector('.v4-card-meta')?.textContent,
  )
  check('D7.5 空状态下不写入任何活跃记录', window.localStorage.getItem(`${KEY}:daily`) === null && window.localStorage.getItem(`${KEY}:logs`) === null)
  cleanup()

  /* ── D8 渲染不改数据 ─────────────────────────────────────────────────── */
  seed()
  const before = ['daily', 'logs', 'tasks', 'timeline'].map(name => window.localStorage.getItem(`${KEY}:${name}`))
  renderDashboard()
  const after = ['daily', 'logs', 'tasks', 'timeline'].map(name => window.localStorage.getItem(`${KEY}:${name}`))
  check('D8.1 渲染热力图不改动任何数据键', JSON.stringify(before) === JSON.stringify(after))

  cleanup()
  console.log(`\nDashboard 热力图：${passed} 通过 / ${failed} 失败`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('Dashboard 热力图测试异常：', error)
  process.exit(1)
})
