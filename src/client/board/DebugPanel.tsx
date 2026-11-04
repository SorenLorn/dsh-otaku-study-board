/**
 * DebugPanel — 折叠的【调试 & 自测】面板（V3，默认收起）。
 *
 * 存在的意义：Harness 自动采集、斜杠命令、上下文统计、项目隔离这些链路都没法靠
 * 「在聊天里反复发真消息」来验证（宿主事件通道在当前构建里可能是空的）。这里给
 * 一组**直接投递**的按钮，而且全部走真实管线：
 *
 *   • 模拟消息 → window 桥 → 防抖 → 去重 → 分类 → 归属 → 落库；
 *   • 模拟命令 → `sorchron:command` → useSlashCommand → 真实执行；
 *   • 模拟上下文 → 连续投递 N 条消息，验证 token 统计与膨胀预警；
 *   • 注入脏数据 → 真的往列表里塞坏记录，再用「运行清理」验证 sanitizeAll。
 *
 * 九个控件对应 TESTING.md 的自测清单（见附 A）。
 */
import { useCallback, useEffect, useState } from 'react'
import { emitHarnessEvent } from '../hooks/useHarnessEvent'
import { useBackup } from '../hooks/useBackup'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { readStore } from '../hooks/useLocalStore'
import { useStorageQuota, formatBytes } from '../hooks/useStorageQuota'
import { getCaptureState, pushNotice, subscribeCapture, type CaptureState } from '../lib/bus'
import { BOARD_CONFIG } from '../lib/config'
import { info, warn } from '../lib/debug'
import { SCHEMA_VERSION, sanitizeAll } from '../lib/schema'
import { createDefaultSettings, createDefaultTimerState } from '../lib/defaults'
import { formatMinutes } from '../lib/time'
import {
  STORAGE_KEYS,
  type BoardMeta,
  type BoardSettings,
  type FrictionRecord,
  type Project,
  type SessionLog,
  type Task,
  type TimerPersistedState,
} from '../types'
import { useConfirm } from '../ui/ConfirmDialog'

/** 状态灯颜色。 */
const STATUS_COLOR: Record<CaptureState['status'], string> = {
  on: 'var(--osb-ok)',
  off: 'var(--osb-text-3)',
  error: 'var(--osb-danger)',
}

const STATUS_LABEL: Record<CaptureState['status'], string> = {
  on: '监听开启',
  off: '监听关闭',
  error: '监听异常',
}

/** 模拟用的 TSX 代码块：会命中「代码开发」。 */
const SAMPLE_CODE = [
  '```tsx',
  'export function useDemoCounter(initial: number) {',
  '  const [count, setCount] = useState(initial)',
  '  return { count, bump: () => setCount(value => value + 1) }',
  '}',
  '```',
].join('\n')

/** 模拟用的报错文本：会命中「排错调试」，并沉淀一条阻碍记录。 */
const SAMPLE_ERROR = [
  'TypeError: Cannot read properties of undefined (reading "map")',
  '    at TaskList (board/TaskList.tsx:42:18)',
  '    at renderWithHooks (react-dom.development.js:14985:18)',
].join('\n')

/** 模拟上下文用的句子池：长度不一，便于观察 token 估算。 */
const CONTEXT_SENTENCES = [
  '帮我看看 useTimer 里 deadline 的推导是不是有问题',
  '这里应该用 useEffect 还是 useLayoutEffect？',
  '把这段逻辑拆成一个纯函数，方便写断言',
  'TypeError: Cannot read properties of undefined (reading "length")',
  '重构一下这个组件，把 300 行拆到三个文件',
  '文档里说这个 API 已经废弃了，换成新的写法',
  '再加一条回归用例，覆盖空数组的情况',
  '这个方案的取舍是什么？为什么不用 IndexedDB',
]

export interface DebugPanelProps {
  sessionId?: string
}

export function DebugPanel({ sessionId }: DebugPanelProps) {
  const board = useBoardData()
  const { settings } = useBoardSettings()
  const backup = useBackup()
  const confirm = useConfirm()
  const quota = useStorageQuota(`${board.allTasks.length}:${board.allLogs.length}`)

  const [capture, setCapture] = useState<CaptureState>(() => getCaptureState())
  const [commandText, setCommandText] = useState('/board-todo 自测：验证斜杠命令')
  const [contextCount, setContextCount] = useState(20)

  useEffect(() => subscribeCapture(() => setCapture(getCaptureState())), [])

  /** 把当前 store 完整打到控制台，并报一下每个键的原始体积。 */
  const printStore = useCallback(() => {
    try {
      const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        storageKeys: STORAGE_KEYS,
        tasks: readStore<Task[]>(STORAGE_KEYS.tasks, []),
        logs: readStore<SessionLog[]>(STORAGE_KEYS.logs, []),
        projects: readStore<Project[]>(STORAGE_KEYS.projects, []),
        friction: readStore<FrictionRecord[]>(STORAGE_KEYS.friction, []),
        settings: readStore<BoardSettings>(STORAGE_KEYS.settings, createDefaultSettings()),
        timer: readStore<TimerPersistedState>(STORAGE_KEYS.timer, createDefaultTimerState()),
        meta: readStore<BoardMeta>(STORAGE_KEYS.meta, { sessionTaskMap: {} }),
      }
      const sizes: Record<string, string> = {}
      for (const key of Object.values(STORAGE_KEYS)) {
        try {
          const raw = window.localStorage.getItem(key)
          sizes[key] = raw === null ? '(空)' : `${raw.length} 字符`
        } catch {
          sizes[key] = '(不可读)'
        }
      }
      console.log(`${BOARD_CONFIG.logPrefix}: [debug] store snapshot`, snapshot)
      console.log(`${BOARD_CONFIG.logPrefix}: [debug] raw sizes`, sizes)
      pushNotice('已把当前存储输出到控制台（含原始体积）', 'info')
    } catch (error) {
      warn('debug', 'print store failed', error)
      pushNotice('输出存储失败，详见控制台', 'error')
    }
  }, [])

  /** 往真实管线里投一条模拟事件。 */
  const simulate = useCallback(
    (kind: 'code' | 'error') => {
      if (!settings.autoCapture) {
        pushNotice('监听开关是关闭的，先到「开发会话日志」打开再试', 'warn')
        return
      }
      const payload =
        kind === 'code'
          ? { text: SAMPLE_CODE, sessionTitle: 'sorchron 自测 · 代码块', sessionId }
          : { text: SAMPLE_ERROR, sessionTitle: 'sorchron 自测 · 报错', sessionId }
      const ok = emitHarnessEvent(kind === 'code' ? 'debug/code-block' : 'debug/error', payload)
      if (!ok) {
        pushNotice('投递失败：当前环境没有 window，事件桥不可用', 'error')
        return
      }
      console.log(`${BOARD_CONFIG.logPrefix}: [debug] simulated event dispatched`, payload)
      pushNotice('已投递模拟事件，约 100ms 后出现在会话日志里', 'success')
    },
    [settings.autoCapture, sessionId],
  )

  /** 项目切换模拟：在「全部 / 项目 A / 项目 B」之间循环，并打印各自条数。 */
  const simulateProjectSwitch = useCallback(() => {
    const ids = ['', ...board.projects.filter(item => !item.archived).map(item => item.id)]
    if (ids.length <= 1) {
      pushNotice('还没有项目，先新建一个再测隔离', 'warn')
      return
    }
    const index = ids.indexOf(board.activeProjectId)
    const next = ids[(index + 1) % ids.length] ?? ''
    board.setActiveProject(next)
    const name = next === '' ? '全部项目' : board.projects.find(item => item.id === next)?.name ?? next
    const tasks = next === '' ? board.allTasks.length : board.allTasks.filter(t => t.projectId === next).length
    const logs = next === '' ? board.allLogs.length : board.allLogs.filter(l => l.projectId === next).length
    info('debug', `project switched to ${name}: ${tasks} tasks / ${logs} logs`)
    pushNotice(`已切到「${name}」：${tasks} 个任务 / ${logs} 条日志（验证隔离）`, 'info')
  }, [board])

  /** 斜杠命令模拟：走和聊天里输入完全相同的入口。 */
  const simulateCommand = useCallback(() => {
    try {
      window.dispatchEvent(
        new CustomEvent(BOARD_CONFIG.commands.bridgeEvent, { detail: { text: commandText } }),
      )
      pushNotice(`已投递命令：${commandText}`, 'info')
    } catch (error) {
      warn('debug', 'command bridge failed', error)
      pushNotice('命令投递失败，详见控制台', 'error')
    }
  }, [commandText])

  /** 上下文模拟：连续投递 N 条消息（限速 8/s，避免被自身限流丢掉）。 */
  const simulateContext = useCallback(() => {
    if (!settings.autoCapture) {
      pushNotice('监听开关是关闭的，先打开再模拟上下文', 'warn')
      return
    }
    const total = Math.max(1, Math.min(200, contextCount))
    for (let index = 0; index < total; index += 1) {
      const text = CONTEXT_SENTENCES[index % CONTEXT_SENTENCES.length] ?? '自测消息'
      const role = index % 3 === 2 ? 'assistant' : 'user'
      const payload: Record<string, unknown> = {
        text: `${text}（#${index + 1}）`,
        role,
        sessionTitle: 'sorchron 自测 · 上下文',
      }
      if (sessionId !== undefined) payload.sessionId = sessionId
      // 每 5 条塞一个代码块，让「代码块占比」动起来。
      if (index % 5 === 4) payload.text = `${text}（#${index + 1}）\n${SAMPLE_CODE}`
      window.setTimeout(() => emitHarnessEvent('debug/context', payload), index * 120)
    }
    pushNotice(`已排队 ${total} 条模拟消息（约 ${Math.ceil((total * 120) / 1000)} 秒投完）`, 'info')
  }, [settings.autoCapture, contextCount, sessionId])

  /** 注入脏数据：NaN 时长、空标题、非法时间戳、类型错。 */
  const injectDirty = useCallback(() => {
    const now = Date.now()
    const dirtyTasks = [
      { id: 'dirty-t1', title: '   ', done: false, pomodoros: 0, createdAt: now, updatedAt: now },
      { id: 'dirty-t2', title: 'NaN 时长的任务', done: false, pomodoros: -5, focusedMinutes: Number.NaN, createdAt: now, updatedAt: now },
      { id: 'dirty-t3', title: '未来时间戳', done: false, pomodoros: 0, createdAt: now + 86400000 * 400, updatedAt: now },
    ] as unknown as Task[]
    const dirtyLogs = [
      { id: 'dirty-l1', at: Number.NaN, kind: 'weird', title: 'NaN 时间', source: 'auto', edited: false },
      { id: 'dirty-l2', at: -1, kind: 'focus', title: '负数时间', minutes: -30, source: 'manual', edited: false },
      { id: 'dirty-l3', at: now, kind: 'message', title: '', source: 'auto', edited: false },
    ] as unknown as SessionLog[]
    const dirtyFriction = [
      { id: 'dirty-f1', at: now, updatedAt: now, summary: '', hits: -2, resolved: 'yes' },
    ] as unknown as FrictionRecord[]

    board.setTasks(previous => [...dirtyTasks, ...previous])
    board.setLogs(previous => [...dirtyLogs, ...previous])
    board.setFriction(previous => [...dirtyFriction, ...previous])
    pushNotice('已注入 7 条脏数据（空标题 / NaN / 负数 / 非法类型），现在点「运行清理」', 'warn')
    console.log(`${BOARD_CONFIG.logPrefix}: [debug] dirty records injected`, { dirtyTasks, dirtyLogs, dirtyFriction })
  }, [board])

  /** 运行清理：sanitizeAll 洗一遍当前内存里的列表。 */
  const runSanitize = useCallback(() => {
    try {
      const result = sanitizeAll({
        tasks: board.allTasks,
        logs: board.allLogs,
        friction: board.allFriction,
      })
      board.setTasks(result.tasks)
      board.setLogs(result.logs)
      board.setFriction(result.friction)
      const message =
        result.report.dropped === 0
          ? `数据干净：任务 ${result.report.tasks} / 日志 ${result.report.logs} / 阻碍 ${result.report.friction}`
          : `已清理 ${result.report.dropped} 条脏记录，剩余 任务 ${result.report.tasks} / 日志 ${result.report.logs} / 阻碍 ${result.report.friction}`
      info('debug', message, result.report)
      pushNotice(message, result.report.dropped === 0 ? 'info' : 'success')
    } catch (error) {
      warn('debug', 'sanitize failed', error)
      pushNotice('清理失败，详见控制台', 'error')
    }
  }, [board])

  const clearDev = useCallback(() => {
    confirm.ask(
      {
        title: '清空本地存储（开发专用）？',
        description:
          '会把任务、日志、项目、阻碍、设置、计时状态全部抹掉，效果等同于全新安装。仅用于反复测试；正常使用请走「数据备份」里的导出。',
        confirmLabel: '确认清空',
        cancelLabel: '算了',
        tone: 'danger',
      },
      () => {
        const outcome = backup.clearAll()
        pushNotice(outcome.message, outcome.ok ? 'warn' : 'error')
      },
    )
  }, [backup, confirm])

  return (
    <details className="osb-collapse">
      <summary className="osb-collapse-head">
        调试 &amp; 自测
        <span className="osb-collapse-meta">
          开发专用 · schema v{SCHEMA_VERSION} · {formatBytes(quota.bytes)}
        </span>
      </summary>

      <div className="osb-collapse-body">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--osb-text-2)' }}
        >
          <span
            aria-hidden="true"
            data-capture-status={capture.status}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: STATUS_COLOR[capture.status],
              flex: '0 0 auto',
            }}
          />
          <span style={{ fontWeight: 500 }}>{STATUS_LABEL[capture.status]}</span>
          <span style={{ color: 'var(--osb-text-3)' }}>{capture.detail}</span>
        </div>

        <div className="osb-data-actions">
          <button type="button" className="osb-btn" onClick={printStore}>
            打印当前全部存储
          </button>
          <button type="button" className="osb-btn" onClick={() => simulate('code')}>
            模拟代码消息
          </button>
          <button type="button" className="osb-btn" onClick={() => simulate('error')}>
            模拟报错消息
          </button>
          <button type="button" className="osb-btn" onClick={simulateProjectSwitch}>
            模拟项目切换
          </button>
        </div>

        <div className="osb-data-actions" style={{ marginTop: 6 }}>
          <input
            className="osb-input"
            style={{ minWidth: 220, flex: 1 }}
            value={commandText}
            aria-label="模拟斜杠命令"
            onChange={event => setCommandText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') simulateCommand()
            }}
          />
          <button type="button" className="osb-btn" onClick={simulateCommand}>
            触发命令
          </button>
          <button
            type="button"
            className="osb-btn osb-btn-ghost"
            onClick={() => setCommandText('/board-report')}
          >
            /board-report
          </button>
          <button
            type="button"
            className="osb-btn osb-btn-ghost"
            onClick={() => setCommandText('/board-bind 自测')}
          >
            /board-bind
          </button>
        </div>

        <div className="osb-data-actions" style={{ marginTop: 6 }}>
          <select
            className="osb-select"
            value={contextCount}
            aria-label="模拟消息条数"
            onChange={event => setContextCount(Number(event.target.value))}
          >
            <option value={10}>10 条</option>
            <option value={20}>20 条</option>
            <option value={45}>45 条（触发预警）</option>
            <option value={90}>90 条（触发红线）</option>
          </select>
          <button type="button" className="osb-btn" onClick={simulateContext}>
            模拟会话上下文
          </button>
          <button type="button" className="osb-btn" onClick={injectDirty}>
            注入脏数据
          </button>
          <button type="button" className="osb-btn" onClick={runSanitize}>
            运行清理
          </button>
          <button type="button" className="osb-btn osb-btn-danger" onClick={clearDev}>
            清空本地存储（开发专用）
          </button>
        </div>

        <p className="osb-hint">
          所有模拟都走真实链路（window 桥 → 防抖 → 内容哈希去重 → 分类 → 项目/任务归属 → 落库），
          所以监听关闭时不会有任何反应 —— 这本身就是验收点。控制台过滤
          <code> {BOARD_CONFIG.logPrefix}:</code> 可看全部细节。
        </p>

        <p className="osb-hint" style={{ marginBottom: 0 }}>
          当前作用域：{board.activeProject?.name ?? '全部项目'} · 任务 {board.allTasks.length} · 日志{' '}
          {board.allLogs.length} · 阻碍 {board.allFriction.length} · 本周专注{' '}
          {formatMinutes(
            board.logs
              .filter(log => log.kind === 'focus' && Date.now() - log.at < 7 * 86400000)
              .reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0),
          )}
        </p>
      </div>

      {confirm.dialog}
    </details>
  )
}
