/**
 * Harness event → board log entry. 纯函数，不碰 React，不碰存储。
 *
 * 这是采集链路的「识别」半边；`hooks/useSessionCapture.ts` 是「传输 + 去重 +
 * 落库」半边。分开的好处是下面的规则可以在没有 DOM 的环境里跑断言
 * （scripts/smoke.ts 就是这么测的）。
 *
 * ── 隐私边界（重要，V3 依旧）──────────────────────────────────────────────
 * 代码原文、图片、二进制**永不进入存储**：
 *   • 代码块只在内存里量一下（语言 / 行数 / 字符数 / 疑似文件名 / 函数名），
 *     然后立刻丢弃；`SessionLog` 里只留一行摘要。
 *   • 超过 `maxChars` 的块只记长度，不再尝试描述。
 *   • 图片 / 附件 / base64 在 `normalizeHarnessEvent` 就被识别并跳过，连长度都不记。
 * 这条边界写在返回类型上（`LogDraft` 没有存放源码的字段），不是靠调用方自觉。
 */
import type { HarnessEvent, ProjectRule, SessionLog, SessionType } from '../types'
import { BOARD_CONFIG } from './config'

/** 超过这个字符数的代码块只记长度，不再尝试描述。 */
export const MAX_CODE_CHARS = BOARD_CONFIG.code.maxChars

/** 同一条记录在这个窗口内重复出现时合并，而不是新增一行。 */
export const DEDUPE_WINDOW_MS = BOARD_CONFIG.capture.mergeWindowMs

/** 这些扩展名 / MIME 一律当二进制处理，不解析。 */
const BINARY_HINT_RE =
  /(?:data:(?:image|audio|video|application\/octet-stream)[\w/+.-]*;base64|\.(?:png|jpe?g|gif|webp|bmp|ico|pdf|zip|gz|mp4|mov|mp3|wav|woff2?|ttf|exe|dll)\b)/i

/**
 * 报错 / 排错信号。优先级最高：贴了报错又贴了代码，算排错而不是开发。
 * V3 补了更多真实堆栈的形态（`at xxx (file:line:col)`、`ERR_`、`status 500`）。
 */
const DEBUG_RE =
  /(error|exception|stack ?trace|traceback|throw |failed to|cannot read|is not a function|undefined is not|null is not|unhandled|uncaught|ERR_[A-Z]+|status (?:4|5)\d\d|报错|异常|崩溃|失败|调试|排查|修复 ?bug|\bbug\b)/i

/** 重构信号：结构变了但功能不变。 */
const REFACTOR_RE =
  /(重构|refactor|重写|抽离|提取(?:公共|函数|组件)|拆分(?:文件|模块|函数)|整理代码|代码整理|解耦|简化|rename|extract|split)/i

/** 方案 / 架构讨论。 */
const DESIGN_RE =
  /(架构|设计|方案|规划|需求|选型|拆解|排期|架构图|architecture|design|roadmap|proposal|schema|blueprint|spec)/i

/** 文档 / 教程 / 知识点查询。 */
const READING_RE =
  /(文档|教程|怎么用|如何使用|用法|知识点|原理|概念|区别|是什么|介绍一下|学习|doc|docs|guide|tutorial|how (do|to|does)|what is|difference|concept|reference)/i

/** Extension guessed for a language that has no obvious one. */
const EXT_BY_LANG: Record<string, string> = {
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  js: 'js',
  javascript: 'js',
  jsx: 'jsx',
  react: 'tsx',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  json: 'json',
  py: 'py',
  python: 'py',
  sh: 'sh',
  bash: 'sh',
  sql: 'sql',
  md: 'md',
  markdown: 'md',
  go: 'go',
  rs: 'rs',
  rust: 'rs',
  java: 'java',
  kt: 'kt',
  php: 'php',
}

/** 语言代号 → 展示名（摘要里用短名，避免长串挤爆一行）。 */
const LANG_LABEL: Record<string, string> = {
  ts: 'TS',
  typescript: 'TS',
  tsx: 'TSX',
  js: 'JS',
  javascript: 'JS',
  jsx: 'JSX',
  react: 'React',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  vue: 'Vue',
  svelte: 'Svelte',
  json: 'JSON',
  py: 'Python',
  python: 'Python',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Shell',
  go: 'Go',
  rs: 'Rust',
  rust: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  php: 'PHP',
  md: 'Markdown',
}

/** One code block, measured while it is still in memory. */
export interface CodeBlock {
  lang: string
  chars: number
  lines: number
  /** 第一句有意义的注释 / 声明，用于一行描述。 */
  hint?: string
  /** 最佳猜测的文件名。 */
  fileName?: string
  /** V3：从代码里认出来的函数 / 类名。 */
  funcName?: string
}

/** Everything one harness event yields, after flattening. */
export interface NormalizedEvent {
  text: string
  codeBlocks: CodeBlock[]
  toolName?: string
  sessionTitle?: string
  sessionId?: string
  role?: string
  /** V3：这条事件里是否带图片 / 附件 / 二进制（带则整条跳过）。 */
  binary?: boolean
}

/** A log entry minus its id — the caller assigns one so lib stays pure. */
export type LogDraft = Omit<SessionLog, 'id'>

/* ────────────────────────────────────────────────────────────────────────────
 * Payload flattening
 * ──────────────────────────────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * 图片 / 附件 / base64 检测。
 *
 * 这些内容对「学了什么」毫无信息量，却能让 localStorage 一夜爆掉 —— 所以在
 * 进入任何解析逻辑之前就整条丢弃（需求 2.1.3）。
 */
function looksBinary(value: unknown, depth = 0): boolean {
  if (depth > 3 || value === null || value === undefined) return false
  if (typeof value === 'string') return BINARY_HINT_RE.test(value.slice(0, 200))
  if (Array.isArray(value)) return value.some(item => looksBinary(item, depth + 1))
  const record = asRecord(value)
  if (record === undefined) return false
  const type = typeof record.type === 'string' ? record.type.toLowerCase() : ''
  if (type.includes('image') || type.includes('file') || type.includes('attachment')) return true
  if (typeof record.mimeType === 'string' && /^(?:image|audio|video|application\/octet)/i.test(record.mimeType)) {
    return true
  }
  return Object.keys(record).some(key => /image|attachment|binary|blob/i.test(key) && record[key] !== null)
}

/** Pull readable text out of `string | Array<{type:'text',text}>` and friends. */
function pushText(target: string[], value: unknown, depth = 0): void {
  if (depth > 3 || value === null || value === undefined) return
  if (typeof value === 'string') {
    // 单条超长文本也是负担：留前 20000 字符足够分类与摘要。
    if (value.trim() !== '') target.push(value.slice(0, 20_000))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) pushText(target, item, depth + 1)
    return
  }
  const record = asRecord(value)
  if (record === undefined) return
  // 只认文本型内容块，跳过图片块。
  const type = typeof record.type === 'string' ? record.type.toLowerCase() : ''
  if (type === 'image' || type === 'input_image' || type === 'file') return
  pushText(target, record.text, depth + 1)
  pushText(target, record.content, depth + 1)
  pushText(target, record.delta, depth + 1)
}

/** 从代码里认函数 / 类名（只在前 300 字符里找，够用且不碰原文落盘）。 */
function readFuncName(snippet: string): string | undefined {
  const head = snippet.slice(0, BOARD_CONFIG.code.summaryChars)
  const patterns = [
    /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
    /def\s+([A-Za-z_$][\w$]*)\s*\(/,
    /fn\s+([A-Za-z_$][\w$]*)\s*\(/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(head)
    if (match?.[1] !== undefined) return match[1]
  }
  return undefined
}

/** Measure one block without keeping its body. */
function measureBlock(lang: string, body: string): CodeBlock {
  const normalisedLang = lang.trim().toLowerCase()
  const lines = body.split('\n')
  const block: CodeBlock = {
    lang: normalisedLang,
    chars: body.length,
    lines: lines.filter(line => line.trim() !== '').length,
  }
  // 只在前 300 字符的窗口里取特征，随后即丢（隐私边界）。
  const snippet = body.slice(0, BOARD_CONFIG.code.summaryChars)
  const funcName = readFuncName(snippet)
  if (funcName !== undefined) block.funcName = funcName
  if (block.chars <= MAX_CODE_CHARS) {
    block.hint = readHint(lines)
    block.fileName = guessFileName(body, normalisedLang)
  }
  return block
}

/** First comment line, else the first declaration, else nothing. */
function readHint(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 12)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('```')) continue
    const comment = /^(?:\/\/|#|\*|\/\*+)\s*(.+?)(?:\*\/)?$/.exec(line)
    if (comment !== null) {
      const text = comment[1]?.trim() ?? ''
      if (text !== '' && text.length > 3) return clip(text, 48)
      continue
    }
    const declaration = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (declaration !== null) return `定义 ${declaration[1] ?? ''}`
    break
  }
  return undefined
}

/** Greedy but honest guess: an explicit path beats a declaration name. */
function guessFileName(body: string, lang: string): string | undefined {
  const extension = EXT_BY_LANG[lang] ?? 'txt'
  const head = body.slice(0, 400)
  const explicit = /(?:^|\s)([\w./-]+\.(?:tsx?|jsx?|css|html|json|py|sql|md|vue|svelte|go|rs|java|php))\b/.exec(head)
  if (explicit?.[1] !== undefined) return explicit[1]
  const declaration = /(?:function|class|const|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(head)
  if (declaration?.[1] !== undefined) return `${declaration[1]}.${extension}`
  return undefined
}

/** Fenced blocks inside a message body. */
function extractFences(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const pattern = /```([a-zA-Z0-9+#._-]*)[ \t]*\r?\n([\s\S]*?)```/g
  let match = pattern.exec(text)
  while (match !== null && blocks.length < BOARD_CONFIG.code.maxBlocks) {
    blocks.push(measureBlock(match[1] ?? '', match[2] ?? ''))
    match = pattern.exec(text)
  }
  return blocks
}

/** Flatten one raw harness event. */
export function normalizeHarnessEvent(event: HarnessEvent): NormalizedEvent {
  const payload = asRecord(event.payload)
  const message = asRecord(payload?.message)

  const texts: string[] = []
  pushText(texts, payload?.text)
  pushText(texts, payload?.content)
  pushText(texts, payload?.delta)
  pushText(texts, payload?.input)
  pushText(texts, payload?.output)
  pushText(texts, message?.content)
  const text = texts.join('\n').trim()

  const blocks: CodeBlock[] = []
  for (const candidate of [payload?.code, payload?.source, payload?.codeText]) {
    const code = asString(candidate)
    if (code !== undefined) {
      const lang = asString(payload?.language) ?? asString(payload?.lang) ?? ''
      blocks.push(measureBlock(lang, code))
    }
  }
  if (blocks.length === 0) blocks.push(...extractFences(text))

  const normalized: NormalizedEvent = { text, codeBlocks: blocks }
  if (looksBinary(payload)) {
    normalized.binary = true
    // 二进制内容连文本都不要：整条不参与分类与落库。
    normalized.text = ''
    normalized.codeBlocks = []
  }
  const toolName = asString(payload?.tool) ?? asString(payload?.toolName)
  if (toolName !== undefined) normalized.toolName = toolName
  const sessionTitle = asString(payload?.sessionTitle) ?? asString(payload?.title)
  if (sessionTitle !== undefined) normalized.sessionTitle = sessionTitle
  const sessionId = asString(payload?.sessionId) ?? event.sessionId
  if (sessionId !== undefined) normalized.sessionId = sessionId
  const role = asString(payload?.role) ?? asString(message?.role)
  if (role !== undefined) normalized.role = role
  return normalized
}

/* ────────────────────────────────────────────────────────────────────────────
 * Classification
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 判定会话类型。顺序是刻意排的：
 *   1. 报错 → 排错调试（贴了报错又贴代码，那是排错，不是开发）
 *   2. 重构词 → 代码重构（结构变了功能没变）
 *   3. 有代码块 → 代码开发
 *   4. 方案词 → 方案架构
 *   5. 文档词 → 文档查阅
 *   6. 其余 → 其他
 */
export function classifySession(text: string, blocks: CodeBlock[]): SessionType {
  if (text !== '' && DEBUG_RE.test(text)) return 'debug'
  if (text !== '' && REFACTOR_RE.test(text)) return 'refactor'
  if (blocks.length > 0) return 'dev'
  if (text !== '' && DESIGN_RE.test(text)) return 'design'
  if (text !== '' && READING_RE.test(text)) return 'reading'
  return 'other'
}

/** Title-only signals: a task called「调试 useTimer」should not land in 其他. */
const TITLE_DEBUG_RE = /(调试|排错|修复|bug|error|报错|异常|崩溃)/i
const TITLE_REFACTOR_RE = /(重构|整理代码|抽离|拆分|简化)/i
const TITLE_DESIGN_RE = /(架构|设计|方案|规划|选型)/i
const TITLE_READING_RE = /(文档|教程|阅读|学习|英语|原理|笔记|查阅)/i
const TITLE_DEV_RE = /(开发|编码|实现|插件|项目|react|typescript|javascript|\bts\b|\bjs\b|css|html|sql)/i

/** 任务标题 / 日志标题 → 会话类型（计时结束时没有正文可分析）。 */
export function classifyTitle(title: string): SessionType {
  if (title === '') return 'other'
  if (TITLE_DEBUG_RE.test(title)) return 'debug'
  if (TITLE_REFACTOR_RE.test(title)) return 'refactor'
  if (TITLE_DESIGN_RE.test(title)) return 'design'
  if (TITLE_READING_RE.test(title)) return 'reading'
  if (TITLE_DEV_RE.test(title)) return 'dev'
  return 'other'
}

/* ────────────────────────────────────────────────────────────────────────────
 * Summaries
 * ──────────────────────────────────────────────────────────────────────────── */

/** Clip a string to `limit` characters, adding an ellipsis only when cut. */
export function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, Math.max(0, limit - 1))}…`
}

/** Strip the markdown noise that makes a title unreadable. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`{1,3}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `TSX · 42 行 · useTimer.tsx`. */
export function summarizeCodeBlock(block: CodeBlock): string {
  const label = LANG_LABEL[block.lang] ?? (block.lang === '' ? '代码' : block.lang.toUpperCase())
  const parts = [label, `${block.lines} 行`]
  const name = block.fileName ?? (block.funcName === undefined ? undefined : `${block.funcName}()`)
  if (name !== undefined) parts.push(name)
  return parts.join(' · ')
}

/** The `detail` line stored for a code entry — never the code itself. */
export function describeCodeBlock(block: CodeBlock): string {
  if (block.chars > MAX_CODE_CHARS) {
    return `未保存源码 · 超长已截断（${block.chars} 字符）`
  }
  const base = block.hint ?? '未命名的代码片段'
  const func = block.funcName === undefined ? '' : ` · ${block.funcName}()`
  return `${base}${func} · 未保存源码（${block.chars} 字符）`
}

/** First readable line of a message, markdown stripped. */
export function summarizeMessage(text: string): string {
  const first = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line !== '' && !line.startsWith('```'))
  return clip(stripMarkdown(first ?? text), 60)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Project auto-binding
 * ──────────────────────────────────────────────────────────────────────────── */

/** 默认关键词 → 项目规则。用户可以改，改完不用重新部署。 */
export const DEFAULT_PROJECT_RULES: ProjectRule[] = [
  { id: 'rule-dsh-plugin', keyword: 'dsh', project: 'DSH 插件开发' },
  { id: 'rule-sorchron', keyword: 'sorchron', project: '溯时工作台' },
  { id: 'rule-react', keyword: 'react', project: '前端学习' },
  { id: 'rule-english', keyword: '英语', project: '英语学习' },
]

/**
 * 规则匹配（V3：支持正则 + 命中规则原样返回）。
 *
 * 为什么返回整条规则而不是名字：调用方需要 `projectId`（严格隔离）和
 * `project`（展示名）两样东西，只返回名字会逼调用方再查一次。
 *
 * 匹配顺序 = 规则顺序 = 优先级。单条正则写错不能影响其它规则。
 */
export function matchProjectRule(text: string, rules: ProjectRule[]): ProjectRule | undefined {
  if (text.trim() === '') return undefined
  for (const rule of rules) {
    const keyword = rule.keyword.trim()
    if (keyword === '') continue
    try {
      if (rule.regex === true) {
        // 正则按不区分大小写编译；用户写错就是这条规则失效，不抛给上层。
        if (new RegExp(keyword, 'i').test(text)) return rule
      } else if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return rule
      }
    } catch {
      continue
    }
  }
  return undefined
}

/** 兼容 V2 的调用形态：只要项目名。 */
export function matchProject(text: string, rules: ProjectRule[]): string | undefined {
  return matchProjectRule(text, rules)?.project
}

/** 从一段文本里把这些规则用到的关键词都抽出来（用于「为什么归到这个项目」）。 */
export function explainProjectHit(text: string, rules: ProjectRule[]): string | undefined {
  const rule = matchProjectRule(text, rules)
  if (rule === undefined) return undefined
  return `${rule.regex === true ? '正则' : '关键词'}「${rule.keyword}」→ ${rule.project}`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Assembly
 * ──────────────────────────────────────────────────────────────────────────── */

export interface BuildLogOptions {
  rules: ProjectRule[]
  now?: number
  /** V3：会话绑定到任务时，把 taskId 一起写进去。 */
  taskId?: string
  /** V3：当前活跃项目的 id（自动归属到项目时用）。 */
  projectId?: string
  /** V3：用于估算 token（只存数字）。 */
  charsPerToken?: number
}

/**
 * Turn one normalised event into a log draft.
 *
 * @returns `undefined` when the event carries nothing worth a row（空 delta、纯工具
 *          记账、图片 / 二进制都在这里被丢掉，而不是污染列表）
 */
export function buildLogDraft(normalized: NormalizedEvent, options: BuildLogOptions): LogDraft | undefined {
  const { rules } = options
  const at = options.now ?? Date.now()
  const hasText = normalized.text !== ''
  const blocks = normalized.codeBlocks

  if (normalized.binary === true) return undefined
  if (!hasText && blocks.length === 0) return undefined

  const sessionType = classifySession(normalized.text, blocks)
  const primary = blocks[0]

  const title = primary !== undefined ? summarizeCodeBlock(primary) : summarizeMessage(normalized.text)
  if (title.trim() === '') return undefined

  const rule = matchProjectRule(`${normalized.sessionTitle ?? ''} ${normalized.text}`, rules)

  const draft: LogDraft = {
    at,
    kind: primary !== undefined ? 'code-block' : normalized.toolName !== undefined ? 'tool-call' : 'message',
    sessionType,
    title,
    source: 'auto',
    edited: false,
    hits: 1,
    role: normalized.toolName !== undefined ? 'tool' : normalized.role === 'assistant' ? 'assistant' : 'user',
  }
  if (primary !== undefined) draft.detail = clip(describeCodeBlock(primary), BOARD_CONFIG.code.maxDetailChars)
  if (rule !== undefined) {
    draft.project = rule.project
    if (rule.projectId !== undefined) draft.projectId = rule.projectId
  } else if (options.projectId !== undefined && options.projectId !== '') {
    // 没有命中规则时，归到当前活跃项目 —— 用户在看哪个项目，就是在做哪个项目。
    draft.projectId = options.projectId
  }
  if (options.taskId !== undefined && options.taskId !== '') draft.taskId = options.taskId
  if (normalized.sessionId !== undefined) draft.sessionId = normalized.sessionId

  // 估算 token（只留数字，不留原文）。
  const chars = normalized.text.length + blocks.reduce((sum, block) => sum + block.chars, 0)
  const perToken = options.charsPerToken ?? 1.7
  if (chars > 0 && perToken > 0) draft.tokens = Math.max(1, Math.round(chars / perToken))
  return draft
}

/**
 * De-duplication key（同一条记录合并用）。
 *
 * 注意与 `contentSignature` 的区别：这个 key 是「业务同一性」（同类型同项目同
 * 标题），用于 90 秒内合并成一行并累加 hits；contentSignature 是「内容指纹」，
 * 用于 5 分钟内同一条消息重复推送的硬去重。两者都要，缺一个就会出问题。
 */
export function dedupeKey(draft: LogDraft): string {
  return `${draft.sessionType ?? 'other'}|${draft.kind}|${draft.projectId ?? draft.project ?? ''}|${draft.title}`
}

/** 阻碍记录用的报错摘要：取第一行错误，去掉路径里的噪声。 */
export function summarizeError(text: string): string {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '')
  const first = lines.find(line => DEBUG_RE.test(line)) ?? lines[0] ?? ''
  return clip(
    first
      .replace(/\s+at\s+[\w$.<>]+\s*\([^)]*\)/g, '')
      .replace(/\([A-Za-z]:\\[^)]*\)/g, '')
      .replace(/\b\d{4,}\b/g, ''),
    140,
  )
}
