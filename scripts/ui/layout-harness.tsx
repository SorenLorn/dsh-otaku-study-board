/**
 * layout-harness.tsx — 用真实 V4 组件 + 真实 board.css 做浏览器尺寸测试。
 * 仅用于 Phase 4B.1，不进入插件产物。
 */
import cssText from '../../src/client/style/board.css'
import { createRoot } from 'react-dom/client'
import { Dashboard } from '../../src/client/v4/Dashboard'
import { V4Shell } from '../../src/client/v4/Shell'

const style = document.createElement('style')
style.textContent = cssText
document.head.appendChild(style)

const wrap = (data: unknown): string => JSON.stringify({ schemaVersion: 4, data })
const now = Date.now()
const day = (offset: number): string => {
  const d = new Date(now - offset * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

localStorage.setItem(
  'dsh-otaku-study-board:projects',
  wrap([
    { id: 'p1', name: 'TS 前端学习与工程化实践', archived: false, createdAt: now - 30 * 86_400_000 },
    { id: 'p2', name: '操作系统与网络基础', archived: false, createdAt: now - 30 * 86_400_000 },
  ]),
)
localStorage.setItem(
  'dsh-otaku-study-board:tasks',
  wrap(
    Array.from({ length: 6 }, (_, index) => ({
      id: `t${index}`,
      title: `第 ${index + 1} 个任务：把条件类型与映射类型组合起来做一个真实的重构练习`,
      status: index < 2 ? 'done' : 'todo',
      done: index < 2,
      pomodoros: index,
      focusedMinutes: index * 15,
      projectId: index % 2 === 0 ? 'p1' : 'p2',
      createdAt: now - 3 * 86_400_000,
      updatedAt: now,
      ...(index < 2 ? { completedAt: now - index * 3_600_000 } : {}),
    })),
  ),
)
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
localStorage.setItem('dsh-otaku-study-board:meta', wrap({ sessionTaskMap: {} }))

function App(): unknown {
  return (
    <div className="osb-page v4-page" data-view="v4" data-osb-page="">
      <V4Shell
        page="dashboard"
        onPageChange={() => undefined}
        onCreateTask={() => undefined}
        onOpenClassic={() => undefined}
      >
        <Dashboard onNavigate={() => undefined} onCreateTask={() => undefined} />
      </V4Shell>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
;(window as unknown as { __ready: boolean }).__ready = true
