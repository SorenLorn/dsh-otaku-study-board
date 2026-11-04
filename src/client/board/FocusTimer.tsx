/**
 * FocusTimer — Card C「专注计时器」（V3：番茄钟 + 自动休息）。
 *
 * 一轮专注结束时做三件事（逻辑闭环）：
 *   1. 把分钟数累加进绑定任务的 `focusedMinutes`（同时 +1 pomodoros 兼容旧字段）；
 *   2. 往日志写一条 `kind: 'focus'` 的记录（带 projectId / project 名称 / taskId），
 *      让统计卡有真实数据源；
 *   3. 弹结束提示，说明这次记到了哪里、接下来休息多久。
 *
 * 休息段（V3）：
 *   • 专注结束自动进入短休 / 长休并开始倒计时（四轮一长休，可在设置里改）；
 *   • **休息不计入专注**：`onComplete` 只在 focus 阶段触发，休息只触发
 *     `onPhaseChange`，不写任何 focus 日志；
 *   • 可以「跳过休息」直接回到专注；
 *   • 刷新页面后阶段与剩余时间都保留（`useTimer` 持久化 phase / deadline）。
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { overlayHost } from '../ui/overlay'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { createId } from '../hooks/useLocalStore'
import {
  clampMinutes,
  useTimer,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  type PhaseChangeInfo,
  type TimerCompleteInfo,
} from '../hooks/useTimer'
import { classifyTitle } from '../lib/detect'
import { formatClock, formatMinutes, formatTime } from '../lib/time'
import { pushNotice } from '../lib/bus'
import { parseIntegerInput } from '../lib/validate'
import { STORAGE_KEYS, type SessionLog, type Task } from '../types'

/** How the completion notice reads. */
interface TimerNotice {
  minutes: number
  taskTitle?: string
  /** 休息长度与类型；`null` 表示没开休息。 */
  breakMinutes: number | null
  longBreak: boolean
}

const PHASE_LABELS = {
  focus: '专注',
  short: '短休',
  long: '长休',
} as const

export function FocusTimer() {
  const board = useBoardData()
  const actions = useBoardActions()
  const { settings, patch } = useBoardSettings()

  const [notice, setNotice] = useState<TimerNotice | null>(null)
  const [durationText, setDurationText] = useState(String(settings.lastDurationMinutes))

  const handleComplete = useCallback(
    (info: TimerCompleteInfo) => {
      const task = board.tasks.find(item => item.id === info.taskId)

      // 1. 记到任务上。旧记录没有 focusedMinutes 时，用 pomodoros×25 作为起点。
      if (task !== undefined) {
        board.setTasks(previous =>
          previous.map(item => {
            if (item.id !== task.id) return item
            const base = item.focusedMinutes ?? (item.pomodoros ?? 0) * 25
            return {
              ...item,
              focusedMinutes: base + info.minutes,
              pomodoros: (item.pomodoros ?? 0) + 1,
              updatedAt: Date.now(),
            }
          }),
        )
      }

      // 2. 落一条专注记录。项目归属优先用任务上的 projectId（V2 这里写错过：
      //    把 projectId 当成项目名塞进 project 字段，导致按项目筛不到）。
      const entry: SessionLog = {
        id: createId('log'),
        at: info.endedAt,
        kind: 'focus',
        sessionType: classifyTitle(task?.title ?? ''),
        title: `${info.minutes} 分钟专注${task === undefined ? '' : ` · ${task.title}`}`,
        detail: `${formatTime(info.startedAt)} → ${formatTime(info.endedAt)}`,
        source: 'manual',
        edited: false,
        minutes: info.minutes,
      }
      const projectId = task?.projectId ?? (board.activeProjectId === '' ? undefined : board.activeProjectId)
      if (projectId !== undefined) {
        entry.projectId = projectId
        const found = board.projects.find(item => item.id === projectId)
        if (found !== undefined) entry.project = found.name
      }
      if (task !== undefined) entry.taskId = task.id
      // 日志 + Daily(focusMinutes) + 时间轴统一由 actions 写入；同 id 重复提交会被幂等挡掉。
      actions.addFocus(entry)

      // 3. 提示（真实休息长度由 onPhaseChange 补进来，这里先给短休值）。
      setNotice({
        minutes: info.minutes,
        ...(task === undefined ? {} : { taskTitle: task.title }),
        breakMinutes: settings.breakEnabled ? settings.shortBreakMinutes : null,
        longBreak: false,
      })
    },
    [board, settings.breakEnabled, settings.shortBreakMinutes],
  )
  /**
   * 阶段切换：
   *   • 进入休息 → 把真实休息长度补进结束提示（长短休不同）；
   *   • 回到专注 → 直接关掉上一条提示，避免「休息结束」复用「计时结束」的文案造成误解
   *     （休息结束的提醒由 useTimer 侧 pushNotice 承担）。
   */
  const handlePhaseChange = useCallback((info: PhaseChangeInfo) => {
    if (info.to === 'focus') {
      setNotice(null)
      return
    }
    setNotice(previous => {
      if (previous === null) return previous
      return { ...previous, breakMinutes: info.minutes, longBreak: info.longBreak }
    })
  }, [])

  const timer = useTimer({
    storageKey: STORAGE_KEYS.timer,
    initialDurationMinutes: settings.lastDurationMinutes,
    onComplete: handleComplete,
    onPhaseChange: handlePhaseChange,
    breakEnabled: settings.breakEnabled,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    roundsBeforeLongBreak: settings.roundsBeforeLongBreak,
  })

  // 存储里的长度在挂载后可能变了（另一张卡写入），同步到输入框。
  useEffect(() => {
    if (timer.phase === 'focus') setDurationText(String(timer.durationMinutes))
  }, [timer.durationMinutes, timer.phase])

  const boundTask: Task | undefined = board.tasks.find(task => task.id === timer.boundTaskId)
  const focusedMinutes =
    boundTask === undefined ? 0 : (boundTask.focusedMinutes ?? (boundTask.pomodoros ?? 0) * 25)
  const isBreak = timer.phase !== 'focus'

  function commitDuration(): void {
    // 非法输入（abc / -5 / 空）不写盘，恢复到当前值并提示一次。
    const parsed = parseIntegerInput(durationText)
    if (parsed === null) {
      setDurationText(String(timer.durationMinutes))
      pushNotice('时长需要是 10–90 之间的整数，已恢复原值', 'warn')
      return
    }
    const minutes = clampMinutes(parsed)
    if (minutes !== parsed) {
      pushNotice(`时长已调整为 ${minutes} 分钟（允许范围 ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES}）`, 'warn')
    }
    setDurationText(String(minutes))
    timer.setDurationMinutes(minutes)
    patch({ lastDurationMinutes: minutes })
  }

  return (
    <section className="osb-card osb-span-5 osb-timer" data-osb-section="timer" data-phase={timer.phase}>
      <header className="osb-card-head">
        <div className="osb-card-head-main">
          <h2 className="osb-card-title">专注计时器</h2>
          <span className="osb-card-title-en">Pomodoro</span>
        </div>
        <span className="osb-card-count" data-running={timer.running ? 'true' : 'false'}>
          {timer.running ? `${PHASE_LABELS[timer.phase]}中` : `${timer.durationMinutes} min`}
        </span>
      </header>

      <div className="osb-card-body">
        <label className="osb-field">
          <span className="osb-field-label">绑定任务</span>
          <select
            className="osb-select"
            value={timer.boundTaskId}
            onChange={event => timer.setBoundTaskId(event.target.value)}
          >
            <option value="">暂不绑定</option>
            {board.tasks
              .filter(task => !task.done)
              .map(task => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
          </select>
        </label>

        <div className="osb-timer-duration">
          <label className="osb-field osb-field-inline">
            <span className="osb-field-label">时长</span>
            <input
              className="osb-input osb-input-number"
              type="number"
              min={MIN_DURATION_MINUTES}
              max={MAX_DURATION_MINUTES}
              step={5}
              value={durationText}
              disabled={timer.running || isBreak}
              aria-label={`专注时长（${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} 分钟）`}
              onChange={event => setDurationText(event.target.value)}
              onBlur={commitDuration}
              onKeyDown={event => {
                if (event.key === 'Enter') commitDuration()
              }}
            />
            <span className="osb-field-suffix">分钟</span>
          </label>
          <span className="osb-hint">
            {isBreak
              ? `休息中 · ${PHASE_LABELS[timer.phase]}`
              : `第 ${timer.roundInCycle + 1} / ${settings.roundsBeforeLongBreak} 轮`}
          </span>
        </div>

        <div className="osb-clock" data-running={timer.running ? 'true' : 'false'} data-phase={timer.phase}>
          {formatClock(timer.remainingSeconds)}
        </div>

        <div className="osb-track">
          <span
            className="osb-track-fill"
            style={{ width: `${Math.round(timer.progress * 100)}%` }}
            data-phase={timer.phase}
          />
        </div>

        <div className="osb-timer-actions">
          <button
            type="button"
            className="osb-btn osb-btn-primary"
            onClick={timer.running ? timer.pause : timer.start}
          >
            {timer.running ? 'Pause' : timer.remainingSeconds === timer.durationSeconds ? 'Start' : 'Resume'}
          </button>
          <button type="button" className="osb-btn" onClick={() => timer.reset()}>
            Reset
          </button>
          {isBreak ? (
            <button type="button" className="osb-btn osb-btn-ghost" onClick={timer.skipBreak}>
              跳过休息
            </button>
          ) : null}
        </div>

        <p className="osb-hint">
          {isBreak
            ? '休息时间不计入专注时长，休息结束会自动回到专注'
            : '一段专注周期，聚焦单一目标'}
        </p>

        {boundTask === undefined ? (
          <p className="osb-timer-bound">未绑定任务 —— 本轮时长只写进日志，不会记到任何任务上。</p>
        ) : (
          <p className="osb-timer-bound">
            本次计时将记入「{boundTask.title}」· 已累计 {formatMinutes(focusedMinutes)}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={settings.breakEnabled}
              onChange={event => patch({ breakEnabled: event.target.checked })}
            />
            自动休息
          </label>
          <span style={{ color: 'var(--osb-text-3)' }}>
            短休 {settings.shortBreakMinutes}m · 长休 {settings.longBreakMinutes}m · 每 {settings.roundsBeforeLongBreak} 轮
          </span>
        </div>
      </div>

      {notice === null ? null : createPortal(
        <div className="osb-modal-backdrop" onClick={() => setNotice(null)}>
          <div
            className="osb-modal"
            role="dialog"
            aria-modal="true"
            aria-label="计时结束"
            onClick={event => event.stopPropagation()}
          >
            <h3 className="osb-modal-title">
              {notice.longBreak ? '长休开始' : notice.minutes === 0 ? '休息结束' : '计时结束'} · {notice.minutes} 分钟
            </h3>
            <p className="osb-modal-desc">
              {notice.taskTitle === undefined
                ? '这一轮已写入会话日志。下一轮可以先绑定一个任务，时长就会累计到它身上。'
                : `已记入「${notice.taskTitle}」，并生成一条专注记录。`}
              {notice.breakMinutes === null
                ? ''
                : ` 接下来休息 ${notice.breakMinutes} 分钟，休息不计入专注时长。`}
            </p>
            <div className="osb-modal-actions">
              <button type="button" className="osb-btn osb-btn-primary" onClick={() => setNotice(null)}>
                知道了
              </button>
            </div>
          </div>
        </div>,
        overlayHost(),
      )}
    </section>
  )
}
