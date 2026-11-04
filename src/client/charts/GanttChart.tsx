/**
 * GanttChart — 每日任务完成时序（需求 2.4.1，原生 SVG，零依赖）。
 *
 * 之所以不做「真甘特」（带开始/结束区间）：看板只记录**完成**这一刻，没有可靠的
 * 开始时间。硬画区间等于编数据。这里改成「时间轴上的完成点」：
 *   • 横轴是一天 0–24h；
 *   • 每个点是一次任务完成，宽度按该任务累计专注分钟数（对数缩放，避免长任务
 *     把整行盖住）；
 *   • 右边标「n 件 / 合计 m」。
 *
 * 这样一眼能看出「今天什么时候推进的、推进了几件」，而且永远不会骗人。
 */
import type { GanttRow } from '../types'

export interface GanttChartProps {
  rows: GanttRow[]
  ariaLabel?: string
}

const WIDTH = 560
const ROW_H = 26
const PAD_TOP = 8
const LABEL_W = 46
const RIGHT_PAD = 8
const PLOT_LEFT = LABEL_W + 6
const PLOT_W = WIDTH - PLOT_LEFT - RIGHT_PAD

export function GanttChart({ rows, ariaLabel = '每日任务完成时序' }: GanttChartProps) {
  const height = PAD_TOP * 2 + Math.max(1, rows.length) * ROW_H
  const hasAny = rows.some(row => row.items.length > 0)

  // 空态：不渲染 0/6/12/18/24 轴与空日期行，固定 120px。
  if (!hasAny) {
    return (
      <div style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--osb-text-3)' }}>完成第一个任务后，这里会出现完成时序</p>
      </div>
    )
  }

  return (
    <svg
      className="osb-chart"
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      role="img"
      aria-label={ariaLabel}
    >
      {/* 0 / 6 / 12 / 18 / 24 五条参考线 */}
      {[0, 6, 12, 18, 24].map(hour => {
        const x = PLOT_LEFT + (hour / 24) * PLOT_W
        return (
          <g key={hour}>
            <line
              x1={x}
              y1={PAD_TOP}
              x2={x}
              y2={height - PAD_TOP}
              stroke="var(--osb-border)"
              strokeWidth={hour === 0 || hour === 24 ? 0.8 : 0.5}
              strokeDasharray={hour === 0 || hour === 24 ? undefined : '3 4'}
            />
            <text x={x} y={PAD_TOP - 1} fontSize={8} textAnchor="middle" fill="var(--osb-text-3)">
              {hour}
            </text>
          </g>
        )
      })}

      {!hasAny ? (
        <text
          x={WIDTH / 2}
          y={height / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fill="var(--osb-text-3)"
        >
          这几天还没有完成的任务
        </text>
      ) : null}

      {rows.map((row, rowIndex) => {
        const y = PAD_TOP + rowIndex * ROW_H
        const centerY = y + ROW_H / 2 + 2
        const total = row.items.reduce((sum, item) => sum + item.minutes, 0)
        return (
          <g key={row.dayKey}>
            <text x={4} y={centerY + 3} fontSize={9} fill="var(--osb-text-3)">
              {row.label}
            </text>
            <line
              x1={PLOT_LEFT}
              y1={centerY}
              x2={PLOT_LEFT + PLOT_W}
              y2={centerY}
              stroke="var(--osb-border)"
              strokeWidth={1}
            />
            {row.items.map(item => {
              const date = new Date(item.at)
              const hour = date.getHours() + date.getMinutes() / 60
              const x = PLOT_LEFT + (Math.min(24, Math.max(0, hour)) / 24) * PLOT_W
              // 对数缩放：0m → 4px，60m → 约 30px。
              const width = Math.min(46, 4 + Math.log2(1 + item.minutes) * 4)
              return (
                <g key={item.id}>
                  <rect
                    x={Math.max(PLOT_LEFT, x - width / 2)}
                    y={centerY - 4}
                    width={width}
                    height={8}
                    rx={2}
                    fill="var(--osb-accent)"
                    opacity={0.78}
                  />
                  <title>
                    {`${row.label} ${formatHour(item.at)} · ${item.title}${item.minutes > 0 ? ` · ${item.minutes}m` : ''}`}
                  </title>
                </g>
              )
            })}
            {row.items.length === 0 ? null : (
              <text
                x={WIDTH - RIGHT_PAD}
                y={centerY + 3}
                fontSize={9}
                textAnchor="end"
                fill="var(--osb-text-3)"
              >
                {`${row.items.length} 件${total > 0 ? ` · ${total}m` : ''}`}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function formatHour(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
