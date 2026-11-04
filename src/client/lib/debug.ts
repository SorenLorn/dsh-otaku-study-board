/**
 * Debug logging — one prefix, one switch.
 *
 * 每条日志都以 `SorchronBoard V3:` 开头（需求 §五.2），方便在满是插件的控制台里
 * 一眼筛出来，也方便虚拟机里排错时把整段贴出来：
 *
 *     SorchronBoard V3: [capture] channel bound: window (1 listeners)
 *
 * 三级，语义固定，不要混用：
 *   debug → `console.debug`  逐事件细节、去重命中、图表入参（默认折叠）
 *   info  → `console.info`   生命周期里程碑（通道绑定、备份、计时开始/结束）
 *   warn  → `console.warn`   可恢复问题（单条解析失败、写入被拒、导入被拒）
 *   error → `console.error`  **只在真的不该发生时用**：未捕获的兜底分支。
 *                             正常路径里不该出现红色日志（验收标准 §六.6）。
 *
 * 这里任何函数都不会抛错：没有 console 的环境（headless / 受限页）不能因为
 * 打日志把渲染搞崩。
 */
import { BOARD_CONFIG } from './config'

export const LOG_PREFIX = `${BOARD_CONFIG.logPrefix}:`

type Level = 'debug' | 'info' | 'warn' | 'error'

function safeCall(level: Level, scope: string, message: string, data?: unknown): void {
  try {
    const label = `${LOG_PREFIX} [${scope}] ${message}`
    const fn = console[level]
    if (typeof fn !== 'function') return
    if (data === undefined) fn.call(console, label)
    else fn.call(console, label, data)
  } catch {
    /* console unavailable or frozen — stay silent */
  }
}

/** 逐事件细节；信息量大但默认不一定显示。 */
export function debug(scope: string, message: string, data?: unknown): void {
  safeCall('debug', scope, message, data)
}

/** 生命周期里程碑。 */
export function info(scope: string, message: string, data?: unknown): void {
  safeCall('info', scope, message, data)
}

/** 可恢复问题：单条消息解析失败、写入被拒、导入被拒。 */
export function warn(scope: string, message: string, data?: unknown): void {
  safeCall('warn', scope, message, data)
}

/**
 * 兜底分支专用。
 *
 * 只在「理论上不可能发生」的地方用（例如 React 边界、未捕获的异步分支）。
 * 业务上的可预期失败一律用 warn —— 否则控制台全是红色，验收时没法判断
 * 「到底有没有真问题」。
 */
export function error(scope: string, message: string, data?: unknown): void {
  safeCall('error', scope, message, data)
}
