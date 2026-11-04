/**
 * v4/Shell.tsx — 统一工作台外壳（唯一入口）。
 *
 * 一条顶部工具栏：品牌 / 页面导航 / 全局项目作用域 / 日期 / 新建任务 / 迁移计划。
 * 没有 Classic↔V4 切换器，也没有任何「回到经典工具」的入口 —— 旧工作台不再
 * 作为第二套用户界面存在，未迁移的能力在「迁移计划」里明确标注。
 *
 * 浮层不在这里渲染，而是由 `<OverlayHost />` 统一挂到页面根节点：
 * 抽屉与弹层共用同一份状态（workspace.tsx），保证一次只开一个。
 */
import type { ReactNode } from 'react'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { Button } from './ui'
import { OverlayHost } from './Detail'
import { useWorkspace, WorkspaceProvider } from './workspace'

export type V4Page = 'dashboard' | 'tasks' | 'history' | 'settings'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export interface V4ShellProps {
  page: V4Page
  onPageChange: (page: V4Page) => void
  children: ReactNode
}

export function V4Shell({ page, onPageChange, children }: V4ShellProps) {
  return (
    <WorkspaceProvider>
      <div className="v4-shell">
        <Topbar page={page} onPageChange={onPageChange} />
        <main className="v4-main" id="v4-main">
          {children}
        </main>
      </div>
      <OverlayHost />
    </WorkspaceProvider>
  )
}

function Topbar({ page, onPageChange }: { page: V4Page; onPageChange: (page: V4Page) => void }) {
  const board = useBoardData()
  const workspace = useWorkspace()
  const now = new Date(useNow(60_000))
  const dateLabel = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAYS[now.getDay()]}`
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="v4-topbar">
      <div className="v4-brand">
        <span className="v4-brand-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.6" opacity=".85" />
            <path d="M11 8.4V12l2.4 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="v4-brand-text">
          <span className="v4-brand-title">溯时学习工作台</span>
          <span className="v4-brand-sub">Sorchron</span>
        </span>
      </div>

      <nav className="v4-nav" aria-label="工作台页面">
        <button
          type="button"
          className={page === 'dashboard' ? 'v4-nav-item is-active' : 'v4-nav-item'}
          aria-current={page === 'dashboard' ? 'page' : undefined}
          onClick={() => onPageChange('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={page === 'tasks' ? 'v4-nav-item is-active' : 'v4-nav-item'}
          aria-current={page === 'tasks' ? 'page' : undefined}
          onClick={() => onPageChange('tasks')}
        >
          任务
        </button>
        <button
          type="button"
          className={page === 'history' ? 'v4-nav-item is-active' : 'v4-nav-item'}
          aria-current={page === 'history' ? 'page' : undefined}
          onClick={() => onPageChange('history')}
        >
          历史
        </button>
      </nav>

      <div className="v4-topbar-end">
        <label className="v4-project-pick">
          <span className="v4-visually-hidden">当前项目</span>
          <select
            className="v4-field v4-project-select"
            value={board.activeProjectId}
            onChange={event => board.setActiveProject(event.target.value)}
            aria-label="当前项目"
          >
            <option value="">全部项目</option>
            {board.activeProjects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <time className="v4-topbar-date" dateTime={isoDate}>
          {dateLabel}
        </time>

        {page === 'settings' || page === 'history' ? null : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => workspace.openModal({ kind: 'create-task', title: '新建任务' })}
          >
            新建任务
          </Button>
        )}

        <Button
          size="sm"
          variant={page === 'settings' ? 'primary' : 'ghost'}
          onClick={() => onPageChange('settings')}
          ariaLabel="设置与数据"
          title="导出、导入、容量与清空"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          数据
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => workspace.openDetail({ kind: 'roadmap', title: '功能迁移计划' })}
          title="查看尚未迁移的能力、目标位置与顺序"
        >
          迁移计划
        </Button>
      </div>
    </div>
  )
}
