/**
 * MonthlyGoalPanel — 折叠子面板，设置并查看月度目标。
 *
 * 目标本身是**数据**（存在 settings.monthlyGoal 里），所以改目标不需要重新渲染
 * 任何逻辑，只是换个数字。`month` 字段用来识别「上个月的目标」：跨月之后进度
 * 会归零，界面上会提示你重新确认一次，而不是让一个过期的目标继续显示已达标。
 */
import { useEffect, useState } from 'react'
import { useBoardData, useNow } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { monthlyProgress } from '../lib/stats'
import { formatMinutes, monthKey } from '../lib/time'
import { clampGoalMinutes, clampGoalTasks } from '../lib/validate'

export function MonthlyGoalPanel() {
  const { tasks, logs } = useBoardData()
  const { settings, patch } = useBoardSettings()
  const now = useNow()

  const goal = settings.monthlyGoal
  const progress = monthlyProgress(tasks, logs, goal, now)

  const [minutesText, setMinutesText] = useState(String(goal.targetMinutes))
  const [tasksText, setTasksText] = useState(String(goal.targetTasks))

  useEffect(() => {
    setMinutesText(String(goal.targetMinutes))
    setTasksText(String(goal.targetTasks))
  }, [goal.targetMinutes, goal.targetTasks])

  function save(): void {
    // 非法输入（空 / 负数 / 超大 / 非数字）一律夹到合法区间，不写 NaN 进存储。
    const targetMinutes = clampGoalMinutes(minutesText, goal.targetMinutes)
    const targetTasks = clampGoalTasks(tasksText, goal.targetTasks)
    setMinutesText(String(targetMinutes))
    setTasksText(String(targetTasks))
    patch({ monthlyGoal: { month: monthKey(Date.now()), targetMinutes, targetTasks } })
  }

  const rows = [
    {
      key: 'minutes',
      label: '专注时长',
      value: formatMinutes(progress.focusMinutes),
      target: formatMinutes(goal.targetMinutes),
      rate: progress.minutesRate,
    },
    {
      key: 'tasks',
      label: '完成任务',
      value: String(progress.doneTasks),
      target: String(goal.targetTasks),
      rate: progress.tasksRate,
    },
  ]

  return (
    <details className="osb-collapse">
      <summary className="osb-collapse-head">
        月度目标
        <span className="osb-collapse-meta">
          {progress.inCurrentMonth ? `${monthKey(now)}` : '目标未设为本月'}
        </span>
      </summary>

      <div className="osb-collapse-body">
        {progress.inCurrentMonth ? null : (
          <p className="osb-hint osb-hint-block">
            目标还停留在 {goal.month === '' ? '未设置' : goal.month}，本月进度从零开始统计。修改下面任意一项即可设为本月。
          </p>
        )}

        <ul className="osb-goal-list">
          {rows.map(row => (
            <li className="osb-goal-row" key={row.key}>
              <span className="osb-goal-label">{row.label}</span>
              <span className="osb-goal-track">
                <span className="osb-goal-fill" style={{ width: `${Math.round(row.rate * 100)}%` }} />
              </span>
              <span className="osb-goal-value">
                {row.value} / {row.target}
              </span>
              <span className="osb-goal-rate">{Math.round(row.rate * 100)}%</span>
            </li>
          ))}
        </ul>

        <div className="osb-goal-form">
          <label className="osb-field osb-field-inline">
            <span className="osb-field-label">月目标时长</span>
            <input
              className="osb-input osb-input-number"
              type="number"
              min={0}
              step={60}
              value={minutesText}
              onChange={event => setMinutesText(event.target.value)}
              onBlur={save}
            />
            <span className="osb-field-suffix">分钟</span>
          </label>
          <label className="osb-field osb-field-inline">
            <span className="osb-field-label">月目标任务数</span>
            <input
              className="osb-input osb-input-number"
              type="number"
              min={0}
              step={1}
              value={tasksText}
              onChange={event => setTasksText(event.target.value)}
              onBlur={save}
            />
            <span className="osb-field-suffix">个</span>
          </label>
        </div>
      </div>
    </details>
  )
}
