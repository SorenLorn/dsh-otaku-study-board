/**
 * data.test.tsx — Phase 5.3 数据管理测试（jsdom + @testing-library/react）。
 *
 * 覆盖：导出准备（全量 / 时间窗 / 归档）、导入预览、合并、覆盖、旧版本、
 * 非法 JSON、超大文件、坏记录跳过、冲突、写入失败回滚、清空事务与两步确认。
 *
 * 真实下载与真实文件选择在 `data-browser.test.mjs` 里验证；这里只验证数据链路。
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
expose('File', win.File)
expose('FileReader', win.FileReader)
expose('Blob', win.Blob)
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
  const { Settings } = await import('../../src/client/v4/Settings')
  const { useBackup } = await import('../../src/client/hooks/useBackup')
  const { wrapEnvelope } = await import('../../src/client/lib/schema')
  const { buildBackup, parseBackup, serializeBackup } = await import('../../src/client/lib/backup')
  const { dayKey } = await import('../../src/client/lib/time')

  const wrap = (data: unknown): string => JSON.stringify(wrapEnvelope(data))
  const now = Date.now()
  const old = now - 40 * 86_400_000

  const seed = (): void => {
    cleanup()
    window.localStorage.clear()
    window.localStorage.setItem(`${KEY}:projects`, wrap([
      { id: 'p1', name: 'TS 前端学习', archived: false, createdAt: now },
      { id: 'p2', name: '旧项目', archived: true, createdAt: old },
    ]))
    window.localStorage.setItem(
      `${KEY}:tasks`,
      wrap([
        { id: 't1', title: '当前任务', status: 'todo', done: false, pomodoros: 0, priority: 'urgent', projectId: 'p1', createdAt: now, updatedAt: now },
        { id: 't2', title: '旧任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p2', createdAt: old, updatedAt: old },
      ]),
    )
    window.localStorage.setItem(
      `${KEY}:logs`,
      wrap([
        { id: 'l1', at: now - 3_600_000, kind: 'focus', title: '专注 25', minutes: 25, projectId: 'p1', source: 'manual', edited: false },
        { id: 'l2', at: old, kind: 'focus', title: '旧专注', minutes: 50, projectId: 'p2', source: 'manual', edited: false },
      ]),
    )
    window.localStorage.setItem(`${KEY}:friction`, wrap([]))
    window.localStorage.setItem(`${KEY}:meta`, wrap({ sessionTaskMap: {} }))
    window.localStorage.setItem(
      `${KEY}:settings`,
      wrap({ activeProjectId: 'p1', autoCapture: true, lastDurationMinutes: 25, projectRules: [], monthlyGoal: { month: '', targetMinutes: 600, targetTasks: 10 } }),
    )
    window.localStorage.setItem(`${KEY}:daily`, wrap([{ day: dayKey(now), focusMinutes: 25, tasksDone: 0, sessions: 1, friction: 0 }]))
    window.localStorage.setItem(`${KEY}:timeline`, wrap([{ id: 'e1', at: now, type: 'task.created', title: '新建任务：当前任务' }]))
    window.localStorage.setItem(
      `${KEY}:memory`,
      wrap([{ projectId: 'p1', intro: 'TS 学习', stack: ['TS'], architecture: '', done: [], progress: '', openIssues: [], resolvedIssues: [], decisions: [], nextSteps: [], updatedAt: now, version: 2, source: 'manual' }]),
    )
    window.localStorage.setItem(
      `${KEY}:knowledge`,
      wrap({ nodes: [{ id: 'k1', title: '条件类型', status: 'learning', mastery: 2, projectIds: ['p1'], taskIds: [], logIds: [], frictionIds: [], origin: 'manual', createdAt: now, updatedAt: now, reviewCount: 0 }], edges: [] }),
    )
    window.localStorage.setItem(`${KEY}:reviews`, wrap([]))
    window.localStorage.setItem(`${KEY}:history`, wrap([]))
  }

  const makePayload = (overrides: Record<string, unknown> = {}) =>
    buildBackup({
      tasks: [
        { id: 't1', title: '备份里的当前任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: now, updatedAt: now },
        { id: 't9', title: '备份新增任务', status: 'todo', done: false, pomodoros: 0, projectId: 'p1', createdAt: now, updatedAt: now },
      ],
      logs: [{ id: 'l9', at: now, kind: 'focus', title: '备份专注', minutes: 30, projectId: 'p1', source: 'manual', edited: false }],
      projects: [{ id: 'p1', name: 'TS 前端学习', archived: false, createdAt: now }],
      settings: { autoCapture: true, lastDurationMinutes: 25, projectRules: [], monthlyGoal: { month: '', targetMinutes: 600, targetTasks: 10 } },
      friction: [],
      meta: { sessionTaskMap: {} },
      memory: [],
      knowledge: { nodes: [], edges: [] },
      reviews: [],
      timeline: [],
      history: [],
      daily: [],
      scope: 'all',
      ...overrides,
    })

  /* ── 导出准备 ──────────────────────────────────────────────────────────── */
  let api: import('../../src/client/hooks/useBackup').BackupApi | null = null
  function BackupProbe(): null {
    api = useBackup()
    return null
  }

  seed()
  render(React.createElement(BackupProbe))
  const all = api!.prepareExport('all')
  check('E1 全量导出准备成功', all.ok === true)
  if (all.ok) {
    check('E2 文件名为全量 + 时间戳', /^sorchron-board-backup-all-\d{8}-\d{6}\.json$/.test(all.fileName), all.fileName)
    check(
      'E3 12 个字段齐全且版本为 4',
      all.payload.version === 4 &&
        Array.isArray(all.payload.memory) &&
        all.payload.knowledge !== undefined &&
        Array.isArray(all.payload.daily),
      all.payload.version,
    )
    check('E4 字节数与文本一致', all.bytes === new TextEncoder().encode(all.text).length, { bytes: all.bytes })
    check('E5 含归档项目（全量不丢归档数据）', all.counts.projects === 2, all.counts.projects)
    const reparsed = parseBackup(all.text)
    check(
      'E6 导出的文本可以再次解析且条数一致',
      reparsed.ok === true && reparsed.payload.tasks.length === all.counts.tasks && reparsed.report.sourceVersion === 4,
      reparsed.ok ? reparsed.payload.tasks.length : reparsed.error,
    )
  }

  const week = api!.prepareExport('week')
  check(
    'E7 近 7 天导出排除旧任务与旧日志且不带归档项目',
    week.ok === true && week.counts.tasks === 1 && week.counts.logs === 1 && week.counts.projects === 1,
    week.ok ? week.counts : week.message,
  )

  cleanup()
  window.localStorage.clear()
  render(React.createElement(BackupProbe))
  const empty = api!.prepareExport('all')
  check(
    'E8 空数据也能导出（结构完整、条数为 0）',
    empty.ok === true &&
      empty.counts.tasks === 0 &&
      empty.payload.tasks.length === 0 &&
      empty.payload.knowledge.nodes.length === 0,
  )

  /* ── 导入 ──────────────────────────────────────────────────────────────── */
  const renderSettings = () => render(React.createElement(Settings))
  const pickFile = async (text: string, name = 'backup.json'): Promise<void> => {
    const file = new window.File([text], name, { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('选择备份文件'), { target: { files: [file] } })
    await waitFor(() => {
      const ready = document.querySelector('.v4-data-source') !== null ||
        document.querySelector('.v4-data-import .v4-data-result[data-ok="false"]') !== null
      if (!ready) throw new Error('preview not ready')
    })
  }

  seed()
  renderSettings()
  const payload = makePayload()
  await pickFile(serializeBackup(payload))

  check(
    'I1 预览显示文件信息与条数',
    screen.queryByText('backup.json') !== null &&
      screen.queryByText('v4') !== null &&
      screen.queryByText('合并') !== null,
  )
  check('I2 预览阶段不写存储', JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data.length === 2)
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '合并导入' }))
  })
  await waitFor(() => {
    if (screen.queryByText('合并导入完成') === null) throw new Error('not done')
  })
  const mergedTasks = JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data
  check(
    'I3 合并导入：同 id 以备份为准、新增保留、本地独有保留',
    mergedTasks.length === 3 &&
      mergedTasks.some((task: { id: string; title: string }) => task.id === 't1' && task.title === '备份里的当前任务') &&
      mergedTasks.some((task: { id: string }) => task.id === 't9') &&
      mergedTasks.some((task: { id: string }) => task.id === 't2'),
    mergedTasks.map((task: { id: string }) => task.id),
  )
  check('I4 导入追加了历史快照', JSON.parse(window.localStorage.getItem(`${KEY}:history`) ?? '{}').data.length === 1)

  /* 重复导入：条数不再增长 */
  await pickFile(serializeBackup(payload), 'again.json')
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '合并导入' }))
  })
  await waitFor(() => {
    if (screen.queryByText('合并导入完成') === null) throw new Error('not done')
  })
  const twiceTasks = JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data
  check('I5 重复导入同一文件任务数不变（按 id 幂等）', twiceTasks.length === 3, twiceTasks.length)

  /* 覆盖导入需要勾选确认 */
  seed()
  renderSettings()
  await pickFile(serializeBackup(payload), 'overwrite.json')
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '覆盖' }))
  })
  const overwriteButton = screen.getByRole('button', { name: '覆盖并替换' }) as HTMLButtonElement
  check('I6 覆盖按钮在勾选前不可用', overwriteButton.disabled === true)
  act(() => {
    fireEvent.click(screen.getByLabelText(/我了解本地数据将被替换/))
  })
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '覆盖并替换' }))
  })
  await waitFor(() => {
    if (screen.queryByText('覆盖导入完成') === null) throw new Error('not done')
  })
  const overwritten = JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data
  check(
    'I7 覆盖导入替换本地独有记录',
    overwritten.length === 2 && overwritten.every((task: { id: string }) => task.id !== 't2'),
    overwritten.map((task: { id: string }) => task.id),
  )

  /* 旧版本 + 缺少 V4 字段 */
  seed()
  renderSettings()
  const legacy = {
    kind: 'sorchron-study-board-backup',
    version: 2,
    exportedAt: now,
    tasks: [{ id: 't7', title: 'V2 任务', status: 'todo', done: false, pomodoros: 1, createdAt: old, updatedAt: old }],
    logs: [],
    projects: [],
    settings: {},
    friction: [],
    meta: {},
  }
  await pickFile(JSON.stringify(legacy), 'legacy-v2.json')
  check('I8 旧版本备份显示原始版本号', screen.queryByText('v2') !== null)
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '合并导入' }))
  })
  await waitFor(() => {
    if (screen.queryByText('合并导入完成') === null) throw new Error('not done')
  })
  check(
    'I9 旧版本合并导入：新任务写入、本地 V4 数据保留',
    JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data.some((task: { id: string }) => task.id === 't7') &&
      JSON.parse(window.localStorage.getItem(`${KEY}:memory`) ?? '{}').data.length === 1,
  )

  /* 非法 JSON */
  seed()
  renderSettings()
  const before = window.localStorage.getItem(`${KEY}:tasks`)
  await pickFile('{ not json', 'bad.json')
  check('I10 非法 JSON 给出明确错误', screen.queryByText(/不是合法的 JSON/) !== null)
  check('I11 非法 JSON 不改动任何数据', window.localStorage.getItem(`${KEY}:tasks`) === before)

  /* 超大文件（按 size 预挡，不读内容） */
  const huge = { name: 'huge.json', size: 20 * 1024 * 1024 } as unknown as File
  fireEvent.change(screen.getByLabelText('选择备份文件'), { target: { files: [huge] } })
  await waitFor(() => {
    if (screen.queryByText(/文件过大/) === null) throw new Error('not yet')
  })
  check('I12 超大文件在读取前被拒绝', screen.queryByText(/上限约 8 MB/) !== null)

  /* 部分坏记录：合法的导入，坏的跳过并提示 */
  seed()
  renderSettings()
  const dirty = {
    kind: 'sorchron-study-board-backup',
    version: 4,
    exportedAt: now,
    tasks: [
      { id: 'ok1', title: '好任务', status: 'todo', done: false, pomodoros: 0, createdAt: now, updatedAt: now },
      { id: 'bad1', title: '' },
    ],
    logs: [],
    projects: [],
    settings: {},
    friction: [],
    meta: {},
  }
  await pickFile(JSON.stringify(dirty), 'dirty.json')
  check('I13 坏记录导致警告并说明跳过数量', screen.queryByText(/1 条记录无法识别/) !== null)
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '合并导入' }))
  })
  await waitFor(() => {
    if (screen.queryByText('合并导入完成') === null) throw new Error('not done')
  })
  check(
    'I14 只写入可识别记录',
    JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data.some((task: { id: string }) => task.id === 'ok1') &&
      !JSON.parse(window.localStorage.getItem(`${KEY}:tasks`) ?? '{}').data.some((task: { id: string }) => task.id === 'bad1'),
  )

  /* 写入失败回滚：让 logs 键写入抛错（tasks 已写，必须被恢复） */
  seed()
  const rawBefore = {
    tasks: window.localStorage.getItem(`${KEY}:tasks`),
    logs: window.localStorage.getItem(`${KEY}:logs`),
    daily: window.localStorage.getItem(`${KEY}:daily`),
  }
  const storageProto = Object.getPrototypeOf(window.localStorage) as Storage
  const originalSetItem = storageProto.setItem
  storageProto.setItem = function patched(key: string, value: string): void {
    if (key === `${KEY}:logs`) {
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }
    originalSetItem.call(this, key, value)
  }
  renderSettings()
  await pickFile(serializeBackup(payload), 'fail.json')
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '合并导入' }))
  })
  await waitFor(() => {
    if (screen.queryByText(/导入已中止/) === null) throw new Error('not yet')
  })
  storageProto.setItem = originalSetItem
  check('I15 写入失败时显示回滚结果', screen.queryByText(/原有数据已回滚/) !== null)
  check(
    'I16 失败后没有部分导入残留',
    window.localStorage.getItem(`${KEY}:tasks`) === rawBefore.tasks &&
      window.localStorage.getItem(`${KEY}:logs`) === rawBefore.logs &&
      window.localStorage.getItem(`${KEY}:daily`) === rawBefore.daily,
  )

  /* 清空：两步确认 + 覆盖全部键 */
  seed()
  renderSettings()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '清空全部数据…' }))
  })
  const confirmClear = screen.getByRole('button', { name: '确认清空' }) as HTMLButtonElement
  check('D1 清空需要二次确认且勾选前不可用', confirmClear.disabled === true)
  act(() => {
    fireEvent.click(screen.getByLabelText(/我已导出需要保留的数据/))
  })
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
  })
  await waitFor(() => {
    if (screen.queryByText('已清空') === null) throw new Error('not yet')
  })
  const afterClear = ['tasks', 'logs', 'projects', 'friction', 'memory', 'reviews', 'timeline', 'history', 'daily'].map(key => {
    const value = JSON.parse(window.localStorage.getItem(`${KEY}:${key}`) ?? '{}')
    return Array.isArray(value.data) ? value.data.length : -1
  })
  check('D2 清空后 9 个列表键全为 0', afterClear.every(value => value === 0), afterClear)
  check(
    'D3 清空后知识图谱为空且设置回到默认',
    JSON.parse(window.localStorage.getItem(`${KEY}:knowledge`) ?? '{}').data.nodes.length === 0 &&
      JSON.parse(window.localStorage.getItem(`${KEY}:settings`) ?? '{}').data.activeProjectId === '',
  )

  /* 测试写入探针 */
  seed()
  renderSettings()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '测试写入' }))
  })
  check('S1 写入探针返回真实结果', screen.queryByText('可写') !== null)

  cleanup()
  console.log(`\n数据管理：${passed} 通过 / ${failed} 失败`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('数据管理测试异常：', error)
  process.exit(1)
})
