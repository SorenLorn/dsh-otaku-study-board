/**
 * Overview — Card A「今日概览」.
 *
 * 四格数字全部是**推导出来的**，不落盘：任务卡改了勾选、计时器记了一轮、日志
 * 加了一条，这一格立刻变。因为它们读的是同一批 key，`useLocalStore` 的同页广播
 * 会把改动推到每个持有者，所以这里不需要 props，也不需要手动刷新。
 *
 * 「重置今日」只做两件事：删掉今天的日志、把今天完成的任务恢复成未完成。
 * 任务本身和累计专注历史一律不动 —— 确认弹窗里写清楚了这一点，避免用户以为
 * 自己在清库。
 */
import { useMemo, useState } from 'react'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { computeBoardStats } from '../lib/stats'
import { dayKey, formatFullDate, formatMinutes } from '../lib/time'
import { info } from '../lib/debug'
import { useConfirm } from '../ui/ConfirmDialog'

/** 内置励志短句：面向开发者，双语并列，随机取一条。 */
const SLOGANS: ReadonlyArray<{ zh: string; en: string }> = [
  { zh: '慢一点没关系，只要每天都还在写。', en: 'Slow is fine — as long as the commit history keeps moving.' },
  { zh: '一次只推进一件事，把它推到底。', en: 'One thing at a time — all the way to the end.' },
  { zh: '今天解决的 bug，是明天的常识。', en: "Today's bug is tomorrow's intuition." },
  { zh: '读十行，写一行，胜过抄一百行。', en: 'Ten lines read, one line written — better than a hundred pasted.' },
  { zh: '专注不是天赋，是把通知关掉。', en: "Focus isn't talent; it's muting the notifications." },
  { zh: '进度藏在时间戳里，不在心情里。', en: 'Progress lives in the timestamps, not in the mood.' },
]

export interface OverviewProps {
  /** Sidebar session id, kept for symmetry with the other cards. */
  sessionId?: string
}

export function Overview({ sessionId }: OverviewProps) {
  const { tasks, logs, setTasks, setLogs } = useBoardData()
  const now = useNow()
  const confirm = useConfirm()

  /** 每次挂载随机一条；不随渲染变化，否则数字一动短句就跳。 */
  const [slogan] = useState(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)] ?? SLOGANS[0]!)

  const stats = useMemo(() => computeBoardStats(tasks, logs, now), [tasks, logs, now])

  const metrics = [
    {
      key: 'checkins',
      label: '今日打卡',
      value: String(stats.tasksDoneToday),
      unit: `/ ${stats.tasksTotal}`,
      hint: stats.tasksTotal === 0 ? '还没有目标' : `完成率 ${Math.round((stats.tasksDoneToday / stats.tasksTotal) * 100)}%`,
    },
    {
      key: 'focus',
      label: '当日专注',
      value: formatMinutes(stats.focusMinutesToday),
      unit: '',
      hint: stats.focusMinutesToday === 0 ? '开始一轮计时' : '来自已完成的计时',
    },
    {
      key: 'streak',
      label: '连续学习',
      value: String(stats.streakDays),
      unit: '天',
      hint: stats.streakDays >= 3 ? '节奏保持住了' : '今天写一点就接上',
    },
    {
      key: 'logs',
      label: '今日记录',
      value: String(stats.logsToday),
      unit: '条',
      hint: stats.logsToday === 0 ? '自动采集或手动记录' : '本地留存',
    },
  ]

  /** 清掉今天的痕迹：日志删除、今日完成的任务退回未完成。 */
  function handleResetToday(): void {
    const today = dayKey(Date.now())
    confirm.ask(
      {
        title: '重置今日数据？',
        description:
          '将删除今天的全部会话日志，并把今天完成的任务恢复为未完成。任务本身与历史专注时长会保留，不可撤销。',
        confirmLabel: '重置今日',
        tone: 'danger',
      },
      () => {
        const removedLogs = logs.filter(log => dayKey(log.at) === today).length
        setLogs(previous => previous.filter(log => dayKey(log.at) !== today))
        setTasks(previous =>
          previous.map(task => {
            if (task.completedAt === undefined || dayKey(task.completedAt) !== today) return task
            return { ...task, done: false, status: 'todo', completedAt: undefined, updatedAt: Date.now() }
          }),
        )
        info('overview', `reset today: ${removedLogs} logs removed`)
      },
    )
  }

  return (
    <section className="osb-card osb-span-12 osb-overview" data-osb-section="overview" data-session={sessionId ?? ''}>
      <header className="osb-card-head">
        <div className="osb-card-head-main">
          <h2 className="osb-card-title">今日概览</h2>
          <span className="osb-card-title-en">Today at a glance</span>
        </div>
        <div className="osb-head-tools">
          <time className="osb-card-date" dateTime={dayKey(now)}>
            {formatFullDate(now)}
          </time>
          <button type="button" className="osb-btn osb-btn-ghost osb-btn-sm" onClick={handleResetToday}>
            重置今日
          </button>
        </div>
      </header>

      <div className="osb-card-body">
        <ul className="osb-metric-grid">
          {metrics.map(metric => (
            <li className="osb-metric" key={metric.key}>
              <span className="osb-metric-label">{metric.label}</span>
              <span className="osb-metric-value">
                {metric.value}
                {metric.unit === '' ? null : <span className="osb-metric-unit">{metric.unit}</span>}
              </span>
              <span className="osb-metric-hint">{metric.hint}</span>
            </li>
          ))}
        </ul>

        <blockquote className="osb-slogan-quote">
          <p className="osb-slogan">{slogan.zh}</p>
          <p className="osb-slogan-en">{slogan.en}</p>
        </blockquote>
      </div>

      {confirm.dialog}
    </section>
  )
}
