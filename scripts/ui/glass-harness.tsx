/**
 * glass-harness.tsx — V4 玻璃材质视觉测试页（真实组件 + 真实 board.css）。
 *
 * 用途：Phase 5.1.2 的前后对比截图。查询参数：
 *   ?page=dashboard|tasks
 *   ?theme=light|dark
 *
 * 注意：这里**模拟**宿主主题 token（body[data-ds-dark-theme]），
 * 截图来自独立 Chromium，不是 DSH 宿主。
 */
import cssText from '../../src/client/style/board.css'
import { createRoot } from 'react-dom/client'
import { Dashboard } from '../../src/client/v4/Dashboard'
import { Tasks } from '../../src/client/v4/Tasks'
import { V4Shell } from '../../src/client/v4/Shell'

const style = document.createElement('style')
style.textContent = cssText
document.head.appendChild(style)

const params = new URLSearchParams(location.search)
const page = params.get('page') === 'tasks' ? 'tasks' : 'dashboard'
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'

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

localStorage.setItem('dsh-otaku-study-board:projects', wrap([
  { id: 'p1', name: 'TS 前端学习与工程化实践', archived: false, createdAt: now - 30 * 86_400_000 },
  { id: 'p2', name: '操作系统与网络基础', archived: false, createdAt: now - 30 * 86_400_000 },
]))
localStorage.setItem('dsh-otaku-study-board:tasks', wrap(
  Array.from({ length: 7 }, (_, index) => ({
    id: `t${index}`,
    title: `第 ${index + 1} 个任务：把条件类型与映射类型组合起来做一个真实的重构练习`,
    status: index < 2 ? 'done' : 'todo',
    done: index < 2,
    pomodoros: index,
    focusedMinutes: index * 15,
    priority: index % 3 === 0 ? 'urgent' : index % 3 === 1 ? 'important' : 'normal',
    estimateMinutes: 25,
    projectId: index % 2 === 0 ? 'p1' : 'p2',
    dueAt: now + (index - 2) * 86_400_000,
    createdAt: now - 3 * 86_400_000,
    updatedAt: now,
    ...(index < 2 ? { completedAt: now - index * 3_600_000 } : {}),
  })),
))
localStorage.setItem('dsh-otaku-study-board:daily', wrap(
  Array.from({ length: 7 }, (_, index) => ({
    day: day(index),
    focusMinutes: index === 0 ? 50 : index * 12,
    tasksDone: index % 2,
    sessions: index,
    friction: 0,
  })),
))
localStorage.setItem('dsh-otaku-study-board:timeline', wrap(
  Array.from({ length: 8 }, (_, index) => ({
    id: `e${index}`,
    type: 'task.completed',
    title: `完成任务 ${index + 1}`,
    at: now - index * 3_600_000,
    projectId: index % 2 === 0 ? 'p1' : 'p2',
  })),
))
localStorage.setItem('dsh-otaku-study-board:logs', wrap(
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
))
localStorage.setItem('dsh-otaku-study-board:friction', wrap([]))
localStorage.setItem('dsh-otaku-study-board:meta', wrap({ sessionTaskMap: {} }))

createRoot(document.getElementById('root')!).render(
  <div className="osb-page v4-page" data-view="v4" data-osb-page="">
    <V4Shell page={page} onPageChange={() => undefined}>
      {page === 'tasks' ? <Tasks /> : <Dashboard onNavigate={() => undefined} onCreateTask={() => undefined} />}
    </V4Shell>
  </div>,
)
;(window as unknown as { __ready: boolean }).__ready = true
