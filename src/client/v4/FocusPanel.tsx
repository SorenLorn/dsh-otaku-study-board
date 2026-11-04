/**
 * v4/FocusPanel.tsx — 统一工作台里的专注计时（Phase 5.5）。
 *
 * 放在 Dashboard 的「专注」面板里，不新开页面、不新开浮层：
 *   • `summary` 常驻紧凑态：大号倒计时 + 一行状态 + 主操作（开始 / 暂停 / 结束）；
 *   • `detail` 展开态：时长、任务绑定、休息设置、最近专注记录、口径说明。
 *
 * ── 三个刻意的设计决定 ────────────────────────────────────────────────────
 *   1. **计时数字不参与布局计算**：`tabular-nums` + 固定字符宽度 + 等宽字体，
 *      每秒变化不会让按钮左右跳。
 *   2. **完成后停在 completed**（不自动进入休息）：需求 §8.4 要求完成态给出
 *      「开始下一轮 / 进入休息」两个选择，自动跳休息会让这个状态永远看不到。
 *      计时器本身已经按 `roundsBeforeLongBreak` 算好了该短休还是长休。
 *   3. **任务绑定可以中途改**，数据归属规则写在界面上：**以结束那一刻的绑定为准**。
 *      日志里保存的是 taskId，任务被删了日志也不会丢（只是 taskId 被清理）。
 */
import { useMemo, useState } from 'react'
import type { DailyAggregate, PendingBaseline, PendingSettlement, SessionLog, Task } from '../types'
import { STORAGE_KEYS } from '../types'
import { useBoardActions } from '../hooks/useBoardActions'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { useLocalStore } from '../hooks/useLocalStore'
import { useTimer, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, type TimerCompleteInfo } from '../hooks/useTimer'
import { buildActivityWindow } from '../lib/activity'
import { dayKey, formatClock, formatMinutes, formatRelative, recentDayKeys, weekdayOfDayKey } from '../lib/time'
import { clampBreakMinutes, clampDurationMinutes, parseIntegerInput } from '../lib/validate'
import { Button } from './ui'
import { ExpandablePanel } from './Expandable'
import { useWorkspace } from './workspace'

const PRESETS = [15, 25, 45] as const
const PHASE_LABEL = { focus: '专注', short: '短休', long: '长休' } as const

export function FocusPanel() {
  const board = useBoardData()
  const actions = useBoardActions()
  const { settings, patch } = useBoardSettings()
  const workspace = useWorkspace()
  const [daily] = useLocalStore<DailyAggregate[]>(STORAGE_KEYS.daily, [])

  /** 刚结算的那一轮（用于「本次 18 分钟」的明确反馈）；刷新后由 timer.lastResult 顶上。 */
  const [justFinished, setJustFinished] = useState<TimerCompleteInfo | null>(null)
  const [durationText, setDurationText] = useState(String(settings.lastDurationMinutes))
  const [saveError, setSaveError] = useState<string | null>(null)
  /**
   * 刚放弃的那一笔（Phase 6.1）。
   *
   * 有值时**绝不能**显示「已记入」：这一轮要么被清理掉了（安全放弃），要么数据还在但
   * 没有完整累计。这里存的是给用户看的那句话本身。
   */
  const [discarded, setDiscarded] = useState<string | null>(null)

  /**
   * 记账只走这一条路：日志 + Daily + 任务副本 + 时间轴，一次事务写完。
   * 返回 `false` 时计时器会保留 pendingResult，界面显示「未保存 · 重试」。
   */
  const handleComplete = (info: TimerCompleteInfo, baseline?: PendingBaseline): { ok: boolean; baseline?: PendingBaseline } => {
    const report = actions.finishFocus(info, baseline)
    setJustFinished(info)
    setDiscarded(null)
    if (!report.ok) {
      setSaveError(report.message)
      return {
        ok: false,
        ...(report.baseline === undefined ? {} : { baseline: report.baseline }),
      }
    }
    setSaveError(null)
    return { ok: true }
  }

  /**
   * 放弃这一笔（Phase 6.1）：先证明「本轮只写过日志与时间轴」再清理。
   *
   * 返回值里的 `ok` 决定计时器要不要清标记 —— 拒绝清理时必须保留，界面继续显示「未保存」。
   */
  const handleDiscard = (
    pending: PendingSettlement,
    cleared: { key: string; value: unknown },
  ): { ok: boolean; message: string; persisted: boolean } => {
    const result: TimerCompleteInfo = {
      roundId: pending.roundId,
      minutes: pending.minutes,
      elapsedSeconds: pending.elapsedSeconds,
      targetMinutes: pending.targetMinutes,
      taskId: pending.taskId,
      startedAt: pending.startedAt,
      endedAt: pending.endedAt,
      longBreak: false,
      recorded: pending.minutes >= 1,
    }
    const report = actions.discardFocus(result, pending.before, cleared)
    if (!report.ok) {
      // 无法安全放弃 / 清理失败：保留 pendingResult，把真实原因留在面板上。
      setDiscarded(null)
      setSaveError(report.message)
      return { ok: false, message: report.message, persisted: false }
    }
    setSaveError(null)
    setDiscarded(report.message)
    return { ok: true, message: report.message, persisted: report.persisted }
  }

  const timer = useTimer({
    storageKey: STORAGE_KEYS.timer,
    initialDurationMinutes: settings.lastDurationMinutes,
    onComplete: handleComplete,
    onDiscard: handleDiscard,
    breakEnabled: settings.breakEnabled,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    roundsBeforeLongBreak: settings.roundsBeforeLongBreak,
  })

  const boundTask: Task | undefined = board.allTasks.find(task => task.id === timer.boundTaskId)
  const isBreak = timer.phase !== 'focus'
  const today = dayKey(Date.now())
  const focusLogs = useMemo(() => board.logs.filter(log => log.kind === 'focus'), [board.logs])
  const todayLogs = useMemo(() => focusLogs.filter(log => dayKey(log.at) === today), [focusLogs, today])
  const week = useMemo(() => {
    const days = recentDayKeys(7)
    const keySet = new Set(days)
    return focusLogs.filter(log => keySet.has(dayKey(log.at))).reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0)
  }, [focusLogs])
  /** 近 7 日与 Dashboard 的活跃口径一致（daily 优先、日志补充），不另算一套。 */
  const weekActive = useMemo(
    () => buildActivityWindow({ tasks: board.allTasks, logs: board.allLogs, daily }, { range: 7 }).summary.activeDays,
    [board.allTasks, board.allLogs, daily],
  )

  /** 结算失败、还没落盘的那一笔。有值时界面必须显示「未保存」，不许假装成功。 */
  const unsaved = timer.pendingResult !== null
  const result = justFinished ?? timer.lastResult
  /** 时钟下面那行「已专注 N 分」：completed 态用结算值，其余用实时值。 */
  const shownMinutes =
    timer.status === 'completed' ? (timer.pendingResult?.minutes ?? result?.minutes ?? 0) : timer.actualMinutes
  const resultTask = result === null ? undefined : board.allTasks.find(task => task.id === result.taskId)
  /**
   * 这一轮到底有没有落进存储（Phase 6.1）。
   *
   * 「已放弃」如果只记在 React 状态里，刷新后就没了，界面又会说「已记入」—— 等于
   * 再撒一次谎。所以这里不看提示语，直接看存储：**没有一条 `at` 恰好等于本轮结束
   * 时刻的专注日志，就是没记入**。`lastResult` 本身是持久化的，可以支撑这个判断。
   */
  const recorded = useMemo(
    () => (result === null ? false : board.allLogs.some(log => log.kind === 'focus' && log.at === result.endedAt)),
    [board.allLogs, result],
  )

  function commitDuration(): void {
    const parsed = parseIntegerInput(durationText)
    if (parsed === null) {
      setDurationText(String(timer.durationMinutes))
      setSaveError(`时长需要是 ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} 之间的整数`)
      return
    }
    const minutes = clampDurationMinutes(parsed)
    setDurationText(String(minutes))
    timer.setDurationMinutes(minutes)
    patch({ lastDurationMinutes: minutes })
    setSaveError(null)
  }

  function beginRound(): void {
    // 上一笔还没落盘时不许开新一轮：`reset` 会清掉 pending，那笔专注就真丢了。
    if (timer.pendingResult !== null) return
    setJustFinished(null)
    setSaveError(null)
    setDiscarded(null)
    if (timer.status === 'completed') timer.reset(timer.durationMinutes)
    timer.start()
  }

  const compact = (
    <div className="v4-focus-live" data-status={timer.status} data-phase={timer.phase}>
      <div className="v4-focus-clock-box">
        <p className="v4-focus-clock" data-status={timer.status} aria-label={`剩余 ${formatClock(timer.remainingSeconds)}`}>
          {formatClock(timer.remainingSeconds)}
        </p>
        <div className="v4-focus-track" aria-hidden="true">
          <span className="v4-focus-track-fill" style={{ width: `${Math.round(timer.progress * 100)}%` }} />
        </div>
        <p className="v4-focus-clock-sub">
          <span role="status" aria-live="polite">
            {isBreak ? `${PHASE_LABEL[timer.phase]} · ${timer.statusLabel}` : timer.statusLabel}
          </span>
          <span className="v4-focus-clock-dot" aria-hidden="true">
            ·
          </span>
          {/*
            completed 态的剩余是 0，用 `actualMinutes` 会算成「全长」（25 分）。
            这一行必须用结算出来的真实分钟，否则界面会自己撒谎。
          */}
          <span className="v4-focus-clock-elapsed">已专注 {shownMinutes} 分</span>
        </p>
      </div>

      <div className="v4-focus-body">
        {timer.status === 'completed' ? (
          <div
            className="v4-focus-result"
            data-unsaved={unsaved ? 'true' : 'false'}
            data-discarded={discarded !== null || !recorded ? 'true' : 'false'}
          >
            <p className="v4-focus-result-title">
              本轮完成 · <strong>{formatMinutes(result?.minutes ?? 0)}</strong>
              {unsaved ? <span className="v4-focus-unsaved">未保存</span> : null}
              {!unsaved && (discarded !== null || !recorded) ? <span className="v4-focus-abandoned">已放弃</span> : null}
            </p>
            <p className="v4-focus-result-sub">
              {/*
                三态必须分开说，禁止把「安全放弃」或「数据不确定」讲成「已记入」：
                  ① 未保存 → 真实失败原因；
                  ② 刚放弃 / 存储里查不到这一轮 → 清理结果或「未记入」；
                  ③ 其余 → 已记入（自由专注也要明说「已记入」）。
              */}
              {unsaved ? (
                saveError ?? '写入失败：这一笔还在计时状态里，刷新也不会丢，可以重试'
              ) : discarded !== null ? (
                <span className="v4-focus-discarded">{discarded}</span>
              ) : !recorded ? (
                <span className="v4-focus-discarded">本轮未记入（已放弃这一笔，存储里没有找到对应的专注日志）</span>
              ) : resultTask === undefined ? (
                '已记入（自由专注，未绑定任务）'
              ) : (
                `已记入「${resultTask.title}」`
              )}
              {unsaved || result === null || discarded !== null || !recorded ? '' : ` · ${formatRelative(result.endedAt)}`}
            </p>
          </div>
        ) : (
          <div className="v4-focus-meta">
            {/* 任务行可点：直接展开设置（不额外放一个「选择任务」按钮，避免按钮堆叠） */}
            <button
              type="button"
              className="v4-focus-task-btn"
              aria-expanded={workspace.expandedId === 'focus'}
              aria-controls="v4-panel-focus"
              title="展开设置任务、时长与休息"
              onClick={() => workspace.toggleExpanded('focus')}
            >
              <span className="v4-focus-task">{boundTask === undefined ? '自由专注（未绑定任务）' : boundTask.title}</span>
              <span className="v4-focus-task-cue" aria-hidden="true">设置</span>
            </button>
            <p className="v4-focus-hint">
              {isBreak
                ? '休息不计入专注时长，也不会写专注记录'
                : `目标 ${timer.durationMinutes} 分钟 · 第 ${(timer.roundInCycle % Math.max(2, settings.roundsBeforeLongBreak)) + 1} / ${settings.roundsBeforeLongBreak} 轮`}
            </p>
          </div>
        )}

        <div className="v4-focus-actions">
          {timer.status === 'idle' ? (
            <Button size="sm" variant="primary" onClick={beginRound}>
              开始专注
            </Button>
          ) : null}

          {timer.status === 'running' ? (
            <>
              <Button size="sm" variant="primary" onClick={timer.pause}>
                暂停
              </Button>
              <Button size="sm" variant="ghost" onClick={timer.end}>
                结束并记录
              </Button>
            </>
          ) : null}

          {timer.status === 'paused' ? (
            <>
              <Button size="sm" variant="primary" onClick={timer.start}>
                继续
              </Button>
              <Button size="sm" variant="ghost" onClick={timer.end}>
                结束并记录
              </Button>
              <Button size="sm" variant="ghost" onClick={timer.cancel}>
                取消
              </Button>
            </>
          ) : null}

          {timer.status === 'completed' && unsaved ? (
            <>
              <Button size="sm" variant="primary" onClick={() => timer.retryPending()}>
                重试写入
              </Button>
              <Button size="sm" variant="ghost" onClick={timer.discardPending}>
                放弃这一笔
              </Button>
            </>
          ) : null}

          {timer.status === 'completed' && !unsaved ? (
            <>
              <Button size="sm" variant="primary" onClick={beginRound}>
                开始下一轮
              </Button>
              {settings.breakEnabled ? (
                <Button size="sm" onClick={() => timer.beginBreak(timer.roundInCycle >= settings.roundsBeforeLongBreak ? 'long' : 'short')}>
                  {timer.roundInCycle >= settings.roundsBeforeLongBreak ? '进入长休' : '进入休息'}
                </Button>
              ) : null}
            </>
          ) : null}

          {timer.status === 'break' ? (
            <>
              <Button size="sm" variant="primary" onClick={timer.pause}>
                暂停休息
              </Button>
              <Button size="sm" variant="ghost" onClick={timer.skipBreak}>
                跳过休息
              </Button>
            </>
          ) : null}

          {timer.status === 'break-paused' ? (
            <>
              <Button size="sm" variant="primary" onClick={timer.resumeBreak}>
                继续休息
              </Button>
              <Button size="sm" variant="ghost" onClick={timer.skipBreak}>
                结束休息
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )

  const details = (
    <div className="v4-focus-detail">
      <div className="v4-focus-row">
        <span className="v4-focus-label">时长</span>
        <span className="v4-focus-control">
          <input
            className="v4-field v4-focus-number"
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
          <span className="v4-focus-unit">分钟</span>
          {PRESETS.map(minutes => (
            <button
              key={minutes}
              type="button"
              className="v4-focus-preset"
              data-active={timer.durationMinutes === minutes && !isBreak ? 'true' : 'false'}
              disabled={timer.running || isBreak}
              onClick={() => {
                setDurationText(String(minutes))
                timer.setDurationMinutes(minutes)
                patch({ lastDurationMinutes: minutes })
              }}
            >
              {minutes}
            </button>
          ))}
        </span>
      </div>

      <div className="v4-focus-row">
        <label className="v4-focus-label" htmlFor="v4-focus-task">
          绑定任务
        </label>
        <span className="v4-focus-control">
          <select
            id="v4-focus-task"
            className="v4-field v4-focus-select"
            value={timer.boundTaskId}
            disabled={isBreak}
            onChange={event => timer.setBoundTaskId(event.target.value)}
          >
            <option value="">不绑定（自由专注）</option>
            {board.tasks
              .filter(task => !task.done)
              .map(task => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
          </select>
        </span>
      </div>
      <p className="v4-focus-note">
        可以在专注过程中更换任务，归属以结束那一刻的绑定为准；任务被删除后，历史日志仍然保留时长与标题。
      </p>

      <div className="v4-focus-row">
        <span className="v4-focus-label">休息</span>
        <span className="v4-focus-control v4-focus-breaks">
          <label className="v4-focus-check">
            <input
              type="checkbox"
              checked={settings.breakEnabled}
              onChange={event => patch({ breakEnabled: event.target.checked })}
            />
            完成后可进入休息
          </label>
          <label className="v4-focus-inline">
            短休
            <input
              className="v4-field v4-focus-number"
              type="number"
              min={1}
              max={30}
              value={settings.shortBreakMinutes}
              aria-label="短休分钟"
              onChange={event => patch({ shortBreakMinutes: clampBreakMinutes(parseIntegerInput(event.target.value) ?? settings.shortBreakMinutes, 5) })}
            />
          </label>
          <label className="v4-focus-inline">
            长休
            <input
              className="v4-field v4-focus-number"
              type="number"
              min={1}
              max={30}
              value={settings.longBreakMinutes}
              aria-label="长休分钟"
              onChange={event => patch({ longBreakMinutes: clampBreakMinutes(parseIntegerInput(event.target.value) ?? settings.longBreakMinutes, 15) })}
            />
          </label>
          <label className="v4-focus-inline">
            每
            <input
              className="v4-field v4-focus-number"
              type="number"
              min={2}
              max={8}
              value={settings.roundsBeforeLongBreak}
              aria-label="几轮后长休"
              onChange={event => patch({ roundsBeforeLongBreak: Math.max(2, Math.min(8, parseIntegerInput(event.target.value) ?? settings.roundsBeforeLongBreak)) })}
            />
            轮长休
          </label>
        </span>
      </div>

      <div className="v4-focus-row">
        <span className="v4-focus-label">最近</span>
        <span className="v4-focus-control v4-focus-recent">
          {focusLogs.length === 0 ? (
            <span className="v4-focus-note">还没有专注记录。完成第一轮后会出现在这里。</span>
          ) : (
            <ul className="v4-focus-recent-list">
              {focusLogs.slice(0, 3).map((log: SessionLog) => (
                <li key={log.id}>
                  <button
                    type="button"
                    className="v4-focus-recent-row"
                    onClick={() => workspace.openDetail({ kind: 'day', id: dayKey(log.at), title: `${weekdayOfDayKey(dayKey(log.at))} · ${formatRelative(log.at)}` })}
                  >
                    <span className="v4-focus-recent-time">{formatRelative(log.at)}</span>
                    <span className="v4-focus-recent-title">{log.title}</span>
                    <span className="v4-focus-recent-min">{formatMinutes(log.minutes ?? 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      </div>

      <p className="v4-focus-note">
        计时以时间戳为准：切后台、刷新、睡眠恢复都不会让钟走偏；结束记的是实际时长，不足 1 分钟不写入。
        自动采集的会话记录不会计入专注分钟。
      </p>
      {saveError === null ? null : (
        <p className="v4-focus-error" role="alert">
          {saveError}
        </p>
      )}
    </div>
  )

  return (
    <ExpandablePanel
      id="focus"
      title="专注"
      meta={`今天 ${formatMinutes(todayLogs.reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0))}`}
      hint="时长 · 任务 · 休息"
      actions={
        <span className="v4-focus-state-chip" data-status={timer.status}>
          {timer.statusLabel}
        </span>
      }
      summary={
        <>
          {compact}
          <p className="v4-focus-foot">
            今天 {todayLogs.length} 段 · 本周 {formatMinutes(week)} · 近 7 日活跃 {weekActive} 天
          </p>
        </>
      }
      detail={details}
    />
  )
}
