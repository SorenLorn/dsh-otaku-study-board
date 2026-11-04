/**
 * PieChart — 当日各类型会话耗时，原生 SVG 环形图 + HTML 图例。
 *
 * 环形而不是实心饼：中间那圈空白正好放「今日总时长」，一个像素都不用浪费。
 * 用 `stroke-dasharray` 在一圈上切片，比算 path 的 arc 命令短得多，也不用担心
 * 大角度跨 180° 时的 `large-arc-flag` 陷阱。
 */

export interface PieSlice {
  key: string
  label: string
  /** Weight (minutes). Zero-value slices are dropped before drawing. */
  value: number
  /** Any CSS colour, usually one of the `--osb-*` tokens. */
  color: string
}

export interface PieChartProps {
  slices: PieSlice[]
  /** Big text in the hole, e.g. `2h 15m`. */
  centerValue: string
  /** Small label under it. */
  centerLabel: string
  emptyHint?: string
  ariaLabel?: string
}

const SIZE = 168
const RADIUS = 56
const STROKE = 20

export function PieChart({
  slices,
  centerValue,
  centerLabel,
  emptyHint = '今日还没有会话记录',
  ariaLabel = '会话类型耗时占比',
}: PieChartProps) {
  const visible = slices.filter(slice => slice.value > 0)
  const total = visible.reduce((sum, slice) => sum + slice.value, 0)
  const circumference = 2 * Math.PI * RADIUS

  // 空态：不画圆环、不画轨道、不留图例，和柱状图/甘特图保持同一种表达。
  if (total === 0) {
    return (
      <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--osb-text-3)' }}>{emptyHint}</p>
      </div>
    )
  }

  let offset = 0

  return (
    <div className="osb-pie">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={ariaLabel}
        className="osb-pie-canvas"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--osb-surface-3)"
          strokeWidth={STROKE}
        />
        {total > 0 ? (
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {visible.map(slice => {
              const length = (slice.value / total) * circumference
              const dash = `${Math.max(0.5, length)} ${circumference - Math.max(0.5, length)}`
              const dashOffset = -offset
              offset += length
              return (
                <circle
                  key={slice.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={STROKE}
                  strokeDasharray={dash}
                  strokeDashoffset={dashOffset}
                />
              )
            })}
          </g>
        ) : null}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 2}
          textAnchor="middle"
          fontSize={16}
          fill="var(--osb-text)"
          fontFamily="var(--osb-mono)"
        >
          {total > 0 ? centerValue : '—'}
        </text>
        <text x={SIZE / 2} y={SIZE / 2 + 16} textAnchor="middle" fontSize={10} fill="var(--osb-text-3)">
          {total > 0 ? centerLabel : '暂无数据'}
        </text>
      </svg>

      <ul className="osb-legend">
        {total > 0 ? (
          visible.map(slice => (
            <li className="osb-legend-item" key={slice.key}>
              <span className="osb-swatch" style={{ background: slice.color }} aria-hidden="true" />
              <span className="osb-legend-label">{slice.label}</span>
              <span className="osb-legend-value">
                {slice.value}m · {Math.round((slice.value / total) * 100)}%
              </span>
            </li>
          ))
        ) : (
          <li className="osb-legend-item osb-legend-empty">{emptyHint}</li>
        )}
      </ul>
    </div>
  )
}
