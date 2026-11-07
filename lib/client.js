window.__ModuleLoader__.load({
  id: "dsh-otaku-study-board",
  factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  BoardPage: () => BoardPage,
  PACKAGE_ID: () => PACKAGE_ID,
  PANEL_ID: () => PANEL_ID,
  PANEL_ORDER: () => PANEL_ORDER,
  apply: () => apply,
  default: () => index_default,
  inject: () => inject,
  name: () => name,
  registerSidebarGuide: () => registerSidebarGuide
});
module.exports = __toCommonJS(index_exports);
var import_react26 = require("react");

// src/client/ui/NoticeHost.tsx
var import_react = require("react");

// src/client/lib/bus.ts
var MAX_NOTICES = 3;
var sequence = 0;
var notices = [];
var noticeListeners = /* @__PURE__ */ new Set();
function pushNotice(text, level = "info") {
  try {
    const now = Date.now();
    if (notices.some((item) => item.text === text && now - item.at < 5e3)) return;
    sequence += 1;
    const notice = { id: `notice-${sequence}`, level, text, at: now };
    notices = [...notices, notice].slice(-MAX_NOTICES);
    for (const listener of noticeListeners) listener();
  } catch {
  }
}
function dismissNotice(id) {
  notices = notices.filter((item) => item.id !== id);
  for (const listener of noticeListeners) listener();
}
function getNotices() {
  return notices;
}
function subscribeNotices(listener) {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}
var STORE_EVENT = "dsh-otaku-study-board:store";
var captureState = { status: "off", detail: "未开始监听" };
var captureListeners = /* @__PURE__ */ new Set();
function setCaptureStatus(status, detail) {
  if (captureState.status === status && captureState.detail === detail) return;
  captureState = { status, detail };
  for (const listener of captureListeners) listener();
}
function getCaptureState() {
  return captureState;
}
function subscribeCapture(listener) {
  captureListeners.add(listener);
  return () => {
    captureListeners.delete(listener);
  };
}

// src/client/ui/NoticeHost.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var LIFETIME_MS = 9e3;
var LEVEL_COLORS = {
  info: { fg: "var(--osb-accent-text)", bg: "var(--osb-surface)", border: "var(--osb-border)" },
  success: { fg: "var(--osb-ok)", bg: "var(--osb-surface)", border: "var(--osb-ok)" },
  warn: { fg: "var(--osb-warn)", bg: "var(--osb-surface)", border: "var(--osb-warn)" },
  error: { fg: "var(--osb-danger)", bg: "var(--osb-surface)", border: "var(--osb-danger)" }
};
function NoticeHost() {
  const [notices2, setNotices] = (0, import_react.useState)(() => getNotices());
  (0, import_react.useEffect)(() => {
    return subscribeNotices(() => setNotices([...getNotices()]));
  }, []);
  (0, import_react.useEffect)(() => {
    if (notices2.length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      for (const notice of getNotices()) {
        if (now - notice.at > LIFETIME_MS) dismissNotice(notice.id);
      }
    }, 2e3);
    return () => {
      window.clearInterval(id);
    };
  }, [notices2.length]);
  if (notices2.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      "data-osb-notices": "",
      style: {
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360
      },
      children: notices2.map((notice) => {
        const tone = LEVEL_COLORS[notice.level] ?? LEVEL_COLORS.info;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            role: "status",
            style: {
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "9px 11px",
              border: `1px solid ${tone.border}`,
              borderRadius: 8,
              background: tone.bg,
              boxShadow: "0 8px 24px -18px rgba(20, 12, 30, 0.6)"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "span",
                {
                  "aria-hidden": "true",
                  style: {
                    flex: "0 0 auto",
                    width: 6,
                    height: 6,
                    marginTop: 6,
                    borderRadius: "50%",
                    background: tone.fg
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto", fontSize: 12, lineHeight: 1.6, color: tone.fg }, children: notice.text }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  "aria-label": "关闭提示",
                  onClick: () => dismissNotice(notice.id),
                  style: {
                    flex: "0 0 auto",
                    border: "none",
                    background: "transparent",
                    color: "var(--osb-text-3)",
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: 1,
                    padding: 2
                  },
                  children: "✕"
                }
              )
            ]
          },
          notice.id
        );
      })
    }
  );
}

// src/client/ui/ConflictHost.tsx
var import_react2 = require("react");

// src/client/lib/conflict.ts
var CONFLICT_EVENT = "sorchron:conflict-resolve";
function decideRemoteChange(input) {
  if (input.remoteRaw === null) return "apply";
  if (input.remoteRaw === input.baseRaw) return "apply";
  return input.dirty ? "conflict" : "apply";
}
var entries = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
    }
  }
}
function reportConflict(key, remoteRaw, now = Date.now()) {
  const existing = entries.get(key);
  entries.set(key, {
    key,
    remoteRaw,
    at: now,
    reported: (existing?.reported ?? 0) + 1
  });
  emit();
}
function listConflicts() {
  return [...entries.values()].sort((a, b) => b.at - a.at);
}
function getConflict(key) {
  return entries.get(key);
}
function resolveConflict(key) {
  if (!entries.has(key)) return;
  entries.delete(key);
  emit();
}
function subscribeConflicts(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function requestResolution(key, action) {
  try {
    window.dispatchEvent(new CustomEvent(CONFLICT_EVENT, { detail: { key, action } }));
  } catch (error) {
    pushNotice("冲突处理失败：当前环境不支持事件派发", "error");
    void error;
  }
}
function onResolution(handler) {
  if (typeof window === "undefined") return () => void 0;
  const listener = (event) => {
    const detail = event.detail;
    if (detail === void 0 || typeof detail.key !== "string") return;
    if (detail.action !== "reload" && detail.action !== "keep") return;
    handler(detail);
  };
  window.addEventListener(CONFLICT_EVENT, listener);
  return () => window.removeEventListener(CONFLICT_EVENT, listener);
}

// src/client/ui/ConflictHost.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var KEY_LABELS = {
  "dsh-otaku-study-board:tasks": "任务",
  "dsh-otaku-study-board:logs": "会话日志",
  "dsh-otaku-study-board:settings": "设置",
  "dsh-otaku-study-board:projects": "项目",
  "dsh-otaku-study-board:friction": "阻碍记录",
  "dsh-otaku-study-board:memory": "项目记忆",
  "dsh-otaku-study-board:knowledge": "知识图谱"
};
function ConflictHost() {
  const [items, setItems] = (0, import_react2.useState)(() => listConflicts());
  (0, import_react2.useEffect)(() => subscribeConflicts(() => setItems(listConflicts())), []);
  if (items.length === 0) return null;
  const labels = items.map((item) => KEY_LABELS[item.key] ?? item.key);
  const summary = items.length === 1 ? `另一标签页修改了「${labels[0]}」` : `另一标签页修改了 ${items.length} 项数据（${labels.slice(0, 3).join("、")}${items.length > 3 ? "…" : ""}）`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      role: "alertdialog",
      "aria-label": "跨标签页冲突",
      style: {
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 60,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--osb-border-strong)",
        background: "var(--osb-surface)",
        boxShadow: "0 10px 30px -18px rgba(0,0,0,0.5)",
        fontSize: 12
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { flex: 1, minWidth: 220 }, children: [
          summary,
          "，与当前页未保存的修改冲突。",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "var(--osb-text-3)" }, children: " 选择前不会覆盖任何一方。" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "osb-btn osb-btn-sm",
            onClick: () => items.forEach((item) => requestResolution(item.key, "reload")),
            children: "重新载入（用远端）"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "osb-btn osb-btn-sm osb-btn-primary",
            onClick: () => items.forEach((item) => requestResolution(item.key, "keep")),
            children: "保留本页"
          }
        )
      ]
    }
  );
}

// src/client/hooks/useBoardData.ts
var import_react5 = require("react");

// src/client/types/index.ts
var STORAGE_PREFIX = "dsh-otaku-study-board";
var STORAGE_KEYS = {
  tasks: `${STORAGE_PREFIX}:tasks`,
  logs: `${STORAGE_PREFIX}:logs`,
  projects: `${STORAGE_PREFIX}:projects`,
  settings: `${STORAGE_PREFIX}:settings`,
  timer: `${STORAGE_PREFIX}:timer`,
  /** V3 */
  friction: `${STORAGE_PREFIX}:friction`,
  /** V3 */
  meta: `${STORAGE_PREFIX}:meta`,
  /* ── V4 新增（每个实体一个键，互不影响；缺失即视为空） ── */
  memory: `${STORAGE_PREFIX}:memory`,
  knowledge: `${STORAGE_PREFIX}:knowledge`,
  reviews: `${STORAGE_PREFIX}:reviews`,
  timeline: `${STORAGE_PREFIX}:timeline`,
  history: `${STORAGE_PREFIX}:history`,
  daily: `${STORAGE_PREFIX}:daily`,
  /** 审计日志：不进备份、不参与统计。 */
  aiRuns: `${STORAGE_PREFIX}:aiRuns`
};
var BACKUP_KEYS = [
  STORAGE_KEYS.tasks,
  STORAGE_KEYS.logs,
  STORAGE_KEYS.projects,
  STORAGE_KEYS.settings,
  STORAGE_KEYS.friction,
  STORAGE_KEYS.meta,
  /* V4：以下六个进备份；timer（瞬态）与 aiRuns（审计）不进 */
  STORAGE_KEYS.memory,
  STORAGE_KEYS.knowledge,
  STORAGE_KEYS.reviews,
  STORAGE_KEYS.timeline,
  STORAGE_KEYS.history,
  STORAGE_KEYS.daily
];

// src/client/lib/config.ts
var BACKUP_SCOPE_LABELS = {
  all: "全量",
  week: "近 7 天",
  month: "当月"
};
var BOARD_CONFIG = {
  version: "4.0.0",
  /** 控制台日志前缀（需求 §五.2：统一 `SorchronBoard V3:`）。 */
  logPrefix: "SorchronBoard V3",
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
    aiCoach: true
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
    maxPayloadChars: 2e5,
    /** 同一条记录在这个窗口内重复出现 → 合并而不是新增。 */
    mergeWindowMs: 9e4,
    /** 内容哈希去重窗口：相同内容在这个时间内不重复入库（需求 2.1.1）。 */
    hashWindowMs: 5 * 6e4,
    /** 哈希环形缓冲的容量。 */
    hashBufferSize: 200,
    /** 错误累计到多少次把状态灯标红。 */
    errorThreshold: 3
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
    maxDetailChars: 500
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
    warnTokens: 6e4,
    dangerTokens: 12e4,
    /** 建议精简时，保留最近多少条。 */
    keepRecent: 10
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
    roundsBeforeLongBreak: 4
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
    logSoftLimit: 400
  },
  /** 项目（需求 3.3） */
  projects: {
    maxProjects: 24,
    maxNameLength: 40,
    /** 「全部项目」的伪 id —— 不作为真实项目存在。 */
    allId: ""
  },
  /** 阻碍记录（需求 3.4） */
  friction: {
    maxRecords: 200,
    /** 同一个摘要重复出现多少次算「反复踩坑」。 */
    repeatThreshold: 2,
    /** 一周内统计窗口（毫秒）。 */
    weekMs: 7 * 24 * 60 * 60 * 1e3,
    /** 平均耗时估算：没有明确解决时间时，按「最后一次出现 - 第一次出现」。 */
    minResolveMs: 6e4
  },
  /** 快照（需求 3.5） */
  snapshot: {
    maxHighlights: 30,
    maxTasks: 300,
    maxFriction: 100
  },
  /** 日聚合（热力图数据源） */
  daily: {
    /** 保留天数：两年足够覆盖年度切换，也压得住体积。 */
    maxDays: 800,
    /** 热力图的四档阈值（分钟）。0 单独算一档，所以实际是 5 档配色。 */
    thresholds: [1, 25, 60, 120]
  },
  /** 时间轴 */
  timeline: {
    /** 环形上限。 */
    maxEvents: 1200,
    /** 同类型 + 同对象在这个窗口内只留一条（降噪）。 */
    dedupeMs: 6e4,
    /** 每次最多渲染多少条（分页加载）。 */
    pageSize: 60
  },
  /** 历史快照 */
  history: {
    /** 每个项目保留多少个快照（第一个永远保留作为基线）。 */
    maxPerProject: 12,
    /** 距上次自动快照超过这个时间，打开看板时补一个。 */
    autoIntervalMs: 7 * 24 * 60 * 60 * 1e3
  },
  /** 项目记忆 */
  memory: {
    /** 单字段条数上限（done / openIssues 等）。 */
    maxItems: 120,
    /** 导出提示词时的字符上限，避免超过聊天框。 */
    maxPromptChars: 12e3
  },
  /** 知识图谱 */
  knowledge: {
    maxNodes: 500,
    maxEdges: 900,
    /** 一个节点最多关联多少个阻碍（防止无限膨胀）。 */
    maxLinks: 100
  },
  /** 间隔复习（SM-2 极简版） */
  review: {
    /** 各档的初始间隔（天）。 */
    intervals: [1, 2, 3, 7],
    /** 倍率：记住 / 熟练 时按这个系数放大。 */
    multipliers: [1, 1, 2, 2.5],
    /** 间隔上限（天）。 */
    maxIntervalDays: 180,
    /** 首页「待复习」最多展示多少条。 */
    queueLimit: 20
  },
  /** 分析档位 */
  ai: {
    /** 单次请求超时（毫秒）。 */
    timeoutMs: 15e3,
    /** 单次返回的最大 token。 */
    maxTokens: 1200,
    /** 温度：分析类任务不需要发散。 */
    temperature: 0.2,
    /** 保留多少条调用审计。 */
    maxRuns: 100,
    /** 发送内容档位默认值（用户可在设置里改）。 */
    defaultTier: "stats",
    /** 输入字符上限：超过就截断并标注，避免把整份记忆塞进去。 */
    maxInputChars: 16e3
  },
  /** 斜杠命令 */
  commands: {
    /** 触发前缀；只认这三条，不做通用命令解析器。 */
    prefixes: ["/board-todo", "/board-bind", "/board-report"],
    /** 在聊天里捕获命令时，命中关键词的用户消息也会写成日志。 */
    logExecutions: true,
    /** window 桥事件名。 */
    bridgeEvent: "sorchron:command"
  }
};
var LOG_TAG = BOARD_CONFIG.logPrefix;

// src/client/lib/detect.ts
var MAX_CODE_CHARS = BOARD_CONFIG.code.maxChars;
var DEDUPE_WINDOW_MS = BOARD_CONFIG.capture.mergeWindowMs;
var BINARY_HINT_RE = /(?:data:(?:image|audio|video|application\/octet-stream)[\w/+.-]*;base64|\.(?:png|jpe?g|gif|webp|bmp|ico|pdf|zip|gz|mp4|mov|mp3|wav|woff2?|ttf|exe|dll)\b)/i;
var DEBUG_RE = /(error|exception|stack ?trace|traceback|throw |failed to|cannot read|is not a function|undefined is not|null is not|unhandled|uncaught|ERR_[A-Z]+|status (?:4|5)\d\d|报错|异常|崩溃|失败|调试|排查|修复 ?bug|\bbug\b)/i;
var REFACTOR_RE = /(重构|refactor|重写|抽离|提取(?:公共|函数|组件)|拆分(?:文件|模块|函数)|整理代码|代码整理|解耦|简化|rename|extract|split)/i;
var DESIGN_RE = /(架构|设计|方案|规划|需求|选型|拆解|排期|架构图|architecture|design|roadmap|proposal|schema|blueprint|spec)/i;
var READING_RE = /(文档|教程|怎么用|如何使用|用法|知识点|原理|概念|区别|是什么|介绍一下|学习|doc|docs|guide|tutorial|how (do|to|does)|what is|difference|concept|reference)/i;
var EXT_BY_LANG = {
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  js: "js",
  javascript: "js",
  jsx: "jsx",
  react: "tsx",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  json: "json",
  py: "py",
  python: "py",
  sh: "sh",
  bash: "sh",
  sql: "sql",
  md: "md",
  markdown: "md",
  go: "go",
  rs: "rs",
  rust: "rs",
  java: "java",
  kt: "kt",
  php: "php"
};
var LANG_LABEL = {
  ts: "TS",
  typescript: "TS",
  tsx: "TSX",
  js: "JS",
  javascript: "JS",
  jsx: "JSX",
  react: "React",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  vue: "Vue",
  svelte: "Svelte",
  json: "JSON",
  py: "Python",
  python: "Python",
  sql: "SQL",
  sh: "Shell",
  bash: "Shell",
  go: "Go",
  rs: "Rust",
  rust: "Rust",
  java: "Java",
  kt: "Kotlin",
  php: "PHP",
  md: "Markdown"
};
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function asString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function looksBinary(value, depth = 0) {
  if (depth > 3 || value === null || value === void 0) return false;
  if (typeof value === "string") return BINARY_HINT_RE.test(value.slice(0, 200));
  if (Array.isArray(value)) return value.some((item) => looksBinary(item, depth + 1));
  const record = asRecord(value);
  if (record === void 0) return false;
  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  if (type.includes("image") || type.includes("file") || type.includes("attachment")) return true;
  if (typeof record.mimeType === "string" && /^(?:image|audio|video|application\/octet)/i.test(record.mimeType)) {
    return true;
  }
  return Object.keys(record).some((key) => /image|attachment|binary|blob/i.test(key) && record[key] !== null);
}
function pushText(target, value, depth = 0) {
  if (depth > 3 || value === null || value === void 0) return;
  if (typeof value === "string") {
    if (value.trim() !== "") target.push(value.slice(0, 2e4));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushText(target, item, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (record === void 0) return;
  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  if (type === "image" || type === "input_image" || type === "file") return;
  pushText(target, record.text, depth + 1);
  pushText(target, record.content, depth + 1);
  pushText(target, record.delta, depth + 1);
}
function readFuncName(snippet) {
  const head = snippet.slice(0, BOARD_CONFIG.code.summaryChars);
  const patterns = [
    /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
    /def\s+([A-Za-z_$][\w$]*)\s*\(/,
    /fn\s+([A-Za-z_$][\w$]*)\s*\(/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(head);
    if (match?.[1] !== void 0) return match[1];
  }
  return void 0;
}
function measureBlock(lang, body) {
  const normalisedLang = lang.trim().toLowerCase();
  const lines = body.split("\n");
  const block = {
    lang: normalisedLang,
    chars: body.length,
    lines: lines.filter((line) => line.trim() !== "").length
  };
  const snippet = body.slice(0, BOARD_CONFIG.code.summaryChars);
  const funcName = readFuncName(snippet);
  if (funcName !== void 0) block.funcName = funcName;
  if (block.chars <= MAX_CODE_CHARS) {
    block.hint = readHint(lines);
    block.fileName = guessFileName(body, normalisedLang);
  }
  return block;
}
function readHint(lines) {
  for (const raw of lines.slice(0, 12)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("```")) continue;
    const comment = /^(?:\/\/|#|\*|\/\*+)\s*(.+?)(?:\*\/)?$/.exec(line);
    if (comment !== null) {
      const text = comment[1]?.trim() ?? "";
      if (text !== "" && text.length > 3) return clip(text, 48);
      continue;
    }
    const declaration = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (declaration !== null) return `定义 ${declaration[1] ?? ""}`;
    break;
  }
  return void 0;
}
function guessFileName(body, lang) {
  const extension = EXT_BY_LANG[lang] ?? "txt";
  const head = body.slice(0, 400);
  const explicit = /(?:^|\s)([\w./-]+\.(?:tsx?|jsx?|css|html|json|py|sql|md|vue|svelte|go|rs|java|php))\b/.exec(head);
  if (explicit?.[1] !== void 0) return explicit[1];
  const declaration = /(?:function|class|const|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(head);
  if (declaration?.[1] !== void 0) return `${declaration[1]}.${extension}`;
  return void 0;
}
function extractFences(text) {
  const blocks = [];
  const pattern = /```([a-zA-Z0-9+#._-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let match = pattern.exec(text);
  while (match !== null && blocks.length < BOARD_CONFIG.code.maxBlocks) {
    blocks.push(measureBlock(match[1] ?? "", match[2] ?? ""));
    match = pattern.exec(text);
  }
  return blocks;
}
function normalizeHarnessEvent(event) {
  const payload = asRecord(event.payload);
  const message = asRecord(payload?.message);
  const texts = [];
  pushText(texts, payload?.text);
  pushText(texts, payload?.content);
  pushText(texts, payload?.delta);
  pushText(texts, payload?.input);
  pushText(texts, payload?.output);
  pushText(texts, message?.content);
  const text = texts.join("\n").trim();
  const blocks = [];
  for (const candidate of [payload?.code, payload?.source, payload?.codeText]) {
    const code = asString(candidate);
    if (code !== void 0) {
      const lang = asString(payload?.language) ?? asString(payload?.lang) ?? "";
      blocks.push(measureBlock(lang, code));
    }
  }
  if (blocks.length === 0) blocks.push(...extractFences(text));
  const normalized = { text, codeBlocks: blocks };
  if (looksBinary(payload)) {
    normalized.binary = true;
    normalized.text = "";
    normalized.codeBlocks = [];
  }
  const toolName = asString(payload?.tool) ?? asString(payload?.toolName);
  if (toolName !== void 0) normalized.toolName = toolName;
  const sessionTitle = asString(payload?.sessionTitle) ?? asString(payload?.title);
  if (sessionTitle !== void 0) normalized.sessionTitle = sessionTitle;
  const sessionId = asString(payload?.sessionId) ?? event.sessionId;
  if (sessionId !== void 0) normalized.sessionId = sessionId;
  const role = asString(payload?.role) ?? asString(message?.role);
  if (role !== void 0) normalized.role = role;
  return normalized;
}
function classifySession(text, blocks) {
  if (text !== "" && DEBUG_RE.test(text)) return "debug";
  if (text !== "" && REFACTOR_RE.test(text)) return "refactor";
  if (blocks.length > 0) return "dev";
  if (text !== "" && DESIGN_RE.test(text)) return "design";
  if (text !== "" && READING_RE.test(text)) return "reading";
  return "other";
}
var TITLE_DEBUG_RE = /(调试|排错|修复|bug|error|报错|异常|崩溃)/i;
var TITLE_REFACTOR_RE = /(重构|整理代码|抽离|拆分|简化)/i;
var TITLE_DESIGN_RE = /(架构|设计|方案|规划|选型)/i;
var TITLE_READING_RE = /(文档|教程|阅读|学习|英语|原理|笔记|查阅)/i;
var TITLE_DEV_RE = /(开发|编码|实现|插件|项目|react|typescript|javascript|\bts\b|\bjs\b|css|html|sql)/i;
function classifyTitle(title) {
  if (title === "") return "other";
  if (TITLE_DEBUG_RE.test(title)) return "debug";
  if (TITLE_REFACTOR_RE.test(title)) return "refactor";
  if (TITLE_DESIGN_RE.test(title)) return "design";
  if (TITLE_READING_RE.test(title)) return "reading";
  if (TITLE_DEV_RE.test(title)) return "dev";
  return "other";
}
function clip(text, limit) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, Math.max(0, limit - 1))}…`;
}
function stripMarkdown(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`{1,3}/g, "").replace(/^#{1,6}\s*/gm, "").replace(/[*_>]/g, "").replace(/\s+/g, " ").trim();
}
function summarizeCodeBlock(block) {
  const label = LANG_LABEL[block.lang] ?? (block.lang === "" ? "代码" : block.lang.toUpperCase());
  const parts = [label, `${block.lines} 行`];
  const name2 = block.fileName ?? (block.funcName === void 0 ? void 0 : `${block.funcName}()`);
  if (name2 !== void 0) parts.push(name2);
  return parts.join(" · ");
}
function describeCodeBlock(block) {
  if (block.chars > MAX_CODE_CHARS) {
    return `未保存源码 · 超长已截断（${block.chars} 字符）`;
  }
  const base = block.hint ?? "未命名的代码片段";
  const func = block.funcName === void 0 ? "" : ` · ${block.funcName}()`;
  return `${base}${func} · 未保存源码（${block.chars} 字符）`;
}
function summarizeMessage(text) {
  const first = text.split("\n").map((line) => line.trim()).find((line) => line !== "" && !line.startsWith("```"));
  return clip(stripMarkdown(first ?? text), 60);
}
var DEFAULT_PROJECT_RULES = [
  { id: "rule-dsh-plugin", keyword: "dsh", project: "DSH 插件开发" },
  { id: "rule-sorchron", keyword: "sorchron", project: "溯时工作台" },
  { id: "rule-react", keyword: "react", project: "前端学习" },
  { id: "rule-english", keyword: "英语", project: "英语学习" }
];
function matchProjectRule(text, rules) {
  if (text.trim() === "") return void 0;
  for (const rule of rules) {
    const keyword = rule.keyword.trim();
    if (keyword === "") continue;
    try {
      if (rule.regex === true) {
        if (new RegExp(keyword, "i").test(text)) return rule;
      } else if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return rule;
      }
    } catch {
      continue;
    }
  }
  return void 0;
}
function buildLogDraft(normalized, options) {
  const { rules } = options;
  const at = options.now ?? Date.now();
  const hasText = normalized.text !== "";
  const blocks = normalized.codeBlocks;
  if (normalized.binary === true) return void 0;
  if (!hasText && blocks.length === 0) return void 0;
  const sessionType = classifySession(normalized.text, blocks);
  const primary = blocks[0];
  const title = primary !== void 0 ? summarizeCodeBlock(primary) : summarizeMessage(normalized.text);
  if (title.trim() === "") return void 0;
  const rule = matchProjectRule(`${normalized.sessionTitle ?? ""} ${normalized.text}`, rules);
  const draft = {
    at,
    kind: primary !== void 0 ? "code-block" : normalized.toolName !== void 0 ? "tool-call" : "message",
    sessionType,
    title,
    source: "auto",
    edited: false,
    hits: 1,
    role: normalized.toolName !== void 0 ? "tool" : normalized.role === "assistant" ? "assistant" : "user"
  };
  if (primary !== void 0) draft.detail = clip(describeCodeBlock(primary), BOARD_CONFIG.code.maxDetailChars);
  if (rule !== void 0) {
    draft.project = rule.project;
    if (rule.projectId !== void 0) draft.projectId = rule.projectId;
  } else if (options.projectId !== void 0 && options.projectId !== "") {
    draft.projectId = options.projectId;
  }
  if (options.taskId !== void 0 && options.taskId !== "") draft.taskId = options.taskId;
  if (normalized.sessionId !== void 0) draft.sessionId = normalized.sessionId;
  const chars = normalized.text.length + blocks.reduce((sum, block) => sum + block.chars, 0);
  const perToken = options.charsPerToken ?? 1.7;
  if (chars > 0 && perToken > 0) draft.tokens = Math.max(1, Math.round(chars / perToken));
  return draft;
}
function dedupeKey(draft) {
  return `${draft.sessionType ?? "other"}|${draft.kind}|${draft.projectId ?? draft.project ?? ""}|${draft.title}`;
}
function summarizeError(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  const first = lines.find((line) => DEBUG_RE.test(line)) ?? lines[0] ?? "";
  return clip(
    first.replace(/\s+at\s+[\w$.<>]+\s*\([^)]*\)/g, "").replace(/\([A-Za-z]:\\[^)]*\)/g, "").replace(/\b\d{4,}\b/g, ""),
    140
  );
}

// src/client/lib/time.ts
var WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function pad2(value) {
  return String(value).padStart(2, "0");
}
function dayKey(at) {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function monthKey(at) {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}
function startOfDay(at) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function startOfMonth(at) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return date.getTime();
}
function recentDayKeys(count, now = Date.now()) {
  const keys = [];
  const cursor = new Date(startOfDay(now));
  for (let index = count - 1; index >= 0; index -= 1) {
    const day = new Date(cursor);
    day.setDate(day.getDate() - index);
    keys.push(dayKey(day.getTime()));
  }
  return keys;
}
function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}
function formatMinutes(totalMinutes) {
  const safe = Math.max(0, Math.round(totalMinutes));
  if (safe === 0) return "0m";
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
function formatTime(at) {
  const date = new Date(at);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
function weekdayOfDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return WEEKDAY_ZH[date.getDay()];
}
function parseDateInput(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}
function formatDateInput(at) {
  return dayKey(at);
}
function formatRelative(at, now = Date.now()) {
  const diff = now - at;
  if (!Number.isFinite(diff)) return "—";
  if (diff < 0) {
    return `${formatMinutesAway(-diff)}后`;
  }
  if (diff < 6e4) return "刚刚";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
  if (diff < 7 * 864e5) return `${Math.floor(diff / 864e5)} 天前`;
  return dayKey(at);
}
function formatMinutesAway(ms) {
  const minutes = Math.round(ms / 6e4);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}

// src/client/lib/defaults.ts
var MIN_DURATION_MINUTES = BOARD_CONFIG.timer.minMinutes;
var MAX_DURATION_MINUTES = BOARD_CONFIG.timer.maxMinutes;
var DEFAULT_DURATION_MINUTES = BOARD_CONFIG.timer.defaultMinutes;
var MAX_TITLE_LENGTH = 120;
var MAX_SUBTASK_LENGTH = 80;
var MAX_LOG_ENTRIES = BOARD_CONFIG.storage.logSoftLimit;
var MAX_TASK_ENTRIES = 500;
var MAX_FRICTION_ENTRIES = BOARD_CONFIG.friction.maxRecords;
var MAX_MINUTES = 24 * 60;
var MAX_GOAL_MINUTES = 1e6;
var MAX_GOAL_TASKS = 1e4;
var STALE_TIMER_MS = 24 * 60 * 60 * 1e3;
function createDefaultSettings(now = Date.now()) {
  return {
    autoCapture: true,
    lastDurationMinutes: DEFAULT_DURATION_MINUTES,
    projectRules: DEFAULT_PROJECT_RULES.map((rule) => ({ ...rule })),
    monthlyGoal: { month: monthKey(now), targetMinutes: 1200, targetTasks: 20 },
    activeProjectId: BOARD_CONFIG.projects.allId,
    breakEnabled: BOARD_CONFIG.features.breakPhase,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    roundsBeforeLongBreak: BOARD_CONFIG.timer.roundsBeforeLongBreak,
    contextWarnMessages: BOARD_CONFIG.context.warnMessages,
    contextDangerMessages: BOARD_CONFIG.context.dangerMessages,
    aiAutoDaily: false,
    aiTier: "stats",
    heatmapYear: 0
  };
}
function createDefaultTimerState(now = Date.now()) {
  void now;
  return {
    running: false,
    deadline: null,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    boundTaskId: "",
    startedAt: null,
    remainingSeconds: DEFAULT_DURATION_MINUTES * 60,
    phase: "focus",
    roundInCycle: 0,
    focusMinutes: DEFAULT_DURATION_MINUTES,
    roundId: ""
  };
}
function createDefaultMeta() {
  return { sessionTaskMap: {} };
}

// src/client/lib/stats.ts
var LEGACY_ROUND_MINUTES = 25;
function taskFocusMinutes(task) {
  if (typeof task.focusedMinutes === "number") return Math.max(0, task.focusedMinutes);
  return Math.max(0, (task.pomodoros ?? 0) * LEGACY_ROUND_MINUTES);
}
function focusMinutesOn(logs, key) {
  let total = 0;
  for (const log of logs) {
    if (log.kind !== "focus") continue;
    if (dayKey(log.at) !== key) continue;
    total += Math.max(0, log.minutes ?? 0);
  }
  return total;
}
function countStreak(tasks, logs, now = Date.now()) {
  const days = /* @__PURE__ */ new Set();
  for (const task of tasks) {
    if (task.completedAt !== void 0) days.add(dayKey(task.completedAt));
  }
  for (const log of logs) {
    if (log.kind !== "focus") continue;
    if ((log.minutes ?? 0) <= 0) continue;
    days.add(dayKey(log.at));
  }
  if (days.size === 0) return 0;
  const cursor = new Date(startOfDay(now));
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor.getTime()))) return 0;
  }
  let streak = 0;
  while (streak < 400 && days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function computeBoardStats(tasks, logs, now = Date.now()) {
  const today = dayKey(now);
  let tasksDoneToday = 0;
  for (const task of tasks) {
    if (task.done && task.completedAt !== void 0 && dayKey(task.completedAt) === today) {
      tasksDoneToday += 1;
    }
  }
  let logsToday = 0;
  for (const log of logs) {
    if (dayKey(log.at) === today) logsToday += 1;
  }
  return {
    tasksDoneToday,
    tasksTotal: tasks.length,
    focusMinutesToday: focusMinutesOn(logs, today),
    streakDays: countStreak(tasks, logs, now),
    logsToday,
    overdueTasks: tasks.filter((task) => isOverdue(task, now)).length
  };
}
function assignLogMinutes(logs) {
  const ascending = [...logs].sort((a, b) => a.at - b.at);
  return ascending.map((log, index) => {
    if (typeof log.minutes === "number" && log.minutes > 0) {
      return { log, minutes: log.minutes };
    }
    const next = ascending[index + 1];
    if (next === void 0) return { log, minutes: 5 };
    const gapMinutes = (next.at - log.at) / 6e4;
    const estimated = Math.round(Math.min(30, Math.max(2, gapMinutes)));
    return { log, minutes: estimated };
  });
}
function isOverdue(task, now = Date.now()) {
  if (task.done) return false;
  if (task.dueAt === void 0) return false;
  return task.dueAt < now;
}

// src/client/lib/projects.ts
function archivedProjectIds(projects) {
  const set = /* @__PURE__ */ new Set();
  for (const project of projects) {
    if (project.archived) set.add(project.id);
  }
  return set;
}
function inScope(recordProjectId, activeId, archived) {
  const id = recordProjectId ?? "";
  if (activeId !== BOARD_CONFIG.projects.allId) return id === activeId;
  return id === "" || !archived.has(id);
}
function scopedTasks(tasks, activeId, projects) {
  const archived = archivedProjectIds(projects);
  return tasks.filter((task) => inScope(task.projectId, activeId, archived));
}
function scopedLogs(logs, activeId, projects) {
  const archived = archivedProjectIds(projects);
  return logs.filter((log) => inScope(log.projectId, activeId, archived));
}
function scopedFriction(records, activeId, projects) {
  const archived = archivedProjectIds(projects);
  return records.filter((item) => inScope(item.projectId, activeId, archived));
}
function projectRanking(logs, tasks, projects, activeId = BOARD_CONFIG.projects.allId, options = {}) {
  const archived = archivedProjectIds(projects);
  const rows = /* @__PURE__ */ new Map();
  const ensure = (id) => {
    const existing = rows.get(id);
    if (existing !== void 0) return existing;
    const created = { minutes: 0, sessions: 0, tasksDone: 0 };
    rows.set(id, created);
    return created;
  };
  if (options.includeEmpty === true) {
    for (const project of projects) {
      if (!inScope(project.id, activeId, archived)) continue;
      ensure(project.id);
    }
  }
  for (const { log, minutes } of assignLogMinutes(logs)) {
    const id = log.projectId ?? "";
    if (!inScope(id, activeId, archived)) continue;
    const row = ensure(id);
    if (log.kind === "focus") row.minutes += Math.max(0, log.minutes ?? minutes);
    row.sessions += 1;
  }
  for (const task of tasks) {
    if (!task.done) continue;
    const id = task.projectId ?? "";
    if (!inScope(id, activeId, archived)) continue;
    ensure(id).tasksDone += 1;
  }
  return [...rows.entries()].map(([projectId, row]) => {
    const found = projects.find((item) => item.id === projectId);
    return {
      projectId,
      name: found?.name ?? (projectId === "" ? "未归属项目" : projectId),
      minutes: Math.round(row.minutes),
      sessions: row.sessions,
      tasksDone: row.tasksDone,
      archived: found?.archived === true
    };
  }).sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions || b.tasksDone - a.tasksDone);
}
function normalizeActiveId(activeId, projects) {
  if (activeId === "") return "";
  const found = projects.find((item) => item.id === activeId);
  if (found === void 0 || found.archived) return "";
  return activeId;
}

// src/client/lib/validate.ts
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function clampNumber(value, min, max, fallback) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}
function clampDurationMinutes(value, fallback = 25) {
  return clampInteger(value, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES, fallback);
}
function clampFocusMinutes(value) {
  return clampInteger(value, 0, MAX_MINUTES, 0);
}
function clampGoalMinutes(value, fallback = 0) {
  return clampInteger(value, 0, MAX_GOAL_MINUTES, fallback);
}
function clampGoalTasks(value, fallback = 0) {
  return clampInteger(value, 0, MAX_GOAL_TASKS, fallback);
}
function isMonthKey(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function sanitizeTitle(value, max = MAX_TITLE_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}
function sanitizeText(value, max = 4e3) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}
function parseIntegerInput(text) {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
function clampBreakMinutes(value, fallback = 5) {
  return clampInteger(value, BOARD_CONFIG.timer.minBreakMinutes, BOARD_CONFIG.timer.maxBreakMinutes, fallback);
}
function sanitizeSubtask(value) {
  return sanitizeTitle(value, MAX_SUBTASK_LENGTH);
}
function clampDueAt(value, now = Date.now()) {
  if (!isFiniteNumber(value) || value <= 0) return void 0;
  const floor = Date.UTC(2e3, 0, 1);
  const ceiling = now + 100 * 365 * 24 * 60 * 60 * 1e3;
  if (value < floor || value > ceiling) return void 0;
  return Math.round(value);
}

// src/client/lib/schema.ts
var SCHEMA_VERSION = 4;
function wrapEnvelope(data) {
  return { schemaVersion: SCHEMA_VERSION, data };
}
function unwrapEnvelope(parsed) {
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed;
    if ("schemaVersion" in record || "data" in record) {
      const version = isFiniteNumber(record.schemaVersion) ? record.schemaVersion : 1;
      return { data: record.data, version, legacy: false };
    }
  }
  return { data: parsed, version: 1, legacy: true };
}
function asRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function readString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function readTime(value, fallback, now = Date.now()) {
  if (!isFiniteNumber(value) || value <= 0) return fallback;
  return Math.min(value, now + 24 * 60 * 60 * 1e3);
}
function readScheduleTime(value, fallback, now = Date.now()) {
  if (!isFiniteNumber(value) || value <= 0) return fallback;
  const ceiling = now + 10 * 365 * 24 * 60 * 60 * 1e3;
  return Math.min(value, ceiling);
}
var UNSAFE_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function isSafeKey(key) {
  return key.trim() !== "" && !UNSAFE_KEYS.has(key);
}
var TASK_PRIORITY = ["normal", "important", "urgent"];
var SESSION_TYPES = ["dev", "debug", "reading", "design", "refactor", "other"];
var LOG_KINDS = ["message", "code-block", "tool-call", "milestone", "manual", "focus", "friction"];
var TIMER_PHASES = ["focus", "short", "long"];
function coerceTask(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const id = readString(record.id);
  const title = sanitizeTitle(record.title, MAX_TITLE_LENGTH);
  if (id === void 0 || title === "") return void 0;
  const done = record.done === true || record.status === "done";
  const status = done ? "done" : record.status === "doing" ? "doing" : "todo";
  const createdAt = readTime(record.createdAt, now, now);
  const task = {
    id,
    title,
    status,
    done,
    pomodoros: clampInteger(record.pomodoros, 0, MAX_MINUTES, 0),
    createdAt,
    updatedAt: readTime(record.updatedAt, createdAt, now)
  };
  if (record.focusedMinutes !== void 0) task.focusedMinutes = clampFocusMinutes(record.focusedMinutes);
  if (record.estimateMinutes !== void 0) {
    task.estimateMinutes = clampInteger(record.estimateMinutes, 1, MAX_MINUTES, 25);
  }
  const priority = TASK_PRIORITY.find((item) => item === record.priority);
  if (priority !== void 0) task.priority = priority;
  if (isFiniteNumber(record.completedAt) && record.completedAt > 0) {
    task.completedAt = readTime(record.completedAt, createdAt, now);
  }
  const note = readString(record.note);
  if (note !== void 0) task.note = sanitizeText(note, 500);
  const projectId = readString(record.projectId);
  if (projectId !== void 0) task.projectId = projectId;
  const sessionId = readString(record.sessionId);
  if (sessionId !== void 0) task.sessionId = sessionId;
  const dueAt = clampDueAt(record.dueAt, now);
  if (dueAt !== void 0) task.dueAt = dueAt;
  if (Array.isArray(record.subtasks)) {
    const subtasks = [];
    for (const item of record.subtasks.slice(0, 50)) {
      const coerced = coerceSubtask(item, now);
      if (coerced !== void 0) subtasks.push(coerced);
    }
    if (subtasks.length > 0) {
      task.subtasks = subtasks;
      if (!task.done && subtasks.every((sub) => sub.done)) {
        task.done = true;
        task.status = "done";
        if (task.completedAt === void 0) task.completedAt = readTime(record.updatedAt, now, now);
      }
    }
  }
  return task;
}
function coerceSubtask(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const id = readString(record.id);
  const title = sanitizeSubtask(record.title);
  if (id === void 0 || title === "") return void 0;
  const done = record.done === true;
  const subtask = {
    id,
    title: title.slice(0, MAX_SUBTASK_LENGTH),
    done,
    createdAt: readTime(record.createdAt, now, now)
  };
  if (done) subtask.doneAt = readTime(record.doneAt, now, now);
  return subtask;
}
function coerceLog(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const id = readString(record.id);
  const title = sanitizeTitle(record.title, MAX_TITLE_LENGTH);
  if (id === void 0 || title === "") return void 0;
  const kind = LOG_KINDS.find((item) => item === record.kind) ?? "manual";
  const sessionType = SESSION_TYPES.find((item) => item === record.sessionType);
  const log = {
    id,
    at: readTime(record.at, now, now),
    kind,
    title,
    source: record.source === "auto" ? "auto" : "manual",
    edited: record.edited === true
  };
  if (sessionType !== void 0) log.sessionType = sessionType;
  const detail = readString(record.detail);
  if (detail !== void 0) log.detail = sanitizeText(detail, BOARD_CONFIG.code.maxDetailChars * 4);
  const project = readString(record.project);
  if (project !== void 0) log.project = sanitizeTitle(project, 60);
  const projectId = readString(record.projectId);
  if (projectId !== void 0) log.projectId = projectId;
  const taskId = readString(record.taskId);
  if (taskId !== void 0) log.taskId = taskId;
  const sessionId = readString(record.sessionId);
  if (sessionId !== void 0) log.sessionId = sessionId;
  if (record.minutes !== void 0) log.minutes = clampFocusMinutes(record.minutes);
  if (record.hits !== void 0) log.hits = clampInteger(record.hits, 1, 999, 1);
  if (record.tokens !== void 0) log.tokens = clampInteger(record.tokens, 0, 1e7, 0);
  if (record.role === "user" || record.role === "assistant" || record.role === "tool") {
    log.role = record.role;
  }
  return log;
}
function coerceProject(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const id = readString(record.id);
  const name2 = sanitizeTitle(record.name, BOARD_CONFIG.projects.maxNameLength);
  if (id === void 0 || name2 === "") return void 0;
  const archived = record.archived === true;
  const project = {
    id,
    name: name2,
    archived,
    createdAt: readTime(record.createdAt, now, now)
  };
  const color = readString(record.color);
  if (color !== void 0) project.color = color;
  const note = readString(record.note);
  if (note !== void 0) project.note = sanitizeText(note, 300);
  const templateId = readString(record.templateId);
  if (templateId !== void 0) project.templateId = templateId;
  if (archived) project.archivedAt = readTime(record.archivedAt, now, now);
  return project;
}
function coerceFriction(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const id = readString(record.id);
  const summary = sanitizeText(record.summary, 200);
  if (id === void 0 || summary === "") return void 0;
  const at = readTime(record.at, now, now);
  const friction = {
    id,
    at,
    updatedAt: readTime(record.updatedAt, at, now),
    summary,
    hits: clampInteger(record.hits, 1, 999, 1),
    resolved: record.resolved === true
  };
  const detail = readString(record.detail);
  if (detail !== void 0) friction.detail = sanitizeText(detail, 600);
  const solution = readString(record.solution);
  if (solution !== void 0) friction.solution = sanitizeText(solution, 1e3);
  const projectId = readString(record.projectId);
  if (projectId !== void 0) friction.projectId = projectId;
  const taskId = readString(record.taskId);
  if (taskId !== void 0) friction.taskId = taskId;
  const sessionId = readString(record.sessionId);
  if (sessionId !== void 0) friction.sessionId = sessionId;
  const logId = readString(record.logId);
  if (logId !== void 0) friction.logId = logId;
  if (record.resolveMs !== void 0) {
    friction.resolveMs = clampInteger(record.resolveMs, 0, 365 * 24 * 3600 * 1e3, 0);
  }
  return friction;
}
function coerceSettings(value, now = Date.now()) {
  const defaults = createDefaultSettings(now);
  const record = asRecord2(value);
  if (record === void 0) return defaults;
  const rules = Array.isArray(record.projectRules) ? record.projectRules.slice(0, 20).map((rule, index) => {
    const entry = asRecord2(rule);
    const keyword = sanitizeTitle(entry?.keyword, 60);
    const project = sanitizeTitle(entry?.project, 40);
    if (keyword === "" || project === "") return void 0;
    const next = { id: readString(entry?.id) ?? `rule-${index}-${keyword}`, keyword, project };
    const projectId = readString(entry?.projectId);
    if (projectId !== void 0) next.projectId = projectId;
    if (entry?.regex === true) next.regex = true;
    return next;
  }).filter(
    (rule) => rule !== void 0
  ) : defaults.projectRules;
  const goalRecord = asRecord2(record.monthlyGoal);
  const month = readString(goalRecord?.month);
  return {
    autoCapture: record.autoCapture !== false,
    lastDurationMinutes: clampDurationMinutes(record.lastDurationMinutes, defaults.lastDurationMinutes),
    projectRules: rules.length > 0 ? rules : defaults.projectRules,
    monthlyGoal: {
      month: isMonthKey(month) ? month : "",
      targetMinutes: clampGoalMinutes(goalRecord?.targetMinutes, defaults.monthlyGoal.targetMinutes),
      targetTasks: clampGoalTasks(goalRecord?.targetTasks, defaults.monthlyGoal.targetTasks)
    },
    activeProjectId: sanitizeTitle(record.activeProjectId, 64),
    breakEnabled: record.breakEnabled !== false,
    shortBreakMinutes: clampBreakMinutes(record.shortBreakMinutes, defaults.shortBreakMinutes),
    longBreakMinutes: clampBreakMinutes(record.longBreakMinutes, defaults.longBreakMinutes),
    roundsBeforeLongBreak: clampInteger(
      record.roundsBeforeLongBreak,
      2,
      8,
      defaults.roundsBeforeLongBreak
    ),
    contextWarnMessages: clampInteger(record.contextWarnMessages, 10, 500, defaults.contextWarnMessages),
    contextDangerMessages: clampInteger(record.contextDangerMessages, 20, 1e3, defaults.contextDangerMessages),
    aiAutoDaily: record.aiAutoDaily === true,
    aiTier: record.aiTier === "summary" ? "summary" : "stats",
    heatmapYear: clampInteger(record.heatmapYear, 0, 2100, 0)
  };
}
function coerceMeta(value) {
  const record = asRecord2(value);
  if (record === void 0) return createDefaultMeta();
  const sessionTaskMap = {};
  const source = asRecord2(record.sessionTaskMap);
  if (source !== void 0) {
    const keys = Object.keys(source).slice(0, 200);
    for (const key of keys) {
      if (!isSafeKey(key)) continue;
      const target = readString(source[key]);
      if (target === void 0) continue;
      sessionTaskMap[key] = target;
    }
  }
  const meta = { sessionTaskMap };
  const drafts = coerceMemoryDrafts(record.memoryDrafts);
  if (Object.keys(drafts).length > 0) meta.memoryDrafts = drafts;
  if (isFiniteNumber(record.upgradedFrom)) meta.upgradedFrom = Math.round(record.upgradedFrom);
  if (isFiniteNumber(record.lastWeeklyAt) && record.lastWeeklyAt > 0) {
    meta.lastWeeklyAt = readTime(record.lastWeeklyAt, Date.now());
  }
  if (isFiniteNumber(record.lastContextPruneAt) && record.lastContextPruneAt > 0) {
    meta.lastContextPruneAt = readTime(record.lastContextPruneAt, Date.now());
  }
  if (isFiniteNumber(record.schemaStamp)) meta.schemaStamp = Math.round(record.schemaStamp);
  return meta;
}
function restoreTimerState(value, now = Date.now()) {
  const defaults = createDefaultTimerState(now);
  const record = asRecord2(value);
  if (record === void 0) return { state: defaults };
  const phase = TIMER_PHASES.find((item) => item === record.phase) ?? "focus";
  const isBreak = phase !== "focus";
  const durationMinutes = isBreak ? clampBreakMinutes(record.durationMinutes, phase === "long" ? 15 : 5) : clampDurationMinutes(record.durationMinutes, defaults.durationMinutes);
  const roundInCycle = clampInteger(record.roundInCycle, 0, 7, 0);
  const boundTaskId = readString(record.boundTaskId) ?? "";
  const startedAt = isFiniteNumber(record.startedAt) && record.startedAt > 0 ? record.startedAt : null;
  let deadline = isFiniteNumber(record.deadline) && record.deadline > 0 ? record.deadline : null;
  let warning;
  let running = record.running === true && deadline !== null;
  if (running && deadline !== null) {
    const overdue = now - deadline;
    const overshoot = deadline - now - durationMinutes * 6e4;
    if (overdue > STALE_TIMER_MS) {
      running = false;
      deadline = null;
      warning = "发现超过 24 小时的残留计时，已重置（不会补记）";
    } else if (overshoot > 12e4) {
      running = false;
      deadline = null;
      warning = "计时时间戳异常（指向未来），已重置";
    }
  }
  const maxSeconds = durationMinutes * 60;
  const storedRemaining = isFiniteNumber(record.remainingSeconds) ? record.remainingSeconds : maxSeconds;
  const focusMinutes = clampDurationMinutes(record.focusMinutes, defaults.durationMinutes);
  const remainingSeconds = clampInteger(storedRemaining, 0, maxSeconds, maxSeconds);
  const keepStartedAt = startedAt !== null && (running || phase === "focus" && remainingSeconds > 0);
  const roundId = typeof record.roundId === "string" && /^focus-[a-z0-9-]+$/i.test(record.roundId) ? record.roundId : "";
  const lastMinutes = isFiniteNumber(record.lastMinutes) ? clampInteger(record.lastMinutes, 0, maxSeconds / 60, 0) : void 0;
  const pending = record.pendingResult;
  const pendingResult = typeof pending === "object" && pending !== null && typeof pending.roundId === "string" && /^focus-[a-z0-9-]+$/i.test(pending.roundId) && isFiniteNumber(pending.minutes) && isFiniteNumber(pending.endedAt) ? {
    roundId: pending.roundId,
    minutes: clampInteger(pending.minutes, 0, 24 * 60, 0),
    elapsedSeconds: clampInteger(pending.elapsedSeconds, 0, 24 * 60 * 60, 0),
    targetMinutes: clampInteger(pending.targetMinutes, 0, 24 * 60, durationMinutes),
    taskId: typeof pending.taskId === "string" ? pending.taskId : "",
    startedAt: isFiniteNumber(pending.startedAt) ? readTime(pending.startedAt, now) : now,
    endedAt: readTime(pending.endedAt, now),
    ...(() => {
      const before = pending.before;
      if (typeof before !== "object" || before === null) return {};
      const record2 = before;
      if (typeof record2.day !== "string") return {};
      const num2 = (value2) => isFiniteNumber(value2) ? Math.max(0, Math.round(value2)) : null;
      return {
        before: {
          day: record2.day,
          dailyMinutes: num2(record2.dailyMinutes),
          taskId: typeof record2.taskId === "string" ? record2.taskId : "",
          taskMinutes: num2(record2.taskMinutes),
          taskPomodoros: num2(record2.taskPomodoros)
        }
      };
    })()
  } : void 0;
  return {
    state: {
      running,
      deadline: running ? deadline : null,
      durationMinutes,
      boundTaskId,
      startedAt: keepStartedAt ? startedAt : null,
      remainingSeconds,
      phase,
      roundInCycle,
      focusMinutes,
      ...roundId === "" ? {} : { roundId },
      ...lastMinutes === void 0 || lastMinutes === 0 ? {} : { lastMinutes },
      ...isFiniteNumber(record.lastEndedAt) && record.lastEndedAt > 0 ? { lastEndedAt: readTime(record.lastEndedAt, now) } : {},
      ...typeof record.lastTaskId === "string" && record.lastTaskId !== "" ? { lastTaskId: record.lastTaskId } : {},
      ...pendingResult === void 0 ? {} : { pendingResult }
    },
    ...warning === void 0 ? {} : { warning }
  };
}
var KNOWLEDGE_STATUS = ["todo", "learning", "learned", "review"];
var MEMORY_SOURCES = ["manual", "draft", "ai"];
var REVIEW_FORMS = ["recall", "code", "debug", "scenario"];
var EVENT_TYPES = [
  "project.created",
  "project.archived",
  "project.restored",
  "task.created",
  "task.completed",
  "task.reopened",
  "focus.completed",
  "log.debug",
  "log.milestone",
  "friction.created",
  "friction.resolved",
  "memory.updated",
  "decision.added",
  "knowledge.learned",
  "knowledge.reviewed",
  "history.snapshot"
];
function readStringList(value, limit, maxLength = 200) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of value.slice(0, limit * 2)) {
    const text = sanitizeText(item, maxLength);
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}
function coerceDecision(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const text = sanitizeText(record.text, 300);
  if (text === "") return void 0;
  const at = readTime(record.at, now, now);
  return {
    id: readString(record.id) ?? `decision-${at}`,
    at,
    text,
    status: record.status === "superseded" ? "superseded" : "active"
  };
}
function coerceMemory(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const projectId = readString(record.projectId);
  if (projectId === void 0) return void 0;
  const decisions = [];
  if (Array.isArray(record.decisions)) {
    for (const item of record.decisions.slice(0, 60)) {
      const coerced = coerceDecision(item, now);
      if (coerced !== void 0) decisions.push(coerced);
    }
  }
  const source = MEMORY_SOURCES.find((item) => item === record.source) ?? "manual";
  return {
    projectId,
    intro: sanitizeText(record.intro, 600),
    stack: readStringList(record.stack, 30, 40),
    architecture: sanitizeText(record.architecture, 4e3),
    done: readStringList(record.done, 120, 300),
    progress: sanitizeText(record.progress, 800),
    openIssues: readStringList(record.openIssues, 120, 300),
    resolvedIssues: readStringList(record.resolvedIssues, 120, 300),
    decisions,
    nextSteps: readStringList(record.nextSteps, 60, 300),
    updatedAt: readTime(record.updatedAt, now, now),
    version: clampInteger(record.version, 1, 1e5, 1),
    source
  };
}
function coerceKnowledgeNode(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const id = readString(record.id);
  const title = sanitizeTitle(record.title, 80);
  if (id === void 0 || title === "") return void 0;
  const status = KNOWLEDGE_STATUS.find((item) => item === record.status) ?? "todo";
  const mastery = clampInteger(record.mastery, 0, 5, 0);
  const node = {
    id,
    title,
    status,
    mastery,
    projectIds: readStringList(record.projectIds, 40, 64),
    taskIds: readStringList(record.taskIds, 100, 64),
    logIds: readStringList(record.logIds, 100, 64),
    frictionIds: readStringList(record.frictionIds, 100, 64),
    origin: record.origin === "ai" ? "ai" : "manual",
    createdAt: readTime(record.createdAt, now, now),
    updatedAt: readTime(record.updatedAt, now, now),
    reviewCount: clampInteger(record.reviewCount, 0, 1e4, 0)
  };
  const summary = readString(record.summary);
  if (summary !== void 0) node.summary = sanitizeText(summary, 400);
  const category = readString(record.category);
  if (category !== void 0) node.category = sanitizeTitle(category, 30);
  if (isFiniteNumber(record.lastReviewedAt) && record.lastReviewedAt > 0) {
    node.lastReviewedAt = readTime(record.lastReviewedAt, now, now);
  }
  if (isFiniteNumber(record.nextReviewAt) && record.nextReviewAt > 0) {
    node.nextReviewAt = readScheduleTime(record.nextReviewAt, now, now);
  }
  return node;
}
function coerceKnowledge(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return { nodes: [], edges: [] };
  const nodes = [];
  const seenNodes = /* @__PURE__ */ new Set();
  if (Array.isArray(record.nodes)) {
    for (const item of record.nodes.slice(0, 500)) {
      const node = coerceKnowledgeNode(item, now);
      if (node === void 0 || seenNodes.has(node.id)) continue;
      seenNodes.add(node.id);
      nodes.push(node);
    }
  }
  const edges = [];
  const seenEdges = /* @__PURE__ */ new Set();
  if (Array.isArray(record.edges)) {
    for (const item of record.edges.slice(0, 900)) {
      const edge = asRecord2(item);
      if (edge === void 0) continue;
      const fromId = readString(edge.fromId);
      const toId = readString(edge.toId);
      if (fromId === void 0 || toId === void 0) continue;
      if (fromId === toId) continue;
      if (!seenNodes.has(fromId) || !seenNodes.has(toId)) continue;
      const kind = edge.kind === "prereq" ? "prereq" : "related";
      const key = kind === "related" ? `r|${[fromId, toId].sort().join("|")}` : `p|${fromId}|${toId}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({
        id: readString(edge.id) ?? `edge-${edges.length}`,
        fromId,
        toId,
        kind
      });
    }
  }
  return { nodes, edges };
}
function coerceReview(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const nodeId = readString(record.nodeId);
  if (nodeId === void 0) return void 0;
  const form = REVIEW_FORMS.find((item) => item === record.form) ?? "recall";
  const grade = clampInteger(record.grade, 0, 3, 0);
  const at = readTime(record.at, now, now);
  const review = {
    id: readString(record.id) ?? `review-${at}`,
    nodeId,
    at,
    form,
    grade,
    nextAt: readScheduleTime(record.nextAt, at + 864e5, now),
    intervalDays: clampInteger(record.intervalDays, 1, 3650, 1)
  };
  const note = readString(record.note);
  if (note !== void 0) review.note = sanitizeText(note, 400);
  return review;
}
function coerceTimelineEvent(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const type = EVENT_TYPES.find((item) => item === record.type);
  if (type === void 0) return void 0;
  const title = sanitizeTitle(record.title, 120);
  if (title === "") return void 0;
  const at = readTime(record.at, now, now);
  const event = {
    id: readString(record.id) ?? `evt-${at}-${Math.random().toString(36).slice(2, 6)}`,
    at,
    type,
    title
  };
  const projectId = readString(record.projectId);
  if (projectId !== void 0) event.projectId = projectId;
  const refId = readString(record.refId);
  if (refId !== void 0) event.refId = refId;
  const detail = readString(record.detail);
  if (detail !== void 0) event.detail = sanitizeText(detail, 200);
  return event;
}
function coerceHistory(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const projectId = readString(record.projectId);
  if (projectId === void 0) return void 0;
  const counts = asRecord2(record.counts);
  const digest = asRecord2(record.memoryDigest);
  const at = readTime(record.at, now, now);
  return {
    id: readString(record.id) ?? `snap-${at}`,
    projectId,
    at,
    label: sanitizeTitle(record.label, 40),
    counts: {
      tasks: clampInteger(counts?.tasks, 0, 1e5, 0),
      done: clampInteger(counts?.done, 0, 1e5, 0),
      openFriction: clampInteger(counts?.openFriction, 0, 1e5, 0),
      knowledgeLearned: clampInteger(counts?.knowledgeLearned, 0, 1e5, 0)
    },
    taskDoneIds: readStringList(record.taskDoneIds, 800, 64),
    taskOpenIds: readStringList(record.taskOpenIds, 800, 64),
    openFrictionIds: readStringList(record.openFrictionIds, 400, 64),
    memoryVersion: clampInteger(record.memoryVersion, 0, 1e5, 0),
    memoryDigest: {
      intro: sanitizeText(digest?.intro, 300),
      stack: readStringList(digest?.stack, 30, 40),
      decisions: readStringList(digest?.decisions, 40, 200)
    }
  };
}
function isRealDay(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return false;
  const probe = new Date(year, month - 1, date);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === date;
}
function coerceDraftPatch(value) {
  const record = asRecord2(value);
  if (record === void 0) return {};
  const patch = {};
  const listFields = ["stack", "done", "openIssues", "resolvedIssues", "nextSteps"];
  for (const field of listFields) {
    const list = readStringList(record[field], 60, 300);
    if (list.length > 0) patch[field] = list;
  }
  const intro = sanitizeText(record.intro, 600);
  if (intro !== "") patch.intro = intro;
  const architecture = sanitizeText(record.architecture, 4e3);
  if (architecture !== "") patch.architecture = architecture;
  const progress = sanitizeText(record.progress, 800);
  if (progress !== "") patch.progress = progress;
  if (Array.isArray(record.decisions)) {
    const decisions = [];
    for (const item of record.decisions.slice(0, 60)) {
      const decision = coerceDecision(item);
      if (decision !== void 0) decisions.push(decision);
    }
    if (decisions.length > 0) patch.decisions = decisions;
  }
  return patch;
}
function coerceDaily(value) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const day = readString(record.day);
  if (day === void 0 || !isRealDay(day)) return void 0;
  return {
    day,
    focusMinutes: clampInteger(record.focusMinutes, 0, 24 * 60, 0),
    tasksDone: clampInteger(record.tasksDone, 0, 500, 0),
    sessions: clampInteger(record.sessions, 0, 2e3, 0),
    friction: clampInteger(record.friction, 0, 500, 0)
  };
}
function coerceAiRun(value, now = Date.now()) {
  const record = asRecord2(value);
  if (record === void 0) return void 0;
  const kind = ["daily", "weekly", "project", "memory", "knowledge"].find((item) => item === record.kind);
  if (kind === void 0) return void 0;
  const at = readTime(record.at, now, now);
  const run = {
    id: readString(record.id) ?? `ai-${at}`,
    at,
    kind,
    provider: record.provider === "openai-compatible" ? "openai-compatible" : "local",
    ok: record.ok === true,
    fallbackUsed: record.fallbackUsed === true
  };
  const model = readString(record.model);
  if (model !== void 0) run.model = sanitizeTitle(model, 60);
  const code = ["no-config", "network", "timeout", "bad-json", "rate-limit", "auth", "unknown"].find(
    (item) => item === record.errorCode
  );
  if (code !== void 0) run.errorCode = code;
  if (record.inputCharsApprox !== void 0) {
    run.inputCharsApprox = clampInteger(record.inputCharsApprox, 0, 1e7, 0);
  }
  if (record.outputChars !== void 0) {
    run.outputChars = clampInteger(record.outputChars, 0, 1e7, 0);
  }
  return run;
}
function coerceMemoryDrafts(value) {
  const record = asRecord2(value);
  if (record === void 0) return {};
  const out = /* @__PURE__ */ Object.create(null);
  for (const key of Object.keys(record).slice(0, 50)) {
    if (!isSafeKey(key)) continue;
    const entry = asRecord2(record[key]);
    if (entry === void 0) continue;
    const items = Array.isArray(entry.items) ? entry.items.map((item) => {
      const row = asRecord2(item);
      const text = sanitizeText(row?.text, 300);
      const field = typeof row?.field === "string" ? row.field : "";
      if (text === "" || field === "") return void 0;
      return { field, text, accepted: row?.accepted === true };
    }).filter((item) => item !== void 0).slice(0, 60) : [];
    out[key] = {
      projectId: key,
      at: readTime(entry.at, Date.now()),
      source: entry.source === "ai" ? "ai" : "logs",
      patch: coerceDraftPatch(entry.patch),
      rationale: sanitizeText(entry.rationale, 600),
      items
    };
  }
  return out;
}
function coerceList(data, coerce, limit) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const item of data.slice(0, limit)) {
    try {
      const coerced = coerce(item);
      if (coerced !== void 0) out.push(coerced);
    } catch {
    }
  }
  return out;
}
function coercePayload(key, data, now = Date.now()) {
  switch (key) {
    case STORAGE_KEYS.tasks:
      return coerceList(data, (item) => coerceTask(item, now), MAX_TASK_ENTRIES);
    case STORAGE_KEYS.logs:
      return coerceList(data, (item) => coerceLog(item, now), MAX_LOG_ENTRIES);
    case STORAGE_KEYS.projects:
      return coerceList(data, (item) => coerceProject(item, now), BOARD_CONFIG.projects.maxProjects * 4);
    case STORAGE_KEYS.friction:
      return coerceList(data, (item) => coerceFriction(item, now), MAX_FRICTION_ENTRIES);
    case STORAGE_KEYS.settings:
      return coerceSettings(data, now);
    case STORAGE_KEYS.timer:
      return restoreTimerState(data, now).state;
    case STORAGE_KEYS.meta:
      return coerceMeta(data);
    /* ── V4 ── */
    case STORAGE_KEYS.memory:
      return coerceList(data, (item) => coerceMemory(item, now), 60);
    case STORAGE_KEYS.knowledge:
      return coerceKnowledge(data, now);
    case STORAGE_KEYS.reviews:
      return coerceList(data, (item) => coerceReview(item, now), 2e3);
    case STORAGE_KEYS.timeline:
      return coerceList(data, (item) => coerceTimelineEvent(item, now), 1200);
    case STORAGE_KEYS.history:
      return coerceList(data, (item) => coerceHistory(item, now), 240);
    case STORAGE_KEYS.daily:
      return coerceList(data, (item) => coerceDaily(item), 800);
    case STORAGE_KEYS.aiRuns:
      return coerceList(data, (item) => coerceAiRun(item, now), 100);
    default:
      return data;
  }
}
function sanitizeAll(input) {
  const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
  const rawLogs = Array.isArray(input.logs) ? input.logs : [];
  const rawFriction = Array.isArray(input.friction) ? input.friction : [];
  const tasks = coerceList(rawTasks, (item) => coerceTask(item), MAX_TASK_ENTRIES);
  const logs = coerceList(rawLogs, (item) => coerceLog(item), MAX_LOG_ENTRIES);
  const friction = coerceList(rawFriction, (item) => coerceFriction(item), MAX_FRICTION_ENTRIES);
  const dropped = rawTasks.length - tasks.length + (rawLogs.length - logs.length) + (rawFriction.length - friction.length);
  return {
    tasks,
    logs,
    friction,
    report: { tasks: tasks.length, logs: logs.length, friction: friction.length, dropped, changed: dropped > 0 }
  };
}

// src/client/lib/debug.ts
var LOG_PREFIX = `${BOARD_CONFIG.logPrefix}:`;
function safeCall(level, scope, message, data) {
  try {
    const label = `${LOG_PREFIX} [${scope}] ${message}`;
    const fn = console[level];
    if (typeof fn !== "function") return;
    if (data === void 0) fn.call(console, label);
    else fn.call(console, label, data);
  } catch {
  }
}
function debug(scope, message, data) {
  safeCall("debug", scope, message, data);
}
function info(scope, message, data) {
  safeCall("info", scope, message, data);
}
function warn(scope, message, data) {
  safeCall("warn", scope, message, data);
}

// src/client/hooks/useBoardSettings.ts
var import_react4 = require("react");

// src/client/hooks/useLocalStore.ts
var import_react3 = require("react");
var reported = /* @__PURE__ */ new Set();
var KEY_LABELS2 = {
  "dsh-otaku-study-board:tasks": "任务",
  "dsh-otaku-study-board:logs": "会话日志",
  "dsh-otaku-study-board:projects": "项目",
  "dsh-otaku-study-board:settings": "设置",
  "dsh-otaku-study-board:timer": "计时状态",
  "dsh-otaku-study-board:friction": "阻碍记录",
  "dsh-otaku-study-board:meta": "运行状态"
};
function labelOf(key) {
  return KEY_LABELS2[key] ?? "本地数据";
}
function reportOnce(key, kind, message, level = "warn") {
  const token = `${key}:${kind}`;
  if (reported.has(token)) return;
  reported.add(token);
  pushNotice(message, level);
}
function isQuotaError(error) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error;
  if (candidate.name === "QuotaExceededError" || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (candidate.code === 22) return true;
  return typeof candidate.message === "string" && /quota|exceeded/i.test(candidate.message);
}
function createId(prefix = "osb") {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function readStoreEnvelope(key, fallback, coerce) {
  if (typeof window === "undefined") return { value: fallback, raw: null, recovered: false, legacy: false };
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    reportOnce(key, "unavailable", `无法访问本地存储（${labelOf(key)}），本次修改不会被保存`, "error");
    void error;
    return { value: fallback, raw: null, recovered: true, legacy: false };
  }
  if (raw === null || raw === "") return { value: fallback, raw: null, recovered: false, legacy: false };
  try {
    const parsed = JSON.parse(raw);
    const { data, legacy } = unwrapEnvelope(parsed);
    const mapper = coerce ?? ((input) => coercePayload(key, input));
    const value = mapper(data);
    if (value === void 0 || value === null) {
      return { value: fallback, raw, recovered: true, legacy };
    }
    return { value, raw, recovered: false, legacy };
  } catch (error) {
    reportOnce(
      key,
      "corrupt",
      `本地${labelOf(key)}已损坏，已用空数据重新开始（原值保留在存储里待排查）`,
      "error"
    );
    void error;
    return { value: fallback, raw: null, recovered: true, legacy: false };
  }
}
function writeStore(key, value) {
  if (typeof window === "undefined") return false;
  let raw;
  try {
    raw = JSON.stringify(wrapEnvelope(value));
  } catch (error) {
    reportOnce(key, "serialize", `${labelOf(key)}包含无法保存的内容，本次修改已跳过`, "error");
    void error;
    return false;
  }
  try {
    window.localStorage.setItem(key, raw);
  } catch (error) {
    reportOnce(
      key,
      isQuotaError(error) ? "quota" : "write",
      isQuotaError(error) ? "本地存储已满，本次修改没能保存。可以导出备份后清理旧日志" : `写入${labelOf(key)}失败，本次修改没能保存`,
      "error"
    );
    return false;
  }
  emit2(key, raw);
  return true;
}
function emit2(key, raw) {
  try {
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key, raw } }));
  } catch {
  }
}
function parseBroadcast(raw, key) {
  try {
    const { data } = unwrapEnvelope(JSON.parse(raw));
    return coercePayload(key, data);
  } catch {
    return void 0;
  }
}
function useLocalStore(key, initialValue, options) {
  const initialRef = (0, import_react3.useRef)(initialValue);
  const coerceRef = (0, import_react3.useRef)(options?.coerce);
  coerceRef.current = options?.coerce;
  const firstRead = (0, import_react3.useRef)(null);
  if (firstRead.current === null) {
    firstRead.current = readStoreEnvelope(key, initialRef.current, coerceRef.current);
  }
  const [value, setValue] = (0, import_react3.useState)(firstRead.current.value);
  const rawRef = (0, import_react3.useRef)(firstRead.current.raw);
  const touchedRef = (0, import_react3.useRef)(false);
  const dirtyRef = (0, import_react3.useRef)(false);
  const valueRef = (0, import_react3.useRef)(value);
  valueRef.current = value;
  (0, import_react3.useEffect)(() => {
    if (!touchedRef.current) return;
    let raw;
    try {
      raw = JSON.stringify(wrapEnvelope(value));
    } catch {
      return;
    }
    if (raw === rawRef.current) return;
    rawRef.current = raw;
    dirtyRef.current = !writeStore(key, value);
  }, [key, value]);
  (0, import_react3.useEffect)(() => {
    if (typeof window === "undefined") return;
    const onLocal = (event) => {
      const detail = event.detail;
      if (detail?.key !== key || typeof detail.raw !== "string") return;
      if (detail.raw === rawRef.current) return;
      const next = parseBroadcast(detail.raw, key);
      if (next === void 0) return;
      rawRef.current = detail.raw;
      setValue(next);
    };
    window.addEventListener(STORE_EVENT, onLocal);
    return () => {
      window.removeEventListener(STORE_EVENT, onLocal);
    };
  }, [key]);
  (0, import_react3.useEffect)(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        rawRef.current = null;
        setValue(initialRef.current);
        return;
      }
      const decision = decideRemoteChange({
        dirty: dirtyRef.current,
        remoteRaw: event.newValue,
        baseRaw: rawRef.current
      });
      if (decision === "conflict") {
        reportConflict(key, event.newValue);
        return;
      }
      const next = parseBroadcast(event.newValue, key);
      if (next === void 0) return;
      rawRef.current = event.newValue;
      setValue(next);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);
  (0, import_react3.useEffect)(() => {
    return onResolution(({ key: target, action }) => {
      if (target !== key) return;
      const entry = getConflict(key);
      if (entry === void 0) return;
      if (action === "reload") {
        const next = parseBroadcast(entry.remoteRaw, key);
        if (next !== void 0) {
          rawRef.current = entry.remoteRaw;
          setValue(next);
          dirtyRef.current = false;
        }
        resolveConflict(key);
        return;
      }
      touchedRef.current = true;
      if (writeStore(key, valueRef.current)) {
        dirtyRef.current = false;
        rawRef.current = JSON.stringify(wrapEnvelope(valueRef.current));
        resolveConflict(key);
      } else {
        pushNotice("保留本页失败：本地存储不可写，改动仍未保存", "error");
      }
    });
  }, [key]);
  const update = (0, import_react3.useCallback)(
    (next) => {
      touchedRef.current = true;
      const previous = valueRef.current;
      const value2 = typeof next === "function" ? next(previous) : next;
      valueRef.current = value2;
      try {
        const raw = JSON.stringify(wrapEnvelope(value2));
        const ok = writeStore(key, value2);
        if (ok) rawRef.current = raw;
        dirtyRef.current = !ok;
      } catch {
        dirtyRef.current = true;
      }
      setValue(value2);
    },
    [key]
  );
  const reset = (0, import_react3.useCallback)(() => {
    touchedRef.current = true;
    setValue(initialRef.current);
    writeStore(key, initialRef.current);
  }, [key]);
  return [value, update, reset];
}

// src/client/hooks/useBoardSettings.ts
function useBoardSettings() {
  const defaults = (0, import_react4.useMemo)(() => createDefaultSettings(), []);
  const [stored, setStored, resetStored] = useLocalStore(
    STORAGE_KEYS.settings,
    defaults,
    { coerce: (data) => coerceSettings(data) }
  );
  const settings = (0, import_react4.useMemo)(() => coerceSettings(stored), [stored]);
  const patch = (0, import_react4.useCallback)(
    (next) => {
      setStored((previous) => {
        const base = coerceSettings(previous);
        const merged = { ...base, ...next, monthlyGoal: base.monthlyGoal };
        if (next.monthlyGoal !== void 0) {
          merged.monthlyGoal = { ...base.monthlyGoal, ...next.monthlyGoal };
        }
        return coerceSettings(merged);
      });
    },
    [setStored]
  );
  return { settings, patch, reset: resetStored };
}

// src/client/hooks/useBoardData.ts
function useBoardData() {
  const [allTasks, setTasks] = useLocalStore(STORAGE_KEYS.tasks, []);
  const [allLogs, setLogs] = useLocalStore(STORAGE_KEYS.logs, []);
  const [allFriction, setFriction] = useLocalStore(STORAGE_KEYS.friction, []);
  const [projects, setProjects] = useLocalStore(STORAGE_KEYS.projects, []);
  const [meta, setMeta] = useLocalStore(STORAGE_KEYS.meta, createDefaultMeta());
  const { settings, patch } = useBoardSettings();
  const activeProjectId = (0, import_react5.useMemo)(
    () => normalizeActiveId(settings.activeProjectId, projects),
    [settings.activeProjectId, projects]
  );
  const [sanitized, setSanitized] = (0, import_react5.useState)(false);
  (0, import_react5.useEffect)(() => {
    if (sanitized || !BOARD_CONFIG.features.autoSanitize) return;
    setSanitized(true);
    try {
      const result = sanitizeAll({ tasks: allTasks, logs: allLogs, friction: allFriction });
      if (!result.report.changed) return;
      warn("storage", `dropped ${result.report.dropped} dirty records on startup`, result.report);
      if (result.tasks.length !== allTasks.length) setTasks(result.tasks);
      if (result.logs.length !== allLogs.length) setLogs(result.logs);
      if (result.friction.length !== allFriction.length) setFriction(result.friction);
    } catch (error) {
      warn("storage", "startup sanitize failed — data left untouched", error);
    }
  }, []);
  const scopedTaskList = (0, import_react5.useMemo)(
    () => scopedTasks(allTasks, activeProjectId, projects),
    [allTasks, activeProjectId, projects]
  );
  const scopedLogList = (0, import_react5.useMemo)(
    () => scopedLogs(allLogs, activeProjectId, projects),
    [allLogs, activeProjectId, projects]
  );
  const scopedFrictionList = (0, import_react5.useMemo)(
    () => scopedFriction(allFriction, activeProjectId, projects),
    [allFriction, activeProjectId, projects]
  );
  const setActiveProject = (0, import_react5.useCallback)(
    (id) => {
      patch({ activeProjectId: id });
    },
    [patch]
  );
  return {
    tasks: scopedTaskList,
    logs: scopedLogList,
    friction: scopedFrictionList,
    allTasks,
    allLogs,
    allFriction,
    projects,
    activeProjects: projects.filter((item) => !item.archived),
    activeProjectId,
    activeProject: projects.find((item) => item.id === activeProjectId),
    meta,
    setTasks,
    setLogs,
    setFriction,
    setMeta,
    setProjects,
    setActiveProject
  };
}
function useNow(intervalMs = 3e4) {
  const [now, setNow] = (0, import_react5.useState)(() => Date.now());
  (0, import_react5.useEffect)(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

// src/client/v4/ui.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function Button({
  variant = "secondary",
  size = "md",
  disabled,
  loading = false,
  onClick,
  children,
  title,
  ariaLabel,
  id
}) {
  const classes = ["v4-btn"];
  if (variant === "primary") classes.push("v4-btn-primary");
  if (variant === "ghost") classes.push("v4-btn-ghost");
  if (variant === "danger") classes.push("v4-btn-danger");
  if (variant === "icon") classes.push("v4-btn-icon");
  if (size === "sm") classes.push("v4-btn-sm");
  if (loading) classes.push("v4-btn-loading");
  const blocked = disabled === true || loading;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "button",
    {
      id,
      type: "button",
      className: classes.join(" "),
      disabled: blocked,
      "aria-busy": loading ? true : void 0,
      "aria-label": ariaLabel,
      title,
      onClick: blocked ? void 0 : onClick,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "v4-btn-label", children }),
        loading ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "v4-btn-spinner", "aria-hidden": "true" }) : null
      ]
    }
  );
}
function Card({ variant = "default", title, meta, children, className, pad = "default" }) {
  const glass = variant === "quiet" || variant === "stat" ? "v4-glass-2" : "v4-glass-1";
  const elevated = variant === "feature" ? "v4-glass-elevated" : "";
  const classes = [glass, elevated, className ?? ""].filter(Boolean).join(" ");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: classes, style: { padding: pad === "none" ? 0 : "var(--v4-s4)" }, children: [
    title === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { className: "v4-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "v4-card-title", children: title }),
      meta === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "v4-card-meta", children: meta })
    ] }),
    children
  ] });
}
function StateView({ kind, title, hint, action }) {
  if (kind === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "grid", gap: 8 }, "aria-busy": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "v4-skeleton", style: { width: "62%" } }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "v4-skeleton", style: { width: "88%" } }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "v4-skeleton", style: { width: "74%" } })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "grid", gap: 6, justifyItems: "start", minHeight: kind === "empty" ? 120 : 0, alignContent: "center" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { margin: 0, fontSize: 13, color: "var(--v4-text-2)" }, children: title }),
    hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { margin: 0, fontSize: 12, color: "var(--v4-text-3)" }, children: hint }),
    action === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { marginTop: 4 }, children: action })
  ] });
}
function Sparkline({
  values,
  width = 260,
  height = 56,
  labels,
  ariaLabel = "近 7 日专注趋势",
  onSelect
}) {
  const max = Math.max(1, ...values);
  const step = values.length <= 1 ? width : width / (values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - value / max * (height - 6) - 3).toFixed(1)}`);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", "aria-label": ariaLabel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("polyline", { points: points.join(" "), fill: "none", stroke: "var(--v4-accent)", strokeWidth: 1.8, strokeLinecap: "round" }),
    points.map((point, index) => {
      const [x, y] = point.split(",");
      const label = `${labels?.[index] ?? `第 ${index + 1} 天`} · ${values[index] ?? 0} 分钟`;
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: x, cy: y, r: 2.4, fill: "var(--v4-accent)", opacity: 0.9, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("title", { children: label }) }),
        onSelect === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "circle",
          {
            className: "v4-spark-hit",
            cx: x,
            cy: y,
            r: 9,
            fill: "transparent",
            role: "button",
            tabIndex: 0,
            "aria-label": `查看 ${label}`,
            onClick: () => onSelect(index),
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(index);
              }
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("title", { children: label })
          }
        )
      ] }, index);
    })
  ] });
}
function ProgressRing({ value, size = 64 }) {
  const clamped = Math.min(1, Math.max(0, value));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": `完成度 ${Math.round(clamped * 100)}%`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: "var(--v4-border)", strokeWidth: stroke }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "circle",
      {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: "none",
        stroke: "var(--v4-accent)",
        strokeWidth: stroke,
        strokeLinecap: "round",
        strokeDasharray: `${circumference * clamped} ${circumference}`,
        transform: `rotate(-90 ${size / 2} ${size / 2})`
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("text", { x: "50%", y: "52%", dominantBaseline: "middle", textAnchor: "middle", fontSize: size <= 48 ? 9 : 11, fill: "var(--v4-text-2)", children: [
      Math.round(clamped * 100),
      "%"
    ] })
  ] });
}
function ProgressBar({ value, showValue = false }) {
  const clamped = Math.min(1, Math.max(0, value));
  const pct = Math.round(clamped * 100);
  const label = pct === 0 && clamped > 0 ? "<1%" : `${pct}%`;
  const style = { height: 6, borderRadius: 999, background: "var(--v4-border)", overflow: "hidden" };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...style, flex: 1 }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { width: `${pct}%`, height: "100%", background: "var(--v4-accent)", transition: "width var(--v4-dur) var(--v4-ease)" } }) }),
    showValue ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 11, color: "var(--v4-text-3)", minWidth: 32, textAlign: "right" }, children: label }) : null
  ] });
}
function StreakDots({ active, labels }) {
  const count = active.filter(Boolean).length;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      role: "img",
      "aria-label": `近 7 日有 ${count} 天学习记录`,
      style: { display: "flex", gap: 4, marginTop: 8 },
      children: active.map((on, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "span",
        {
          title: `${labels[index] ?? `第 ${index + 1} 天`} · ${on ? "有记录" : "无记录"}`,
          style: {
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: on ? "var(--v4-accent)" : "transparent",
            border: on ? "1px solid transparent" : "1px solid var(--v4-border-strong)"
          }
        },
        index
      ))
    }
  );
}

// src/client/v4/Detail.tsx
var import_react10 = require("react");
var import_react_dom = require("react-dom");

// src/client/ui/overlay.ts
function overlayHost() {
  const pages = Array.from(document.querySelectorAll(".osb-page"));
  const visible = pages.find((page) => page.getClientRects().length > 0);
  return visible ?? pages[0] ?? document.body;
}

// src/client/v4/DetailContent.tsx
var import_react8 = require("react");

// src/client/hooks/useBoardActions.ts
var import_react6 = require("react");

// src/client/lib/daily.ts
function emptyDaily(day) {
  return { day, focusMinutes: 0, tasksDone: 0, sessions: 0, friction: 0 };
}
function applyDailyDelta(list, day, delta, now = Date.now()) {
  const index = list.findIndex((item) => item.day === day);
  const base = index >= 0 ? list[index] : emptyDaily(day);
  const next = {
    day,
    focusMinutes: clampAdd(base.focusMinutes, delta.focusMinutes, 24 * 60),
    tasksDone: clampAdd(base.tasksDone, delta.tasksDone, 1e3),
    sessions: clampAdd(base.sessions, delta.sessions, 5e3),
    friction: clampAdd(base.friction, delta.friction, 1e3)
  };
  const copy = index >= 0 ? list.map((item, i) => i === index ? next : item) : [...list, next];
  copy.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  const limit = BOARD_CONFIG.daily.maxDays;
  void now;
  return copy.length > limit ? copy.slice(copy.length - limit) : copy;
}
function clampAdd(base, delta, max) {
  if (delta === void 0 || !Number.isFinite(delta)) return Math.max(0, Math.round(base));
  return Math.min(max, Math.max(0, Math.round(base + delta)));
}
function setDailyValue(list, day, field, value, now = Date.now()) {
  const clamped = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const limit = field === "focusMinutes" ? 24 * 60 : field === "tasksDone" ? 1e3 : field === "sessions" ? 5e3 : 1e3;
  const finalValue = Math.min(limit, clamped);
  const index = list.findIndex((item) => item.day === day);
  const base = index >= 0 ? list[index] : emptyDaily(day);
  const next = { ...base, [field]: finalValue };
  const copy = index >= 0 ? list.map((item, i) => i === index ? next : item) : [...list, next];
  copy.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  const maxDays = BOARD_CONFIG.daily.maxDays;
  void now;
  return copy.length > maxDays ? copy.slice(copy.length - maxDays) : copy;
}
function syncDailyTasks(list, tasks, day, now = Date.now()) {
  let count = 0;
  for (const task of tasks) {
    if (task.completedAt === void 0) continue;
    if (dayKey(task.completedAt) === day) count += 1;
  }
  return setDailyValue(list, day, "tasksDone", count, now);
}

// src/client/lib/timeline.ts
var EVENT_META = {
  "project.created": { label: "项目创建", category: "project" },
  "project.archived": { label: "项目归档", category: "project" },
  "project.restored": { label: "项目解封", category: "project" },
  "task.created": { label: "新建任务", category: "task" },
  "task.completed": { label: "完成任务", category: "task" },
  "task.reopened": { label: "任务重开", category: "task" },
  "task.deleted": { label: "删除任务", category: "task" },
  "focus.completed": { label: "专注完成", category: "focus" },
  "log.debug": { label: "排错记录", category: "debug" },
  "log.milestone": { label: "里程碑", category: "debug" },
  "friction.created": { label: "出现阻碍", category: "debug" },
  "friction.resolved": { label: "解决阻碍", category: "debug" },
  "memory.updated": { label: "记忆更新", category: "memory" },
  "decision.added": { label: "技术决策", category: "memory" },
  "knowledge.learned": { label: "知识掌握", category: "knowledge" },
  "knowledge.reviewed": { label: "知识复习", category: "knowledge" },
  "history.snapshot": { label: "历史快照", category: "memory" }
};
var EVENT_TYPES2 = Object.keys(EVENT_META);
function makeEvent(input, now = Date.now()) {
  const at = input.at ?? now;
  const event = {
    id: `evt-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at,
    type: input.type,
    title: input.title.slice(0, 120)
  };
  if (input.projectId !== void 0 && input.projectId !== "") event.projectId = input.projectId;
  if (input.refId !== void 0 && input.refId !== "") event.refId = input.refId;
  if (input.detail !== void 0) event.detail = input.detail.slice(0, 200);
  return event;
}
function appendEvent(list, event, options = {}) {
  const dedupeMs = options.dedupeMs ?? BOARD_CONFIG.timeline.dedupeMs;
  const maxEvents = options.maxEvents ?? BOARD_CONFIG.timeline.maxEvents;
  const key = `${event.type}|${event.projectId ?? ""}|${event.refId ?? ""}`;
  const keyOf = (item) => `${item.type}|${item.projectId ?? ""}|${item.refId ?? ""}`;
  for (const item of list) {
    if (Math.abs(item.at - event.at) > dedupeMs) continue;
    if (keyOf(item) === key) return { list, added: false };
  }
  const index = list.findIndex((item) => item.at <= event.at);
  const next = index < 0 ? [...list, event] : [...list.slice(0, index), event, ...list.slice(index)];
  return { list: next.length > maxEvents ? next.slice(0, maxEvents) : next, added: true };
}

// src/client/lib/memory.ts
function memoryOf(list, projectId) {
  return list.find((item) => item.projectId === projectId);
}
function memoryDigest(memory) {
  if (memory === void 0) return { intro: "", stack: [], decisions: [] };
  return {
    intro: memory.intro.slice(0, 300),
    stack: [...memory.stack],
    decisions: memory.decisions.filter((item) => item.status === "active").map((item) => item.text)
  };
}

// src/client/lib/history.ts
function buildHistorySnapshot(input) {
  const now = input.now ?? Date.now();
  const tasks = input.tasks.filter((task) => (task.projectId ?? "") === input.project.id);
  const friction = input.friction.filter((item) => (item.projectId ?? "") === input.project.id);
  const knowledgeNodes = (input.knowledge?.nodes ?? []).filter((node) => node.projectIds.includes(input.project.id));
  const done = tasks.filter((task) => task.done).map((task) => task.id);
  const open = tasks.filter((task) => !task.done).map((task) => task.id);
  const openFriction = friction.filter((item) => !item.resolved).map((item) => item.id);
  return {
    id: `snap-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    projectId: input.project.id,
    at: now,
    label: (input.label ?? "手动快照").slice(0, 40),
    counts: {
      tasks: tasks.length,
      done: done.length,
      openFriction: openFriction.length,
      knowledgeLearned: knowledgeNodes.filter((node) => node.status === "learned").length
    },
    taskDoneIds: done,
    taskOpenIds: open,
    openFrictionIds: openFriction,
    memoryVersion: input.memory?.version ?? 0,
    memoryDigest: memoryDigest(input.memory)
  };
}
function snapshotsOf(list, projectId) {
  return list.filter((item) => item.projectId === projectId).sort((a, b) => b.at - a.at);
}
function pruneSnapshots(list, perProject = BOARD_CONFIG.history.maxPerProject) {
  const grouped = /* @__PURE__ */ new Map();
  for (const item of list) {
    const bucket = grouped.get(item.projectId);
    if (bucket === void 0) grouped.set(item.projectId, [item]);
    else bucket.push(item);
  }
  const keep = [];
  for (const bucket of grouped.values()) {
    const sorted = [...bucket].sort((a, b) => a.at - b.at);
    if (sorted.length <= perProject) {
      keep.push(...sorted);
      continue;
    }
    const baseline = sorted[0];
    const recent = sorted.slice(sorted.length - (perProject - 1));
    keep.push(baseline, ...recent.filter((item) => item.id !== baseline.id));
  }
  return keep.sort((a, b) => a.at - b.at);
}
function latestSnapshot(list, projectId) {
  return snapshotsOf(list, projectId)[0];
}
function needsAutoSnapshot(list, projectId, now = Date.now(), intervalMs = BOARD_CONFIG.history.autoIntervalMs) {
  const latest = latestSnapshot(list, projectId);
  if (latest === void 0) return true;
  return now - latest.at >= intervalMs;
}

// src/client/lib/knowledge.ts
function removeNode(graph, id) {
  return {
    nodes: graph.nodes.filter((node) => node.id !== id),
    edges: graph.edges.filter((edge) => edge.fromId !== id && edge.toId !== id)
  };
}
function unlinkFrom(graph, target) {
  const strip = (list, id) => id === void 0 || id === "" ? list : list.filter((item) => item !== id);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      projectIds: strip(node.projectIds, target.projectId),
      taskIds: strip(node.taskIds, target.taskId),
      logIds: strip(node.logIds, target.logId),
      frictionIds: strip(node.frictionIds, target.frictionId)
    }))
  };
}
function graphStats(graph) {
  let learned = 0;
  let learning = 0;
  let todo = 0;
  let review = 0;
  const now = Date.now();
  let dueCount = 0;
  for (const node of graph.nodes) {
    if (node.status === "learned") learned += 1;
    else if (node.status === "learning") learning += 1;
    else if (node.status === "review") review += 1;
    else todo += 1;
    if (node.nextReviewAt !== void 0 && node.nextReviewAt <= now) dueCount += 1;
  }
  return { total: graph.nodes.length, learned, learning, todo, review, edges: graph.edges.length, dueCount };
}

// src/client/lib/review.ts
function pruneReviews(reviews, validNodeIds) {
  const kept = reviews.filter((record) => validNodeIds.has(record.nodeId));
  return { reviews: kept, removed: reviews.length - kept.length };
}
function reviewStats(reviews, now = Date.now()) {
  const today = dayKey(now);
  const weekStart = now - 7 * 864e5;
  let todayCount = 0;
  let weekCount = 0;
  let gradeSum = 0;
  for (const record of reviews) {
    if (dayKey(record.at) === today) todayCount += 1;
    if (record.at >= weekStart) weekCount += 1;
    gradeSum += record.grade;
  }
  const days = new Set(reviews.map((record) => dayKey(record.at)));
  let streak = 0;
  const cursor = new Date(startOfDay(now));
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (streak < 400 && days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    total: reviews.length,
    today: todayCount,
    week: weekCount,
    avgGrade: reviews.length === 0 ? 0 : Math.round(gradeSum / reviews.length * 10) / 10,
    streakDays: streak
  };
}

// src/client/lib/hash.ts
function fnv1a(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function contentSignature(kind, text) {
  const normalized = text.replace(/\s+/g, " ").trim().slice(0, 600);
  return `${kind}:${fnv1a(normalized)}`;
}
function createDedupeWindow(windowMs = BOARD_CONFIG.capture.hashWindowMs, capacity = BOARD_CONFIG.capture.hashBufferSize) {
  const ring = [];
  return {
    admit(signature, now = Date.now()) {
      try {
        for (let index = ring.length - 1; index >= 0; index -= 1) {
          const item = ring[index];
          if (item === void 0) continue;
          if (now - item.at > windowMs) break;
          if (item.signature === signature) {
            item.at = now;
            return false;
          }
        }
        ring.push({ signature, at: now });
        if (ring.length > capacity) ring.splice(0, ring.length - capacity);
        return true;
      } catch {
        return true;
      }
    },
    clear() {
      ring.length = 0;
    },
    size() {
      return ring.length;
    }
  };
}
function similarity(a, b) {
  const normalize = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const left = normalize(a);
  const right = normalize(b);
  if (left === "" || right === "") return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;
  const grams = (text) => {
    const map = /* @__PURE__ */ new Map();
    for (let index = 0; index < text.length - 1; index += 1) {
      const gram = text.slice(index, index + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  let total = 0;
  for (const [gram, count] of leftGrams) {
    total += count;
    overlap += Math.min(count, rightGrams.get(gram) ?? 0);
  }
  for (const count of rightGrams.values()) total += count;
  return total === 0 ? 0 : 2 * overlap / total;
}

// src/client/lib/friction.ts
var SIMILARITY_THRESHOLD = 0.55;
function isFrictionCandidate(log) {
  if (log.kind === "focus") return false;
  if (log.kind === "friction") return false;
  if (log.sessionType !== "debug") return false;
  return log.title.trim() !== "";
}
function buildFrictionDraft(draft, options = {}) {
  if (!isFrictionCandidate(draft)) return void 0;
  const at = options.now ?? draft.at;
  const summary = summarizeError(draft.detail ?? draft.title);
  if (summary.trim() === "") return void 0;
  const record = {
    at,
    updatedAt: at,
    summary: summary.slice(0, 160),
    hits: 1,
    resolved: false
  };
  if (draft.detail !== void 0) record.detail = draft.detail.slice(0, 300);
  if (options.projectId !== void 0 && options.projectId !== "") record.projectId = options.projectId;
  else if (draft.projectId !== void 0) record.projectId = draft.projectId;
  if (options.taskId !== void 0 && options.taskId !== "") record.taskId = options.taskId;
  else if (draft.taskId !== void 0) record.taskId = draft.taskId;
  if (options.sessionId !== void 0 && options.sessionId !== "") record.sessionId = options.sessionId;
  else if (draft.sessionId !== void 0) record.sessionId = draft.sessionId;
  if (options.logId !== void 0) record.logId = options.logId;
  return record;
}
function mergeFriction(records, incoming, now = Date.now()) {
  const windowStart = now - BOARD_CONFIG.friction.weekMs;
  const hitIndex = records.findIndex((record) => {
    if (record.at < windowStart) return false;
    if ((record.projectId ?? "") !== (incoming.projectId ?? "")) return false;
    return similarity(record.summary, incoming.summary) >= SIMILARITY_THRESHOLD;
  });
  if (hitIndex >= 0) {
    const existing = records[hitIndex];
    if (existing === void 0) {
      const id2 = `friction-${now.toString(36)}`;
      const next3 = { ...incoming, id: id2 };
      return { records: [next3, ...records], merged: false, id: id2 };
    }
    const next2 = {
      ...existing,
      hits: existing.hits + 1,
      at: Math.max(existing.at, incoming.at),
      updatedAt: now
    };
    if (next2.detail === void 0 && incoming.detail !== void 0) next2.detail = incoming.detail;
    if (next2.taskId === void 0 && incoming.taskId !== void 0) next2.taskId = incoming.taskId;
    if (next2.logId === void 0 && incoming.logId !== void 0) next2.logId = incoming.logId;
    const copy = [...records];
    copy[hitIndex] = next2;
    return { records: copy, merged: true, id: next2.id };
  }
  const id = `friction-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const next = { ...incoming, id };
  return { records: [next, ...records].slice(0, BOARD_CONFIG.friction.maxRecords), merged: false, id };
}

// src/client/lib/actions.ts
function pushEvent(list, event) {
  return appendEvent(list, event).list;
}
function createTask(input) {
  const title = input.title.trim();
  if (title === "") return {};
  if (input.id.trim() === "" || input.tasks.some((task2) => task2.id === input.id)) return {};
  if (input.dueAt !== void 0 && !Number.isFinite(input.dueAt)) return {};
  if (input.projectId !== void 0 && input.projectId !== "" && input.projects !== void 0 && !input.projects.some((project) => project.id === input.projectId && !project.archived)) {
    return {};
  }
  const at = input.at ?? Date.now();
  const task = {
    id: input.id,
    title,
    status: "todo",
    done: false,
    pomodoros: 0,
    createdAt: at,
    updatedAt: at,
    ...input.note === void 0 || input.note.trim() === "" ? {} : { note: input.note.trim() },
    ...input.priority === void 0 ? {} : { priority: input.priority },
    ...input.dueAt === void 0 ? {} : { dueAt: input.dueAt },
    ...input.projectId === void 0 || input.projectId === "" ? {} : { projectId: input.projectId }
  };
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "task.created",
        title: `新建任务：${title}`,
        refId: task.id,
        ...task.projectId === void 0 ? {} : { projectId: task.projectId }
      },
      at
    )
  );
  return { tasks: [task, ...input.tasks], timeline };
}
function updateTask(input) {
  const existing = input.tasks.find((task) => task.id === input.taskId);
  if (existing === void 0) return {};
  const { patch } = input;
  if (patch.title !== void 0 && patch.title.trim() === "") return {};
  if (patch.projectId !== void 0 && patch.projectId !== "" && input.projects !== void 0 && !input.projects.some((project) => project.id === patch.projectId && !project.archived)) {
    return {};
  }
  if (patch.dueAt !== void 0 && patch.dueAt !== null && !Number.isFinite(patch.dueAt)) return {};
  const next = { ...existing };
  let changed = false;
  const set = (key, value) => {
    if (next[key] === value) return;
    next[key] = value;
    changed = true;
  };
  if (patch.title !== void 0) set("title", patch.title.trim());
  if (patch.note !== void 0) {
    if (patch.note.trim() === "") delete next.note;
    else set("note", patch.note.trim());
  }
  if (patch.priority !== void 0) set("priority", patch.priority);
  if (patch.dueAt !== void 0) {
    if (patch.dueAt === null) {
      if (next.dueAt !== void 0) {
        delete next.dueAt;
        changed = true;
      }
    } else set("dueAt", patch.dueAt);
  }
  if (patch.projectId !== void 0) {
    if (patch.projectId === "") {
      if (next.projectId !== void 0) {
        delete next.projectId;
        changed = true;
      }
    } else set("projectId", patch.projectId);
  }
  if (!changed) return {};
  next.updatedAt = input.at ?? Date.now();
  return { tasks: input.tasks.map((task) => task.id === next.id ? next : task) };
}
function completeTask(input) {
  const at = input.at ?? Date.now();
  const existing = input.tasks.find((task) => task.id === input.taskId);
  if (existing === void 0) return {};
  if (existing.done) return {};
  const tasks = input.tasks.map(
    (task) => task.id === input.taskId ? { ...task, done: true, status: "done", completedAt: at, updatedAt: at } : task
  );
  const daily = syncDailyTasks(input.daily, tasks, dayKey(at), at);
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "task.completed",
        title: `完成任务：${existing.title}`,
        refId: existing.id,
        ...existing.projectId === void 0 ? {} : { projectId: existing.projectId }
      },
      at
    )
  );
  const result = { tasks, daily, timeline };
  const shouldSnapshot = input.project !== void 0 && (input.requestSnapshot === true || needsAutoSnapshot(input.history ?? [], input.project.id, at));
  if (shouldSnapshot && input.project !== void 0) {
    result.snapshot = buildHistorySnapshot({
      project: input.project,
      tasks,
      friction: input.friction ?? [],
      ...input.memory === void 0 ? {} : { memory: memoryOf(input.memory, input.project.id) },
      now: at
    });
  }
  return result;
}
function reopenTask(input) {
  const at = input.at ?? Date.now();
  const existing = input.tasks.find((task) => task.id === input.taskId);
  if (existing === void 0 || !existing.done) return {};
  const tasks = input.tasks.map(
    (task) => task.id === input.taskId ? { ...task, done: false, status: "todo", completedAt: void 0, updatedAt: at } : task
  );
  const daily = syncDailyTasks(input.daily, tasks, dayKey(at), at);
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "task.reopened",
        title: `重开任务：${existing.title}`,
        refId: existing.id,
        ...existing.projectId === void 0 ? {} : { projectId: existing.projectId }
      },
      at
    )
  );
  return { tasks, daily, timeline };
}
function deleteTask(input) {
  const existing = input.tasks.find((task) => task.id === input.taskId);
  if (existing === void 0) return {};
  const at = input.at ?? Date.now();
  const tasks = input.tasks.filter((task) => task.id !== input.taskId);
  const result = { tasks };
  if (input.logs !== void 0) {
    result.logs = input.logs.map((log) => {
      if (log.taskId !== input.taskId) return log;
      const next = { ...log };
      delete next.taskId;
      return next;
    });
  }
  if (input.graph !== void 0) result.graph = unlinkFrom(input.graph, { taskId: input.taskId });
  if (input.meta !== void 0) {
    const sessionTaskMap = {};
    for (const [sessionId, taskId] of Object.entries(input.meta.sessionTaskMap)) {
      if (taskId !== input.taskId) sessionTaskMap[sessionId] = taskId;
    }
    result.meta = { sessionTaskMap };
  }
  if (input.daily !== void 0 && existing.completedAt !== void 0) {
    result.daily = syncDailyTasks(input.daily, tasks, dayKey(existing.completedAt), at);
  }
  if (input.timeline !== void 0) {
    result.timeline = pushEvent(
      input.timeline,
      makeEvent(
        {
          type: "task.deleted",
          title: `删除任务：${existing.title}`,
          refId: existing.id,
          ...existing.projectId === void 0 ? {} : { projectId: existing.projectId }
        },
        at
      )
    );
  }
  return result;
}
function addFocusLog(input) {
  const at = input.at ?? input.log.at;
  if (input.logs.some((log) => log.id === input.log.id)) return {};
  const minutes = Math.max(0, Math.round(input.log.minutes ?? 0));
  const logs = [input.log, ...input.logs];
  const daily = applyDailyDelta(input.daily, dayKey(at), { focusMinutes: minutes }, at);
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "focus.completed",
        title: `专注 ${minutes} 分钟`,
        refId: input.log.id,
        ...input.log.projectId === void 0 ? {} : { projectId: input.log.projectId }
      },
      at
    )
  );
  return { logs, daily, timeline };
}
function finishFocus(input) {
  const { result } = input;
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(result.minutes)));
  if (minutes < 1) return {};
  const id = result.roundId.trim();
  if (id === "") return {};
  if (input.logs.some((log2) => log2.id === id)) return {};
  const at = result.endedAt;
  const task = input.task;
  const projectId = task?.projectId ?? (input.activeProjectId !== void 0 && input.activeProjectId !== "" ? input.activeProjectId : void 0);
  const projectName = input.projects?.find((item) => item.id === projectId)?.name;
  const log = {
    id,
    at,
    kind: "focus",
    sessionType: classifyTitle(task?.title ?? ""),
    title: `${minutes} 分钟专注${task === void 0 ? "" : ` · ${task.title}`}`,
    detail: `${formatTime(result.startedAt)} → ${formatTime(at)}`,
    source: "manual",
    edited: false,
    minutes,
    ...projectId === void 0 ? {} : { projectId },
    ...projectName === void 0 ? {} : { project: projectName },
    ...task === void 0 ? {} : { taskId: task.id }
  };
  const logs = [log, ...input.logs];
  const daily = applyDailyDelta(input.daily, dayKey(at), { focusMinutes: minutes }, at);
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "focus.completed",
        title: `专注 ${minutes} 分钟${task === void 0 ? "" : `：${task.title}`}`,
        refId: log.id,
        ...projectId === void 0 ? {} : { projectId },
        detail: `${formatTime(result.startedAt)} → ${formatTime(at)}`
      },
      at
    )
  );
  const tasks = task === void 0 ? input.tasks : input.tasks.map((item) => {
    if (item.id !== task.id) return item;
    const base = item.focusedMinutes ?? (item.pomodoros ?? 0) * 25;
    return {
      ...item,
      focusedMinutes: base + minutes,
      pomodoros: (item.pomodoros ?? 0) + 1,
      updatedAt: at
    };
  });
  return { logs, daily, timeline, tasks };
}
function addSessionLog(input) {
  if (input.log.kind === "focus") return {};
  if (input.logs.some((log) => log.id === input.log.id)) return {};
  const at = input.log.at;
  const logs = [input.log, ...input.logs];
  const daily = applyDailyDelta(input.daily, dayKey(at), { sessions: 1 }, at);
  const result = { logs, daily };
  if (input.timeline !== void 0 && input.log.kind === "milestone") {
    result.timeline = pushEvent(
      input.timeline,
      makeEvent(
        {
          type: "log.milestone",
          title: input.log.title || "里程碑",
          refId: input.log.id,
          ...input.log.projectId === void 0 ? {} : { projectId: input.log.projectId }
        },
        at
      )
    );
  }
  return result;
}
function addFriction(input) {
  if (input.friction.some((item) => item.id === input.record.id)) return {};
  const friction = [input.record, ...input.friction];
  const daily = applyDailyDelta(input.daily, dayKey(input.record.at), { friction: 1 }, input.record.at);
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "friction.created",
        title: `出现阻碍：${input.record.summary.slice(0, 40)}`,
        refId: input.record.id,
        ...input.record.projectId === void 0 ? {} : { projectId: input.record.projectId }
      },
      input.record.at
    )
  );
  return { friction, daily, timeline };
}
function resolveFriction(input) {
  const at = input.at ?? Date.now();
  const target = input.friction.find((item) => item.id === input.frictionId);
  if (target === void 0 || target.resolved) return {};
  const friction = input.friction.map(
    (item) => item.id === input.frictionId ? {
      ...item,
      resolved: true,
      solution: input.solution.trim(),
      updatedAt: at,
      resolveMs: item.resolveMs ?? Math.max(6e4, at - item.at)
    } : item
  );
  const timeline = pushEvent(
    input.timeline,
    makeEvent(
      {
        type: "friction.resolved",
        title: `解决阻碍：${target.summary.slice(0, 40)}`,
        refId: target.id,
        ...target.projectId === void 0 ? {} : { projectId: target.projectId }
      },
      at
    )
  );
  return { friction, timeline };
}
function deleteKnowledgeNode(input) {
  if (!input.graph.nodes.some((node) => node.id === input.nodeId)) return {};
  const graph = removeNode(input.graph, input.nodeId);
  const remaining = new Set(graph.nodes.map((node) => node.id));
  const pruned = pruneReviews(input.reviews, remaining);
  return { graph, reviews: pruned.reviews };
}
function deleteLog(input) {
  const log = input.logs.find((item) => item.id === input.logId);
  if (log === void 0) return {};
  const logs = input.logs.filter((item) => item.id !== input.logId);
  const day = dayKey(log.at);
  if (log.kind !== "focus") {
    return { logs, daily: applyDailyDelta(input.daily, day, { sessions: -1 }, log.at) };
  }
  const minutes = Math.max(0, Math.round(log.minutes ?? 0));
  return { logs, daily: applyDailyDelta(input.daily, day, { focusMinutes: -minutes }, log.at) };
}
function deleteLogs(input) {
  const ids = new Set(input.logIds);
  if (ids.size === 0) return {};
  let daily = input.daily;
  let changed = false;
  for (const log of input.logs) {
    if (!ids.has(log.id)) continue;
    changed = true;
    const day = dayKey(log.at);
    if (log.kind === "focus") {
      daily = applyDailyDelta(daily, day, { focusMinutes: -Math.max(0, Math.round(log.minutes ?? 0)) }, log.at);
    } else {
      daily = applyDailyDelta(daily, day, { sessions: -1 }, log.at);
    }
  }
  if (!changed) return {};
  return { logs: input.logs.filter((log) => !ids.has(log.id)), daily };
}
function addFrictionMerged(input) {
  const now = input.now ?? Date.now();
  const outcome = mergeFriction(input.friction, input.draft, now);
  if (outcome.merged) return { friction: outcome.records, daily: input.daily, created: false };
  const record = outcome.records.find((item) => item.id === outcome.id);
  if (record === void 0) return { friction: outcome.records, created: false };
  const added = addFriction({ friction: input.friction, daily: input.daily, timeline: input.timeline, record });
  return { ...added, created: true };
}
function buildImportSnapshot(input) {
  return buildHistorySnapshot({
    project: input.project,
    tasks: input.tasks,
    friction: input.friction,
    ...input.memory === void 0 ? {} : { memory: input.memory },
    label: "导入后",
    now: input.now ?? Date.now()
  });
}

// src/client/lib/tx.ts
function writeTransaction(store, entries2) {
  const prepared = [];
  for (const entry of entries2) {
    let raw;
    try {
      raw = JSON.stringify(wrapEnvelope(entry.value));
    } catch {
      return { ok: false, restored: true, written: 0, error: "serialize", failedKey: entry.key };
    }
    prepared.push({ key: entry.key, raw, previous: store.readRaw(entry.key) });
  }
  const done = [];
  for (const item of prepared) {
    if (store.writeRaw(item.key, item.raw)) {
      done.push({ key: item.key, previous: item.previous });
      continue;
    }
    const restored = rollback(store, done);
    return { ok: false, failedKey: item.key, restored, written: done.length, error: "write" };
  }
  return { ok: true, restored: true, written: prepared.length };
}
function rollback(store, done) {
  let ok = true;
  for (let index = done.length - 1; index >= 0; index -= 1) {
    const item = done[index];
    if (item === void 0) continue;
    const restored = item.previous === null ? store.removeRaw(item.key) : store.writeRaw(item.key, item.previous);
    if (!restored) ok = false;
  }
  return ok;
}
function createBrowserStore() {
  if (typeof window === "undefined") return void 0;
  return {
    readRaw(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    writeRaw(key, raw) {
      try {
        window.localStorage.setItem(key, raw);
        broadcast(key, raw);
        return true;
      } catch {
        return false;
      }
    },
    removeRaw(key) {
      try {
        window.localStorage.removeItem(key);
        broadcast(key, "");
        return true;
      } catch {
        return false;
      }
    }
  };
}
function broadcast(key, raw) {
  try {
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key, raw } }));
  } catch {
  }
}

// src/client/lib/settlement.ts
var EMPTY = { logs: [], tasks: [], daily: [], timeline: [] };
var LABEL = {
  logs: "会话日志",
  daily: "日聚合",
  tasks: "任务",
  timeline: "时间轴"
};
function readKey(store, key) {
  const raw = store.readRaw(key);
  if (raw === null || raw === "") return void 0;
  try {
    const { data } = unwrapEnvelope(JSON.parse(raw));
    return coercePayload(key, data);
  } catch {
    return void 0;
  }
}
function readSettlementState(store, fallback) {
  const base = fallback ?? EMPTY;
  return {
    logs: readKey(store, STORAGE_KEYS.logs) ?? base.logs,
    tasks: readKey(store, STORAGE_KEYS.tasks) ?? base.tasks,
    daily: readKey(store, STORAGE_KEYS.daily) ?? base.daily,
    timeline: readKey(store, STORAGE_KEYS.timeline) ?? base.timeline
  };
}
function findTask(tasks, taskId) {
  if (taskId === "") return void 0;
  return tasks.find((task) => task.id === taskId);
}
function labelOfKey(key) {
  switch (key) {
    case STORAGE_KEYS.logs:
      return LABEL.logs;
    case STORAGE_KEYS.tasks:
      return LABEL.tasks;
    case STORAGE_KEYS.daily:
      return LABEL.daily;
    case STORAGE_KEYS.timeline:
      return LABEL.timeline;
    default:
      return "本地存储";
  }
}
function dailyMinutesOf(state, day) {
  const row = state.daily.find((item) => item.day === day);
  return row === void 0 ? null : Math.max(0, Math.round(row.focusMinutes));
}
function snapshotBaseline(state, result) {
  const day = dayKey(result.endedAt);
  const task = findTask(state.tasks, result.taskId);
  return {
    day,
    dailyMinutes: dailyMinutesOf(state, day),
    taskId: task === void 0 ? "" : task.id,
    taskMinutes: task === void 0 ? null : Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25)),
    taskPomodoros: task === void 0 ? null : Math.max(0, Math.round(task.pomodoros ?? 0))
  };
}
function timelineCountFor(state, roundId) {
  return state.timeline.filter((event) => event.type === "focus.completed" && event.refId === roundId).length;
}
function verifySettlement(state, result, baseline) {
  const failed = [];
  const minutes = Math.max(0, Math.round(result.minutes));
  const matches = state.logs.filter((log) => log.id === result.roundId);
  if (matches.length !== 1) {
    failed.push(LABEL.logs);
  } else {
    const log = matches[0];
    const sameMinutes = Math.max(0, Math.round(log.minutes ?? 0)) === minutes;
    const sameDay = dayKey(log.at) === dayKey(result.endedAt);
    const taskStillExists = result.taskId === "" || state.tasks.some((task) => task.id === result.taskId);
    const sameTask = !taskStillExists || log.taskId === result.taskId || log.taskId === void 0;
    if (!sameMinutes || !sameDay || !sameTask) failed.push(LABEL.logs);
  }
  const day = dayKey(result.endedAt);
  const dailyNow = dailyMinutesOf(state, day);
  const dailyFloor = baseline?.day === day && baseline.dailyMinutes !== null ? baseline.dailyMinutes + minutes : minutes;
  if (dailyNow === null || dailyNow < dailyFloor) failed.push(LABEL.daily);
  if (result.taskId !== "") {
    const task = findTask(state.tasks, result.taskId);
    if (task !== void 0) {
      const focused = Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25));
      const pomodoros = Math.max(0, Math.round(task.pomodoros ?? 0));
      const focusFloor = baseline?.taskId === task.id && baseline.taskMinutes !== null ? baseline.taskMinutes + minutes : minutes;
      const pomodoroFloor = baseline?.taskId === task.id && baseline.taskPomodoros !== null ? baseline.taskPomodoros + 1 : 1;
      if (focused < focusFloor || pomodoros < pomodoroFloor) failed.push(LABEL.tasks);
    }
  }
  if (timelineCountFor(state, result.roundId) !== 1) failed.push(LABEL.timeline);
  return { ok: failed.length === 0, failed };
}
function planRepair(state, result, baseline) {
  const repaired = [];
  const ambiguous = [];
  const minutes = Math.max(0, Math.round(result.minutes));
  const day = dayKey(result.endedAt);
  let daily = state.daily;
  let tasks = state.tasks;
  let timeline = state.timeline;
  const dailyNow = dailyMinutesOf(state, day);
  const dailyHasBaseline = baseline !== void 0 && baseline.day === day;
  if (dailyHasBaseline) {
    const before = baseline.dailyMinutes;
    if (before === null) {
      if (dailyNow === null) {
        daily = [...daily, { day, focusMinutes: minutes, tasksDone: 0, sessions: 0, friction: 0 }];
        repaired.push(LABEL.daily);
      } else if (dailyNow > 0 && dailyNow < minutes) {
        ambiguous.push(LABEL.daily);
      }
    } else if (dailyNow === null) {
      ambiguous.push(LABEL.daily);
    } else if (dailyNow === before) {
      daily = daily.map((item) => item.day === day ? { ...item, focusMinutes: item.focusMinutes + minutes } : item);
      repaired.push(LABEL.daily);
    } else if (dailyNow >= before + minutes) {
    } else {
      ambiguous.push(LABEL.daily);
    }
  } else {
    ambiguous.push(LABEL.daily);
  }
  if (result.taskId !== "") {
    const task = findTask(state.tasks, result.taskId);
    if (task !== void 0) {
      const focusedNow = Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25));
      const pomodorosNow = Math.max(0, Math.round(task.pomodoros ?? 0));
      const taskHasBaseline = baseline !== void 0 && baseline.taskId === task.id && baseline.taskMinutes !== null;
      if (taskHasBaseline) {
        const focusBefore = baseline.taskMinutes ?? 0;
        const pomodoroBefore = baseline.taskPomodoros ?? 0;
        const focusApplied = focusedNow >= focusBefore + minutes;
        const pomodoroApplied = pomodorosNow >= pomodoroBefore + 1;
        const focusMissing = !focusApplied && focusedNow === focusBefore;
        const pomodoroMissing = !pomodoroApplied && pomodorosNow === pomodoroBefore;
        if (!focusApplied && !focusMissing) ambiguous.push(`${LABEL.tasks}·专注`);
        if (!pomodoroApplied && !pomodoroMissing) ambiguous.push(`${LABEL.tasks}·番茄`);
        if (focusMissing || pomodoroMissing) {
          tasks = tasks.map(
            (item) => item.id === task.id ? {
              ...item,
              ...focusMissing ? { focusedMinutes: focusBefore + minutes } : {},
              ...pomodoroMissing ? { pomodoros: pomodoroBefore + 1 } : {}
            } : item
          );
          if (focusMissing) repaired.push(`${LABEL.tasks}·专注`);
          if (pomodoroMissing) repaired.push(`${LABEL.tasks}·番茄`);
        }
      } else {
        ambiguous.push(LABEL.tasks);
      }
    }
  }
  const count = timelineCountFor(state, result.roundId);
  if (count === 0) {
    const log = state.logs.find((item) => item.id === result.roundId);
    timeline = [
      makeEvent(
        {
          type: "focus.completed",
          title: `专注 ${minutes} 分钟（已补齐）`,
          refId: result.roundId,
          ...log?.projectId === void 0 ? {} : { projectId: log.projectId }
        },
        result.endedAt
      ),
      ...timeline
    ];
    repaired.push(LABEL.timeline);
  } else if (count > 1) {
    let kept = false;
    const reversed = [...timeline].reverse().filter((event) => {
      if (event.type !== "focus.completed" || event.refId !== result.roundId) return true;
      if (kept) return false;
      kept = true;
      return true;
    });
    timeline = reversed.reverse();
    repaired.push(`${LABEL.timeline}·去重`);
  }
  return { next: { logs: state.logs, tasks, daily, timeline }, repaired, ambiguous };
}
function settleFocus(input) {
  const { result, store } = input;
  const fallback = input.fallback ?? EMPTY;
  if (store === void 0) {
    const computed2 = finishFocus({
      logs: fallback.logs,
      daily: fallback.daily,
      timeline: fallback.timeline,
      tasks: fallback.tasks,
      result,
      ...findTask(fallback.tasks, result.taskId) === void 0 ? {} : { task: findTask(fallback.tasks, result.taskId) },
      ...input.projects === void 0 ? {} : { projects: input.projects },
      ...input.activeProjectId === void 0 ? {} : { activeProjectId: input.activeProjectId }
    });
    if (computed2.logs === void 0) {
      return {
        ok: false,
        duplicate: false,
        repaired: false,
        restored: true,
        written: 0,
        message: "这一轮没有可写入的记录（时长不足 1 分钟或缺少幂等键）"
      };
    }
    const next2 = {
      logs: computed2.logs,
      tasks: computed2.tasks ?? fallback.tasks,
      daily: computed2.daily ?? fallback.daily,
      timeline: computed2.timeline ?? fallback.timeline
    };
    const baseline2 = snapshotBaseline(fallback, result);
    return {
      ok: true,
      duplicate: false,
      repaired: false,
      restored: true,
      written: 0,
      message: "仅计算，未落盘（当前环境没有存储）",
      baseline: baseline2,
      next: next2
    };
  }
  const fresh = readSettlementState(store, fallback);
  const baseline = input.baseline ?? snapshotBaseline(fresh, result);
  if (fresh.logs.some((log) => log.id === result.roundId)) {
    const check = verifySettlement(fresh, result, input.baseline);
    if (check.ok) {
      return {
        ok: true,
        duplicate: true,
        repaired: false,
        restored: true,
        written: 0,
        message: "这一轮已经完整记过了，同一次专注不会重复累计",
        baseline,
        next: fresh
      };
    }
    const plan = planRepair(fresh, result, input.baseline);
    if (plan.repaired.length === 0) {
      return {
        ok: false,
        duplicate: true,
        repaired: false,
        failedEntities: check.failed,
        ambiguousEntities: plan.ambiguous,
        restored: true,
        written: 0,
        message: plan.ambiguous.length > 0 ? `这一轮的记录只写了一部分（缺 ${check.failed.join("、")}），但无法确定它们是否已经累计过，已保留待保存状态：${plan.ambiguous.join("、")}。请先导出备份再重试。` : `这一轮的记录不完整（缺 ${check.failed.join("、")}），且没有可用于修复的基线，已保留待保存状态`,
        baseline
      };
    }
    const tx2 = writeTx(store, plan.next);
    if (!tx2.ok) {
      return {
        ok: false,
        duplicate: true,
        repaired: false,
        ...tx2.failedKey === void 0 ? {} : { failedKey: tx2.failedKey },
        failedEntities: check.failed,
        restored: tx2.restored,
        written: tx2.written,
        message: tx2.restored ? `补齐失败（${labelOfKey(tx2.failedKey)}），这一轮仍未保存，已回滚；可以再次重试` : `补齐失败且回滚未完成（${labelOfKey(tx2.failedKey)}），数据可能不一致：请先导出备份再重试`,
        baseline
      };
    }
    const after2 = readSettlementState(store);
    const recheck = verifySettlement(after2, result, input.baseline);
    if (!recheck.ok) {
      return {
        ok: false,
        duplicate: true,
        repaired: plan.repaired.length > 0,
        failedEntities: recheck.failed,
        ...plan.ambiguous.length === 0 ? {} : { ambiguousEntities: plan.ambiguous },
        restored: true,
        written: tx2.written,
        message: plan.ambiguous.length > 0 ? `这一轮的记录只写了一部分（仍缺 ${recheck.failed.join("、")}）；其中 ${plan.ambiguous.join("、")} 无法确定是否已经累计过，已保留待保存状态，请先导出备份再重试` : `补齐后校验仍未通过（${recheck.failed.join("、")}），已保留待保存状态`,
        baseline
      };
    }
    return {
      ok: true,
      duplicate: true,
      repaired: true,
      restored: true,
      written: tx2.written,
      message: `这一轮之前只写了一部分，已补齐：${plan.repaired.join("、")}`,
      baseline,
      next: after2
    };
  }
  const task = findTask(fresh.tasks, result.taskId);
  const computed = finishFocus({
    logs: fresh.logs,
    daily: fresh.daily,
    timeline: fresh.timeline,
    tasks: fresh.tasks,
    result,
    ...task === void 0 ? {} : { task },
    ...input.projects === void 0 ? {} : { projects: input.projects },
    ...input.activeProjectId === void 0 ? {} : { activeProjectId: input.activeProjectId }
  });
  if (computed.logs === void 0) {
    return {
      ok: false,
      duplicate: false,
      repaired: false,
      restored: true,
      written: 0,
      message: "这一轮没有可写入的记录（时长不足 1 分钟或缺少幂等键）",
      baseline
    };
  }
  const next = {
    logs: computed.logs,
    tasks: computed.tasks ?? fresh.tasks,
    daily: computed.daily ?? fresh.daily,
    timeline: computed.timeline ?? fresh.timeline
  };
  const tx = writeTx(store, next);
  if (!tx.ok) {
    const rollbackFailed = !tx.restored;
    return {
      ok: false,
      duplicate: false,
      repaired: false,
      ...tx.failedKey === void 0 ? {} : { failedKey: tx.failedKey },
      restored: tx.restored,
      written: tx.written,
      message: rollbackFailed ? `写入失败（${labelOfKey(tx.failedKey)}）且回滚未完成，数据可能只写了一半；已保留待保存状态，重试会自动补齐。建议先导出备份。` : `写入失败（${labelOfKey(tx.failedKey)}），这一轮没有保存，已回滚到写入前；可以点「重试写入」`,
      baseline
    };
  }
  const after = readSettlementState(store);
  const verify = verifySettlement(after, result, baseline);
  if (!verify.ok) {
    return {
      ok: false,
      duplicate: false,
      repaired: false,
      failedEntities: verify.failed,
      restored: true,
      written: tx.written,
      message: `写入后校验未通过（${verify.failed.join("、")}），这一轮不算保存成功；记录已保留待重试`,
      baseline
    };
  }
  return {
    ok: true,
    duplicate: false,
    repaired: false,
    restored: true,
    written: tx.written,
    message: "已记录本轮专注",
    baseline,
    next: after
  };
}
function writeTx(store, next) {
  const result = writeTransaction(store, [
    { key: STORAGE_KEYS.logs, value: next.logs },
    { key: STORAGE_KEYS.tasks, value: next.tasks },
    { key: STORAGE_KEYS.daily, value: next.daily },
    { key: STORAGE_KEYS.timeline, value: next.timeline }
  ]);
  return result.ok ? { ok: true, restored: true, written: result.written } : {
    ok: false,
    ...result.failedKey === void 0 ? {} : { failedKey: result.failedKey },
    restored: result.restored,
    written: result.written
  };
}
function detectDuplicateRounds(logs) {
  const seen = /* @__PURE__ */ new Map();
  for (const log of logs) {
    if (log.kind !== "focus") continue;
    const entry = seen.get(log.id) ?? { count: 0, minutes: Math.max(0, Math.round(log.minutes ?? 0)) };
    entry.count += 1;
    seen.set(log.id, entry);
  }
  return [...seen.entries()].filter(([, entry]) => entry.count > 1).map(([roundId, entry]) => ({ roundId, count: entry.count, minutes: entry.minutes }));
}
function repairDuplicateSettlements(input) {
  const duplicates = detectDuplicateRounds(input.logs);
  if (duplicates.length === 0) {
    return { ...input, removedLogs: 0, rolledBackMinutes: 0, removedEvents: 0, changed: false };
  }
  const extraById = /* @__PURE__ */ new Map();
  for (const item of duplicates) extraById.set(item.roundId, item.count - 1);
  const kept = /* @__PURE__ */ new Set();
  const logs = [];
  const removed = [];
  for (const log of input.logs) {
    const remaining = extraById.get(log.id) ?? 0;
    if (log.kind === "focus" && remaining > 0 && kept.has(log.id)) {
      extraById.set(log.id, remaining - 1);
      removed.push(log);
      continue;
    }
    if (log.kind === "focus") kept.add(log.id);
    logs.push(log);
  }
  let daily = input.daily;
  let rolledBackMinutes = 0;
  for (const log of removed) {
    const minutes = Math.max(0, Math.round(log.minutes ?? 0));
    rolledBackMinutes += minutes;
    daily = daily.map(
      (item) => item.day === dayKey(log.at) ? { ...item, focusMinutes: Math.max(0, item.focusMinutes - minutes) } : item
    );
  }
  let tasks = input.tasks;
  for (const log of removed) {
    if (log.taskId === void 0) continue;
    const minutes = Math.max(0, Math.round(log.minutes ?? 0));
    tasks = tasks.map(
      (task) => task.id === log.taskId ? {
        ...task,
        focusedMinutes: Math.max(0, (task.focusedMinutes ?? (task.pomodoros ?? 0) * 25) - minutes),
        pomodoros: Math.max(0, (task.pomodoros ?? 0) - 1)
      } : task
    );
  }
  const duplicatedIds = new Set(duplicates.map((item) => item.roundId));
  const seenEvents = /* @__PURE__ */ new Set();
  const timeline = [];
  let removedEvents = 0;
  for (const event of input.timeline) {
    const refId = event.refId;
    if (event.type === "focus.completed" && refId !== void 0 && duplicatedIds.has(refId)) {
      if (seenEvents.has(refId)) {
        removedEvents += 1;
        continue;
      }
      seenEvents.add(refId);
    }
    timeline.push(event);
  }
  return {
    logs,
    tasks,
    daily,
    timeline,
    removedLogs: removed.length,
    rolledBackMinutes,
    removedEvents,
    changed: removed.length > 0 || removedEvents > 0
  };
}
function repairSettlementStore(store) {
  const repaired = repairDuplicateSettlements(readSettlementState(store));
  if (!repaired.changed) {
    return { changed: false, removedLogs: 0, rolledBackMinutes: 0, removedEvents: 0, ok: true };
  }
  const tx = writeTx(store, repaired);
  return {
    changed: true,
    removedLogs: repaired.removedLogs,
    rolledBackMinutes: repaired.rolledBackMinutes,
    removedEvents: repaired.removedEvents,
    ok: tx.ok
  };
}
function planDiscard(state, result, baseline) {
  const blockers = [];
  const roundId = result.roundId;
  const minutes = Math.max(0, Math.round(result.minutes));
  const day = dayKey(result.endedAt);
  const own = state.logs.filter((log) => log.id === roundId);
  const ownEvents = state.timeline.filter((event) => event.type === "focus.completed" && event.refId === roundId);
  if (own.length > 1) {
    blockers.push(`${LABEL.logs}·同一轮有多条`);
  } else if (own.length === 1) {
    const log = own[0];
    if (log.kind !== "focus") blockers.push(`${LABEL.logs}·不是专注记录`);
    if (Math.max(0, Math.round(log.minutes ?? 0)) !== minutes) blockers.push(`${LABEL.logs}·分钟与本轮不符`);
    if ((log.taskId ?? "") !== result.taskId) blockers.push(`${LABEL.logs}·任务绑定与本轮不符`);
    if (dayKey(log.at) !== day) blockers.push(`${LABEL.logs}·日期与本轮不符`);
  }
  const dailyNow = dailyMinutesOf(state, day);
  if (baseline === void 0 || baseline.day !== day) {
    blockers.push(`${LABEL.daily}·缺少基线`);
  } else {
    const before = baseline.dailyMinutes;
    const untouched = before === null ? dailyNow === null : dailyNow === before;
    if (!untouched) blockers.push(`${LABEL.daily}·已累计或无法确定`);
  }
  if (result.taskId !== "") {
    const task = findTask(state.tasks, result.taskId);
    if (task !== void 0) {
      const usable = baseline !== void 0 && baseline.taskId === task.id && baseline.taskMinutes !== null && baseline.taskPomodoros !== null;
      if (!usable) {
        blockers.push(`${LABEL.tasks}·缺少基线`);
      } else {
        const focused = Math.max(0, Math.round(task.focusedMinutes ?? (task.pomodoros ?? 0) * 25));
        const pomodoros = Math.max(0, Math.round(task.pomodoros ?? 0));
        if (focused !== baseline.taskMinutes) blockers.push(`${LABEL.tasks}·专注已累计或无法确定`);
        if (pomodoros !== baseline.taskPomodoros) blockers.push(`${LABEL.tasks}·番茄已累计或无法确定`);
      }
    }
  }
  const removableLogs = own.length === 1 && own[0].kind === "focus" ? 1 : 0;
  return {
    safe: blockers.length === 0,
    blockers,
    removedLogs: removableLogs,
    removedEvents: ownEvents.length,
    next: {
      logs: removableLogs === 1 ? state.logs.filter((log) => log.id !== roundId) : state.logs,
      tasks: state.tasks,
      daily: state.daily,
      timeline: state.timeline.filter((event) => !(event.type === "focus.completed" && event.refId === roundId))
    }
  };
}
function discardSettlement(input) {
  const { result, store } = input;
  const fallback = input.fallback ?? EMPTY;
  if (store === void 0) {
    const plan2 = planDiscard(fallback, result, input.baseline);
    return {
      ok: plan2.safe,
      removedLogs: plan2.safe ? plan2.removedLogs : 0,
      removedEvents: plan2.safe ? plan2.removedEvents : 0,
      blockers: plan2.blockers,
      restored: true,
      written: 0,
      message: plan2.safe ? discardMessage(plan2) : discardBlockedMessage(plan2.blockers),
      next: plan2.next
    };
  }
  const fresh = readSettlementState(store, fallback);
  const plan = planDiscard(fresh, result, input.baseline);
  if (!plan.safe) {
    return {
      ok: false,
      removedLogs: 0,
      removedEvents: 0,
      blockers: plan.blockers,
      restored: true,
      written: 0,
      message: discardBlockedMessage(plan.blockers),
      next: fresh
    };
  }
  const timerBefore = input.timer === void 0 ? null : store.readRaw(input.timer.key);
  const entries2 = [];
  if (plan.removedLogs > 0) entries2.push({ key: STORAGE_KEYS.logs, value: plan.next.logs });
  if (plan.removedEvents > 0) entries2.push({ key: STORAGE_KEYS.timeline, value: plan.next.timeline });
  if (input.timer !== void 0) entries2.push({ key: input.timer.key, value: input.timer.value });
  if (entries2.length === 0) {
    return {
      ok: true,
      removedLogs: 0,
      removedEvents: 0,
      blockers: [],
      restored: true,
      written: 0,
      message: discardMessage(plan),
      next: plan.next
    };
  }
  const tx = writeTransaction(store, entries2);
  if (!tx.ok) {
    return {
      ok: false,
      removedLogs: 0,
      removedEvents: 0,
      blockers: [],
      ...tx.failedKey === void 0 ? {} : { failedKey: tx.failedKey },
      restored: tx.restored,
      written: tx.written,
      message: tx.restored ? `放弃失败（${labelOfKey(tx.failedKey)}写入被拒绝），这一轮的数据一个字节都没有改动，待保存状态仍在，可以再试一次` : `放弃失败且回滚未完成（${labelOfKey(tx.failedKey)}），数据可能处于中间状态：请先导出备份，再重试写入`,
      next: fresh
    };
  }
  const after = readSettlementState(store);
  const logGone = !after.logs.some((log) => log.id === result.roundId);
  const eventsGone = timelineCountFor(after, result.roundId) === 0;
  if (!logGone || !eventsGone) {
    const restored = input.timer === void 0 ? true : timerBefore === null ? store.removeRaw(input.timer.key) : store.writeRaw(input.timer.key, timerBefore);
    return {
      ok: false,
      removedLogs: 0,
      removedEvents: 0,
      blockers: [],
      restored,
      written: tx.written,
      message: restored ? "放弃后的校验没有通过（本轮记录仍然存在），待保存状态已保留，可以再试一次或先导出备份" : "放弃后的校验没有通过，且恢复标记写回失败：数据可能部分写入，请立即导出备份",
      next: after
    };
  }
  return {
    ok: true,
    removedLogs: plan.removedLogs,
    removedEvents: plan.removedEvents,
    blockers: [],
    restored: true,
    written: tx.written,
    message: discardMessage(plan),
    next: after
  };
}
function discardMessage(plan) {
  if (plan.removedLogs === 0 && plan.removedEvents === 0) {
    return "本轮没有写入任何记录，已取消待保存状态（没有删除任何数据）";
  }
  const parts = [];
  if (plan.removedLogs > 0) parts.push(`${plan.removedLogs} 条日志`);
  if (plan.removedEvents > 0) parts.push(`${plan.removedEvents} 条时间轴事件`);
  return `本轮未完整保存，已清理能够确认属于本轮的部分记录（${parts.join("、")}）；日聚合与任务从未计入，未改动，其他记录不受影响`;
}
function discardBlockedMessage(blockers) {
  return `无法安全放弃：${blockers.join("、")}。这一笔的数据可能已经部分写入，待保存状态（可恢复标记）已保留、没有删除任何记录；请先导出备份，再点「重试写入」补齐`;
}

// src/client/hooks/useBoardActions.ts
function useBoardActions() {
  const board = useBoardData();
  const [daily, setDaily] = useLocalStore(STORAGE_KEYS.daily, []);
  const [timeline, setTimeline] = useLocalStore(STORAGE_KEYS.timeline, []);
  const [graph, setGraph] = useLocalStore(STORAGE_KEYS.knowledge, { nodes: [], edges: [] });
  const [reviews, setReviews] = useLocalStore(STORAGE_KEYS.reviews, []);
  const [history, setHistory] = useLocalStore(STORAGE_KEYS.history, []);
  const pushSnapshot = (0, import_react6.useCallback)(
    (snapshot) => {
      if (snapshot === void 0) return;
      setHistory((previous) => pruneSnapshots([...previous, snapshot]));
    },
    [setHistory]
  );
  const completeTask2 = (0, import_react6.useCallback)(
    (taskId) => {
      const result = completeTask({
        tasks: board.allTasks,
        daily,
        timeline,
        taskId,
        project: board.activeProject,
        friction: board.allFriction,
        history
      });
      if (result.tasks !== void 0) board.setTasks(result.tasks);
      if (result.daily !== void 0) setDaily(result.daily);
      if (result.timeline !== void 0) setTimeline(result.timeline);
      pushSnapshot(result.snapshot);
    },
    [board, daily, timeline, history, setDaily, setTimeline, pushSnapshot]
  );
  const reopenTask2 = (0, import_react6.useCallback)(
    (taskId) => {
      const result = reopenTask({ tasks: board.allTasks, daily, timeline, taskId });
      if (result.tasks !== void 0) board.setTasks(result.tasks);
      if (result.daily !== void 0) setDaily(result.daily);
      if (result.timeline !== void 0) setTimeline(result.timeline);
    },
    [board.allTasks, board.setTasks, daily, timeline, setDaily, setTimeline]
  );
  const createTask2 = (0, import_react6.useCallback)(
    (draft) => {
      const result = createTask({
        tasks: board.allTasks,
        timeline,
        id: createId("task"),
        projects: board.projects,
        ...draft
      });
      if (result.tasks !== void 0) board.setTasks(result.tasks);
      if (result.timeline !== void 0) setTimeline(result.timeline);
    },
    [board.allTasks, board.setTasks, board.projects, timeline, setTimeline]
  );
  const updateTask2 = (0, import_react6.useCallback)(
    (taskId, patch) => {
      const result = updateTask({
        tasks: board.allTasks,
        taskId,
        patch,
        projects: board.projects
      });
      if (result.tasks !== void 0) board.setTasks(result.tasks);
    },
    [board.allTasks, board.setTasks, board.projects]
  );
  const removeTask = (0, import_react6.useCallback)(
    (taskId) => {
      const result = deleteTask({
        tasks: board.allTasks,
        logs: board.allLogs,
        graph,
        meta: board.meta,
        daily,
        timeline,
        taskId
      });
      if (result.tasks !== void 0) board.setTasks(result.tasks);
      if (result.logs !== void 0) board.setLogs(result.logs);
      if (result.graph !== void 0) setGraph(result.graph);
      if (result.meta !== void 0) board.setMeta(result.meta);
      if (result.daily !== void 0) setDaily(result.daily);
      if (result.timeline !== void 0) setTimeline(result.timeline);
    },
    [board, graph, daily, timeline, setDaily, setTimeline, setGraph]
  );
  const addFocus = (0, import_react6.useCallback)(
    (log) => {
      const result = addFocusLog({ logs: board.allLogs, daily, timeline, log });
      if (result.logs !== void 0) board.setLogs(result.logs);
      if (result.daily !== void 0) setDaily(result.daily);
      if (result.timeline !== void 0) setTimeline(result.timeline);
    },
    [board.allLogs, board.setLogs, daily, timeline, setDaily, setTimeline]
  );
  const finishFocus2 = (0, import_react6.useCallback)(
    (result, baseline) => {
      const store = createBrowserStore();
      const outcome = settleFocus({
        result,
        ...store === void 0 ? {} : { store },
        ...baseline === void 0 ? {} : { baseline },
        projects: board.projects,
        activeProjectId: board.activeProjectId,
        fallback: { logs: board.allLogs, tasks: board.allTasks, daily, timeline }
      });
      if (!outcome.ok) {
        pushNotice(outcome.message, "error");
        return {
          ok: false,
          message: outcome.message,
          ...outcome.baseline === void 0 ? {} : { baseline: outcome.baseline }
        };
      }
      if (outcome.duplicate) {
        pushNotice(outcome.message, outcome.repaired ? "warn" : "info");
        if (outcome.next !== void 0 && outcome.repaired) {
          board.setLogs(outcome.next.logs);
          board.setTasks(outcome.next.tasks);
          setDaily(outcome.next.daily);
          setTimeline(outcome.next.timeline);
        }
        return { ok: true, message: outcome.message };
      }
      if (store === void 0 && outcome.next !== void 0) {
        board.setLogs(outcome.next.logs);
        board.setTasks(outcome.next.tasks);
        setDaily(outcome.next.daily);
        setTimeline(outcome.next.timeline);
      }
      return { ok: true, message: outcome.message };
    },
    [board, daily, timeline, setDaily, setTimeline]
  );
  const discardFocus = (0, import_react6.useCallback)(
    (result, baseline, timer) => {
      const store = createBrowserStore();
      const outcome = discardSettlement({
        result,
        ...store === void 0 ? {} : { store },
        ...baseline === void 0 ? {} : { baseline },
        ...timer === void 0 ? {} : { timer },
        fallback: { logs: board.allLogs, tasks: board.allTasks, daily, timeline }
      });
      if (!outcome.ok) {
        pushNotice(outcome.message, "error");
        return {
          ok: false,
          message: outcome.message,
          removedLogs: 0,
          removedEvents: 0,
          persisted: false
        };
      }
      if (outcome.removedLogs > 0 || outcome.removedEvents > 0) {
        pushNotice(outcome.message, "info");
      }
      if (store === void 0 && outcome.next !== void 0) {
        board.setLogs(outcome.next.logs);
        setTimeline(outcome.next.timeline);
      }
      return {
        ok: true,
        message: outcome.message,
        removedLogs: outcome.removedLogs,
        removedEvents: outcome.removedEvents,
        persisted: store !== void 0 && timer !== void 0 && outcome.written > 0
      };
    },
    [board, daily, timeline, setTimeline]
  );
  const addSessionLog2 = (0, import_react6.useCallback)(
    (log) => {
      const outcome = addSessionLog({ logs: board.allLogs, daily, timeline, log });
      if (outcome.logs !== void 0) board.setLogs(outcome.logs);
      if (outcome.daily !== void 0) setDaily(outcome.daily);
      if (outcome.timeline !== void 0) setTimeline(outcome.timeline);
    },
    [board.allLogs, board.setLogs, daily, timeline, setDaily, setTimeline]
  );
  const addFriction2 = (0, import_react6.useCallback)(
    (record) => {
      const result = addFriction({ friction: board.allFriction, daily, timeline, record });
      if (result.friction !== void 0) board.setFriction(result.friction);
      if (result.daily !== void 0) setDaily(result.daily);
      if (result.timeline !== void 0) setTimeline(result.timeline);
    },
    [board.allFriction, board.setFriction, daily, timeline, setDaily, setTimeline]
  );
  const resolveFriction2 = (0, import_react6.useCallback)(
    (frictionId, solution) => {
      const result = resolveFriction({ friction: board.allFriction, timeline, frictionId, solution });
      if (result.friction !== void 0) board.setFriction(result.friction);
      if (result.timeline !== void 0) setTimeline(result.timeline);
    },
    [board.allFriction, board.setFriction, timeline, setTimeline]
  );
  const removeKnowledgeNode = (0, import_react6.useCallback)(
    (nodeId) => {
      const result = deleteKnowledgeNode({ graph, reviews, nodeId });
      if (result.graph !== void 0) setGraph(result.graph);
      if (result.reviews !== void 0) setReviews(result.reviews);
    },
    [graph, reviews, setGraph, setReviews]
  );
  const deleteLog2 = (0, import_react6.useCallback)((logId) => {
    const result = deleteLog({ logs: board.allLogs, daily, logId });
    if (result.logs !== void 0) board.setLogs(result.logs);
    if (result.daily !== void 0) setDaily(result.daily);
  }, [board.allLogs, board.setLogs, daily, setDaily]);
  const deleteLogs2 = (0, import_react6.useCallback)((logIds) => {
    const result = deleteLogs({ logs: board.allLogs, daily, logIds });
    if (result.logs !== void 0) board.setLogs(result.logs);
    if (result.daily !== void 0) setDaily(result.daily);
  }, [board.allLogs, board.setLogs, daily, setDaily]);
  const addFrictionMerged2 = (0, import_react6.useCallback)((draft) => {
    const result = addFrictionMerged({ friction: board.allFriction, daily, timeline, draft });
    if (result.friction !== void 0) board.setFriction(result.friction);
    if (result.daily !== void 0) setDaily(result.daily);
    if (result.timeline !== void 0) setTimeline(result.timeline);
    return result.created;
  }, [board.allFriction, board.setFriction, daily, timeline, setDaily, setTimeline]);
  return { completeTask: completeTask2, reopenTask: reopenTask2, removeTask, createTask: createTask2, updateTask: updateTask2, addFocus, finishFocus: finishFocus2, discardFocus, addSessionLog: addSessionLog2, addFriction: addFriction2, resolveFriction: resolveFriction2, removeKnowledgeNode, deleteLog: deleteLog2, deleteLogs: deleteLogs2, addFrictionMerged: addFrictionMerged2 };
}

// src/client/v4/workspace.tsx
var import_react7 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var WorkspaceContext = (0, import_react7.createContext)(null);
function useWorkspace() {
  const api = (0, import_react7.useContext)(WorkspaceContext);
  if (api === null) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return api;
}
function WorkspaceProvider({ children }) {
  const [expandedId, setExpandedId] = (0, import_react7.useState)(null);
  const [detail, setDetail] = (0, import_react7.useState)(null);
  const [modal, setModal] = (0, import_react7.useState)(null);
  const [selectedTaskId, setSelectedTaskId] = (0, import_react7.useState)(null);
  const returnFocus = (0, import_react7.useRef)(null);
  const scrollTop = (0, import_react7.useRef)(0);
  const remember = (0, import_react7.useCallback)(() => {
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    scrollTop.current = window.scrollY || document.documentElement.scrollTop || 0;
  }, []);
  const openDetail = (0, import_react7.useCallback)(
    (ref) => {
      remember();
      setModal(null);
      setDetail(ref);
    },
    [remember]
  );
  const openModal = (0, import_react7.useCallback)(
    (ref) => {
      remember();
      setDetail(null);
      setModal(ref);
    },
    [remember]
  );
  const closeOverlay = (0, import_react7.useCallback)(() => {
    setDetail(null);
    setModal(null);
    const target = returnFocus.current;
    returnFocus.current = null;
    const y = scrollTop.current;
    window.setTimeout(() => {
      if (y > 0) window.scrollTo({ top: y });
      if (target !== null && document.contains(target)) target.focus({ preventScroll: true });
    }, 0);
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    WorkspaceContext.Provider,
    {
      value: {
        expandedId,
        detail,
        modal,
        selectedTaskId,
        toggleExpanded: (id) => setExpandedId((current) => current === id ? null : id),
        collapseAll: () => setExpandedId(null),
        openDetail,
        openModal,
        closeOverlay,
        selectTask: setSelectedTaskId
      },
      children
    }
  );
}
function useScrollLock(active) {
  (0, import_react7.useEffect)(() => {
    if (!active) return;
    const page = document.querySelector(".osb-page");
    const pageOverflow = page?.style.overflow ?? "";
    const bodyOverflow = document.body.style.overflow;
    if (page !== null) page.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (page !== null) page.style.overflow = pageOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [active]);
}

// src/client/v4/DetailContent.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var PRIORITY_LABEL = { normal: "普通", important: "重要", urgent: "紧急" };
function DetailContent({ detail }) {
  if (detail.kind === "task") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TaskDetail, { id: detail.id });
  if (detail.kind === "stat") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(StatDetail, { id: detail.id });
  if (detail.kind === "project") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ProjectDetail, { id: detail.id });
  if (detail.kind === "activity") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ActivityDetail, { id: detail.id });
  if (detail.kind === "day") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(DayDetail, { id: detail.id });
  if (detail.kind === "knowledge") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(KnowledgeDetail, { id: detail.id });
  if (detail.kind === "unavailable") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UnavailableDetail, { detail });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(RoadmapDetail, {});
}
function TaskDetail({ id }) {
  const board = useBoardData();
  const actions = useBoardActions();
  const workspace = useWorkspace();
  const [confirming, setConfirming] = (0, import_react8.useState)(false);
  const task = board.allTasks.find((item) => item.id === id);
  if (task === void 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-empty", children: "这个任务已经不存在了。" });
  const project = board.projects.find((item) => item.id === task.projectId);
  const subtasks = task.subtasks ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: task.done ? "v4-detail-title is-done" : "v4-detail-title", children: task.title }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "状态" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: task.done ? "已完成" : "进行中" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "优先级" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: PRIORITY_LABEL[task.priority ?? "normal"] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "项目" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: project?.name ?? "未归属" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "截止" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          task.dueAt === void 0 ? "—" : formatDateInput(task.dueAt),
          task.dueAt !== void 0 && isOverdue(task, Date.now()) ? "（已逾期）" : ""
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "已专注" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatMinutes(taskFocusMinutes(task)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "创建" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatDateInput(task.createdAt) })
      ] }),
      task.completedAt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "完成" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatRelative(task.completedAt) })
      ] })
    ] }),
    task.note === void 0 || task.note === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-note", children: task.note }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h3", { className: "v4-detail-subhead", children: [
      "子任务 ",
      subtasks.length === 0 ? "" : `${subtasks.filter((s) => s.done).length}/${subtasks.length}`
    ] }),
    subtasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "没有拆子任务。子任务目前只读：勾选与拆分随 Tasks 阶段迁移，已有数据照常展示。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-sublist", children: subtasks.map((sub) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { "data-done": sub.done ? "true" : "false", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { "aria-hidden": "true", children: sub.done ? "✓" : "○" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: sub.title })
    ] }, sub.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { size: "sm", variant: "primary", onClick: () => task.done ? actions.reopenTask(task.id) : actions.completeTask(task.id), children: task.done ? "重新打开" : "标记完成" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { size: "sm", onClick: () => workspace.openModal({ kind: "edit-task", taskId: task.id, title: "编辑任务" }), children: "编辑" }),
      confirming ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "v4-detail-confirm", role: "alert", children: [
        "删除后不可恢复",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Button,
          {
            size: "sm",
            variant: "danger",
            onClick: () => {
              actions.removeTask(task.id);
              workspace.closeOverlay();
            },
            children: "确认删除"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setConfirming(false), children: "取消" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { size: "sm", variant: "danger", onClick: () => setConfirming(true), children: "删除" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "任务绑定在首页「专注」卡的设置里（以结束那一刻的绑定为准）；预估时长尚未迁移，字段保留。" })
  ] });
}
function StatDetail({ id }) {
  const board = useBoardData();
  const now = Date.now();
  const stats = (0, import_react8.useMemo)(() => computeBoardStats(board.tasks, board.logs, now), [board.tasks, board.logs, now]);
  const done = board.tasks.filter((task) => task.done);
  const open = board.tasks.filter((task) => !task.done);
  if (id === "focus") {
    const weekLogs = board.logs.filter((log) => log.kind === "focus" && now - log.at < 7 * 864e5);
    const weekMinutes = weekLogs.reduce((sum, log) => sum + (log.minutes ?? 0), 0);
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-big", children: formatMinutes(stats.focusMinutesToday) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "今天所有 focus 日志的合计（休息不计入）。" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "今日记录" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
            stats.logsToday,
            " 条"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "本周合计" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatMinutes(weekMinutes) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "本周记录" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
            weekLogs.length,
            " 条"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "最近专注" }),
      weekLogs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "最近 7 天没有 focus 记录。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: weekLogs.slice(0, 8).map((log) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: formatTime(log.at) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: log.title }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-tail", children: formatMinutes(log.minutes ?? 0) })
      ] }, log.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "计时器在首页「专注」卡里：开始 / 暂停 / 继续 / 短休长休 / 结束并记录都已可用。" })
    ] });
  }
  if (id === "streak") {
    const doneToday = board.tasks.filter((task) => task.completedAt !== void 0 && dayKey(task.completedAt) === dayKey(now));
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-big", children: [
        stats.streakDays,
        " 天"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "按「当天有任务完成或有有效专注记录」计算连续天数。" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "今天完成" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
            doneToday.length,
            " 个"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "今天专注" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatMinutes(stats.focusMinutesToday) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "最近完成" }),
      board.tasks.every((task) => task.completedAt === void 0) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "还没有完成记录。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: board.tasks.filter((task) => task.completedAt !== void 0).sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0)).slice(0, 6).map((task) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: formatRelative(task.completedAt) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: task.title })
      ] }, task.id)) })
    ] });
  }
  if (id === "done") {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-big", children: [
        done.length,
        " / ",
        stats.tasksTotal
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "当前项目作用域内的完成情况（收起时按项目筛选）。" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "进行中" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: open.length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "已完成" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: done.length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "逾期" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.overdueTasks ?? 0 })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: done.slice(0, 8).map((task) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: task.completedAt === void 0 ? "—" : formatRelative(task.completedAt) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: task.title })
      ] }, task.id)) }),
      done.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "还没有已完成的任务。" }) : null
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-big", children: [
      stats.tasksTotal,
      " 个"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "今日任务：未完成且未归档的项目作用域内的全部任务。" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "待完成" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: open.length })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "今日完成" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.tasksDoneToday })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "逾期" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.overdueTasks ?? 0 })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "按优先级" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: open.slice(0, 8).map((task) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: PRIORITY_LABEL[task.priority ?? "normal"] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: task.title })
    ] }, task.id)) }),
    open.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "没有待完成任务。" }) : null
  ] });
}
function ProjectDetail({ id }) {
  const board = useBoardData();
  const project = board.projects.find((item) => item.id === id);
  if (project === void 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-empty", children: "这个项目已经不存在了。" });
  const tasks = board.allTasks.filter((task) => task.projectId === project.id);
  const done = tasks.filter((task) => task.done);
  const overdue = tasks.filter((task) => !task.done && isOverdue(task, Date.now())).length;
  const minutes = board.allLogs.filter((log) => log.projectId === project.id && log.kind === "focus").reduce((sum, log) => sum + (log.minutes ?? 0), 0);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-big", children: formatMinutes(minutes) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-muted", children: [
      project.name,
      " · 完成 ",
      done.length,
      " / ",
      tasks.length
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "逾期" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: overdue })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "创建" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatDateInput(project.createdAt) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "状态" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: project.archived ? "已归档" : "进行中" })
      ] })
    ] }),
    project.note === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-note", children: project.note }),
    project.archived ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "这个项目已归档，数据保留但不再出现在选择器里。" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "任务" }),
    tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "这个项目还没有任务。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: tasks.slice(0, 10).map((task) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { "data-done": task.done ? "true" : "false", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: task.done ? "✓" : "○" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: task.title })
    ] }, task.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "项目新建 / 模板 / 归档 / 快照随 Projects 阶段迁移，当前不可用；原有数据与代码均保留。" })
  ] });
}
function ActivityDetail({ id }) {
  const [timeline] = useLocalStore(STORAGE_KEYS.timeline, []);
  const event = timeline.find((item) => item.id === id);
  if (event === void 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-empty", children: "这条记录已经不存在了。" });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-title", children: event.title }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "类型" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: EVENT_META[event.type].label })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "时间" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: formatRelative(event.at) })
      ] }),
      event.projectId === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "项目" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: event.projectId })
      ] })
    ] }),
    event.detail === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-note", children: event.detail }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "完整时间轴在「历史」页（30 / 90 / 365 天热力图 + 按天分组）；按项目筛选不开放，日聚合没有项目维度。" })
  ] });
}
function DayDetail({ id }) {
  const board = useBoardData();
  const [daily] = useLocalStore(
    STORAGE_KEYS.daily,
    []
  );
  const [timeline] = useLocalStore(STORAGE_KEYS.timeline, []);
  if (id === void 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-empty", children: "没有选中的日期。" });
  const row = daily.find((item) => item.day === id);
  const logs = board.allLogs.filter((log) => dayKey(log.at) === id);
  const focus = logs.filter((log) => log.kind === "focus" && (log.minutes ?? 0) > 0);
  const completed = board.allTasks.filter((task) => task.completedAt !== void 0 && dayKey(task.completedAt) === id);
  const events = timeline.filter((event) => dayKey(event.at) === id).sort((left, right) => right.at - left.at);
  const minutes = focus.reduce((sum, log) => sum + (log.minutes ?? 0), 0);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-big", children: formatMinutes(minutes) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-muted", children: [
      formatDateInput((/* @__PURE__ */ new Date(`${id}T00:00:00`)).getTime()),
      " · ",
      weekdayOfDayKey(id),
      " · 本机记录"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "专注记录" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          focus.length,
          " 条"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "完成任务" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          completed.length,
          " 个"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "全部记录" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          logs.length,
          " 条"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "活动事件" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          events.length,
          " 条"
        ] })
      ] }),
      row === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "日聚合" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          formatMinutes(row.focusMinutes),
          " / ",
          row.tasksDone,
          " 个"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "当天完成的专注" }),
    focus.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "这一天没有 focus 记录。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: focus.slice(0, 10).map((log) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: formatTime(log.at) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: log.title }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-tail", children: formatMinutes(log.minutes ?? 0) })
    ] }, log.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "当天完成的任务" }),
    completed.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "这一天没有完成任务。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: completed.map((task) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: formatTime(task.completedAt) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: task.title })
    ] }, task.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "v4-detail-subhead", children: "当天活动" }),
    events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "这一天没有时间轴事件（会话日志明细尚未迁移）。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: events.slice(0, 10).map((event) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: formatTime(event.at) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
        EVENT_META[event.type].label,
        " · ",
        event.title
      ] })
    ] }, event.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "统计口径：专注只算有效 focus 记录，完成数只算 completedAt；时间轴用于明细，不重复累加。" })
  ] });
}
function KnowledgeDetail({ id }) {
  const [graph] = useLocalStore(STORAGE_KEYS.knowledge, { nodes: [], edges: [] });
  const [memory] = useLocalStore(STORAGE_KEYS.memory, []);
  const [reviews] = useLocalStore(STORAGE_KEYS.reviews, []);
  const stats = graphStats(graph);
  const rstats = reviewStats(reviews);
  const nodes = (0, import_react8.useMemo)(() => [...graph.nodes].sort((a, b) => b.updatedAt - a.updatedAt), [graph.nodes]);
  const target = id ?? "knowledge";
  if (target === "memory") {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-big", children: [
        memory.length,
        " 份"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "每个项目一份记忆文档；只读展示，起草与采纳仍需确认流程。" }),
      memory.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "还没有记忆文档。原有数据若存在，会在这里出现。" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: memory.slice(0, 8).map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "v4-detail-list-time", children: [
          "v",
          item.version
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: item.intro === "" ? "（无简介）" : item.intro }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-tail", children: formatRelative(item.updatedAt) })
      ] }, item.projectId)) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "记忆草稿、逐条采纳与版本对比随 Memory 阶段迁移。" })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-big", children: [
      stats.total,
      " 个知识点"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "从本地知识图谱读取，只读展示，不会触发任何写入。" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dl", { className: "v4-detail-facts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "已掌握" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.learned })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "学习中" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.learning })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "待复习" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.dueCount })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "依赖边" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dd", { children: stats.edges })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dt", { children: "复习记录" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { children: [
          rstats.total,
          " 次"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NodeList, { nodes }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "知识节点编辑、依赖关系与复习排期随 Knowledge 阶段迁移。" })
  ] });
}
function NodeList({ nodes }) {
  if (nodes.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "还没有知识节点。" });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-list", children: nodes.slice(0, 10).map((node) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-list-time", children: STATUS_LABEL[node.status] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: node.title }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "v4-detail-list-tail", children: [
      "掌握 ",
      node.mastery,
      "/5"
    ] })
  ] }, node.id)) });
}
var STATUS_LABEL = {
  todo: "待学",
  learning: "在学",
  learned: "已学",
  review: "复习"
};
function UnavailableDetail({ detail }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-title", children: detail.title }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "这块能力还在迁移中：没有从旧工作台偷偷打开，也不会用半成品顶替。" }),
    detail.note === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-note", children: detail.note }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-hint", children: "原有代码、数据与兼容逻辑全部保留；迁移完成后会直接出现在这个工作台里。" })
  ] });
}
function RoadmapDetail() {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "v4-detail-muted", children: "以下能力仍在迁移中。原有代码与数据都保留，不会丢失；它们**不再**通过经典工作台访问。" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "v4-detail-roadmap", children: ROADMAP.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "v4-detail-roadmap-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: row.name }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v4-detail-badge", "data-state": row.state, children: row.state === "next" ? "下一阶段" : row.state === "now" ? "本阶段" : "未开放" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: row.desc }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "v4-detail-roadmap-target", children: [
        "迁移位置：",
        row.target
      ] })
    ] }, row.name)) })
  ] });
}
var ROADMAP = [
  {
    name: "任务：详情 / 行内展开 / 弹层编辑",
    state: "now",
    target: "Tasks 页 + 统一抽屉 / 弹层",
    desc: "已完成：点击任务行展开摘要，抽屉看完整字段，弹层新建与编辑，删除两步确认。"
  },
  {
    name: "任务：子任务勾选 / 预估时长",
    state: "next",
    target: "Tasks 页 · 任务详情面板",
    desc: "子任务与预估目前只读（数据与展示都在），写入口需要先给 Actions 补方法，否则界面会写不进去。"
  },
  {
    name: "任务：会话绑定专注",
    state: "now",
    target: "Dashboard · 专注卡设置",
    desc: "已完成：可在专注卡的设置里绑定任务，归属以结束那一刻的绑定为准。"
  },
  {
    name: "专注计时器（开始 / 暂停 / 短休长休 / 任务绑定）",
    state: "now",
    target: "Dashboard · 专注卡",
    desc: "已完成（Phase 5.5）：时间戳计时、六态派生、短休长休、任务绑定、结算失败可重试，刷新与多标签页不会重复记账。"
  },
  {
    name: "会话日志与自动采集",
    state: "now",
    target: "页面根节点（CaptureBridge）",
    desc: "已完成（Phase 5.5）：采集挂在工作台根节点，页面切换不影响；自动记录只计「会话条数」，永远不进专注分钟。"
  },
  {
    name: "斜杠命令执行（/board-*）",
    state: "later",
    target: "History 页 · 记录列表",
    desc: "目前只把 /board-* 从日志里摘掉、不执行命令；执行通道与逐条日志编辑随下一阶段迁移。"
  },
  {
    name: "完整时间轴与学习日历",
    state: "now",
    target: "历史页",
    desc: "已完成：30 / 90 / 365 天热力图、活动强度、连续统计、按天分组的时间轴与当天详情。"
  },
  {
    name: "项目新建 / 模板 / 归档 / 快照",
    state: "later",
    target: "Projects 页 / 项目抽屉",
    desc: "只读统计已可用；写操作随 Projects 阶段迁移。"
  },
  {
    name: "备份 / 导入 / 导出 / 存储观测",
    state: "now",
    target: "设置 · 数据页",
    desc: "已完成：全量 / 时间窗导出、导入预览、合并与覆盖、事务回滚、存储观测与清空。"
  },
  {
    name: "记忆草稿 / 知识节点 / 复习排期",
    state: "later",
    target: "Knowledge 页",
    desc: "只读概览已接入 Dashboard；编辑与排期随 Knowledge 阶段迁移。"
  },
  {
    name: "阻碍记录 / 月度目标 / 上下文观测 / 调试",
    state: "later",
    target: "Settings 页 · 低频工具区",
    desc: "这些是低频诊断能力，统一收进设置，不再占用主视图。"
  }
];

// src/client/v4/TaskComposer.tsx
var import_react9 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
var EMPTY_FORM = { title: "", note: "", priority: "normal", due: "", projectId: "" };
function TaskComposer({ mode, task, defaultProjectId = "", onDone, onCancel }) {
  const board = useBoardData();
  const actions = useBoardActions();
  const editing = mode === "edit" && task !== void 0;
  const [form, setForm] = (0, import_react9.useState)(
    () => editing && task !== void 0 ? {
      title: task.title,
      note: task.note ?? "",
      priority: task.priority ?? "normal",
      due: task.dueAt === void 0 ? "" : formatDateInput(task.dueAt),
      projectId: task.projectId ?? ""
    } : { ...EMPTY_FORM, projectId: defaultProjectId }
  );
  const [error, setError] = (0, import_react9.useState)("");
  const submit = () => {
    const title = form.title.trim();
    if (title === "") {
      setError("任务标题不能为空");
      return;
    }
    let dueAt = null;
    if (form.due.trim() !== "") {
      dueAt = parseDateInput(form.due.trim());
      if (dueAt === null) {
        setError("截止日期格式应为 YYYY-MM-DD");
        return;
      }
    }
    if (!editing) {
      actions.createTask({
        title,
        note: form.note,
        priority: form.priority,
        ...dueAt === null ? {} : { dueAt },
        ...form.projectId === "" ? {} : { projectId: form.projectId }
      });
    } else {
      actions.updateTask(task.id, {
        title,
        note: form.note,
        priority: form.priority,
        dueAt,
        projectId: form.projectId
      });
    }
    onDone();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "v4-composer", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "v4-task-form", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "v4-task-field v4-task-field-wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "标题" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            className: "v4-field",
            value: form.title,
            onChange: (event) => setForm({ ...form, title: event.target.value }),
            onKeyDown: (event) => {
              if (event.key === "Enter") submit();
            },
            placeholder: "25 分钟内能推进的一步",
            "aria-label": "任务标题",
            autoFocus: true
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "v4-task-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "优先级" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "select",
          {
            className: "v4-field",
            value: form.priority,
            onChange: (event) => setForm({ ...form, priority: event.target.value }),
            "aria-label": "优先级",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "normal", children: "普通" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "important", children: "重要" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "urgent", children: "紧急" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "v4-task-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "截止日期" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            className: "v4-field",
            type: "date",
            value: form.due,
            onChange: (event) => setForm({ ...form, due: event.target.value }),
            "aria-label": "截止日期"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "v4-task-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "项目" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "select",
          {
            className: "v4-field",
            value: form.projectId,
            onChange: (event) => setForm({ ...form, projectId: event.target.value }),
            "aria-label": "项目归属",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "未归属" }),
              board.projects.filter((project) => !project.archived).map((project) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: project.id, children: project.name }, project.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "v4-task-field v4-task-field-wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "备注" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            className: "v4-field",
            value: form.note,
            onChange: (event) => setForm({ ...form, note: event.target.value }),
            placeholder: "可选：上下文、验收标准",
            "aria-label": "任务备注"
          }
        )
      ] })
    ] }),
    error === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "v4-task-error", role: "alert", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "v4-task-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { variant: "ghost", size: "sm", onClick: onCancel, children: "取消" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { variant: "primary", size: "sm", onClick: submit, children: editing ? "保存" : "创建" })
    ] })
  ] });
}

// src/client/v4/Detail.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var KIND_LABEL = {
  task: "任务",
  stat: "统计",
  project: "项目",
  activity: "活动",
  day: "某一天",
  knowledge: "知识与记忆",
  roadmap: "迁移计划",
  unavailable: "尚未开放"
};
var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
var PREFERRED_FOCUS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';
function useDialogKeys(panelRef, active, onClose) {
  (0, import_react10.useEffect)(() => {
    if (!active) return;
    const panel = panelRef.current;
    const first = panel?.querySelector(PREFERRED_FOCUS) ?? panel?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || panel === null) return;
      const nodes = [...panel.querySelectorAll(FOCUSABLE)].filter((node) => node.getClientRects().length > 0);
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === head || document.activeElement === panel)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose, panelRef]);
}
function OverlayHost() {
  const { detail, modal, closeOverlay } = useWorkspace();
  const panelRef = (0, import_react10.useRef)(null);
  const active = detail !== null || modal !== null;
  useScrollLock(active);
  useDialogKeys(panelRef, active, closeOverlay);
  if (!active) return null;
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
      "div",
      {
        className: "v4-overlay",
        "data-overlay": detail === null ? "modal" : "drawer",
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) closeOverlay();
        },
        children: [
          detail !== null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "div",
            {
              className: "v4-drawer v4-glass-3",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": detail.title,
              ref: panelRef,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "v4-drawer-head", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "v4-drawer-title", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: detail.title }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "v4-drawer-kind", children: KIND_LABEL[detail.kind] }),
                    detail.note === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "v4-drawer-note", children: detail.note })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "v4-close", "aria-label": "关闭", onClick: closeOverlay, children: "✕" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "v4-drawer-body", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(DetailContent, { detail }) })
              ]
            }
          ) : null,
          modal !== null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(TaskModal, { panelRef, title: modal.title, kind: modal.kind, taskId: modal.taskId }) : null
        ]
      }
    ),
    overlayHost()
  );
}
function TaskModal({
  panelRef,
  title,
  kind,
  taskId
}) {
  const { closeOverlay } = useWorkspace();
  const board = useBoardData();
  const task = taskId === void 0 ? void 0 : board.allTasks.find((item) => item.id === taskId);
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "v4-modal v4-glass-3", role: "dialog", "aria-modal": "true", "aria-label": title, ref: panelRef, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "v4-modal-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "v4-close", "aria-label": "关闭", onClick: closeOverlay, children: "✕" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "v4-modal-body", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      TaskComposer,
      {
        mode: kind === "edit-task" ? "edit" : "create",
        ...task === void 0 ? {} : { task },
        defaultProjectId: board.activeProjectId,
        onDone: closeOverlay,
        onCancel: closeOverlay
      }
    ) })
  ] });
}

// src/client/v4/Shell.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function V4Shell({ page, onPageChange, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(WorkspaceProvider, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "v4-shell", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Topbar, { page, onPageChange }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("main", { className: "v4-main", id: "v4-main", children })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(OverlayHost, {})
  ] });
}
function Topbar({ page, onPageChange }) {
  const board = useBoardData();
  const workspace = useWorkspace();
  const now = new Date(useNow(6e4));
  const dateLabel = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAYS[now.getDay()]}`;
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "v4-topbar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "v4-brand", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "v4-brand-mark", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("circle", { cx: "11", cy: "12", r: "7.2", stroke: "currentColor", strokeWidth: "1.6", opacity: ".85" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M11 8.4V12l2.4 1.6", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "v4-brand-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "v4-brand-title", children: "溯时学习工作台" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "v4-brand-sub", children: "Sorchron" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("nav", { className: "v4-nav", "aria-label": "工作台页面", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          className: page === "dashboard" ? "v4-nav-item is-active" : "v4-nav-item",
          "aria-current": page === "dashboard" ? "page" : void 0,
          onClick: () => onPageChange("dashboard"),
          children: "Dashboard"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          className: page === "tasks" ? "v4-nav-item is-active" : "v4-nav-item",
          "aria-current": page === "tasks" ? "page" : void 0,
          onClick: () => onPageChange("tasks"),
          children: "任务"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          className: page === "history" ? "v4-nav-item is-active" : "v4-nav-item",
          "aria-current": page === "history" ? "page" : void 0,
          onClick: () => onPageChange("history"),
          children: "历史"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "v4-topbar-end", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "v4-project-pick", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "v4-visually-hidden", children: "当前项目" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
          "select",
          {
            className: "v4-field v4-project-select",
            value: board.activeProjectId,
            onChange: (event) => board.setActiveProject(event.target.value),
            "aria-label": "当前项目",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "", children: "全部项目" }),
              board.activeProjects.map((project) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: project.id, children: project.name }, project.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("time", { className: "v4-topbar-date", dateTime: isoDate, children: dateLabel }),
      page === "settings" || page === "history" ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        Button,
        {
          size: "sm",
          variant: "primary",
          onClick: () => workspace.openModal({ kind: "create-task", title: "新建任务" }),
          children: "新建任务"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
        Button,
        {
          size: "sm",
          variant: page === "settings" ? "primary" : "ghost",
          onClick: () => onPageChange("settings"),
          ariaLabel: "设置与数据",
          title: "导出、导入、容量与清空",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("circle", { cx: "12", cy: "12", r: "3.2", stroke: "currentColor", strokeWidth: "1.6" }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "path",
                {
                  d: "M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1",
                  stroke: "currentColor",
                  strokeWidth: "1.6",
                  strokeLinecap: "round"
                }
              )
            ] }),
            "数据"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        Button,
        {
          size: "sm",
          variant: "ghost",
          onClick: () => workspace.openDetail({ kind: "roadmap", title: "功能迁移计划" }),
          title: "查看尚未迁移的能力、目标位置与顺序",
          children: "迁移计划"
        }
      )
    ] })
  ] });
}

// src/client/v4/CaptureBridge.tsx
var import_react13 = require("react");

// src/client/hooks/useSessionCapture.ts
var import_react12 = require("react");

// src/client/hooks/useHarnessEvent.ts
var import_react11 = require("react");
var HARNESS_BRIDGE_EVENT = "sorchron:harness-event";
var HARNESS_EVENT_CANDIDATES = [
  "harness/message",
  "harness/code-block",
  "harness/tool-call",
  "session/message",
  "session/message/added",
  "session/message/updated",
  "session/event",
  "session/updated",
  "conversation/message",
  "conversation/updated",
  "message",
  "message/added",
  "message/updated",
  "tool-call",
  "tool/result",
  "code-block"
];
var SERVICE_CANDIDATES = [
  "session",
  "sessions",
  "sessionQuery",
  "conversation",
  "connection",
  "harness",
  "chat"
];
var EMPTY_BINDING = { channel: "none", listeners: 0, services: [], errors: 0, deduped: 0 };
function readSessionId(payload) {
  if (typeof payload !== "object" || payload === null) return void 0;
  const candidate = payload.sessionId;
  if (typeof candidate === "string") return candidate;
  const session = payload.session;
  if (typeof session === "object" && session !== null) {
    const id = session.id;
    if (typeof id === "string") return id;
  }
  return void 0;
}
function asEmitter(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const candidate = value;
  return typeof candidate.on === "function" ? candidate : void 0;
}
function preflight(payload) {
  if (payload === void 0 || payload === null) return { ok: false, signature: "" };
  try {
    const text = JSON.stringify(payload);
    if (typeof text !== "string") return { ok: false, signature: "" };
    if (text.length < 3) return { ok: false, signature: "" };
    if (text.length > BOARD_CONFIG.capture.maxPayloadChars) {
      warn("capture", `payload too large (${text.length} chars) — dropped`);
      return { ok: false, signature: "" };
    }
    return { ok: true, signature: contentSignature("payload", text) };
  } catch {
    return { ok: true, signature: "" };
  }
}
var activeDispose = null;
function bindEmitters(emitter, prefix, schedule, disposers) {
  let count = 0;
  for (const eventName of HARNESS_EVENT_CANDIDATES) {
    try {
      const off = emitter.on(eventName, (payload) => schedule(`${prefix}${eventName}`, payload));
      if (typeof off === "function") disposers.push(off);
      count += 1;
    } catch {
    }
  }
  return count;
}
function useHarnessEvent(ctx, options) {
  const { onEvent, enabled = true, debounceMs = BOARD_CONFIG.capture.debounceMs } = options;
  const handlerRef = (0, import_react11.useRef)(onEvent);
  (0, import_react11.useEffect)(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);
  const [binding, setBinding] = (0, import_react11.useState)(EMPTY_BINDING);
  (0, import_react11.useEffect)(() => {
    if (!enabled) {
      setBinding(EMPTY_BINDING);
      info("capture", "listener disabled — skipping every event");
      return;
    }
    if (activeDispose !== null) {
      try {
        activeDispose();
        info("capture", "previous listener instance disposed before re-binding");
      } catch (error) {
        warn("capture", "previous instance cleanup failed — continuing", error);
      }
      activeDispose = null;
    }
    const disposers = [];
    const pending = /* @__PURE__ */ new Map();
    const dedupe = createDedupeWindow();
    let errorCount = 0;
    let dedupedCount = 0;
    const deliver = (type, payload) => {
      try {
        handlerRef.current({ type, at: Date.now(), sessionId: readSessionId(payload), payload });
      } catch (error) {
        errorCount += 1;
        warn("capture", `handler threw for "${type}" (${errorCount})`, error);
        if (errorCount >= BOARD_CONFIG.capture.errorThreshold) {
          setBinding((previous) => ({ ...previous, errors: errorCount, deduped: dedupedCount }));
        }
      }
    };
    const flush = (type) => {
      const item = pending.get(type);
      if (item === void 0) return;
      pending.delete(type);
      if (typeof item.timer === "number") window.clearTimeout(item.timer);
      deliver(type, item.payload);
    };
    const schedule = (type, payload) => {
      const gate = preflight(payload);
      if (!gate.ok) return;
      if (gate.signature !== "" && !dedupe.admit(gate.signature)) {
        dedupedCount += 1;
        if (dedupedCount % 10 === 1) debug("capture", `duplicate suppressed (${dedupedCount} total)`);
        return;
      }
      if (debounceMs <= 0) {
        deliver(type, payload);
        return;
      }
      const now = Date.now();
      const existing = pending.get(type);
      if (existing !== void 0 && typeof existing.timer === "number") {
        window.clearTimeout(existing.timer);
      }
      const first = existing?.first ?? now;
      const elapsed = now - first;
      const wait = Math.max(0, Math.min(debounceMs, BOARD_CONFIG.capture.maxWaitMs - elapsed));
      const timer = window.setTimeout(() => flush(type), wait);
      pending.set(type, { payload, timer, first });
      if (elapsed >= BOARD_CONFIG.capture.maxWaitMs) flush(type);
    };
    const ctxEmitter = ctx !== void 0 ? asEmitter(ctx) : void 0;
    const ctxListeners = ctxEmitter === void 0 ? 0 : bindEmitters(ctxEmitter, "", schedule, disposers);
    const boundServices = [];
    let serviceListeners = 0;
    if (typeof ctx?.get === "function") {
      for (const serviceName of SERVICE_CANDIDATES) {
        let service;
        try {
          service = ctx.get(serviceName);
        } catch {
          continue;
        }
        const emitter = asEmitter(service);
        if (emitter === void 0) continue;
        boundServices.push(serviceName);
        serviceListeners += bindEmitters(emitter, `${serviceName}:`, schedule, disposers);
      }
    }
    let bridgeBound = false;
    if (typeof window !== "undefined") {
      const onBridge = (event) => {
        try {
          const detail = event.detail;
          const type = typeof detail?.type === "string" ? detail.type : "bridge/message";
          schedule(type, detail?.payload);
        } catch (error) {
          warn("capture", "bridge handler failed", error);
        }
      };
      try {
        window.addEventListener(HARNESS_BRIDGE_EVENT, onBridge);
        disposers.push(() => window.removeEventListener(HARNESS_BRIDGE_EVENT, onBridge));
        bridgeBound = true;
      } catch (error) {
        warn("capture", "window bridge unavailable", error);
      }
    }
    const next = ctxListeners > 0 ? { channel: "ctx", listeners: ctxListeners, services: boundServices, errors: 0, deduped: 0 } : serviceListeners > 0 ? { channel: "service", listeners: serviceListeners, services: boundServices, errors: 0, deduped: 0 } : bridgeBound ? { channel: "window", listeners: 1, services: [], errors: 0, deduped: 0 } : EMPTY_BINDING;
    setBinding(next);
    info("capture", `channel bound: ${next.channel}`, {
      listeners: next.listeners,
      services: next.services,
      bridge: bridgeBound,
      debounceMs
    });
    const dispose = () => {
      for (const item of pending.values()) {
        if (typeof item.timer === "number") window.clearTimeout(item.timer);
      }
      pending.clear();
      for (const release of disposers) {
        try {
          release();
        } catch {
        }
      }
      disposers.length = 0;
      dedupe.clear();
      if (activeDispose === dispose) activeDispose = null;
      debug("capture", "listener detached");
    };
    activeDispose = dispose;
    return dispose;
  }, [ctx, enabled, debounceMs]);
  return binding;
}

// src/client/hooks/useSessionCapture.ts
var MAX_EVENTS_PER_SECOND = BOARD_CONFIG.capture.maxPerSecond;
function useSessionCapture(options) {
  const { ctx, enabled, rules, sessionId, projectId, taskId, onDraft, onFriction, onUserText } = options;
  const rateRef = (0, import_react12.useRef)({ windowStart: 0, count: 0, dropped: 0 });
  const cbRef = (0, import_react12.useRef)({ onDraft, onFriction, onUserText });
  cbRef.current = { onDraft, onFriction, onUserText };
  const handleEvent = (0, import_react12.useCallback)(
    (event) => {
      try {
        const now = Date.now();
        const window2 = rateRef.current;
        if (now - window2.windowStart > 1e3) {
          window2.windowStart = now;
          window2.count = 0;
        }
        window2.count += 1;
        if (window2.count > MAX_EVENTS_PER_SECOND) {
          window2.dropped += 1;
          if (window2.dropped % 25 === 1) {
            debug("capture", `rate limit hit — dropped ${window2.dropped} events so far`);
          }
          return;
        }
        const normalized = normalizeHarnessEvent(event);
        if (normalized.binary === true) {
          debug("capture", `skipped ${event.type} — binary/attachment payload`);
          return;
        }
        if (normalized.text.trim() === "" && normalized.codeBlocks.length === 0) {
          debug("capture", `ignored ${event.type} — empty payload`);
          return;
        }
        if (normalized.role !== "assistant" && normalized.text.trim().startsWith("/")) {
          const consumed = cbRef.current.onUserText?.(normalized.text, normalized.sessionId ?? sessionId);
          if (consumed === true) {
            debug("capture", `consumed slash command: ${normalized.text.split(/\s+/)[0] ?? ""}`);
            return;
          }
        }
        const draft = buildLogDraft(normalized, {
          rules,
          now: event.at,
          ...projectId === void 0 || projectId === "" ? {} : { projectId },
          ...taskId === void 0 || taskId === "" ? {} : { taskId },
          charsPerToken: BOARD_CONFIG.context.charsPerToken
        });
        if (draft === void 0) {
          debug("capture", `ignored ${event.type} — nothing worth logging`);
          return;
        }
        if (sessionId !== void 0 && draft.sessionId === void 0) {
          draft.sessionId = sessionId;
        }
        debug("capture", `accepted ${draft.kind}/${draft.sessionType}`, draft.title);
        if (draft.sessionType === "debug" && cbRef.current.onFriction !== void 0) {
          try {
            const friction = buildFrictionDraft(draft, {
              ...draft.projectId === void 0 ? {} : { projectId: draft.projectId },
              ...draft.taskId === void 0 ? {} : { taskId: draft.taskId },
              ...draft.sessionId === void 0 ? {} : { sessionId: draft.sessionId }
            });
            if (friction !== void 0) cbRef.current.onFriction(friction);
          } catch (error) {
            warn("capture", "friction extraction failed — log kept", error);
          }
        }
        try {
          cbRef.current.onDraft(draft);
        } catch (error) {
          warn("capture", "onDraft failed — entry skipped", error);
        }
      } catch (error) {
        warn("capture", `failed to process "${event.type}"`, error);
      }
    },
    [rules, sessionId, projectId, taskId]
  );
  const binding = useHarnessEvent(ctx, { enabled, onEvent: handleEvent });
  (0, import_react12.useEffect)(() => {
    if (!enabled) {
      setCaptureStatus("off", "监听已关闭");
      return;
    }
    if (binding.channel === "none") {
      setCaptureStatus("error", "未找到可用事件通道");
      return;
    }
    if (binding.errors > 0) {
      setCaptureStatus("error", `解析失败 ${binding.errors} 次`);
      return;
    }
    const dedupeText = binding.deduped > 0 ? ` · 去重 ${binding.deduped}` : "";
    setCaptureStatus("on", `通道：${binding.channel} · ${binding.listeners} 个监听器${dedupeText}`);
  }, [enabled, binding.channel, binding.listeners, binding.errors, binding.deduped]);
  (0, import_react12.useEffect)(() => {
    return () => {
      setCaptureStatus("off", "页面已卸载");
    };
  }, []);
  return binding;
}
function mergeLogDraft(logs, draft) {
  const key = dedupeKey(draft);
  const cutoff = draft.at - DEDUPE_WINDOW_MS;
  let merged = false;
  const next = logs.map((log) => {
    if (merged) return log;
    if (log.source !== "auto") return log;
    if (log.at < cutoff) return log;
    if (dedupeKey(log) !== key) return log;
    merged = true;
    return {
      ...log,
      at: draft.at,
      hits: (log.hits ?? 1) + 1,
      tokens: (log.tokens ?? 0) + (draft.tokens ?? 0)
    };
  });
  if (merged) {
    debug("capture", `merged into an existing row: ${key}`);
    return next;
  }
  return [{ ...draft, id: createId("log") }, ...logs];
}

// src/client/v4/CaptureBridge.tsx
function CaptureBridge({ ctx, sessionId }) {
  const board = useBoardData();
  const actions = useBoardActions();
  const { settings } = useBoardSettings();
  const handleDraft = (0, import_react13.useCallback)(
    (draft) => {
      const existing = board.allLogs;
      const merged = mergeLogDraft(existing, draft);
      if (merged.length === existing.length) {
        board.setLogs(merged);
        return;
      }
      const created = merged[0];
      if (created === void 0) return;
      actions.addSessionLog(created);
    },
    [board, actions]
  );
  const handleFriction = (0, import_react13.useCallback)(
    (draft) => {
      actions.addFrictionMerged(draft);
    },
    [actions]
  );
  const handleUserText = (0, import_react13.useCallback)((text) => {
    if (!text.trimStart().startsWith("/")) return false;
    debug("capture", `slash command consumed without execution: ${text.split(/\s+/)[0] ?? ""}`);
    return true;
  }, []);
  useSessionCapture({
    ...ctx === void 0 ? {} : { ctx },
    enabled: settings.autoCapture,
    rules: settings.projectRules,
    ...sessionId === void 0 || sessionId === "" ? {} : { sessionId },
    ...board.activeProjectId === "" ? {} : { projectId: board.activeProjectId },
    onDraft: handleDraft,
    onFriction: handleFriction,
    onUserText: handleUserText
  });
  return null;
}

// src/client/hooks/useSettlementRecovery.ts
var import_react14 = require("react");
function useSettlementRecovery() {
  const done = (0, import_react14.useRef)(false);
  (0, import_react14.useEffect)(() => {
    if (done.current) return;
    done.current = true;
    const store = createBrowserStore();
    if (store === void 0) return;
    try {
      const result = repairSettlementStore(store);
      if (!result.changed) return;
      if (!result.ok) {
        warn("storage", "duplicate settlement repair failed to persist — data left untouched", result);
        pushNotice("发现重复的专注记录，但修正未能写入（存储可能已满），请导出备份后重试", "error");
        return;
      }
      info("storage", "duplicate settlements repaired", result);
      pushNotice(
        `发现 ${result.removedLogs} 条重复的专注记录，已合并并回退 ${result.rolledBackMinutes} 分钟`,
        "warn"
      );
    } catch (error) {
      warn("storage", "duplicate settlement repair threw — skipped", error);
    }
  }, []);
}

// src/client/v4/Dashboard.tsx
var import_react18 = require("react");

// src/client/lib/heatmap.ts
function levelOf(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const [t1, t2, t3, t4] = BOARD_CONFIG.daily.thresholds;
  if (minutes >= (t4 ?? 120)) return 4;
  if (minutes >= (t3 ?? 60)) return 3;
  if (minutes >= (t2 ?? 25)) return 2;
  if (minutes >= (t1 ?? 1)) return 1;
  return 0;
}

// src/client/lib/activity.ts
var TASK_SCORE_WEIGHT = 25;
var ACTIVITY_LEVEL_LABEL = {
  0: "无活动",
  1: "轻量（<25 分钟等效）",
  2: "中等（25–59）",
  3: "较高（60–119）",
  4: "高强度（≥120）"
};
var DAY_MS = 24 * 60 * 60 * 1e3;
function weekdayIndex(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return (date.getDay() + 6) % 7;
}
function shiftDayKey(key, delta) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + delta);
  return dayKey(date.getTime());
}
function blankDay(day, inRange) {
  return {
    day,
    focusMinutes: 0,
    tasksDone: 0,
    focusCount: 0,
    activityCount: 0,
    score: 0,
    level: 0,
    inRange,
    focusSource: "empty",
    tasksSource: "tasks",
    reconciled: false
  };
}
function buildActivityWindow(input, options) {
  const now = options.now ?? Date.now();
  const keys = recentDayKeys(options.range, now);
  const dailyByDay = /* @__PURE__ */ new Map();
  for (const item of input.daily) dailyByDay.set(item.day, item);
  const focusByDay = /* @__PURE__ */ new Map();
  const otherByDay = /* @__PURE__ */ new Map();
  const seenLogs = /* @__PURE__ */ new Set();
  for (const log of input.logs) {
    if (seenLogs.has(log.id)) continue;
    seenLogs.add(log.id);
    const key = dayKey(log.at);
    if (log.kind === "focus") {
      const minutes = Math.max(0, Math.round(log.minutes ?? 0));
      if (minutes <= 0) continue;
      const current = focusByDay.get(key) ?? { minutes: 0, count: 0 };
      focusByDay.set(key, { minutes: current.minutes + minutes, count: current.count + 1 });
    } else {
      otherByDay.set(key, (otherByDay.get(key) ?? 0) + 1);
    }
  }
  const tasksByDay = /* @__PURE__ */ new Map();
  for (const task of input.tasks) {
    if (task.completedAt === void 0) continue;
    const key = dayKey(task.completedAt);
    tasksByDay.set(key, (tasksByDay.get(key) ?? 0) + 1);
  }
  const tasksComplete = input.tasks.length < MAX_TASK_ENTRIES;
  const logsComplete = input.logs.length < MAX_LOG_ENTRIES;
  const days = keys.map((day) => {
    const aggregate = dailyByDay.get(day);
    const logFocus = focusByDay.get(day) ?? { minutes: 0, count: 0 };
    const dailyMinutes = aggregate?.focusMinutes;
    const focusMinutes = Math.max(dailyMinutes ?? 0, logFocus.minutes);
    const focusSource = dailyMinutes === void 0 ? logFocus.minutes > 0 ? "logs" : "empty" : logFocus.minutes > dailyMinutes ? "reconciled" : "daily";
    const liveTasks = tasksByDay.get(day) ?? 0;
    const tasksDone = tasksComplete ? liveTasks : Math.max(liveTasks, aggregate?.tasksDone ?? 0);
    const liveOther = otherByDay.get(day) ?? 0;
    const otherCount = logsComplete ? liveOther : Math.max(liveOther, aggregate?.sessions ?? 0);
    const focusCount = logFocus.count > 0 ? logFocus.count : focusMinutes > 0 ? 1 : 0;
    const activityCount = tasksDone + focusCount + otherCount;
    const score = focusMinutes + tasksDone * TASK_SCORE_WEIGHT;
    const reconciled = dailyMinutes !== void 0 && logFocus.minutes > dailyMinutes || !tasksComplete && aggregate !== void 0 && aggregate.tasksDone !== liveTasks;
    return {
      day,
      focusMinutes,
      tasksDone,
      focusCount,
      activityCount,
      score,
      level: levelOf(score),
      inRange: true,
      focusSource,
      tasksSource: tasksComplete ? "tasks" : "daily",
      reconciled
    };
  });
  return {
    range: options.range,
    days,
    summary: summarize(days)
  };
}
function summarize(days) {
  const active = days.map((day) => day.score > 0);
  let activeDays = 0;
  let longestStreak = 0;
  let run = 0;
  let focusMinutes = 0;
  let tasksDone = 0;
  let activityCount = 0;
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    focusMinutes += day.focusMinutes;
    tasksDone += day.tasksDone;
    activityCount += day.activityCount;
    if (active[index] === true) {
      activeDays += 1;
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 0;
    }
  }
  const lastIndex = days.length - 1;
  const todayActive = lastIndex >= 0 && active[lastIndex] === true;
  let currentStreak = 0;
  let cursor = todayActive ? lastIndex : lastIndex - 1;
  while (cursor >= 0 && active[cursor] === true) {
    currentStreak += 1;
    cursor -= 1;
  }
  return {
    startDay: days[0]?.day ?? "",
    endDay: days[lastIndex]?.day ?? "",
    activeDays,
    longestStreak,
    currentStreak,
    focusMinutes,
    tasksDone,
    activityCount,
    todayActive
  };
}
function buildActivityCalendar(days) {
  if (days.length === 0) return { weeks: [], monthLabels: [] };
  const first = days[0];
  const padStart = weekdayIndex(first.day);
  const cells = [];
  for (let index = padStart; index > 0; index -= 1) {
    cells.push(blankDay(shiftDayKey(first.day, -index), false));
  }
  cells.push(...days);
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    cells.push(blankDay(shiftDayKey(last.day, 1), false));
  }
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  const monthLabels = [];
  weeks.forEach((week, weekIndex) => {
    const firstOfMonth = week.find((cell) => cell.inRange && cell.day.endsWith("-01"));
    if (firstOfMonth === void 0) return;
    const month = Number(firstOfMonth.day.slice(5, 7));
    if (!Number.isFinite(month)) return;
    monthLabels.push({ weekIndex, label: `${month}月` });
  });
  return { weeks, monthLabels };
}
function groupTimelineByDay(events) {
  const map = /* @__PURE__ */ new Map();
  for (const event of events) {
    const key = dayKey(event.at);
    const list = map.get(key);
    if (list === void 0) map.set(key, [event]);
    else list.push(event);
  }
  return [...map.entries()].map(([day, list]) => ({
    day,
    at: Math.max(...list.map((event) => event.at)),
    events: [...list].sort((left, right) => right.at - left.at)
  })).sort((left, right) => right.at - left.at);
}

// src/client/v4/Expandable.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function ExpandablePanel({
  id,
  title,
  meta,
  summary,
  detail,
  hint,
  variant = "quiet",
  className,
  actions,
  pad = "default"
}) {
  const { expandedId, toggleExpanded } = useWorkspace();
  const open = expandedId === id && detail !== void 0;
  const regionId = `v4-panel-${id}`;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
    "section",
    {
      className: [variant === "quiet" ? "v4-glass-2" : "v4-glass-1", "v4-expand", open ? "is-open" : "", className ?? ""].filter(Boolean).join(" "),
      style: { padding: pad === "none" ? 0 : "var(--v4-s4)" },
      "data-panel": id,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("header", { className: "v4-expand-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
            "button",
            {
              type: "button",
              className: "v4-expand-toggle",
              "aria-expanded": open,
              "aria-controls": detail === void 0 ? void 0 : regionId,
              onClick: () => toggleExpanded(id),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "v4-expand-title", children: title }),
                meta === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "v4-expand-meta", children: meta }),
                detail === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "v4-expand-hint", "aria-hidden": "true", children: open ? "收起" : hint ?? "展开" }),
                detail === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "v4-expand-chevron", "data-open": open ? "true" : "false", "aria-hidden": "true", children: "▾" })
              ]
            }
          ),
          actions === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "v4-expand-actions", children: actions })
        ] }),
        summary === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "v4-expand-summary", children: summary }),
        open ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "v4-expand-body", id: regionId, children: detail }) : null
      ]
    }
  );
}

// src/client/v4/FocusPanel.tsx
var import_react16 = require("react");

// src/client/hooks/useTimer.ts
var import_react15 = require("react");

// src/client/lib/focus.ts
var FOCUS_STATUS_LABEL = {
  idle: "待开始",
  running: "专注中",
  paused: "已暂停",
  completed: "本轮完成",
  break: "休息中",
  "break-paused": "休息暂停"
};
function isBreakPhase(phase) {
  return phase === "short" || phase === "long";
}
function focusStatus(state) {
  const phase = state.phase ?? "focus";
  const duration = Math.max(0, state.durationMinutes) * 60;
  if (isBreakPhase(phase)) return state.running ? "break" : "break-paused";
  if (state.running) return "running";
  const remaining = Math.max(0, Math.min(duration, state.remainingSeconds));
  if (remaining <= 0) return "completed";
  if (state.startedAt !== null) return "paused";
  return "idle";
}
function remainingSecondsAt(state, now) {
  if (state.running && state.deadline !== null) {
    return Math.max(0, Math.ceil((state.deadline - now) / 1e3));
  }
  const duration = Math.max(0, state.durationMinutes) * 60;
  const stored = Number.isFinite(state.remainingSeconds) ? state.remainingSeconds : duration;
  return Math.max(0, Math.min(duration, stored));
}
function elapsedSecondsAt(state, now) {
  if (isBreakPhase(state.phase)) return 0;
  const duration = Math.max(0, state.durationMinutes) * 60;
  return Math.max(0, Math.min(duration, duration - remainingSecondsAt(state, now)));
}
function actualFocusMinutes(state, now) {
  return Math.floor(elapsedSecondsAt(state, now) / 60);
}
function focusProgress(state, now) {
  const duration = Math.max(0, state.durationMinutes) * 60;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingSecondsAt(state, now) / duration));
}
function createRoundId(now = Date.now(), random = Math.random) {
  return `focus-${now.toString(36)}-${Math.floor(random() * 16777215).toString(36)}`;
}
function idleState(state, minutes) {
  const phase = state.phase ?? "focus";
  const target = isBreakPhase(phase) ? clampBreakMinutes(minutes ?? state.durationMinutes, state.durationMinutes) : clampDurationMinutes(minutes ?? state.durationMinutes);
  return {
    ...state,
    running: false,
    deadline: null,
    durationMinutes: target,
    remainingSeconds: target * 60,
    startedAt: null,
    roundId: "",
    lastMinutes: void 0,
    lastEndedAt: void 0,
    lastTaskId: void 0,
    pendingResult: void 0,
    ...isBreakPhase(phase) ? {} : { focusMinutes: target }
  };
}
function startRound(state, now) {
  if (state.running) return state;
  if (isBreakPhase(state.phase)) return state;
  const duration = Math.max(0, state.durationMinutes) * 60;
  const resumed = state.startedAt !== null && state.remainingSeconds > 0 && state.remainingSeconds <= duration;
  const total = resumed ? state.remainingSeconds : duration;
  if (total <= 0) return state;
  return {
    ...state,
    running: true,
    deadline: now + total * 1e3,
    remainingSeconds: total,
    startedAt: resumed ? state.startedAt : now,
    roundId: resumed ? state.roundId : createRoundId(now),
    phase: "focus"
  };
}
function pauseRound(state, now) {
  if (!state.running) return state;
  return { ...state, running: false, deadline: null, remainingSeconds: remainingSecondsAt(state, now) };
}
function endRound(state, now, settings) {
  if (!state.running && focusStatus(state) !== "paused") {
    return {
      state,
      result: {
        roundId: "",
        minutes: 0,
        elapsedSeconds: 0,
        targetMinutes: state.durationMinutes,
        taskId: state.boundTaskId,
        startedAt: now,
        endedAt: now,
        longBreak: false,
        recorded: false
      }
    };
  }
  const targetMinutes = clampDurationMinutes(state.durationMinutes);
  const elapsed = elapsedSecondsAt(state, now);
  const minutes = Math.floor(elapsed / 60);
  const roundsDone = (state.roundInCycle ?? 0) + 1;
  const longBreak = roundsDone >= Math.max(2, settings.roundsBeforeLongBreak || 4);
  const endedAt = state.running && state.deadline !== null ? Math.min(now, state.deadline) : now;
  const startedAt = state.startedAt ?? endedAt;
  const roundId = state.roundId !== void 0 && state.roundId !== "" ? state.roundId : `focus-${startedAt.toString(36)}`;
  const result = {
    roundId,
    minutes,
    elapsedSeconds: elapsed,
    targetMinutes,
    taskId: state.boundTaskId,
    startedAt,
    endedAt,
    longBreak,
    recorded: minutes >= 1
  };
  const next = {
    ...state,
    running: false,
    deadline: null,
    remainingSeconds: 0,
    startedAt: null,
    roundId: "",
    roundInCycle: roundsDone,
    focusMinutes: targetMinutes,
    phase: "focus",
    // 记下真实结算值：刷新后 completed 态要能显示「18 分钟」而不是目标 25 分钟。
    lastMinutes: minutes,
    lastEndedAt: endedAt,
    ...state.boundTaskId === "" ? {} : { lastTaskId: state.boundTaskId },
    /**
     * 待落盘标记（Phase 5.5.1）：只有「真的该写一条记录」时才留。
     * 落盘成功后由 useTimer 清掉；失败时它就留在存储里，下次挂载自动重试。
     */
    ...result.recorded ? {
      pendingResult: {
        roundId,
        minutes,
        elapsedSeconds: elapsed,
        targetMinutes,
        taskId: state.boundTaskId,
        startedAt,
        endedAt
      }
    } : {}
  };
  return { state: next, result };
}
function cancelRound(state) {
  return idleState(state);
}
function startBreak(state, now, settings, kind) {
  const longBreak = kind === "long" || kind === void 0 && (state.roundInCycle ?? 0) >= Math.max(2, settings.roundsBeforeLongBreak || 4);
  const minutes = longBreak ? clampBreakMinutes(settings.longBreakMinutes, 15) : clampBreakMinutes(settings.shortBreakMinutes, 5);
  const phase = longBreak ? "long" : "short";
  const focusMinutes = clampDurationMinutes(state.focusMinutes ?? state.durationMinutes);
  const next = {
    ...state,
    phase,
    durationMinutes: minutes,
    remainingSeconds: minutes * 60,
    running: true,
    deadline: now + minutes * 6e4,
    startedAt: now,
    roundId: "",
    focusMinutes,
    roundInCycle: longBreak ? 0 : state.roundInCycle ?? 0
  };
  return { state: next, info: { phase, minutes, longBreak } };
}
function finishBreak(state) {
  if (!isBreakPhase(state.phase)) return state;
  const focusMinutes = clampDurationMinutes(state.focusMinutes ?? state.durationMinutes);
  return {
    ...state,
    phase: "focus",
    durationMinutes: focusMinutes,
    remainingSeconds: focusMinutes * 60,
    running: false,
    deadline: null,
    startedAt: null,
    roundId: "",
    focusMinutes
  };
}
function resumeRound(state, now) {
  if (state.running) return state;
  const duration = Math.max(0, state.durationMinutes) * 60;
  const total = Math.max(0, Math.min(duration, state.remainingSeconds));
  if (total <= 0) return state;
  return {
    ...state,
    running: true,
    deadline: now + total * 1e3,
    remainingSeconds: total,
    startedAt: state.startedAt ?? now
  };
}

// src/client/hooks/useTimer.ts
var TICK_MS = 250;
function readOutcome(value) {
  if (value === false) return { ok: false };
  if (value === true || value === void 0) return { ok: true };
  return { ok: value.ok, ...value.baseline === void 0 ? {} : { baseline: value.baseline } };
}
function readDiscard(value) {
  if (value === false) return { ok: false, message: "", persisted: false };
  if (value === true || value === void 0) return { ok: true, message: "", persisted: false };
  return { ok: value.ok, message: value.message, persisted: value.persisted === true };
}
function loadState(key, fallbackMinutes) {
  const fallback = createDefaultTimerState();
  fallback.durationMinutes = clampDurationMinutes(fallbackMinutes, DEFAULT_DURATION_MINUTES);
  fallback.remainingSeconds = fallback.durationMinutes * 60;
  fallback.focusMinutes = fallback.durationMinutes;
  let warning;
  const read = readStoreEnvelope(key, fallback, (data) => {
    const restored = restoreTimerState(data);
    if (restored.warning !== void 0) warning = restored.warning;
    return restored.state;
  });
  return { state: read.value, ...warning === void 0 ? {} : { warning } };
}
function useTimer(options) {
  const {
    storageKey,
    initialDurationMinutes = DEFAULT_DURATION_MINUTES,
    onComplete,
    onDiscard,
    onBreakStart,
    onBreakEnd,
    onPhaseChange,
    breakEnabled = true,
    shortBreakMinutes = 5,
    longBreakMinutes = 15,
    roundsBeforeLongBreak = 4
  } = options;
  const loadedRef = (0, import_react15.useRef)(null);
  if (loadedRef.current === null) loadedRef.current = loadState(storageKey, initialDurationMinutes);
  const [state, setState] = (0, import_react15.useState)(loadedRef.current.state);
  const [now, setNow] = (0, import_react15.useState)(() => Date.now());
  const stateRef = (0, import_react15.useRef)(state);
  const settlingRef = (0, import_react15.useRef)(false);
  const cbRef = (0, import_react15.useRef)({ onComplete, onDiscard, onBreakStart, onBreakEnd, onPhaseChange });
  cbRef.current = { onComplete, onDiscard, onBreakStart, onBreakEnd, onPhaseChange };
  const settingsRef = (0, import_react15.useRef)({
    breakEnabled,
    shortBreakMinutes,
    longBreakMinutes,
    roundsBeforeLongBreak
  });
  settingsRef.current = { breakEnabled, shortBreakMinutes, longBreakMinutes, roundsBeforeLongBreak };
  (0, import_react15.useEffect)(() => {
    const warning = loadedRef.current?.warning;
    if (warning !== void 0) {
      warn("timer", warning);
      pushNotice(warning, "warn");
    }
  }, []);
  const commit = (0, import_react15.useCallback)(
    (next) => {
      stateRef.current = next;
      setState(next);
      setNow(Date.now());
      const written = writeStore(storageKey, next);
      if (!written) debug("timer", "state write skipped — see the storage notice");
      return written;
    },
    [storageKey]
  );
  const clearPendingSettlement = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    if (current.pendingResult === void 0) return true;
    const next = { ...current };
    delete next.pendingResult;
    return commit(next);
  }, [commit]);
  const keepBaseline = (0, import_react15.useCallback)(
    (baseline) => {
      const current = stateRef.current;
      const pending = current.pendingResult;
      if (pending === void 0 || pending.before !== void 0) return;
      commit({ ...current, pendingResult: { ...pending, before: baseline } });
    },
    [commit]
  );
  const settleFocus2 = (0, import_react15.useCallback)(() => {
    if (settlingRef.current) return;
    const current = stateRef.current;
    const settleable = current.running || !isBreakPhase(current.phase) && focusStatus(current) === "paused";
    if (!settleable) return;
    settlingRef.current = true;
    try {
      const at = Date.now();
      const { state: next, result } = endRound(current, at, settingsRef.current);
      commit(next);
      info(
        "timer",
        result.recorded ? `round complete: ${result.minutes} min` : "round ended under 1 min — not recorded",
        { roundId: result.roundId, elapsedSeconds: result.elapsedSeconds, targetMinutes: result.targetMinutes }
      );
      if (!result.recorded) {
        pushNotice("不足 1 分钟，本轮没有记入专注", "warn");
        return;
      }
      let delivered = true;
      try {
        delivered = cbRef.current.onComplete?.(result);
      } catch (error) {
        warn("timer", "onComplete threw", error);
        pushNotice("计时已结束，但记录写入失败，详见控制台", "error");
        delivered = false;
      }
      const outcome = readOutcome(delivered);
      if (outcome.ok) clearPendingSettlement();
      else if (outcome.baseline !== void 0) keepBaseline(outcome.baseline);
    } finally {
      settlingRef.current = false;
    }
  }, [clearPendingSettlement, commit]);
  const settleBreak = (0, import_react15.useCallback)(() => {
    if (settlingRef.current) return;
    const current = stateRef.current;
    if (!current.running || !isBreakPhase(current.phase)) return;
    settlingRef.current = true;
    try {
      const from = current.phase ?? "short";
      commit(finishBreak(current));
      info("timer", `break finished → back to focus (${stateRef.current.durationMinutes} min)`);
      pushNotice("休息结束，可以开始下一轮专注了", "info");
      const change = {
        from,
        to: "focus",
        minutes: stateRef.current.focusMinutes ?? stateRef.current.durationMinutes,
        longBreak: from === "long",
        phase: from
      };
      try {
        cbRef.current.onBreakEnd?.(change);
        cbRef.current.onPhaseChange?.(change);
      } catch (error) {
        warn("timer", "onBreakEnd threw", error);
      }
    } finally {
      settlingRef.current = false;
    }
  }, [commit]);
  const start = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    const next = startRound(current, Date.now());
    if (next === current) return;
    commit(next);
    info("timer", `started ${next.durationMinutes} min`, {
      boundTaskId: next.boundTaskId,
      roundId: next.roundId,
      resumed: current.remainingSeconds > 0 && current.remainingSeconds < current.durationMinutes * 60
    });
  }, [commit]);
  const pause = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    const next = pauseRound(current, Date.now());
    if (next === current) return;
    commit(next);
    debug("timer", "paused");
  }, [commit]);
  const end = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    if (isBreakPhase(current.phase)) return;
    if (!current.running && focusStatus(current) !== "paused") return;
    settleFocus2();
  }, [settleFocus2]);
  const cancel = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    const next = cancelRound(current);
    commit(next);
    info("timer", "round cancelled — nothing recorded");
  }, [commit]);
  const reset = (0, import_react15.useCallback)(
    (nextDurationMinutes) => {
      const current = stateRef.current;
      const isBreak = isBreakPhase(current.phase);
      const minutes = isBreak ? clampBreakMinutes(nextDurationMinutes ?? current.durationMinutes, current.durationMinutes) : clampDurationMinutes(nextDurationMinutes ?? current.durationMinutes);
      commit({
        ...current,
        running: false,
        deadline: null,
        durationMinutes: minutes,
        remainingSeconds: minutes * 60,
        startedAt: null,
        roundId: "",
        ...isBreak ? {} : { focusMinutes: minutes }
      });
      debug("timer", `reset to ${minutes} min (${current.phase ?? "focus"})`);
    },
    [commit]
  );
  const setDurationMinutes = (0, import_react15.useCallback)(
    (minutes) => {
      if (stateRef.current.running) {
        warn("timer", "duration change ignored while running");
        pushNotice("计时进行中，先暂停再改时长", "warn");
        return;
      }
      reset(minutes);
    },
    [reset]
  );
  const setBoundTaskId = (0, import_react15.useCallback)(
    (taskId) => {
      commit({ ...stateRef.current, boundTaskId: taskId });
    },
    [commit]
  );
  const beginBreak = (0, import_react15.useCallback)(
    (kind) => {
      const current = stateRef.current;
      if (current.running) return;
      if (isBreakPhase(current.phase)) return;
      const { state: next, info: breakInfo } = startBreak(current, Date.now(), settingsRef.current, kind);
      commit(next);
      info("timer", `break started: ${breakInfo.phase} ${breakInfo.minutes} min`);
      pushNotice(
        breakInfo.longBreak ? `进入长休 ${breakInfo.minutes} 分钟，休息不计入专注` : `进入短休 ${breakInfo.minutes} 分钟，休息不计入专注`,
        "info"
      );
      const change = { from: "focus", to: breakInfo.phase, ...breakInfo };
      try {
        cbRef.current.onBreakStart?.(change);
        cbRef.current.onPhaseChange?.(change);
      } catch (error) {
        warn("timer", "onBreakStart threw", error);
      }
    },
    [commit]
  );
  const skipBreak = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    if (!isBreakPhase(current.phase)) return;
    const from = current.phase ?? "short";
    commit(finishBreak(current));
    info("timer", "break skipped");
    const change = {
      from,
      to: "focus",
      minutes: stateRef.current.focusMinutes ?? stateRef.current.durationMinutes,
      longBreak: from === "long",
      phase: from
    };
    try {
      cbRef.current.onBreakEnd?.(change);
      cbRef.current.onPhaseChange?.(change);
    } catch (error) {
      warn("timer", "onBreakEnd threw", error);
    }
  }, [commit]);
  const retryPending = (0, import_react15.useCallback)(() => {
    const pending = stateRef.current.pendingResult;
    if (pending === void 0) return true;
    const result = {
      roundId: pending.roundId,
      minutes: pending.minutes,
      elapsedSeconds: pending.elapsedSeconds,
      targetMinutes: pending.targetMinutes,
      taskId: pending.taskId,
      startedAt: pending.startedAt,
      endedAt: pending.endedAt,
      longBreak: false,
      recorded: pending.minutes >= 1
    };
    let delivered = true;
    try {
      delivered = cbRef.current.onComplete?.(result, pending.before);
    } catch (error) {
      warn("timer", "retry onComplete threw", error);
      delivered = false;
    }
    const outcome = readOutcome(delivered);
    if (!outcome.ok) {
      if (outcome.baseline !== void 0) keepBaseline(outcome.baseline);
      return false;
    }
    clearPendingSettlement();
    return true;
  }, [clearPendingSettlement, keepBaseline]);
  const discardPending = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    const pending = current.pendingResult;
    if (pending === void 0) return true;
    const cleared = { ...current };
    delete cleared.pendingResult;
    if (cbRef.current.onDiscard === void 0) {
      warn("timer", "pending settlement discarded by user (no onDiscard)", { roundId: pending.roundId });
      const written = clearPendingSettlement();
      if (!written) pushNotice("放弃标记没能写入，刷新后这一笔可能被重新补写；请检查存储后再试", "error");
      return written;
    }
    let delivered = true;
    try {
      delivered = cbRef.current.onDiscard(pending, { key: storageKey, value: cleared });
    } catch (error) {
      warn("timer", "onDiscard threw", error);
      delivered = false;
    }
    const info2 = readDiscard(delivered);
    if (!info2.ok) {
      warn("timer", "discard refused", { roundId: pending.roundId, message: info2.message });
      pushNotice(info2.message === "" ? "无法安全放弃这一笔，已保留待保存状态" : info2.message, "error");
      return false;
    }
    if (info2.persisted) {
      stateRef.current = cleared;
      setState(cleared);
      setNow(Date.now());
    } else {
      const written = clearPendingSettlement();
      if (!written) pushNotice("放弃标记没能写入，刷新后这一笔可能被重新补写；请检查存储后再试", "error");
      if (!written) return false;
    }
    warn("timer", "pending settlement discarded by user", { roundId: pending.roundId });
    if (info2.message !== "") pushNotice(info2.message, "info");
    return true;
  }, [clearPendingSettlement, storageKey]);
  const resumeBreak = (0, import_react15.useCallback)(() => {
    const current = stateRef.current;
    if (!isBreakPhase(current.phase)) return;
    const next = resumeRound(current, Date.now());
    if (next === current) return;
    commit(next);
    debug("timer", "break resumed");
  }, [commit]);
  const retriedRef = (0, import_react15.useRef)(false);
  (0, import_react15.useEffect)(() => {
    if (retriedRef.current) return;
    retriedRef.current = true;
    if (stateRef.current.pendingResult === void 0) return;
    info("timer", "found an un-settled round — retrying", { roundId: stateRef.current.pendingResult.roundId });
    retryPending();
  }, [retryPending]);
  (0, import_react15.useEffect)(() => {
    if (!state.running || state.deadline === null) return;
    const id = window.setInterval(() => {
      try {
        const current = stateRef.current;
        const at = Date.now();
        setNow(at);
        if (remainingSecondsAt(current, at) > 0) return;
        window.clearInterval(id);
        if (isBreakPhase(current.phase)) settleBreak();
        else settleFocus2();
      } catch (error) {
        warn("timer", "tick failed", error);
        window.clearInterval(id);
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [state.running, state.deadline, settleFocus2, settleBreak]);
  const restoredRef = (0, import_react15.useRef)(false);
  (0, import_react15.useEffect)(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const current = stateRef.current;
    if (!current.running || current.deadline === null) return;
    if (current.deadline > Date.now()) return;
    info("timer", "round finished while away — settling it now");
    if (isBreakPhase(current.phase)) settleBreak();
    else settleFocus2();
  }, [settleFocus2, settleBreak]);
  (0, import_react15.useEffect)(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const current = stateRef.current;
      if (!current.running || current.deadline === null) return;
      if (remainingSecondsAt(current, Date.now()) > 0) return;
      if (isBreakPhase(current.phase)) settleBreak();
      else settleFocus2();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [settleFocus2, settleBreak]);
  const status = focusStatus(state);
  const remainingSeconds = remainingSecondsAt(state, now);
  return {
    status,
    statusLabel: FOCUS_STATUS_LABEL[status],
    phase: state.phase ?? "focus",
    running: state.running,
    remainingSeconds,
    durationSeconds: state.durationMinutes * 60,
    durationMinutes: state.durationMinutes,
    elapsedSeconds: elapsedSecondsAt(state, now),
    actualMinutes: actualFocusMinutes(state, now),
    progress: focusProgress(state, now),
    boundTaskId: state.boundTaskId,
    startedAt: state.startedAt,
    roundId: state.roundId ?? "",
    roundInCycle: state.roundInCycle ?? 0,
    focusMinutes: state.focusMinutes ?? state.durationMinutes,
    lastResult: state.lastMinutes === void 0 ? null : { minutes: state.lastMinutes, endedAt: state.lastEndedAt ?? now, taskId: state.lastTaskId ?? "" },
    pendingResult: state.pendingResult ?? null,
    start,
    pause,
    end,
    cancel,
    reset,
    setDurationMinutes,
    setBoundTaskId,
    beginBreak,
    skipBreak,
    resumeBreak,
    retryPending,
    discardPending
  };
}

// src/client/v4/FocusPanel.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var PRESETS = [15, 25, 45];
var PHASE_LABEL = { focus: "专注", short: "短休", long: "长休" };
function FocusPanel() {
  const board = useBoardData();
  const actions = useBoardActions();
  const { settings, patch } = useBoardSettings();
  const workspace = useWorkspace();
  const [daily] = useLocalStore(STORAGE_KEYS.daily, []);
  const [justFinished, setJustFinished] = (0, import_react16.useState)(null);
  const [durationText, setDurationText] = (0, import_react16.useState)(String(settings.lastDurationMinutes));
  const [saveError, setSaveError] = (0, import_react16.useState)(null);
  const [discarded, setDiscarded] = (0, import_react16.useState)(null);
  const handleComplete = (info2, baseline) => {
    const report = actions.finishFocus(info2, baseline);
    setJustFinished(info2);
    setDiscarded(null);
    if (!report.ok) {
      setSaveError(report.message);
      return {
        ok: false,
        ...report.baseline === void 0 ? {} : { baseline: report.baseline }
      };
    }
    setSaveError(null);
    return { ok: true };
  };
  const handleDiscard = (pending, cleared) => {
    const result2 = {
      roundId: pending.roundId,
      minutes: pending.minutes,
      elapsedSeconds: pending.elapsedSeconds,
      targetMinutes: pending.targetMinutes,
      taskId: pending.taskId,
      startedAt: pending.startedAt,
      endedAt: pending.endedAt,
      longBreak: false,
      recorded: pending.minutes >= 1
    };
    const report = actions.discardFocus(result2, pending.before, cleared);
    if (!report.ok) {
      setDiscarded(null);
      setSaveError(report.message);
      return { ok: false, message: report.message, persisted: false };
    }
    setSaveError(null);
    setDiscarded(report.message);
    return { ok: true, message: report.message, persisted: report.persisted };
  };
  const timer = useTimer({
    storageKey: STORAGE_KEYS.timer,
    initialDurationMinutes: settings.lastDurationMinutes,
    onComplete: handleComplete,
    onDiscard: handleDiscard,
    breakEnabled: settings.breakEnabled,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    roundsBeforeLongBreak: settings.roundsBeforeLongBreak
  });
  const boundTask = board.allTasks.find((task) => task.id === timer.boundTaskId);
  const isBreak = timer.phase !== "focus";
  const today = dayKey(Date.now());
  const focusLogs = (0, import_react16.useMemo)(() => board.logs.filter((log) => log.kind === "focus"), [board.logs]);
  const todayLogs = (0, import_react16.useMemo)(() => focusLogs.filter((log) => dayKey(log.at) === today), [focusLogs, today]);
  const week = (0, import_react16.useMemo)(() => {
    const days = recentDayKeys(7);
    const keySet = new Set(days);
    return focusLogs.filter((log) => keySet.has(dayKey(log.at))).reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0);
  }, [focusLogs]);
  const weekActive = (0, import_react16.useMemo)(
    () => buildActivityWindow({ tasks: board.allTasks, logs: board.allLogs, daily }, { range: 7 }).summary.activeDays,
    [board.allTasks, board.allLogs, daily]
  );
  const unsaved = timer.pendingResult !== null;
  const result = justFinished ?? timer.lastResult;
  const shownMinutes = timer.status === "completed" ? timer.pendingResult?.minutes ?? result?.minutes ?? 0 : timer.actualMinutes;
  const resultTask = result === null ? void 0 : board.allTasks.find((task) => task.id === result.taskId);
  const recorded = (0, import_react16.useMemo)(
    () => result === null ? false : board.allLogs.some((log) => log.kind === "focus" && log.at === result.endedAt),
    [board.allLogs, result]
  );
  function commitDuration() {
    const parsed = parseIntegerInput(durationText);
    if (parsed === null) {
      setDurationText(String(timer.durationMinutes));
      setSaveError(`时长需要是 ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} 之间的整数`);
      return;
    }
    const minutes = clampDurationMinutes(parsed);
    setDurationText(String(minutes));
    timer.setDurationMinutes(minutes);
    patch({ lastDurationMinutes: minutes });
    setSaveError(null);
  }
  function beginRound() {
    if (timer.pendingResult !== null) return;
    setJustFinished(null);
    setSaveError(null);
    setDiscarded(null);
    if (timer.status === "completed") timer.reset(timer.durationMinutes);
    timer.start();
  }
  const compact = /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-live", "data-status": timer.status, "data-phase": timer.phase, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-clock-box", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "v4-focus-clock", "data-status": timer.status, "aria-label": `剩余 ${formatClock(timer.remainingSeconds)}`, children: formatClock(timer.remainingSeconds) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "v4-focus-track", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-track-fill", style: { width: `${Math.round(timer.progress * 100)}%` } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "v4-focus-clock-sub", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "status", "aria-live": "polite", children: isBreak ? `${PHASE_LABEL[timer.phase]} · ${timer.statusLabel}` : timer.statusLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-clock-dot", "aria-hidden": "true", children: "·" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "v4-focus-clock-elapsed", children: [
          "已专注 ",
          shownMinutes,
          " 分"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-body", children: [
      timer.status === "completed" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "div",
        {
          className: "v4-focus-result",
          "data-unsaved": unsaved ? "true" : "false",
          "data-discarded": discarded !== null || !recorded ? "true" : "false",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "v4-focus-result-title", children: [
              "本轮完成 · ",
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("strong", { children: formatMinutes(result?.minutes ?? 0) }),
              unsaved ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-unsaved", children: "未保存" }) : null,
              !unsaved && (discarded !== null || !recorded) ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-abandoned", children: "已放弃" }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "v4-focus-result-sub", children: [
              unsaved ? saveError ?? "写入失败：这一笔还在计时状态里，刷新也不会丢，可以重试" : discarded !== null ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-discarded", children: discarded }) : !recorded ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-discarded", children: "本轮未记入（已放弃这一笔，存储里没有找到对应的专注日志）" }) : resultTask === void 0 ? "已记入（自由专注，未绑定任务）" : `已记入「${resultTask.title}」`,
              unsaved || result === null || discarded !== null || !recorded ? "" : ` · ${formatRelative(result.endedAt)}`
            ] })
          ]
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
          "button",
          {
            type: "button",
            className: "v4-focus-task-btn",
            "aria-expanded": workspace.expandedId === "focus",
            "aria-controls": "v4-panel-focus",
            title: "展开设置任务、时长与休息",
            onClick: () => workspace.toggleExpanded("focus"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-task", children: boundTask === void 0 ? "自由专注（未绑定任务）" : boundTask.title }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-task-cue", "aria-hidden": "true", children: "设置" })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "v4-focus-hint", children: isBreak ? "休息不计入专注时长，也不会写专注记录" : `目标 ${timer.durationMinutes} 分钟 · 第 ${timer.roundInCycle % Math.max(2, settings.roundsBeforeLongBreak) + 1} / ${settings.roundsBeforeLongBreak} 轮` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-actions", children: [
        timer.status === "idle" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: beginRound, children: "开始专注" }) : null,
        timer.status === "running" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: timer.pause, children: "暂停" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "ghost", onClick: timer.end, children: "结束并记录" })
        ] }) : null,
        timer.status === "paused" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: timer.start, children: "继续" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "ghost", onClick: timer.end, children: "结束并记录" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "ghost", onClick: timer.cancel, children: "取消" })
        ] }) : null,
        timer.status === "completed" && unsaved ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: () => timer.retryPending(), children: "重试写入" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "ghost", onClick: timer.discardPending, children: "放弃这一笔" })
        ] }) : null,
        timer.status === "completed" && !unsaved ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: beginRound, children: "开始下一轮" }),
          settings.breakEnabled ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", onClick: () => timer.beginBreak(timer.roundInCycle >= settings.roundsBeforeLongBreak ? "long" : "short"), children: timer.roundInCycle >= settings.roundsBeforeLongBreak ? "进入长休" : "进入休息" }) : null
        ] }) : null,
        timer.status === "break" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: timer.pause, children: "暂停休息" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "ghost", onClick: timer.skipBreak, children: "跳过休息" })
        ] }) : null,
        timer.status === "break-paused" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "primary", onClick: timer.resumeBreak, children: "继续休息" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "ghost", onClick: timer.skipBreak, children: "结束休息" })
        ] }) : null
      ] })
    ] })
  ] });
  const details = /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-detail", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-label", children: "时长" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "v4-focus-control", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            className: "v4-field v4-focus-number",
            type: "number",
            min: MIN_DURATION_MINUTES,
            max: MAX_DURATION_MINUTES,
            step: 5,
            value: durationText,
            disabled: timer.running || isBreak,
            "aria-label": `专注时长（${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} 分钟）`,
            onChange: (event) => setDurationText(event.target.value),
            onBlur: commitDuration,
            onKeyDown: (event) => {
              if (event.key === "Enter") commitDuration();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-unit", children: "分钟" }),
        PRESETS.map((minutes) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "v4-focus-preset",
            "data-active": timer.durationMinutes === minutes && !isBreak ? "true" : "false",
            disabled: timer.running || isBreak,
            onClick: () => {
              setDurationText(String(minutes));
              timer.setDurationMinutes(minutes);
              patch({ lastDurationMinutes: minutes });
            },
            children: minutes
          },
          minutes
        ))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { className: "v4-focus-label", htmlFor: "v4-focus-task", children: "绑定任务" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-control", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          id: "v4-focus-task",
          className: "v4-field v4-focus-select",
          value: timer.boundTaskId,
          disabled: isBreak,
          onChange: (event) => timer.setBoundTaskId(event.target.value),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "", children: "不绑定（自由专注）" }),
            board.tasks.filter((task) => !task.done).map((task) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: task.id, children: task.title }, task.id))
          ]
        }
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "v4-focus-note", children: "可以在专注过程中更换任务，归属以结束那一刻的绑定为准；任务被删除后，历史日志仍然保留时长与标题。" }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-label", children: "休息" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "v4-focus-control v4-focus-breaks", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "v4-focus-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              type: "checkbox",
              checked: settings.breakEnabled,
              onChange: (event) => patch({ breakEnabled: event.target.checked })
            }
          ),
          "完成后可进入休息"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "v4-focus-inline", children: [
          "短休",
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "v4-field v4-focus-number",
              type: "number",
              min: 1,
              max: 30,
              value: settings.shortBreakMinutes,
              "aria-label": "短休分钟",
              onChange: (event) => patch({ shortBreakMinutes: clampBreakMinutes(parseIntegerInput(event.target.value) ?? settings.shortBreakMinutes, 5) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "v4-focus-inline", children: [
          "长休",
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "v4-field v4-focus-number",
              type: "number",
              min: 1,
              max: 30,
              value: settings.longBreakMinutes,
              "aria-label": "长休分钟",
              onChange: (event) => patch({ longBreakMinutes: clampBreakMinutes(parseIntegerInput(event.target.value) ?? settings.longBreakMinutes, 15) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "v4-focus-inline", children: [
          "每",
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "v4-field v4-focus-number",
              type: "number",
              min: 2,
              max: 8,
              value: settings.roundsBeforeLongBreak,
              "aria-label": "几轮后长休",
              onChange: (event) => patch({ roundsBeforeLongBreak: Math.max(2, Math.min(8, parseIntegerInput(event.target.value) ?? settings.roundsBeforeLongBreak)) })
            }
          ),
          "轮长休"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "v4-focus-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-label", children: "最近" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-control v4-focus-recent", children: focusLogs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-note", children: "还没有专注记录。完成第一轮后会出现在这里。" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "v4-focus-recent-list", children: focusLogs.slice(0, 3).map((log) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "button",
        {
          type: "button",
          className: "v4-focus-recent-row",
          onClick: () => workspace.openDetail({ kind: "day", id: dayKey(log.at), title: `${weekdayOfDayKey(dayKey(log.at))} · ${formatRelative(log.at)}` }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-recent-time", children: formatRelative(log.at) }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-recent-title", children: log.title }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-recent-min", children: formatMinutes(log.minutes ?? 0) })
          ]
        }
      ) }, log.id)) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "v4-focus-note", children: "计时以时间戳为准：切后台、刷新、睡眠恢复都不会让钟走偏；结束记的是实际时长，不足 1 分钟不写入。 自动采集的会话记录不会计入专注分钟。" }),
    saveError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "v4-focus-error", role: "alert", children: saveError })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    ExpandablePanel,
    {
      id: "focus",
      title: "专注",
      meta: `今天 ${formatMinutes(todayLogs.reduce((sum, log) => sum + Math.max(0, log.minutes ?? 0), 0))}`,
      hint: "时长 · 任务 · 休息",
      actions: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "v4-focus-state-chip", "data-status": timer.status, children: timer.statusLabel }),
      summary: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
        compact,
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "v4-focus-foot", children: [
          "今天 ",
          todayLogs.length,
          " 段 · 本周 ",
          formatMinutes(week),
          " · 近 7 日活跃 ",
          weekActive,
          " 天"
        ] })
      ] }),
      detail: details
    }
  );
}

// src/client/v4/Heatmap.tsx
var import_react17 = require("react");
var import_react_dom2 = require("react-dom");
var import_jsx_runtime11 = require("react/jsx-runtime");
var RANGE_LABEL = {
  7: "近 7 天",
  30: "近 30 天",
  90: "近 90 天",
  365: "近 365 天"
};
function ActivityHeatmap({ calendar, today, range, onOpenDay, legend = "top" }) {
  const gridRef = (0, import_react17.useRef)(null);
  const [hover, setHover] = (0, import_react17.useState)(null);
  const [focused, setFocused] = (0, import_react17.useState)(today);
  const days = (0, import_react17.useMemo)(() => calendar.weeks.flat().filter((cell) => cell.inRange), [calendar.weeks]);
  const dayByKey = (0, import_react17.useMemo)(() => new Map(days.map((day) => [day.day, day])), [days]);
  (0, import_react17.useEffect)(() => {
    if (!dayByKey.has(focused)) setFocused(today);
  }, [dayByKey, focused, today]);
  const showAt = (0, import_react17.useCallback)((element, day) => {
    const rect = element.getBoundingClientRect();
    const half = 84;
    const left = Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8);
    const below = rect.top < 140;
    setHover({ day, left, top: below ? rect.bottom + 8 : rect.top - 22, below });
  }, []);
  const handleOver = (0, import_react17.useCallback)(
    (event) => {
      const target = event.target.closest("[data-day]");
      if (target === null) return;
      const day = dayByKey.get(target.dataset.day ?? "");
      if (day !== void 0) showAt(target, day);
    },
    [dayByKey, showAt]
  );
  const handleFocus = (0, import_react17.useCallback)(
    (event) => {
      const target = event.target.closest("[data-day]");
      if (target === null) return;
      const day = dayByKey.get(target.dataset.day ?? "");
      if (day === void 0) return;
      setFocused(day.day);
      showAt(target, day);
    },
    [dayByKey, showAt]
  );
  const handleKey = (0, import_react17.useCallback)(
    (event) => {
      const index = days.findIndex((day) => day.day === focused);
      if (index < 0) return;
      let next = index;
      if (event.key === "ArrowLeft") next = index - 7;
      else if (event.key === "ArrowRight") next = index + 7;
      else if (event.key === "ArrowUp") next = index - 1;
      else if (event.key === "ArrowDown") next = index + 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = days.length - 1;
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpenDay(focused);
        return;
      } else {
        return;
      }
      event.preventDefault();
      const target = days[Math.min(days.length - 1, Math.max(0, next))];
      if (target === void 0) return;
      setFocused(target.day);
      gridRef.current?.querySelector(`[data-day="${target.day}"]`)?.focus();
    },
    [days, focused, onOpenDay]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "v4-heat", "data-legend": legend, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "v4-heat-legend", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "少" }),
      [0, 1, 2, 3, 4].map((level) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("i", { "data-level": level }, level)),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "多" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "v4-heat-scrollhint", children: "左右滑动查看全年" }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "v4-heat-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "v4-heat-weekdays", "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "一" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "三" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: "五" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "v4-heat-scroll", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "v4-heat-months", style: { gridTemplateColumns: `repeat(${calendar.weeks.length}, 12px)` }, children: calendar.monthLabels.map((item) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: { gridColumnStart: item.weekIndex + 1 }, children: item.label }, `${item.weekIndex}-${item.label}`)) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "div",
          {
            className: "v4-heat-grid",
            ref: gridRef,
            role: "group",
            "aria-label": `学习活动热力图，${RANGE_LABEL[range]}，共 ${days.length} 天；方向键移动，Enter 查看当天`,
            onMouseOver: handleOver,
            onMouseLeave: () => setHover(null),
            onFocus: handleFocus,
            onBlur: () => setHover(null),
            onKeyDown: handleKey,
            children: calendar.weeks.map((week, weekIndex) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "v4-heat-col", children: week.map((cell) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              HeatCell,
              {
                cell,
                focused: cell.day === focused,
                today: cell.day === today,
                onOpen: onOpenDay
              },
              cell.day
            )) }, week[0]?.day ?? weekIndex))
          }
        )
      ] })
    ] }),
    hover === null ? null : (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "div",
        {
          className: "v4-heat-tip",
          "data-below": hover.below ? "true" : "false",
          style: { left: hover.left, top: hover.top },
          role: "tooltip",
          "aria-hidden": "true",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { className: "v4-heat-tip-date", children: [
              formatDateInput((/* @__PURE__ */ new Date(`${hover.day.day}T00:00:00`)).getTime()),
              " · ",
              weekdayOfDayKey(hover.day.day)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "v4-heat-tip-level", children: ACTIVITY_LEVEL_LABEL[hover.day.level] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
              "完成任务：",
              hover.day.tasksDone
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
              "专注时间：",
              hover.day.focusMinutes,
              " 分钟"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
              "专注次数：",
              hover.day.focusCount,
              " 次"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
              "学习活动：",
              hover.day.activityCount,
              " 项"
            ] }),
            hover.day.reconciled ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "v4-heat-tip-warn", children: "该日聚合与原始记录不一致，已取更完整的一方" }) : null
          ]
        }
      ),
      overlayHost()
    )
  ] });
}
var HeatCell = (0, import_react17.memo)(function HeatCell2({ cell, focused, today, onOpen }) {
  if (!cell.inRange) {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "v4-heat-cell is-out", "aria-hidden": "true" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
    "button",
    {
      type: "button",
      className: today ? "v4-heat-cell is-today" : "v4-heat-cell",
      "data-level": cell.level,
      "data-day": cell.day,
      tabIndex: focused ? 0 : -1,
      "aria-label": `${cell.day}，${ACTIVITY_LEVEL_LABEL[cell.level]}，完成 ${cell.tasksDone} 个任务，专注 ${cell.focusMinutes} 分钟，专注 ${cell.focusCount} 次`,
      onClick: () => onOpen(cell.day)
    }
  );
});

// src/client/v4/Dashboard.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
var PRIORITY_LABEL2 = { normal: "普通", important: "重要", urgent: "紧急" };
var STATUS_LABEL2 = { todo: "待学", learning: "在学", learned: "已学", review: "复习" };
function Dashboard({ onNavigate, onCreateTask }) {
  const board = useBoardData();
  const actions = useBoardActions();
  const workspace = useWorkspace();
  const createTask2 = onCreateTask ?? (() => workspace.openModal({ kind: "create-task", title: "新建任务" }));
  const now = useNow();
  const [daily] = useLocalStore(STORAGE_KEYS.daily, []);
  const [timeline] = useLocalStore(STORAGE_KEYS.timeline, []);
  const [graph] = useLocalStore(STORAGE_KEYS.knowledge, { nodes: [], edges: [] });
  const [memory] = useLocalStore(STORAGE_KEYS.memory, []);
  const [reviews] = useLocalStore(STORAGE_KEYS.reviews, []);
  const days = (0, import_react18.useMemo)(() => recentDayKeys(7, now), [now]);
  const stats = (0, import_react18.useMemo)(() => computeBoardStats(board.tasks, board.logs, now), [board.tasks, board.logs, now]);
  const streak = (0, import_react18.useMemo)(() => countStreak(board.tasks, board.logs, now), [board.tasks, board.logs, now]);
  const byDay = (0, import_react18.useMemo)(() => new Map(daily.map((item) => [item.day, item])), [daily]);
  const series = (0, import_react18.useMemo)(() => days.map((day) => byDay.get(day)?.focusMinutes ?? 0), [days, byDay]);
  const weekMinutes = series.reduce((sum, value) => sum + value, 0);
  const peakIndex = series.reduce((best, value, index) => value > series[best] ? index : best, 0);
  const peakMinutes = series[peakIndex] ?? 0;
  const activityDays = (0, import_react18.useMemo)(() => {
    const active = /* @__PURE__ */ new Set();
    for (const task of board.tasks) if (task.completedAt !== void 0) active.add(dayKey(task.completedAt));
    for (const log of board.logs) if (log.kind === "focus" && (log.minutes ?? 0) > 0) active.add(dayKey(log.at));
    return days.map((day) => active.has(day));
  }, [board.tasks, board.logs, days]);
  const today = dayKey(now);
  const activity = (0, import_react18.useMemo)(
    () => buildActivityWindow({ daily, tasks: board.allTasks, logs: board.allLogs }, { range: 365, now }),
    // `today` 让跨零点后自动重算；不直接依赖 now（每 30 秒会变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, board.allTasks, board.allLogs, today]
  );
  const calendar = (0, import_react18.useMemo)(() => buildActivityCalendar(activity.days), [activity.days]);
  const openDay = (0, import_react18.useCallback)(
    (day) => {
      workspace.openDetail({
        kind: "day",
        id: day,
        title: `${formatDateInput((/* @__PURE__ */ new Date(`${day}T00:00:00`)).getTime())} · ${weekdayOfDayKey(day)}`
      });
    },
    [workspace]
  );
  const projectTasks = (0, import_react18.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const task of board.tasks) {
      const key = task.projectId ?? "";
      const row = map.get(key) ?? { total: 0, done: 0 };
      row.total += 1;
      if (task.done) row.done += 1;
      map.set(key, row);
    }
    return map;
  }, [board.tasks]);
  const allProjects = (0, import_react18.useMemo)(
    () => projectRanking(board.allLogs, board.allTasks, board.projects, board.activeProjectId, { includeEmpty: true }),
    [board.allLogs, board.allTasks, board.projects, board.activeProjectId]
  );
  const events = (0, import_react18.useMemo)(() => {
    const scoped = board.activeProjectId === "" ? timeline : timeline.filter((event) => event.projectId === board.activeProjectId);
    return [...scoped].sort((left, right) => right.at - left.at);
  }, [timeline, board.activeProjectId]);
  const openTasks = (0, import_react18.useMemo)(
    () => board.tasks.filter((task) => !task.done).sort((left, right) => (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)),
    [board.tasks]
  );
  const todayTasks = openTasks.slice(0, 6);
  const doneCount = board.tasks.filter((task) => task.done).length;
  const doneRate = board.tasks.length === 0 ? 0 : doneCount / board.tasks.length;
  const knowledge = graphStats(graph);
  const review = reviewStats(reviews);
  const projectName = (id) => board.projects.find((project) => project.id === id)?.name ?? "未归属";
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-dashboard", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Card, { variant: "feature", className: "v4-stat-shelf", pad: "none", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-stat-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        Stat,
        {
          label: "今日任务",
          value: `${stats.tasksTotal}`,
          unit: "个",
          hint: (stats.overdueTasks ?? 0) > 0 ? `${stats.overdueTasks} 个已逾期` : "全部在计划内",
          onOpen: () => workspace.openDetail({ kind: "stat", id: "tasks", title: "今日任务" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        Stat,
        {
          label: "今日完成",
          value: `${stats.tasksDoneToday}`,
          unit: "个",
          hint: `累计完成 ${doneCount}`,
          ring: doneRate,
          onOpen: () => workspace.openDetail({ kind: "stat", id: "done", title: "完成情况" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        Stat,
        {
          label: "今日专注",
          value: formatMinutes(stats.focusMinutesToday),
          hint: weekMinutes > 0 ? `本周 ${formatMinutes(weekMinutes)}` : "还没有开始",
          onOpen: () => workspace.openDetail({ kind: "stat", id: "focus", title: "专注统计" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        Stat,
        {
          label: "连续学习",
          value: `${streak}`,
          unit: "天",
          hint: streak >= 3 ? "节奏保持住了" : "今天写一点就接上",
          title: "按有任务完成或专注记录的日期计算。",
          visual: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StreakDots, { active: activityDays, labels: days.map((day) => weekdayOfDayKey(day)) }),
          onOpen: () => workspace.openDetail({ kind: "stat", id: "streak", title: "连续学习" })
        }
      )
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-dash", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Card, { title: "今日任务", meta: `${openTasks.length} 个待完成`, children: board.tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        StateView,
        {
          kind: "empty",
          title: "还没有任务",
          hint: "先写下一个 25 分钟内能推进的小任务。",
          action: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "primary", onClick: createTask2, children: "新建任务" })
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ProgressBar, { value: doneRate, showValue: true }),
        todayTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-dash-done", children: "今天的任务全部完成，可以收工了。" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-today-list", children: todayTasks.map((task) => {
          const panelId = `dash-task-${task.id}`;
          const open = workspace.expandedId === panelId;
          return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "v4-today-row", "data-open": open ? "true" : "false", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "button",
              {
                type: "button",
                role: "checkbox",
                "aria-checked": false,
                "aria-label": `完成 ${task.title}`,
                className: "v4-task-check",
                onClick: () => actions.completeTask(task.id)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
              "button",
              {
                type: "button",
                className: "v4-today-main",
                "aria-expanded": open,
                "aria-controls": `v4-panel-${panelId}`,
                onClick: () => {
                  workspace.selectTask(task.id);
                  workspace.toggleExpanded(panelId);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: `v4-today-priority is-${task.priority ?? "normal"}`, children: PRIORITY_LABEL2[task.priority ?? "normal"] }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-today-title", children: task.title }),
                  task.dueAt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: isOverdue(task, now) ? "v4-today-due is-overdue" : "v4-today-due", children: formatDateInput(task.dueAt) }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-chevron", "data-open": open ? "true" : "false", "aria-hidden": "true", children: "▾" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "button",
              {
                type: "button",
                className: "v4-icon-btn",
                "aria-label": `打开 ${task.title} 的详情`,
                title: "详情",
                onClick: () => {
                  workspace.selectTask(task.id);
                  workspace.openDetail({ kind: "task", id: task.id, title: task.title });
                },
                children: "⋯"
              }
            ),
            open ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-today-detail", id: `v4-panel-${panelId}`, children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dl", { className: "v4-inline-facts", children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: "项目" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: projectName(task.projectId) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: "子任务" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: (task.subtasks ?? []).length === 0 ? "无" : `${(task.subtasks ?? []).filter((sub) => sub.done).length}/${(task.subtasks ?? []).length}` })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: "已专注" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: formatMinutes(taskFocusMinutes(task)) })
                ] })
              ] }),
              task.note === void 0 || task.note === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-inline-note", children: task.note }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-inline-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "primary", onClick: () => actions.completeTask(task.id), children: "标记完成" }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  Button,
                  {
                    size: "sm",
                    onClick: () => workspace.openModal({ kind: "edit-task", taskId: task.id, title: "编辑任务" }),
                    children: "编辑"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  Button,
                  {
                    size: "sm",
                    variant: "ghost",
                    onClick: () => workspace.openDetail({ kind: "task", id: task.id, title: task.title }),
                    children: "完整详情"
                  }
                )
              ] })
            ] }) : null
          ] }, task.id);
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "v4-link", onClick: () => onNavigate("tasks"), children: [
          "查看全部 ",
          board.tasks.length,
          " 个任务 →"
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-side", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(FocusPanel, {}),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          ExpandablePanel,
          {
            id: "projects",
            title: "项目进度",
            meta: `${allProjects.length} 个`,
            hint: "展开全部项目",
            summary: allProjects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StateView, { kind: "empty", title: "还没有项目投入", hint: "创建项目后，专注与任务会自动归到项目下。" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-project-list", children: allProjects.slice(0, 3).map((row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
              "button",
              {
                type: "button",
                className: "v4-project-button",
                onClick: () => workspace.openDetail({ kind: "project", id: row.projectId, title: row.name }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-project-row", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-project-name", children: row.name }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "v4-project-meta", children: [
                      formatMinutes(row.minutes),
                      " · ",
                      row.tasksDone,
                      "/",
                      projectTasks.get(row.projectId ?? "")?.total ?? 0
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ProgressBar, { value: rankedRate(row.minutes, allProjects[0]?.minutes ?? 0) })
                ]
              }
            ) }, row.projectId || row.name)) }),
            detail: allProjects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-muted", children: "没有可展开的项目。" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-mini-table", children: allProjects.map((row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
                "button",
                {
                  type: "button",
                  className: "v4-mini-row",
                  onClick: () => workspace.openDetail({ kind: "project", id: row.projectId, title: row.name }),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: row.name }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-mini-value", children: formatMinutes(row.minutes) }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "v4-mini-meta", children: [
                      row.tasksDone,
                      " 个完成"
                    ] })
                  ]
                }
              ) }, row.projectId || row.name)) }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-panel-hint", children: "新建 / 模板 / 归档 / 快照随 Projects 阶段迁移；统计已经是最新数据。" })
            ] })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
      Card,
      {
        title: "学习活动",
        meta: `近 365 天 · ${activity.summary.activeDays} 天有活动`,
        className: "v4-dash-heat",
        children: [
          activity.summary.activeDays === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-heat-empty", children: "还没有活跃记录 —— 完成一次专注或一个任务，当天就会亮起。" }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-dash-heat-body", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "v4-dash-heat-chart", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ActivityHeatmap, { calendar, today, range: 365, onOpenDay: openDay, legend: "bottom" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-dash-heat-side", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dl", { className: "v4-dash-heat-stats", children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: "最长连续" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
                    activity.summary.longestStreak,
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: "天" })
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: "累计专注" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: formatMinutes(activity.summary.focusMinutes) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: "完成任务" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
                    activity.summary.tasksDone,
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: "个" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-dash-heat-note", children: "悬停看某天，点击打开当天详情" })
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-dash-lower", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        ExpandablePanel,
        {
          id: "trend",
          title: "近 7 日专注",
          meta: weekMinutes > 0 ? `合计 ${formatMinutes(weekMinutes)}` : "全部项目",
          hint: "展开逐日数字",
          summary: weekMinutes === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            StateView,
            {
              kind: "empty",
              title: "这 7 天还没有专注记录",
              hint: "在上方「专注」卡里开始第一轮，完成后这里会出现趋势"
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Sparkline,
              {
                values: series,
                labels: days.map((day) => weekdayOfDayKey(day)),
                onSelect: (index) => {
                  const day = days[index];
                  if (day === void 0) return;
                  workspace.openDetail({
                    kind: "day",
                    id: day,
                    title: `${formatDateInput((/* @__PURE__ */ new Date(`${day}T00:00:00`)).getTime())} · ${weekdayOfDayKey(day)}`
                  });
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { className: "v4-chart-foot", children: [
              days.map((day) => weekdayOfDayKey(day)).join(" · "),
              peakMinutes > 0 ? ` ｜ 峰值 ${formatMinutes(peakMinutes)} · ${weekdayOfDayKey(days[peakIndex])}` : ""
            ] })
          ] }),
          detail: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-mini-table", children: days.map((day, index) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
            "button",
            {
              type: "button",
              className: "v4-mini-row",
              onClick: () => workspace.openDetail({
                kind: "day",
                id: day,
                title: `${formatDateInput((/* @__PURE__ */ new Date(`${day}T00:00:00`)).getTime())} · ${weekdayOfDayKey(day)}`
              }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: weekdayOfDayKey(day) }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-mini-value", children: formatMinutes(series[index] ?? 0) }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "v4-mini-meta", children: [
                  byDay.get(day)?.tasksDone ?? 0,
                  " 个完成"
                ] })
              ]
            }
          ) }, day)) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        ExpandablePanel,
        {
          id: "activity",
          title: "最近活动",
          meta: `${events.length} 条`,
          hint: "展开更早记录",
          summary: events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StateView, { kind: "empty", title: "还没有时间轴记录", hint: "完成任务、完成专注、解决阻碍都会出现在这里。" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-activity-list", children: events.slice(0, 4).map((event) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
            "button",
            {
              type: "button",
              className: "v4-activity-button",
              onClick: () => workspace.openDetail({ kind: "activity", id: event.id, title: "活动详情" }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-activity-time", children: formatRelative(event.at) }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-activity-kind", children: EVENT_META[event.type].label }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-activity-title", children: event.title })
              ]
            }
          ) }, event.id)) }),
          detail: events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-muted", children: "没有更多记录。" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-activity-list", children: events.slice(0, 20).map((event) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
            "button",
            {
              type: "button",
              className: "v4-activity-button",
              onClick: () => workspace.openDetail({ kind: "activity", id: event.id, title: "活动详情" }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-activity-time", children: formatRelative(event.at) }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-activity-kind", children: EVENT_META[event.type].label }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-activity-title", children: event.title })
              ]
            }
          ) }, event.id)) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        ExpandablePanel,
        {
          id: "knowledge",
          title: "知识与记忆",
          meta: `${knowledge.total} 个知识点`,
          hint: "展开节点",
          summary: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-knowledge-summary", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-big", children: knowledge.total }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-label", children: "知识点" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-big", children: knowledge.learned }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-label", children: "已掌握" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-big", children: knowledge.dueCount }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-label", children: "待复习" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-big", children: memory.length }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-mini-label", children: "记忆文档" })
            ] })
          ] }),
          detail: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            graph.nodes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-muted", children: "还没有知识节点。原有数据若存在，会在这里出现。" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "v4-mini-table", children: [...graph.nodes].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 6).map((node) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
              "button",
              {
                type: "button",
                className: "v4-mini-row",
                onClick: () => workspace.openDetail({ kind: "knowledge", id: "knowledge", title: "知识图谱" }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: node.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-mini-value", children: STATUS_LABEL2[node.status] }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "v4-mini-meta", children: [
                    "掌握 ",
                    node.mastery,
                    "/5"
                  ] })
                ]
              }
            ) }, node.id)) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-panel-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                Button,
                {
                  size: "sm",
                  onClick: () => workspace.openDetail({ kind: "knowledge", id: "knowledge", title: "知识图谱" }),
                  children: "知识点详情"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
                Button,
                {
                  size: "sm",
                  variant: "ghost",
                  onClick: () => workspace.openDetail({ kind: "knowledge", id: "memory", title: "项目记忆" }),
                  children: [
                    "记忆 ",
                    memory.length,
                    " 份"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { className: "v4-panel-hint", children: [
              "复习记录 ",
              review.total,
              " 次 · 本周 ",
              review.week,
              " 次。编辑与排期随 Knowledge 阶段迁移。"
            ] })
          ] })
        }
      )
    ] })
  ] });
}
function rankedRate(value, max) {
  return max <= 0 ? 0 : value / max;
}
function Stat({ label, value, unit, hint, ring, title, visual, onOpen }) {
  const body = /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "v4-stat-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { minWidth: 0 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-stat-label", children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { className: "v4-stat-value", children: [
          value,
          unit === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-stat-unit", children: unit })
        ] })
      ] }),
      ring === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ProgressRing, { value: ring, size: 40 })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "v4-stat-hint", children: hint }),
    visual
  ] });
  if (onOpen === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "v4-stat", title, children: body });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "v4-stat v4-stat-button", title, "aria-haspopup": "dialog", onClick: onOpen, children: [
    body,
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "v4-stat-more", "aria-hidden": "true", children: "详情 →" })
  ] });
}

// src/client/v4/Tasks.tsx
var import_react19 = require("react");
var import_jsx_runtime13 = require("react/jsx-runtime");
var PRIORITY_LABEL3 = {
  urgent: "紧急",
  important: "重要",
  normal: "普通"
};
var PRIORITY_WEIGHT = { urgent: 3, important: 2, normal: 1 };
function Tasks({ createSignal = 0 }) {
  const board = useBoardData();
  const actions = useBoardActions();
  const workspace = useWorkspace();
  const now = useNow();
  const [status, setStatus] = (0, import_react19.useState)("all");
  const [query, setQuery] = (0, import_react19.useState)("");
  const [sort, setSort] = (0, import_react19.useState)("priority");
  const [formOpen, setFormOpen] = (0, import_react19.useState)(false);
  const [editingId, setEditingId] = (0, import_react19.useState)(null);
  const [pendingDelete, setPendingDelete] = (0, import_react19.useState)(null);
  const projectName = (id) => board.projects.find((project) => project.id === id)?.name ?? "未归属";
  const visible = (0, import_react19.useMemo)(() => {
    const keyword = query.trim().toLowerCase();
    const list = board.allTasks.filter((task) => {
      if (board.activeProjectId !== "" && task.projectId !== board.activeProjectId) return false;
      if (status === "active" && task.done) return false;
      if (status === "done" && !task.done) return false;
      if (status === "overdue" && !isOverdue(task, now)) return false;
      if (keyword !== "") {
        const text = `${task.title} ${task.note ?? ""}`.toLowerCase();
        if (!text.includes(keyword)) return false;
      }
      return true;
    });
    return list.sort((left, right) => {
      if (sort === "due") {
        const a = left.dueAt ?? Number.POSITIVE_INFINITY;
        const b = right.dueAt ?? Number.POSITIVE_INFINITY;
        if (a !== b) return a - b;
      }
      if (sort === "priority") {
        const diff = (PRIORITY_WEIGHT[right.priority ?? "normal"] ?? 1) - (PRIORITY_WEIGHT[left.priority ?? "normal"] ?? 1);
        if (diff !== 0) return diff;
        const due = (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY);
        if (due !== 0) return due;
      }
      return right.createdAt - left.createdAt;
    });
  }, [board.allTasks, board.activeProjectId, status, query, sort, now]);
  const openCreate = () => {
    setEditingId(null);
    workspace.collapseAll();
    setFormOpen(true);
  };
  (0, import_react19.useEffect)(() => {
    if (createSignal > 0) openCreate();
  }, [createSignal]);
  const closeComposer = () => {
    setFormOpen(false);
    setEditingId(null);
  };
  const openEdit = (task) => {
    setEditingId(task.id);
    setFormOpen(true);
    workspace.selectTask(task.id);
  };
  const editing = editingId === null ? void 0 : board.allTasks.find((task) => task.id === editingId);
  const total = board.allTasks.length;
  const done = board.allTasks.filter((task) => task.done).length;
  const overdue = board.allTasks.filter((task) => isOverdue(task, now)).length;
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-tasks", children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h2", { className: "v4-task-page-title", children: "任务" }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "v4-task-counts", children: [
          total,
          " 个任务 · ",
          done,
          " 已完成 · ",
          overdue,
          " 逾期"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-tools", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "input",
          {
            className: "v4-field v4-task-search",
            value: query,
            onChange: (event) => setQuery(event.target.value),
            placeholder: "搜索标题或备注",
            "aria-label": "搜索任务"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("select", { className: "v4-field", value: sort, onChange: (event) => setSort(event.target.value), "aria-label": "排序", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "priority", children: "按优先级" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "due", children: "按截止日期" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "created", children: "按创建时间" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { variant: "primary", size: "sm", onClick: openCreate, children: "新建任务" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "v4-task-segments", role: "group", "aria-label": "状态筛选", children: [
      ["all", "全部"],
      ["active", "未完成"],
      ["done", "已完成"],
      ["overdue", "逾期"]
    ].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      "button",
      {
        type: "button",
        className: status === key ? "v4-segment is-active" : "v4-segment",
        "aria-pressed": status === key,
        onClick: () => setStatus(key),
        children: label
      },
      key
    )) }),
    formOpen ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(Card, { variant: "feature", className: "v4-composer-card", pad: "none", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-composer-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h3", { className: "v4-composer-title", children: editingId === null ? "新建任务" : "编辑任务" }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "v4-close", "aria-label": "取消", onClick: closeComposer, children: "✕" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        TaskComposer,
        {
          mode: editingId === null ? "create" : "edit",
          ...editing === void 0 ? {} : { task: editing },
          defaultProjectId: board.activeProjectId,
          onDone: closeComposer,
          onCancel: closeComposer
        }
      )
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Card, { className: "v4-task-panel", children: visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      StateView,
      {
        kind: "empty",
        title: total === 0 ? "还没有任务" : "没有匹配的任务",
        hint: total === 0 ? "先写下一个 25 分钟内能推进的小任务。" : "换一个关键词或筛选条件试试。",
        action: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { size: "sm", onClick: openCreate, children: "新建任务" })
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("ul", { className: "v4-task-list", children: visible.map((task) => {
      const panelId = `task-${task.id}`;
      const open = workspace.expandedId === panelId;
      const subtasks = task.subtasks ?? [];
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("li", { className: "v4-task-row", "data-open": open ? "true" : "false", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "button",
          {
            type: "button",
            role: "checkbox",
            "aria-checked": task.done,
            "aria-label": task.done ? `重开 ${task.title}` : `完成 ${task.title}`,
            className: task.done ? "v4-task-check is-done" : "v4-task-check",
            onClick: () => task.done ? actions.reopenTask(task.id) : actions.completeTask(task.id),
            children: task.done ? "✓" : ""
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
            "button",
            {
              type: "button",
              className: "v4-task-open",
              "aria-expanded": open,
              "aria-controls": `v4-panel-${panelId}`,
              onClick: () => {
                workspace.selectTask(task.id);
                workspace.toggleExpanded(panelId);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: task.done ? "v4-task-title is-done" : "v4-task-title", children: task.title }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "v4-task-meta", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: `v4-priority is-${task.priority ?? "normal"}`, children: PRIORITY_LABEL3[task.priority ?? "normal"] }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: projectName(task.projectId) }),
                  task.dueAt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: isOverdue(task, now) ? "v4-task-overdue" : void 0, children: formatDateInput(task.dueAt) }),
                  subtasks.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { children: [
                    "子任务 ",
                    subtasks.filter((sub) => sub.done).length,
                    "/",
                    subtasks.length
                  ] }) : null
                ] })
              ]
            }
          ),
          open ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-inline", id: `v4-panel-${panelId}`, children: [
            task.note === void 0 || task.note === "" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "v4-inline-note is-muted", children: "没有备注。" }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "v4-inline-note", children: task.note }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("dl", { className: "v4-inline-facts", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dt", { children: "已专注" }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dd", { children: formatMinutes(taskFocusMinutes(task)) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dt", { children: "创建" }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dd", { children: formatRelative(task.createdAt) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dt", { children: "子任务" }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dd", { children: subtasks.length === 0 ? "无" : `${subtasks.filter((sub) => sub.done).length}/${subtasks.length}` })
              ] }),
              task.completedAt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dt", { children: "完成" }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dd", { children: formatRelative(task.completedAt) })
              ] })
            ] }),
            subtasks.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("ul", { className: "v4-detail-sublist", children: subtasks.map((sub) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("li", { "data-done": sub.done ? "true" : "false", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { "aria-hidden": "true", children: sub.done ? "✓" : "○" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: sub.title })
            ] }, sub.id)) }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-inline-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                Button,
                {
                  size: "sm",
                  variant: "primary",
                  onClick: () => task.done ? actions.reopenTask(task.id) : actions.completeTask(task.id),
                  children: task.done ? "重新打开" : "标记完成"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { size: "sm", onClick: () => openEdit(task), children: "编辑" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                Button,
                {
                  size: "sm",
                  variant: "ghost",
                  onClick: () => workspace.openDetail({ kind: "task", id: task.id, title: task.title }),
                  children: "完整详情"
                }
              )
            ] }),
            pendingDelete === task.id ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-confirm", role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: "删除后不可恢复，确认？" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                Button,
                {
                  size: "sm",
                  variant: "danger",
                  onClick: () => {
                    actions.removeTask(task.id);
                    setPendingDelete(null);
                  },
                  children: "删除"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setPendingDelete(null), children: "取消" })
            ] }) : null
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "v4-task-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => openEdit(task), children: "编辑" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            Button,
            {
              size: "sm",
              variant: "danger",
              onClick: () => {
                workspace.selectTask(task.id);
                workspace.toggleExpanded(panelId);
                setPendingDelete(task.id);
              },
              children: "删除"
            }
          )
        ] })
      ] }, task.id);
    }) }) })
  ] });
}

// src/client/v4/Settings.tsx
var import_react24 = require("react");

// src/client/hooks/useCaptureState.ts
var import_react20 = require("react");
function useCaptureState() {
  return (0, import_react20.useSyncExternalStore)(subscribeCapture, getCaptureState, getCaptureState);
}

// src/client/hooks/useBackup.ts
var import_react21 = require("react");

// src/client/lib/backup.ts
var MAX_IMPORT_CHARS = 8e6;
function backupFileName(scope = "all", now = /* @__PURE__ */ new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `sorchron-board-backup-${scope}-${stamp}.json`;
}
function scopeCutoff(scope, now = Date.now()) {
  if (scope === "week") return now - 7 * 24 * 60 * 60 * 1e3;
  if (scope === "month") return startOfMonth(now);
  return 0;
}
function filterByScope(input, scope, now = Date.now()) {
  if (scope === "all") {
    const all = { tasks: input.tasks, logs: input.logs, friction: input.friction };
    if (input.memory !== void 0) all.memory = input.memory;
    if (input.knowledge !== void 0) all.knowledge = input.knowledge;
    if (input.reviews !== void 0) all.reviews = input.reviews;
    if (input.timeline !== void 0) all.timeline = input.timeline;
    if (input.history !== void 0) all.history = input.history;
    if (input.daily !== void 0) all.daily = input.daily;
    return all;
  }
  const cutoff = scopeCutoff(scope, now);
  const cutoffDay = dayKey(cutoff);
  const filtered = {
    tasks: input.tasks.filter((task) => {
      if (task.createdAt >= cutoff) return true;
      if (task.completedAt !== void 0 && task.completedAt >= cutoff) return true;
      return task.updatedAt >= cutoff;
    }),
    logs: input.logs.filter((log) => log.at >= cutoff),
    friction: input.friction.filter((record) => record.at >= cutoff || record.updatedAt >= cutoff)
  };
  if (input.memory !== void 0) filtered.memory = input.memory;
  if (input.knowledge !== void 0) filtered.knowledge = input.knowledge;
  if (input.reviews !== void 0) filtered.reviews = input.reviews.filter((item) => item.at >= cutoff);
  if (input.timeline !== void 0) filtered.timeline = input.timeline.filter((item) => item.at >= cutoff);
  if (input.history !== void 0) filtered.history = input.history.filter((item) => item.at >= cutoff);
  if (input.daily !== void 0) filtered.daily = input.daily.filter((item) => item.day >= cutoffDay);
  return filtered;
}
function buildBackup(input) {
  const payload = {
    kind: "sorchron-study-board-backup",
    version: 4,
    exportedAt: input.now ?? Date.now(),
    scope: input.scope ?? "all",
    tasks: input.tasks,
    logs: input.logs,
    projects: input.projects,
    settings: input.settings,
    friction: input.friction,
    meta: input.meta
  };
  payload.memory = input.memory ?? [];
  payload.knowledge = input.knowledge ?? { nodes: [], edges: [] };
  payload.reviews = input.reviews ?? [];
  payload.timeline = input.timeline ?? [];
  payload.history = input.history ?? [];
  payload.daily = input.daily ?? [];
  return payload;
}
function serializeBackup(payload) {
  return JSON.stringify(payload, null, 2);
}
function asRecord3(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function readScope(value) {
  if (value === "all" || value === "week" || value === "month") return value;
  return void 0;
}
function parseBackup(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "文件不是合法的 JSON" };
  }
  if (raw.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: `备份文件过大（${Math.round(raw.length / 1024)} KB，上限 ${MAX_IMPORT_CHARS / 1024} KB）` };
  }
  const record = asRecord3(parsed);
  if (record === void 0) return { ok: false, error: "文件内容不是一个对象" };
  if (record.kind !== "sorchron-study-board-backup") {
    return { ok: false, error: "不是溯时学习工作台的备份文件（kind 不匹配）" };
  }
  if (!Array.isArray(record.tasks) || !Array.isArray(record.logs)) {
    return { ok: false, error: "备份缺少 tasks / logs 数组" };
  }
  if (record.tasks.length > 500) {
    return { ok: false, error: `任务数量超出上限（${record.tasks.length} > 500），请拆分备份` };
  }
  if (record.logs.length > 400) {
    return { ok: false, error: `日志数量超出上限（${record.logs.length} > 400），请先清理或拆分备份` };
  }
  if (Array.isArray(record.friction) && record.friction.length > 200) {
    return { ok: false, error: `阻碍记录超出上限（${record.friction.length} > 200）` };
  }
  if (Array.isArray(record.projects) && record.projects.length > 96) {
    return { ok: false, error: `项目数量超出上限（${record.projects.length} > 96）` };
  }
  const v4Limits = [
    { key: "memory", label: "项目记忆", limit: 60 },
    { key: "reviews", label: "复习记录", limit: 2e3 },
    { key: "timeline", label: "时间轴事件", limit: 1200 },
    { key: "history", label: "历史快照", limit: 240 },
    { key: "daily", label: "日聚合", limit: 800 }
  ];
  for (const entry of v4Limits) {
    const value = record[entry.key];
    if (Array.isArray(value) && value.length > entry.limit) {
      return { ok: false, error: `${entry.label}超出上限（${value.length} > ${entry.limit}），请先清理或拆分备份` };
    }
  }
  const knowledgeRecord = asRecord3(record.knowledge);
  if (knowledgeRecord !== void 0) {
    if (Array.isArray(knowledgeRecord.nodes) && knowledgeRecord.nodes.length > 500) {
      return { ok: false, error: `知识节点超出上限（${knowledgeRecord.nodes.length} > 500）` };
    }
    if (Array.isArray(knowledgeRecord.edges) && knowledgeRecord.edges.length > 900) {
      return { ok: false, error: `知识关系超出上限（${knowledgeRecord.edges.length} > 900）` };
    }
  }
  const rawTaskCount = record.tasks.length;
  const rawLogCount = record.logs.length;
  const rawProjects = Array.isArray(record.projects) ? record.projects : [];
  const rawFriction = Array.isArray(record.friction) ? record.friction : [];
  const rawMemory = Array.isArray(record.memory) ? record.memory : [];
  const rawReviews = Array.isArray(record.reviews) ? record.reviews : [];
  const rawTimeline = Array.isArray(record.timeline) ? record.timeline : [];
  const rawHistory = Array.isArray(record.history) ? record.history : [];
  const rawDaily = Array.isArray(record.daily) ? record.daily : [];
  const tasks = record.tasks.map((item) => coerceTask(item)).filter((task) => task !== void 0);
  const logs = record.logs.map((item) => coerceLog(item)).filter((log) => log !== void 0);
  const projects = rawProjects.map((item) => coerceProject(item)).filter((item) => item !== void 0);
  const friction = rawFriction.map((item) => coerceFriction(item)).filter((item) => item !== void 0);
  const memory = rawMemory.map((item) => coerceMemory(item)).filter((item) => item !== void 0).slice(0, 60);
  const knowledge = coerceKnowledge(record.knowledge);
  const reviews = rawReviews.map((item) => coerceReview(item)).filter((item) => item !== void 0).slice(0, 2e3);
  const timeline = rawTimeline.map((item) => coerceTimelineEvent(item)).filter((item) => item !== void 0).slice(0, 1200);
  const history = rawHistory.map((item) => coerceHistory(item)).filter((item) => item !== void 0).slice(0, 240);
  const daily = rawDaily.map((item) => coerceDaily(item)).filter((item) => item !== void 0).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0).slice(-800);
  const settings = coerceSettings(record.settings);
  const meta = asRecord3(record.meta) === void 0 ? createDefaultMeta() : coerceMeta(record.meta);
  const scope = readScope(record.scope);
  warn("backup", `import parsed: ${tasks.length} tasks / ${logs.length} logs / ${friction.length} friction`);
  const sourceVersion = typeof record.version === "number" && Number.isFinite(record.version) ? record.version : 0;
  return {
    ok: true,
    report: {
      sourceVersion,
      dropped: {
        tasks: rawTaskCount - tasks.length,
        logs: rawLogCount - logs.length,
        projects: rawProjects.length - projects.length,
        friction: rawFriction.length - friction.length,
        memory: rawMemory.length - memory.length,
        reviews: rawReviews.length - reviews.length,
        timeline: rawTimeline.length - timeline.length,
        history: rawHistory.length - history.length,
        daily: rawDaily.length - daily.length
      }
    },
    payload: {
      kind: "sorchron-study-board-backup",
      version: 4,
      exportedAt: num(record.exportedAt, Date.now()),
      ...scope === void 0 ? {} : { scope },
      tasks,
      logs,
      projects,
      settings,
      friction,
      meta,
      /* V4：即使为空也显式带出，导入端据此判断「这份文件有没有新实体」 */
      memory,
      knowledge,
      reviews,
      timeline,
      history,
      daily
    }
  };
}
function countConflicts(local, incoming) {
  const map = new Map(local.map((item) => [item.id, item]));
  let conflicts = 0;
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (existing === void 0) continue;
    if (JSON.stringify(existing) !== JSON.stringify(item)) conflicts += 1;
  }
  return conflicts;
}
function previewImport(local, incoming, mode = "merge") {
  return {
    mode,
    incoming: {
      tasks: incoming.tasks.length,
      logs: incoming.logs.length,
      projects: incoming.projects.length,
      friction: incoming.friction.length
    },
    local: {
      tasks: local.tasks.length,
      logs: local.logs.length,
      projects: local.projects.length,
      friction: local.friction.length
    },
    conflicts: {
      tasks: countConflicts(local.tasks, incoming.tasks),
      logs: countConflicts(local.logs, incoming.logs),
      projects: countConflicts(local.projects, incoming.projects),
      friction: countConflicts(local.friction, incoming.friction)
    },
    exportedAt: incoming.exportedAt,
    ...incoming.scope === void 0 ? {} : { scope: incoming.scope },
    extra: {
      memory: incoming.memory?.length ?? 0,
      knowledge: incoming.knowledge?.nodes.length ?? 0,
      reviews: incoming.reviews?.length ?? 0,
      timeline: incoming.timeline?.length ?? 0,
      history: incoming.history?.length ?? 0,
      daily: incoming.daily?.length ?? 0
    }
  };
}
function mergeById(local, incoming) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return [...incoming, ...local.filter((item) => !incomingIds.has(item.id))];
}
function mergeMemory(local, incoming) {
  const map = new Map(local.map((item) => [item.projectId, item]));
  for (const item of incoming) {
    const existing = map.get(item.projectId);
    if (existing === void 0 || item.version >= existing.version) map.set(item.projectId, item);
  }
  return [...map.values()];
}
function mergeGraph(local, incoming) {
  const nodes = new Map(local.nodes.map((node) => [node.id, node]));
  for (const node of incoming.nodes) nodes.set(node.id, node);
  const edges = /* @__PURE__ */ new Map();
  const keyOf = (edge) => edge.kind === "related" ? `r|${[edge.fromId, edge.toId].sort().join("|")}` : `p|${edge.fromId}|${edge.toId}`;
  for (const edge of [...local.edges, ...incoming.edges]) {
    if (!nodes.has(edge.fromId) || !nodes.has(edge.toId)) continue;
    edges.set(keyOf(edge), edge);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
function mergeDaily(local, incoming) {
  const map = new Map(local.map((item) => [item.day, item]));
  for (const item of incoming) map.set(item.day, item);
  return [...map.values()].sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
}
function applyImport(local, incoming, mode, now = Date.now()) {
  const settings = coerceSettings(
    mode === "overwrite" ? incoming.settings : { ...local.settings, ...incoming.settings },
    now
  );
  const meta = mode === "overwrite" ? incoming.meta : {
    ...local.meta,
    ...incoming.meta,
    sessionTaskMap: { ...local.meta.sessionTaskMap, ...incoming.meta.sessionTaskMap }
  };
  if (mode === "overwrite") {
    return {
      tasks: incoming.tasks,
      logs: [...incoming.logs].sort((a, b) => b.at - a.at),
      projects: incoming.projects,
      friction: incoming.friction,
      memory: incoming.memory ?? [],
      knowledge: incoming.knowledge ?? { nodes: [], edges: [] },
      reviews: incoming.reviews ?? [],
      timeline: [...incoming.timeline ?? []].sort((a, b) => b.at - a.at).slice(0, 1200),
      // 覆盖导入也必须服从「每项目 12 个」的上限
      history: pruneSnapshots(incoming.history ?? []),
      daily: incoming.daily ?? [],
      settings,
      meta
    };
  }
  return {
    tasks: mergeById(local.tasks, incoming.tasks),
    logs: mergeById(local.logs, incoming.logs).sort((a, b) => b.at - a.at),
    projects: mergeById(local.projects, incoming.projects),
    friction: mergeById(local.friction, incoming.friction),
    memory: mergeMemory(local.memory ?? [], incoming.memory ?? []),
    knowledge: mergeGraph(local.knowledge ?? { nodes: [], edges: [] }, incoming.knowledge ?? { nodes: [], edges: [] }),
    reviews: mergeById(local.reviews ?? [], incoming.reviews ?? []),
    timeline: mergeById(local.timeline ?? [], incoming.timeline ?? []).sort((a, b) => b.at - a.at).slice(0, 1200),
    history: pruneSnapshots(mergeById(local.history ?? [], incoming.history ?? [])),
    daily: mergeDaily(local.daily ?? [], incoming.daily ?? []),
    settings,
    meta
  };
}
function downloadText(fileName, text, mime = "application/json") {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    return true;
  } catch (error) {
    warn("backup", "download failed", error);
    return false;
  }
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsText(file, "utf-8");
  });
}

// src/client/lib/repo/local.ts
var memoryStore = /* @__PURE__ */ new Map();
var cachedMode = null;
function detectMode() {
  if (typeof window === "undefined") return "memory";
  try {
    const storage = window.localStorage;
    if (storage === void 0 || storage === null) return "blocked";
    void storage.length;
    void storage.getItem("__sorchron_probe__");
    return "persistent";
  } catch {
    return "blocked";
  }
}
function storageMode() {
  if (cachedMode === null) cachedMode = detectMode();
  return cachedMode;
}
var blockedNotified = false;
function notifyBlocked() {
  if (blockedNotified) return;
  blockedNotified = true;
  pushNotice("浏览器禁用了本地存储，本次修改只在当前页面有效，刷新会丢失", "error");
}
function readRaw(key) {
  const mode = storageMode();
  if (mode !== "persistent") {
    if (mode === "blocked") notifyBlocked();
    return memoryStore.get(key) ?? null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    warn("repo", `read failed: ${key}`, error);
    return null;
  }
}
function writeRaw(key, raw) {
  const mode = storageMode();
  if (mode === "blocked") {
    memoryStore.set(key, raw);
    broadcast2(key, raw);
    notifyBlocked();
    return false;
  }
  if (mode === "memory") {
    memoryStore.set(key, raw);
    broadcast2(key, raw);
    return true;
  }
  try {
    if (window.localStorage.getItem(key) === raw) return true;
    window.localStorage.setItem(key, raw);
    broadcast2(key, raw);
    return true;
  } catch (error) {
    const name2 = typeof error === "object" && error !== null ? error.name : "";
    if (name2 === "SecurityError" || name2 === "NotAllowedError") cachedMode = "blocked";
    warn("repo", `write failed: ${key}`, error);
    pushNotice(
      name2 === "QuotaExceededError" ? "本地存储已满，本次修改没有保存；可以先导出备份再清理旧日志" : "本地存储写入失败，本次修改没有保存",
      "error"
    );
    return false;
  }
}
function broadcast2(key, raw) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key, raw } }));
  } catch {
  }
}
function readTyped(key, fallback) {
  const raw = readRaw(key);
  if (raw === null || raw === "") return fallback;
  try {
    const parsed = JSON.parse(raw);
    const { data } = unwrapEnvelope(parsed);
    const value = coercePayload(key, data);
    return value === void 0 || value === null ? fallback : value;
  } catch (error) {
    warn("repo", `corrupt payload: ${key}`, error);
    return fallback;
  }
}
function writeTyped(key, value) {
  try {
    return writeRaw(key, JSON.stringify(wrapEnvelope(value)));
  } catch (error) {
    warn("repo", `serialize failed: ${key}`, error);
    return false;
  }
}
function createLocalRepo() {
  return {
    readMemory: () => readTyped(STORAGE_KEYS.memory, []),
    writeMemory: (list) => writeTyped(STORAGE_KEYS.memory, list),
    readGraph: () => readTyped(STORAGE_KEYS.knowledge, { nodes: [], edges: [] }),
    writeGraph: (graph) => writeTyped(STORAGE_KEYS.knowledge, graph),
    readReviews: () => readTyped(STORAGE_KEYS.reviews, []),
    writeReviews: (list) => writeTyped(STORAGE_KEYS.reviews, list),
    readTimeline: () => readTyped(STORAGE_KEYS.timeline, []),
    writeTimeline: (list) => writeTyped(STORAGE_KEYS.timeline, list),
    readHistory: () => readTyped(STORAGE_KEYS.history, []),
    writeHistory: (list) => writeTyped(STORAGE_KEYS.history, list),
    readDaily: () => readTyped(STORAGE_KEYS.daily, []),
    writeDaily: (list) => writeTyped(STORAGE_KEYS.daily, list),
    readAiRuns: () => readTyped(STORAGE_KEYS.aiRuns, []),
    writeAiRuns: (list) => writeTyped(STORAGE_KEYS.aiRuns, list),
    rawRead: (key, fallback) => readTyped(key, fallback),
    rawWrite: (key, value) => writeTyped(key, value)
  };
}

// src/client/lib/repo/index.ts
var repo = null;
function getRepo() {
  if (repo === null) repo = createLocalRepo();
  return repo;
}

// src/client/hooks/useBackup.ts
function byteLength(text) {
  try {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  } catch {
  }
  return text.length;
}
function useBackup() {
  const board = useBoardData();
  const { settings } = useBoardSettings();
  const prepareExport = (0, import_react21.useCallback)(
    (scope = "all") => {
      try {
        const repo2 = getRepo();
        const filtered = filterByScope(
          {
            tasks: board.allTasks,
            logs: board.allLogs,
            friction: board.allFriction,
            projects: board.projects,
            memory: repo2.readMemory(),
            knowledge: repo2.readGraph(),
            reviews: repo2.readReviews(),
            timeline: repo2.readTimeline(),
            history: repo2.readHistory(),
            daily: repo2.readDaily()
          },
          scope
        );
        const payload = buildBackup({
          tasks: filtered.tasks,
          logs: filtered.logs,
          // 全量导出保留归档项目：归档不等于删除，恢复时也要能还原。
          projects: scope === "all" ? board.projects : board.projects.filter((item) => !item.archived),
          settings,
          friction: filtered.friction,
          meta: board.meta,
          scope,
          memory: filtered.memory ?? [],
          knowledge: filtered.knowledge ?? { nodes: [], edges: [] },
          reviews: filtered.reviews ?? [],
          timeline: filtered.timeline ?? [],
          history: filtered.history ?? [],
          daily: filtered.daily ?? []
        });
        const text = serializeBackup(payload);
        return {
          ok: true,
          payload,
          text,
          fileName: backupFileName(scope),
          bytes: byteLength(text),
          scope,
          generatedAt: payload.exportedAt,
          counts: {
            tasks: filtered.tasks.length,
            logs: filtered.logs.length,
            projects: payload.projects.length,
            friction: filtered.friction.length,
            memory: filtered.memory?.length ?? 0,
            knowledge: filtered.knowledge?.nodes.length ?? 0,
            reviews: filtered.reviews?.length ?? 0,
            timeline: filtered.timeline?.length ?? 0,
            history: filtered.history?.length ?? 0,
            daily: filtered.daily?.length ?? 0
          }
        };
      } catch (error) {
        warn("backup", "prepare export failed", error);
        return { ok: false, message: "导出准备失败，详见控制台" };
      }
    },
    [board.allTasks, board.allLogs, board.allFriction, board.projects, board.meta, settings]
  );
  const exportAll = (0, import_react21.useCallback)(
    (scope = "all") => {
      const prepared = prepareExport(scope);
      if (!prepared.ok) return { ok: false, message: prepared.message };
      const ok = downloadText(prepared.fileName, prepared.text);
      info("backup", `export ${scope}${ok ? "" : " failed"}`);
      return {
        ok,
        message: ok ? `已导出 ${prepared.counts.tasks} 个任务、${prepared.counts.logs} 条日志（${Math.round(prepared.bytes / 1024)} KB）` : "导出失败：浏览器拒绝了下载"
      };
    },
    [prepareExport]
  );
  const clearAll = (0, import_react21.useCallback)(() => {
    const entries2 = [
      { key: STORAGE_KEYS.tasks, value: [] },
      { key: STORAGE_KEYS.logs, value: [] },
      { key: STORAGE_KEYS.projects, value: [] },
      { key: STORAGE_KEYS.friction, value: [] },
      { key: STORAGE_KEYS.meta, value: createDefaultMeta() },
      { key: STORAGE_KEYS.settings, value: createDefaultSettings() },
      { key: STORAGE_KEYS.timer, value: createDefaultTimerState() },
      { key: STORAGE_KEYS.memory, value: [] },
      { key: STORAGE_KEYS.knowledge, value: { nodes: [], edges: [] } },
      { key: STORAGE_KEYS.reviews, value: [] },
      { key: STORAGE_KEYS.timeline, value: [] },
      { key: STORAGE_KEYS.history, value: [] },
      { key: STORAGE_KEYS.daily, value: [] },
      { key: STORAGE_KEYS.aiRuns, value: [] }
    ];
    const store = createBrowserStore();
    if (store === void 0) {
      const ok = entries2.every((entry) => writeStore(entry.key, entry.value));
      info("backup", `clear all${ok ? "" : " (partial)"}`);
      return {
        ok,
        message: ok ? "已清空本机所有看板数据" : "部分数据写入失败（存储可能已满），请重试"
      };
    }
    const result = writeTransaction(store, entries2);
    if (!result.ok) {
      const why = result.error === "serialize" ? "数据无法序列化" : `写入「${result.failedKey ?? "未知键"}」失败`;
      warn("backup", `clear all failed: ${why} (restored=${String(result.restored)})`);
      return {
        ok: false,
        message: result.restored ? `清空已中止（${why}），原有数据已回滚` : `清空中止且回滚失败（${why}），数据可能不一致：请立刻导出备份`
      };
    }
    info("backup", `clear all: ${entries2.length} keys`);
    return { ok: true, message: `已清空本机所有看板数据（${entries2.length} 个键）` };
  }, []);
  return { prepareExport, exportAll, clearAll };
}

// src/client/hooks/useStorageQuota.ts
var import_react22 = require("react");
var LABELS = {
  [STORAGE_KEYS.tasks]: "任务",
  [STORAGE_KEYS.logs]: "会话日志",
  [STORAGE_KEYS.projects]: "项目",
  [STORAGE_KEYS.settings]: "设置",
  [STORAGE_KEYS.timer]: "计时",
  [STORAGE_KEYS.friction]: "阻碍记录",
  [STORAGE_KEYS.meta]: "运行状态"
};
function measureStorage() {
  const breakdown = [];
  let total = 0;
  for (const key of Object.values(STORAGE_KEYS)) {
    let bytes = 0;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) bytes = raw.length * 2;
    } catch {
      bytes = 0;
    }
    total += bytes;
    breakdown.push({ key, label: LABELS[key] ?? key, bytes, share: 0 });
  }
  return {
    bytes: total,
    breakdown: breakdown.map((item) => ({ ...item, share: total === 0 ? 0 : item.bytes / total })).sort((a, b) => b.bytes - a.bytes)
  };
}
function formatBytes(bytes) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function levelOf2(ratio) {
  if (ratio >= BOARD_CONFIG.storage.dangerRatio) return "danger";
  if (ratio >= BOARD_CONFIG.storage.warnRatio) return "warn";
  return "ok";
}
function detailOf(level, bytes, ratio) {
  const size = formatBytes(bytes);
  const percent = Math.round(ratio * 100);
  if (level === "danger") return `已用 ${size}（约 ${percent}%），再写就可能失败：先导出备份再清理旧日志`;
  if (level === "warn") return `已用 ${size}（约 ${percent}%），建议清理三个月前的日志`;
  return `已用 ${size}（约 ${percent}%）`;
}
function useStorageQuota(refreshKey) {
  const [state, setState] = (0, import_react22.useState)(() => {
    try {
      return measureStorage();
    } catch {
      return { bytes: 0, breakdown: [] };
    }
  });
  const refresh = (0, import_react22.useCallback)(() => {
    try {
      setState(measureStorage());
    } catch {
    }
  }, []);
  (0, import_react22.useEffect)(() => {
    refresh();
  }, [refresh, refreshKey]);
  (0, import_react22.useEffect)(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(refresh, 15e3);
    const onStorage = (event) => {
      if (event.key === null || event.key.startsWith("dsh-otaku-study-board")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);
  const ratio = Math.min(1, state.bytes / BOARD_CONFIG.storage.assumeQuotaBytes);
  const level = levelOf2(ratio);
  return {
    bytes: state.bytes,
    ratio,
    level,
    detail: detailOf(level, state.bytes, ratio),
    breakdown: state.breakdown,
    refresh
  };
}

// src/client/lib/storage.ts
var PROBE_KEY = "dsh-otaku-study-board:__write_probe__";
function storageStatus() {
  if (typeof window === "undefined") {
    return {
      mode: "memory",
      label: "内存模式",
      structurallyWritable: false,
      detail: "当前环境没有 localStorage（测试 / SSR），数据只存在于内存。"
    };
  }
  try {
    const storage = window.localStorage;
    if (storage === void 0 || storage === null) {
      return {
        mode: "blocked",
        label: "被禁用",
        structurallyWritable: false,
        detail: "浏览器没有提供 localStorage，数据无法持久化。"
      };
    }
    void storage.length;
    void storage.getItem(PROBE_KEY);
    return {
      mode: "persistent",
      label: "可持久化",
      structurallyWritable: true,
      detail: "数据保存在本机 localStorage；清理浏览器数据会一并删除。"
    };
  } catch {
    return {
      mode: "blocked",
      label: "被禁用",
      structurallyWritable: false,
      detail: "浏览器拒绝访问 localStorage（可能是隐私模式或站点设置）。"
    };
  }
}
function probeWritable() {
  if (typeof window === "undefined") return false;
  const key = `${PROBE_KEY}:${Date.now().toString(36)}`;
  try {
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
    }
    return false;
  }
}
async function readOriginEstimate() {
  try {
    if (typeof navigator === "undefined" || navigator.storage === void 0) return null;
    if (typeof navigator.storage.estimate !== "function") return null;
    const result = await navigator.storage.estimate();
    if (typeof result.usage !== "number" || typeof result.quota !== "number") return null;
    if (!Number.isFinite(result.usage) || !Number.isFinite(result.quota) || result.quota <= 0) return null;
    return { usage: result.usage, quota: result.quota };
  } catch {
    return null;
  }
}

// src/client/v4/useDataTransfer.ts
var import_react23 = require("react");
function countsOf(payload) {
  return {
    tasks: payload.tasks.length,
    logs: payload.logs.length,
    projects: payload.projects.length,
    friction: payload.friction.length,
    memory: payload.memory?.length ?? 0,
    knowledge: payload.knowledge?.nodes.length ?? 0,
    reviews: payload.reviews?.length ?? 0,
    timeline: payload.timeline?.length ?? 0,
    history: payload.history?.length ?? 0,
    daily: payload.daily?.length ?? 0
  };
}
function useDataTransfer() {
  const board = useBoardData();
  const { settings } = useBoardSettings();
  const [phase, setPhase] = (0, import_react23.useState)("idle");
  const [source, setSource] = (0, import_react23.useState)(null);
  const [preview, setPreview] = (0, import_react23.useState)(null);
  const [mode, setModeState] = (0, import_react23.useState)("merge");
  const [error, setError] = (0, import_react23.useState)("");
  const [result, setResult] = (0, import_react23.useState)(null);
  const parsedRef = (0, import_react23.useRef)(null);
  const localSnapshot = (0, import_react23.useMemo)(
    () => ({
      tasks: board.allTasks,
      logs: board.allLogs,
      projects: board.projects,
      friction: board.allFriction
    }),
    [board.allTasks, board.allLogs, board.projects, board.allFriction]
  );
  const pick = (0, import_react23.useCallback)(
    async (file) => {
      if (file === void 0) return;
      setPhase("reading");
      setError("");
      setResult(null);
      try {
        if (file.size > MAX_IMPORT_CHARS * 2) {
          const mb = (file.size / 1024 / 1024).toFixed(1);
          setPhase("error");
          setError(`文件过大（${mb} MB），上限约 ${MAX_IMPORT_CHARS / 1024 / 1024} MB 文本`);
          return;
        }
        const text = await readFileAsText(file);
        const parsed = parseBackup(text);
        if (!parsed.ok) {
          setPhase("error");
          setError(parsed.error);
          return;
        }
        const payload = parsed.payload;
        parsedRef.current = { payload, report: parsed.report };
        const counts = countsOf(payload);
        const droppedTotal = Object.values(parsed.report.dropped).reduce((sum, value) => sum + value, 0);
        setSource({
          fileName: file.name === "" ? "未命名备份.json" : file.name,
          sizeBytes: file.size,
          version: parsed.report.sourceVersion,
          exportedAt: payload.exportedAt,
          ...payload.scope === void 0 ? {} : { scope: payload.scope },
          counts,
          dropped: parsed.report.dropped,
          droppedTotal,
          draftCount: Object.keys(payload.meta.memoryDrafts ?? {}).length
        });
        setPreview(previewImport(localSnapshot, payload, mode));
        setPhase("preview");
      } catch (caught) {
        warn("backup", "read import file failed", caught);
        setPhase("error");
        setError("读取文件失败：文件可能已被移动，或浏览器拒绝访问");
      }
    },
    [localSnapshot, mode]
  );
  const setMode = (0, import_react23.useCallback)((next) => {
    setModeState(next);
    const parsed = parsedRef.current;
    if (parsed !== null) setPreview(previewImport(localSnapshot, parsed.payload, next));
  }, [localSnapshot]);
  const commit = (0, import_react23.useCallback)(async () => {
    const parsed = parsedRef.current;
    if (parsed === null) return;
    setPhase("importing");
    setError("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const repo2 = getRepo();
      const merged = applyImport(
        {
          ...localSnapshot,
          settings,
          meta: board.meta,
          memory: repo2.readMemory(),
          knowledge: repo2.readGraph(),
          reviews: repo2.readReviews(),
          timeline: repo2.readTimeline(),
          history: repo2.readHistory(),
          daily: repo2.readDaily()
        },
        parsed.payload,
        mode
      );
      let history = merged.history ?? [];
      const project = board.activeProject;
      if (project !== void 0) {
        const snapshot = buildImportSnapshot({
          project,
          tasks: merged.tasks,
          friction: merged.friction,
          ...merged.memory?.[0] === void 0 ? {} : { memory: merged.memory[0] }
        });
        history = pruneSnapshots([...history, snapshot]);
      }
      const entries2 = [
        { key: STORAGE_KEYS.tasks, value: merged.tasks },
        { key: STORAGE_KEYS.logs, value: merged.logs },
        { key: STORAGE_KEYS.projects, value: merged.projects },
        { key: STORAGE_KEYS.friction, value: merged.friction },
        { key: STORAGE_KEYS.meta, value: merged.meta },
        { key: STORAGE_KEYS.settings, value: merged.settings },
        { key: STORAGE_KEYS.memory, value: merged.memory ?? [] },
        { key: STORAGE_KEYS.knowledge, value: merged.knowledge ?? { nodes: [], edges: [] } },
        { key: STORAGE_KEYS.reviews, value: merged.reviews ?? [] },
        { key: STORAGE_KEYS.timeline, value: merged.timeline ?? [] },
        { key: STORAGE_KEYS.history, value: history },
        { key: STORAGE_KEYS.daily, value: merged.daily ?? [] }
      ];
      const store = createBrowserStore();
      if (store === void 0) {
        const failed = entries2.find((entry) => !writeStore(entry.key, entry.value));
        if (failed !== void 0) {
          setPhase("error");
          setError(`导入失败：写入「${failed.key}」未成功，数据可能只写入了一部分，请立刻导出备份`);
          return;
        }
      } else {
        const tx = writeTransaction(store, entries2);
        if (!tx.ok) {
          const why = tx.error === "serialize" ? "数据无法序列化" : `写入「${tx.failedKey ?? "未知键"}」失败`;
          setPhase("error");
          setError(
            tx.restored ? `导入已中止（${why}），原有数据已回滚，可以重试` : `导入中止且回滚失败（${why}）：数据可能不一致，请立刻导出备份`
          );
          return;
        }
      }
      const counts = {
        tasks: merged.tasks.length,
        logs: merged.logs.length,
        projects: merged.projects.length,
        friction: merged.friction.length,
        memory: merged.memory?.length ?? 0,
        knowledge: merged.knowledge?.nodes.length ?? 0,
        reviews: merged.reviews?.length ?? 0,
        timeline: merged.timeline?.length ?? 0,
        history: history.length,
        daily: merged.daily?.length ?? 0
      };
      setResult({
        ok: true,
        title: mode === "overwrite" ? "覆盖导入完成" : "合并导入完成",
        detail: `${counts.tasks} 个任务 / ${counts.logs} 条日志 / ${counts.projects} 个项目 / ${counts.memory} 份记忆 / ${counts.knowledge} 个知识点`,
        at: Date.now()
      });
      setPhase("done");
      setPreview(null);
      setSource(null);
      parsedRef.current = null;
    } catch (caught) {
      warn("backup", "import commit failed", caught);
      setPhase("error");
      setError("导入过程出现意外错误，未写入任何数据；详见控制台");
    }
  }, [board.activeProject, board.meta, localSnapshot, mode, settings]);
  return {
    phase,
    source,
    preview,
    mode,
    error,
    result,
    pick,
    setMode,
    commit,
    discard: () => {
      parsedRef.current = null;
      setSource(null);
      setPreview(null);
      setPhase("idle");
      setError("");
    },
    reset: () => {
      parsedRef.current = null;
      setSource(null);
      setPreview(null);
      setResult(null);
      setError("");
      setPhase("idle");
    }
  };
}

// src/client/v4/Settings.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
function Settings() {
  const board = useBoardData();
  const { settings, patch } = useBoardSettings();
  const capture = useCaptureState();
  const backup = useBackup();
  const [memory] = useLocalStore(STORAGE_KEYS.memory, []);
  const [graph] = useLocalStore(STORAGE_KEYS.knowledge, { nodes: [], edges: [] });
  const [reviews] = useLocalStore(STORAGE_KEYS.reviews, []);
  const [timeline] = useLocalStore(STORAGE_KEYS.timeline, []);
  const [history] = useLocalStore(STORAGE_KEYS.history, []);
  const [daily] = useLocalStore(STORAGE_KEYS.daily, []);
  const quota = useStorageQuota(
    `${board.allTasks.length}:${board.allLogs.length}:${board.allFriction.length}:${daily.length}`
  );
  const status = (0, import_react24.useMemo)(() => storageStatus(), []);
  const [probe, setProbe] = (0, import_react24.useState)(null);
  const [origin, setOrigin] = (0, import_react24.useState)(void 0);
  const [scope, setScope] = (0, import_react24.useState)("all");
  const [exportState, setExportState] = (0, import_react24.useState)({ phase: "idle" });
  const transfer = useDataTransfer();
  const fileRef = (0, import_react24.useRef)(null);
  const [overwriteAck, setOverwriteAck] = (0, import_react24.useState)(false);
  const [clearStep, setClearStep] = (0, import_react24.useState)(0);
  const [clearAck, setClearAck] = (0, import_react24.useState)(false);
  const [clearResult, setClearResult] = (0, import_react24.useState)(null);
  (0, import_react24.useEffect)(() => {
    let alive = true;
    void readOriginEstimate().then((value) => {
      if (alive) setOrigin(value);
    });
    return () => {
      alive = false;
    };
  }, [quota.bytes]);
  (0, import_react24.useEffect)(() => {
    if (transfer.result !== null) quota.refresh();
  }, [transfer.result]);
  (0, import_react24.useEffect)(() => {
    if (clearResult !== null) quota.refresh();
  }, [clearResult]);
  (0, import_react24.useEffect)(() => {
    setOverwriteAck(false);
  }, [transfer.mode, transfer.source]);
  const counts = [
    { label: "任务", value: board.allTasks.length },
    { label: "会话日志", value: board.allLogs.length },
    { label: "项目", value: board.projects.length },
    { label: "阻碍记录", value: board.allFriction.length },
    { label: "日聚合", value: daily.length },
    { label: "时间轴", value: timeline.length },
    { label: "项目记忆", value: memory.length },
    { label: "知识节点", value: graph.nodes.length },
    { label: "复习记录", value: reviews.length },
    { label: "历史快照", value: history.length }
  ];
  async function handleExport(target = scope) {
    setExportState({ phase: "preparing" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const prepared = backup.prepareExport(target);
    if (!prepared.ok) {
      setExportState({ phase: "error", message: prepared.message });
      return;
    }
    const ok = downloadText(prepared.fileName, prepared.text);
    if (!ok) {
      setExportState({ phase: "error", message: "导出失败：浏览器拒绝了下载（检查下载权限或弹窗拦截）" });
      return;
    }
    setExportState({
      phase: "ready",
      fileName: prepared.fileName,
      bytes: prepared.bytes,
      at: prepared.generatedAt,
      counts: `${prepared.counts.tasks} 任务 / ${prepared.counts.logs} 日志 / ${prepared.counts.projects} 项目 / ${prepared.counts.memory} 记忆 / ${prepared.counts.knowledge} 知识点`
    });
  }
  function handleClear() {
    const outcome = backup.clearAll();
    setClearResult(outcome);
    if (outcome.ok) {
      setClearStep(0);
      setClearAck(false);
    }
  }
  const busy = transfer.phase === "reading" || transfer.phase === "importing";
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-settings-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { className: "v4-task-page-title", children: "设置 · 数据" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-task-counts", children: "导出 / 导入 / 容量 / 清空都在这里；数据只存在本机。" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Card, { title: "数据概览", meta: `${board.allTasks.length + board.allLogs.length} 条核心记录`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dl", { className: "v4-data-counts", children: counts.map((row) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: row.label }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: row.value })
      ] }, row.label)) }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-panel-hint", children: "统计的是存储里的真实条数，不是估算；归档项目也计入。" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Card, { title: "会话采集", meta: capture.status === "on" ? "监听中" : capture.status === "error" ? "异常" : "已关闭", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-capture", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "v4-capture-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "input",
          {
            type: "checkbox",
            checked: settings.autoCapture,
            onChange: (event) => patch({ autoCapture: event.target.checked })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("strong", { children: "自动记录 DSH 会话" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-capture-note", children: "只记「发生了什么」（类型、标题、行数、文件名的摘要），不保存代码原文、图片和二进制。" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("dl", { className: "v4-data-facts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "监听状态" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { "data-capture-status": capture.status, children: capture.detail })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "事件通道" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: capture.status === "on" ? "已绑定（详见控制台）" : "未绑定" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "与专注的关系" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: "自动记录只计入「会话数」，不计入专注分钟" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-panel-hint", children: "采集在工作台根节点监听，切换页面不会中断；关闭后立刻摘掉监听器。 斜杠命令（/board-*）本阶段只拦截、不执行。" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Card, { title: "存储", meta: status.label, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-storage", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-storage-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-big", children: formatBytes(quota.bytes) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-label", children: "本插件已用（按 UTF-16 字符估算）" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-storage-side", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-label", children: "估算占比" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-value", children: quota.bytes > 0 && Math.round(quota.ratio * 100) === 0 ? "<1%" : `${Math.round(quota.ratio * 100)}%` }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-label", children: "按 5 MB 假定配额" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(ProgressBar, { value: quota.ratio, showValue: true }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-note", children: status.detail }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-facts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "存储状态" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: status.label })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "可写性" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("dd", { children: [
            probe === null ? "未测试" : probe.ok ? "写入成功" : "写入失败",
            probe === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "v4-data-faint", children: [
              " · ",
              formatTime(probe.at)
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "浏览器站点用量" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: origin === void 0 ? "读取中…" : origin === null ? "浏览器不提供" : `${formatBytes(origin.usage)} / ${formatBytes(origin.quota)}` })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "站点剩余（含宿主）" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: origin === void 0 ? "读取中…" : origin === null ? "不可用" : formatBytes(Math.max(0, origin.quota - origin.usage)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "本次会话最近导出" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: exportState.phase === "ready" && exportState.at !== void 0 ? formatRelative(exportState.at) : "尚未导出" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-panel-hint", children: "站点用量包含 DSH 宿主与其它插件，不是本插件的剩余空间；本插件配额无法从浏览器精确读取。 没有持久化的备份历史，导出时间只在本次会话内可见。" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-panel-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          Button,
          {
            size: "sm",
            onClick: () => setProbe({ ok: probeWritable(), at: Date.now() }),
            title: "写入 1 字节再删除，验证当前是否真的可写",
            children: "测试写入"
          }
        ),
        probe === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: probe.ok ? "v4-data-ok" : "v4-data-bad", role: "status", children: probe.ok ? "可写" : "不可写：存储已满或被禁用" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("details", { className: "v4-data-details", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("summary", { children: [
          "各键占用明细（",
          quota.breakdown.length,
          " 项）"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "v4-data-keys", children: quota.breakdown.map((item) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-data-key", children: item.label }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-data-keyval", children: formatBytes(item.bytes) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "v4-data-keyshare", children: [
            Math.round(item.share * 100),
            "%"
          ] })
        ] }, item.key)) })
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Card, { title: "导出", meta: `${BACKUP_SCOPE_LABELS[scope]} · 明文 JSON`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "v4-task-segments", role: "group", "aria-label": "导出范围", children: ["all", "week", "month"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "button",
          {
            type: "button",
            className: scope === key ? "v4-segment is-active" : "v4-segment",
            "aria-pressed": scope === key,
            onClick: () => setScope(key),
            children: BACKUP_SCOPE_LABELS[key]
          },
          key
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "primary", size: "sm", onClick: () => void handleExport(), loading: exportState.phase === "preparing", children: "生成并下载" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-note", children: scope === "all" ? "全量包含所有项目（含已归档）、任务、日志、阻碍、记忆、知识、复习、时间轴、历史快照与日聚合。" : `${BACKUP_SCOPE_LABELS[scope]}导出按时间窗筛选任务 / 日志 / 阻碍 / 复习 / 事件 / 日聚合；记忆与知识是活文档，整体带出。` }),
      exportState.phase === "preparing" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-status", role: "status", children: "正在准备导出…" }) : null,
      exportState.phase === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-result", "data-ok": "true", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-title", children: "已生成并开始下载" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "v4-data-result-body", children: [
          exportState.fileName,
          " · ",
          formatBytes(exportState.bytes ?? 0),
          " · ",
          formatTime(exportState.at ?? Date.now())
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-faint", children: exportState.counts })
      ] }) : null,
      exportState.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-result", "data-ok": "false", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-title", children: "导出失败" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-body", children: exportState.message })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-panel-hint", children: "现有系统没有真正的增量恢复语义：近 7 天 / 当月只是时间窗导出， 导入仍然只有「按 id 合并」与「整体覆盖」两种。不要把时间窗当成可回滚的增量链。" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Card, { title: "导入", meta: "先预览，再写入", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-import", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { size: "sm", onClick: () => fileRef.current?.click(), disabled: busy, children: "选择备份文件…" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-data-faint", children: "仅接受 .json，单文件上限约 8 MB 文本" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "input",
          {
            ref: fileRef,
            className: "v4-data-file",
            type: "file",
            accept: "application/json,.json",
            "aria-label": "选择备份文件",
            onChange: (event) => {
              void transfer.pick(event.target.files?.[0]);
              event.target.value = "";
            }
          }
        )
      ] }),
      transfer.phase === "idle" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-note", children: "选择文件后会先解析并列出条数与冲突，确认前不会写入任何数据。" }) : null,
      transfer.phase === "reading" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-status", role: "status", children: "正在读取并校验文件…" }) : null,
      transfer.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-result", "data-ok": "false", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-title", children: "导入未执行" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-body", children: transfer.error }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "v4-panel-actions", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { size: "sm", variant: "ghost", onClick: transfer.reset, children: "知道了" }) })
      ] }) : null,
      transfer.phase === "done" && transfer.result !== null ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-result", "data-ok": transfer.result.ok ? "true" : "false", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-title", children: transfer.result.title }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-body", children: transfer.result.detail }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "v4-data-faint", children: [
          formatRelative(transfer.result.at),
          " · 已写入本机"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "v4-panel-actions", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { size: "sm", variant: "ghost", onClick: transfer.reset, children: "完成" }) })
      ] }) : null,
      transfer.source !== null && transfer.phase !== "done" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-source", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-source-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-data-source-name", children: transfer.source.fileName }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-data-faint", children: formatBytes(transfer.source.sizeBytes) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("dl", { className: "v4-data-facts", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "Schema 版本" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: transfer.source.version === 0 ? "未标注" : `v${transfer.source.version}` })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "导出时间" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: formatRelative(transfer.source.exportedAt) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "导出范围" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: transfer.source.scope === void 0 ? "未标注" : BACKUP_SCOPE_LABELS[transfer.source.scope] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: "记忆草稿" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("dd", { children: [
              transfer.source.draftCount,
              " 条"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dl", { className: "v4-data-counts is-compact", children: [
          ["任务", transfer.source.counts.tasks],
          ["日志", transfer.source.counts.logs],
          ["项目", transfer.source.counts.projects],
          ["阻碍", transfer.source.counts.friction],
          ["日聚合", transfer.source.counts.daily],
          ["时间轴", transfer.source.counts.timeline],
          ["记忆", transfer.source.counts.memory],
          ["知识点", transfer.source.counts.knowledge],
          ["复习", transfer.source.counts.reviews],
          ["快照", transfer.source.counts.history]
        ].map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dt", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("dd", { children: value })
        ] }, label)) }),
        transfer.source.droppedTotal > 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "v4-data-warn", role: "alert", children: [
          "文件里有 ",
          transfer.source.droppedTotal,
          " 条记录无法识别，导入时会跳过： 任务 ",
          transfer.source.dropped.tasks,
          " · 日志 ",
          transfer.source.dropped.logs,
          " · 项目",
          " ",
          transfer.source.dropped.projects,
          " · 阻碍 ",
          transfer.source.dropped.friction
        ] }) : null,
        transfer.source.version !== 0 && transfer.source.version < 4 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "v4-data-note", children: [
          "这是 v",
          transfer.source.version,
          " 备份，会按当前 schema 兼容读取（缺失字段走默认值）。"
        ] }) : null
      ] }) : null,
      transfer.preview !== null && transfer.phase === "preview" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-preview", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("table", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("caption", { className: "v4-visually-hidden", children: "本地与备份条数对比" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "实体" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "本地" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "备份" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "同 id 冲突" })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("tbody", { children: [
              ["任务", "tasks"],
              ["日志", "logs"],
              ["项目", "projects"],
              ["阻碍", "friction"]
            ].map(([label, key]) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "row", children: label }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { children: transfer.preview.local[key] }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { children: transfer.preview.incoming[key] }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { className: transfer.preview.conflicts[key] > 0 ? "v4-data-bad" : void 0, children: transfer.preview.conflicts[key] })
            ] }, key)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "v4-data-faint", children: [
            "另外：记忆 ",
            transfer.preview.extra?.memory ?? 0,
            " · 知识 ",
            transfer.preview.extra?.knowledge ?? 0,
            " · 复习",
            " ",
            transfer.preview.extra?.reviews ?? 0,
            " · 事件 ",
            transfer.preview.extra?.timeline ?? 0,
            " · 快照",
            " ",
            transfer.preview.extra?.history ?? 0,
            " · 日聚合 ",
            transfer.preview.extra?.daily ?? 0
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-task-segments", role: "group", "aria-label": "导入模式", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                className: transfer.mode === "merge" ? "v4-segment is-active" : "v4-segment",
                "aria-pressed": transfer.mode === "merge",
                onClick: () => transfer.setMode("merge"),
                children: "合并"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                className: transfer.mode === "overwrite" ? "v4-segment is-active is-danger" : "v4-segment",
                "aria-pressed": transfer.mode === "overwrite",
                onClick: () => transfer.setMode("overwrite"),
                children: "覆盖"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "v4-data-faint", children: transfer.mode === "merge" ? "同 id 以备份为准，本地独有记录保留" : "用备份整体替换，本地独有记录会丢失" })
        ] }),
        transfer.mode === "merge" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-confirm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-note", children: "合并只影响同 id 记录；不会删除本地独有的任务 / 日志。" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-panel-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "primary", size: "sm", onClick: () => void transfer.commit(), children: "合并导入" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "ghost", size: "sm", onClick: transfer.discard, children: "取消" })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-danger", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-danger-title", children: "覆盖会替换本地数据" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-danger-body", children: "任务、日志、项目、阻碍、记忆、知识、复习、时间轴、历史快照与日聚合都会被备份替换； 本地独有的记录会消失，且无法在这个页面直接撤销。" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "v4-data-ack", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("input", { type: "checkbox", checked: overwriteAck, onChange: (event) => setOverwriteAck(event.target.checked) }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "我了解本地数据将被替换，并且已经（或准备）先导出一份当前数据。" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-panel-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "danger", size: "sm", disabled: !overwriteAck, onClick: () => void transfer.commit(), children: "覆盖并替换" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "ghost", size: "sm", onClick: () => void handleExport("all"), children: "先导出当前数据" }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "ghost", size: "sm", onClick: transfer.discard, children: "取消" })
          ] })
        ] })
      ] }) : null,
      transfer.phase === "importing" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-status", role: "status", children: "正在写入 12 个键（全写或回滚）…" }) : null
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Card, { title: "危险区", meta: "不可撤销", variant: "quiet", children: [
      clearStep === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-note", children: "清空会删除本机所有看板数据（14 个键）。没有回收站，只能靠之前导出的 JSON 恢复。" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "danger", size: "sm", onClick: () => {
          setClearStep(1);
          setClearAck(false);
        }, children: "清空全部数据…" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-danger", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-danger-title", children: "确认清空本机全部数据？" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-danger-body", children: "将删除：任务、日志、项目、阻碍、设置、计时状态、记忆、知识、复习、时间轴、历史快照、日聚合、调用审计。 此操作不可撤销。" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "v4-data-ack", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("input", { type: "checkbox", checked: clearAck, onChange: (event) => setClearAck(event.target.checked) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "我已导出需要保留的数据，确认清空。" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-panel-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "danger", size: "sm", disabled: !clearAck, onClick: handleClear, children: "确认清空" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Button, { variant: "ghost", size: "sm", onClick: () => {
            setClearStep(0);
            setClearAck(false);
          }, children: "取消" })
        ] })
      ] }),
      clearResult === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "v4-data-result", "data-ok": clearResult.ok ? "true" : "false", role: clearResult.ok ? "status" : "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-title", children: clearResult.ok ? "已清空" : "清空未完成" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "v4-data-result-body", children: clearResult.message })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Card, { title: "能力边界", variant: "quiet", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("ul", { className: "v4-data-limits", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "没有真正的「增量恢复」：近 7 天 / 当月只是导出时间窗，导入仍只有合并与覆盖。" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "导入前不会自动创建恢复快照；需要的话请先手动「生成并下载」一份全量备份。" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "没有跨标签页的导入互斥锁：两个标签同时导入时，后写入的会覆盖先写入的。" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "浏览器不提供 localStorage 的精确剩余空间；页面上的占比是按 5 MB 估算。" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "回滚依赖 localStorage 逐键恢复：空间真满时回滚也可能失败，此时会明确提示「数据可能不一致」。" })
    ] }) })
  ] });
}

// src/client/v4/History.tsx
var import_react25 = require("react");
var import_jsx_runtime15 = require("react/jsx-runtime");
var RANGES = [30, 90, 365];
var PAGE_DAYS = 8;
function History() {
  const board = useBoardData();
  const workspace = useWorkspace();
  const now = useNow(6e4);
  const today = dayKey(now);
  const [range, setRange] = (0, import_react25.useState)(365);
  const [daily] = useLocalStore(STORAGE_KEYS.daily, []);
  const [timeline] = useLocalStore(STORAGE_KEYS.timeline, []);
  const activity = (0, import_react25.useMemo)(
    () => buildActivityWindow(
      { daily, tasks: board.allTasks, logs: board.allLogs },
      { range, now }
    ),
    // `today` 让跨零点后自动重算；不直接依赖 now（每 30 秒会变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, board.allTasks, board.allLogs, range, today]
  );
  const calendar = (0, import_react25.useMemo)(() => buildActivityCalendar(activity.days), [activity.days]);
  const summary = activity.summary;
  const dayMap = (0, import_react25.useMemo)(() => new Map(activity.days.map((day) => [day.day, day])), [activity.days]);
  const groups = (0, import_react25.useMemo)(() => groupTimelineByDay(timeline), [timeline]);
  const [page, setPage] = (0, import_react25.useState)(1);
  const visibleGroups = groups.slice(0, page * PAGE_DAYS);
  const remaining = Math.max(0, groups.length - visibleGroups.length);
  const openDay = (0, import_react25.useCallback)(
    (day) => {
      const cell = dayMap.get(day);
      const title = cell === void 0 ? day : `${formatDateInput((/* @__PURE__ */ new Date(`${day}T00:00:00`)).getTime())} · ${weekdayOfDayKey(day)}`;
      workspace.openDetail({ kind: "day", id: day, title });
    },
    [dayMap, workspace]
  );
  (0, import_react25.useEffect)(() => {
    setPage(1);
  }, [range]);
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "v4-history", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "v4-history-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "v4-history-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { className: "v4-task-page-title", children: "历史" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "v4-task-counts", children: [
          "近 ",
          range,
          " 天 · ",
          summary.activeDays,
          " 天有活动"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "v4-task-segments", role: "group", "aria-label": "统计范围", children: RANGES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
        "button",
        {
          type: "button",
          className: range === value ? "v4-segment is-active" : "v4-segment",
          "aria-pressed": range === value,
          onClick: () => setRange(value),
          children: [
            value,
            " 天"
          ]
        },
        value
      )) })
    ] }),
    board.activeProjectId === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "v4-history-scope", role: "note", children: "历史统计包含全部项目：日聚合没有项目维度，不会按顶部项目筛选伪造一份「项目热力图」。" }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "v4-history-stats", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Stat2, { label: "活跃天数", value: `${summary.activeDays}`, unit: `/ ${range}`, hint: "完成过任务或专注过" }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Stat2, { label: "最长连续", value: `${summary.longestStreak}`, unit: "天", hint: "所选范围内最长一段" }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        Stat2,
        {
          label: "当前连续",
          value: `${summary.currentStreak}`,
          unit: "天",
          hint: summary.todayActive ? "含今天" : "今天还没有活动，从昨天起算"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Stat2, { label: "总专注", value: formatMinutes(summary.focusMinutes), hint: `完成 ${summary.tasksDone} 个任务` })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Card, { title: "学习活动", meta: `${summary.activityCount} 项记录 · 近 ${range} 天`, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ActivityHeatmap, { calendar, today, range, onOpenDay: openDay }) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(Card, { title: "历史活动", meta: `${groups.length} 天有记录`, children: [
      groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        StateView,
        {
          kind: "empty",
          title: "还没有历史记录",
          hint: "完成任务、专注结束、解决阻碍都会出现在这里。"
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ul", { className: "v4-history-list", children: visibleGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          DayGroup,
          {
            day: group.day,
            events: group.events,
            summary: dayMap.get(group.day),
            onOpenDay: openDay
          },
          group.day
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "v4-history-more", children: remaining > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("button", { type: "button", className: "v4-link", onClick: () => setPage((value) => value + 1), children: [
          "加载更早的 ",
          Math.min(remaining, PAGE_DAYS),
          " 天 →"
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "v4-data-faint", children: [
          "已经到底了 · 共 ",
          groups.length,
          " 天"
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "v4-panel-hint", children: "只展示本阶段已存在的真实时间轴事件；会话日志逐条明细尚未迁移，只计入统计。" })
    ] })
  ] });
}
function Stat2({ label, value, unit, hint }) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "v4-history-stat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "v4-stat-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "v4-history-value", children: [
      value,
      unit === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-unit", children: unit })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "v4-history-hint", children: hint })
  ] });
}
function DayGroup({
  day,
  events,
  summary,
  onOpenDay
}) {
  const [expanded, setExpanded] = (0, import_react25.useState)(false);
  const visible = expanded ? events : events.slice(0, 3);
  const hidden = events.length - visible.length;
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { className: "v4-history-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("button", { type: "button", className: "v4-history-day", onClick: () => onOpenDay(day), children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-date", children: formatDateInput((/* @__PURE__ */ new Date(`${day}T00:00:00`)).getTime()) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-weekday", children: weekdayOfDayKey(day) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "v4-history-count", children: [
        events.length,
        " 条"
      ] }),
      summary === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "v4-history-focus", children: [
        summary.focusMinutes > 0 ? `专注 ${summary.focusMinutes}m` : "无专注",
        summary.tasksDone > 0 ? ` · 完成 ${summary.tasksDone}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-open", children: "当天详情 →" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ul", { className: "v4-history-events", children: visible.map((event) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-time", children: formatTime(event.at) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-kind", children: EVENT_META[event.type].label }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v4-history-title", children: event.title })
    ] }, event.id)) }),
    hidden > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("button", { type: "button", className: "v4-history-expand", onClick: () => setExpanded(true), children: [
      "展开其余 ",
      hidden,
      " 条"
    ] }) : null,
    expanded && events.length > 3 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "v4-history-expand", onClick: () => setExpanded(false), children: "收起" }) : null
  ] });
}

// src/client/index.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
var PACKAGE_ID = "dsh-otaku-study-board";
var PANEL_ID = "dsh-otaku-study-board";
var PANEL_ORDER = 20;
var PANEL_TITLE = "溯时学习工作台";
var PANEL_DESCRIPTION = "A local-first study workbench for DSH: project grouping, subtasks, pomodoro with breaks, Harness session capture, context insight, slash commands, friction log and project snapshots. All data stays on your device.";
var STYLE_TAG_ID = `${PACKAGE_ID}/board.css`;
function warn2(message, error) {
  try {
    console.warn(`[${PACKAGE_ID}] ${message}`, error ?? "");
  } catch {
  }
}
function BoardIcon(props) {
  const size = props.size ?? 16;
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", focusable: "false", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("circle", { cx: "11", cy: "12", r: "7.4", stroke: "currentColor", strokeWidth: "1.5", opacity: "0.9" }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("path", { d: "M11 8.2V12l2.6 1.7", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("path", { d: "M17.6 4.4l1.9 1.9 3.1-3.1", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", opacity: "0.75" })
  ] });
}
function BoardPage({ sessionId, ctx }) {
  const [v4Page, setV4Page] = (0, import_react26.useState)("dashboard");
  useSettlementRecovery();
  const [createSignal, setCreateSignal] = (0, import_react26.useState)(0);
  const openCreateTask = () => {
    setV4Page("tasks");
    setCreateSignal((value) => value + 1);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "osb-page v4-page", "data-view": "v4", "data-osb-page": "", "data-session": sessionId ?? "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(CaptureBridge, { ...ctx === void 0 ? {} : { ctx }, ...sessionId === void 0 ? {} : { sessionId } }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(V4Shell, { page: v4Page, onPageChange: setV4Page, children: v4Page === "tasks" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Tasks, { createSignal }) : v4Page === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Settings, {}) : v4Page === "history" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(History, {}) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Dashboard, { onNavigate: () => setV4Page("tasks"), onCreateTask: openCreateTask }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "v4-scope v4-overlays", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(NoticeHost, {}),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ConflictHost, {})
    ] })
  ] });
}
function registerSidebarGuide(ctx, entry, page) {
  const disposers = [];
  const track = (disposer) => {
    if (typeof disposer === "function") disposers.push(disposer);
  };
  const guide = ctx.slots.sidebarGuide;
  if (guide !== void 0 && typeof guide.register === "function") {
    try {
      track(guide.register(entry));
      return { channel: "sidebarGuide", dispose: () => runAll(disposers) };
    } catch (error) {
      warn2("ctx.slots.sidebarGuide.register threw — falling back to main + panellist", error);
    }
  }
  try {
    track(
      ctx.slots.inject(
        "main",
        () => ctx.slots.register({ name: "main", key: entry.id }, page)
      )
    );
    track(
      ctx.slots.inject(
        "sidebar.panellist",
        () => ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: entry.id,
            order: entry.order,
            label: entry.title
          },
          (props) => entry.icon?.({ size: typeof props.size === "number" ? props.size : void 0 }) ?? null
        )
      )
    );
  } catch (error) {
    warn2("sidebar guide registration failed — releasing partial registrations", error);
    runAll(disposers);
    return { channel: "none", dispose: () => void 0 };
  }
  return { channel: "main+panellist", dispose: () => runAll(disposers) };
}
function runAll(disposers) {
  while (disposers.length > 0) {
    const dispose = disposers.pop();
    try {
      dispose?.();
    } catch {
    }
  }
}
function installBoardStyles() {
  if (typeof document === "undefined") return;
  const cssText = true ? `/* ============================================================================
 * Sorchron Study Board（溯时学习工作台）— V1.1 styles
 *
 * Design intent: a restrained, quietly precise workbench for a developer's own
 * use. Low saturation, generous whitespace, one accent colour doing all the
 * pointing; no cartoon flourishes, no bouncing, no attention-seeking effects.
 *
 * Rules:
 *   1. Colour, radius and font come from DSH theme variables (\`--dsw-*\`) with a
 *      light-theme fallback, so every skin (default / dark / EVA / others)
 *      re-colours the page with no extra work.
 *   2. Each card has a hairline title bar tinted with the theme accent — the
 *      only place the accent is allowed to fill an area.
 *   3. Only \`transition\`s: no \`@keyframes\`, no infinite animation, no
 *      \`will-change\`. Hover is a 1px lift + border/shadow shift.
 *   4. Every selector is namespaced \`.osb-*\`; nothing leaks into the host DOM.
 * ==========================================================================*/

/* ── 0. Tokens ──────────────────────────────────────────────────────────────*/
.osb-page {
  --osb-radius: var(--dsw-radius-panel, 14px);
  --osb-radius-sm: var(--dsw-radius-md, 8px);
  --osb-radius-pill: 999px;

  --osb-text: var(--dsw-alias-label-primary, #1d1a22);
  --osb-text-2: var(--dsw-alias-label-secondary, #5b5563);
  --osb-text-3: var(--dsw-alias-label-tertiary, #8b8595);

  --osb-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --osb-surface-2: var(--dsw-alias-bg-layer-2, #faf9fb);
  --osb-surface-3: var(--dsw-alias-bg-layer-3, #f3f1f6);
  --osb-border: var(--dsw-alias-border-l2, rgba(24, 14, 32, 0.09));
  --osb-border-strong: var(--dsw-alias-border-l3, rgba(24, 14, 32, 0.16));
  --osb-hover: var(--dsw-alias-interactive-bg-hover, rgba(24, 14, 32, 0.045));

  --osb-accent: var(--dsw-alias-brand-primary, #7d6bb0);
  --osb-accent-text: var(--dsw-alias-brand-text, #5d4f8c);
  --osb-ok: var(--dsw-alias-state-success-primary, #2f8f62);
  --osb-warn: var(--dsw-alias-state-warn-primary, #b8862f);
  --osb-danger: var(--dsw-alias-state-error-primary, #c25a5a);

  /* Fallback first, then the theme-derived value: engines without color-mix()
     keep the rgba() one. */
  --osb-accent-wash: rgba(125, 107, 176, 0.07);
  --osb-accent-wash: color-mix(in srgb, var(--osb-accent) 7%, transparent);
  --osb-accent-soft: rgba(125, 107, 176, 0.14);
  --osb-accent-soft: color-mix(in srgb, var(--osb-accent) 14%, transparent);

  --osb-shadow: 0 1px 2px rgba(20, 12, 30, 0.04);
  --osb-shadow-hover: 0 6px 18px -14px rgba(20, 12, 30, 0.45);

  --osb-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --osb-dur: 180ms;
  --osb-mono: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* ── 1. Page shell ────────────────────────────────────────────────────────── */
.osb-page {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 30px 34px 44px;
  box-sizing: border-box;
  color: var(--osb-text);
  font-family: var(--dsw-font-family, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif);
  font-size: 13px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.osb-page *,
.osb-page *::before,
.osb-page *::after {
  box-sizing: border-box;
}

.osb-page::-webkit-scrollbar {
  width: 10px;
}

.osb-page::-webkit-scrollbar-thumb {
  border-radius: var(--osb-radius-pill);
  background: var(--dsw-alias-scrollbar-bg-l2, rgba(24, 14, 32, 0.14));
}

.osb-page::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-scrollbar-hover-l2, rgba(24, 14, 32, 0.24));
}

/* ── 2. Hero ──────────────────────────────────────────────────────────────── */
.osb-hero {
  max-width: 1180px;
  margin: 0 auto 22px;
  padding: 0 2px;
}

.osb-hero-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.osb-hero-mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  margin-top: 2px;
  border: 1px solid var(--osb-border);
  border-radius: 10px;
  color: var(--osb-accent-text);
  background: var(--osb-accent-wash);
}

.osb-hero-text {
  min-width: 0;
  flex: 1;
}

.osb-hero-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  line-height: 1.3;
}

.osb-hero-title-zh {
  font-size: 19px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.osb-hero-sep {
  color: var(--osb-text-3);
  font-size: 14px;
  font-weight: 300;
}

.osb-hero-title-en {
  color: var(--osb-text-2);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.osb-hero-sub {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  margin: 4px 0 0;
}

.osb-hero-sub-zh {
  color: var(--osb-text-2);
  font-size: 12.5px;
  letter-spacing: 0.12em;
}

.osb-hero-sub-en {
  color: var(--osb-text-3);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.osb-hero-date {
  flex: none;
  margin-left: auto;
  padding-top: 4px;
  color: var(--osb-text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.osb-hero-desc {
  max-width: 76ch;
  margin: 14px 0 0;
  color: var(--osb-text-2);
  font-size: 12px;
  line-height: 1.7;
}

.osb-hero-quote {
  margin: 14px 0 0;
  padding: 10px 0 10px 14px;
  border-left: 2px solid var(--osb-accent-soft);
}

.osb-hero-quote-zh {
  margin: 0;
  color: var(--osb-text-2);
  font-size: 12.5px;
  letter-spacing: 0.04em;
}

.osb-hero-quote-en {
  margin: 2px 0 0;
  color: var(--osb-text-3);
  font-size: 11.5px;
  font-style: italic;
  letter-spacing: 0.01em;
}

/* ── 3. Grid ──────────────────────────────────────────────────────────────── */
.osb-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
  max-width: 1180px;
  margin: 0 auto;
}

.osb-span-12 { grid-column: span 12; }
.osb-span-7 { grid-column: span 7; }
.osb-span-5 { grid-column: span 5; }

/* ── 4. Card shell ────────────────────────────────────────────────────────── */
.osb-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius);
  background: var(--osb-surface);
  box-shadow: var(--osb-shadow);
  transition:
    box-shadow var(--osb-dur) var(--osb-ease),
    border-color var(--osb-dur) var(--osb-ease);
}

/* 不要在这里加 transform。卡片位移会带来两个副作用：
 *   1. 卡片成为 position:fixed 子元素的包含块，遮罩被关进卡片（弹窗闪烁）；
 *   2. 鼠标停在卡片最后 1px 时，卡片抬起来 → 指针离开 → 卡片落回去 → 死循环。
 * 悬停反馈只用边框和阴影表达。 */
.osb-card:hover {
  border-color: var(--osb-border-strong);
  box-shadow: var(--osb-shadow-hover);
}

/* Hairline title bar: the accent's only filled surface. */
.osb-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--osb-border);
  background: var(--osb-accent-wash);
}

.osb-card-head-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.osb-card-title {
  margin: 0;
  color: var(--osb-text);
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.06em;
}

.osb-card-title-en {
  color: var(--osb-text-3);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.osb-card-date {
  color: var(--osb-text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.osb-card-count,
.osb-badge {
  flex: none;
  padding: 1px 8px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-pill);
  background: var(--osb-surface);
  color: var(--osb-text-2);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.osb-badge {
  border-color: transparent;
  background: var(--osb-accent-soft);
  color: var(--osb-accent-text);
  font-weight: 600;
}

.osb-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

/* ── 5. Typography helpers ────────────────────────────────────────────────── */
.osb-hint {
  margin: 0;
  color: var(--osb-text-3);
  font-size: 11.5px;
  line-height: 1.6;
}

.osb-hint-block {
  padding: 8px 10px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-sm);
  background: var(--osb-surface-2);
}

.osb-empty {
  margin: 0;
  padding: 14px 12px;
  border: 1px dashed var(--osb-border-strong);
  border-radius: var(--osb-radius-sm);
  color: var(--osb-text-3);
  font-size: 11.5px;
  text-align: center;
  line-height: 1.7;
}

/* ── 6. Controls ──────────────────────────────────────────────────────────── */
.osb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-pill);
  background: var(--osb-surface);
  color: var(--osb-text-2);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--osb-dur) var(--osb-ease),
    border-color var(--osb-dur) var(--osb-ease),
    color var(--osb-dur) var(--osb-ease);
}

.osb-btn:hover {
  border-color: var(--osb-border-strong);
  background: var(--osb-hover);
  color: var(--osb-text);
}

.osb-btn:active {
  transform: translateY(0.5px);
}

.osb-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--osb-accent));
  outline-offset: 1px;
}

.osb-btn-primary {
  border-color: transparent;
  background: var(--osb-accent);
  color: #fff;
}

.osb-btn-primary:hover {
  background: var(--osb-accent);
  color: #fff;
  filter: brightness(1.05);
}

.osb-btn-ghost {
  background: transparent;
}

.osb-btn-ghost[aria-pressed="true"] {
  border-color: var(--osb-accent-soft);
  background: var(--osb-accent-wash);
  color: var(--osb-accent-text);
}

.osb-btn-icon {
  padding: 2px 6px;
  border-color: transparent;
  background: transparent;
  color: var(--osb-text-3);
  font-size: 12px;
}

.osb-btn-icon:hover {
  background: var(--osb-hover);
  color: var(--osb-text);
}

.osb-input,
.osb-select,
.osb-textarea {
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-sm);
  background: var(--osb-surface);
  color: var(--osb-text);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  transition:
    border-color var(--osb-dur) var(--osb-ease),
    background-color var(--osb-dur) var(--osb-ease);
}

.osb-select {
  flex: none;
  width: auto;
  padding-right: 6px;
  cursor: pointer;
}

.osb-input::placeholder,
.osb-textarea::placeholder {
  color: var(--osb-text-3);
}

.osb-input:hover,
.osb-select:hover,
.osb-textarea:hover {
  border-color: var(--osb-border-strong);
}

.osb-input:focus,
.osb-select:focus,
.osb-textarea:focus {
  outline: none;
  border-color: var(--osb-accent);
}

.osb-textarea {
  resize: vertical;
  line-height: 1.6;
}

.osb-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.osb-field-label {
  color: var(--osb-text-3);
  font-size: 10.5px;
  letter-spacing: 0.06em;
}

/* ── 7. Card A · Overview ─────────────────────────────────────────────────── */
.osb-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-sm);
  background: var(--osb-border);
  list-style: none;
}

.osb-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  background: var(--osb-surface);
  transition: background-color var(--osb-dur) var(--osb-ease);
}

.osb-metric:hover {
  background: var(--osb-surface-2);
}

.osb-metric-label {
  color: var(--osb-text-3);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.osb-metric-value {
  color: var(--osb-text);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.osb-metric-unit {
  margin-left: 3px;
  color: var(--osb-text-3);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
}

.osb-metric-hint {
  color: var(--osb-text-3);
  font-size: 10.5px;
  opacity: 0.85;
}

.osb-slogan {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--osb-accent-soft);
  color: var(--osb-text-3);
  font-size: 11.5px;
  font-style: italic;
  letter-spacing: 0.01em;
}

/* ── 8. Card B · Task list ────────────────────────────────────────────────── */
.osb-add {
  display: flex;
  gap: 6px;
}

.osb-add .osb-input {
  flex: 1;
}

.osb-task-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-sm);
  background: var(--osb-border);
  list-style: none;
}

.osb-task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: var(--osb-surface);
  transition: background-color var(--osb-dur) var(--osb-ease);
}

.osb-task:hover {
  background: var(--osb-surface-2);
}

.osb-task[data-done="true"] {
  opacity: 0.5;
}

.osb-task[data-done="true"] .osb-task-title {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.osb-check {
  flex: none;
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--osb-accent);
  cursor: pointer;
}

.osb-task-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.osb-task-title {
  overflow: hidden;
  color: var(--osb-text);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.osb-task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--osb-text-3);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.osb-task-dot {
  opacity: 0.6;
}

.osb-task-done {
  color: var(--osb-ok);
  opacity: 0.9;
}

/* Three-colour priority marker — the only saturated colour in a row. */
.osb-priority {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.osb-priority-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--osb-text-3);
}

.osb-priority[data-priority="normal"] .osb-priority-dot {
  background: var(--osb-text-3);
  opacity: 0.65;
}

.osb-priority[data-priority="important"] {
  color: var(--osb-warn);
}

.osb-priority[data-priority="important"] .osb-priority-dot {
  background: var(--osb-warn);
}

.osb-priority[data-priority="urgent"] {
  color: var(--osb-danger);
}

.osb-priority[data-priority="urgent"] .osb-priority-dot {
  background: var(--osb-danger);
}

/* ── 9. Card C · Focus timer ──────────────────────────────────────────────── */
.osb-clock {
  margin: 2px 0;
  color: var(--osb-text);
  font-family: var(--osb-mono);
  font-size: 40px;
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  transition: color var(--osb-dur) var(--osb-ease);
}

.osb-clock[data-running="true"] {
  color: var(--osb-accent-text);
}

.osb-track {
  height: 3px;
  overflow: hidden;
  border-radius: var(--osb-radius-pill);
  background: var(--osb-surface-3);
}

.osb-track-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--osb-accent);
  transition: width 240ms linear;
}

.osb-timer-actions {
  display: flex;
  gap: 6px;
}

.osb-timer-bound {
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--osb-border);
  color: var(--osb-text-3);
  font-size: 11px;
  line-height: 1.6;
}

/* ── 10. Card D · Session log ─────────────────────────────────────────────── */
.osb-log-toolbar {
  display: flex;
  gap: 6px;
}

.osb-log-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-sm);
  background: var(--osb-border);
  list-style: none;
}

.osb-log-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  background: var(--osb-surface);
  transition: background-color var(--osb-dur) var(--osb-ease);
}

.osb-log-row:hover {
  background: var(--osb-surface-2);
}

.osb-log-time {
  flex: none;
  padding-top: 1px;
  color: var(--osb-text-3);
  font-family: var(--osb-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.osb-log-body {
  min-width: 0;
  flex: 1;
}

.osb-log-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}

.osb-log-type {
  flex: none;
  padding: 0 6px;
  border-radius: 3px;
  background: var(--osb-surface-3);
  color: var(--osb-text-2);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.osb-log-row[data-type="dev"] .osb-log-type {
  background: var(--osb-accent-wash);
  color: var(--osb-accent-text);
}

.osb-log-row[data-type="debug"] .osb-log-type {
  background: rgba(184, 134, 47, 0.12);
  background: color-mix(in srgb, var(--osb-warn) 13%, transparent);
  color: var(--osb-warn);
}

.osb-log-row[data-type="reading"] .osb-log-type {
  background: rgba(47, 143, 98, 0.1);
  background: color-mix(in srgb, var(--osb-ok) 12%, transparent);
  color: var(--osb-ok);
}

.osb-log-project {
  color: var(--osb-text-3);
  font-size: 10.5px;
  font-family: var(--osb-mono);
}

.osb-log-title {
  color: var(--osb-text);
  font-size: 12.5px;
}

.osb-log-edited {
  color: var(--osb-text-3);
  font-size: 10px;
  font-style: italic;
}

.osb-log-detail {
  margin: 3px 0 0;
  color: var(--osb-text-2);
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.osb-log-editor {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-sm);
  background: var(--osb-surface-2);
}

.osb-log-editor-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px;
  gap: 8px;
  margin-bottom: 8px;
}

.osb-log-editor-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.osb-log-actions {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0.5;
  transition: opacity var(--osb-dur) var(--osb-ease);
}

.osb-log-row:hover .osb-log-actions {
  opacity: 1;
}

/* ── 11. Card E · Statistics ─────────────────────────────────────────────── */
/* V2 起这一格由真实图表填充，V1 的占位槽样式已随组件一起移除；
   新的结构规则写在文件末尾的 V2 段落里。 */

/* ── 12. Responsive & motion ──────────────────────────────────────────────── */
@media (max-width: 1080px) {
  .osb-span-7,
  .osb-span-5 {
    grid-column: span 12;
  }

  .osb-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .osb-page {
    padding: 20px 18px 30px;
  }

  .osb-hero-row {
    flex-wrap: wrap;
  }

  .osb-hero-date {
    margin-left: 0;
    padding-top: 0;
  }

  .osb-add {
    flex-wrap: wrap;
  }

  .osb-add .osb-input {
    flex: 1 1 100%;
  }

  .osb-log-editor-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .osb-card,
  .osb-card:hover,
  .osb-btn,
  .osb-btn:hover,
  .osb-track-fill,
  .osb-task,
  .osb-log-row,
  .osb-log-actions,
  .osb-clock,
  .osb-input,
  .osb-select,
  .osb-textarea {
    transition: none;
  }

  .osb-card:hover {
    transform: none;
  }
}

/* ============================================================================
 * V2 — 功能层结构样式
 *
 * 本轮只补「新控件能用」所需的最小结构：栅格、对齐、间距、层级。没有新增
 * 过渡、没有关键帧、没有重排既有卡片布局。配色全部复用第 0 节的 token，
 * 所以换肤仍然自动生效。视觉打磨留给下一版。
 * ==========================================================================*/

/* ── 卡片头部工具位 ─────────────────────────────────────────────────────── */
.osb-head-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.osb-btn-sm {
  padding: 3px 9px;
  font-size: 12px;
}

.osb-btn-danger {
  color: var(--osb-danger);
  border-color: var(--osb-danger);
}

/* ── 通用弹窗（二次确认 / 计时结束）────────────────────────────────────── */
.osb-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 12, 30, 0.34);
}

.osb-modal {
  width: min(420px, 100%);
  padding: 18px 20px;
  border: 1px solid var(--osb-border-strong);
  border-radius: var(--osb-radius);
  background: var(--osb-surface);
  box-shadow: 0 18px 48px -24px rgba(20, 12, 30, 0.5);
}

.osb-modal-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--osb-text);
}

.osb-modal-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--osb-text-2);
}

.osb-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* ── 筛选控件 ───────────────────────────────────────────────────────────── */
.osb-filterbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}

.osb-chip {
  padding: 3px 10px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius-pill);
  background: transparent;
  color: var(--osb-text-2);
  font-size: 12px;
  cursor: pointer;
}

.osb-chip[aria-pressed='true'] {
  border-color: transparent;
  background: var(--osb-accent-soft);
  color: var(--osb-accent-text);
}

.osb-log-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.osb-log-filters .osb-input,
.osb-log-filters .osb-select {
  flex: 1 1 148px;
  min-width: 132px;
}

.osb-capture-status {
  margin-left: auto;
  font-size: 12px;
  color: var(--osb-text-3);
  white-space: nowrap;
}

.osb-capture-status[data-on='true'] {
  color: var(--osb-ok);
}

/* ── 任务行：内联编辑与操作区 ───────────────────────────────────────────── */
.osb-task-editor {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.osb-task-editor .osb-input {
  flex: 1 1 150px;
}

.osb-task-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  margin-left: auto;
}

/* ── 计时器：时长输入 ───────────────────────────────────────────────────── */
.osb-timer-duration {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0 4px;
}

.osb-field-inline {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.osb-input-number {
  width: 76px;
}

.osb-field-suffix {
  font-size: 12px;
  color: var(--osb-text-3);
}

.osb-card-count[data-running='true'] {
  color: var(--osb-ok);
}

/* ── 概览：短句轮播 ─────────────────────────────────────────────────────── */
.osb-slogan-quote {
  margin: 12px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--osb-accent-soft);
}

.osb-slogan {
  margin: 0;
  font-size: 13px;
  color: var(--osb-text-2);
}

.osb-slogan-en {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--osb-text-3);
}

/* ── 统计卡栅格 ─────────────────────────────────────────────────────────── */
.osb-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 20px;
}

.osb-stat-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  margin: 0;
}

.osb-stat-wide {
  grid-column: span 3;
}

.osb-stat-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--osb-text);
}

.osb-stat-meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--osb-text-3);
  white-space: nowrap;
}

.osb-stat-hint {
  margin: 0;
  font-size: 11px;
  color: var(--osb-text-3);
}

/* ── 环形图与图例 ───────────────────────────────────────────────────────── */
.osb-pie {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.osb-pie-canvas {
  flex: 0 0 auto;
}

.osb-legend {
  display: flex;
  flex: 1 1 120px;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.osb-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--osb-text-2);
}

.osb-swatch {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.osb-legend-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.osb-legend-value {
  font-family: var(--osb-mono);
  font-size: 11px;
  color: var(--osb-text-3);
}

.osb-legend-empty {
  color: var(--osb-text-3);
}

/* ── 项目投入条 ─────────────────────────────────────────────────────────── */
.osb-project-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.osb-project-row {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--osb-text-2);
}

.osb-project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.osb-project-track {
  height: 6px;
  border-radius: 3px;
  background: var(--osb-surface-3);
  overflow: hidden;
}

.osb-project-fill {
  display: block;
  height: 100%;
  background: var(--osb-accent);
  opacity: 0.75;
}

.osb-project-value,
.osb-project-count {
  font-family: var(--osb-mono);
  font-size: 11px;
  text-align: right;
  color: var(--osb-text-2);
}

.osb-project-count {
  color: var(--osb-text-3);
}

.osb-project-rest .osb-project-name {
  color: var(--osb-text-3);
}

/* ── 本周完成率 ─────────────────────────────────────────────────────────── */
.osb-week {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.osb-week-track {
  height: 8px;
  border-radius: 4px;
  background: var(--osb-surface-3);
  overflow: hidden;
}

.osb-week-fill {
  display: block;
  height: 100%;
  background: var(--osb-accent);
}

.osb-week-figures {
  display: flex;
  gap: 18px;
  margin: 0;
}

.osb-week-figures dt {
  font-size: 11px;
  color: var(--osb-text-3);
}

.osb-week-figures dd {
  margin: 2px 0 0;
  font-family: var(--osb-mono);
  font-size: 15px;
  color: var(--osb-text);
}

/* ── 折叠面板 ───────────────────────────────────────────────────────────── */
.osb-collapse-group {
  margin-top: 18px;
  padding-top: 4px;
  border-top: 1px solid var(--osb-border);
}

.osb-collapse {
  border-bottom: 1px solid var(--osb-border);
}

.osb-collapse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 2px;
  font-size: 13px;
  font-weight: 500;
  color: var(--osb-text);
  cursor: pointer;
  list-style: none;
}

.osb-collapse-head::-webkit-details-marker {
  display: none;
}

.osb-collapse-meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--osb-text-3);
}

.osb-collapse-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 2px 16px;
}

/* ── 月度目标 ───────────────────────────────────────────────────────────── */
.osb-goal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.osb-goal-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--osb-text-2);
}

.osb-goal-track {
  height: 6px;
  border-radius: 3px;
  background: var(--osb-surface-3);
  overflow: hidden;
}

.osb-goal-fill {
  display: block;
  height: 100%;
  background: var(--osb-accent);
}

.osb-goal-value {
  font-family: var(--osb-mono);
  font-size: 11px;
}

.osb-goal-rate {
  font-size: 11px;
  color: var(--osb-text-3);
  text-align: right;
}

.osb-goal-form {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

/* ── 数据备份 ───────────────────────────────────────────────────────────── */
.osb-data-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.osb-file-input {
  display: none;
}

.osb-notice {
  margin: 0;
  font-size: 12px;
  color: var(--osb-text-2);
}

.osb-notice[data-ok='false'] {
  color: var(--osb-danger);
}

/* ── 日志行补充角标 ─────────────────────────────────────────────────────── */
.osb-log-kind {
  padding: 1px 6px;
  border: 1px solid var(--osb-border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--osb-text-3);
}

.osb-log-hits {
  font-family: var(--osb-mono);
  font-size: 11px;
  color: var(--osb-accent-text);
}

/* ── V2 响应式：仅调整新栅格，不改动既有排版 ───────────────────────────── */
@media (max-width: 1080px) {
  .osb-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .osb-stat-wide {
    grid-column: span 2;
  }
}

@media (max-width: 720px) {
  .osb-stats-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .osb-stat-wide {
    grid-column: span 1;
  }

  .osb-head-tools .osb-card-date {
    display: none;
  }

  .osb-capture-status {
    margin-left: 0;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * V3 新增结构（只补布局与状态占位，不动已有卡片的视觉语言）
 * ──────────────────────────────────────────────────────────────────────────── */

/* 项目切换条：一行 chip + 一行操作，放在页头与网格之间 */
.osb-projectbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
  border: 1px solid var(--osb-border);
  border-radius: var(--osb-radius);
  background: var(--osb-surface-2);
}

.osb-projectbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.osb-project-manage {
  border-top: 1px dashed var(--osb-border);
  padding-top: 6px;
}

/* 子任务块：缩进一点，让它看起来是主任务的从属 */
.osb-subtasks {
  grid-column: 1 / -1;
  margin: 4px 0 2px 26px;
  padding-left: 10px;
  border-left: 2px solid var(--osb-border);
}

/* 逾期：只改颜色，不改布局 */
.osb-task[data-overdue='true'] .osb-task-title {
  color: var(--osb-danger);
}

.osb-task-meta span[data-overdue='true'] {
  color: var(--osb-danger);
}

.osb-stat-hint[data-overdue='true'] {
  color: var(--osb-danger);
}

/* 休息阶段的进度条用另一个颜色，避免和专注混淆 */
.osb-track-fill[data-phase='short'],
.osb-track-fill[data-phase='long'] {
  background: var(--osb-ok);
}

/* 上下文面板的等级标记 */
.osb-collapse-meta[data-level='warn'] {
  color: var(--osb-warn);
}

.osb-collapse-meta[data-level='danger'] {
  color: var(--osb-danger);
}

/* 容量条等级 */
.osb-track[data-level='warn'] .osb-track-fill {
  background: var(--osb-warn);
}

.osb-track[data-level='danger'] .osb-track-fill {
  background: var(--osb-danger);
}


/* ── P0 横向溢出：筛选行可换行、控件不得撑破父容器 ── */
.osb-log-filters { flex-wrap: wrap; min-width: 0; }
.osb-log-filters > * { min-width: 0; }
.osb-log-filters .osb-select,
.osb-log-filters .osb-input { max-width: 100%; }
.osb-add { flex-wrap: wrap; }
.osb-add .osb-input { min-width: 0; flex: 1 1 180px; }
.osb-grid > * { min-width: 0; }
.v4-scope { max-width: 100%; box-sizing: border-box; }
.v4-scope .v4-glass-1,
.v4-scope .v4-glass-2,
.v4-dash > * { min-width: 0; }


.v4-page,.v4-scope,.osb-page{
  --v4-bg:var(--dsw-alias-bg-layer-2, #f7f2f4);
  --v4-bg:color-mix(in srgb, var(--dsw-alias-bg-layer-2, #f7f2f4) 94%, #f4eaee 6%);
  --v4-surface-solid:var(--dsw-alias-bg-layer-1, #fdfbfb);
  --v4-surface-1:var(--v4-surface-solid);
  --v4-surface-1:color-mix(in srgb, var(--v4-surface-solid) 62%, transparent);
  --v4-surface-2:var(--v4-surface-solid);
  --v4-surface-2:color-mix(in srgb, var(--v4-surface-solid) 46%, transparent);
  --v4-border:var(--dsw-alias-border-l2, rgba(124,100,116,.14));
  --v4-border-strong:var(--dsw-alias-border-l3, rgba(124,100,116,.26));
  --v4-text:var(--dsw-alias-label-primary, #2c2630);
  --v4-text-2:#5c5560;
  --v4-text-3:#6a6371;
  --v4-rose:#b0768a;
  --v4-violet:#8a76b8;
  --v4-violet:color-mix(in srgb, #8a76b8 78%, var(--v4-text) 22%);
  --v4-accent:var(--v4-rose);
  --v4-accent:color-mix(in srgb, var(--v4-rose) 82%, var(--v4-text) 18%);
  --v4-accent-soft:rgba(176,118,138,.14);
  --v4-ok:#5d8f78;
  --v4-warn:#b58a4a;
  --v4-danger:#a34a49;
  --v4-r-sm:10px; --v4-r-md:14px; --v4-r-lg:20px; --v4-r-pill:999px;
  --v4-s1:4px; --v4-s2:8px; --v4-s3:12px; --v4-s4:16px; --v4-s5:24px; --v4-s6:32px; --v4-s7:48px;
  --v4-shadow-1:0 1px 2px rgba(44,38,48,.05);
  --v4-shadow-2:0 16px 40px -24px rgba(44,38,48,.42);
  --v4-ease:cubic-bezier(.22,.61,.36,1);
  --v4-dur:160ms;
  --v4-blur-1:blur(18px) saturate(1.06);
  --v4-blur-2:blur(12px) saturate(1.04);
}

@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){
  .v4-glass-1,.v4-glass-2{background:var(--v4-surface-solid)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
}
@media (prefers-reduced-motion: reduce){
  .v4-page *,.v4-scope *{animation:none!important;transition:none!important}
  .v4-btn-spinner{animation:none!important}
}
@keyframes v4-btn-spin{to{transform:rotate(360deg)}}
.v4-page,.v4-scope{color:var(--v4-text)}
.v4-glass-1{background:var(--v4-surface-1);backdrop-filter:var(--v4-blur-1);-webkit-backdrop-filter:var(--v4-blur-1);border:1px solid var(--v4-border);border-radius:var(--v4-r-lg);box-shadow:var(--v4-shadow-1)}
.v4-glass-2{background:var(--v4-surface-2);backdrop-filter:var(--v4-blur-2);-webkit-backdrop-filter:var(--v4-blur-2);border:1px solid var(--v4-border);border-radius:var(--v4-r-md);box-shadow:var(--v4-shadow-1)}
.v4-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;font-size:13px;font-weight:500;border-radius:var(--v4-r-pill);border:1px solid var(--v4-border);background:var(--v4-surface-2);color:var(--v4-text);cursor:pointer;transition:transform var(--v4-dur) var(--v4-ease),background var(--v4-dur) var(--v4-ease),box-shadow var(--v4-dur) var(--v4-ease),border-color var(--v4-dur) var(--v4-ease)}
.v4-btn:hover{transform:translateY(-1px);box-shadow:var(--v4-shadow-1)}
.v4-btn:active{transform:scale(.985)}
.v4-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.v4-btn:focus-visible{outline:2px solid var(--v4-accent);outline-offset:2px}
.v4-btn-label{display:inline-flex;align-items:center;gap:6px}
.v4-btn-loading .v4-btn-label{visibility:hidden}
.v4-btn-spinner{position:absolute;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:v4-btn-spin .7s linear infinite}
.v4-btn-primary{background:var(--v4-accent);background:color-mix(in srgb, var(--v4-accent) 88%, var(--v4-text));border-color:transparent;color:var(--dsw-alias-label-primary-inverted, #fff)}
.v4-btn-primary:hover{background:color-mix(in srgb, var(--v4-accent) 76%, var(--v4-text))}
.v4-btn-ghost{background:transparent;border-color:transparent;color:var(--v4-text-2)}
.v4-btn-ghost:hover{background:var(--v4-surface-2);color:var(--v4-text)}
.v4-btn-danger{background:transparent;border-color:var(--v4-danger);color:var(--v4-danger)}
.v4-btn-danger:hover{background:color-mix(in srgb, var(--v4-danger) 12%, transparent)}
.v4-btn-sm{height:26px;padding:0 10px;font-size:12px}
.v4-btn-icon{width:30px;height:30px;padding:0;border-radius:var(--v4-r-sm)}
.v4-tabs{display:inline-flex;gap:4px;padding:3px;border-radius:var(--v4-r-pill);background:var(--v4-surface-2);border:1px solid var(--v4-border)}
.v4-tab{height:28px;padding:0 14px;border:0;border-radius:var(--v4-r-pill);background:transparent;color:var(--v4-text-2);font-size:12px;cursor:pointer;transition:background var(--v4-dur) var(--v4-ease),color var(--v4-dur) var(--v4-ease)}
.v4-tab[aria-selected="true"]{background:var(--v4-surface-solid);color:var(--v4-text);box-shadow:var(--v4-shadow-1)}
.v4-skeleton{height:14px;border-radius:var(--v4-r-sm);background:linear-gradient(90deg,var(--v4-border) 25%,var(--v4-surface-2) 37%,var(--v4-border) 63%);background-size:400% 100%;animation:v4-shimmer 1.2s ease infinite}
@keyframes v4-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
@media (max-width:720px){
  .v4-dash{grid-template-columns:minmax(0,1fr)!important}
  .v4-stat-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 5.2：材质系统（环境层 / L1 / L2 / L3）
 *
 * 这一轮不是调参，而是重新分层：
 *   环境  .v4-page     奶油白底 + 灰玫瑰 / 淡紫 / 沙色光斑 + 极细颗粒
 *   L1    .v4-glass-1  主面板：真实磨砂（blur 26 + saturate 1.42 + 轻微提亮）
 *   L2    .v4-glass-2  次级：更薄、更平、更少反射，只负责层级差
 *   L3    .v4-glass-3  浮层：更厚的填充 + 深度遮罩 + 单向大投影
 *
 * 四条硬规则：
 *   1. 边缘不做「一圈均匀白描边」：顶部高光、侧边半透明、底部暗边，三者不同；
 *   2. 反射只出现在顶部约 1/4，不再整块加斜向白光（深色下会把文字压到 3.6:1）；
 *   3. 卡片 hover 只改光影，绝不 transform（fixed 浮层会被关进卡片）；
 *   4. 深色是另一套值：深紫灰底、低亮度玻璃、极弱顶部高光、没有白色硬边。
 * ═══════════════════════════════════════════════════════════════════════════ */

.v4-page,
.v4-scope {
  --v4-bg-base: #ece3e2;
  --v4-env-cream: rgba(255, 248, 242, 0.58);
  --v4-env-rose: rgba(219, 158, 182, 0.48);
  --v4-env-violet: rgba(172, 160, 220, 0.42);
  --v4-env-sand: rgba(238, 214, 190, 0.32);

  /* L1：主玻璃 */
  --v4-glass-1-fill: rgba(255, 253, 252, 0.50);
  --v4-glass-1-fill: color-mix(in srgb, var(--v4-surface-solid) 52%, transparent);
  --v4-glass-1-hi: rgba(255, 255, 255, 0.30);
  --v4-glass-1-tint: rgba(255, 246, 250, 0.12);
  --v4-glass-1-rim: rgba(255, 255, 255, 0.40);
  --v4-glass-1-rim-strong: rgba(255, 255, 255, 0.66);
  --v4-glass-1-edge: rgba(255, 255, 255, 0.88);
  --v4-glass-1-edge-b: rgba(110, 74, 100, 0.14);
  --v4-glass-1-ring: rgba(120, 88, 110, 0.045);
  --v4-glass-1-shadow: 0 36px 80px -46px rgba(72, 44, 66, 0.50),
                       0 12px 24px -18px rgba(72, 44, 66, 0.18),
                       0 2px 6px -3px rgba(72, 44, 66, 0.08);

  /* L2：次级玻璃 */
  --v4-glass-2-fill: rgba(255, 253, 252, 0.36);
  --v4-glass-2-fill: color-mix(in srgb, var(--v4-surface-solid) 38%, transparent);
  --v4-glass-2-hi: rgba(255, 255, 255, 0.22);
  --v4-glass-2-rim: rgba(255, 255, 255, 0.26);
  --v4-glass-2-edge-b: rgba(110, 74, 100, 0.10);
  --v4-glass-2-ring: rgba(120, 88, 110, 0.035);
  --v4-glass-2-shadow: 0 16px 40px -38px rgba(72, 44, 66, 0.30),
                       0 3px 10px -9px rgba(72, 44, 66, 0.10);

  /* L3：浮层 */
  --v4-glass-3-fill: rgba(253, 250, 250, 0.90);
  --v4-glass-3-fill: color-mix(in srgb, var(--v4-surface-solid) 92%, transparent);
  --v4-glass-3-rim: rgba(255, 255, 255, 0.60);
  --v4-glass-3-edge: rgba(255, 255, 255, 0.80);
  --v4-glass-3-edge-b: rgba(96, 62, 88, 0.16);
  --v4-glass-3-shadow: 0 48px 96px -44px rgba(44, 26, 40, 0.58),
                       0 4px 14px -6px rgba(44, 26, 40, 0.22);
  --v4-scrim: rgba(46, 32, 44, 0.26);

  --v4-inset-fill: rgba(255, 255, 255, 0.32);
  --v4-inset-fill: color-mix(in srgb, var(--v4-surface-solid) 36%, transparent);
  --v4-inset-rim: rgba(120, 88, 110, 0.11);
  --v4-hairline: rgba(120, 88, 110, 0.10);
  --v4-row-hover: rgba(255, 255, 255, 0.38);

  --v4-blur-1: blur(26px) saturate(1.42) brightness(1.02);
  --v4-blur-2: blur(16px) saturate(1.26);
  --v4-blur-3: blur(40px) saturate(1.45);
}

/* ── 环境层：让玻璃有东西可以折射，但不抢注意力 ─────────────────────────── */
.v4-page {
  position: relative;
  isolation: isolate;
  border-radius: var(--v4-r-lg);
  background-color: var(--v4-bg-base);
  background-image:
    radial-gradient(880px 660px at 4% -10%, var(--v4-env-cream), transparent 68%),
    radial-gradient(900px 700px at 94% -8%, var(--v4-env-violet), transparent 70%),
    radial-gradient(760px 620px at 26% 38%, var(--v4-env-rose), transparent 74%),
    radial-gradient(820px 640px at 76% 58%, var(--v4-env-violet), transparent 76%),
    radial-gradient(860px 620px at 104% 100%, var(--v4-env-rose), transparent 78%),
    radial-gradient(720px 520px at 6% 98%, var(--v4-env-sand), transparent 80%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.30), rgba(255, 255, 255, 0) 24%);
  background-repeat: no-repeat;
  background-attachment: scroll;
}

/* 旧环境层已废弃（28px blur 既贵又看不出） */
.v4-page::before {
  content: none;
}

/* 颗粒：给玻璃一点可折射的细节，同时压住大面积渐变的色带 */
.v4-page::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.22;
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ── L1 主玻璃 ──────────────────────────────────────────────────────────── */
.v4-page .v4-glass-1 {
  position: relative;
  background-color: var(--v4-glass-1-fill);
  background-image:
    radial-gradient(120% 60% at 14% -18%, var(--v4-glass-1-hi), transparent 56%),
    radial-gradient(70% 42% at 100% -6%, rgba(255, 255, 255, 0.14), transparent 62%),
    linear-gradient(172deg, var(--v4-glass-1-tint), transparent 44%, rgba(219, 166, 186, 0.06) 100%);
  backdrop-filter: var(--v4-blur-1);
  -webkit-backdrop-filter: var(--v4-blur-1);
  border: 1px solid var(--v4-glass-1-rim);
  border-bottom-color: var(--v4-glass-1-edge-b);
  border-radius: var(--v4-r-lg);
  box-shadow:
    inset 0 1px 0 var(--v4-glass-1-edge),
    inset 0 -22px 26px -26px rgba(110, 74, 100, 0.22),
    0 0 0 1px var(--v4-glass-1-ring),
    var(--v4-glass-1-shadow);
  transition:
    box-shadow var(--v4-dur) var(--v4-ease),
    border-color var(--v4-dur) var(--v4-ease),
    background-color var(--v4-dur) var(--v4-ease);
}

/* hover 只加强顶部高光与投影，不移动盒子 */
.v4-page .v4-glass-1:hover {
  border-top-color: var(--v4-glass-1-rim-strong);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.96),
    inset 0 -22px 26px -26px rgba(110, 74, 100, 0.22),
    0 0 0 1px var(--v4-glass-1-ring),
    0 40px 86px -44px rgba(72, 44, 66, 0.54),
    0 14px 30px -20px rgba(72, 44, 66, 0.20);
}

/* ── L2 次级玻璃：更薄更平，不抢焦点 ───────────────────────────────────── */
.v4-page .v4-glass-2 {
  position: relative;
  background-color: var(--v4-glass-2-fill);
  background-image:
    radial-gradient(110% 54% at 10% -20%, var(--v4-glass-2-hi), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 42%);
  backdrop-filter: var(--v4-blur-2);
  -webkit-backdrop-filter: var(--v4-blur-2);
  border: 1px solid var(--v4-glass-2-rim);
  border-bottom-color: var(--v4-glass-2-edge-b);
  border-radius: var(--v4-r-md);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.46),
    0 0 0 1px var(--v4-glass-2-ring),
    var(--v4-glass-2-shadow);
  transition: box-shadow var(--v4-dur) var(--v4-ease), border-color var(--v4-dur) var(--v4-ease);
}

.v4-page .v4-glass-2:hover {
  border-color: var(--v4-glass-2-rim);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.56),
    0 0 0 1px var(--v4-glass-2-ring),
    0 20px 46px -36px rgba(72, 44, 66, 0.34),
    0 4px 12px -10px rgba(72, 44, 66, 0.12);
}

/* ── L3 浮层：与普通卡片必须一眼能区分 ─────────────────────────────────── */
.v4-glass-3 {
  background-color: var(--v4-glass-3-fill);
  backdrop-filter: var(--v4-blur-3);
  -webkit-backdrop-filter: var(--v4-blur-3);
  border: 1px solid var(--v4-glass-3-rim);
  border-bottom-color: var(--v4-glass-3-edge-b);
  box-shadow:
    inset 0 1px 0 var(--v4-glass-3-edge),
    var(--v4-glass-3-shadow);
}

/* 表单 / 统计带这类「主角」面板：顶部一条极淡的强调光线 */
.v4-page .v4-glass-elevated::before {
  content: "";
  position: absolute;
  inset: 0 22% auto 22%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--v4-accent), transparent);
  opacity: 0.22;
  pointer-events: none;
}

/* 页面切换：200ms 淡入，不位移布局 */
@keyframes v4-page-in {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: none; }
}

.v4-page .v4-tasks,
.v4-page .v4-dashboard {
  animation: v4-page-in 200ms var(--v4-ease) both;
}

/* ── 卡片头 ─────────────────────────────────────────────────────────────── */
.v4-card-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.v4-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.v4-card-meta {
  font-size: 11px;
  color: var(--v4-text-2);
}

/* ── 统计带：一块玻璃，四格发丝分隔 ─────────────────────────────────────── */
.v4-stat-shelf {
  margin-bottom: var(--v4-s4);
  overflow: hidden;
}

.v4-stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.v4-stat {
  min-width: 0;
  padding: var(--v4-s4);
  border-left: 1px solid var(--v4-hairline);
  font: inherit;
  color: inherit;
  text-align: left;
  background: transparent;
  border-radius: 0;
}

.v4-stat:first-child {
  border-left: 0;
}

/* 可点的指标：hover 出现底色，右上角出现「详情 →」，其余情况保持静态外观 */
.v4-stat-button {
  position: relative;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  cursor: pointer;
  transition: background-color var(--v4-dur) var(--v4-ease);
}

.v4-stat-button:hover {
  background: var(--v4-row-hover);
}

.v4-stat-button:active {
  background: rgba(255, 255, 255, 0.52);
}

.v4-stat-button:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: -2px;
}

.v4-stat-more {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 10.5px;
  color: var(--v4-accent);
  opacity: 0;
  transition: opacity var(--v4-dur) var(--v4-ease);
}

.v4-stat-button:hover .v4-stat-more,
.v4-stat-button:focus-visible .v4-stat-more {
  opacity: 1;
}

.v4-stat-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.v4-stat-label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--v4-text-3);
}

.v4-stat-value {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.v4-stat-unit {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 400;
  color: var(--v4-text-3);
}

.v4-stat-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--v4-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 视图切换残留 / 嵌入面 ──────────────────────────────────────────────── */
.v4-page .v4-tabs {
  background: var(--v4-inset-fill);
  border-color: var(--v4-hairline);
  box-shadow: inset 0 1px 2px rgba(60, 38, 56, 0.06);
}

.v4-page .v4-tab[aria-selected="true"] {
  box-shadow: 0 1px 2px rgba(60, 38, 56, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

/* ── 深色：另一套材质，不是把浅色翻黑 ───────────────────────────────────── */
body[data-ds-dark-theme] .v4-page,
body[data-ds-dark-theme] .v4-scope {
  --v4-bg-base: #15131a;
  --v4-env-cream: rgba(126, 104, 118, 0.16);
  --v4-env-rose: rgba(120, 64, 86, 0.40);
  --v4-env-violet: rgba(88, 74, 138, 0.42);
  --v4-env-sand: rgba(96, 78, 58, 0.18);

  --v4-glass-1-fill: rgba(45, 41, 56, 0.62);
  --v4-glass-1-fill: color-mix(in srgb, #2d2938 62%, transparent);
  --v4-glass-1-hi: rgba(255, 255, 255, 0.09);
  --v4-glass-1-tint: rgba(196, 160, 190, 0.035);
  --v4-glass-1-rim: rgba(255, 255, 255, 0.12);
  --v4-glass-1-rim-strong: rgba(255, 255, 255, 0.20);
  --v4-glass-1-edge: rgba(255, 255, 255, 0.14);
  --v4-glass-1-edge-b: rgba(0, 0, 0, 0.26);
  --v4-glass-1-ring: rgba(0, 0, 0, 0.40);
  --v4-glass-1-shadow: 0 34px 78px -50px rgba(0, 0, 0, 0.92),
                       0 12px 26px -20px rgba(0, 0, 0, 0.50);

  --v4-glass-2-fill: rgba(32, 29, 40, 0.50);
  --v4-glass-2-fill: color-mix(in srgb, #201d28 50%, transparent);
  --v4-glass-2-hi: rgba(255, 255, 255, 0.055);
  --v4-glass-2-rim: rgba(255, 255, 255, 0.09);
  --v4-glass-2-edge-b: rgba(0, 0, 0, 0.22);
  --v4-glass-2-ring: rgba(0, 0, 0, 0.32);
  --v4-glass-2-shadow: 0 18px 44px -38px rgba(0, 0, 0, 0.88),
                       0 4px 12px -10px rgba(0, 0, 0, 0.42);

  --v4-glass-3-fill: rgba(34, 30, 43, 0.96);
  --v4-glass-3-fill: color-mix(in srgb, #221e2b 96%, transparent);
  --v4-glass-3-rim: rgba(255, 255, 255, 0.14);
  --v4-glass-3-edge: rgba(255, 255, 255, 0.12);
  --v4-glass-3-edge-b: rgba(0, 0, 0, 0.40);
  --v4-glass-3-shadow: 0 48px 100px -46px rgba(0, 0, 0, 1),
                       0 4px 16px -6px rgba(0, 0, 0, 0.55);
  --v4-scrim: rgba(8, 6, 12, 0.58);

  --v4-inset-fill: rgba(255, 255, 255, 0.06);
  --v4-inset-rim: rgba(255, 255, 255, 0.13);
  --v4-hairline: rgba(255, 255, 255, 0.09);
  --v4-row-hover: rgba(255, 255, 255, 0.055);
  --v4-danger: #d98a89;
  --v4-text-3: #a8a6b0;
  --v4-text-2: #b6b4be;
}

body[data-ds-dark-theme] .v4-page {
  background-image:
    radial-gradient(1000px 620px at 2% -12%, var(--v4-env-cream), transparent 70%),
    radial-gradient(880px 560px at 100% -8%, var(--v4-env-violet), transparent 72%),
    radial-gradient(900px 620px at 88% 92%, var(--v4-env-violet), transparent 76%),
    radial-gradient(780px 540px at 10% 88%, var(--v4-env-rose), transparent 78%),
    radial-gradient(760px 520px at 56% 48%, rgba(88, 72, 134, 0.20), transparent 80%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0) 30%);
}

/* 深色不吃浅色那层斜向反光：会把卡片顶部抬亮，压掉 11px 文字的对比 */
body[data-ds-dark-theme] .v4-page .v4-glass-1 {
  background-image:
    radial-gradient(120% 58% at 14% -18%, var(--v4-glass-1-hi), transparent 58%),
    radial-gradient(70% 40% at 100% -8%, rgba(255, 255, 255, 0.035), transparent 64%),
    linear-gradient(172deg, var(--v4-glass-1-tint), transparent 46%, rgba(219, 166, 186, 0.03) 100%);
}

body[data-ds-dark-theme] .v4-page .v4-glass-2 {
  background-image:
    radial-gradient(110% 52% at 10% -20%, var(--v4-glass-2-hi), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 44%);
}

body[data-ds-dark-theme] .v4-page .v4-glass-1:hover {
  border-top-color: var(--v4-glass-1-rim-strong);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -22px 26px -26px rgba(0, 0, 0, 0.30),
    0 0 0 1px var(--v4-glass-1-ring),
    0 38px 86px -50px rgba(0, 0, 0, 1),
    0 14px 30px -20px rgba(0, 0, 0, 0.55);
}

body[data-ds-dark-theme] .v4-page .v4-glass-2:hover {
  border-color: var(--v4-glass-1-rim);
}

body[data-ds-dark-theme] .v4-page .v4-stat-button:active {
  background: rgba(255, 255, 255, 0.09);
}

/* ── 回退：没有 backdrop-filter 时用实色，不假装透明 ───────────────────── */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .v4-page .v4-glass-1,
  .v4-page .v4-glass-2,
  .v4-glass-3 {
    background-image: none;
    background-color: var(--v4-surface-solid);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .v4-overlay {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

/* ── 浮层宿主：抽屉 / 弹层共用一层遮罩 ──────────────────────────────────── */
@keyframes v4-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes v4-drawer-in {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: none; }
}

@keyframes v4-modal-in {
  from { opacity: 0; transform: translateY(6px) scale(0.994); }
  to   { opacity: 1; transform: none; }
}

.v4-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  background: var(--v4-scrim);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  animation: v4-fade-in 180ms var(--v4-ease) both;
}

.v4-drawer {
  display: flex;
  flex-direction: column;
  width: min(440px, 100%);
  height: 100%;
  margin-left: auto;
  border-radius: var(--v4-r-lg) 0 0 var(--v4-r-lg);
  animation: v4-drawer-in 200ms var(--v4-ease) both;
}

.v4-drawer-head,
.v4-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--v4-hairline);
}

.v4-drawer-title {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.v4-drawer-title h2,
.v4-modal-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.v4-drawer-kind {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--v4-accent);
}

.v4-drawer-note {
  font-size: 11.5px;
  color: var(--v4-text-3);
}

.v4-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 16px 18px 24px;
}

.v4-close {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--v4-text-3);
  font-size: 12px;
  cursor: pointer;
  transition: background-color var(--v4-dur) var(--v4-ease), color var(--v4-dur) var(--v4-ease);
}

.v4-close:hover {
  background: var(--v4-row-hover);
  color: var(--v4-text);
}

.v4-close:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 1px;
}

.v4-modal {
  width: min(520px, calc(100% - 32px));
  max-height: min(86vh, 720px);
  margin: auto;
  display: flex;
  flex-direction: column;
  border-radius: var(--v4-r-lg);
  animation: v4-modal-in 180ms var(--v4-ease) both;
}

.v4-modal-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 14px 18px 18px;
}

@media (max-width: 1180px) {
  .v4-page .v4-stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .v4-page .v4-dash {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .v4-stat:nth-child(odd) {
    border-left: 0;
  }
  .v4-stat:nth-child(n + 3) {
    border-top: 1px solid var(--v4-hairline);
  }
}

@media (max-width: 720px) {
  .v4-page .osb-hero-desc {
    overflow-wrap: anywhere;
  }
  .v4-page .osb-hero {
    padding-bottom: var(--v4-s3);
  }
}

/* V4 tabs：hover / focus / active */
.v4-tab:hover{background:var(--v4-surface-1);color:var(--v4-text)}
.v4-tab:active{transform:scale(.985)}
.v4-tab:focus-visible{outline:2px solid var(--v4-accent);outline-offset:2px}


/* ── V4 Tasks ── */
.v4-tasks{display:grid;gap:var(--v4-s4)}
.v4-tasks-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.v4-task-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.v4-task-field{display:grid;gap:4px;font-size:11px;color:var(--v4-text-3);min-width:0}
.v4-task-field-wide{grid-column:1/-1}
.v4-field{height:32px;padding:0 10px;border-radius:var(--v4-r-sm);border:1px solid var(--v4-border);background:var(--v4-surface-2);color:var(--v4-text);font:inherit;font-size:12px;min-width:0;max-width:100%}
.v4-field:focus-visible{outline:2px solid var(--v4-accent);outline-offset:1px}
.v4-task-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.v4-task-error{margin:8px 0 0;font-size:12px;color:var(--v4-danger)}
.v4-task-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px}
.v4-task-toolbar .v4-field{flex:0 1 auto;min-width:120px}
.v4-task-segments{display:inline-flex;gap:2px;padding:3px;border-radius:var(--v4-r-pill);background:var(--v4-surface-2);border:1px solid var(--v4-border)}
.v4-segment{height:24px;padding:0 10px;border:0;border-radius:var(--v4-r-pill);background:transparent;color:var(--v4-text-2);font-size:11px;cursor:pointer}
.v4-segment.is-active{background:var(--v4-surface-solid);color:var(--v4-text);box-shadow:var(--v4-shadow-1)}
.v4-task-list{list-style:none;margin:0;padding:0}
.v4-task-row{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--v4-border);min-width:0}
.v4-task-row:first-child{border-top:0}
.v4-task-check{width:20px;height:20px;margin-top:2px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;border:1px solid var(--v4-border-strong);background:transparent;color:var(--dsw-alias-label-primary-inverted, #fff);font-size:11px;cursor:pointer}
.v4-task-check.is-done{background:var(--v4-accent);border-color:transparent}
.v4-task-main{flex:1;min-width:0}
.v4-task-title{margin:0;font-size:13px;font-weight:500;overflow-wrap:anywhere}
.v4-task-title.is-done{color:var(--v4-text-3);text-decoration:line-through}
.v4-task-meta{display:flex;flex-wrap:wrap;gap:8px;margin:3px 0 0;font-size:11px;color:var(--v4-text-3)}
.v4-priority{font-weight:500}
.v4-priority.is-urgent{color:var(--v4-danger)}
.v4-priority.is-important{color:var(--v4-warn)}
.v4-task-overdue{color:var(--v4-danger)}
.v4-task-note{margin:4px 0 0;font-size:11px;color:var(--v4-text-2);overflow-wrap:anywhere}
.v4-task-actions{display:flex;gap:2px;align-items:flex-start;flex:0 0 auto}
.v4-task-confirm{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--v4-danger)}
@media (max-width:900px){.v4-task-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){
  .v4-task-form{grid-template-columns:minmax(0,1fr)}
  .v4-task-field-wide{grid-column:span 1}
  .v4-task-row{flex-wrap:nowrap}
  .v4-task-actions{width:auto;justify-content:flex-end}
  .v4-task-tools .v4-field{flex:1 1 120px}
}


/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 5.1.2：Tasks 材质细化
 *   工具条是一条带发丝分隔的「面」，不是又一张白卡；
 *   列表行用 hover 底色 + 分隔线连成整体，不给每行加玻璃。
 * ═══════════════════════════════════════════════════════════════════════════ */
.v4-page .v4-task-toolbar {
  padding-bottom: var(--v4-s3);
  margin-bottom: var(--v4-s2);
  border-bottom: 1px solid var(--v4-hairline);
}

.v4-page .v4-field {
  background: var(--v4-inset-fill);
  border-color: var(--v4-inset-rim);
  box-shadow: inset 0 1px 2px rgba(60, 38, 56, 0.06);
  transition:
    border-color var(--v4-dur) var(--v4-ease),
    background-color var(--v4-dur) var(--v4-ease),
    box-shadow var(--v4-dur) var(--v4-ease);
}

.v4-page .v4-field:hover {
  border-color: var(--v4-border-strong);
}

.v4-page .v4-field:focus,
.v4-page .v4-field:focus-visible {
  outline: none;
  border-color: var(--v4-accent);
  box-shadow: 0 0 0 3px var(--v4-accent-soft);
}

.v4-page .v4-task-segments {
  background: var(--v4-inset-fill);
  border-color: var(--v4-inset-rim);
  box-shadow: inset 0 1px 2px rgba(60, 38, 56, 0.05);
}

.v4-page .v4-segment {
  transition: background-color var(--v4-dur) var(--v4-ease), color var(--v4-dur) var(--v4-ease);
}

.v4-page .v4-segment.is-active {
  background: var(--v4-surface-solid);
  box-shadow: 0 1px 2px rgba(60, 38, 56, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.v4-page .v4-task-list {
  margin: 0 calc(var(--v4-s2) * -1);
}

.v4-page .v4-task-row {
  padding: 9px var(--v4-s2);
  border-top: 1px solid var(--v4-hairline);
  border-radius: 12px;
  transition: background-color var(--v4-dur) var(--v4-ease);
}

.v4-page .v4-task-row:first-child {
  border-top-color: transparent;
}

.v4-page .v4-task-row:hover {
  background: var(--v4-row-hover);
}

.v4-page .v4-task-title {
  font-size: 13.5px;
}

.v4-page .v4-task-check {
  transition:
    background-color var(--v4-dur) var(--v4-ease),
    border-color var(--v4-dur) var(--v4-ease),
    transform 90ms var(--v4-ease);
}

.v4-page .v4-task-check:active {
  transform: scale(0.94);
}

.v4-page .v4-task-confirm {
  margin-top: var(--v4-s2);
  padding: 8px 10px;
  border: 1px solid rgba(179, 96, 95, 0.20);
  border-color: color-mix(in srgb, var(--v4-danger) 22%, transparent);
  border-radius: 10px;
  background: rgba(179, 96, 95, 0.08);
  background: color-mix(in srgb, var(--v4-danger) 9%, transparent);
}

body[data-ds-dark-theme] .v4-page .v4-field:focus,
body[data-ds-dark-theme] .v4-page .v4-field:focus-visible {
  border-color: var(--v4-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--v4-accent) 24%, transparent);
}

@media (max-width: 720px) {
  .v4-page .v4-task-toolbar {
    padding-bottom: var(--v4-s2);
  }
}


/* 列表里的删除按钮：保留 danger 语义，但去掉描边药丸，避免打断列表的连续性 */
.v4-page .v4-task-actions .v4-btn-danger {
  border-color: transparent;
  background: transparent;
  color: var(--v4-danger);
}

.v4-page .v4-task-actions .v4-btn-danger:hover {
  border-color: color-mix(in srgb, var(--v4-danger) 26%, transparent);
  background: color-mix(in srgb, var(--v4-danger) 10%, transparent);
}


/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 5.1.3：工作台外壳与紧凑信息架构
 *   顶部工具栏取代 Hero；Dashboard 三层（统计带 / 主工作区 / 辅助层）。
 * ═══════════════════════════════════════════════════════════════════════════ */
.v4-shell {
  display: grid;
  gap: var(--v4-s4);
}

.v4-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-bottom: var(--v4-s3);
  border-bottom: 1px solid var(--v4-hairline);
}

.v4-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.v4-brand-mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  color: var(--v4-accent);
  background: color-mix(in srgb, var(--v4-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--v4-accent) 24%, transparent);
}

.v4-brand-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.v4-brand-title {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.v4-brand-sub {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--v4-text-3);
}

.v4-nav {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--v4-inset-fill);
  border: 1px solid var(--v4-hairline);
}

.v4-nav-item {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--v4-text-2);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--v4-dur) var(--v4-ease), color var(--v4-dur) var(--v4-ease);
}

.v4-nav-item:hover {
  background: var(--v4-row-hover);
  color: var(--v4-text);
}

.v4-nav-item.is-active {
  background: var(--v4-surface-solid);
  color: var(--v4-text);
  box-shadow: 0 1px 2px rgba(60, 38, 56, 0.10);
}

.v4-topbar-end {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.v4-project-select {
  height: 28px;
  max-width: 190px;
  padding: 0 8px;
  font-size: 12px;
}

.v4-topbar-date {
  font-size: 11px;
  color: var(--v4-text-3);
  white-space: nowrap;
}

.v4-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ── Dashboard 三层 ─────────────────────────────────────────────────────── */
.v4-dashboard {
  display: grid;
  gap: var(--v4-s4);
}

/**
 * 学习活动带（Phase 6.2）：Dashboard 里唯一横跨整行的一条。
 * \`min-width: 0\` 是关键 —— 全年热力图约 756px 宽，没有它会把这个 grid 子项
 * 撑成内容宽度，720px 下整页出现横向滚动。
 */
.v4-dash-heat {
  min-width: 0;
}

.v4-dash-heat .v4-heat {
  gap: 6px;
}

/* Dashboard 变体：图例挪到日历下方左对齐，顶部保持「干净的一行」 */
.v4-heat[data-legend='bottom'] .v4-heat-body {
  order: 1;
}

.v4-heat[data-legend='bottom'] .v4-heat-scrollhint {
  order: 2;
}

.v4-heat[data-legend='bottom'] .v4-heat-legend {
  order: 3;
  justify-content: flex-start;
  margin-top: 2px;
}

/* 左日历 / 右数字：1440 下日历只有 740px，右侧那列用来收掉空白 */
.v4-dash-heat-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 178px);
  gap: var(--v4-s4);
  align-items: start;
  min-width: 0;
}

.v4-dash-heat-chart {
  min-width: 0;
}

.v4-dash-heat-side {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.v4-dash-heat-stats {
  display: grid;
  gap: 8px;
  margin: 0;
}

.v4-dash-heat-stats > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.v4-dash-heat-stats dt {
  font-size: 11px;
  color: var(--v4-text-2);
}

.v4-dash-heat-stats dd {
  margin: 0;
  font-size: 13px;
  color: var(--v4-text);
  font-variant-numeric: tabular-nums;
}

.v4-dash-heat-stats dd span {
  margin-left: 2px;
  font-size: 10.5px;
  color: var(--v4-text-2);
}

@media (max-width: 900px) {
  .v4-dash-heat-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .v4-dash-heat-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .v4-dash-heat-stats > div {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}

.v4-heat-empty {
  margin: 0 0 8px;
  font-size: 11.5px;
  color: var(--v4-text-2);
}

.v4-dash-heat-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--v4-text-2);
}

.v4-dashboard .v4-stat-shelf {
  margin-bottom: 0;
}

.v4-dash {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: var(--v4-s4);
  align-items: start;
}

.v4-side {
  display: grid;
  gap: var(--v4-s4);
}

.v4-dash-lower {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--v4-s4);
}

.v4-today-list {
  list-style: none;
  margin: var(--v4-s3) 0 0;
  padding: 0;
}

.v4-today-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--v4-hairline);
  font-size: 13px;
  min-width: 0;
}

.v4-today-row:first-child {
  border-top: 0;
}

.v4-today-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v4-today-priority {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--v4-inset-fill);
  color: var(--v4-text-3);
  font-size: 10px;
}

.v4-today-priority.is-urgent { color: var(--v4-danger); }
.v4-today-priority.is-important { color: var(--v4-warn); }

.v4-today-due {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

.v4-today-due.is-overdue { color: var(--v4-danger); }

.v4-dash-done {
  margin: var(--v4-s3) 0 0;
  font-size: 12px;
  color: var(--v4-text-2);
}

.v4-link {
  margin-top: var(--v4-s3);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--v4-accent);
  font-size: 12px;
  cursor: pointer;
}

.v4-link:hover { text-decoration: underline; }

.v4-focus-now {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: var(--v4-s3);
}

.v4-focus-value {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.v4-focus-label {
  margin: 0;
  font-size: 11px;
  color: var(--v4-text-3);
}

.v4-focus-side { text-align: right; }

.v4-focus-week {
  margin: 0;
  font-size: 11px;
  color: var(--v4-text-3);
}

.v4-project-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.v4-project-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.v4-project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v4-project-meta {
  color: var(--v4-text-3);
  white-space: nowrap;
}

.v4-chart-foot {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--v4-text-3);
}

.v4-activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 7px;
}

.v4-activity-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}

.v4-activity-time {
  min-width: 52px;
  color: var(--v4-text-3);
  font-size: 11px;
}

.v4-activity-kind {
  flex: 0 0 auto;
  color: var(--v4-text-2);
}

.v4-activity-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Tasks：紧凑工具栏 ──────────────────────────────────────────────────── */
.v4-tasks {
  gap: 12px;
}

.v4-task-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.v4-task-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.v4-task-page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.v4-task-counts {
  margin: 0;
  font-size: 11.5px;
  color: var(--v4-text-3);
  white-space: nowrap;
}

.v4-task-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.v4-task-search {
  width: 190px;
}

.v4-task-segments {
  margin-bottom: 0;
}

.v4-composer {
  padding: 12px 14px;
}

.v4-composer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: var(--v4-s2);
}

.v4-composer-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.v4-composer-close {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--v4-text-3);
  font-size: 12px;
  cursor: pointer;
}

.v4-composer-close:hover {
  background: var(--v4-row-hover);
  color: var(--v4-text);
}

.v4-task-panel {
  padding: 12px 14px;
}

@media (max-width: 900px) {
  .v4-dash-lower {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .v4-topbar {
    gap: 8px;
  }
  .v4-topbar-end {
    width: 100%;
    margin-left: 0;
  }
  .v4-brand-sub {
    display: none;
  }
  .v4-topbar-date {
    display: none;
  }
  .v4-task-tools {
    width: 100%;
  }
  .v4-task-search {
    flex: 1 1 100%;
    width: auto;
  }
  .v4-task-tools .v4-field {
    flex: 1 1 120px;
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 5.2：统一工作台交互组件
 *   卡片内展开 / 任务行内展开 / 抽屉正文 / 可点指标
 * 只使用 \`.v4-*\`，不触碰 \`.osb-*\`；所有色值走变量，深色自动跟随。
 * ═══════════════════════════════════════════════════════════════════════════ */

.v4-shell {
  display: grid;
  gap: var(--v4-s4);
}

.v4-main {
  min-width: 0;
}

/* ── 卡片内展开（ExpandablePanel） ──────────────────────────────────────── */
.v4-expand {
  display: grid;
  min-width: 0;
}

.v4-expand-head {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 10px;
}

.v4-expand-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 2px 4px 2px 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: color var(--v4-dur) var(--v4-ease);
}

.v4-expand-toggle:hover .v4-expand-hint,
.v4-expand-toggle:focus-visible .v4-expand-hint {
  color: var(--v4-accent);
}

.v4-expand-toggle:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 3px;
}

.v4-expand-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.v4-expand-meta {
  font-size: 11px;
  color: var(--v4-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v4-expand-hint {
  margin-left: auto;
  font-size: 10.5px;
  /* 常驻可见（可发现性优先），但用次级文字色保证小字号也过 4.5:1；
     hover 时才换成强调色。 */
  color: var(--v4-text-2);
  transition: color var(--v4-dur) var(--v4-ease);
}

.v4-expand-chevron {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--v4-text-3);
  transition: transform var(--v4-dur) var(--v4-ease);
}

.v4-expand-chevron[data-open="true"] {
  transform: rotate(180deg);
}

.v4-expand-actions {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
  align-items: center;
}

.v4-expand-summary {
  min-width: 0;
}

.v4-expand-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--v4-hairline);
  animation: v4-panel-in 200ms var(--v4-ease) both;
}

@keyframes v4-panel-in {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: none; }
}

/* ── 今日任务：行内展开 ─────────────────────────────────────────────────── */
.v4-today-row {
  flex-wrap: wrap;
  gap: 8px;
}

.v4-today-row[data-open="true"] {
  background: var(--v4-row-hover);
  border-radius: 12px;
}

.v4-today-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 2px 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.v4-today-main:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

.v4-chevron {
  flex: 0 0 auto;
  font-size: 9px;
  color: var(--v4-text-3);
  transition: transform var(--v4-dur) var(--v4-ease);
}

.v4-chevron[data-open="true"] {
  transform: rotate(180deg);
}

.v4-icon-btn {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--v4-text-3);
  font-size: 12px;
  cursor: pointer;
  transition: background-color var(--v4-dur) var(--v4-ease), color var(--v4-dur) var(--v4-ease);
}

.v4-icon-btn:hover {
  background: var(--v4-inset-fill);
  color: var(--v4-text);
}

.v4-icon-btn:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 1px;
}

.v4-today-detail {
  flex: 1 0 100%;
  margin-top: 2px;
  padding: 10px 12px;
  border: 1px solid var(--v4-inset-rim);
  border-radius: 12px;
  background: var(--v4-inset-fill);
  animation: v4-panel-in 200ms var(--v4-ease) both;
}

.v4-inline-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
}

.v4-inline-facts > div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
}

.v4-inline-facts dt {
  color: var(--v4-text-3);
}

.v4-inline-facts dd {
  margin: 0;
  color: var(--v4-text-2);
  font-variant-numeric: tabular-nums;
}

.v4-inline-note {
  margin: 0 0 8px;
  font-size: 12.5px;
  line-height: 1.62;
  color: var(--v4-text-2);
  overflow-wrap: anywhere;
}

.v4-inline-note.is-muted {
  color: var(--v4-text-3);
}

.v4-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

/* ── 专注卡 / 迷你列表 / 知识概览 ───────────────────────────────────────── */
.v4-focus-foot {
  margin: 10px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--v4-border);
  font-size: 11px;
  color: var(--v4-text-2);
}

.v4-mini-table {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
}

.v4-mini-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--v4-text);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--v4-dur) var(--v4-ease);
}

.v4-mini-row:hover {
  background: var(--v4-row-hover);
}

.v4-mini-row:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: -2px;
}

.v4-mini-value {
  margin-left: auto;
  color: var(--v4-text-2);
  font-variant-numeric: tabular-nums;
}

.v4-mini-meta {
  width: 62px;
  text-align: right;
  font-size: 11px;
  color: var(--v4-text-3);
  white-space: nowrap;
}

.v4-mini-big {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.v4-mini-label {
  margin: 2px 0 0;
  font-size: 10.5px;
  color: var(--v4-text-2);
}

.v4-knowledge-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.v4-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.v4-panel-hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--v4-text-3);
}

.v4-muted {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--v4-text-3);
}

/* ── 项目 / 活动行：整行可点，但外观仍像列表 ───────────────────────────── */
.v4-project-button,
.v4-activity-button {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.v4-project-button:focus-visible,
.v4-activity-button:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

.v4-project-button:hover .v4-project-name {
  color: var(--v4-accent);
}

.v4-activity-button {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 6px;
  margin: 0 -6px;
  font-size: 12px;
  min-width: 0;
  transition: background-color var(--v4-dur) var(--v4-ease);
}

.v4-activity-button:hover {
  background: var(--v4-row-hover);
}

/* ── 任务页：行点击、hover 才出现的操作 ─────────────────────────────────── */
.v4-task-open {
  display: block;
  width: 100%;
  padding: 1px 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.v4-task-open:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

.v4-task-actions {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--v4-dur) var(--v4-ease);
}

.v4-task-row:hover .v4-task-actions,
.v4-task-row:focus-within .v4-task-actions,
.v4-task-row[data-open="true"] .v4-task-actions {
  opacity: 1;
  pointer-events: auto;
}

.v4-task-row[data-open="true"] {
  background: var(--v4-row-hover);
}

.v4-task-inline {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--v4-inset-rim);
  border-radius: 12px;
  background: var(--v4-inset-fill);
  animation: v4-panel-in 200ms var(--v4-ease) both;
}

.v4-task-row .v4-task-confirm {
  margin-top: 8px;
}

.v4-composer-card {
  padding: 12px 14px;
}

/* 焦点可见：列表里的 checkbox 同样要看得见 */
.v4-task-check:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

/* 折线点击区 */
.v4-spark-hit {
  cursor: pointer;
}

.v4-spark-hit:focus-visible {
  outline: none;
  stroke: var(--v4-accent);
  stroke-width: 1.5;
}

/* ── 抽屉正文 ───────────────────────────────────────────────────────────── */
.v4-detail {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.v4-detail-title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.v4-detail-title.is-done {
  color: var(--v4-text-3);
  text-decoration: line-through;
}

.v4-detail-big {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.v4-detail-muted {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--v4-text-3);
}

.v4-detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin: 0;
}

.v4-detail-facts > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.v4-detail-facts dt {
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--v4-text-3);
}

.v4-detail-facts dd {
  margin: 0;
  font-size: 12.5px;
  color: var(--v4-text-2);
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.v4-detail-note {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--v4-inset-rim);
  border-radius: 10px;
  background: var(--v4-inset-fill);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--v4-text-2);
  overflow-wrap: anywhere;
}

.v4-detail-subhead {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--v4-text-2);
}

.v4-detail-list,
.v4-detail-sublist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.v4-detail-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.55;
}

.v4-detail-list li > span:nth-child(2) {
  min-width: 0;
  overflow-wrap: anywhere;
}

.v4-detail-list-time {
  flex: 0 0 auto;
  min-width: 48px;
  font-size: 11px;
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

.v4-detail-list-tail {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

.v4-detail-sublist li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  color: var(--v4-text-2);
}

.v4-detail-sublist li[data-done="true"] {
  color: var(--v4-text-3);
  text-decoration: line-through;
}

.v4-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.v4-detail-confirm {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--v4-danger) 24%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--v4-danger) 9%, transparent);
  font-size: 11.5px;
  color: var(--v4-danger);
}

.v4-detail-hint {
  margin: 2px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--v4-hairline);
  font-size: 11px;
  line-height: 1.65;
  color: var(--v4-text-3);
}

.v4-detail-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--v4-text-3);
}

.v4-detail-roadmap {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.v4-detail-roadmap li {
  display: grid;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--v4-hairline);
}

.v4-detail-roadmap li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.v4-detail-roadmap-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 600;
}

.v4-detail-roadmap p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--v4-text-3);
}

.v4-detail-roadmap-target {
  color: var(--v4-text-2) !important;
}

.v4-detail-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  background: var(--v4-inset-fill);
  color: var(--v4-text-3);
}

.v4-detail-badge[data-state="now"] {
  color: var(--v4-ok);
  background: color-mix(in srgb, var(--v4-ok) 14%, transparent);
}

.v4-detail-badge[data-state="next"] {
  color: var(--v4-warn);
  background: color-mix(in srgb, var(--v4-warn) 16%, transparent);
}

/* ── 布局：三列辅助层 ───────────────────────────────────────────────────── */
.v4-dash-lower {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 1180px) {
  .v4-dash-lower {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .v4-dash-lower > :last-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 900px) {
  .v4-dash-lower {
    grid-template-columns: minmax(0, 1fr);
  }
  .v4-dash-lower > :last-child {
    grid-column: auto;
  }
}

/* 抽屉 / 弹层在小屏铺满 */
@media (max-width: 720px) {
  .v4-drawer {
    width: 100%;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }
  .v4-drawer-head {
    padding: 14px 14px 10px;
  }
  .v4-drawer-body {
    padding: 14px 14px 22px;
  }
  .v4-modal {
    width: calc(100% - 20px);
    max-height: 90vh;
  }
  .v4-expand-hint {
    display: none;
  }
  .v4-knowledge-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .v4-mini-meta {
    width: 54px;
  }
  .v4-detail-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* 窄屏抽屉铺满后，正文不要拉成整屏长行 */
  .v4-detail {
    max-width: 560px;
  }
}

@media (max-width: 1100px) and (min-width: 901px) {
  .v4-dash-lower > :last-child {
    grid-column: 1 / -1;
  }
}

/* 按压反馈比 hover 更快：90ms 能感觉到「按下去」，160ms 会显得迟钝 */
.v4-page .v4-btn:active,
.v4-page .v4-segment:active,
.v4-page .v4-stat-button:active,
.v4-page .v4-nav-item:active,
.v4-page .v4-task-check:active {
  transition-duration: 90ms;
}


/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 5.3：设置 · 数据页
 *   导出 / 导入预览 / 危险确认 / 存储观测
 * 全部复用 L1/L2/L3 与既有控件，不引入新的材质层级。
 * ═══════════════════════════════════════════════════════════════════════════ */

.v4-settings {
  display: grid;
  gap: var(--v4-s4);
  max-width: 1040px;
  margin: 0 auto;
  width: 100%;
}

.v4-settings-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

/* 概览：十个小格子，标签在上、数字在下 */
.v4-data-counts {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px 14px;
  margin: 0;
}

.v4-data-counts > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--v4-hairline);
  border-radius: 10px;
  background: var(--v4-inset-fill);
}

.v4-data-counts dt {
  font-size: 10.5px;
  color: var(--v4-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.v4-data-counts dd {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.v4-data-counts.is-compact {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.v4-data-counts.is-compact > div {
  padding: 6px 8px;
}

.v4-data-counts.is-compact dd {
  font-size: 14px;
}

/* 存储 */
.v4-data-storage {
  display: grid;
  gap: 10px;
}

.v4-data-storage-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.v4-data-big {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.v4-data-label {
  margin: 2px 0 0;
  font-size: 10.5px;
  color: var(--v4-text-3);
}

.v4-data-storage-side {
  text-align: right;
  flex: 0 0 auto;
}

.v4-data-value {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.v4-data-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--v4-text-2);
}

.v4-data-faint {
  font-size: 11px;
  color: var(--v4-text-3);
  line-height: 1.6;
}

.v4-data-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 0;
}

.v4-data-facts > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.v4-data-facts dt {
  font-size: 10.5px;
  color: var(--v4-text-3);
}

.v4-data-facts dd {
  margin: 0;
  font-size: 12.5px;
  color: var(--v4-text-2);
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.v4-data-ok {
  font-size: 11.5px;
  color: var(--v4-ok);
}

.v4-data-bad {
  color: var(--v4-danger);
}

.v4-data-warn {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--v4-warn) 30%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--v4-warn) 12%, transparent);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--v4-text-2);
}

.v4-data-details {
  border-top: 1px solid var(--v4-hairline);
  padding-top: 8px;
}

.v4-data-details summary {
  font-size: 11.5px;
  color: var(--v4-text-2);
  cursor: pointer;
}

.v4-data-keys {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 18px;
}

.v4-data-keys li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11.5px;
  min-width: 0;
}

.v4-data-key {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--v4-text-2);
}

.v4-data-keyval {
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

.v4-data-keyshare {
  width: 34px;
  text-align: right;
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

/* 行 / 状态 / 结果 */
.v4-data-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.v4-data-status {
  margin: 0;
  font-size: 12px;
  color: var(--v4-text-2);
}

.v4-data-status::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--v4-accent);
  animation: v4-pulse 1.2s var(--v4-ease) infinite;
}

@keyframes v4-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.v4-data-result {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--v4-inset-rim);
  border-radius: 10px;
  background: var(--v4-inset-fill);
}

.v4-data-result[data-ok="true"] {
  border-color: color-mix(in srgb, var(--v4-ok) 34%, transparent);
  background: color-mix(in srgb, var(--v4-ok) 10%, transparent);
}

.v4-data-result[data-ok="false"] {
  border-color: color-mix(in srgb, var(--v4-danger) 34%, transparent);
  background: color-mix(in srgb, var(--v4-danger) 10%, transparent);
}

.v4-data-result-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.v4-data-result-body {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--v4-text-2);
  overflow-wrap: anywhere;
}

/* 导入：来源、对比表、确认 */
.v4-data-import {
  display: grid;
  gap: 12px;
}

.v4-data-file {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.v4-data-source {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--v4-inset-rim);
  border-radius: 12px;
  background: var(--v4-inset-fill);
}

.v4-data-source-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.v4-data-source-name {
  font-size: 12.5px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.v4-data-preview {
  overflow-x: auto;
}

.v4-data-preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 360px;
}

.v4-data-preview th,
.v4-data-preview td {
  padding: 6px 8px;
  text-align: right;
  border-bottom: 1px solid var(--v4-hairline);
  font-variant-numeric: tabular-nums;
}

.v4-data-preview thead th {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--v4-text-3);
}

.v4-data-preview tbody th[scope="row"] {
  text-align: left;
  font-weight: 500;
  color: var(--v4-text-2);
}

.v4-data-confirm {
  display: grid;
  gap: 8px;
}

.v4-data-danger {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--v4-danger) 32%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--v4-danger) 8%, transparent);
}

.v4-data-danger-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--v4-danger);
}

.v4-data-danger-body {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--v4-text-2);
}

.v4-data-ack {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--v4-text-2);
  cursor: pointer;
}

.v4-data-ack input {
  margin: 2px 0 0;
  flex: 0 0 auto;
  accent-color: var(--v4-danger);
}

.v4-data-limits {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--v4-text-2);
}

.v4-segment.is-danger {
  color: var(--v4-danger);
}

.v4-segment.is-danger.is-active {
  color: var(--v4-danger);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--v4-danger) 40%, transparent);
}

@media (max-width: 900px) {
  .v4-data-counts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .v4-data-counts.is-compact {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .v4-settings {
    max-width: none;
  }
  .v4-data-counts,
  .v4-data-counts.is-compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .v4-data-keys {
    grid-template-columns: minmax(0, 1fr);
  }
  .v4-data-facts {
    grid-template-columns: minmax(0, 1fr);
  }
  .v4-data-storage-head {
    align-items: flex-start;
  }
}

/* 设置页副标题与任务页计数共用；在浅色玻璃上 text-3 只有 4.43:1 */
.v4-page .v4-task-counts {
  color: var(--v4-text-2);
}

/* 覆盖模式选中时给一点红色底，避免「按下没反应」的错觉 */
.v4-segment.is-danger.is-active {
  background: color-mix(in srgb, var(--v4-danger) 14%, var(--v4-surface-solid));
}


/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 5.4：历史活动页与年度热力图
 *   低饱和玫瑰色阶；0 档是「空」，不是深色块。
 * ═══════════════════════════════════════════════════════════════════════════ */

.v4-history {
  display: grid;
  gap: var(--v4-s4);
  max-width: 1040px;
  margin: 0 auto;
  width: 100%;
}

.v4-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.v4-history-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.v4-history-scope {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--v4-warn) 28%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--v4-warn) 10%, transparent);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--v4-text-2);
}

/* 统计带：一块 L2 面上的四格 */
.v4-history-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--v4-hairline);
  border-radius: var(--v4-r-md);
  background: var(--v4-hairline);
}

.v4-history-stat {
  min-width: 0;
  padding: 12px 14px;
  background: var(--v4-inset-fill);
}

.v4-history-value {
  margin: 3px 0 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.v4-history-unit {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 400;
  color: var(--v4-text-3);
}

.v4-history-hint {
  margin: 5px 0 0;
  font-size: 10.5px;
  color: var(--v4-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 热力图 ─────────────────────────────────────────────────────────────── */
/**
 * 调色板挂在 \`.v4-heat\` 自己身上（Phase 6.2）：History 与 Dashboard 用的是同一个
 * 组件，变量必须跟着组件走，不能挂在某个页面容器上 —— 否则换一个宿主页面就掉色。
 */
.v4-heat {
  --v4-heat-0: rgba(120, 88, 110, 0.09);
  --v4-heat-1: #f0dae1;
  --v4-heat-2: #e0b8c6;
  --v4-heat-3: #c48da3;
  --v4-heat-4: #96607a;
  --v4-heat-today: rgba(124, 100, 116, 0.55);
}

body[data-ds-dark-theme] .v4-heat {
  --v4-heat-0: rgba(255, 255, 255, 0.06);
  --v4-heat-1: rgba(201, 143, 163, 0.24);
  --v4-heat-2: rgba(201, 143, 163, 0.44);
  --v4-heat-3: rgba(206, 150, 170, 0.64);
  --v4-heat-4: rgba(214, 160, 180, 0.86);
  --v4-heat-today: rgba(255, 255, 255, 0.55);
}

.v4-heat {
  position: relative;
  display: grid;
  gap: 8px;
}

.v4-heat-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 10.5px;
  color: var(--v4-text-3);
}

.v4-heat-legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid transparent;
}

.v4-heat-legend i[data-level="0"] { background: var(--v4-heat-0); }
.v4-heat-legend i[data-level="1"] { background: var(--v4-heat-1); }
.v4-heat-legend i[data-level="2"] { background: var(--v4-heat-2); }
.v4-heat-legend i[data-level="3"] { background: var(--v4-heat-3); }
.v4-heat-legend i[data-level="4"] { background: var(--v4-heat-4); }

.v4-heat-body {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.v4-heat-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 2px;
  flex: 0 0 auto;
  padding-top: 18px;
  font-size: 9.5px;
  line-height: 12px;
  color: var(--v4-text-3);
}

.v4-heat-weekdays span:nth-child(1) { grid-row: 1; }
.v4-heat-weekdays span:nth-child(2) { grid-row: 3; }
.v4-heat-weekdays span:nth-child(3) { grid-row: 5; }

.v4-heat-scroll {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--v4-border-strong) transparent;
}

/* 细滚动条：默认的浅色滚动条在深色玻璃上非常刺眼 */
.v4-heat-scroll::-webkit-scrollbar {
  height: 6px;
}

.v4-heat-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.v4-heat-scroll::-webkit-scrollbar-thumb {
  background: var(--v4-border-strong);
  border-radius: 999px;
}

.v4-heat-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--v4-text-3);
}

.v4-heat-scrollhint {
  display: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--v4-text-3);
}

.v4-heat-months {
  display: grid;
  gap: 2px;
  height: 16px;
  font-size: 9.5px;
  color: var(--v4-text-3);
  white-space: nowrap;
}

.v4-heat-months span {
  grid-row: 1;
  overflow: visible;
}

.v4-heat-grid {
  display: flex;
  gap: 2px;
  width: max-content;
}

.v4-heat-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.v4-heat-cell {
  width: 12px;
  height: 12px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: var(--v4-heat-0);
  cursor: pointer;
  transition: transform 90ms var(--v4-ease), box-shadow var(--v4-dur) var(--v4-ease), background-color var(--v4-dur) var(--v4-ease);
}

.v4-heat-cell[data-level="1"] { background: var(--v4-heat-1); }
.v4-heat-cell[data-level="2"] { background: var(--v4-heat-2); }
.v4-heat-cell[data-level="3"] { background: var(--v4-heat-3); }
.v4-heat-cell[data-level="4"] { background: var(--v4-heat-4); }

.v4-heat-cell:hover {
  box-shadow: 0 0 0 1px var(--v4-accent), 0 0 0 3px var(--v4-accent-soft);
}

.v4-heat-cell:active {
  transform: scale(0.9);
}

.v4-heat-cell:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 1px;
}

.v4-heat-cell.is-today {
  box-shadow: inset 0 0 0 1.5px var(--v4-heat-today);
}

.v4-heat-cell.is-out {
  background: transparent;
  cursor: default;
}

/* tooltip：fixed + 视口内夹取，滚动时会被清掉 */
.v4-heat-tip {
  position: fixed;
  z-index: 45;
  width: 168px;
  transform: translate(-50%, -100%);
  padding: 8px 10px;
  border: 1px solid var(--v4-glass-3-rim);
  border-radius: 10px;
  background: var(--v4-glass-3-fill);
  backdrop-filter: var(--v4-blur-3);
  -webkit-backdrop-filter: var(--v4-blur-3);
  box-shadow: var(--v4-glass-3-shadow);
  font-size: 11px;
  line-height: 1.55;
  color: var(--v4-text-2);
  pointer-events: none;
  animation: v4-tip-in 120ms var(--v4-ease) both;
}

.v4-heat-tip[data-below="true"] {
  transform: translate(-50%, 0);
}

.v4-heat-tip p {
  margin: 0;
}

.v4-heat-tip-date {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--v4-text);
}

.v4-heat-tip-level {
  margin-bottom: 2px !important;
  color: var(--v4-accent);
}

.v4-heat-tip-warn {
  margin-top: 4px !important;
  color: var(--v4-warn);
}

@keyframes v4-tip-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── 历史列表 ───────────────────────────────────────────────────────────── */
.v4-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.v4-history-group {
  padding: 8px 0;
  border-top: 1px solid var(--v4-hairline);
}

.v4-history-group:first-child {
  border-top: 0;
  padding-top: 0;
}

.v4-history-day {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  margin-left: -6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--v4-dur) var(--v4-ease);
}

.v4-history-day:hover {
  background: var(--v4-row-hover);
}

.v4-history-day:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

.v4-history-date {
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.v4-history-weekday {
  font-size: 11px;
  color: var(--v4-text-3);
}

.v4-history-count {
  font-size: 11px;
  color: var(--v4-text-2);
}

.v4-history-focus {
  font-size: 11px;
  color: var(--v4-text-3);
  margin-left: auto;
}

.v4-history-open {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--v4-accent);
  opacity: 0;
  transition: opacity var(--v4-dur) var(--v4-ease);
}

.v4-history-focus + .v4-history-open {
  margin-left: 0;
}

.v4-history-day:hover .v4-history-open,
.v4-history-day:focus-visible .v4-history-open {
  opacity: 1;
}

.v4-history-events {
  list-style: none;
  margin: 6px 0 0 10px;
  padding: 0 0 0 10px;
  border-left: 1px solid var(--v4-hairline);
  display: grid;
  gap: 4px;
}

.v4-history-events li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11.5px;
  color: var(--v4-text-2);
  min-width: 0;
}

.v4-history-time {
  flex: 0 0 auto;
  min-width: 38px;
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

.v4-history-kind {
  flex: 0 0 auto;
  color: var(--v4-text-3);
}

.v4-history-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v4-history-expand {
  margin: 4px 0 0 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--v4-accent);
  font-size: 11px;
  cursor: pointer;
}

.v4-history-expand:hover {
  text-decoration: underline;
}

.v4-history-more {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--v4-hairline);
}

@media (max-width: 900px) {
  .v4-history-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .v4-history {
    max-width: none;
  }
  .v4-heat-scroll {
    padding-bottom: 6px;
  }
  .v4-heat-scrollhint {
    display: block;
  }
  .v4-history-focus {
    display: none;
  }
  .v4-history-open {
    opacity: 1;
  }
}

/* 历史页：热力图在窄屏必须由滚动容器自己吃掉宽度，不能把页面撑开 */
.v4-history,
.v4-history > *,
.v4-heat,
.v4-heat-body {
  min-width: 0;
  max-width: 100%;
}

.v4-heat-months {
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 720px) {
  .v4-heat-body {
    overflow: hidden;
  }
}

/* 历史统计格用 inset 底，text-3 在深浅两套里都差一点（4.26–4.49） */
.v4-history-stat .v4-stat-label,
.v4-history-hint {
  color: var(--v4-text-2);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Focus（Phase 5.5）
 *
 * 三条克制：
 *   1. 倒计时用 tabular-nums + 固定 min-width，数字每秒变也不会推着按钮跳；
 *   2. 状态用「圆点 + 文字」表达，不给小字号上彩色文字（对比度会掉到 4.5 以下）；
 *   3. 只有进度条一条动画，且 linear，和 250ms 的 tick 对齐。
 * ──────────────────────────────────────────────────────────────────────────── */

.v4-focus-live {
  display: flex;
  align-items: center;
  gap: var(--v4-s4);
  flex-wrap: wrap;
  min-width: 0;
}

.v4-focus-clock-box {
  flex: 0 0 auto;
  min-width: 132px;
}

.v4-focus-clock {
  margin: 0;
  font-size: 30px;
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  /* 5 个字符（00:00）固定宽度：换秒不推布局 */
  min-width: 5.3ch;
  color: var(--v4-text);
}

.v4-focus-clock[data-status='running'] {
  color: var(--v4-accent-strong, var(--v4-text));
}

.v4-focus-clock[data-status='completed'] {
  color: var(--v4-text-2);
}

.v4-focus-track {
  height: 4px;
  margin: 8px 0 6px;
  border-radius: var(--v4-r-pill);
  background: var(--v4-border);
  overflow: hidden;
}

.v4-focus-track-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--v4-accent);
  transition: width 250ms linear;
}

.v4-focus-clock-sub {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--v4-text-2);
}

.v4-focus-clock-dot {
  opacity: 0.5;
}

.v4-focus-clock-elapsed {
  color: var(--v4-text-3);
}

.v4-focus-body {
  flex: 1 1 190px;
  min-width: 0;
  display: grid;
  gap: 10px;
}

.v4-focus-meta,
.v4-focus-result {
  min-width: 0;
}

.v4-focus-task {
  margin: 0;
  font-size: 13px;
  color: var(--v4-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v4-focus-hint,
.v4-focus-result-sub {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--v4-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 放弃这一笔之后的那句话（Phase 6.1）：不是成功态，但必须读得清。
   失败/放弃的说明都比较长，允许换行，否则 720px 下会被 nowrap 顶出横向滚动。 */
.v4-focus-result-sub .v4-focus-discarded {
  color: var(--v4-text);
}

.v4-focus-result[data-unsaved='true'] .v4-focus-result-sub,
.v4-focus-result[data-discarded='true'] .v4-focus-result-sub {
  white-space: normal;
  overflow: visible;
  line-height: 1.5;
  text-overflow: clip;
}

/* 「已放弃」标记：中性色，不能和「未保存」的红色警告混为一谈 */
.v4-focus-abandoned {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--v4-r-pill);
  border: 1px solid var(--v4-border-strong, rgba(0, 0, 0, 0.18));
  font-size: 10px;
  line-height: 16px;
  color: var(--v4-text-2);
  vertical-align: middle;
}

.v4-focus-result-title {
  margin: 0;
  font-size: 13px;
  color: var(--v4-text);
}

.v4-focus-result-title strong {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.v4-focus-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 状态胶囊：颜色只在圆点上，文字保持高对比 */
.v4-focus-state-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--v4-r-pill);
  border: 1px solid var(--v4-border);
  background: var(--v4-surface-2);
  font-size: 11px;
  color: var(--v4-text-2);
  white-space: nowrap;
}

.v4-focus-state-chip::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--v4-text-3);
}

.v4-focus-state-chip[data-status='running']::before {
  background: var(--v4-accent);
}

.v4-focus-state-chip[data-status='paused']::before,
.v4-focus-state-chip[data-status='break-paused']::before {
  background: var(--v4-violet);
}

.v4-focus-state-chip[data-status='completed']::before {
  background: var(--dsw-alias-state-success-primary, #4f8767);
}

.v4-focus-state-chip[data-status='break']::before,
.v4-focus-state-chip[data-status='break-paused']::before {
  background: var(--v4-violet);
}

/* ── 展开态：设置行 ────────────────────────────────────────────────────── */
.v4-focus-detail {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.v4-focus-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.v4-focus-row > .v4-focus-label {
  flex: 0 0 44px;
  padding-top: 8px;
}

.v4-focus-control {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.v4-focus-number {
  width: 62px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  /* 去掉数字输入的上下箭头：48px 宽时它会吃掉第二位数字（"15" 显示成 "1"） */
  appearance: textfield;
  -moz-appearance: textfield;
}

.v4-focus-number::-webkit-outer-spin-button,
.v4-focus-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.v4-focus-unit {
  font-size: 11px;
  color: var(--v4-text-2);
}

.v4-focus-preset {
  height: 24px;
  min-width: 30px;
  padding: 0 8px;
  border-radius: var(--v4-r-pill);
  border: 1px solid var(--v4-border);
  background: transparent;
  color: var(--v4-text-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background var(--v4-dur) var(--v4-ease), border-color var(--v4-dur) var(--v4-ease);
}

.v4-focus-preset:hover:not(:disabled) {
  background: var(--v4-surface-2);
  border-color: var(--v4-border-strong);
}

.v4-focus-preset[data-active='true'] {
  border-color: var(--v4-accent);
  color: var(--v4-text);
}

.v4-focus-preset:disabled,
.v4-focus-number:disabled,
.v4-focus-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.v4-focus-preset:focus-visible,
.v4-focus-check input:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

.v4-focus-select {
  flex: 1 1 180px;
  max-width: 100%;
}

.v4-focus-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--v4-text-2);
}

.v4-focus-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--v4-danger, #a34a49);
}

.v4-focus-breaks {
  gap: 10px;
}

.v4-focus-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--v4-text-2);
  cursor: pointer;
}

.v4-focus-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--v4-text-2);
}

.v4-focus-inline .v4-focus-number {
  width: 56px;
}

.v4-focus-recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  width: 100%;
  min-width: 0;
}

.v4-focus-recent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 5px 6px;
  border: 0;
  border-radius: var(--v4-r-sm);
  background: transparent;
  color: var(--v4-text-2);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.v4-focus-recent-row:hover {
  background: var(--v4-surface-2);
  color: var(--v4-text);
}

.v4-focus-recent-row:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 1px;
}

.v4-focus-recent-time {
  flex: 0 0 auto;
  color: var(--v4-text-3);
  font-variant-numeric: tabular-nums;
}

.v4-focus-recent-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v4-focus-recent-min {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .v4-focus-live {
    gap: var(--v4-s3);
  }

  .v4-focus-clock {
    font-size: 26px;
  }

  .v4-focus-body {
    flex: 1 1 100%;
  }

  .v4-focus-row {
    flex-wrap: wrap;
  }

  .v4-focus-row > .v4-focus-label {
    flex-basis: 100%;
    padding-top: 0;
  }
}

/* 深色：accent-strong 在深底上偏暗，直接用高亮玫瑰，保持数字清晰 */
body[data-ds-dark-theme] .v4-focus-clock[data-status='running'] {
  color: var(--dsw-alias-brand-text, #d9a8b8);
}

/* ── 会话采集卡（设置页） ─────────────────────────────────────────────── */
.v4-capture {
  display: grid;
  gap: var(--v4-s3);
}

.v4-capture-toggle {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}

.v4-capture-toggle input {
  margin-top: 2px;
}

.v4-capture-toggle strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--v4-text);
}

.v4-capture-note {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--v4-text-2);
}

.v4-capture-toggle input:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
}

[data-capture-status='error'] {
  color: var(--v4-danger, #a34a49);
}

/* 任务行可点：展开设置。用平铺按钮而不是 chip，避免和「开始专注」抢视觉重量 */
.v4-focus-task-btn {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.v4-focus-task-btn .v4-focus-task {
  flex: 0 1 auto;
  min-width: 0;
}

.v4-focus-task-cue {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--v4-text-3);
  opacity: 0;
  transition: opacity var(--v4-dur) var(--v4-ease);
}

.v4-focus-task-btn:hover .v4-focus-task-cue,
.v4-focus-task-btn:focus-visible .v4-focus-task-cue {
  opacity: 1;
}

.v4-focus-task-btn:focus-visible {
  outline: 2px solid var(--v4-accent);
  outline-offset: 2px;
  border-radius: var(--v4-r-sm);
}

/* 未保存的结算：红色只用在标记上，正文仍用高对比文字 */
.v4-focus-unsaved {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--v4-r-pill);
  border: 1px solid var(--v4-danger, #a34a49);
  font-size: 10px;
  line-height: 16px;
  color: var(--v4-danger, #a34a49);
  vertical-align: middle;
}

body[data-ds-dark-theme] .v4-focus-unsaved {
  border-color: #d98a89;
  color: #d98a89;
}

.v4-focus-result[data-unsaved='true'] .v4-focus-result-sub {
  color: var(--v4-text);
}
` : "";
  if (cssText === "") return;
  try {
    if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return;
    const tag = document.createElement("style");
    tag.dataset.plugin = PACKAGE_ID;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = cssText;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  } catch (error) {
    warn2("style injection failed — the page will render unstyled", error);
    return;
  }
}
function apply(ctx) {
  try {
    ctx.effect(installBoardStyles, `${PACKAGE_ID}: board.css`);
    const entry = {
      id: PANEL_ID,
      order: PANEL_ORDER,
      title: () => PANEL_TITLE,
      description: () => PANEL_DESCRIPTION,
      icon: BoardIcon
    };
    const page = (props) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(BoardPage, { sessionId: props.sessionId, ctx });
    ctx.effect(() => registerSidebarGuide(ctx, entry, page).dispose, `${PACKAGE_ID}: sidebar guide`);
  } catch (error) {
    warn2("client apply failed — the page stays unmounted", error);
  }
}
var name = PACKAGE_ID;
var inject = ["slots"];
var index_default = { name, inject, apply };
return module.exports; } });
