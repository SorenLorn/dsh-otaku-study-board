/**
 * BarChart — 近 7 天专注时长，原生 SVG，零依赖。
 *
 * 之所以手画而不引 ECharts / Recharts：这张图只有七个柱子、一个轴，引入一个
 * 200KB 的图表库会让整个插件包翻三倍，而收益是零。viewBox 固定、`width:100%`
 * 让它自适应容器宽度，文字随图缩放也仍然可读。
 *
 * 空数据（七根柱子全是 0）不画空轴，直接给一句说明 —— 空轴看起来像 bug。
 */

export interface BarPoint {
  /** Stable key (a day key). */
  key: string
  /** Axis label, already short (`10/26` or `周一`). */
  label: string
  /** Value in minutes. */
  value: number
}

export interface BarChartProps {
  points: BarPoint[]
  /** Shown next to the peak label; purely informational. */
  unit?: string
  /** Accessible description. */
  ariaLabel?: string
}

const WIDTH = 560
const HEIGHT = 180
const PAD_X = 26
const PAD_TOP = 24
const PAD_BOTTOM = 30

export function BarChart({ points, unit = 'min', ariaLabel = '每日专注时长柱状图' }: BarChartProps) {
  const max = Math.max(1, ...points.map(point => point.value))
  const hasData = points.some(point => point.value > 0)
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const baseline = HEIGHT - PAD_BOTTOM
  const slot = points.length === 0 ? WIDTH : (WIDTH - PAD_X * 2) / points.length
  const barWidth = Math.min(38, slot * 0.52)

  // 空数据不画空轴：坐标轴 + 网格 + 零柱看起来像图表坏了。
  if (!hasData) {
    return (
      <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--osb-text-3)' }}>完成第一轮专注后，这里会出现趋势</p>
      </div>
    )
  }

  return (
    <svg
      className="osb-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={ariaLabel}
    >
      {/* 三条参考线：0 / 中位 / 峰值 */}
      {[0, 0.5, 1].map(ratio => {
        const y = baseline - plotHeight * ratio
        return (
          <line
            key={ratio}
            x1={PAD_X}
            y1={y}
            x2={WIDTH - PAD_X}
            y2={y}
            stroke="var(--osb-border)"
            strokeWidth={ratio === 0 ? 1 : 0.5}
            strokeDasharray={ratio === 0 ? undefined : '3 4'}
          />
        )
      })}

      {hasData ? null : (
        <text x={WIDTH / 2} y={PAD_TOP + plotHeight / 2} textAnchor="middle" fontSize={11} fill="var(--osb-text-3)">
          这几天还没有专注记录
        </text>
      )}

      {points.map((point, index) => {
        const height = point.value <= 0 ? 0 : Math.max(2, (point.value / max) * plotHeight)
        const x = PAD_X + slot * index + (slot - barWidth) / 2
        const y = baseline - height
        return (
          <g key={point.key}>
            {height > 0 ? (
              <rect x={x} y={y} width={barWidth} height={height} rx={2} fill="var(--osb-accent)" opacity={0.82} />
            ) : (
              <rect x={x} y={baseline - 2} width={barWidth} height={2} rx={1} fill="var(--osb-border-strong)" />
            )}
            {point.value > 0 ? (
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={10}
                fill="var(--osb-text-2)"
              >
                {point.value}
                {unit === '' ? '' : unit}
              </text>
            ) : null}
            <text
              x={x + barWidth / 2}
              y={baseline + 15}
              textAnchor="middle"
              fontSize={10}
              fill="var(--osb-text-3)"
            >
              {point.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
