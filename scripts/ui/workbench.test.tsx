/**
 * workbench.test.tsx — Phase 5.2 统一工作台交互测试（jsdom + @testing-library/react）。
 *
 * 覆盖：统一浮层（抽屉 / 弹层）、Esc、遮罩、焦点回归、滚动锁、互斥、
 * 卡片内展开唯一性、任务行内展开、趋势点键盘激活、新建 / 编辑 / 删除写回、
 * 以及「没有经典入口」这条产品约束。
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
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : String(detail))
  }
}

const KEY = 'dsh-otaku-study-board'

async function main(): Promise<void> {
  const React = await import('react')
  const { render, screen, fireEvent, cleanup, waitFor, act } = await import('@testing-library/react')
  const { V4Shell } = await import('../../src/client/v4/Shell')
  const { Dashboard } = await import('../../src/client/v4/Dashboard')
  const { Tasks } = await import('../../src/client/v4/Tasks')
  const { WorkspaceProvider } = await import('../../src/client/v4/workspace')
  const { OverlayHost } = await import('../../src/client/v4/Detail')
  const { wrapEnvelope } = await import('../../src/client/lib/schema')
  const { dayKey } = await import('../../src/client/lib/time')

  const wrap = (data: unknown): string => JSON.stringify(wrapEnvelope(data))
  const now = Date.now()

  const seed = (): void => {
    cleanup()
    window.localStorage.clear()
    window.localStorage.setItem(`${KEY}:projects`, wrap([{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: now }]))
    window.localStorage.setItem(
      `${KEY}:tasks`,
      wrap([
        {
          id: 't1',
          title: '写最小复现',
          status: 'todo',
          done: false,
          pomodoros: 0,
          priority: 'urgent',
          projectId: 'p1',
          dueAt: now + 86_400_000,
          note: '先定位再改',
          createdAt: now - 3_600_000,
          updatedAt: now,
        },
        {
          id: 't2',
          title: '补一条回归用例',
          status: 'done',
          done: true,
          pomodoros: 1,
          focusedMinutes: 25,
          projectId: 'p1',
          createdAt: now - 7_200_000,
          updatedAt: now,
          completedAt: now - 3_600_000,
        },
      ]),
    )
    window.localStorage.setItem(
      `${KEY}:daily`,
      wrap([{ day: dayKey(now), focusMinutes: 50, tasksDone: 1, sessions: 2, friction: 0 }]),
    )
    window.localStorage.setItem(
      `${KEY}:logs`,
      wrap([{ id: 'l1', at: now - 3_600_000, kind: 'focus', title: '专注 50 分钟', minutes: 50, projectId: 'p1', source: 'manual', edited: false }]),
    )
    window.localStorage.setItem(`${KEY}:timeline`, wrap([]))
    window.localStorage.setItem(
      `${KEY}:knowledge`,
      wrap({
        nodes: [
          { id: 'k1', title: '条件类型分发', status: 'learned', mastery: 4, projectIds: ['p1'], taskIds: [], logIds: [], frictionIds: [], origin: 'manual', createdAt: now, updatedAt: now, reviewCount: 1 },
        ],
        edges: [],
      }),
    )
    window.localStorage.setItem(
      `${KEY}:memory`,
      wrap([{ projectId: 'p1', intro: 'TS 学习', stack: [], architecture: '', done: [], progress: '', openIssues: [], resolvedIssues: [], decisions: [], nextSteps: [], updatedAt: now, version: 2, source: 'manual' }]),
    )
    window.localStorage.setItem(`${KEY}:reviews`, wrap([]))
  }

  const withWorkspace = (node: unknown) => React.createElement(WorkspaceProvider, null, node, React.createElement(OverlayHost))

  const renderDashboard = () => render(withWorkspace(React.createElement(Dashboard, { onNavigate: () => undefined })))

  /* D1 产品约束：没有经典入口、没有双工作台切换器 */
  seed()
  render(
    React.createElement(
      V4Shell,
      { page: 'dashboard', onPageChange: () => undefined },
      React.createElement('div', { 'data-testid': 'body' }, 'body'),
    ),
  )
  check(
    'D1 顶部工具栏没有经典工具 / 双工作台切换',
    document.body.textContent?.includes('经典') !== true &&
      screen.queryByRole('tab') === null &&
      screen.queryByText('经典工作台') === null &&
      screen.queryByRole('button', { name: '任务' }) !== null,
  )

  /* D2 指标点击 → 统一抽屉 */
  seed()
  renderDashboard()
  const statButtons = [...document.querySelectorAll<HTMLButtonElement>('.v4-stat-button')]
  check('D2 四个指标都是可点按钮', statButtons.length === 4, statButtons.length)
  act(() => {
    statButtons[0]!.focus()
    statButtons[0]!.click()
  })
  const dialog = screen.getByRole('dialog')
  check(
    'D3 点击指标打开抽屉并显示统计正文',
    dialog.classList.contains('v4-drawer') &&
      dialog.textContent?.includes('今日任务') === true &&
      dialog.textContent?.includes('待完成') === true,
    dialog.textContent?.slice(0, 80),
  )

  /* D4 打开时锁滚动 */
  check('D4 抽屉打开时背景滚动被锁', document.body.style.overflow === 'hidden', document.body.style.overflow)

  /* D5 Esc 关闭 + 焦点回到触发元素 */
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  await waitFor(() => {
    if (document.activeElement !== statButtons[0]) throw new Error('focus not restored yet')
  })
  check(
    'D5 Esc 关闭抽屉并把焦点还给触发按钮',
    screen.queryByRole('dialog') === null && document.activeElement === statButtons[0],
    document.activeElement?.className,
  )
  check('D6 关闭后滚动锁解除', document.body.style.overflow !== 'hidden', document.body.style.overflow)

  /* D7 点遮罩关闭 */
  act(() => {
    statButtons[1]!.click()
  })
  const overlay = document.querySelector('.v4-overlay')!
  act(() => {
    fireEvent.mouseDown(overlay)
  })
  check('D7 点击遮罩关闭浮层', screen.queryByRole('dialog') === null)

  /* D8 卡片内展开唯一性 */
  seed()
  renderDashboard()
  const focusToggle = document.querySelector<HTMLButtonElement>('[data-panel="focus"] .v4-expand-toggle')!
  const projectToggle = document.querySelector<HTMLButtonElement>('[data-panel="projects"] .v4-expand-toggle')!
  act(() => {
    focusToggle.click()
  })
  check('D8 展开专注卡后出现 7 日明细', document.querySelector('[data-panel="focus"] .v4-expand-body') !== null)
  act(() => {
    projectToggle.click()
  })
  check(
    'D9 展开另一块面板时前一块自动收起',
    document.querySelector('[data-panel="focus"] .v4-expand-body') === null &&
      document.querySelector('[data-panel="projects"] .v4-expand-body') !== null,
  )

  /* D10 今日任务行内展开 */
  seed()
  renderDashboard()
  const todayButton = document.querySelector<HTMLButtonElement>('.v4-today-main')!
  act(() => {
    todayButton.click()
  })
  check(
    'D10 今日任务行内展开显示备注与事实',
    todayButton.getAttribute('aria-expanded') === 'true' &&
      document.querySelector('.v4-today-detail')?.textContent?.includes('先定位再改') === true,
  )
  act(() => {
    todayButton.click()
  })
  check('D11 再次点击收起行内详情', document.querySelector('.v4-today-detail') === null)

  /* D12 趋势点键盘激活 */
  const sparkHit = document.querySelector<SVGCircleElement>('.v4-spark-hit')
  check('D12 趋势点渲染为可聚焦按钮', sparkHit !== null && sparkHit.getAttribute('tabindex') === '0')
  act(() => {
    sparkHit!.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  check(
    'D13 键盘 Enter 打开对应日期的抽屉',
    screen.queryByRole('dialog')?.textContent?.includes('当天完成的专注') === true,
    screen.queryByRole('dialog')?.textContent?.slice(0, 60),
  )

  /* D14 顶部新建任务 → 弹层 → 写入 */
  seed()
  render(
    React.createElement(
      V4Shell,
      { page: 'dashboard', onPageChange: () => undefined },
      React.createElement(Dashboard, { onNavigate: () => undefined }),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
  check(
    'D14 顶部新建打开居中弹层',
    document.querySelector('.v4-modal') !== null && screen.getByLabelText('任务标题') !== null,
  )
  act(() => {
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '从工作台新建的任务' } })
  })
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
  })
  await waitFor(() => {
    const stored = JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}')
    if ((stored.data ?? []).length !== 3) throw new Error('not written yet')
  })
  check('D15 弹层创建写回任务并关闭', document.querySelector('.v4-modal') === null)
  check('D16 新建后列表出现新任务', screen.queryByText('从工作台新建的任务') !== null)

  /* D17 弹层与抽屉互斥 */
  act(() => {
    document.querySelector<HTMLButtonElement>('.v4-stat-button')!.click()
  })
  check('D17 打开抽屉时弹层自动收起', document.querySelector('.v4-modal') === null && document.querySelector('.v4-drawer') !== null)

  /* D18 任务抽屉里删除：两步确认 */
  seed()
  render(
    React.createElement(
      V4Shell,
      { page: 'tasks', onPageChange: () => undefined },
      React.createElement(Tasks, {}),
    ),
  )
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.v4-task-open')]
  act(() => {
    rows[0]!.click()
  })
  check('D18 任务页行内展开出现操作区', document.querySelector('.v4-task-inline') !== null)
  const detailButton = [...document.querySelectorAll<HTMLButtonElement>('.v4-task-inline button')].find(
    button => (button.textContent ?? '') === '完整详情',
  )!
  act(() => {
    detailButton.click()
  })
  const drawer = screen.getByRole('dialog')
  const deleteButton = [...drawer.querySelectorAll<HTMLButtonElement>('button')].find(
    button => (button.textContent ?? '').trim() === '删除',
  )!
  act(() => {
    deleteButton.click()
  })
  check('D19 抽屉删除先要求确认', drawer.textContent?.includes('删除后不可恢复') === true)
  const confirmButton = [...drawer.querySelectorAll<HTMLButtonElement>('button')].find(
    button => (button.textContent ?? '').trim() === '确认删除',
  )!
  act(() => {
    confirmButton.click()
  })
  const storedAfterDelete = JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}')
  check(
    'D20 确认删除移除任务并关闭抽屉',
    (storedAfterDelete.data ?? []).length === 1 && screen.queryByRole('dialog') === null,
    (storedAfterDelete.data ?? []).length,
  )

  /* D21 知识卡读真实数据 */
  seed()
  renderDashboard()
  const knowledgePanel = document.querySelector('[data-panel="knowledge"]')!
  check(
    'D21 知识与记忆卡显示真实计数',
    knowledgePanel.textContent?.includes('1 个知识点') === true && knowledgePanel.textContent?.includes('记忆文档') === true,
    knowledgePanel.textContent?.slice(0, 80),
  )
  act(() => {
    knowledgePanel.querySelector<HTMLButtonElement>('.v4-expand-toggle')!.click()
  })
  check(
    'D22 展开后出现知识点且不提供写入口',
    knowledgePanel.textContent?.includes('条件类型分发') === true && knowledgePanel.textContent?.includes('编辑与排期随 Knowledge 阶段迁移') === true,
  )

  /*
   * D23 的期望在 Phase 5.5 变了：计时器不再是「尚未开放」的占位抽屉，
   * 而是真实的 FocusPanel。这里改成验证「点开始就真的进入专注中」，
   * 而不是断言按钮不存在 —— 旧断言正好是被本阶段替换掉的行为。
   */
  seed()
  renderDashboard()
  const startButton = [...document.querySelectorAll<HTMLButtonElement>('.v4-focus-actions button')].find(
    button => (button.textContent ?? '').trim() === '开始专注',
  )!
  act(() => {
    startButton.click()
  })
  check(
    'D23 专注面板可直接开始计时（不再是占位说明）',
    document.querySelector('.v4-focus-state-chip')?.textContent === '专注中' &&
      screen.queryByRole('dialog') === null &&
      [...document.querySelectorAll('.v4-focus-actions button')].some(button => (button.textContent ?? '').trim() === '暂停'),
  )

  /* D24 项目行 → 项目抽屉 */
  seed()
  renderDashboard()
  const projectButton = document.querySelector<HTMLButtonElement>('.v4-project-button')!
  act(() => {
    projectButton.click()
  })
  check(
    'D24 点击项目打开项目抽屉并显示真实统计',
    screen.queryByRole('dialog')?.textContent?.includes('TS 前端学习') === true &&
      screen.queryByRole('dialog')?.textContent?.includes('完成 1 / 2') === true,
    screen.queryByRole('dialog')?.textContent?.slice(0, 80),
  )

  /* D25 任务页编辑保存（复用同一份表单组件） */
  seed()
  render(
    React.createElement(
      V4Shell,
      { page: 'tasks', onPageChange: () => undefined },
      React.createElement(Tasks),
    ),
  )
  fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!)
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '改过的标题' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  const storedAfterEdit = JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}')
  check(
    'D25 任务页编辑走同一份表单并写回',
    (storedAfterEdit.data ?? []).some((task: { title: string }) => task.title === '改过的标题') &&
      screen.queryByText('改过的标题') !== null,
  )

  cleanup()
  console.log(`\n工作台交互：${passed} 通过 / ${failed} 失败`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('工作台交互测试异常：', error)
  process.exit(1)
})
