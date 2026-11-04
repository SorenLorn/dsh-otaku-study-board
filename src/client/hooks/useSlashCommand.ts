/**
 * useSlashCommand — 看板内三条斜杠命令（需求 3.2）。
 *
 * ── 为什么不是「真的注册到 DSH 命令面板」───────────────────────────────────
 * 当前发布版 DSH **没有对外公开命令注册 API**（在已安装的 dsh-context /
 * dshmarket / dsh-better-sidebar 里都找不到 `commands.register` 这类标识符）。
 * 硬去猜一个不存在的接口，只会得到一个「代码写着注册、实际什么都不发生」的
 * 假功能。所以这里做成三条**真实可触发**的通道，从上到下依次尝试：
 *
 *   1. **宿主命令面（可选）**：`ctx.get('commands')` / `ctx.commands` 若存在且
 *      有 `register`，就把三条命令注册进去（宿主哪天提供了就自动生效）；
 *   2. **聊天消息捕获**：宿主把用户消息转发给采集链路时，`/board-todo ...`
 *      这种以命令开头的消息会被这里消费掉（`tryHandle`），并写一条执行日志；
 *   3. **window 桥**：`window.dispatchEvent(new CustomEvent('sorchron:command',
 *      { detail: { text: '/board-report' } }))` —— 调试面板的模拟按钮、以及任何
 *      外部适配层都用这条。
 *
 * 三条通道共用同一个 `execute()`，所以行为完全一致。
 *
 * ── /board-report 的边界 ──────────────────────────────────────────────────
 * 插件无权往 DSH 会话里插消息。因此报告是：面板展示 + 自动复制到剪贴板 + 写一条
 * 里程碑日志，用户自己决定要不要贴回对话。不假装能「输出到当前对话」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClientCtx, ProjectRule, SessionLog, Task } from '../types'
import { STORAGE_KEYS } from '../types'
import { BOARD_CONFIG, BACKUP_SCOPE_LABELS } from '../lib/config'
import { info, warn } from '../lib/debug'
import { SLASH_HELP, parseCommand } from '../lib/commands'
import { createId } from './useLocalStore'
import { useBoardData } from './useBoardData'
import { useBoardSettings } from './useBoardSettings'
import { computeBoardStats, focusMinutesOn, overdueStats } from '../lib/stats'
import { projectRanking } from '../lib/projects'
import { frictionStats, formatDuration } from '../lib/friction'
import { analyzeContext } from '../lib/context'
import { clampInteger, sanitizeTitle } from '../lib/validate'
import { dayKey, formatMinutes } from '../lib/time'

/** 命令执行结果，UI 直接渲染。 */
export interface CommandResult {
  name: string
  ok: boolean
  /** 一行结论（提示条 / 面板标题）。 */
  message: string
  /** 多行正文（报告、候选列表），可选。 */
  detail?: string
  at: number
}

export interface SlashCommandApi {
  /** 最近一次执行结果（null = 还没执行过）。 */
  result: CommandResult | null
  clear: () => void
  /** 解析并执行一段文本；不是命令时返回 null。 */
  execute: (text: string, sessionId?: string) => CommandResult | null
  /**
   * 采集链路用：如果这段文本是命令就执行并返回 true（表示「已消费，别再当普通
   * 消息记录」）。
   */
  tryHandle: (text: string, sessionId?: string) => boolean
  /** 已注册到的通道（调试面板显示）。 */
  channel: 'host' | 'bridge'
}

export function useSlashCommand(ctx?: ClientCtx, sessionId?: string): SlashCommandApi {
  const board = useBoardData()
  const { settings } = useBoardSettings()
  const [result, setResult] = useState<CommandResult | null>(null)

  /** 回调里读最新数据，避免闭包拿到旧列表。 */
  const ref = useRef({ board, settings, sessionId })
  ref.current = { board, settings, sessionId }

  const appendLog = useCallback(
    (title: string, detail: string, sid: string | undefined) => {
      const current = ref.current
      const entry: SessionLog = {
        id: createId('log'),
        at: Date.now(),
        kind: 'milestone',
        sessionType: 'other',
        title,
        detail,
        source: 'manual',
        edited: false,
      }
      if (current.board.activeProjectId !== '') {
        entry.projectId = current.board.activeProjectId
        entry.project = current.board.activeProject?.name
      }
      if (sid !== undefined && sid !== '') entry.sessionId = sid
      current.board.setLogs(previous => [entry, ...previous].slice(0, BOARD_CONFIG.storage.logSoftLimit))
    },
    [],
  )

  /** `/board-todo`：新建一条待办。 */
  const runTodo = useCallback(
    (args: string, sid?: string): CommandResult => {
      const current = ref.current
      const title = sanitizeTitle(args, 120)
      if (title === '') {
        return {
          name: '/board-todo',
          ok: false,
          message: '用法：/board-todo 任务标题',
          at: Date.now(),
        }
      }
      const now = Date.now()
      const task: Task = {
        id: createId('task'),
        title,
        status: 'todo',
        done: false,
        pomodoros: 0,
        focusedMinutes: 0,
        estimateMinutes: clampInteger(current.settings.lastDurationMinutes, 5, 240, 25),
        priority: 'normal',
        createdAt: now,
        updatedAt: now,
      }
      if (current.board.activeProjectId !== '') task.projectId = current.board.activeProjectId
      current.board.setTasks(previous => [task, ...previous])
      const where =
        current.board.activeProjectId === ''
          ? '未归属项目'
          : current.board.activeProject?.name ?? '当前项目'
      const message = `已添加「${title}」→ ${where}`
      if (BOARD_CONFIG.commands.logExecutions) appendLog('/board-todo', message, sid)
      info('command', message)
      return { name: '/board-todo', ok: true, message, at: now }
    },
    [appendLog],
  )

  /** `/board-bind`：把当前会话绑到某个任务。 */
  const runBind = useCallback(
    (args: string, sid?: string): CommandResult => {
      const current = ref.current
      const now = Date.now()
      const targetSession = sid !== undefined && sid !== '' ? sid : current.sessionId
      if (targetSession === undefined || targetSession === '') {
        return {
          name: '/board-bind',
          ok: false,
          message: '拿不到当前会话 id，无法绑定（可先在日志里随便记一条再试）',
          at: now,
        }
      }

      const query = args.trim().toLowerCase()
      const open = current.board.tasks.filter(task => !task.done)
      if (open.length === 0) {
        return { name: '/board-bind', ok: false, message: '当前项目还没有未完成的任务', at: now }
      }

      // 匹配顺序：精确 id → 标题完全相等 → 标题包含。
      const match =
        open.find(task => task.id === args.trim()) ??
        open.find(task => task.title.toLowerCase() === query) ??
        (query === '' ? undefined : open.find(task => task.title.toLowerCase().includes(query)))

      if (match === undefined) {
        const preview = open.slice(0, 5).map(task => `· ${task.title}`)
        return {
          name: '/board-bind',
          ok: false,
          message: query === '' ? '用法：/board-bind 任务标题（或任务 id）' : `没找到匹配「${args.trim()}」的任务`,
          detail: preview.length > 0 ? `可绑定的任务：\n${preview.join('\n')}` : undefined,
          at: now,
        }
      }

      current.board.setMeta(previous => ({
        ...previous,
        sessionTaskMap: { ...previous.sessionTaskMap, [targetSession]: match.id },
      }))
      current.board.setTasks(previous =>
        previous.map(task => (task.id === match.id ? { ...task, sessionId: targetSession, updatedAt: now } : task)),
      )
      const message = `会话已绑定「${match.title}」，之后采集的日志都归到它下面`
      if (BOARD_CONFIG.commands.logExecutions) appendLog('/board-bind', message, targetSession)
      info('command', message)
      return { name: '/board-bind', ok: true, message, at: now }
    },
    [appendLog],
  )

  /** `/board-report`：今日开发简报。 */
  const runReport = useCallback(
    (sid?: string): CommandResult => {
      const current = ref.current
      const now = Date.now()
      const today = dayKey(now)
      const stats = computeBoardStats(current.board.tasks, current.board.logs, now)
      const focus = focusMinutesOn(current.board.logs, today)
      const overdue = overdueStats(current.board.tasks, now)
      const sessionLogs = current.board.logs.filter(log => dayKey(log.at) === today)
      const context = analyzeContext(sessionLogs, {
        warnMessages: current.settings.contextWarnMessages,
        dangerMessages: current.settings.contextDangerMessages,
      })
      const frictions = frictionStats(current.board.friction)
      const ranking = projectRanking(
        current.board.allLogs,
        current.board.allTasks,
        current.board.projects,
        current.board.activeProjectId,
      ).slice(0, 3)

      const lines: string[] = []
      lines.push(`【今日开发简报 · ${today}】`)
      lines.push(
        `专注：${formatMinutes(focus)}${
          current.settings.monthlyGoal.targetMinutes > 0
            ? `（月目标 ${formatMinutes(current.settings.monthlyGoal.targetMinutes)}）`
            : ''
        }`,
      )
      lines.push(
        `任务：今日完成 ${stats.tasksDoneToday} / 共 ${stats.tasksTotal}${overdue.overdue > 0 ? `，逾期 ${overdue.overdue}` : ''}`,
      )
      lines.push(`会话：${context.messages} 条 · 约 ${formatTokens(context.tokens)} · ${context.verdict.replace(/^\d+ 条消息 \/ /, '')}`)
      if (context.slices.length > 0) {
        const totalTokens = context.slices.reduce((sum, slice) => sum + slice.tokens, 0)
        const parts = context.slices
          .slice()
          .sort((a, b) => b.tokens - a.tokens)
          .slice(0, 3)
          .map(slice => `${slice.label} ${totalTokens === 0 ? 0 : Math.round((slice.tokens / totalTokens) * 100)}%`)
        lines.push(`构成：${parts.join(' / ')}`)
      }
      lines.push(
        `阻碍：本周 ${frictions.weekHits} 次 · 未解决 ${frictions.open} 条${
          frictions.avgResolveMs > 0 ? ` · 平均定位 ${formatDuration(frictions.avgResolveMs)}` : ''
        }`,
      )
      if (ranking.length > 0) {
        lines.push('项目：' + ranking.map(row => `${row.name}（${formatMinutes(row.minutes)}）`).join(' · '))
      }
      if (stats.streakDays > 0) lines.push(`连续学习：${stats.streakDays} 天`)

      const detail = lines.join('\n')
      const message = `今日简报已生成（${formatMinutes(focus)} 专注 / ${stats.tasksDoneToday} 个完成）`

      // 复制到剪贴板是 best-effort：失败不影响生成。
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
          void navigator.clipboard.writeText(detail).catch(() => undefined)
        }
      } catch {
        /* 剪贴板不可用（无 https / 无权限）—— 报告仍在面板里 */
      }

      if (BOARD_CONFIG.commands.logExecutions) appendLog('/board-report', message, sid)
      info('command', message)
      return { name: '/board-report', ok: true, message, detail, at: now }
    },
    [appendLog],
  )

  const execute = useCallback(
    (text: string, sid?: string): CommandResult | null => {
      try {
        const parsed = parseCommand(text)
        if (parsed === null) return null
        let outcome: CommandResult
        if (parsed.name === '/board-todo') outcome = runTodo(parsed.args, sid)
        else if (parsed.name === '/board-bind') outcome = runBind(parsed.args, sid)
        else outcome = runReport(sid)
        setResult(outcome)
        return outcome
      } catch (error) {
        warn('command', 'command failed', error)
        const outcome: CommandResult = {
          name: 'unknown',
          ok: false,
          message: '命令执行失败，详见控制台',
          at: Date.now(),
        }
        setResult(outcome)
        return outcome
      }
    },
    [runTodo, runBind, runReport],
  )

  const tryHandle = useCallback(
    (text: string, sid?: string): boolean => {
      if (parseCommand(text) === null) return false
      execute(text, sid)
      return true
    },
    [execute],
  )

  /** 通道 1：宿主若提供命令面就注册（没有就静默跳过）。 */
  const [channel, setChannel] = useState<'host' | 'bridge'>('bridge')
  useEffect(() => {
    if (!BOARD_CONFIG.features.slashCommands) return
    const commands = (() => {
      try {
        const fromCtx = ctx === undefined ? undefined : (ctx as { commands?: unknown }).commands
        if (typeof fromCtx === 'object' && fromCtx !== null) return fromCtx as { register?: unknown }
        const service = ctx?.get('commands')
        if (typeof service === 'object' && service !== null) return service as { register?: unknown }
      } catch {
        /* 宿主没有这个服务 —— 走桥 */
      }
      return undefined
    })()

    if (commands !== undefined && typeof commands.register === 'function') {
      const register = commands.register as (command: {
        name: string
        description?: string
        run: (args: string) => unknown
      }) => unknown
      try {
        for (const helper of SLASH_HELP) {
          register({
            name: helper.name.replace(/^\//, ''),
            description: helper.description,
            run: (args: string) => execute(`${helper.name} ${args}`, sessionId),
          })
        }
        setChannel('host')
        info('command', 'registered on host command surface')
        return
      } catch (error) {
        warn('command', 'host command registration failed — falling back to bridge', error)
      }
    }
    setChannel('bridge')
  }, [ctx, execute, sessionId])

  /** 通道 3：window 桥。 */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onCommand = (event: Event): void => {
      try {
        const detail = (event as CustomEvent<{ text?: unknown; name?: unknown; args?: unknown }>).detail
        if (detail === null || detail === undefined) return
        if (typeof detail.text === 'string') {
          execute(detail.text, sessionId)
          return
        }
        if (typeof detail.name === 'string') {
          const args = typeof detail.args === 'string' ? detail.args : ''
          execute(`${detail.name} ${args}`.trim(), sessionId)
        }
      } catch (error) {
        warn('command', 'bridge command failed', error)
      }
    }
    window.addEventListener(BOARD_CONFIG.commands.bridgeEvent, onCommand)
    return () => {
      window.removeEventListener(BOARD_CONFIG.commands.bridgeEvent, onCommand)
    }
  }, [execute, sessionId])

  /** 清理：会话切换时把上一条结果收掉，避免误导。 */
  useEffect(() => {
    setResult(null)
  }, [sessionId])

  const clear = useCallback(() => setResult(null), [])

  return useMemo(
    () => ({ result, clear, execute, tryHandle, channel }),
    [result, clear, execute, tryHandle, channel],
  )
}

export { parseCommand, SLASH_HELP }

/** `12345` → `12.3k`。 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens} tok`
  const value = tokens / 1000
  return value >= 100 ? `${Math.round(value)}k tok` : `${value.toFixed(1)}k tok`
}

/** 给 UI 的规则提示：当前有哪些自动归属规则。 */
export function describeRules(rules: ProjectRule[]): string {
  if (rules.length === 0) return '没有自动归属规则，采集的日志会落在当前项目'
  return rules
    .slice(0, 4)
    .map(rule => `${rule.regex === true ? `/${rule.keyword}/` : rule.keyword}→${rule.project}`)
    .join(' · ')
}

/** 备份范围提示（DataPanel 复用，避免两处文案不一致）。 */
export function scopeHint(scope: keyof typeof BACKUP_SCOPE_LABELS): string {
  return BACKUP_SCOPE_LABELS[scope]
}

/** 存储键常量再导出，组件不必再 import 两层。 */
export { STORAGE_KEYS }
