# Sorchron Study Board V4 · 架构设计与实施计划

> 状态：**阶段 1 已实施并完成质量审计（数据层 + 350 条断言），UI 未接入**
> 基线：V3（51 个源文件 / 11,399 行 / 187 项断言全绿）
> 本文件是 §九「第二阶段」的交付物。两个决策已确认：AI 密钥存宿主侧文件、
> 默认只发统计档。阶段 1 的实施结果见文末「阶段 1 实施记录」。

---

# 第一部分 · V3 审查报告（阶段一）

## 1.1 现状盘点

| 维度 | 事实 |
| --- | --- |
| 入口 | `src/index.ts`（host，no-op）+ `src/client/index.tsx`（client，纯函数 `apply(ctx)`） |
| 挂载 | `main` + `sidebar.panellist` 两个 slot，`PANEL_ID` / `PANEL_ORDER=20`，与 dsh-context 完全同构 |
| 数据 | localStorage 7 个 key，写入 `{ schemaVersion: 3, data }`，读时补齐、打开不写回 |
| 分层 | `types` / `lib`（12 个纯逻辑模块）/ `hooks`（12 个）/ `board`（11 个组件）/ `charts`（4）/ `ui`（2） |
| 采集 | 三通道探测（ctx.on → 宿主服务 emitter → window 桥），防抖 + 内容哈希去重 + 单例销毁重建 |
| 隔离 | `lib/projects.ts` 的 `scoped*` 三个函数，是唯一口径 |
| 测试 | `tsc` 0 错误 / `register-check` 13 / `smoke` 174 = 187 |
| 样式 | 单文件 CSS，全部读主题变量；V3 只追加结构类 |

## 1.2 与 V4 需求重叠的部分（可复用，不重写）

| V4 需求 | V3 已有的基础 | 复用方式 |
| --- | --- | --- |
| 项目记忆 | `MemorySnapshot`（任务+阻碍+摘要） | 快照是「导出物」，记忆是「活文档」，两者解耦但共享阻碍数据 |
| 时间轴 | `SessionLog` + `FrictionRecord` + `tasks.completedAt` | 只能覆盖一部分事件，需要独立事件表补齐「项目创建/归档/决策/记忆更新」 |
| 历史对比 | `snapshot` 重编号导入 | 缺少「同一项目不同时间点」的快照，需新增 `history` |
| 阻碍→知识 | `FrictionRecord`（hits / resolveMs） | 新增 `knowledgeIds` 关联字段，不动合并算法 |
| AI 分析输入 | `stats.ts` 聚合函数 + `context.ts` 画像 | 直接作为结构化输入，不新增统计口径 |
| 热力图 | `focusMinutesOn` / `dailyFocusSeries` | 直接复用，但**数据源要换**（见 1.3 风险 R2） |
| 备份 | v3 合并/覆盖 + 冲突预览 | 扩展为 v4，新增实体进备份，Timer/AI 密钥不进 |

## 1.3 必须正视的五个问题（V4 要修的债）

**R1 · 页面正在变拥挤。** 现在 5 张卡片 + 5 个折叠面板。V4 再加教练、记忆、知识地图、时间机器、热力图，必然挤爆。
→ 结论：**必须引入页面级视图切换**（工作台 / 记忆 / 知识 / 时间机器），而不是继续堆折叠面板。

**R2 · 日志上限 400 条，撑不起年度热力图。** `MAX_LOG_ENTRIES=400` 是为了防 localStorage 爆掉。一年 250 个学习日，光专注记录就可能超 400 条。
→ 结论：新增**日聚合表** `daily`（每天一条：专注分钟、完成任务数、会话数、阻碍数），在写入时增量维护。热力图与周/月统计读聚合表，**不读原始日志**。聚合值只在真实 focus 日志写入时更新，不做任何推算。

**R3 · 没有统一事件记录，时间轴只能靠「猜」。** 现有数据能推出「任务哪一刻完成」，但推不出「项目何时创建、决策何时定、记忆何时改」。
→ 结论：新增 append-only 的 `timeline`，只在**有意义的节点**写入（白名单 14 类），并做 60 秒去重与环形截断。

**R4 · 没有历史快照，4.2 的历史对比会退化成「用当前数据假装过去」。**
→ 结论：新增 `history`，保存**真实的轻量快照**（id 集合 + 计数 + 记忆版本引用），支持任意两个快照做集合差。

**R5 · AI 请求没有落点。** 当前插件是纯客户端，直接在浏览器里调模型 API 会遇到 CORS，密钥也会落进 localStorage。
→ 结论：**host 侧代理**（详见 2.7），这是本次架构里唯一必须动 host 半边的部分。

## 1.4 宿主能力的真实边界（已实测，不允许假装）

在 `~/.dsh/profiles/desktop/node_modules` 下逐个插件核查的结果：

| 能力 | 结论 | 证据 |
| --- | --- | --- |
| HTTP 路由注册 | **可用（未公开但稳定）** | dsh-context 0.77.0 与 dsh-our-free-model 都通过 `ctx.inject(['connection'])` → `connection.fetch.register({ path, methods, requestBody:'buffered', fetch })` 注册 `POST /api/xxx` |
| 客户端调用 | **可用** | dsh-context 客户端直接 `fetch('api/dsh-context/balance', { method:'POST' })` |
| 斜杠命令注册 | **不可用** | 四个插件里 grep 不到 `commands.register`；V3 已改用「消息捕获 + window 桥」，V4 沿用 |
| 往会话注入消息 | **不可用** | 无公开 API；V4 的「生成新会话提示词」只产出可复制的文本，不写入 DSH |
| 宿主代跑模型 | **不可用** | `ctx.get('llm')` 只有 `listConfigurableProviders` / `registerAdapter` / `registerModelDiscovery`（provider 注册表），没有 `complete` / `chat`；`settings.describe()` 只返回 `apiKeyEnv` 名字，拿不到密钥 |
| 真实 token 计数 | **部分可用** | dsh-context 读的是宿主投影里的 usage；本插件没有这条通道，V4 仍用「字符数 ÷ 1.7」估算，并在 UI 标注「估算」 |

> 结论：AI 必须由本插件自己带 provider 配置。**没有免费午餐，也不会假装有。**

---

# 第二部分 · V4 架构设计（阶段二）

## 2.1 产品结构：三层互相咬合

```
┌─────────────────────────────────────────────────────────────────────┐
│  C · 开发时间机器（事实层）                                          │
│  timeline 事件表 + history 快照 + 对比 + 阶段回顾                    │
│  「什么时候发生了什么，和上一次比变了什么」                          │
└───────────────▲─────────────────────────────────┬───────────────────┘
                │ 记录事实                        │ 提供证据
┌───────────────┴───────────────┐   ┌─────────────▼───────────────────┐
│  A · AI 智能开发工作台         │   │  B · 程序员知识成长系统          │
│  教练（诊断/周报/建议）        │◄──┤  知识地图 + 间隔复习 + 阻碍→知识 │
│  项目记忆中心（活文档）        │──►│  「学到什么、还欠什么」          │
│  把记忆变成新会话提示词        │   │                                 │
└───────────────────────────────┘   └─────────────────────────────────┘
```

一条真实链路（需求里的例子）：

```
Next.js 会话
 → useSessionCapture 分类为 dev/refactor，命中项目 A、任务 T
 → 阻碍记录 F（错误摘要 + 解决耗时）
 → 事件：log.debug / friction.created / focus.completed
 → 日聚合 daily 更新
 → 知识命中：F 关联到「React State」（若用户已建该节点）
 → 记忆草稿：A 的「已完成/未解决」被标记为待更新
 → 时间轴上出现三个节点
 → 教练周报引用以上聚合
```

## 2.2 数据模型 v4

新增 7 个存储键（全部独立，不合并进现有键，避免破坏 V3 的读写路径）。

### 2.2.1 `memory` — 项目记忆（每个项目一份活文档）

```ts
interface ProjectMemory {
  projectId: string          // 主键，与 Project.id 一一对应
  intro: string              // 项目简介
  stack: string[]            // 技术栈
  architecture: string       // 架构说明（Markdown 纯文本）
  done: string[]             // 已完成工作
  progress: string           // 当前进度
  openIssues: string[]       // 未解决问题
  resolvedIssues: string[]   // 已解决问题
  decisions: Decision[]      // 重要技术决策
  nextSteps: string[]        // 下一步计划
  updatedAt: number
  version: number            // 每次确认更新 +1
  source: 'manual' | 'draft' | 'ai'
}
interface Decision { id: string; at: number; text: string; status: 'active' | 'superseded' }
```

**待确认草稿**存在 `meta.memoryDrafts[projectId]`（不进备份主数据，属于瞬态）：AI 生成 →
落草稿 → 用户在记忆页逐条「采纳 / 丢弃」→ 采纳才写 `memory` 并 +1 版本、写 `memory.updated` 事件。
**这是需求 2.3「AI 生成先进入待确认状态」的硬约束。**

### 2.2.2 `knowledge` — 知识节点与边

```ts
interface KnowledgeNode {
  id: string
  title: string              // 「Promise」「async/await」
  summary?: string           // 一句话定义
  category?: string          // 分类（语言 / 框架 / 工具 / 概念）
  status: 'todo' | 'learning' | 'learned' | 'review'
  mastery: 0 | 1 | 2 | 3 | 4 | 5
  projectIds: string[]       // 关联项目
  taskIds: string[]          // 关联任务
  logIds: string[]           // 关联日志
  frictionIds: string[]      // 关联阻碍（3.3）
  origin: 'manual' | 'ai'    // AI 建议的知识点必须标记，可一键过滤掉
  createdAt: number
  updatedAt: number
  lastReviewedAt?: number
  nextReviewAt?: number
  reviewCount: number
}
interface KnowledgeEdge {
  id: string
  fromId: string
  toId: string
  kind: 'related' | 'prereq'  // prereq: from 是 to 的前置
}
```

图约束（在 `lib/knowledge.ts` 里强制）：
- 删除节点同时删除相关边、清理任务的 `knowledgeIds` 反向引用；
- `prereq` 边禁止成环（插入时 DFS 检测，成环直接拒绝并提示）；
- 自环直接拒绝；`related` 视为无向（去重时按无序对比较）。

### 2.2.3 `reviews` — 复习记录与排期

```ts
interface ReviewRecord {
  id: string
  nodeId: string
  at: number
  form: 'recall' | 'code' | 'debug' | 'scenario'   // 概念回忆/代码阅读/错误排查/应用场景
  grade: 0 | 1 | 2 | 3                              // 忘了 / 模糊 / 记住 / 熟练
  note?: string
  nextAt: number
  intervalDays: number
}
```

排期算法（`lib/review.ts`，**SM-2 的极简版**，不过度设计）：

```
grade 0 → interval = 1 天,  mastery -1 (最低 0)
grade 1 → interval = 2 天,  mastery 不变
grade 2 → interval = max(3, 上次 interval × 2),  mastery +1 (最高 5)
grade 3 → interval = max(7, 上次 interval × 2.5), mastery +1
下次复习 = 今天 0 点 + interval 天
```

## 2.2.4 `timeline` — 事件表（时间轴唯一数据源）

```ts
type BoardEventType =
  | 'project.created' | 'project.archived' | 'project.restored'
  | 'task.created' | 'task.completed' | 'task.reopened'
  | 'focus.completed' | 'log.debug' | 'log.milestone'
  | 'friction.created' | 'friction.resolved'
  | 'memory.updated' | 'decision.added'
  | 'knowledge.learned' | 'knowledge.reviewed'
  | 'history.snapshot'

interface TimelineEvent {
  id: string
  at: number
  type: BoardEventType
  projectId?: string
  refId?: string            // 任务/日志/阻碍/知识节点 id
  title: string             // 已渲染好的短句，时间轴直接显示
  detail?: string           // 可选补充（≤200 字，不含源码）
}
```

**降噪规则**（否则时间轴会变成日志第二份）：
1. 白名单之外不记（例如 `task.updated`、普通 `message` 日志、每一次 `focus.completed` 之外的计时状态变化）；
2. 同 `type + refId` 在 60 秒内只留一条；
3. 环形上限 1200 条，超出丢最旧（按项目等比例保留）；
4. `log.debug` 只在「该会话首次出现排错」时记，不逐条记。

## 2.2.5 `history` — 真实历史快照

```ts
interface HistorySnapshot {
  id: string
  projectId: string
  at: number
  label: string
  counts: { tasks: number; done: number; openFriction: number; knowledgeLearned: number }
  taskDoneIds: string[]     // 只存 id，不存整对象（体积可控）
  taskOpenIds: string[]
  openFrictionIds: string[]
  memoryVersion: number
  memoryDigest: { intro: string; stack: string[]; decisions: string[] }  // 用于跨版本对比
}
```

- **触发**：手动「打一个快照」、每周首次打开自动、导入前自动、大版本升级前自动；
- **上限**：每项目 12 个，超出按时间淘汰最旧（保留第一个作为基线）；
- **对比**：`diffHistory(a, b)` 输出 `{ addedTasks, removedTasks, completedTasks, reopenedTasks, addedDecisions, removedDecisions, frictionDelta, memoryChanged }`，纯集合运算，**不推测**。

## 2.2.6 `daily` — 日聚合（热力图与周报的唯一数据源）

```ts
interface DailyAggregate {
  day: string            // YYYY-MM-DD（本地）
  focusMinutes: number   // 只来自 focus 日志
  tasksDone: number      // 当天 completedAt 的任务数
  sessions: number       // 当天非 focus 日志条数
  friction: number       // 当天新增阻碍数
}
```

写入时机：`focus.completed`、`task.completed`、`log.captured`、`friction.created` 各
自增量 +1；同时提供 `rebuildDaily(logs, tasks)` 供修复用（只在用户点「重建聚合」时执行）。
**不做任何推算**：某天没有 focus 记录，`focusMinutes` 就是 0，热力图显示最低档。

## 2.2.7 `aiRuns` — AI 调用审计（不进备份）

```ts
interface AiRun {
  id: string; at: number
  kind: 'daily' | 'weekly' | 'project' | 'memory' | 'knowledge'
  provider: 'local' | 'openai-compatible'
  model?: string
  ok: boolean
  errorCode?: 'no-config' | 'network' | 'timeout' | 'bad-json' | 'rate-limit' | 'auth'
  inputTokensApprox?: number
  outputChars?: number
  fallbackUsed: boolean   // 是否降级到本地分析
}
```

只存元数据，**不存 prompt、不存返回值**（返回值只留 UI 需要的部分，落 `memory` 草稿或报告缓存）。

## 2.3 存储与迁移策略

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 是否上 IndexedDB | **V4 不上** | 现有 7 键 + 新 7 键在 5MB 内可控（估算见下）；IndexedDB 会把所有读写变成异步，`useLocalStore` 的同步广播模型要重写，风险远大于收益 |
| schemaVersion | **3 → 4** | 新增键与字段全部可选，读时补齐；打开不写回 |
| 迁移方式 | **纯增量，不做破坏性迁移** | 新键缺失 = 空数组/空对象；老字段语义一律不改 |
| 升级前保护 | 首次以 v4 打开时，`meta.upgradedFrom` 记录来源版本，并在角落提示「已从 V3 升级，建议先导出一次备份」（一键） | 不给用户偷偷复制一份数据（会翻倍占用），但把选择权交给他 |
| 破坏性操作 | 仅两处：`清空全部数据`、`覆盖导入` | 均已有二次确认；V4 在覆盖导入前**自动打一个 history 快照** |
| 容量预算 | 现有 ~200KB + memory(20KB) + knowledge(50KB) + reviews(30KB) + timeline(120KB) + history(80KB) + daily(15KB) ≈ **515KB** | 远低于 5MB；容量监控沿用 V3 的 80%/92% 预警 |

**备份 v4**：`BackupPayload.version = 4`，新增 `memory / knowledge / reviews / timeline / history / daily`。
**不导出**：`timer`（瞬态）、`aiRuns`（审计）、AI 密钥（根本不在浏览器里）。

## 2.4 Repository 层：局部抽象，不推倒重来

```
src/client/lib/repo/
  types.ts     Repository 接口（memory / knowledge / reviews / timeline / history / daily）
  local.ts     localStorage 实现（复用 readStoreEnvelope / writeStore，零新存储机制）
  index.ts     getRepo() 单例 + 事件广播
```

**为什么只给新实体做 Repository**：现有 7 个键已经走 `useLocalStore`（它本身就是
「带版本号 + 兜底 + 跨标签同步」的仓储实现）。把 V3 的读写全改成 `repo` 只会制造
大面积回归风险，收益是零。新实体从第一天就用接口，未来换 IndexedDB 只改 `local.ts`。

## 2.5 AI Service 层：三段式，密钥不出 host

```
client                              host (Node)                    外部
──────                              ───────────                    ────
useAiCoach                          /api/sorchron-ai/complete
  └ lib/ai/client.ts  ── POST ──►   provider chain ── fetch ──►  OpenAI 兼容 API
       (结构化 payload)              ├ manual: 用户配置的 baseURL/model/key
                                     └ 无配置 → 立即返回 no-config
       ◄── JSON (schema 校验) ──────┘
  └ 失败/未配置 → lib/ai/local.ts（规则分析，永远可用）
```

### 2.5.1 密钥与配置

- 存放位置：`~/.dsh/storages/sorchron-ai/config.json`，`chmod 0600`，**只在 host 侧**；
- 客户端只拿得到 `{ configured: boolean, model, baseURLHost }`（不返回 key，连掩码都不给）；
- **不进备份、不写日志、不进 localStorage**（`aiRuns` 只记 provider/model 名）；
- 支持删除配置；配置接口本身也要求「本机 loopback 请求」才接受（host 侧检查 request 来源，做不到就退化为「只在本机 Web 端可用」并提示）。

### 2.5.2 Provider 接口（可替换）

```ts
interface AiProvider {
  id: string
  label: string
  available(): Promise<boolean>
  complete(input: AiRequest, signal: AbortSignal): Promise<AiResult>
}
interface AiRequest {
  system: string
  user: string
  jsonSchemaHint?: string
  maxTokens: number
  temperature: number
}
```

V4 只实现两个：`manual`（OpenAI 兼容 /chat/completions）与 `local`（规则引擎）。
未来加 Anthropic / 本地 Ollama 只需新增一个 provider 文件。

### 2.5.3 输入数据的最小化与授权

发送前**先展示将要发送的 JSON**（折叠预览），并提供两档：

| 档位 | 内容 | 默认 |
| --- | --- | --- |
| 统计档 | 只有数字与枚举：分钟、任务数、类型分布、阻碍次数、项目名 | ✅ 默认 |
| 摘要档 | 统计 + 任务标题 + 阻碍摘要 + 记忆文本 | 需显式勾选 |

**永不发送**：原始聊天记录、代码原文（本来就没存）、附件、完整日志 detail（除非摘要档且用户勾选）。

### 2.5.4 失败与降级（每条都有 UI 反馈）

| 情况 | 行为 |
| --- | --- |
| 未配置 | 直接走本地分析，报告顶部标「本地分析（未配置 AI）」 |
| 网络失败 / 超时（15s） | `AbortController` 取消，提示「AI 暂不可用，已用本地分析」，写 `aiRuns.errorCode` |
| 401 / 429 | 分别提示「密钥无效」「触发限流，稍后再试」，不自动重试 |
| 返回不是 JSON | 一次修复尝试（剥离 ```json 围栏 / 截取首尾大括号）→ 仍失败则降级 |
| JSON 不合 schema | 逐字段校验，缺的字段丢弃而不是整个失败；关键字段（`summary`）缺失才降级 |

### 2.5.5 触发方式

- **默认手动**：教练页「生成今日诊断 / 本周总结」，记忆页「AI 整理」；
- **自动**：需在设置里显式勾选「每天首次打开自动生成今日诊断」，且只发统计档；
- 每次调用写 `aiRuns`，教练页底部可看最近 10 次调用记录与失败原因。

## 2.6 信息架构：把新功能放进独立视图

在页面顶部（页头之下）加**视图切换条**，而不是继续堆卡片：

```
[工作台] [项目记忆] [知识地图] [时间机器]

工作台   = 现有 5 张卡 + 学习热力图（紧凑版）+ 教练摘要条
项目记忆 = 左：项目列表  右：记忆文档 + 草稿区 + 决策 + 提示词生成 + 版本
知识地图 = 左：树/列表   右：节点详情 + 关联 + 复习排期
时间机器 = 上：时间轴    下：快照列表 + 两点对比 + 阶段回顾
```

- 切换用 CSS transition（150ms，`prefers-reduced-motion` 时关闭），不引入动画库；
- 记忆页/知识页/时间轴默认隐藏，`BOARD_CONFIG.features` 可逐块关闭；
- 热力图放在工作台内，与「近 7 日专注」并列，**不单独成页**（符合 §五 要求）。

## 2.7 UI/UX 约束（不动视觉语言）

| 项 | 做法 |
| --- | --- |
| 卡片骨架 | 沿用现有 `.osb-card` / `.osb-card-head` / `.osb-collapse` |
| 新视图 | 复用同一套卡片与外框，不新造一套设计系统 |
| 动画 | 只用 `opacity / transform / height`，时长 120–200ms，统一 `--osb-ease` |
| 毛玻璃 | 仅弹窗遮罩一处，且 `backdrop-filter` 失败时退化为半透明纯色 |
| 加载态 | 骨架条（3 行），不用 spinner 转圈 |
| 空状态 | 每个新视图都有一句「下一步做什么」，不留白 |
| 热力图 | 方格 11px / 间距 3px / 5 档低饱和主题色，深浅色自动跟随 |

## 2.8 阶段实施顺序（每阶段必须过门禁）

| 阶段 | 内容 | 产出 | 门禁 |
| --- | --- | --- | --- |
| **0** | 本设计确认 | 本文件 | 用户确认（含 AI 密钥与数据授权两项决策） |
| **1** | 数据层：types v4 / schema v4 / repo / 日聚合 / 事件记录 | 纯逻辑，无 UI | `tsc` 0 错 + smoke 新增 ≥30 断言全绿 |
| **2** | 项目记忆中心（手动编辑 + 版本 + 提示词生成） | 记忆视图 | 记忆 CRUD 往返 + 版本递增 + 项目隔离断言 |
| **3** | AI Service（host 代理 + provider 链 + 本地降级）+ 记忆草稿确认流 | AI 可用即整理记忆 | 无配置时必须仍能生成草稿（本地规则） |
| **4** | AI 学习教练（日/周诊断、7 类分析） | 教练视图 | 输入不含敏感数据；三档失败降级有断言 |
| **5** | 开发时间机器（事件表 + 视图 + 筛选） | 时间轴 | 事件白名单 + 60s 去重 + 环形截断断言 |
| **6** | 历史快照与对比 + 阶段回顾 | 对比视图 | `diffHistory` 集合运算断言 + 真实快照非伪造 |
| **7** | 知识地图 + 间隔复习 + 阻碍↔知识关联 | 知识视图 | 图约束（无环/无自环）+ SM-2 排期断言 |
| **8** | 学习热力图（年度 / 切换 / tooltip / 点击下钻） | 工作台内新卡 | 只读 `daily`，与 focus 日志逐日一致 |
| **9** | 回归 + 文档 + 交付清单 | TESTING v4 / README v4 | 全量 187 + 新增 ≥73 = ≥260 断言 |

每个阶段结束都跑：`tsc` → `build` → `register-check` → `smoke`，**不允许为了绿而删断言**。

## 2.9 测试计划（增量部分）

新增断言预估（目标 ≥73 条，总量 ≥260）：

| 模块 | 断言点 |
| --- | --- |
| schema v4 | V3 数据读成 v4 不缺字段；新键缺失返回空；未知字段被忽略 |
| repo | 写读往返、字段兜底、跨键隔离、版本号 = 4 |
| daily | focus/task/log/friction 各自 +1；`rebuildDaily` 与增量结果一致；跨日零点切分 |
| timeline | 白名单拒绝噪声；60s 去重；1200 环形截断；按项目过滤 |
| history | 快照计数正确；`diffHistory` 四类差异；同 id 内容变化不算「新增」 |
| memory | 版本递增；草稿不得直接写主文档；空字段不覆盖；跨项目隔离 |
| knowledge | prereq 成环被拒；删除级联；`related` 无序去重；mastery 上下限 |
| review | 四档 grade 的 interval 与 mastery 变化；下次复习跨月 |
| heatmap | 5 档阈值边界；无数据 = 0 档；年度汇总（天数/分钟/任务） |
| ai | prompt 不含源码；schema 校验；坏 JSON 修复；超时降级；未配置降级 |
| 提示词生成 | 只含记忆与任务标题；不含日志 detail；可复制文本长度上限 |

人工验收：在 V3 的 18 个场景上新增 8 个（记忆版本、草稿确认、时间轴筛选、快照对比、
知识成环提示、复习排期、热力图下钻、AI 未配置降级），写入 `TESTING.md`。

## 2.10 明确不做的事

- 不做知识图谱的可视化「力导向图」（性能与可读性都不划算，用分层列表 + 局部关系图）；
- 不做 AI 流式输出（首屏价值低，长连接稳定性差）；
- 不做云同步 / 账号体系（超出插件边界，且与「本地优先」冲突）；
- 不改左导航注册方式、不改打包配置、不改 `cordis.patch.yml`；
- 不重写 V3 的采集、计时、隔离、备份四条主链路，只在旁边挂新能力。

---

# 第三部分 · 文件清单（预估）

## 新增（约 30 个）

```
docs/V4-ARCHITECTURE.md            ← 本文件
src/host/ai/config.ts              密钥读写（~/.dsh/storages/sorchron-ai/config.json, 0600）
src/host/ai/provider.ts            OpenAI 兼容 provider（fetch + 超时 + 错误码）
src/host/ai/routes.ts              /api/sorchron-ai/{config,complete,test}
src/client/lib/repo/{types,local,index}.ts
src/client/lib/{memory,knowledge,review,timeline,history,heatmap,ai-tasks}.ts
src/client/lib/ai/{client,local,prompts,schema}.ts
src/client/hooks/{useMemory,useKnowledge,useReview,useTimeline,useHistory,useAiCoach,useHeatmap}.ts
src/client/board/memory/{MemoryView,MemoryDoc,DraftReview,PromptExport}.tsx
src/client/board/knowledge/{KnowledgeView,NodeDetail,ReviewQueue}.tsx
src/client/board/timeline/{TimelineView,EventList,HistoryDiff,Retrospective}.tsx
src/client/charts/Heatmap.tsx
src/client/ui/{ViewTabs,Skeleton}.tsx
```

## 修改（约 12 个）

```
types/index.ts        新增 v4 实体与 STORAGE_KEYS（8 个新键）
lib/config.ts         v4.0.0 / features 开关 / heatmap / review 参数
lib/schema.ts         SCHEMA_VERSION=4 + coerceMemory/coerceKnowledge/... + 分发表
lib/backup.ts         version 4 + 新实体合并 + 导入前自动快照
lib/snapshot.ts       快照带上 memory / decisions
hooks/useBoardData   挂载 timeline 记录器与 daily 聚合器
board/{Stats,Overview,DataPanel,DebugPanel}   热力图、教练摘要、v4 备份、AI 自测按钮
index.tsx             视图切换条（注册代码一行不动）
style/board.css       仅追加视图/热力图/图谱的结构类
```

---

# 第四部分 · 待你确认的两个决策

1. **AI 密钥存哪里**（影响 2.5.1）：
   - A（推荐）宿主侧文件 `~/.dsh/storages/sorchron-ai/config.json`，0600，客户端只见「已配置」，不进备份/日志；
   - B 只在本次会话内存里，重启要重填（最安全，最麻烦）；
   - C 浏览器 localStorage（不推荐：同源脚本可读、易随备份泄露）。

2. **AI 默认发多少内容**（影响 2.5.3）：
   - A（推荐）只发统计数字与枚举，标题/摘要需手动勾选；
   - B 默认带任务标题与阻碍摘要（分析更准，但把项目内容交给第三方）；
   - C 全量（含备注正文）—— 不建议。

确认后我从**阶段 1（数据层）**开始，先只提交纯逻辑 + 断言，不动任何 UI，跑绿再往下走。


---

# 第五部分 · 阶段 1 实施记录（已完成）

## 已落地

| 文件 | 内容 |
| --- | --- |
| `types/v4.ts` | 记忆 / 草稿 / 知识节点与边 / 复习 / 时间轴 / 历史快照 / 日聚合 / 热力图 / AI 审计 / 教练报告 |
| `types/index.ts` | 7 个新存储键、备份 v4、settings 新增 3 项、meta 新增 3 项 |
| `lib/config.ts` | v4.0.0、6 个功能开关、daily/timeline/history/memory/knowledge/review/ai 参数 |
| `lib/schema.ts` | `SCHEMA_VERSION=4`；`coerceMemory/Draft/Knowledge(Node)/Review/TimelineEvent/History/Daily/AiRun`；按 key 分发 |
| `lib/daily.ts` | 增量累加、按天重建、区间汇总（热力图与周报的唯一数据源） |
| `lib/timeline.ts` | 白名单 + 60s 去重 + 1200 环形截断 + 范围/类型/项目筛选 + 按天分组 |
| `lib/memory.ts` | 版本化记忆、草稿生成（任务/阻碍）、逐条采纳、Markdown 与提示词导出 |
| `lib/knowledge.ts` | 图操作：自环/成环/重复边拦截、级联删除、双向关联、搜索筛选 |
| `lib/review.ts` | SM-2 极简排期（4 档评分）、待复习队列、复习统计 |
| `lib/heatmap.ts` | 5 档色阶、年度周网格（周一开头、首尾补齐）、年度汇总、年份列表 |
| `lib/history.ts` | 真实快照采样、集合差异、每项目 12 个上限且保留基线、自动快照判定 |
| `lib/repo/{types,local,index}.ts` | 仓储接口 + localStorage 实现（无 window 降级内存）+ 单例 |
| `lib/bus.ts` | 抽出 `STORE_EVENT`，供 repo 与 useLocalStore 共用 |

## 门禁结果

```
tsc --noEmit                 0 错误
scripts/register-check.mjs   13 / 13
scripts/smoke.ts            350 / 350   （V3 原有 174 全部保留 + V4 新增 176）
lib/client.js               350 KB（未引入任何新依赖）
```

## 与设计的偏差（以及原因）

1. **`removeNode` 没有额外清理「其它节点上的引用」**：关联是单向存在节点上的
   id 列表，删除节点不会留下悬空引用，原设计里的那一步是多余的，已删除。
2. **`HeatmapOptions` 阈值覆盖接口被移除**：阈值只从 `config` 读，避免出现
   「测试传一套、运行时用另一套」的双口径。
3. **`coerceMemoryDrafts` 放宽了字段校验**（只保留 `field`/`text`/`accepted`）：
   草稿是瞬态数据，逐字段严格校验的收益低于成本；真正落主文档时仍走
   `applyMemoryPatch` 的清洗。

## 下一步（阶段 2）

项目记忆中心：`hooks/useMemory.ts` + `board/memory/*`，实现手动编辑、版本列表、
草稿确认、Markdown 导出、提示词生成。门禁：记忆 CRUD 往返、版本递增、跨项目隔离。
