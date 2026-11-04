/**
 * components.test.tsx — B3 真实组件渲染测试（jsdom + @testing-library/react）。
 *
 * 不用 jest/vitest：直接 jsdom 起 DOM，esbuild 打包成 CJS 后用 node 跑。
 * 断言用最小 check()，失败退出码 1。
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const win = dom.window as unknown as Window & typeof globalThis
;/** Node 22 的 globalThis 上部分属性是只读 getter，用 defineProperty 覆盖。 */
function expose(name: string, value: unknown): void {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch (error) {
    console.error(`无法注入全局 ${name}：`, error)
    throw error
  }
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

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : String(detail))
  }
}

async function main(): Promise<void> {
  const React = await import('react')
  const { render, screen, fireEvent, cleanup, waitFor, act, within } = await import('@testing-library/react')
  const { TaskList } = await import('../../src/client/board/TaskList')
  const { Dashboard } = await import('../../src/client/v4/Dashboard')
  const { Tasks } = await import('../../src/client/v4/Tasks')
  const { Overview } = await import('../../src/client/board/Overview')
  const { ViewTabs, Button, Sparkline, StreakDots } = await import('../../src/client/v4/ui')
  const { BarChart } = await import('../../src/client/charts/BarChart')
  const { GanttChart } = await import('../../src/client/charts/GanttChart')
  const { PieChart } = await import('../../src/client/charts/PieChart')
  const { wrapEnvelope } = await import('../../src/client/lib/schema')
  const { dayKey } = await import('../../src/client/lib/time')
  const { ConflictHost } = await import('../../src/client/ui/ConflictHost')
  const { NoticeHost } = await import('../../src/client/ui/NoticeHost')
  const { pushNotice, getNotices, dismissNotice } = await import('../../src/client/lib/bus')
  const { reportConflict, clearConflicts, CONFLICT_EVENT } = await import('../../src/client/lib/conflict')
  const { useLocalStore } = await import('../../src/client/hooks/useLocalStore')
  const { WorkspaceProvider } = await import('../../src/client/v4/workspace')
  const { OverlayHost } = await import('../../src/client/v4/Detail')
  /** Dashboard / Tasks 现在依赖统一交互状态；测试里用真实 Provider + 浮层宿主。 */
  const withWorkspace = (node: unknown): any =>
    React.createElement(WorkspaceProvider, null, node, React.createElement(OverlayHost))

  const reset = (): void => {
    cleanup()
    window.localStorage.clear()
    clearConflicts()
    for (const notice of [...getNotices()]) dismissNotice(notice.id)
  }

  /* 1. 首次渲染与空状态 */
  reset()
  render(React.createElement(TaskList, {}))
  check('C1 任务卡首次渲染出标题', screen.queryByText('任务清单') !== null)
  check('C2 空状态文案存在', screen.queryByText(/还没有目标/) !== null)

  /* 2. 新建任务后状态变化 */
  const input = screen.getByLabelText('添加学习目标') as HTMLInputElement
  fireEvent.change(input, { target: { value: '组件测试任务' } })
  fireEvent.click(screen.getByText('Add'))
  await waitFor(() => {
    if (screen.queryByText('组件测试任务') === null) throw new Error('not rendered yet')
  })
  check('C3 点击 Add 后任务出现在列表', screen.queryByText('组件测试任务') !== null)

  /* 3. 错误提示（真实 NoticeHost） */
  reset()
  render(React.createElement(NoticeHost))
  act(() => {
    pushNotice('本地存储已满，本次修改没有保存', 'error')
  })
  check('C4 错误提示被渲染', screen.queryByText(/本地存储已满/) !== null)

  /* 4-5. 冲突横幅与合并 */
  reset()
  render(React.createElement(ConflictHost))
  check('C5 无冲突时不渲染横幅', screen.queryByRole('alertdialog') === null)
  act(() => {
    reportConflict('dsh-otaku-study-board:tasks', 'r1')
  })
  check('C6 单键冲突显示键名', screen.queryByText(/任务/) !== null)
  act(() => {
    reportConflict('dsh-otaku-study-board:logs', 'r2')
  })
  check('C7 多键冲突合并为一条横幅', screen.queryByText(/2 项数据/) !== null)

  /* 6-7. 两个按钮派发的决议 */
  const resolutions: Array<{ key: string; action: string }> = []
  const listener = (event: Event): void => {
    resolutions.push((event as CustomEvent<{ key: string; action: string }>).detail)
  }
  window.addEventListener(CONFLICT_EVENT, listener)
  fireEvent.click(screen.getByText('重新载入（用远端）'))
  check('C8 点「重新载入」派发 reload', resolutions.some(item => item.action === 'reload'), JSON.stringify(resolutions))
  fireEvent.click(screen.getByText('保留本页'))
  check('C9 点「保留本页」派发 keep', resolutions.some(item => item.action === 'keep'), JSON.stringify(resolutions))
  window.removeEventListener(CONFLICT_EVENT, listener)

  /* 8. 保留本页写入失败 → 真实错误提示 */
  reset()
  let attempts = 0
  // jsdom 的 Storage 实例方法在原型上；直接给实例赋值不一定生效，改原型。
  const storageProto = Object.getPrototypeOf(window.localStorage) as Storage
  const originalSetItem = storageProto.setItem
  storageProto.setItem = function patchedSetItem(key: string, value: string): void {
    if (key === 'dsh-otaku-study-board:tasks') {
      attempts += 1
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }
    originalSetItem.call(this, key, value)
  }
  function StoreProbe(): unknown {
    const [state, setState] = useLocalStore<{ n: number }>('dsh-otaku-study-board:tasks', { n: 0 })
    return React.createElement(
      'button',
      { type: 'button', onClick: () => setState({ n: state.n + 1 }) },
      `n=${state.n}`,
    )
  }
  render(React.createElement(React.Fragment, null, React.createElement(StoreProbe), React.createElement(NoticeHost)))
  act(() => {
    fireEvent.click(screen.getByText('n=0'))
  })
  await waitFor(() => {
    if (screen.queryByText(/已满|没有保存/) === null) throw new Error('notice not shown yet')
  })
  check('C10 写入失败时出现「没有保存」提示', screen.queryByText(/已满|没有保存/) !== null, attempts)
  storageProto.setItem = originalSetItem

  /* 11-14. Dashboard 空状态与真实数据 */
  reset()
  render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined })))
  check(
    'C11 Dashboard 渲染统计带与四个区块',
    ['今日任务', '专注', '项目进度', '近 7 日专注', '最近活动'].every(text => screen.queryAllByText(text).length > 0),
  )
  check('C12 空任务显示 Empty State', screen.queryByText('还没有任务') !== null)
  check('C13 空活动/项目显示 Empty State', screen.queryByText('还没有时间轴记录') !== null && screen.queryByText('还没有项目投入') !== null)

  reset()
  const today = dayKey(Date.now())
  window.localStorage.setItem('dsh-otaku-study-board:daily', JSON.stringify(wrapEnvelope([{ day: today, focusMinutes: 50, tasksDone: 1, sessions: 2, friction: 0 }])))
  render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined })))
  check('C14 有 daily 数据时不再显示趋势空态', screen.queryByText('这 7 天还没有专注记录') === null)

  // Dashboard 里的 useNow 会留下 30s 定时器：必须显式清理并退出，
  // 否则 node 进程不结束（上一轮 SIGTERM 的原因）。
  cleanup()
  /* 15-19. P0：空态不画轴、0% 可见、零投入项目 */
  reset()
  const { container: barBox } = render(
    React.createElement(BarChart, {
      points: ['一', '二', '三', '四', '五', '六', '日'].map((label, index) => ({ key: `k${index}`, label, value: 0 })),
    }),
  )
  check('C15 零数据柱状图不渲染 SVG 轴', barBox.querySelector('svg') === null)
  check('C16 零数据柱状图给出空态文案', screen.queryByText('完成第一轮专注后，这里会出现趋势') !== null)

  const { container: ganttBox } = render(
    React.createElement(GanttChart, {
      rows: [{ dayKey: '2026-11-02', label: '11/2', items: [] }],
    }),
  )
  check('C17 零数据甘特图不渲染坐标轴', ganttBox.querySelector('svg') === null)

  const { container: pieEmptyBox } = render(
    React.createElement(PieChart, { slices: [], centerValue: '0m', centerLabel: '今日', emptyHint: '暂无数据' }),
  )
  check('C23 环形图无数据时不渲染 SVG', pieEmptyBox.querySelector('svg') === null)
  check('C24 环形图无数据显示文字空态', screen.queryByText('暂无数据') !== null)

  const { container: pieBox } = render(
    React.createElement(PieChart, {
      slices: [
        { key: 'dev', label: '开发', value: 30, color: '#b0768a' },
        { key: 'debug', label: '排错', value: 10, color: '#b3605f' },
      ],
      centerValue: '40m',
      centerLabel: '今日',
    }),
  )
  check('C25 环形图有数据时仍渲染圆环', pieBox.querySelector('svg') !== null && (pieBox.querySelectorAll('circle').length ?? 0) >= 3)

  reset()
  window.localStorage.setItem(
    'dsh-otaku-study-board:projects',
    JSON.stringify(wrapEnvelope([{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: Date.now() }])),
  )
  window.localStorage.setItem(
    'dsh-otaku-study-board:tasks',
    JSON.stringify(wrapEnvelope([{ id: 't1', title: '一', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: Date.now(), updatedAt: Date.now() }])),
  )
  render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined })))
  check('C18 零投入项目仍显示且计数为 1', screen.queryByText('1 个') !== null && screen.queryByText('TS 前端学习') !== null)
  // 任务标题固定成「一」会和热力图的星期标签撞名，按类名限定到今日任务行。
  const row = screen.getByText('一', { selector: '.v4-today-title' }).closest('li')
  check('C19 0% 明确显示，任务行不再显示 0m', screen.queryAllByText('0%').length >= 1 && (row?.textContent ?? '').includes('0m') === false)

  check(
    'C20 环形图内显示 0%，文案不再重复完成率',
    document.querySelector('svg text')?.textContent === '0%' && screen.queryAllByText(/完成率/).length === 0,
    document.querySelector('svg text')?.textContent,
  )

  reset()
  render(React.createElement(Overview, {}))
  check('C21 「今日会话」改名「今日记录」', screen.queryByText('今日记录') !== null && screen.queryByText('今日会话') === null)

  reset()
  let selected: 'classic' | 'v4' = 'classic'
  render(React.createElement(ViewTabs, { value: selected, onChange: next => { selected = next } }))
  check('C22 ViewTabs 渲染两个视图且可切换', screen.getAllByRole('tab').length === 2 && screen.getByRole('tab', { name: 'V4 Dashboard' }) !== null)

  /* C26-C31：Button 系统 */
  reset()
  let clicks = 0
  const { rerender } = render(React.createElement(Button, { onClick: () => { clicks += 1 } }, '普通按钮'))
  fireEvent.click(screen.getByRole('button', { name: '普通按钮' }))
  check('C26 Button 默认点击回调可用', clicks === 1 && screen.getByRole('button', { name: '普通按钮' }).className.includes('v4-btn'), clicks)
  rerender(React.createElement(Button, { disabled: true, onClick: () => { clicks += 1 } }, '普通按钮'))
  fireEvent.click(screen.getByRole('button', { name: '普通按钮' }))
  check('C27 disabled 不触发回调', clicks === 1, clicks)
  rerender(React.createElement(Button, { loading: true, onClick: () => { clicks += 1 } }, '保存'))
  const loadingBtn = screen.getByRole('button', { name: '保存' })
  check(
    'C28 loading 保留标签与 spinner 且禁用',
    loadingBtn.hasAttribute('disabled') && loadingBtn.getAttribute('aria-busy') === 'true' &&
      screen.queryByText('保存') !== null && loadingBtn.querySelector('.v4-btn-spinner') !== null,
  )
  fireEvent.click(loadingBtn)
  check('C29 loading 不触发回调', clicks === 1, clicks)
  reset()
  render(React.createElement(Button, { variant: 'icon', ariaLabel: '删除任务' }, '×'))
  check('C30 图标按钮有可访问名称', screen.getByLabelText('删除任务') !== null)
  const primaryBox = render(React.createElement(Button, { variant: 'primary' }, '主操作')).container
  check('C31 primary 使用主色而不是固定白底', primaryBox.querySelector('.v4-btn-primary') !== null)

  reset()
  let navigated = ''
  render(withWorkspace(React.createElement(Dashboard, { onNavigate: (target: string) => { navigated = target } })))
  // Phase 6：Phase 5.2 留下的「去专注 → 尚未开放」占位抽屉已删除 ——
  // 计时器在 5.5 就上线了，继续留着它等于让用户以为核心功能不存在。
  check(
    'C32 不再有「去专注」占位入口，专注卡直接可用',
    navigated === '' &&
      screen.queryByRole('button', { name: '去专注' }) === null &&
      [...document.querySelectorAll('.v4-focus-actions button')].some(
        button => (button.textContent ?? '').trim() === '开始专注',
      ),
    navigated,
  )

  /* C33-C35：微可视化只使用真实值 */
  reset()
  const { container: sparkBox } = render(
    React.createElement(Sparkline, { values: [0, 25, 0, 50], labels: ['一', '二', '三', '四'] }),
  )
  const titles = [...sparkBox.querySelectorAll('circle title')].map(node => node.textContent)
  check('C33 Sparkline 每个点带真实日期与分钟', titles.length === 4 && titles[1]?.includes('25 分钟') === true, titles)

  const { container: dotsBox } = render(
    React.createElement(StreakDots, { active: [true, false, true, false, false, false, true], labels: ['一','二','三','四','五','六','日'] }),
  )
  const dots = [...dotsBox.querySelectorAll('span')]
  check('C34 连续记录 7 个点且只填充真实活跃日', dots.length === 7 && dots.filter(dot => (dot as HTMLElement).style.background !== 'transparent').length === 3)
  check('C35 无记录时 7 个点全部为空心', (() => {
    const empty = render(React.createElement(StreakDots, { active: [false,false,false,false,false,false,false], labels: [] })).container
    return [...empty.querySelectorAll('span')].every(dot => (dot as HTMLElement).style.background === 'transparent')
  })())

  reset()
  window.localStorage.setItem('dsh-otaku-study-board:projects', JSON.stringify(wrapEnvelope([{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: Date.now() }])))
  window.localStorage.setItem('dsh-otaku-study-board:tasks', JSON.stringify(wrapEnvelope([
    { id: 'a', title: '完成任务', status: 'done', done: true, pomodoros: 0, projectId: 'p1', createdAt: Date.now(), updatedAt: Date.now(), completedAt: Date.now() },
    { id: 'b', title: '未完成任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: Date.now(), updatedAt: Date.now() },
  ])))
  render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined })))
  check('C36 项目卡展示真实完成/总数', screen.queryByText(/1\/2/) !== null)

  /* C37-C42：V4 Tasks */
  reset()
  window.localStorage.setItem('dsh-otaku-study-board:projects', JSON.stringify(wrapEnvelope([{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: Date.now() }])))
  window.localStorage.setItem('dsh-otaku-study-board:tasks', JSON.stringify(wrapEnvelope([
    { id: 't1', title: '初始任务', status: 'todo', done: false, pomodoros: 0, priority: 'urgent', projectId: 'p1', createdAt: Date.now(), updatedAt: Date.now() },
  ])))
  render(withWorkspace(React.createElement(Tasks)))
  check('C37 Tasks 渲染任务与统计', screen.queryByText('初始任务') !== null && screen.queryByText(/1 个任务/) !== null)
  const search = screen.getByLabelText('搜索任务') as HTMLInputElement
  fireEvent.change(search, { target: { value: '不存在的关键词' } })
  check('C38 搜索无结果展示空态', screen.queryByText('没有匹配的任务') !== null)
  fireEvent.change(search, { target: { value: '' } })
  const rawBefore = window.localStorage.getItem('dsh-otaku-study-board:tasks')
  fireEvent.click(screen.getByRole('button', { name: '已完成' }))
  check('C43 筛选不修改原始任务数据', window.localStorage.getItem('dsh-otaku-study-board:tasks') === rawBefore)
  fireEvent.click(screen.getByRole('button', { name: '全部' }))

  fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '新任务A' } })
  fireEvent.change(screen.getByLabelText('优先级'), { target: { value: 'important' } })
  fireEvent.click(screen.getByRole('button', { name: '创建' }))
  check('C39 新建任务出现在列表', screen.queryByText('新任务A') !== null)

  const editButtons = screen.getAllByRole('button', { name: '编辑' })
  fireEvent.click(editButtons[0]!)
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '改名后的任务' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  check('C40 编辑任务更新标题', screen.queryByText('改名后的任务') !== null)

  const checkbox = screen.getAllByRole('checkbox')[0]!
  fireEvent.click(checkbox)
  check('C41 勾选任务后变为已完成', screen.getAllByRole('checkbox')[0]?.getAttribute('aria-checked') === 'true')

  const deleteButtons = screen.getAllByRole('button', { name: '删除' })
  fireEvent.click(deleteButtons[0]!)
  const alert = screen.getByRole('alert')
  fireEvent.click(within(alert).getByRole('button', { name: '删除' }))
  check('C42 删除确认后任务消失', screen.queryByText('改名后的任务') === null)

  /* C44-C46：V4 工作台入口与高频操作 */
  const { V4Shell } = await import('../../src/client/v4/Shell')
  reset()
  render(
    React.createElement(
      V4Shell,
      { page: 'dashboard', onPageChange: () => undefined },
      React.createElement('div', null, 'body'),
    ),
  )
  check(
    'C44 顶部工具栏取代双工作台切换',
    screen.queryByRole('button', { name: '任务' }) !== null &&
      screen.queryByLabelText('当前项目') !== null &&
      screen.queryByText('经典工作台') === null &&
      screen.queryByRole('tab', { name: 'V4 Dashboard' }) === null &&
      screen.queryByText('经典工具') === null,
  )

  reset()
  render(withWorkspace(React.createElement(Tasks, { createSignal: 1 })))
  check('C45 外部新建信号直接打开任务表单', screen.queryByLabelText('任务标题') !== null)

  reset()
  window.localStorage.setItem('dsh-otaku-study-board:projects', JSON.stringify(wrapEnvelope([{ id: 'p1', name: 'P1', archived: false, createdAt: Date.now() }])))
  window.localStorage.setItem('dsh-otaku-study-board:tasks', JSON.stringify(wrapEnvelope([
    { id: 'q1', title: '可勾选任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: Date.now(), updatedAt: Date.now() },
  ])))
  render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined, onCreateTask: () => undefined })))
  fireEvent.click(screen.getByRole('checkbox', { name: '完成 可勾选任务' }))
  const storedTasks = JSON.parse(window.localStorage.getItem('dsh-otaku-study-board:tasks') ?? '{}')
  check('C46 Dashboard 勾选完成写回任务', storedTasks.data?.[0]?.done === true, storedTasks)

  console.log(`\n组件结果：${passed} 通过 / ${failed} 失败`)
  process.exit(failed > 0 ? 1 : 0)
  if (failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error('组件测试异常：', error)
  process.exit(1)
})
