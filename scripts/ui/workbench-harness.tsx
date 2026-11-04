/**
 * workbench-harness.tsx — Phase 5.2 统一工作台视觉 / 交互测试页。
 *
 * 真实组件（V4Shell + Dashboard + Tasks + OverlayHost）+ 真实 board.css，
 * 只把宿主 token 与本地数据模拟出来。**不是 DSH 宿主**。
 *
 * 查询参数：
 *   ?page=dashboard|tasks   初始页面
 *   ?theme=light|dark       模拟 body[data-ds-dark-theme]
 *   ?open=drawer|modal|expand  自动打开一个浮层 / 展开一块面板（截图用）
 *
 * 暴露给浏览器测试的钩子（仅测试页）：
 *   window.__tasks()            读取 localStorage 里的任务
 *   window.__openDrawer()       点第一个可点指标
 *   window.__openModal()        点顶部「新建任务」
 *   window.__overlay()          当前浮层类型（drawer / modal / null）
 *   window.__reduced()          当前是否 reduced-motion
 */
import cssText from '../../src/client/style/board.css'
import { createRoot } from 'react-dom/client'
import { Dashboard } from '../../src/client/v4/Dashboard'
import { Tasks } from '../../src/client/v4/Tasks'
import { Settings } from '../../src/client/v4/Settings'
import { History } from '../../src/client/v4/History'
import { V4Shell } from '../../src/client/v4/Shell'
import { CaptureBridge } from '../../src/client/v4/CaptureBridge'
import { useCaptureState } from '../../src/client/hooks/useCaptureState'
import { useSettlementRecovery } from '../../src/client/hooks/useSettlementRecovery'
import { NoticeHost } from '../../src/client/ui/NoticeHost'
import { useState } from 'react'

const style = document.createElement('style')
style.textContent = cssText
document.head.appendChild(style)

const params = new URLSearchParams(location.search)
const pageParam = params.get('page')
const initialPage: 'dashboard' | 'tasks' | 'history' | 'settings' =
  pageParam === 'tasks' ? 'tasks' : pageParam === 'history' ? 'history' : pageParam === 'settings' ? 'settings' : 'dashboard'
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const open = params.get('open') ?? ''
/** Phase 5.5：计时器初始态（种子在下面写入 localStorage）。 */
const timerSeed = params.get('timer') ?? ''

/** 宿主深色 token（与 button-harness 同源，补全 V4 用到的项）。 */
const themeStyle = document.createElement('style')
themeStyle.textContent = `
body[data-ds-dark-theme]{
  --dsw-alias-bg-layer-1:#232324;
  --dsw-alias-bg-layer-2:#1b1b1c;
  --dsw-alias-bg-layer-3:#2a2a2b;
  --dsw-alias-label-primary:#ebeef2;
  --dsw-alias-label-secondary:#adb2b8;
  --dsw-alias-label-tertiary:#81858c;
  --dsw-alias-label-primary-inverted:#353638;
  --dsw-alias-border-l2:rgba(255,255,255,.12);
  --dsw-alias-border-l3:rgba(255,255,255,.20);
  --dsw-alias-interactive-bg-hover:rgba(255,255,255,.06);
  --dsw-alias-brand-primary:#c98fa3;
  --dsw-alias-brand-text:#d9a8b8;
  --dsw-alias-state-success-primary:#6faf8f;
  --dsw-alias-state-warn-primary:#d3a866;
  --dsw-alias-state-error-primary:#d98a89;
  background:#1b1b1c;
  color:#ebeef2;
}
body{margin:0;background:#f3eef1;}
body[data-ds-dark-theme]{background:#141317;}
#root{height:100vh;}
`
document.head.appendChild(themeStyle)
if (theme === 'dark') document.body.setAttribute('data-ds-dark-theme', '')

const wrap = (data: unknown): string => JSON.stringify({ schemaVersion: 4, data })
const now = Date.now()
const day = (offset: number): string => {
  const d = new Date(now - offset * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 只在第一次加载时灌种子。
 *
 * 为什么用 tasks 是否存在做哨兵：刷新测试要验证「导入 / 清空之后数据仍在」，
 * 如果每次页面加载都重新写一遍种子，刷新就会把真实状态覆盖掉，
 * 测出来的「持久化」是假的。
 */
const seededAlready = localStorage.getItem('dsh-otaku-study-board:tasks') !== null
if (!seededAlready) {
localStorage.setItem(
  'dsh-otaku-study-board:projects',
  wrap([
    { id: 'p1', name: 'TS 前端学习与工程化实践', archived: false, createdAt: now - 30 * 86_400_000 },
    { id: 'p2', name: '操作系统与网络基础', archived: false, createdAt: now - 30 * 86_400_000 },
  ]),
)
if (localStorage.getItem('dsh-otaku-study-board:tasks') === null) {
  localStorage.setItem(
    'dsh-otaku-study-board:tasks',
    wrap(
      Array.from({ length: 7 }, (_, index) => ({
        id: `t${index}`,
        title: `第 ${index + 1} 个任务：把条件类型与映射类型组合起来做一个真实的重构练习`,
        note: index === 0 ? '先写最小复现，再逐个收窄联合类型。' : undefined,
        status: index < 2 ? 'done' : 'todo',
        done: index < 2,
        pomodoros: index,
        focusedMinutes: index * 15,
        priority: index % 3 === 0 ? 'urgent' : index % 3 === 1 ? 'important' : 'normal',
        estimateMinutes: 25,
        projectId: index % 2 === 0 ? 'p1' : 'p2',
        subtasks:
          index === 2
            ? [
                { id: 's1', title: '拆出子组件', done: true, createdAt: now - 86_400_000 },
                { id: 's2', title: '补回归用例', done: false, createdAt: now - 86_400_000 },
              ]
            : undefined,
        dueAt: now + (index - 2) * 86_400_000,
        createdAt: now - 3 * 86_400_000,
        updatedAt: now,
        ...(index < 2 ? { completedAt: now - index * 3_600_000 } : {}),
      })),
    ),
  )
}
localStorage.setItem(
  'dsh-otaku-study-board:daily',
  wrap(
    Array.from({ length: 7 }, (_, index) => ({
      day: day(index),
      focusMinutes: index === 0 ? 50 : index * 12,
      tasksDone: index % 2,
      sessions: index,
      friction: 0,
    })),
  ),
)
localStorage.setItem(
  'dsh-otaku-study-board:timeline',
  wrap(
    Array.from({ length: 8 }, (_, index) => ({
      id: `e${index}`,
      type: 'task.completed',
      title: `完成任务 ${index + 1}`,
      at: now - index * 3_600_000,
      projectId: index % 2 === 0 ? 'p1' : 'p2',
    })),
  ),
)
localStorage.setItem(
  'dsh-otaku-study-board:logs',
  wrap(
    Array.from({ length: 7 }, (_, index) => ({
      id: `l${index}`,
      at: now - index * 86_400_000,
      kind: 'focus',
      title: `专注 ${index + 1}`,
      minutes: index === 0 ? 50 : index * 12,
      projectId: index % 2 === 0 ? 'p1' : 'p2',
      source: 'manual',
      edited: false,
    })),
  ),
)
localStorage.setItem('dsh-otaku-study-board:friction', wrap([]))
localStorage.setItem('dsh-otaku-study-board:meta', wrap({ sessionTaskMap: {} }))
localStorage.setItem(
  'dsh-otaku-study-board:knowledge',
  wrap({
    nodes: [
      { id: 'k1', title: '条件类型分发', status: 'learned', mastery: 4, projectIds: ['p1'], taskIds: [], logIds: [], frictionIds: [], origin: 'manual', createdAt: now, updatedAt: now - 3_600_000, reviewCount: 2 },
      { id: 'k2', title: '映射类型重映射', status: 'learning', mastery: 3, projectIds: ['p1'], taskIds: [], logIds: [], frictionIds: [], origin: 'manual', createdAt: now, updatedAt: now - 7_200_000, reviewCount: 1 },
      { id: 'k3', title: '协程与事件循环', status: 'todo', mastery: 1, projectIds: ['p2'], taskIds: [], logIds: [], frictionIds: [], origin: 'manual', createdAt: now, updatedAt: now - 9_000_000, reviewCount: 0 },
    ],
    edges: [{ id: 'ed1', fromId: 'k1', toId: 'k2', kind: 'prereq' }],
  }),
)
localStorage.setItem(
  'dsh-otaku-study-board:memory',
  wrap([{ projectId: 'p1', intro: 'TypeScript 类型体操与工程化实践', stack: ['TS', 'React'], architecture: '', done: [], progress: '', openIssues: [], resolvedIssues: [], decisions: [], nextSteps: [], updatedAt: now - 86_400_000, version: 3, source: 'manual' }]),
)
localStorage.setItem('dsh-otaku-study-board:reviews', wrap([]))
}

/**
 * 跨 365 天的演示数据（`?page=history` 或 `?demo=year`）。
 *
 * 其他页面依赖「7 个任务 / 7 条日志」的固定种子，所以这里不改基础数据，
 * 只在该视图下换成一份跨 365 天、daily 与日志互相对得上的数据。
 * Phase 6.2 起 Dashboard 首页也有全年热力图，`?demo=year` 让它在真实浏览器里
 * 有颜色可看、有 tooltip 可验 —— 数据仍然只写一次，不另造一份统计。
 */
if (
  (pageParam === 'history' || params.get('demo') === 'year') &&
  localStorage.getItem('dsh-otaku-study-board:__harness_history__') !== '1'
) {
  const atDay = (offset: number, hour = 12): number => {
    const date = new Date(now)
    date.setHours(hour, 0, 0, 0)
    date.setDate(date.getDate() - offset)
    return date.getTime()
  }
  const daily: Array<Record<string, unknown>> = []
  const logs: Array<Record<string, unknown>> = []
  const timeline: Array<Record<string, unknown>> = []
  const tasks: Array<Record<string, unknown>> = []
  let taskIndex = 0

  for (let offset = 364; offset >= 0; offset -= 1) {
    const stamp = atDay(offset)
    const key = `${new Date(stamp).getFullYear()}-${String(new Date(stamp).getMonth() + 1).padStart(2, '0')}-${String(new Date(stamp).getDate()).padStart(2, '0')}`
    const phase = (offset * 7 + 3) % 11
    const minutes = phase < 2 ? 0 : [20, 35, 55, 90, 130][phase % 5]!
    const doneToday = phase % 4 === 0 ? (phase % 8 === 0 ? 2 : 1) : 0
    daily.push({ day: key, focusMinutes: minutes, tasksDone: doneToday, sessions: phase % 3 === 0 ? 1 : 0, friction: 0 })
    if (minutes > 0) {
      logs.push({ id: `hl-${offset}`, at: atDay(offset, 20), kind: 'focus', title: `专注 ${minutes} 分钟`, minutes, projectId: offset % 2 === 0 ? 'p1' : 'p2', source: 'manual', edited: false })
      timeline.push({ id: `he-${offset}`, at: atDay(offset, 20), type: 'focus.completed', title: `完成一轮 ${minutes} 分钟专注`, projectId: offset % 2 === 0 ? 'p1' : 'p2' })
    }
    for (let count = 0; count < doneToday; count += 1) {
      const id = `ht-${taskIndex}`
      tasks.push({
        id,
        title: `第 ${taskIndex + 1} 个历史任务：整理类型工具与边界用例`,
        status: 'done',
        done: true,
        pomodoros: 1,
        focusedMinutes: 25,
        priority: taskIndex % 3 === 0 ? 'urgent' : 'normal',
        projectId: offset % 2 === 0 ? 'p1' : 'p2',
        createdAt: atDay(offset, 9),
        updatedAt: atDay(offset, 18),
        completedAt: atDay(offset, 18),
      })
      timeline.push({ id: `hte-${taskIndex}`, at: atDay(offset, 18), type: 'task.completed', title: `完成任务：第 ${taskIndex + 1} 个历史任务`, projectId: offset % 2 === 0 ? 'p1' : 'p2' })
      taskIndex += 1
    }
  }

  localStorage.setItem('dsh-otaku-study-board:daily', wrap(daily))
  localStorage.setItem('dsh-otaku-study-board:logs', wrap(logs))
  localStorage.setItem('dsh-otaku-study-board:timeline', wrap(timeline))
  localStorage.setItem('dsh-otaku-study-board:tasks', wrap(tasks))
  // 独立哨兵：基础种子可能已被上一个视图写入，历史数据仍要能生效。
  localStorage.setItem('dsh-otaku-study-board:__harness_history__', '1')
}

/**
 * Phase 5.5：计时器种子。
 *
 * 浏览器测试不能等 18 分钟，所以直接写一个「已经跑了 18 分钟」的计时状态：
 * deadline 在 2 分钟后，startedAt 在 18 分钟前。组件挂载后会按时间戳重算，
 * 与真实运行完全一致（不是伪造计时器内部变量）。
 */
if (timerSeed !== '') {
  const base = {
    running: false,
    deadline: null,
    durationMinutes: 25,
    boundTaskId: '',
    startedAt: null,
    remainingSeconds: 1500,
    phase: 'focus',
    roundInCycle: 0,
    focusMinutes: 25,
    roundId: '',
  }
  /**
   * `?timer=partial` 的基线**必须**取存储里的真实当前值。
   *
   * 「回滚失败」的现场是：日志写进去了，但 Daily / 任务副本 / 时间轴都没结算。
   * 也就是说结算前的值 == 此刻的值。这里写死数字的话，基础种子一变（或多标签测试
   * 在已有数据上重放），基线就会低于当前值，`planRepair` 会判成「已经算过了」而不再补写 ——
   * 那不是被测代码的错，是种子本身不自洽。
   */
  const partialBaseline = (() => {
    const day = new Date(now - 60_000).toLocaleDateString('sv-SE')
    const read = (key: string): Array<Record<string, unknown>> => {
      try {
        const parsed = JSON.parse(localStorage.getItem(`dsh-otaku-study-board:${key}`) ?? 'null') as { data?: unknown } | null
        return Array.isArray(parsed?.data) ? (parsed.data as Array<Record<string, unknown>>) : []
      } catch {
        return []
      }
    }
    const row = read('daily').find(item => item.day === day)
    const task = read('tasks').find(item => item.id === 't0')
    return {
      day,
      dailyMinutes: Number(row?.focusMinutes ?? 0),
      taskId: 't0',
      taskMinutes: Number(task?.focusedMinutes ?? 0),
      taskPomodoros: Number(task?.pomodoros ?? 0),
    }
  })()
  const seeded =
    timerSeed === 'running18'
      ? { ...base, running: true, deadline: now + 7 * 60_000, startedAt: now - 18 * 60_000, remainingSeconds: 420, roundId: 'focus-seed-18', boundTaskId: 't0' }
      : timerSeed === 'paused'
        ? { ...base, remainingSeconds: 420, startedAt: now - 18 * 60_000, roundId: 'focus-seed-paused', boundTaskId: 't0' }
        : timerSeed === 'completed'
          ? { ...base, remainingSeconds: 0, lastMinutes: 18, lastEndedAt: now - 60_000, lastTaskId: 't0' }
          : timerSeed === 'partial'
          ? {
              ...base,
              remainingSeconds: 0,
              lastMinutes: 18,
              lastEndedAt: now - 60_000,
              lastTaskId: 't0',
              pendingResult: {
                roundId: 'focus-seed-partial',
                minutes: 18,
                elapsedSeconds: 1080,
                targetMinutes: 25,
                taskId: 't0',
                startedAt: now - 18 * 60_000,
                endedAt: now - 60_000,
                before: partialBaseline,
              },
            }
        : timerSeed === 'fault'
          ? { ...base, running: true, deadline: now + 7 * 60_000, startedAt: now - 18 * 60_000, remainingSeconds: 420, roundId: 'focus-seed-fault', boundTaskId: 't0' }
        : timerSeed === 'pending'
          ? {
              ...base,
              remainingSeconds: 0,
              lastMinutes: 18,
              lastEndedAt: now - 60_000,
              lastTaskId: 't0',
              pendingResult: {
                roundId: 'focus-seed-pending',
                minutes: 18,
                elapsedSeconds: 1080,
                targetMinutes: 25,
                taskId: 't0',
                startedAt: now - 18 * 60_000,
                endedAt: now - 60_000,
              },
            }
        : timerSeed === 'break'
            ? { ...base, phase: 'short', running: true, durationMinutes: 5, remainingSeconds: 180, deadline: now + 180_000, startedAt: now - 2 * 60_000, focusMinutes: 25, boundTaskId: 't0' }
            : base
  localStorage.setItem('dsh-otaku-study-board:timer', wrap(seeded))

  /**
   * `?timer=partial` 还要把**数据**也做成部分写入的样子：
   * 日志已存在（说明事务写过 logs），但 daily / 任务副本 / 时间轴都没结算。
   * 这正是「回滚失败」之后真实存储的样子，用来自动/手动恢复的测试。
   */
  if (timerSeed === 'partial' && localStorage.getItem('dsh-otaku-study-board:__harness_partial__') !== '1') {
    localStorage.setItem('dsh-otaku-study-board:__harness_partial__', '1')
    const existing = (() => {
      try {
        return (JSON.parse(localStorage.getItem('dsh-otaku-study-board:logs') ?? 'null')?.data ?? []) as unknown[]
      } catch {
        return []
      }
    })()
    localStorage.setItem(
      'dsh-otaku-study-board:logs',
      wrap([
        {
          id: 'focus-seed-partial',
          at: now - 60_000,
          kind: 'focus',
          title: '18 分钟专注 · 第 1 个任务',
          minutes: 18,
          projectId: 'p1',
          taskId: 't0',
          source: 'manual',
          edited: false,
        },
        ...existing,
      ]),
    )
    localStorage.setItem(
      'dsh-otaku-study-board:timeline',
      wrap(((JSON.parse(localStorage.getItem('dsh-otaku-study-board:timeline') ?? 'null')?.data ?? []) as unknown[]).filter(
        event => (event as { refId?: string }).refId !== 'focus-seed-partial',
      )),
    )
  }
}

function App() {
  const [page, setPage] = useState<'dashboard' | 'tasks' | 'history' | 'settings'>(initialPage)
  const capture = useCaptureState()
  // 与 BoardPage 一致：挂载时收敛重复结算
  useSettlementRecovery()
  return (
    <div className="osb-page v4-page" data-view="v4" data-osb-page="" data-capture={capture.status}>
      {/* 与真实页面一致：采集挂在根节点，切页面不中断 */}
      <CaptureBridge />
      <V4Shell page={page} onPageChange={setPage}>
        {page === 'tasks' ? (
          <Tasks />
        ) : page === 'history' ? (
          <History />
        ) : page === 'settings' ? (
          <Settings />
        ) : (
          <Dashboard onNavigate={() => setPage('tasks')} />
        )}
      </V4Shell>
      <div className="v4-scope v4-overlays">
        <NoticeHost />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

const clickText = (text: string): void => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => (node.textContent ?? '').includes(text))
  button?.click()
}

;(window as unknown as Record<string, unknown>).__openDrawer = () => document.querySelector<HTMLButtonElement>('.v4-stat-button')?.click()
;(window as unknown as Record<string, unknown>).__openModal = () => clickText('新建任务')
;(window as unknown as Record<string, unknown>).__overlay = () => document.querySelector('.v4-overlay')?.getAttribute('data-overlay') ?? null
;(window as unknown as Record<string, unknown>).__tasks = () => {
  try {
    return JSON.parse(localStorage.getItem('dsh-otaku-study-board:tasks') ?? '{}').data ?? []
  } catch {
    return []
  }
}
;(window as unknown as Record<string, unknown>).__reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Phase 5.5：专注面板的可见状态。 */
;(window as unknown as Record<string, unknown>).__focus = () => {
  const clock = document.querySelector('.v4-focus-clock')
  const chip = document.querySelector('.v4-focus-state-chip')
  const buttons = [...document.querySelectorAll('.v4-focus-actions button, .v4-focus-live button')].map(node => (node.textContent ?? '').trim())
  const task = document.querySelector('.v4-focus-task')?.textContent ?? ''
  const result = document.querySelector('.v4-focus-result-title')?.textContent ?? ''
  const rect = clock?.getBoundingClientRect()
  return {
    status: chip?.textContent ?? '',
    clock: clock?.textContent ?? '',
    buttons,
    task,
    result,
    width: Math.round(rect?.width ?? 0),
    top: Math.round(rect?.top ?? 0),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    capture: document.querySelector('.osb-page')?.getAttribute('data-capture') ?? '',
  }
}
/** 点一个按钮（按文字精确匹配）。 */
;(window as unknown as Record<string, unknown>).__click = (label: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => (node.textContent ?? '').trim() === label)
  if (!button) return false
  button.click()
  return true
}
/** 展开专注面板（点任务行）。 */
;(window as unknown as Record<string, unknown>).__focusExpand = () => {
  const button = document.querySelector<HTMLButtonElement>('.v4-focus-task-btn')
  if (!button) return false
  button.click()
  return true
}
/** 通过 window 桥推一条 Harness 事件（自动采集的入口）。 */
;(window as unknown as Record<string, unknown>).__pushEvent = (text: string) => {
  window.dispatchEvent(new CustomEvent('sorchron:harness-event', {
    detail: { type: 'bridge/message', payload: { text, sessionId: 'sess-test' } },
  }))
  return true
}
;(window as unknown as Record<string, unknown>).__counts = () => {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(localStorage.getItem(`dsh-otaku-study-board:${key}`) ?? 'null')
    } catch {
      return null
    }
  }
  const list = (key: string): number => {
    const value = read(key)
    if (Array.isArray(value)) return value.length
    const data = (value as { data?: unknown } | null)?.data
    return Array.isArray(data) ? data.length : 0
  }
  return {
    tasks: list('tasks'),
    logs: list('logs'),
    projects: list('projects'),
    friction: list('friction'),
    memory: list('memory'),
    reviews: list('reviews'),
    timeline: list('timeline'),
    history: list('history'),
    daily: list('daily'),
    knowledge: ((read('knowledge') as { data?: { nodes?: unknown[] } } | null)?.data?.nodes ?? []).length,
  }
}

window.setTimeout(() => {
  if (open === 'drawer') (window as unknown as { __openDrawer: () => void }).__openDrawer()
  if (open === 'modal') (window as unknown as { __openModal: () => void }).__openModal()
  if (open === 'expand') document.querySelector<HTMLButtonElement>('[data-panel="focus"] .v4-expand-toggle')?.click()
  ;(window as unknown as { __ready: boolean }).__ready = true
}, 80)
