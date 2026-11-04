/**
 * recovery-ui.test.tsx — 结算失败的界面与恢复（Phase 5.5.1，jsdom）。
 *
 * 覆盖「失败 → 界面不撒谎 → 重试 / 刷新 / 放弃 → 数据收敛」这条完整路径，
 * 以及挂载时对重复记录的自动修复。
 *
 * 跑法：
 *   npx esbuild scripts/ui/recovery-ui.test.tsx --bundle --platform=node --format=cjs \
 *     --jsx=automatic --external:jsdom --loader:.css=text \
 *     --outfile=scripts/ui/.build/recovery-ui.cjs && node scripts/ui/.build/recovery-ui.cjs
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const win = dom.window as unknown as Window & typeof globalThis
const expose = (name: string, value: unknown): void => {
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

const T0 = new Date(2026, 10, 4, 9, 0, 0, 0).getTime()
let clock = T0
Date.now = () => clock
const KEY = 'dsh-otaku-study-board'
const MIN = 60_000

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

async function main(): Promise<void> {
  const React = await import('react')
  const { render, fireEvent, cleanup, act } = await import('@testing-library/react')
  const { V4Shell } = await import('../../src/client/v4/Shell')
  const { Dashboard } = await import('../../src/client/v4/Dashboard')
  const { NoticeHost } = await import('../../src/client/ui/NoticeHost')
  const { useSettlementRecovery } = await import('../../src/client/hooks/useSettlementRecovery')
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
  const daily = (): Array<{ day: string; focusMinutes: number }> => (read('daily') as Array<{ day: string; focusMinutes: number }> | null) ?? []
  const tasks = (): Array<Record<string, unknown>> => (read('tasks') as Array<Record<string, unknown>> | null) ?? []
  const timeline = (): unknown[] => (read('timeline') as unknown[] | null) ?? []
  const timer = (): Record<string, unknown> => (read('timer') as Record<string, unknown> | null) ?? {}
  const notice = (): string => document.querySelector('[data-osb-notices]')?.textContent ?? ''
  const focusText = (): string => document.querySelector('.v4-focus-result-title')?.textContent ?? ''
  /** 结果行的第二行（「已记入…」「本轮未完整保存…」都在这）。 */
  const focusSub = (): string => document.querySelector('.v4-focus-result-sub')?.textContent ?? ''
  const hasButton = (label: string): boolean =>
    [...document.querySelectorAll('button')].some(node => (node.textContent ?? '').trim() === label)
  const click = (label: string): void => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => (node.textContent ?? '').trim() === label)
    if (button === undefined) throw new Error(`找不到按钮：${label} · 现有：${[...document.querySelectorAll('button')].map(n => (n.textContent ?? '').trim()).join('|')}`)
    fireEvent.click(button)
  }

  const seed = (): void => {
    cleanup()
    clock = T0
    window.localStorage.clear()
    window.localStorage.setItem(`${KEY}:projects`, wrap([{ id: 'p1', name: 'TS 前端', archived: false, createdAt: T0 - MIN }]))
    window.localStorage.setItem(
      `${KEY}:tasks`,
      wrap([{ id: 't1', title: '练习条件类型', status: 'todo', done: false, pomodoros: 0, focusedMinutes: 0, projectId: 'p1', createdAt: T0 - MIN, updatedAt: T0 - MIN }]),
    )
    window.localStorage.setItem(`${KEY}:logs`, wrap([]))
    window.localStorage.setItem(`${KEY}:daily`, wrap([]))
    window.localStorage.setItem(`${KEY}:timeline`, wrap([]))
    window.localStorage.setItem(`${KEY}:friction`, wrap([]))
    window.localStorage.setItem(`${KEY}:meta`, wrap({ sessionTaskMap: {} }))
  }

  function App(): JSX.Element {
    // 与 BoardPage 一致：根节点跑一次重复记录修复
    useSettlementRecovery()
    return React.createElement(
      'div',
      { className: 'osb-page v4-page' },
      React.createElement(V4Shell, { page: 'dashboard', onPageChange: () => undefined }, React.createElement(Dashboard, { onNavigate: () => undefined })),
      React.createElement(NoticeHost),
    )
  }
  const mount = (): ReturnType<typeof render> => render(React.createElement(App))

  /** 让某个键的写入抛 QuotaExceededError；返回解除函数。 */
  const failKey = (suffix: string): (() => void) => {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage
    const original = proto.setItem
    proto.setItem = function patched(key: string, value: string) {
      if (key === `${KEY}:${suffix}`) throw new dom.window.DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    }
    return () => {
      proto.setItem = original
    }
  }

  /**
   * 按「第几次写某个键」注入 QuotaExceededError（Phase 6.1）。
   *
   * 用它复刻**回滚也失败**的现场 —— 这正是放弃流程真正要处理的输入：
   * `daily` 第 1 次失败 + `logs` 第 2 次（回滚）失败 → 存储里留下「日志在、日聚合不在」。
   */
  const faultWrites = (rules: Record<string, number[]>): (() => void) => {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage
    const original = proto.setItem
    const hits = new Map<string, number>()
    proto.setItem = function patched(key: string, value: string) {
      const n = (hits.get(key) ?? 0) + 1
      hits.set(key, n)
      const suffix = key.startsWith(`${KEY}:`) ? key.slice(KEY.length + 1) : key
      if ((rules[suffix] ?? []).includes(n)) throw new dom.window.DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    }
    return () => {
      proto.setItem = original
    }
  }

  /** 跑一轮 18 分钟的专注并结束，按次数注入多个写失败。 */
  const runRoundWithFaults = async (rules: Record<string, number[]>): Promise<void> => {
    fireEvent.click(document.querySelector<HTMLButtonElement>('.v4-focus-task-btn')!)
    fireEvent.change(document.querySelector<HTMLSelectElement>('#v4-focus-task')!, { target: { value: 't1' } })
    click('开始专注')
    clock += 18 * MIN
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 320))
    })
    const restore = faultWrites(rules)
    click('结束并记录')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    restore()
  }

  /** 跑一轮 18 分钟的专注并结束（可指定注入失败的键）。 */
  const runRound = async (fault?: string): Promise<(() => void) | undefined> => {
    fireEvent.click(document.querySelector<HTMLButtonElement>('.v4-focus-task-btn')!)
    fireEvent.change(document.querySelector<HTMLSelectElement>('#v4-focus-task')!, { target: { value: 't1' } })
    click('开始专注')
    clock += 18 * MIN
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 320))
    })
    const restore = fault === undefined ? undefined : failKey(fault)
    click('结束并记录')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    restore?.()
    return restore
  }

  console.log('\n[V1-V3] 写入失败 → 不谎报 → 重试成功')
  {
    seed()
    mount()
    await runRound('daily')
    check('V1.1 四个实体都没有被写（事务回滚）', logs().length === 0 && daily().length === 0 && timeline().length === 0, {
      logs: logs().length,
      daily: daily().length,
      timeline: timeline().length,
    })
    check('V1.2 任务也没有被加', (tasks()[0]?.focusedMinutes ?? 0) === 0, tasks()[0])
    check('V1.3 界面显示「未保存」', focusText().includes('未保存'), focusText())
    check('V1.4 没有「开始下一轮」（防止丢掉待写记录）', hasButton('开始下一轮') === false)
    check('V1.5 有「重试写入」与「放弃这一笔」', hasButton('重试写入') && hasButton('放弃这一笔'))
    check('V1.6 提示点名了失败的键', notice().includes('日聚合'), notice())
    check('V1.7 待写记录留在计时状态里', timer().pendingResult !== undefined, timer())
    check('V1.8 提示里明确「没有保存」', notice().includes('没有保存'), notice())

    click('重试写入')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    check('V2.1 重试后日志写入 1 条', logs().length === 1, logs().length)
    check('V2.2 重试后 Daily = 18', daily()[0]?.focusMinutes === 18, daily())
    check('V2.3 重试后任务累计 18', tasks()[0]?.focusedMinutes === 18, tasks()[0])
    check('V2.4 重试后时间轴 1 条', timeline().length === 1)
    check('V2.5「未保存」消失', focusText().includes('未保存') === false, focusText())
    check('V2.6 待写记录被清掉', timer().pendingResult === undefined, timer())
    check('V2.7 恢复出「开始下一轮」', hasButton('开始下一轮'))
    check('V2.8 只加了一次（没有重复累计）', daily()[0]?.focusMinutes === 18 && tasks()[0]?.pomodoros === 1, { daily: daily(), task: tasks()[0] })
  }

  console.log('\n[V3] 刷新后自动补写')
  {
    seed()
    const first = mount()
    await runRound('tasks')
    check('V3.1 失败后停留在本轮完成', (document.querySelector('.v4-focus-state-chip')?.textContent ?? '') === '本轮完成')
    check('V3.2 存储里带着 pendingResult', timer().pendingResult !== undefined, timer())
    first.unmount()
    // 模拟「刷新」：存储恢复可写，重新挂载
    clock += 1000
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    check('V3.3 刷新后自动补写日志', logs().length === 1, logs().length)
    check('V3.4 刷新后自动补写 Daily', daily()[0]?.focusMinutes === 18, daily())
    check('V3.5 刷新后自动补写任务', tasks()[0]?.focusedMinutes === 18, tasks()[0])
    check('V3.6 刷新后 pending 被清掉', timer().pendingResult === undefined, timer())
    check('V3.7 刷新后不再显示「未保存」', (document.querySelector('.v4-focus-result-title')?.textContent ?? '').includes('未保存') === false)
  }

  console.log('\n[V4] 放弃这一笔（一次都没写进去）')
  {
    seed()
    mount()
    await runRound('logs')
    check('V4.1 失败后数据为空', logs().length === 0 && daily().length === 0)
    click('放弃这一笔')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 60))
    })
    check('V4.2 放弃后 pending 清空', timer().pendingResult === undefined, timer())
    check('V4.3 放弃后仍没有数据（不会偷偷写）', logs().length === 0 && daily().length === 0)
    check('V4.4 文案说「没有写入任何记录」', focusSub().includes('没有写入任何记录'), focusSub())
    check('V4.5 文案不说「已记入」', !focusSub().includes('已记入'), focusSub())
    click('开始下一轮')
    check('V4.6 放弃后可以开下一轮', (document.querySelector('.v4-focus-state-chip')?.textContent ?? '') === '专注中')
  }

  console.log('\n[V4b] 部分写入后安全放弃：清理本轮痕迹，不谎称已记入')
  {
    seed()
    const view = mount()
    /**
     * 复刻「部分写入」：事务写 logs 成功 → tasks 成功 → daily 失败 → 回滚 tasks 成功、
     * 回滚 logs 失败。最终存储是「日志在、日聚合/任务/时间轴都不在」。
     */
    await runRoundWithFaults({ daily: [1], logs: [2] })
    check('V4b.1 存储里留下本轮日志', logs().length === 1 && logs()[0]?.kind === 'focus', logs())
    check('V4b.2 日聚合没写进去', daily().length === 0, daily())
    check('V4b.3 任务也没被累计（回滚成功）', (tasks()[0]?.focusedMinutes ?? 0) === 0, tasks()[0])
    check('V4b.4 界面显示「未保存」', focusText().includes('未保存'), focusText())
    check('V4b.5 没有「开始下一轮」（不能掩盖问题）', hasButton('开始下一轮') === false)

    click('放弃这一笔')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    check('V4b.6 本轮日志被清理', logs().length === 0, logs())
    check('V4b.7 本轮时间轴事件没有残留', timeline().length === 0, timeline())
    check('V4b.8 日聚合与任务仍是 0（没有被反扣成负数）', daily().length === 0 && (tasks()[0]?.focusedMinutes ?? 0) === 0, {
      daily: daily(),
      task: tasks()[0],
    })
    check('V4b.9 pending 被清空', timer().pendingResult === undefined, timer())
    check('V4b.10 文案是「未完整保存 / 已清理」，不是「已记入」', focusSub().includes('未完整保存') && !focusSub().includes('已记入'), focusSub())
    check('V4b.11 结果区标记为已放弃', document.querySelector('.v4-focus-result')?.getAttribute('data-discarded') === 'true')
    check('V4b.12 恢复出「开始下一轮」', hasButton('开始下一轮'))

    /**
     * 刷新后的关键一票：「已放弃」如果只活在一个 React 状态里，重开面板就会退回
     * 「已记入」——那等于第二次撒谎。这里断言它改从存储推导。
     */
    view.unmount()
    clock += 1000
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    check('V4b.13 刷新后仍然不说「已记入」', !focusSub().includes('已记入'), focusSub())
    check('V4b.14 刷新后明说「本轮未记入」', focusSub().includes('未记入'), focusSub())
    click('开始下一轮')
    check('V4b.15 刷新后也能开下一轮', (document.querySelector('.v4-focus-state-chip')?.textContent ?? '') === '专注中')
  }

  console.log('\n[V4e] 完整保存仍然是「已记入」（防止误判成放弃）')
  {
    seed()
    const view = mount()
    await runRound()
    check('V4e.1 成功后 pending 清空', timer().pendingResult === undefined, timer())
    check('V4e.2 界面上写的是「已记入」', focusSub().includes('已记入'), focusSub())
    check('V4e.3 没有「已放弃」标记', document.querySelector('.v4-focus-result')?.getAttribute('data-discarded') === 'false')
    view.unmount()
    clock += 1000
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    check('V4e.4 刷新后仍是「已记入」', focusSub().includes('已记入'), focusSub())
    check('V4e.5 刷新后也不显示「已放弃」', document.querySelector('.v4-focus-result')?.getAttribute('data-discarded') === 'false')
  }

  console.log('\n[V4c] 无法确认时禁止清理：保留待保存状态，不显示已记入')
  {
    seed()
    mount()
    /**
     * 更糟的现场：daily 已经写进去了，但 timeline 失败，且 daily / logs 的回滚都失败。
     * 存储里是「日志在 + 日聚合 18 + 时间轴不在」—— 日聚合是否含本轮无法安全回退，
     * 因此放弃必须被拒绝。
     */
    await runRoundWithFaults({ timeline: [1], daily: [2], logs: [2] })
    check('V4c.1 前置：日志在', logs().length === 1, logs())
    check('V4c.2 前置：日聚合已经是 18', daily()[0]?.focusMinutes === 18, daily())
    check('V4c.3 前置：时间轴没有', timeline().length === 0, timeline())

    click('放弃这一笔')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    check('V4c.4 日志没有被删', logs().length === 1, logs())
    check('V4c.5 日聚合的 18 分钟没有被偷偷抹掉', daily()[0]?.focusMinutes === 18, daily())
    check('V4c.6 pendingResult 仍然保留', timer().pendingResult !== undefined, timer())
    check('V4c.7 界面仍然是「未保存」', focusText().includes('未保存'), focusText())
    check('V4c.8 面板给出「无法安全放弃」的原因', focusSub().includes('无法安全放弃'), focusSub())
    check('V4c.9 明确说数据可能部分写入', focusSub().includes('部分写入'), focusSub())
    check('V4c.10 绝不说「已记入」', !focusSub().includes('已记入'), focusSub())
    check('V4c.11 没有「开始下一轮」', hasButton('开始下一轮') === false)
    check('V4c.12 仍然可以重试写入', hasButton('重试写入'))
  }

  console.log('\n[V4d] 清理操作本身失败：不显示成功，恢复标记保留')
  {
    seed()
    mount()
    await runRoundWithFaults({ daily: [1], logs: [2] })
    check('V4d.1 前置：本轮日志在、日聚合为空', logs().length === 1 && daily().length === 0, { logs: logs(), daily: daily() })

    // 这一次只让「放弃」的写盘失败
    const restore = faultWrites({ logs: [1] })
    click('放弃这一笔')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    restore()

    check('V4d.2 日志没被删（写盘失败）', logs().length === 1, logs())
    check('V4d.3 pendingResult 仍然保留', timer().pendingResult !== undefined, timer())
    check('V4d.4 界面仍是「未保存」', focusText().includes('未保存'), focusText())
    check('V4d.5 如实报告失败原因（点了失败的键）', focusSub().includes('放弃失败') && focusSub().includes('会话日志'), focusSub())
    check('V4d.6 说明数据没有改动', focusSub().includes('没有改动'), focusSub())
    check('V4d.7 不显示成功 / 已记入', !focusSub().includes('已清理') && !focusSub().includes('已记入'), focusSub())
    check('V4d.8 没有「开始下一轮」', hasButton('开始下一轮') === false)
  }

  console.log('\n[V5] 重复记录的自动修复')
  {
    seed()
    const dupLog = { id: 'focus-dup-1', at: T0, kind: 'focus', title: '专注 18', minutes: 18, source: 'manual', edited: false, taskId: 't1', projectId: 'p1' }
    window.localStorage.setItem(`${KEY}:logs`, wrap([dupLog, { ...dupLog }]))
    window.localStorage.setItem(`${KEY}:daily`, wrap([{ day: dayKey(T0), focusMinutes: 36, tasksDone: 0, sessions: 0, friction: 0 }]))
    window.localStorage.setItem(`${KEY}:tasks`, wrap([{ ...(tasks()[0] ?? {}), id: 't1', title: '练习条件类型', status: 'todo', done: false, pomodoros: 2, focusedMinutes: 36, createdAt: T0 - MIN, updatedAt: T0 - MIN }]))
    window.localStorage.setItem(
      `${KEY}:timeline`,
      wrap([
        { id: 'e1', at: T0, type: 'focus.completed', title: '专注', refId: 'focus-dup-1' },
        { id: 'e2', at: T0 + 1, type: 'focus.completed', title: '专注', refId: 'focus-dup-1' },
      ]),
    )
    cleanup()
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    check('V5.1 挂载时自动去掉重复日志', logs().length === 1, logs().length)
    check('V5.2 Daily 回退到 18', daily()[0]?.focusMinutes === 18, daily())
    check('V5.3 任务回退到 18 分钟 / 1 个', tasks()[0]?.focusedMinutes === 18 && tasks()[0]?.pomodoros === 1, tasks()[0])
    check('V5.4 时间轴回退到 1 条', timeline().length === 1, timeline().length)
    check('V5.5 给出「已合并」提示', notice().includes('重复') && notice().includes('回退'), notice())
  }

  console.log('\n[V6] 同一轮重复提交（双击）')
  {
    seed()
    mount()
    fireEvent.click(document.querySelector<HTMLButtonElement>('.v4-focus-task-btn')!)
    // 绑定任务，否则日志没有 taskId，任务副本本来就不该变
    fireEvent.change(document.querySelector<HTMLSelectElement>('#v4-focus-task')!, { target: { value: 't1' } })
    click('开始专注')
    clock += 10 * MIN
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 320))
    })
    const endButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => (node.textContent ?? '').trim() === '结束并记录')!
    fireEvent.click(endButton)
    fireEvent.click(endButton)
    fireEvent.click(endButton)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80))
    })
    check('V6.1 双击只写一条日志', logs().length === 1, logs().length)
    check('V6.2 双击 Daily 只加一次', daily()[0]?.focusMinutes === 10, daily())
    check('V6.3 双击任务只加一次', tasks()[0]?.focusedMinutes === 10 && tasks()[0]?.pomodoros === 1, tasks()[0])
  }

  console.log('\n[V7] 修复失败时不谎报')
  {
    seed()
    const dupLog = { id: 'focus-dup-2', at: T0, kind: 'focus', title: '专注 18', minutes: 18, source: 'manual', edited: false }
    window.localStorage.setItem(`${KEY}:logs`, wrap([dupLog, { ...dupLog }]))
    cleanup()
    const restore = failKey('daily')
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    restore()
    check('V7.1 修复写不进去时数据保持原样', logs().length === 2, logs().length)
    check('V7.2 明确提示「修正未能写入」', notice().includes('未能写入'), notice())
  }

  console.log('\n[V8] 部分写入（日志在、其余缺失）+ 基线 → 自动补齐')
  {
    seed()
    const day = dayKey(T0)
    const round = {
      id: 'focus-partial-1',
      at: T0 - 60_000,
      kind: 'focus',
      title: '18 分钟专注',
      minutes: 18,
      taskId: 't1',
      projectId: 'p1',
      source: 'manual',
      edited: false,
    }
    // 只写日志（模拟「logs 成功、daily 失败、回滚也失败」）
    window.localStorage.setItem(`${KEY}:logs`, wrap([round]))
    window.localStorage.setItem(`${KEY}:daily`, wrap([{ day, focusMinutes: 50, tasksDone: 0, sessions: 0, friction: 0 }]))
    window.localStorage.setItem(
      `${KEY}:timer`,
      wrap({
        running: false,
        deadline: null,
        durationMinutes: 25,
        boundTaskId: 't1',
        startedAt: null,
        remainingSeconds: 0,
        phase: 'focus',
        roundInCycle: 1,
        focusMinutes: 25,
        roundId: '',
        lastMinutes: 18,
        lastEndedAt: T0 - 60_000,
        lastTaskId: 't1',
        pendingResult: {
          roundId: 'focus-partial-1',
          minutes: 18,
          elapsedSeconds: 1080,
          targetMinutes: 25,
          taskId: 't1',
          startedAt: T0 - 18 * MIN,
          endedAt: T0 - 60_000,
          before: { day, dailyMinutes: 50, taskId: 't1', taskMinutes: 0, taskPomodoros: 0 },
        },
      }),
    )
    cleanup()
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 160))
    })
    check('V8.1 自动补齐 Daily（50 + 18）', daily().find(row => row.day === day)?.focusMinutes === 68, daily())
    check('V8.2 自动补齐任务副本', tasks()[0]?.focusedMinutes === 18 && tasks()[0]?.pomodoros === 1, tasks()[0])
    check('V8.3 自动补齐时间轴', timeline().length === 1, timeline().length)
    check('V8.4 不会重复写日志', logs().length === 1, logs().length)
    check('V8.5 pending 被清空', timer().pendingResult === undefined, timer())
    check('V8.6 界面不再显示「未保存」', (document.querySelector('.v4-focus-result-title')?.textContent ?? '').includes('未保存') === false)
  }

  console.log('\n[V9] 部分写入但没有基线 → 不猜、保留 pending')
  {
    seed()
    const day = dayKey(T0)
    window.localStorage.setItem(
      `${KEY}:logs`,
      wrap([{ id: 'focus-partial-2', at: T0 - 60_000, kind: 'focus', title: '18 分钟专注', minutes: 18, taskId: 't1', source: 'manual', edited: false }]),
    )
    window.localStorage.setItem(`${KEY}:daily`, wrap([{ day, focusMinutes: 50, tasksDone: 0, sessions: 0, friction: 0 }]))
    window.localStorage.setItem(
      `${KEY}:timer`,
      wrap({
        running: false,
        deadline: null,
        durationMinutes: 25,
        boundTaskId: 't1',
        startedAt: null,
        remainingSeconds: 0,
        phase: 'focus',
        roundInCycle: 1,
        focusMinutes: 25,
        roundId: '',
        lastMinutes: 18,
        lastEndedAt: T0 - 60_000,
        lastTaskId: 't1',
        pendingResult: {
          roundId: 'focus-partial-2',
          minutes: 18,
          elapsedSeconds: 1080,
          targetMinutes: 25,
          taskId: 't1',
          startedAt: T0 - 18 * MIN,
          endedAt: T0 - 60_000,
        },
      }),
    )
    cleanup()
    mount()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 160))
    })
    check('V9.1 Daily 不被乱加（仍是 50）', daily().find(row => row.day === day)?.focusMinutes === 50, daily())
    check('V9.2 任务不被乱加', (tasks()[0]?.focusedMinutes ?? 0) === 0, tasks()[0])
    check('V9.3 pending 仍然保留', timer().pendingResult !== undefined, timer())
    check('V9.4 界面显示「未保存」', (document.querySelector('.v4-focus-result-title')?.textContent ?? '').includes('未保存') === true)
    const bodyText = document.querySelector('.v4-focus-body')?.textContent ?? ''
    check('V9.5 面板直接显示「无法确定」的原因', bodyText.includes('无法确定'), bodyText)
    check('V9.6 仍然只有一个「重试写入」入口', [...document.querySelectorAll('button')].filter(node => (node.textContent ?? '').trim() === '重试写入').length === 1)
    check('V9.7 仍提供重试入口', hasButton('重试写入'))
  }

  console.log('\n[V10] 失败时把基线写进 pendingResult')
  {
    seed()
    mount()
    await runRound('daily')
    const pending = timer().pendingResult as { before?: { day: string; dailyMinutes: number | null } } | undefined
    check('V10.1 pendingResult 带基线', pending?.before !== undefined, pending)
    check('V10.2 基线记录的是写入前的 Daily', pending?.before?.dailyMinutes === null, pending?.before)
  }

  cleanup()
  console.log(`\n结果：${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

void main()
