/**
 * config.ts — 全局配置对象（需求 §五.3：所有新增配置项统一收纳，便于开关控制）。
 *
 * 为什么单独一个文件而不是散在常量里：V3 加了十来个可调参数（防抖窗口、上下文
 * 阈值、休息长度、容量预警线…），散在各处时很难回答「到底有哪些开关」。这里
 * 既是默认值，也是**功能开关**——排查问题时改一个 `features.xxx = false` 就能
 * 关掉整块逻辑，不用改组件。
 *
 * 纪律：这里的值都是**读数**，不要在运行时改完又期望持久化。想持久化的用户
 * 配置放 `BoardSettings`（走 localStorage）。
 */
import type { BackupScope, SessionType } from '../types'

/** 会话类型 → 中文展示名。全局唯一一份，组件不许再各写一遍。 */
export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  dev: '代码开发',
  debug: '排错调试',
  refactor: '代码重构',
  design: '方案架构',
  reading: '文档查阅',
  other: '其他',
}

/** 会话类型 → 顺序（列表、图例、饼图都用这一份顺序）。 */
export const SESSION_TYPE_ORDER: readonly SessionType[] = [
  'dev',
  'debug',
  'refactor',
  'design',
  'reading',
  'other',
]

/** 备份范围 → 中文。 */
export const BACKUP_SCOPE_LABELS: Record<BackupScope, string> = {
  all: '全量',
  week: '近 7 天',
  month: '当月',
}

export const BOARD_CONFIG = {
  version: '4.0.0',

  /** 控制台日志前缀（需求 §五.2：统一 `SorchronBoard V3:`）。 */
  logPrefix: 'SorchronBoard V3',

  /** 功能开关：出问题时可以逐块关掉，不影响其余逻辑。 */
  features: {
    /** 会话上下文观测面板 */
    contextInsight: true,
    /** 斜杠命令 */
    slashCommands: true,
    /** 项目分组 */
    projectGroups: true,
    /** 开发阻碍记录 */
    frictionLog: true,
    /** 跨会话记忆快照 */
    snapshot: true,
    /** 番茄钟休息阶段 */
    breakPhase: true,
    /** 启动时自动清理脏数据（需求 4.1.3） */
    autoSanitize: true,
    /* ── V4 功能开关（出问题可逐块关闭，关掉后对应视图显示「已禁用」） ── */
    memoryCenter: true,
    knowledgeMap: true,
    spacedReview: true,
    timeMachine: true,
    heatmap: true,
    aiCoach: true,
  },

  /** 采集管线 */
  capture: {
    /** 防抖窗口：同一事件名在这个时间内只处理最后一次。 */
    debounceMs: 80,
    /** 长流兜底：无论怎么抖，最多等这么久必须落一次。 */
    maxWaitMs: 1500,
    /** 每秒最多处理的事件数，超出的直接丢（流式 delta 的中间态）。 */
    maxPerSecond: 12,
    /** payload 序列化后的字符上限。 */
    maxPayloadChars: 200_000,
    /** 同一条记录在这个窗口内重复出现 → 合并而不是新增。 */
    mergeWindowMs: 90_000,
    /** 内容哈希去重窗口：相同内容在这个时间内不重复入库（需求 2.1.1）。 */
    hashWindowMs: 5 * 60_000,
    /** 哈希环形缓冲的容量。 */
    hashBufferSize: 200,
    /** 错误累计到多少次把状态灯标红。 */
    errorThreshold: 3,
  },

  /** 代码块摘要 */
  code: {
    /** 超过这个字符数的块只记长度，不取描述。 */
    maxChars: 1500,
    /** 摘要只保留前 N 个字符（需求 2.1.3：超长代码只留前 300 字符）。 */
    summaryChars: 300,
    /** 一条消息最多量几个代码块。 */
    maxBlocks: 4,
    /** 单条日志 detail 的字符上限。 */
    maxDetailChars: 500,
  },

  /** 上下文观测（需求 3.1） */
  context: {
    /** 参与统计的最近消息条数上限。 */
    maxMessages: 300,
    /** 粗略 token 估算：中英混排按 1 token ≈ 1.7 字符。 */
    charsPerToken: 1.7,
    /** 预警阈值（条数），settings 里的值会覆盖它。 */
    warnMessages: 40,
    dangerMessages: 80,
    /** 预警阈值（token）。 */
    warnTokens: 60_000,
    dangerTokens: 120_000,
    /** 建议精简时，保留最近多少条。 */
    keepRecent: 10,
  },

  /** 计时器 */
  timer: {
    minMinutes: 10,
    maxMinutes: 90,
    defaultMinutes: 25,
    /** 休息长度限制 */
    minBreakMinutes: 1,
    maxBreakMinutes: 30,
    /** 连续几轮专注后给长休。 */
    roundsBeforeLongBreak: 4,
  },

  /** 存储容量监控（需求 2.3.3） */
  storage: {
    /** 浏览器 localStorage 通常按 5 MB 字符计。 */
    assumeQuotaBytes: 5 * 1024 * 1024,
    /** 用到这个比例开始黄色预警。 */
    warnRatio: 0.8,
    /** 到这里红色预警。 */
    dangerRatio: 0.92,
    /** 日志超过这个条数时提示清理。 */
    logSoftLimit: 400,
  },

  /** 项目（需求 3.3） */
  projects: {
    maxProjects: 24,
    maxNameLength: 40,
    /** 「全部项目」的伪 id —— 不作为真实项目存在。 */
    allId: '',
  },

  /** 阻碍记录（需求 3.4） */
  friction: {
    maxRecords: 200,
    /** 同一个摘要重复出现多少次算「反复踩坑」。 */
    repeatThreshold: 2,
    /** 一周内统计窗口（毫秒）。 */
    weekMs: 7 * 24 * 60 * 60 * 1000,
    /** 平均耗时估算：没有明确解决时间时，按「最后一次出现 - 第一次出现」。 */
    minResolveMs: 60_000,
  },

  /** 快照（需求 3.5） */
  snapshot: {
    maxHighlights: 30,
    maxTasks: 300,
    maxFriction: 100,
  },

  /** 日聚合（热力图数据源） */
  daily: {
    /** 保留天数：两年足够覆盖年度切换，也压得住体积。 */
    maxDays: 800,
    /** 热力图的四档阈值（分钟）。0 单独算一档，所以实际是 5 档配色。 */
    thresholds: [1, 25, 60, 120] as number[],
  },

  /** 时间轴 */
  timeline: {
    /** 环形上限。 */
    maxEvents: 1200,
    /** 同类型 + 同对象在这个窗口内只留一条（降噪）。 */
    dedupeMs: 60_000,
    /** 每次最多渲染多少条（分页加载）。 */
    pageSize: 60,
  },

  /** 历史快照 */
  history: {
    /** 每个项目保留多少个快照（第一个永远保留作为基线）。 */
    maxPerProject: 12,
    /** 距上次自动快照超过这个时间，打开看板时补一个。 */
    autoIntervalMs: 7 * 24 * 60 * 60 * 1000,
  },

  /** 项目记忆 */
  memory: {
    /** 单字段条数上限（done / openIssues 等）。 */
    maxItems: 120,
    /** 导出上下文文本时的字符上限。 */
    maxContextChars: 12_000,
  },

  /** 知识图谱 */
  knowledge: {
    maxNodes: 500,
    maxEdges: 900,
    /** 一个节点最多关联多少个阻碍（防止无限膨胀）。 */
    maxLinks: 100,
  },

  /** 间隔复习（SM-2 极简版） */
  review: {
    /** 各档的初始间隔（天）。 */
    intervals: [1, 2, 3, 7] as number[],
    /** 倍率：记住 / 熟练 时按这个系数放大。 */
    multipliers: [1, 1, 2, 2.5] as number[],
    /** 间隔上限（天）。 */
    maxIntervalDays: 180,
    /** 首页「待复习」最多展示多少条。 */
    queueLimit: 20,
  },

  /** 分析档位 */
  ai: {
    /** 单次请求超时（毫秒）。 */
    timeoutMs: 15_000,
    /** 单次返回的最大 token。 */
    maxTokens: 1200,
    /** 温度：分析类任务不需要发散。 */
    temperature: 0.2,
    /** 保留多少条调用审计。 */
    maxRuns: 100,
    /** 发送内容档位默认值（用户可在设置里改）。 */
    defaultTier: 'stats' as 'stats' | 'summary',
    /** 输入字符上限：超过就截断并标注，避免把整份记忆塞进去。 */
    maxInputChars: 16_000,
  },

  /** 斜杠命令 */
  commands: {
    /** 触发前缀；只认这三条，不做通用命令解析器。 */
    prefixes: ['/board-todo', '/board-bind', '/board-report'] as const,
    /** 在聊天里捕获命令时，命中关键词的用户消息也会写成日志。 */
    logExecutions: true,
    /** window 桥事件名。 */
    bridgeEvent: 'sorchron:command',
  },
} as const

/** 全局配置的类型（只读）。 */
export type BoardConfig = typeof BOARD_CONFIG

/** `dsh-otaku-study-board` 的短名，日志里用。 */
export const LOG_TAG = BOARD_CONFIG.logPrefix
