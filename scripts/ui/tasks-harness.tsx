/** V4 Tasks 浏览器布局测试页（真实组件 + 真实 board.css）。 */
import cssText from '../../src/client/style/board.css'
import { createRoot } from 'react-dom/client'
import { Tasks } from '../../src/client/v4/Tasks'
import { WorkspaceProvider } from '../../src/client/v4/workspace'

const style = document.createElement('style')
style.textContent = cssText
document.head.appendChild(style)

const wrap = (data: unknown): string => JSON.stringify({ schemaVersion: 4, data })
const now = Date.now()

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
    Array.from({ length: 8 }, (_, index) => ({
      id: `t${index}`,
      title: `第 ${index + 1} 个任务：把条件类型与映射类型组合起来做一个真实的重构练习`,
      status: index % 3 === 0 ? 'done' : 'todo',
      done: index % 3 === 0,
      pomodoros: 0,
      priority: index % 3 === 0 ? 'urgent' : index % 3 === 1 ? 'important' : 'normal',
      projectId: index % 2 === 0 ? 'p1' : 'p2',
      dueAt: now + (index - 2) * 86_400_000,
      createdAt: now - index * 3_600_000,
      updatedAt: now,
      ...(index % 3 === 0 ? { completedAt: now - index * 86_400_000 } : {}),
    })),
  ),
)
localStorage.setItem('dsh-otaku-study-board:meta', wrap({ sessionTaskMap: {} }))

createRoot(document.getElementById('root')!).render(
  <div className="osb-page v4-page" data-view="v4" data-osb-page="">
    {/* 任务页的新建开关走 WorkspaceProvider，测试页必须提供同一份状态 */}
    <WorkspaceProvider>
      <Tasks />
    </WorkspaceProvider>
  </div>,
)
;(window as unknown as { __ready: boolean }).__ready = true
