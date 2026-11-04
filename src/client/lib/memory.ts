/**
 * memory.ts — 项目记忆（V4「跨会话记忆中心」的核心数据逻辑）。
 *
 * ── 与「项目快照」的区别（别混）──────────────────────────────────────────
 *   快照（snapshot.ts） = 某个时刻的**导出物**：任务 + 阻碍 + 日志标题，用来搬家；
 *   记忆（本文件）       = 一份**活文档**：简介 / 技术栈 / 架构 / 进度 / 决策 / 下一步，
 *                          用来喂给 AI、生成新会话提示词、做历史对比。
 *
 * ── 一条不可让步的规则 ────────────────────────────────────────────────────
 * AI / 日志生成的只能是**草稿**（`MemoryDraft`），必须用户逐条勾选后
 * `acceptDraft` 才能写进 `ProjectMemory`。没有任何函数允许「AI 直接改主文档」。
 */
import type {
  Decision,
  FrictionRecord,
  MemoryDraft,
  ProjectMemory,
  SessionLog,
  Task,
} from '../types'
import { BOARD_CONFIG } from './config'
import { taskFocusMinutes } from './stats'

/** 空记忆（版本从 1 开始，便于历史对比时判断「有没有变过」）。 */
export function createEmptyMemory(projectId: string, now = Date.now()): ProjectMemory {
  return {
    projectId,
    intro: '',
    stack: [],
    architecture: '',
    done: [],
    progress: '',
    openIssues: [],
    resolvedIssues: [],
    decisions: [],
    nextSteps: [],
    updatedAt: now,
    version: 1,
    source: 'manual',
  }
}

/** 取某项目的记忆。 */
export function memoryOf(list: ProjectMemory[], projectId: string): ProjectMemory | undefined {
  return list.find(item => item.projectId === projectId)
}

/** 插入或替换（按 projectId 唯一定位）。 */
export function upsertMemory(list: ProjectMemory[], memory: ProjectMemory): ProjectMemory[] {
  const index = list.findIndex(item => item.projectId === memory.projectId)
  if (index < 0) return [...list, memory]
  return list.map((item, i) => (i === index ? memory : item))
}

/** 数组合并：去重、保序、限长。 */
function mergeList(base: string[], addition: string[] | undefined, limit: number): string[] {
  if (addition === undefined || addition.length === 0) return base
  const seen = new Set(base)
  const out = [...base]
  for (const item of addition) {
    // 运行时再挡一次：草稿补丁已清洗，但调用方可能自己拼数组。
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

/**
 * 把一份补丁合并进记忆，并 +1 版本。
 *
 * 数组字段是**追加去重**，不是覆盖 —— 记忆是长期累积的，覆盖会丢掉历史成果；
 * 字符串字段是「非空才替换」，空串不能被 AI 的空白回答冲掉。
 */
export function applyMemoryPatch(
  memory: ProjectMemory,
  patch: MemoryDraft['patch'],
  source: ProjectMemory['source'],
  now = Date.now(),
): ProjectMemory {
  const limit = BOARD_CONFIG.memory.maxItems
  const next: ProjectMemory = {
    ...memory,
    stack: mergeList(memory.stack, patch.stack, 30),
    done: mergeList(memory.done, patch.done, limit),
    openIssues: mergeList(memory.openIssues, patch.openIssues, limit),
    resolvedIssues: mergeList(memory.resolvedIssues, patch.resolvedIssues, limit),
    nextSteps: mergeList(memory.nextSteps, patch.nextSteps, 60),
    decisions: mergeDecisions(memory.decisions, patch.decisions),
    updatedAt: now,
    version: memory.version + 1,
    source,
  }
  if (patch.intro !== undefined && patch.intro.trim() !== '') next.intro = patch.intro.trim().slice(0, 600)
  if (patch.architecture !== undefined && patch.architecture.trim() !== '') {
    next.architecture = patch.architecture.trim().slice(0, 4000)
  }
  if (patch.progress !== undefined && patch.progress.trim() !== '') {
    next.progress = patch.progress.trim().slice(0, 800)
  }

  // 没有任何实质变化时不要递增版本：否则「点一次采纳但什么都没勾」也会让
  // version +1，历史对比里就会多出一堆「有变化」的假信号（审计 G2）。
  if (isSameContent(memory, next)) return memory
  return next
}

/** 只比较业务字段，忽略 updatedAt / version / source。 */
function isSameContent(before: ProjectMemory, after: ProjectMemory): boolean {
  if (before.intro !== after.intro) return false
  if (before.architecture !== after.architecture) return false
  if (before.progress !== after.progress) return false
  const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((item, index) => item === b[index])
  if (!sameList(before.stack, after.stack)) return false
  if (!sameList(before.done, after.done)) return false
  if (!sameList(before.openIssues, after.openIssues)) return false
  if (!sameList(before.resolvedIssues, after.resolvedIssues)) return false
  if (!sameList(before.nextSteps, after.nextSteps)) return false
  const key = (list: Decision[]): string => list.map(item => `${item.status}:${item.text}`).join('\u0000')
  return key(before.decisions) === key(after.decisions)
}

function mergeDecisions(base: Decision[], addition: Decision[] | undefined): Decision[] {
  if (addition === undefined || addition.length === 0) return base
  const seen = new Set(base.map(item => item.text))
  const out = [...base]
  for (const item of addition) {
    const text = item.text.trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push({ ...item, text })
    if (out.length >= 60) break
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * 从日志生成草稿（不调用 AI，纯规则）
 * ──────────────────────────────────────────────────────────────────────────── */

/** 常见技术词：用于从标题里猜技术栈（只是建议，用户可以改）。 */
const STACK_HINTS: ReadonlyArray<{ keyword: RegExp; label: string }> = [
  { keyword: /react|jsx|tsx|hook/i, label: 'React' },
  { keyword: /typescript|\bts\b/i, label: 'TypeScript' },
  { keyword: /javascript|\bjs\b/i, label: 'JavaScript' },
  { keyword: /node|express|koa/i, label: 'Node.js' },
  { keyword: /next\.?js/i, label: 'Next.js' },
  { keyword: /vue/i, label: 'Vue' },
  { keyword: /css|scss|tailwind/i, label: 'CSS' },
  { keyword: /sql|mysql|postgres|sqlite/i, label: 'SQL' },
  { keyword: /python|django|flask/i, label: 'Python' },
  { keyword: /rust|cargo/i, label: 'Rust' },
  { keyword: /go\b|golang/i, label: 'Go' },
  { keyword: /cordis|dsh|esbuild/i, label: 'DSH 插件' },
]

export interface DraftInput {
  projectId: string
  projectName?: string
  tasks: Task[]
  logs: SessionLog[]
  friction: FrictionRecord[]
  now?: number
}

/**
 * 根据当前项目的数据生成一份**可审阅的**记忆草稿。
 *
 * 只做四件事，全部有据可查：
 *   1. 已完成任务 → `done`
 *   2. 未解决阻碍 → `openIssues`
 *   3. 已解决阻碍（带方案）→ `resolvedIssues`
 *   4. 未完成任务 → `nextSteps`
 * 技术栈是**按关键词猜的**，所以在 rationale 里明确写出来。
 *
 * @returns 没有任何可提取内容时返回 `undefined`（不产出空草稿）
 */
export function buildDraftFromLogs(input: DraftInput): MemoryDraft | undefined {
  const now = input.now ?? Date.now()
  const projectTasks = input.tasks.filter(task => (task.projectId ?? '') === input.projectId)
  const projectFriction = input.friction.filter(item => (item.projectId ?? '') === input.projectId)
  const projectLogs = input.logs.filter(log => (log.projectId ?? '') === input.projectId)

  const doneTasks = projectTasks
    .filter(task => task.done && task.completedAt !== undefined)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 8)
  const openTasks = projectTasks
    .filter(task => !task.done)
    .sort((a, b) => {
      // 越紧急越靠前：有截止的优先，其次按优先级。
      if (a.dueAt !== undefined && b.dueAt === undefined) return -1
      if (b.dueAt !== undefined && a.dueAt === undefined) return 1
      return 0
    })
    .slice(0, 5)
  const openFriction = projectFriction.filter(item => !item.resolved).slice(0, 8)
  const solvedFriction = projectFriction.filter(item => item.resolved && item.solution !== undefined).slice(0, 6)

  const items: MemoryDraft['items'] = []
  for (const task of doneTasks) items.push({ field: 'done', text: task.title, accepted: false })
  for (const record of openFriction) items.push({ field: 'openIssues', text: record.summary, accepted: false })
  for (const record of solvedFriction) {
    items.push({ field: 'resolvedIssues', text: `${record.summary} → ${record.solution ?? ''}`.trim(), accepted: false })
  }
  for (const task of openTasks) items.push({ field: 'nextSteps', text: task.title, accepted: false })

  // 技术栈：从项目名 + 标题里猜。
  const haystack = [input.projectName ?? '', ...projectTasks.map(task => task.title), ...projectLogs.map(log => log.title)].join(' ')
  const stack: string[] = []
  for (const hint of STACK_HINTS) {
    if (hint.keyword.test(haystack) && !stack.includes(hint.label)) stack.push(hint.label)
    if (stack.length >= 6) break
  }
  for (const label of stack) items.push({ field: 'stack', text: label, accepted: false })

  if (items.length === 0) return undefined

  const patch: MemoryDraft['patch'] = {}
  if (stack.length > 0) patch.stack = stack

  const focusTotal = projectLogs
    .filter(log => log.kind === 'focus')
    .reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0)
  const taskMinutes = projectTasks.reduce((sum, task) => sum + taskFocusMinutes(task), 0)

  return {
    projectId: input.projectId,
    at: now,
    source: 'logs',
    patch,
    rationale: `根据 ${projectTasks.length} 个任务、${projectFriction.length} 条阻碍、${projectLogs.length} 条日志生成；累计专注 ${focusTotal || taskMinutes} 分钟。技术栈是按关键词推测的，请核对。`,
    items,
  }
}

/**
 * 草稿里被勾选的条目 → 一份可合并的补丁。
 *
 * 用 switch 而不是「动态字段名 + push」：后者在联合类型上会把 `string[]` 与
 * `Decision[]` 混在一起，类型系统无法收窄，也容易在运行时把决策塞成字符串。
 */
export function acceptDraft(draft: MemoryDraft, acceptedOnly = true): MemoryDraft['patch'] {
  const patch: MemoryDraft['patch'] = {}
  for (const item of draft.items) {
    if (acceptedOnly && !item.accepted) continue
    switch (item.field) {
      case 'done':
        patch.done = [...(patch.done ?? []), item.text]
        break
      case 'openIssues':
        patch.openIssues = [...(patch.openIssues ?? []), item.text]
        break
      case 'resolvedIssues':
        patch.resolvedIssues = [...(patch.resolvedIssues ?? []), item.text]
        break
      case 'nextSteps':
        patch.nextSteps = [...(patch.nextSteps ?? []), item.text]
        break
      case 'stack':
        patch.stack = [...(patch.stack ?? []), item.text]
        break
      case 'intro':
        patch.intro = item.text
        break
      case 'architecture':
        patch.architecture = item.text
        break
      case 'progress':
        patch.progress = item.text
        break
      case 'decisions': {
        const list: Decision[] = patch.decisions ?? []
        list.push({ id: `decision-${draft.at}-${list.length}`, at: draft.at, text: item.text, status: 'active' })
        patch.decisions = list
        break
      }
      default:
        break
    }
  }
  return patch
}

/* ────────────────────────────────────────────────────────────────────────────
 * 导出：Markdown 与「新会话提示词」
 * ──────────────────────────────────────────────────────────────────────────── */

function section(title: string, body: string): string {
  if (body.trim() === '') return ''
  return `## ${title}\n${body.trim()}\n`
}

/** 记忆 → Markdown（可导出的完整文档）。 */
export function memoryToMarkdown(memory: ProjectMemory, projectName: string): string {
  const lines: string[] = [`# ${projectName} · 项目记忆`, '']
  lines.push(`> 版本 v${memory.version} · 更新于 ${new Date(memory.updatedAt).toLocaleString('zh-CN')}`, '')

  const parts = [
    section('项目简介', memory.intro),
    section('技术栈', memory.stack.map(item => `- ${item}`).join('\n')),
    section('架构', memory.architecture),
    section('当前进度', memory.progress),
    section('已完成', memory.done.map(item => `- ${item}`).join('\n')),
    section('未解决问题', memory.openIssues.map(item => `- ${item}`).join('\n')),
    section('已解决问题', memory.resolvedIssues.map(item => `- ${item}`).join('\n')),
    section(
      '技术决策',
      memory.decisions
        .map(item => `- ${item.status === 'superseded' ? '~~' : ''}${item.text}${item.status === 'superseded' ? '~~' : ''}`)
        .join('\n'),
    ),
    section('下一步', memory.nextSteps.map(item => `- ${item}`).join('\n')),
  ].filter(item => item !== '')

  return (lines.join('\n') + parts.join('\n')).trim()
}

/**
 * 记忆 → 新会话提示词（喂给 ChatGPT / Codex / 任何 AI 编程工具的上下文）。
 *
 * 刻意做成「可直接粘贴的一段话 + 结构」：先角色与目标，再事实，再约束，
 * 最后是「下一步」。不包含任何日志原文或源码。
 */
export function memoryToPrompt(memory: ProjectMemory, projectName: string): string {
  const lines: string[] = []
  lines.push(`我在继续开发「${projectName}」。下面是我整理的项目上下文，请基于它给我建议或代码。`)
  lines.push('')
  if (memory.intro !== '') lines.push(`【项目简介】${memory.intro}`)
  if (memory.stack.length > 0) lines.push(`【技术栈】${memory.stack.join('、')}`)
  if (memory.architecture !== '') lines.push(`【架构】${memory.architecture}`)
  if (memory.progress !== '') lines.push(`【当前进度】${memory.progress}`)
  if (memory.done.length > 0) lines.push(`【已完成】\n${memory.done.slice(0, 10).map(item => `- ${item}`).join('\n')}`)
  if (memory.openIssues.length > 0) {
    lines.push(`【未解决问题】\n${memory.openIssues.slice(0, 10).map(item => `- ${item}`).join('\n')}`)
  }
  if (memory.resolvedIssues.length > 0) {
    lines.push(`【已解决问题】\n${memory.resolvedIssues.slice(0, 8).map(item => `- ${item}`).join('\n')}`)
  }
  const active = memory.decisions.filter(item => item.status === 'active')
  if (active.length > 0) lines.push(`【已定技术决策】\n${active.slice(0, 8).map(item => `- ${item.text}`).join('\n')}`)
  if (memory.nextSteps.length > 0) {
    lines.push(`【下一步想做的】\n${memory.nextSteps.slice(0, 6).map(item => `- ${item}`).join('\n')}`)
  }
  lines.push('')
  lines.push('约束：不要重复已经解决的问题；如果我的需求与已有决策冲突，先指出冲突再给方案。')

  const text = lines.join('\n')
  const limit = BOARD_CONFIG.memory.maxPromptChars
  return text.length <= limit ? text : `${text.slice(0, limit - 20)}\n…（已截断）`
}

/** 用于历史快照的紧凑摘要（只留可以对比的部分）。 */
export function memoryDigest(memory: ProjectMemory | undefined): {
  intro: string
  stack: string[]
  decisions: string[]
} {
  if (memory === undefined) return { intro: '', stack: [], decisions: [] }
  return {
    intro: memory.intro.slice(0, 300),
    stack: [...memory.stack],
    decisions: memory.decisions.filter(item => item.status === 'active').map(item => item.text),
  }
}

/** 记忆完成度（0–1）：用于列表上的小进度条，纯展示，不参与统计。 */
export function memoryCompleteness(memory: ProjectMemory | undefined): number {
  if (memory === undefined) return 0
  const checks = [
    memory.intro.trim() !== '',
    memory.stack.length > 0,
    memory.architecture.trim() !== '',
    memory.progress.trim() !== '',
    memory.done.length > 0,
    memory.nextSteps.length > 0,
  ]
  return checks.filter(Boolean).length / checks.length
}
