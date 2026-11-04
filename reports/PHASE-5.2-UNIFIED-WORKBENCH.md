# Phase 5.2 · Unified Workbench 交付报告

- 版本：`4.0.0-rc.1`（构建产物 `lib/client.js` 309,850 B）
- 日期：2026-11-03
- 范围：统一工作台、统一展开交互、玻璃材质重做、移除经典入口、功能迁移矩阵
- 结论：**本阶段目标全部完成**；未迁移能力全部有明确标注，没有一项被假装完成；
  自动化 599 条断言全绿；真实 DSH 宿主**未验证**（按约束未启动）。

---

## 0. 一句话结论

工作台从「Dashboard + 一套藏起来的经典界面」收敛成**一个界面**：
顶部一条工具栏、八块可展开的卡片、一个统一的抽屉 / 弹层系统，深浅两套独立的玻璃材质。
旧组件、旧数据、旧兼容逻辑全部保留，但**不再作为第二套用户工作台存在**；
每一项没迁完的能力都能在「迁移计划」里查到去向与顺序。

---

## 1. 原有功能迁移矩阵

图例：`✅ 可用` = 统一工作台内可完成；`🟡 只读` = 能看到真实数据，不能写；
`⛔ 未开放` = 明确标注、保留代码与数据；`—` = V3 也没有的能力。

### 1.1 Tasks

| # | 功能 | 原实现位置 | 统一工作台状态 | 复用 Actions / Hooks | 数据链路 | 推荐位置 / 阶段 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | 新建任务 | `board/TaskList.tsx` `addTask` | ✅ 顶部弹层 + 任务页内联 | `useBoardActions.createTask` | `tasks` + `timeline(task.created)` | 已完成 |
| T2 | 编辑任务 | `board/TaskList.tsx` 行内编辑 | ✅ 弹层 / 内联同一份表单 | `updateTask` | `tasks`（不改 `done/completedAt`） | 已完成 |
| T3 | 删除任务 | `board/TaskList.tsx` 二次确认 | ✅ 行内 + 抽屉两步确认 | `removeTask` | `tasks` / `logs` / `meta` / `graph` / `daily` / `timeline` 六处级联 | 已完成 |
| T4 | 完成 / 重新打开 | `board/TaskList.tsx` `toggle` | ✅ 首页行、任务页、抽屉三处 | `completeTask` / `reopenTask` | `tasks` + `daily(tasksDone)` + `timeline` + 历史快照 | 已完成 |
| T5 | 搜索 | `board/TaskList.tsx` 关键字框 | ✅ 任务页 | 纯派生，不写存储 | `allTasks` → 过滤 | 已完成 |
| T6 | 状态筛选 | `TaskList` 筛选条 | ✅ 全部 / 未完成 / 已完成 / 逾期 | 纯派生 | 同上 | 已完成 |
| T7 | 排序 | `TaskList` 排序 | ✅ 优先级 / 截止 / 创建 | 纯派生 | 同上 | 已完成 |
| T8 | 优先级 | `TaskList` 表单 | ✅ | `createTask` / `updateTask` | `tasks.priority` | 已完成 |
| T9 | 截止日期 | `TaskList` 表单 + 逾期标红 | ✅ | 同上 | `tasks.dueAt` | 已完成 |
| T10 | 备注 | `TaskList` 表单 | ✅ | 同上 | `tasks.note` | 已完成 |
| T11 | 项目归属 | `TaskList` 表单 | ✅ | 同上 + 顶部全局作用域 | `tasks.projectId` | 已完成 |
| T12 | 子任务增删 | `board/TaskList.tsx` + `lib/subtask.ts` | 🟡 只读列表 + `n/m` 计数 | 未接（无 subtask Action） | `tasks.subtasks` | 任务详情面板 · 需先补 Action |
| T13 | 子任务勾选 / 全选 | `lib/subtask.ts` `toggleSubtask/setAllSubtasks` | ⛔ 只读 | 未接 | 同 T12 | 与 T12 同批 |
| T14 | 预估时长 | `TaskList` 预估编辑 | ⛔ 未接 | `createTask/updateTask` 签名不接受 | `tasks.estimateMinutes` 保留 | Tasks 下一阶段 |
| T15 | 任务 ↔ 会话绑定 | `TaskList.bindSession` + `meta.sessionTaskMap` | ⛔ 未接 | 未接 | `meta` + `tasks.sessionId` | 随 Focus / History |
| T16 | 「开会话」复制标题 | `TaskList.openSession` + `sorchron:open-session` | ⛔ 未接 | 未接 | window 事件 | 随 Focus |

### 1.2 Focus

| # | 功能 | 原实现位置 | 统一工作台状态 | 复用 | 数据链路 | 推荐位置 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 开始 / 暂停 / 恢复 / 结束 | `board/FocusTimer.tsx` + `hooks/useTimer.ts` | ⛔ 未开放（点击说明原因） | — | `timer` + `logs(focus)` | Focus 面板（独立阶段） |
| F2 | 短休 / 长休 / 跳过 | 同上（`phase`、`roundInCycle`） | ⛔ 未开放 | — | `timer` | 同上 |
| F3 | 绑定当前任务 | `FocusTimer` 任务下拉 | ⛔ 未开放 | — | `timer.taskId` | 同上 |
| F4 | 完成一轮写日志 | `useBoardActions.addFocus` | ⛔ 只读展示历史 | 未接 | `logs` + `daily` + `timeline` | 同上 |
| F5 | 自动采集 | `useHarnessEvent` + `useSessionCapture` | ⛔ **暂停**（监听随 `SessionLog` 卸载） | 未接 | — | History 阶段搬到 Shell 级 |
| F6 | 计时状态刷新恢复 | `useTimer` 持久化 `phase/deadline` | ⛔ 未开放 | — | `timer` | Focus 阶段 |
| F7 | 今日 / 本周专注统计 | `lib/stats` | ✅ 指标 + 抽屉 + 7 日展开 | 只读复用 | `logs` + `daily` | 已完成 |

### 1.3 History / Analytics

| # | 功能 | 原实现位置 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| H1 | 最近活动 | V4 `Dashboard`（V3 无 UI） | ✅ 4 条 + 展开 20 条 + 单条详情 | 读 `timeline`，按项目作用域过滤 |
| H2 | Timeline 全量 / 筛选 | 数据层 `lib/timeline` | 🟡 仅展开列表 | 无按日 / 按类型筛选 |
| H3 | 完整会话记录 | `board/SessionLog.tsx` | ⛔ 未开放 | 采集也暂停（F5） |
| H4 | 学习日历 / 热力图 | `lib/heatmap.ts`（**V3 亦无 UI**） | ⛔ 未开放 | 数据层已就绪，缺视图 |
| H5 | 每日完成情况 | `lib/daily` + `Overview` | ✅ 单日抽屉 | 当日专注、完成任务、全部记录 |
| H6 | 专注趋势 | V3 `BarChart` | ✅ 7 日折线（可点 / 键盘可达） | 点一天 → 当日详情 |
| H7 | 项目排行 | V3 `ProjectBars` | ✅ 项目卡 + 展开全部 | 分钟 / 完成数 |
| H8 | 数据看板五个图 + 五个折叠面板 | `board/Stats.tsx` | ⛔ 未开放 | Bar / Pie / Gantt / ProjectBars 未迁移 |
| H9 | 逾期率、本周完成率 | `lib/stats` | 🟡 数字已在指标与详情 | 独立图表未迁移 |

### 1.4 Projects

| # | 功能 | 原实现位置 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| P1 | 切换项目 | `ProjectBar` + `useProject.setActive` | ✅ 顶部工具栏（唯一作用域入口） | 写 `settings.activeProjectId` |
| P2 | 创建项目 | `useProject.create` | ⛔ 未开放 | 数据层完整 |
| P3 | 项目模板 | `PROJECT_TEMPLATES` + `createFromTemplate` | ⛔ 未开放 | 同上 |
| P4 | 归档 / 解封 | `useProject.setArchived` | ⛔ 未开放 | 归档排除规则仍生效（`lib/projects`） |
| P5 | 删除项目 | `useProject.remove` | ⛔ 未开放 | 不删任务 / 日志的约定保留 |
| P6 | 项目快照导出 / 导入 | `ProjectBar` + `lib/snapshot` | ⛔ 未开放 | — |
| P7 | 项目任务统计 | `projectRanking` / `projectDigest` | ✅ 只读 + 抽屉 | 分钟、完成、逾期 |

### 1.5 Memory / Knowledge

| # | 功能 | 原实现位置 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| M1 | 项目记忆查看 | `lib/memory` | 🟡 份数 / 版本 / 最近更新 | 5.2 新增只读概览 |
| M2 | 记忆草稿 / 逐条采纳 | `lib/memory.buildDraftFromLogs/acceptDraft` | ⛔ 未开放 | 数据层完整 |
| M3 | 记忆版本对比 | `version` 字段 | ⛔ 未开放 | — |
| M4 | 知识节点列表 | `lib/knowledge` | 🟡 计数 + 最近 6 个 | 只读，无编辑 |
| M5 | 知识依赖关系 | `KnowledgeEdge` | 🟡 只读边数 | 无图形化 |
| M6 | 复习记录 / 排期 | `lib/review` | 🟡 总数 / 本周 / 到期数 | 无排期入口 |

> 说明：M1–M6 在 5.2 之前**没有任何 UI**（只在备份面板里被导出）。本阶段第一次把它们读出来，
> 但没有编辑能力，所以标「只读」而不是「可用」。

### 1.6 Settings / Data

| # | 功能 | 原实现位置 | 状态 |
| --- | --- | --- | --- |
| S1 | 全量 / 增量导出 | `board/DataPanel.tsx` + `hooks/useBackup` | ⛔ 未开放 |
| S2 | 导入预览 / 合并 / 覆盖 | `lib/backup` + `DataPanel` | ⛔ 未开放 |
| S3 | 清空全部数据 | `useBackup.clearAll` | ⛔ 未开放 |
| S4 | 存储空间观测 | `useStorageQuota` + `DataPanel` | ⛔ 未开放 |
| S5 | 阻碍记录 | `board/FrictionLog.tsx` | ⛔ 未开放（`actions` 仍会写记录） |
| S6 | 月度目标 | `board/MonthlyGoal.tsx` | ⛔ 未开放 |
| S7 | 上下文观测 | `board/ContextInsight.tsx` | ⛔ 未开放 |
| S8 | 调试 & 自测面板 | `board/DebugPanel.tsx` | ⛔ 未开放 |
| S9 | 重置今日 | `board/Overview.tsx` | ⛔ 未开放 |
| S10 | 采集 / 时长 / 休息设置 | `useBoardSettings` | 🟡 读取仍生效（项目作用域依赖它），无设置 UI |
| S11 | 存储损坏 / 写入失败提示 | `NoticeHost` | ✅ 仍挂在页面根节点 |
| S12 | 跨标签页冲突决议 | `ConflictHost` | ✅ 仍挂在页面根节点 |

### 1.7 全局 / 交互

| # | 能力 | 状态 |
| --- | --- | --- |
| G1 | 左侧一级入口 + 独立页面 | ✅ 13 项挂载断言通过（id / order / 双 slot 未动） |
| G2 | Classic / V4 切换器 | ✅ 已移除 |
| G3 | 「经典工具」入口 | ✅ 已移除（包括 `#classic` hash 分支） |
| G4 | 迁移计划说明 | ✅ 抽屉内 9 条，含目标位置与阶段 |
| G5 | 斜杠命令 | ⛔ 暂停（解析代码保留，hook 随 `SessionLog` 卸载） |
| G6 | 数据兼容 V1/V2/V3 信封 | ✅ 未改动，`useLocalStore` 仍读时补齐、打开不写回 |

---

## 2. 新工作台架构

```
BoardPage                          ← 唯一用户界面（无 view 切换）
└─ V4Shell
   ├─ WorkspaceProvider            ← 交互状态唯一来源
   ├─ .v4-topbar
   │    品牌 / Dashboard·任务 / 全局项目选择 / 日期 / 新建任务 / 迁移计划
   ├─ main
   │    ├─ Dashboard
   │    │    统计带（4 个可点指标）
   │    │    今日任务 + [专注 | 项目进度]
   │    │    [近 7 日专注 | 最近活动 | 知识与记忆]
   │    └─ Tasks
   │         标题 + 计数 + 搜索/排序/新建
   │         状态分段
   │         内联表单（新建 / 编辑）
   │         任务列表（行内展开）
   └─ OverlayHost（portal 到 .osb-page）
        ├─ 抽屉 L3：task / stat / project / activity / day / knowledge / roadmap / unavailable
        └─ 弹层 L3：create-task / edit-task
```

### 2.1 页面与入口

- 顶部只有两个主视图：`Dashboard`、`任务`。没有第三套界面，没有「回到旧版」。
- 项目作用域只存在于顶部工具栏一处；任务页不再放第二个项目下拉（避免两处筛选打架）。
- 「新建任务」在任何页面都打开同一个弹层，不强制跳页。
- 未迁移能力统一收进「迁移计划」抽屉（右上角常驻），而不是散落在灰掉的按钮里。

### 2.2 交互状态（`v4/workspace.tsx`）

| 状态 | 作用 | 规则 |
| --- | --- | --- |
| `expandedId` | 卡片内展开 / 任务行内展开 | 全局唯一，开 B 自动收 A |
| `detail` | 右侧抽屉 | 与 `modal` 互斥 |
| `modal` | 居中弹层 | 打开时自动关闭抽屉 |
| `selectedTaskId` | 当前选中任务 | 行展开 / 抽屉 / 编辑时同步 |
| `returnFocus` | 打开前的焦点元素 | 关闭后 `focus({preventScroll})` 还回去 |
| `scrollTop` | 打开前的工作台位置 | 关闭后恢复，保证「返回原处」 |

`useScrollLock` 同时锁 `document.body` 与 `.osb-page` 两层：宿主里滚动发生在页面容器，
独立页面里发生在 body，只锁一层就会出现「抽屉后面还能滚」。

---

## 3. 组件展开交互设计

### 3.1 三种表面，各管一类内容

| 表面 | 组件 | 用于 | 特征 |
| --- | --- | --- | --- |
| 卡片内展开 | `ExpandablePanel` | 专注 7 日明细、全部项目、逐日数字、更早活动、知识节点 | 不遮挡内容，`aria-expanded` + `aria-controls`，200ms 淡入 |
| 行内展开 | 今日任务行 / 任务页行 | 备注、项目、子任务、已专注、就地操作 | 一次只开一行，`data-open` 同时驱动操作区可见 |
| 右侧抽屉 | `OverlayHost` > `.v4-drawer` | 任务、统计、项目、活动、某一天、知识、迁移计划 | 440px / 720 全宽，L3 材质，焦点陷阱 |
| 居中弹层 | `OverlayHost` > `.v4-modal` | 新建 / 编辑任务 | 520px，L3，Esc / 遮罩关闭 |

### 3.2 交互规范落地

| 规范 | 实现 |
| --- | --- |
| Hover 160ms | `--v4-dur: 160ms`，卡片只改光影不改位置 |
| Active 90ms | `.v4-btn/.v4-segment/.v4-stat-button/.v4-nav-item/.v4-task-check:active { transition-duration: 90ms }` |
| Modal 180ms | `v4-modal-in` 180ms（淡入 + 6px 位移 + 0.6% 缩放） |
| Panel 200ms | `v4-panel-in` 200ms（淡入 + 2px 位移） |
| 卡片可点性 | 指标是 `<button>`；纯展示卡片不加 hover 位移，不让它「看起来能点」 |
| 任务操作 | 编辑 / 删除默认 `opacity:0; pointer-events:none`，`hover` / `focus-within` / 行展开时出现（键盘可达） |
| 删除确认 | 行内两步；抽屉内两步；破坏性操作不走遮罩关闭 |
| 统计可点 | 指标 → 抽屉；进度环在同一按钮内 → 完成明细；折线每个点 `role=button` + `tabindex=0` + Enter/空格 |
| 专注 | 只展示真实专注统计；计时器入口明确写「尚未开放」，没有假的开始按钮 |
| 键盘 | Esc 关闭；Tab 在浮层内循环；关闭后焦点回到触发元素 |
| 小屏 | 抽屉铺满、无圆角；弹层 `calc(100% - 20px)`；三列辅助层在 1180/900 降为 2/1 列 |
| reduced-motion | `.v4-page * { animation:none; transition:none }`（真实 Chromium 实测 0s） |

### 3.3 为什么没有做「每个组件一套弹窗」

统一之后只有一个 `OverlayHost`：Esc、遮罩、焦点、滚动锁、动画各一份实现。
新增一个可展开对象只需要 `workspace.openDetail({ kind, id, title })` 加一个 `DetailContent` 分支，
不会出现「这个卡片按 Esc 能关、那个不能」的碎片化。

---

## 4. 毛玻璃材质设计说明

### 4.1 环境层（不是背景色，是「可折射的东西」）

- 底色：奶油白 `#ece3e2`；四组低饱和光斑（灰玫瑰 `rgba(219,158,182,.48)`、
  淡紫 `rgba(172,160,220,.42)`、沙色、奶油高光）+ 顶部 24% 的白色渐变。
- 颗粒：160×160 SVG fractalNoise，`soft-light`，透明度 0.22（5.1.2 是 0.35，偏脏）。
- 旧版那颗 28px `filter: blur` 的光斑已删除（贵且看不出）。

### 4.2 L1 主玻璃

- 填充 52%（`color-mix` 到 `--v4-surface-solid`），`blur(26px) saturate(1.42) brightness(1.02)`。
- 反射只放顶部：`radial-gradient(120% 60% at 14% -18%)` + 右上角 14% 弱光，不再整块斜向白光。
- 边缘三段不同：顶部 `rgba(255,255,255,.40)`、底部 `rgba(110,74,100,.14)`、
  内阴影顶部 `.88` 高光 + 底部暗边。**没有统一的白色描边**。
- 投影三层：`-46px` 大扩散 + `-18px` 中景 + `-3px` 贴地。

### 4.3 L2 次级玻璃

- 填充 38%，`blur(16px) saturate(1.26)`，圆角 `14px`（L1 是 20px），投影只有 L1 的 1/3。
- 顶部反射更淡（.22），没有 L1 那层底部暗边 —— 让它明显「退后一层」，而不是缩小版 L1。

### 4.4 L3 浮层（新）

- 填充 92%（近实色，保证长文本可读），`blur(40px) saturate(1.45)`。
- 遮罩 `rgba(46,32,44,.26)` + 2px 模糊；抽屉从右侧 14px 滑入，弹层 6px 上浮。
- 投影单向更深（`-44px` 阴影 + 4px 贴地），与普通卡片一眼可分。
- 抽屉在 ≤720 铺满，无圆角、无左边框。

### 4.5 深色（另一套值，不是反色）

| 项 | 浅色 | 深色 |
| --- | --- | --- |
| 环境底 | `#ece3e2` | `#15131a` |
| L1 填充 | `rgba(255,253,252,.50)` | `rgba(45,41,56,.62)` |
| L1 边 | 白 40% | 白 12% |
| 顶部高光 | 白 30% | 白 9% |
| L3 填充 | 白 92% | `#221e2b` 96% |
| 强调文字 | `#6a6371` | `#a8a6b0` |

深色单独覆写 `background-image`，去掉浅色斜向反光；否则顶部会被抬亮，
11px 文字在 5.1.3 实测掉到 3.6:1。深色没有白色硬边（最大 20%，仅 hover）。

### 4.6 技术约束

- 只使用 `.v4-*`；V3 `.osb-*` 一行未改，样式隔离测试仍通过。
- `@supports not (backdrop-filter)` 时全部退化为实色，不假装透明。
- 模糊只加在面板级（L1/L2/L3），任务行只改背景色，不给每行单独 `backdrop-filter`。
- 无独立主题切换器，深色继续跟随 `body[data-ds-dark-theme]`。

### 4.7 对比度实测（32 个采样点，全部 ≥ 4.5:1）

- 浅色最低：`.v4-activity-time` 4.64:1；深色最低：`.v4-today-due` 5.77:1。
- 最高：`.v4-expand-title` 13.96:1。
- 本轮修正：`.v4-expand-meta` / `.v4-mini-label` 从 `text-3` 提到 `text-2`；
  `--v4-danger` 浅色 `#b3605f → #a34a49`、深色新增 `#d98a89`；
  `.v4-expand-hint` 去掉 0.62 透明度（原本实测 3.36:1），改为 `text-2` 常驻、hover 才用强调色。
- 采样脚本本身也修了一个 bug：Chrome 对 `color-mix` 返回 `color(srgb …)`，
  旧解析器把它当成黑色，会算出 1.31:1 的假告警。

---

## 5. 实际修改文件

### 新增

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `src/client/v4/workspace.tsx` | 150 | 统一交互状态 + 滚动锁 |
| `src/client/v4/Expandable.tsx` | 92 | 卡片内展开面板 |
| `src/client/v4/TaskComposer.tsx` | 178 | 弹层 / 内联共用的任务表单 |
| `scripts/ui/workbench-harness.tsx` | 201 | 工作台测试页（真组件 + 真 CSS） |
| `scripts/ui/workbench.test.tsx` | 383 | jsdom 交互测试 D1–D25 |
| `scripts/ui/workbench-browser.test.mjs` | 346 | 真实 Chromium 交互测试 26 项 |
| `scripts/ui/workbench-shot.mjs` | 182 | 5 视图 × 2 主题 × 3 宽度截图 |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/client/index.tsx` | 删除 classic 分支与 Hero；只渲染 `V4Shell` + 两页；移除 6 个 V3 组件引用 |
| `src/client/v4/Shell.tsx` | 工具栏重做；新建任务走弹层；迁移计划入口；`WorkspaceProvider` |
| `src/client/v4/Dashboard.tsx` | 八块内容全部可展开 / 可点；任务行内展开；知识记忆概览 |
| `src/client/v4/Tasks.tsx` | 行点击展开、hover 操作、统一表单；去掉页内项目下拉 |
| `src/client/v4/Detail.tsx` | 重写为 `OverlayHost`：抽屉 + 弹层 + Esc/遮罩/焦点/滚动锁 |
| `src/client/v4/DetailContent.tsx` | 8 种抽屉正文；统计/项目/日/知识/迁移计划；未开放明确说明 |
| `src/client/v4/ui.tsx` | `Sparkline` 增加 `onSelect`（可点 + 键盘） |
| `src/client/style/board.css` | 材质系统重写（2611 → 3545 行）；补齐此前**完全缺失**的 `.v4-drawer` / `.v4-detail` / `.v4-glass-3` 样式 |
| `src/client/hooks/useLocalStore.ts` | **缺陷修复**：动作发生时立即落盘（见 §8.1） |
| `scripts/register-check.mjs` | React stub 补 `createContext/useContext/useRef` 等 |
| `scripts/ui/components.test.tsx` | 加 `WorkspaceProvider` 包装；C32 / C44 断言更新 |
| `scripts/ui/glass-contrast.mjs` | 解析 `color(srgb …)`；采样选择器扩到 16 个；支持指定输出 |
| `scripts/ui/glass-harness.tsx` | 去掉已删除的 props |
| `TESTING.md` | 附 D：5.2 自动化命令与人工确认项 |

### 未修改（有意）

`src/client/lib/**`（除 `useLocalStore` 的写盘时机）、`src/client/types/**`、
`src/client/board/**`（V3 组件全部原样保留）、`cordis.patch.yml`、`scripts/build.mjs`、
存储 schema（仍是 `schemaVersion: 4`，14 个 key 不变）。

---

## 6. 新增交互及其数据链路

| 交互 | 触发 | 读 | 写 | 一致性 |
| --- | --- | --- | --- | --- |
| 指标 → 抽屉 | 点击 `.v4-stat-button` | `computeBoardStats` / `countStreak` | 无 | 与首页数字同源 |
| 今日任务行展开 | 点行主体 | `task.note/subtasks/focusedMinutes` | 无 | 一次只开一行 |
| 完成任务（首页 / 任务页 / 抽屉） | checkbox / 按钮 | — | `completeTask`：`tasks` + `daily` + `timeline` + `history` 快照 | Daily 与 Timeline 同一次动作 |
| 新建任务（弹层） | 顶部按钮 | `projects`（下拉） | `createTask`：`tasks` + `timeline` | 立即落盘，关闭浮层不丢 |
| 编辑任务（弹层 / 内联） | 编辑按钮 | 任务当前值 | `updateTask`：`tasks` | 不碰 `done/completedAt` |
| 删除任务（抽屉 / 行内） | 两步确认 | — | `removeTask`：六处级联 | 删完 Daily 回退、Timeline 记 `task.deleted` |
| 项目 → 抽屉 | 点项目行 | `allTasks/allLogs` + `projectRanking` | 无 | 归档项目也能看 |
| 折线点 / 逐日行 → 当日抽屉 | 鼠标 / Enter | `daily` + `logs` + `tasks.completedAt` | 无 | 三个来源同日对齐 |
| 知识与记忆概览 | 展开 / 抽屉 | `knowledge` + `memory` + `reviews` | 无（明确只读） | 不触发任何写入 |
| 迁移计划 | 顶部按钮 / 计时器入口 | 静态表 | 无 | 明确写「自动采集暂停」 |

所有写操作只经过 `useBoardActions`，页面组件自身零 `localStorage` 写入。

---

## 7. 自动化测试结果

### 7.1 全量结果

| 套件 | 命令入口 | 项数 | 结果 |
| --- | --- | --- | --- |
| TypeScript | `tsc --noEmit` | — | 0 错误 |
| Build | `node scripts/build.mjs` | 2 产物 | 成功（`lib/client.js` 309,850 B） |
| 挂载链路 | `register-check.mjs` | 13 | 13 / 13 |
| 逻辑冒烟 | `smoke.ts` | 415 | 415 / 415 |
| 组件（jsdom） | `components.test.tsx` | 46 | 46 / 46 |
| 工作台交互（jsdom） | `workbench.test.tsx` | 25 | 25 / 25 |
| 工作台（Chromium） | `workbench-browser.test.mjs` | 26 | 26 / 26 |
| 布局（Chromium） | `layout-browser.test.mjs` | 21 | 21 / 21 |
| 入口（Chromium） | `shell-browser.test.mjs` | 11 | 11 / 11 |
| Tasks 布局 | `tasks-browser.test.mjs` | 15 | 15 / 15 |
| Button 系统 | `button-browser.test.mjs` | 13 | 13 / 13 |
| 冲突横幅 | `conflict-browser.test.mjs` | 6 | 6 / 6 |
| V3 hover 回归 | `v3-hover.test.mjs` | 8 | 8 / 8 |
| **合计** | | **599** | **599 / 599** |

附加证据：

- 截图 30 张（Dashboard / Tasks / 抽屉 / 弹层 / 展开 × 浅深 × 1440/1100/720），
  横向溢出 **0** 张（`reports/wb-metrics.json`）。
- 对比度 32 个采样点全部 ≥ 4.5:1（`reports/wb-contrast.json`）。

### 7.2 本阶段新增的覆盖点

- 没有「经典」字样、没有 `role=tab` 双工作台、`.osb-card/.osb-hero` 数量为 0，
  但 V3 样式仍在注入（隔离而非删除）。
- 抽屉：宽度 440 / 贴右 / L3 材质（`blur(40px)` + 半透明 + 圆角）/ body 滚动锁 /
  初始焦点在关闭按钮 / 连续 Tab 不出浮层 / Esc 关闭后焦点回到触发按钮 / 点遮罩关闭。
- 弹层：居中 520 / 创建后立即刷新仍在（验证写盘不依赖组件存活）/ 与抽屉互斥。
- 任务页：行点击展开、操作区在展开后可见；编辑走同一份表单并写回；删除两步确认。
- 趋势点：`tabindex=0`，Enter 打开当日抽屉。
- reduced-motion：真实 Chromium 下 `transition-duration` 与 `animation-duration` 均为 0s。
- 720：抽屉 720×全高、无圆角、无横向溢出；弹层 `calc(100% - 20px)`。

### 7.3 未验证（必须如实标记）

| 项目 | 原因 | 状态 |
| --- | --- | --- |
| 真实 DSH 宿主内渲染 | 约束禁止启动 / 重启 DSH | **未验证** |
| 宿主滚动容器内的滚动锁行为 | 同上 | **未验证**（已同时锁 body 与 `.osb-page`，但未在宿主实测） |
| 宿主深色主题真实 token | 测试页模拟 `body[data-ds-dark-theme]` | **未验证**（token 与 5.1.3 同源） |
| 宿主快捷键 / 焦点管理冲突 | 同上 | **未验证** |
| 移动端触摸（无 hover） | 仅有 720 桌面视口 | 部分：行展开后操作区可见，未做真机 |

---

## 8. 未迁移功能与风险

### 8.1 已修复的真实缺陷（本阶段发现）

**症状**：从弹层新建任务、或在抽屉里删除任务后立刻关闭浮层，存储里没有变化。
界面显示成功，刷新后数据消失。

**根因**：`useLocalStore` 的写盘发生在提交后的 `useEffect`。调用方在同一次事件里
「写数据 + 卸载自己」（关闭弹层 / 抽屉），组件卸载导致这次更新连同 effect 一起被丢弃。
这不是测试环境的特例，真实浏览器同样发生（Chromium 复现后修复）。

**修复**：`update()` 在动作发生时立即 `writeStore`，effect 退化为兜底（失败重试 + 提示一次）。
契约未变：仍读时补齐、打开不写回、key 与信封格式不变。修复后 `smoke` 415 项与
jsdom 71 项全绿，并新增「创建后刷新仍在」这条浏览器断言防止回归。

### 8.2 未迁移能力（按影响排序）

| 优先级 | 能力 | 影响 | 现状 |
| --- | --- | --- | --- |
| P1 | 备份 / 导入 / 导出 / 恢复 | 迁移期间用户无法自救数据 | 数据与代码完整，入口在迁移计划里说明 |
| P1 | 自动采集 / 会话日志 | **自动采集暂停**：监听原本由 `SessionLog` 挂载，现无组件挂载它。已有日志不丢，但不会新增 | 迁移计划里显式写明「暂停」，不假装在采 |
| P1 | 专注计时器 | 无法开始新的专注 | 入口只说明未开放，无假按钮 |
| P2 | 子任务勾选 / 预估 | 只能看，不能改 | 需先补 `actions` 的 subtask / estimate 方法 |
| P2 | 项目写操作（新建/模板/归档/快照） | 只能切、不能管 | 数据层完整 |
| P2 | 阻碍记录 / 月度目标 / 上下文观测 / 调试 | 低频诊断能力不可达 | 建议统一收进 Settings |
| P3 | 学习日历 / 热力图 | 数据层就绪但从未有 UI（V3 也没有） | 随 History |
| P3 | 斜杠命令 | 解析保留，执行链路暂停 | 随 History / 采集恢复 |

### 8.3 其他风险

1. **V3 组件不再进入 bundle**（487,478 → 309,850 B，tree-shaking 的结果）。
   源码、样式、数据兼容逻辑都在仓库里，`components.test.tsx` 仍在直接渲染它们；
   但「保留代码」不等于「保留运行时」。这一点在报告里说清楚，避免误判为删除。
2. **hover 才出现的操作**在纯触摸设备上没有 hover；已用「行展开即显示操作区」兜底，
   但没有真机验证。
3. **统计口径只读复用**：Dashboard 与抽屉的数字来自同一批纯函数，若后续有人在
   组件里另写一套过滤，会出现两处不一致 —— 约束已写进代码注释。
4. **CSS 体积**：`board.css` 92.5 KB（含 V3 全量样式）。样式隔离达成，但传输体积未优化。
5. **`#classic` 直达链接失效**：这是产品决定，不是缺陷；旧书签会落到 Dashboard。

---

## 9. 下一阶段建议（不擅自开始）

按风险与依赖排序，建议下一阶段一次只做一个，每个都带「入口 + 空态 + 写链路 + 回滚说明」：

1. **Settings / Data（最高优先）**
   备份导出 → 导入预览 → 存储观测；放到工作台内部独立面板。
   目的：在迁移期给用户一条自救通道，先把 P1 风险降下来。
2. **Focus（独立阶段，不拆碎）**
   计时 / 暂停 / 短休长休 / 任务绑定 / 会话落库一起做；同时把采集监听搬到 Shell 级，
   恢复 F5，并在顶部或专注卡显示「采集中 / 已暂停」的真实状态。
3. **History**
   会话记录列表 → 完整时间轴（按日 / 按项目）→ 学习日历（`lib/heatmap` 已有数据层）。
4. **Tasks 收尾**
   先给 `actions` 补 `toggleSubtask / addSubtask / setEstimate / bindSession`，再开放 UI；
   子任务与预估不要在没有写链路时先做界面。
5. **Projects**
   新建 / 模板 / 归档 / 快照；快照导入要复用 `lib/snapshot` 的重编号映射，不要另写。
6. **Memory / Knowledge**
   记忆草稿必须保留「逐条勾选采纳」这一步；知识图谱先做列表 + 依赖，不急着画力导向图。

每阶段结束条件：`tsc` 0 错误、599 项自动化全绿、截图 0 溢出、对比度 ≥ 4.5:1、
宿主未验证项如实标注。

---

**本阶段到此停止。** 没有进入下一阶段，也没有为了让界面「看起来完整」而补假入口。
