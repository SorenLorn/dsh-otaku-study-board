/**
 * V3 任务清单 hover 抖动复现页（真实组件 + 真实 board.css）。
 *
 * 目的：验证「.osb-card:hover 的 translateY + 卡片内 position:fixed 弹窗」
 * 是否会导致遮罩在「铺满视口 / 缩到卡片」之间反复跳动。
 */
import cssText from '../../src/client/style/board.css'
import { createRoot } from 'react-dom/client'
import { TaskList } from '../../src/client/board/TaskList'
import { FocusTimer } from '../../src/client/board/FocusTimer'
import { SessionLog } from '../../src/client/board/SessionLog'

const style = document.createElement('style')
style.textContent = cssText
document.head.appendChild(style)

const wrap = (data: unknown): string => JSON.stringify({ schemaVersion: 4, data })
const now = Date.now()
localStorage.setItem('dsh-otaku-study-board:projects', wrap([
  { id: 'p1', name: 'TS 前端学习与工程化实践', archived: false, createdAt: now - 30 * 86_400_000 },
]))
localStorage.setItem('dsh-otaku-study-board:tasks', wrap(
  Array.from({ length: 6 }, (_, index) => ({
    id: `t${index}`,
    title: `第 ${index + 1} 个任务：把条件类型与映射类型组合起来做一次真实重构`,
    status: 'todo',
    done: false,
    pomodoros: 0,
    priority: 'normal',
    estimateMinutes: 25,
    projectId: 'p1',
    createdAt: now - index * 3_600_000,
    updatedAt: now,
  })),
))
localStorage.setItem('dsh-otaku-study-board:logs', wrap([
  { id: 'l1', at: now - 3_600_000, kind: 'focus', title: '专注', minutes: 25, source: 'manual', edited: false },
]))
localStorage.setItem('dsh-otaku-study-board:meta', wrap({ sessionTaskMap: {} }))
localStorage.setItem('dsh-otaku-study-board:settings', wrap({ activeProjectId: 'p1' }))

createRoot(document.getElementById('root')!).render(
  <div className="osb-page" data-view="classic" data-osb-page="">
    <div className="osb-grid">
      <TaskList />
      <FocusTimer />
      <SessionLog />
    </div>
  </div>,
)
;(window as unknown as { __ready: boolean }).__ready = true
