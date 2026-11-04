/**
 * v4/ui.tsx — V4 设计系统（独立命名空间 `.v4-*`，不依赖也不修改 V3 的 `.osb-*`）。
 *
 * 三条约束：
 *   1. 颜色/间距/圆角/阴影/动效全部走 CSS 变量；深色主题是**另一套值**，不是简单反色。
 *   2. 毛玻璃克制：只有 L1/L2 两级，且 @supports 不支持时退化为不透明表面。
 *   3. 尊重 prefers-reduced-motion。
 */
import type { CSSProperties, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  disabled?: boolean
  /** 加载中：保留标签宽度，不触发布局跳变，也不触发原回调。 */
  loading?: boolean
  onClick?: () => void
  children?: ReactNode
  title?: string
  ariaLabel?: string
  id?: string
}

export function Button({
  variant = 'secondary',
  size = 'md',
  disabled,
  loading = false,
  onClick,
  children,
  title,
  ariaLabel,
  id,
}: ButtonProps) {
  const classes = ['v4-btn']
  if (variant === 'primary') classes.push('v4-btn-primary')
  if (variant === 'ghost') classes.push('v4-btn-ghost')
  if (variant === 'danger') classes.push('v4-btn-danger')
  if (variant === 'icon') classes.push('v4-btn-icon')
  if (size === 'sm') classes.push('v4-btn-sm')
  if (loading) classes.push('v4-btn-loading')
  const blocked = disabled === true || loading

  return (
    <button
      id={id}
      type="button"
      className={classes.join(' ')}
      disabled={blocked}
      aria-busy={loading ? true : undefined}
      aria-label={ariaLabel}
      title={title}
      onClick={blocked ? undefined : onClick}
    >
      <span className="v4-btn-label">{children}</span>
      {loading ? <span className="v4-btn-spinner" aria-hidden="true" /> : null}
    </button>
  )
}

export interface CardProps {
  /**
   * default = 主玻璃（L1）；feature = L1 + 更高投影（表单/主面板）；
   * quiet = 次级玻璃（L2）；stat 保留给旧调用，等同 quiet。
   */
  variant?: 'default' | 'stat' | 'feature' | 'quiet'
  title?: string
  meta?: string
  children?: ReactNode
  className?: string
  /** `none` 用于自己排布内边距的容器（例如统计条）。 */
  pad?: 'default' | 'none'
}

export function Card({ variant = 'default', title, meta, children, className, pad = 'default' }: CardProps) {
  const glass = variant === 'quiet' || variant === 'stat' ? 'v4-glass-2' : 'v4-glass-1'
  const elevated = variant === 'feature' ? 'v4-glass-elevated' : ''
  const classes = [glass, elevated, className ?? ''].filter(Boolean).join(' ')
  return (
    <section className={classes} style={{ padding: pad === 'none' ? 0 : 'var(--v4-s4)' }}>
      {title === undefined ? null : (
        <header className="v4-card-head">
          <h3 className="v4-card-title">{title}</h3>
          {meta === undefined ? null : <span className="v4-card-meta">{meta}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

export interface StateViewProps {
  kind: 'loading' | 'empty' | 'error'
  title: string
  hint?: string
  action?: ReactNode
}

/** 加载 / 空 / 错误三态统一组件；骨架屏是可读的矩形，不是转圈。 */
export function StateView({ kind, title, hint, action }: StateViewProps) {
  if (kind === 'loading') {
    return (
      <div style={{ display: 'grid', gap: 8 }} aria-busy="true">
        <div className="v4-skeleton" style={{ width: '62%' }} />
        <div className="v4-skeleton" style={{ width: '88%' }} />
        <div className="v4-skeleton" style={{ width: '74%' }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'start', minHeight: kind === 'empty' ? 120 : 0, alignContent: 'center' }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--v4-text-2)' }}>{title}</p>
      {hint === undefined ? null : <p style={{ margin: 0, fontSize: 12, color: 'var(--v4-text-3)' }}>{hint}</p>}
      {action === undefined ? null : <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}

export interface ViewTabsProps {
  value: 'classic' | 'v4'
  onChange: (next: 'classic' | 'v4') => void
}

export function ViewTabs({ value, onChange }: ViewTabsProps) {
  return (
    <div role="tablist" aria-label="页面视图" className="v4-tabs">
      {(['classic', 'v4'] as const).map(key => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className="v4-tab"
        >
          {key === 'classic' ? '经典工作台' : 'V4 Dashboard'}
        </button>
      ))}
    </div>
  )
}

/**
 * 近 N 日折线（原生 SVG，零依赖）。
 *
 * 传了 `onSelect` 就变成可点：每个数据点带一个透明的大点击区（r=9），
 * 支持键盘 Enter / 空格，`aria-label` 说明是哪一天多少分钟。纯展示时
 * 不渲染任何 tabIndex —— 静态图不应该伪装成可交互组件。
 */
export function Sparkline({
  values,
  width = 260,
  height = 56,
  labels,
  ariaLabel = '近 7 日专注趋势',
  onSelect,
}: {
  values: number[]
  width?: number
  height?: number
  labels?: string[]
  ariaLabel?: string
  onSelect?: (index: number) => void
}) {
  const max = Math.max(1, ...values)
  const step = values.length <= 1 ? width : width / (values.length - 1)
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 6) - 3).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel}>
      <polyline points={points.join(' ')} fill="none" stroke="var(--v4-accent)" strokeWidth={1.8} strokeLinecap="round" />
      {points.map((point, index) => {
        const [x, y] = point.split(',')
        const label = `${labels?.[index] ?? `第 ${index + 1} 天`} · ${values[index] ?? 0} 分钟`
        return (
          <g key={index}>
            <circle cx={x} cy={y} r={2.4} fill="var(--v4-accent)" opacity={0.9}>
              <title>{label}</title>
            </circle>
            {onSelect === undefined ? null : (
              <circle
                className="v4-spark-hit"
                cx={x}
                cy={y}
                r={9}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={`查看 ${label}`}
                onClick={() => onSelect(index)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(index)
                  }
                }}
              >
                <title>{label}</title>
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** 完成度环。 */
export function ProgressRing({ value, size = 64 }: { value: number; size?: number }) {
  const clamped = Math.min(1, Math.max(0, value))
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`完成度 ${Math.round(clamped * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--v4-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--v4-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circumference * clamped} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize={size <= 48 ? 9 : 11} fill="var(--v4-text-2)">
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  )
}

/** 进度条（V4 独立，不复用 V3 的 .osb-track）。 */
export function ProgressBar({ value, showValue = false }: { value: number; showValue?: boolean }) {
  const clamped = Math.min(1, Math.max(0, value))
  const pct = Math.round(clamped * 100)
  // 有数据但不足 1% 时显示「<1%」，不要四舍五入成 0% —— 那会读成「没占用」。
  const label = pct === 0 && clamped > 0 ? '<1%' : `${pct}%`
  const style: CSSProperties = { height: 6, borderRadius: 999, background: 'var(--v4-border)', overflow: 'hidden' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ ...style, flex: 1 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--v4-accent)', transition: 'width var(--v4-dur) var(--v4-ease)' }} />
      </div>
      {showValue ? <span style={{ fontSize: 11, color: 'var(--v4-text-3)', minWidth: 32, textAlign: 'right' }}>{label}</span> : null}
    </div>
  )
}


/** 近 7 日活跃点：实心=有记录，空心=没有记录。 */
export function StreakDots({ active, labels }: { active: boolean[]; labels: string[] }) {
  const count = active.filter(Boolean).length
  return (
    <div
      role="img"
      aria-label={`近 7 日有 ${count} 天学习记录`}
      style={{ display: 'flex', gap: 4, marginTop: 8 }}
    >
      {active.map((on, index) => (
        <span
          key={index}
          title={`${labels[index] ?? `第 ${index + 1} 天`} · ${on ? '有记录' : '无记录'}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: on ? 'var(--v4-accent)' : 'transparent',
            border: on ? '1px solid transparent' : '1px solid var(--v4-border-strong)',
          }}
        />
      ))}
    </div>
  )
}
