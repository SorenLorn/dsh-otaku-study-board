/**
 * v4/Expandable.tsx — 统一的「卡片内展开」机制。
 *
 * 为什么不是每个卡片自己写 useState：
 *   • 展开状态必须集中管理，否则「今天任务」和「项目进度」可以同时摊开，
 *     整页被撑长，用户找不到自己刚才点的是哪一个；
 *   • 展开/收起的语义（aria-expanded、aria-controls、焦点、200ms 动效）
 *     只应该实现一次。
 *
 * 结构固定为：标题行（可点）→ 常驻摘要 → 展开区。摘要永远可见，
 * 所以收起时卡片也不会变成一条空标题。
 */
import type { ReactNode } from 'react'
import { useWorkspace } from './workspace'

export interface ExpandablePanelProps {
  /** 全局唯一：同一时刻只展开一个。 */
  id: string
  title: string
  meta?: string
  /** 常驻内容（默认可见）。 */
  summary?: ReactNode
  /** 展开后才挂载的内容（不做 display:none，避免读屏念出隐藏文本）。 */
  detail?: ReactNode
  /** 展开区的补充说明，显示在按钮的可访问名称里。 */
  hint?: string
  variant?: 'default' | 'quiet'
  className?: string
  /** 标题右侧的常驻操作（不会再嵌一个按钮，避免按钮套按钮）。 */
  actions?: ReactNode
  /** 卡片内边距由内容自己排时可关掉。 */
  pad?: 'default' | 'none'
}

export function ExpandablePanel({
  id,
  title,
  meta,
  summary,
  detail,
  hint,
  variant = 'quiet',
  className,
  actions,
  pad = 'default',
}: ExpandablePanelProps) {
  const { expandedId, toggleExpanded } = useWorkspace()
  const open = expandedId === id && detail !== undefined
  const regionId = `v4-panel-${id}`

  return (
    <section
      className={[variant === 'quiet' ? 'v4-glass-2' : 'v4-glass-1', 'v4-expand', open ? 'is-open' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={{ padding: pad === 'none' ? 0 : 'var(--v4-s4)' }}
      data-panel={id}
    >
      <header className="v4-expand-head">
        <button
          type="button"
          className="v4-expand-toggle"
          aria-expanded={open}
          aria-controls={detail === undefined ? undefined : regionId}
          onClick={() => toggleExpanded(id)}
        >
          <span className="v4-expand-title">{title}</span>
          {meta === undefined ? null : <span className="v4-expand-meta">{meta}</span>}
          {detail === undefined ? null : (
            <span className="v4-expand-hint" aria-hidden="true">
              {open ? '收起' : hint ?? '展开'}
            </span>
          )}
          {detail === undefined ? null : (
            <span className="v4-expand-chevron" data-open={open ? 'true' : 'false'} aria-hidden="true">
              ▾
            </span>
          )}
        </button>
        {actions === undefined ? null : <div className="v4-expand-actions">{actions}</div>}
      </header>

      {summary === undefined ? null : <div className="v4-expand-summary">{summary}</div>}

      {open ? (
        <div className="v4-expand-body" id={regionId}>
          {detail}
        </div>
      ) : null}
    </section>
  )
}
