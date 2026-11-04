/**
 * history.test.tsx — 历史页与热力图的 jsdom 交互测试（Phase 5.4）。
 *
 * 覆盖：365 格渲染、范围切换、统计一致性、tooltip、点击/键盘打开日期详情、
 * 空状态、列表分页。数据按「今天」相对偏移构造，不依赖机器当前日期。
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
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}

const KEY = 'dsh-otaku-study-board'

async function main(): Promise<void> {
  const React = await import('react')
  const { render, screen, fireEvent, cleanup, waitFor, act } = await import('@testing-library/react')
  const { History } = await import('../../src/client/v4/History')
  const { WorkspaceProvider } = await import('../../src/client/v4/workspace')
  const { OverlayHost } = await import('../../src/client/v4/Detail')
  const { wrapEnvelope } = await import('../../src/client/lib/schema')
  const { dayKey } = await import('../../src/client/lib/time')

  const now = new Date()
  const atDay = (offset: number, hour = 12): number => {
    const date = new Date(now)
    date.setHours(hour, 0, 0, 0)
    date.setDate(date.getDate() - offset)
    return date.getTime()
  }
  const key = (offset: number): string => dayKey(atDay(offset))
  const today = key(0)
  const wrap = (data: unknown): string => JSON.stringify(wrapEnvelope(data))

  const withWorkspace = (node: unknown) => React.createElement(WorkspaceProvider, null, node, React.createElement(OverlayHost))

  const seed = (): void => {
    cleanup()
    window.localStorage.clear()
    window.localStorage.setItem(`${KEY}:projects`, wrap([{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: now.getTime() }]))
    window.localStorage.setItem(
      `${KEY}:daily`,
      wrap([
        { day: key(0), focusMinutes: 60, tasksDone: 1, sessions: 0, friction: 0 },
        { day: key(1), focusMinutes: 25, tasksDone: 0, sessions: 0, friction: 0 },
      ]),
    )
    window.localStorage.setItem(
      `${KEY}:tasks`,
      wrap([
        { id: 't1', title: '今天的任务', status: 'done', done: true, pomodoros: 1, projectId: 'p1', createdAt: atDay(0, 9), updatedAt: atDay(0, 18), completedAt: atDay(0, 18) },
        { id: 't2', title: '三天前的任务', status: 'done', done: true, pomodoros: 1, projectId: 'p1', createdAt: atDay(3, 9), updatedAt: atDay(3, 18), completedAt: atDay(3, 18) },
      ]),
    )
    window.localStorage.setItem(`${KEY}:logs`, wrap([]))
    window.localStorage.setItem(
      `${KEY}:timeline`,
      wrap(
        Array.from({ length: 10 }, (_, index) => ({
          id: `e${index}`,
          at: atDay(index, 19),
          type: index % 2 === 0 ? 'focus.completed' : 'task.completed',
          title: `第 ${index + 1} 天的活动`,
        })),
      ),
    )
  }

  const renderHistory = () => render(withWorkspace(React.createElement(History)))

  /* H1 基础渲染 */
  seed()
  const { container } = renderHistory()
  const cells = container.querySelectorAll('.v4-heat-cell[data-day]')
  check('H1 渲染 365 个可点格子', cells.length === 365, cells.length)
  check(
    'H2 月份标签 >= 12 且星期标签存在',
    container.querySelectorAll('.v4-heat-months span').length >= 12 &&
      [...container.querySelectorAll('.v4-heat-weekdays span')].map(node => node.textContent).join('') === '一三五',
  )
  const stats = [...container.querySelectorAll('.v4-history-value')].map(node => node.textContent)
  check(
    'H3 统计与数据一致：活跃 3 / 最长 2 / 当前 2 / 总专注 1h25m',
    stats[0] === '3/ 365' && stats[1] === '2天' && stats[2] === '2天' && stats[3] === '1h 25m',
    stats,
  )
  check('H4 今天格子带 is-today 标记', container.querySelector(`[data-day="${today}"]`)?.classList.contains('is-today') === true)

  /* H5 tooltip */
  const todayCell = container.querySelector<HTMLElement>(`[data-day="${today}"]`)!
  act(() => {
    fireEvent.mouseOver(todayCell)
  })
  // tooltip 通过 portal 挂到浮层宿主，不在 render 容器里。
  const tip = document.querySelector('.v4-heat-tip')
  check(
    'H5 悬停显示日期、完成、专注与活动数',
    tip !== null &&
      tip.textContent?.includes('完成任务：1') === true &&
      tip.textContent?.includes('专注时间：60 分钟') === true &&
      tip.textContent?.includes('学习活动：2 项') === true,
    tip?.textContent,
  )
  act(() => {
    fireEvent.mouseLeave(container.querySelector('.v4-heat-grid')!)
  })
  check('H6 移出后 tooltip 消失', document.querySelector('.v4-heat-tip') === null)

  /* H7 范围切换 */
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '30 天' }))
  })
  check('H7 切到 30 天后只剩 30 个格子', container.querySelectorAll('.v4-heat-cell[data-day]').length === 30)
  const stats30 = [...container.querySelectorAll('.v4-history-value')].map(node => node.textContent)
  check(
    'H8 范围切换后统计同步（活跃分母变 30，其余不变）',
    JSON.stringify(stats30) === JSON.stringify(['3/ 30', '2天', '2天', '1h 25m']),
    stats30,
  )
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '365 天' }))
  })

  /* H9 键盘导航 + Enter 打开详情 */
  // 范围切回 365 后重新取节点：之前的 DOM 已被替换。
  const todayCellAgain = container.querySelector<HTMLElement>(`[data-day="${today}"]`)!
  act(() => {
    todayCellAgain.focus()
  })
  act(() => {
    fireEvent.keyDown(todayCellAgain, { key: 'ArrowLeft' })
  })
  const focusedDay = document.activeElement?.getAttribute('data-day')
  check('H9 方向键左移一周并把焦点移过去', focusedDay === key(7), { focused: focusedDay, expect: key(7) })
  act(() => {
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
  })
  const dialog = await screen.findByRole('dialog')
  check('H10 Enter 打开当天详情抽屉', dialog.textContent?.includes(key(7)) === true, dialog.textContent?.slice(0, 60))
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  await waitFor(() => {
    if (screen.queryByRole('dialog') !== null || document.activeElement?.getAttribute('data-day') !== key(7)) {
      throw new Error('focus not restored yet')
    }
  })
  check('H11 Esc 关闭后焦点回到格子', document.activeElement?.getAttribute('data-day') === key(7), document.activeElement?.className)

  /* H12 点击无活动的日期 */
  const emptyCell = container.querySelector<HTMLElement>(`[data-day="${key(2)}"]`)!
  act(() => {
    fireEvent.click(emptyCell)
  })
  const emptyDialog = await screen.findByRole('dialog')
  check(
    'H12 无活动日期展示真实空状态',
    emptyDialog.textContent?.includes('这一天没有 focus 记录') === true &&
      emptyDialog.textContent?.includes('这一天没有完成任务') === true,
    emptyDialog.textContent?.slice(0, 80),
  )
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  await waitFor(() => {
    if (screen.queryByRole('dialog') !== null) throw new Error('not closed')
  })

  /* H13 历史列表分页 */
  const groups = container.querySelectorAll('.v4-history-group')
  check('H13 列表默认只渲染 8 天（不一次性渲染全部）', groups.length === 8, groups.length)
  const more = screen.getByRole('button', { name: /加载更早/ })
  act(() => {
    fireEvent.click(more)
  })
  check('H14 加载更多后展示全部 10 天', container.querySelectorAll('.v4-history-group').length === 10)

  /* H15 空数据 */
  cleanup()
  window.localStorage.clear()
  const emptyRender = renderHistory()
  const emptyStats = [...emptyRender.container.querySelectorAll('.v4-history-value')].map(node => node.textContent)
  check(
    'H15 无数据时统计为 0 且列表显示空状态',
    emptyStats[0] === '0/ 365' && emptyStats[1] === '0天' && emptyStats[2] === '0天' && emptyStats[3] === '0m' &&
      screen.queryByText('还没有历史记录') !== null,
    emptyStats,
  )
  check('H16 无数据时热力图仍渲染 365 个空格子', emptyRender.container.querySelectorAll('.v4-heat-cell[data-day]').length === 365)

  cleanup()
  console.log(`\n历史页：${passed} 通过 / ${failed} 失败`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('历史页测试异常：', error)
  process.exit(1)
})
