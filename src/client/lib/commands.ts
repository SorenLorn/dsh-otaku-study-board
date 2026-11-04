/**
 * commands.ts — 斜杠命令的纯解析层（可单独断言，不依赖 React）。
 *
 * 解析规则刻意做得极窄：只认 `/board-todo` `/board-bind` `/board-report` 三条，
 * 其余一律返回 `null`（当作普通消息处理）。不做通用命令框架，原因是：
 *   • 我们无法确认宿主是否也把 `/xxx` 当命令，抢注别人的前缀会互相打架；
 *   • 只服务看板自己的三个动作，范围越窄越不会误伤。
 *
 * 命令名大小写不敏感（`/BOARD-TODO` 也认），参数保留原始大小写与空格。
 */
import { BOARD_CONFIG } from './config'

export interface ParsedCommand {
  /** 小写命令名，含前缀，如 `/board-todo`。 */
  name: string
  /** 去掉首尾空白后的参数。 */
  args: string
}

/** 命令提示（面板里列出来，用户不用记）。 */
export const SLASH_HELP: ReadonlyArray<{ name: string; usage: string; description: string }> = [
  { name: '/board-todo', usage: '/board-todo 写一份自测清单', description: '快速新建一条待办，落在当前项目' },
  { name: '/board-bind', usage: '/board-bind 自测清单', description: '把当前会话绑定到某个任务，之后采集自动归属' },
  { name: '/board-report', usage: '/board-report', description: '生成今日开发简报' },
]

/** 是否是本插件认识的命令名。 */
export function isKnownCommand(name: string): boolean {
  return (BOARD_CONFIG.commands.prefixes as readonly string[]).includes(name.toLowerCase())
}

/**
 * 从一段文本里解析命令名与参数。
 * @returns `null` 表示「不是本插件的命令」
 */
export function parseCommand(text: string): ParsedCommand | null {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  // 命令名到第一个空白为止；参数是剩下的部分（可能为空）。
  const match = /^(\/[A-Za-z0-9_-]+)\s*([\s\S]*)$/.exec(trimmed)
  if (match === null) return null
  const name = (match[1] ?? '').toLowerCase()
  if (!isKnownCommand(name)) return null
  return { name, args: (match[2] ?? '').trim() }
}
