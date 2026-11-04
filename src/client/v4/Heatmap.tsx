/**
 * v4/Heatmap.tsx — 学习活动热力图（GitHub Contributions 风格）。
 *
 * 从 `History.tsx` 抽出来的**同一个**组件（Phase 6.2 只做搬迁，不改渲染）：
 * Dashboard 首页与 History 页共用它，避免两份格子、两套 tooltip、两套键盘行为
 * 慢慢长歪。数据仍然只来自 `lib/activity.ts` 的纯函数，组件不做任何统计，
 * 因此「同一天在两个页面上颜色一样」是结构保证，而不是巧合。
 *
 * 交互约定：
 *   • 鼠标悬停 / 键盘聚焦显示 tooltip（日期、强度、完成、专注时长、专注次数、活动数）；
 *   • 点击或 Enter 打开当天详情（调用方决定打开哪个抽屉）；
 *   • 365 个格子只有当前格可 Tab：方向键漫游，避免把整页的 Tab 顺序吃掉。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { overlayHost } from '../ui/overlay'
import {
  ACTIVITY_LEVEL_LABEL,
  type ActivityCalendar,
  type ActivityDay,
  type ActivityRange,
} from '../lib/activity'
import { formatDateInput, weekdayOfDayKey } from '../lib/time'

export const RANGE_LABEL: Record<ActivityRange, string> = {
  7: '近 7 天',
  30: '近 30 天',
  90: '近 90 天',
  365: '近 365 天',
}

export interface ActivityHeatmapProps {
  calendar: ActivityCalendar
  /** 今天的 `YYYY-MM-DD`（本地日键），用于 `is-today` 标记与键盘焦点兜底。 */
  today: string
  range: ActivityRange
  onOpenDay: (day: string) => void
  /**
   * 图例位置。History 页在顶部右对齐；Dashboard 放在底部左对齐 ——
   * 首页卡片右侧还有统计列，顶部图例会和中缝挤在一起。
   */
  legend?: 'top' | 'bottom'
}

interface HoverState {
  day: ActivityDay
  left: number
  top: number
  below: boolean
}

export function ActivityHeatmap({ calendar, today, range, onOpenDay, legend = 'top' }: ActivityHeatmapProps) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [focused, setFocused] = useState<string>(today)
  const days = useMemo(() => calendar.weeks.flat().filter(cell => cell.inRange), [calendar.weeks])
  const dayByKey = useMemo(() => new Map(days.map(day => [day.day, day])), [days])

  // 范围切换后，原焦点可能不在新窗口里；退回今天。
  useEffect(() => {
    if (!dayByKey.has(focused)) setFocused(today)
  }, [dayByKey, focused, today])

  const showAt = useCallback((element: HTMLElement, day: ActivityDay) => {
    const rect = element.getBoundingClientRect()
    const half = 84
    const left = Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8)
    const below = rect.top < 140
    // 上方 22px 让出月份标签那一行：tooltip 可以压住卡片标题，但不能压住热力图的月份。
    setHover({ day, left, top: below ? rect.bottom + 8 : rect.top - 22, below })
  }, [])

  const handleOver = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-day]')
      if (target === null) return
      const day = dayByKey.get(target.dataset.day ?? '')
      if (day !== undefined) showAt(target, day)
    },
    [dayByKey, showAt],
  )

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-day]')
      if (target === null) return
      const day = dayByKey.get(target.dataset.day ?? '')
      if (day === undefined) return
      setFocused(day.day)
      showAt(target, day)
    },
    [dayByKey, showAt],
  )

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = days.findIndex(day => day.day === focused)
      if (index < 0) return
      let next = index
      if (event.key === 'ArrowLeft') next = index - 7
      else if (event.key === 'ArrowRight') next = index + 7
      else if (event.key === 'ArrowUp') next = index - 1
      else if (event.key === 'ArrowDown') next = index + 1
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = days.length - 1
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onOpenDay(focused)
        return
      } else {
        return
      }
      event.preventDefault()
      const target = days[Math.min(days.length - 1, Math.max(0, next))]
      if (target === undefined) return
      setFocused(target.day)
      // 不用 per-cell ref（那会让 memo 失效）：直接从 DOM 找当前格。
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${target.day}"]`)?.focus()
    },
    [days, focused, onOpenDay],
  )

  return (
    <div className="v4-heat" data-legend={legend}>
      <div className="v4-heat-legend" aria-hidden="true">
        <span>少</span>
        {[0, 1, 2, 3, 4].map(level => (
          <i key={level} data-level={level} />
        ))}
        <span>多</span>
      </div>

      <p className="v4-heat-scrollhint">左右滑动查看全年</p>

      <div className="v4-heat-body">
        <div className="v4-heat-weekdays" aria-hidden="true">
          <span>一</span>
          <span>三</span>
          <span>五</span>
        </div>
        <div className="v4-heat-scroll">
          <div className="v4-heat-months" style={{ gridTemplateColumns: `repeat(${calendar.weeks.length}, 12px)` }}>
            {calendar.monthLabels.map(item => (
              <span key={`${item.weekIndex}-${item.label}`} style={{ gridColumnStart: item.weekIndex + 1 }}>
                {item.label}
              </span>
            ))}
          </div>
          <div
            className="v4-heat-grid"
            ref={gridRef}
            role="group"
            aria-label={`学习活动热力图，${RANGE_LABEL[range]}，共 ${days.length} 天；方向键移动，Enter 查看当天`}
            onMouseOver={handleOver}
            onMouseLeave={() => setHover(null)}
            onFocus={handleFocus}
            onBlur={() => setHover(null)}
            onKeyDown={handleKey}
          >
            {calendar.weeks.map((week, weekIndex) => (
              <div className="v4-heat-col" key={week[0]?.day ?? weekIndex}>
                {week.map(cell => (
                  <HeatCell
                    key={cell.day}
                    cell={cell}
                    focused={cell.day === focused}
                    today={cell.day === today}
                    onOpen={onOpenDay}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover === null ? null : createPortal(
        <div
          className="v4-heat-tip"
          data-below={hover.below ? 'true' : 'false'}
          style={{ left: hover.left, top: hover.top }}
          role="tooltip"
          aria-hidden="true"
        >
          <p className="v4-heat-tip-date">
            {formatDateInput(new Date(`${hover.day.day}T00:00:00`).getTime())} · {weekdayOfDayKey(hover.day.day)}
          </p>
          <p className="v4-heat-tip-level">{ACTIVITY_LEVEL_LABEL[hover.day.level]}</p>
          <p>完成任务：{hover.day.tasksDone}</p>
          <p>专注时间：{hover.day.focusMinutes} 分钟</p>
          <p>专注次数：{hover.day.focusCount} 次</p>
          <p>学习活动：{hover.day.activityCount} 项</p>
          {hover.day.reconciled ? <p className="v4-heat-tip-warn">该日聚合与原始记录不一致，已取更完整的一方</p> : null}
        </div>,
        overlayHost(),
      )}
    </div>
  )
}

interface HeatCellProps {
  cell: ActivityDay
  focused: boolean
  today: boolean
  onOpen: (day: string) => void
}

/** 单个格子：不传回调对象，避免 hover 时 365 个格子全部重渲染。 */
const HeatCell = memo(function HeatCell({ cell, focused, today, onOpen }: HeatCellProps) {
  if (!cell.inRange) {
    return <span className="v4-heat-cell is-out" aria-hidden="true" />
  }
  return (
    <button
      type="button"
      className={today ? 'v4-heat-cell is-today' : 'v4-heat-cell'}
      data-level={cell.level}
      data-day={cell.day}
      tabIndex={focused ? 0 : -1}
      aria-label={`${cell.day}，${ACTIVITY_LEVEL_LABEL[cell.level]}，完成 ${cell.tasksDone} 个任务，专注 ${cell.focusMinutes} 分钟，专注 ${cell.focusCount} 次`}
      onClick={() => onOpen(cell.day)}
    />
  )
})
