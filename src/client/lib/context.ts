/**
 * context.ts — 会话上下文观测（需求 3.1，对标 dsh-context 的轻量化实现）。
 *
 * ── 口径：只统计，不读原文 ────────────────────────────────────────────────
 * 本模块的输入是**已经落库的日志摘要**（每条 title / detail / tokens），不是 DSH
 * 会话的原始消息。所以它天然满足「只做统计，不读取完整原文」：
 *   • token 优先用采集时估算好的 `log.tokens`；
 *   • 没有时按 title + detail 的字符数 / 1.7 反推；
 *   • 全程不出现源码、不出现消息正文。
 *
 * 「一键精简会话」也**不篡改 DSH 原生会话**：它只生成一份「建议保留 / 建议折叠」
 * 的操作日志（`buildPrunePlan`），由用户自己决定要不要照着做。这是需求里明确
 * 要求的边界 —— 插件没有权限、也不该去改宿主的会话记录。
 */
import type { ContextSlice, ContextStats, SessionLog } from '../types'
import { BOARD_CONFIG } from './config'

/** 粗略 token 估算（中英混排）。只用于「够不够撑爆上下文」这种数量级判断。 */
export function estimateTokens(text: string): number {
  if (text === '') return 0
  return Math.max(1, Math.round(text.length / BOARD_CONFIG.context.charsPerToken))
}

/** 一条日志的 token：优先用采集时的估算值。 */
export function logTokens(log: SessionLog): number {
  if (typeof log.tokens === 'number' && log.tokens > 0) return log.tokens
  const text = `${log.title} ${log.detail ?? ''}`
  return estimateTokens(text)
}

/** 归到哪一类：用户 / 模型 / 工具 / 代码 / 报错。优先级从具体到笼统。 */
export function sliceKeyOf(log: SessionLog): ContextSlice['key'] {
  if (log.sessionType === 'debug' || log.kind === 'friction') return 'error'
  if (log.kind === 'code-block') return 'code'
  if (log.kind === 'tool-call' || log.role === 'tool') return 'tool'
  if (log.role === 'assistant') return 'assistant'
  return 'user'
}

const SLICE_LABELS: Record<ContextSlice['key'], string> = {
  user: '我的提问',
  assistant: '模型回复',
  tool: '工具调用',
  code: '代码块',
  error: '报错信息',
}

export interface ContextOptions {
  /** 消息条数预警线（settings 可覆盖）。 */
  warnMessages?: number
  dangerMessages?: number
}

/**
 * 计算当前会话的上下文画像。
 *
 * @param logs - **只传当前会话**的日志（调用方按 sessionId 过滤）
 * @param now - 注入时间，便于测试
 */
export function analyzeContext(logs: SessionLog[], options: ContextOptions = {}, now = Date.now()): ContextStats {
  void now
  const recent = [...logs].sort((a, b) => a.at - b.at).slice(-BOARD_CONFIG.context.maxMessages)

  const buckets = new Map<ContextSlice['key'], { count: number; tokens: number }>()
  let chars = 0
  let tokens = 0
  let codeBlocks = 0
  let errorMessages = 0

  for (const log of recent) {
    const key = sliceKeyOf(log)
    const tokenCount = logTokens(log)
    const bucket = buckets.get(key) ?? { count: 0, tokens: 0 }
    buckets.set(key, { count: bucket.count + 1, tokens: bucket.tokens + tokenCount })
    tokens += tokenCount
    chars += (log.title.length + (log.detail?.length ?? 0))
    if (log.kind === 'code-block') codeBlocks += 1
    if (key === 'error') errorMessages += 1
  }

  const slices: ContextSlice[] = (['user', 'assistant', 'tool', 'code', 'error'] as const)
    .map(key => {
      const bucket = buckets.get(key) ?? { count: 0, tokens: 0 }
      return { key, label: SLICE_LABELS[key], count: bucket.count, tokens: bucket.tokens }
    })
    .filter(slice => slice.count > 0)

  const messages = recent.length
  const warnMessages = options.warnMessages ?? BOARD_CONFIG.context.warnMessages
  const dangerMessages = options.dangerMessages ?? BOARD_CONFIG.context.dangerMessages

  let level: ContextStats['level'] = 'ok'
  if (messages >= dangerMessages || tokens >= BOARD_CONFIG.context.dangerTokens) level = 'danger'
  else if (messages >= warnMessages || tokens >= BOARD_CONFIG.context.warnTokens) level = 'warn'

  const suggestions: string[] = []
  if (level === 'danger') {
    suggestions.push('上下文已经偏重：建议开新会话，把「已确认的结论」贴过去继续。')
  } else if (level === 'warn') {
    suggestions.push('消息条数接近上限：可以先把历史里的重复调试折叠掉。')
  }
  if (codeBlocks >= 30) {
    suggestions.push(`代码块 ${codeBlocks} 个：大段代码建议放进文件，对话里只留结论。`)
  }
  if (errorMessages >= 10) {
    suggestions.push(`报错 ${errorMessages} 条：已重复的问题可以合并成一个「阻碍记录」。`)
  }
  if (suggestions.length === 0) {
    suggestions.push('上下文健康，没有需要处理的历史。')
  }

  return {
    messages,
    tokens,
    chars,
    slices,
    codeBlocks,
    errorMessages,
    level,
    verdict: verdictOf(level, messages, tokens),
    suggestions,
    pruneCandidates: countPruneCandidates(recent),
  }
}

function verdictOf(level: ContextStats['level'], messages: number, tokens: number): string {
  const size = tokens >= 1000 ? `${Math.round(tokens / 1000)}k tok` : `${tokens} tok`
  if (level === 'danger') return `${messages} 条消息 / 约 ${size}，上下文已接近溢出`
  if (level === 'warn') return `${messages} 条消息 / 约 ${size}，注意继续膨胀`
  return `${messages} 条消息 / 约 ${size}，空间充足`
}

/**
 * 可以精简掉多少条：
 *
 * 规则很保守 —— 只数「重复」和「旧调试」。没把握的一律不数。
 *   1. 同标题重复出现的，除第一条外都算候选；
 *   2. 超过保留窗口的 `debug` 记录算候选。
 */
export function countPruneCandidates(logs: SessionLog[]): number {
  const seen = new Set<string>()
  let candidates = 0
  const keep = BOARD_CONFIG.context.keepRecent

  for (let index = 0; index < logs.length; index += 1) {
    const log = logs[index]
    if (log === undefined) continue
    const key = `${log.sessionType ?? 'other'}|${log.title}`
    if (seen.has(key)) {
      candidates += 1
      continue
    }
    seen.add(key)
    // 越靠近开头的越旧：窗口之外的调试记录算候选。
    if (index < logs.length - keep && log.sessionType === 'debug') candidates += 1
  }
  return candidates
}

export interface PrunePlan {
  /** 保留的条数。 */
  keep: number
  /** 建议折叠的条数。 */
  fold: number
  /** 一份可以直接贴回对话的摘要（不是对宿主会话的修改）。 */
  summary: string
  /** 生成的「操作日志」正文，写进看板日志用。 */
  logDetail: string
}

/**
 * 生成精简计划（**不改 DSH 会话**）。
 *
 * 输出是给人看的两段文字：
 *   • `summary`：可以贴到新会话里继续工作的上下文摘要；
 *   • `logDetail`：一次性操作日志，说明「建议折叠多少条、保留什么」。
 */
export function buildPrunePlan(logs: SessionLog[], now = Date.now()): PrunePlan {
  const ordered = [...logs].sort((a, b) => a.at - b.at)
  const keepCount = Math.max(0, Math.min(BOARD_CONFIG.context.keepRecent, ordered.length))
  const kept = ordered.slice(-keepCount)
  const folded = ordered.slice(0, ordered.length - keepCount)

  const lines: string[] = ['【会话摘要 · 建议贴到新会话继续】']
  // 待办与阻碍优先：这两类才是「继续工作」真正需要的东西。
  const openDebug = kept.filter(log => log.sessionType === 'debug').slice(-3)
  if (openDebug.length > 0) {
    lines.push('最近的问题：')
    for (const log of openDebug) lines.push(`- ${log.title}`)
  }
  const highlights = kept
    .filter(log => log.kind !== 'focus')
    .slice(-6)
    .map(log => `- ${log.title}`)
  if (highlights.length > 0) {
    lines.push('最近推进：')
    lines.push(...highlights)
  }
  if (lines.length === 1) lines.push('- （本会话还没有可提炼的记录）')

  return {
    keep: kept.length,
    fold: folded.length,
    summary: lines.join('\n'),
    logDetail: `保留最近 ${kept.length} 条，建议折叠 ${folded.length} 条（${new Date(now).toLocaleString('zh-CN')} 生成）`,
  }
}
