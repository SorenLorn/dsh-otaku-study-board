# Phase 5.4 · History & Activity Heatmap 交付报告

- 版本：`4.0.0-rc.1`（构建产物 `lib/client.js` 427,041 B）
- 日期：2026-11-04
- 范围：历史页、30/90/365 天热力图、活动强度、连续统计、按天时间轴、日期详情
- 前置审计：`reports/PHASE-5.4-PRE-IMPLEMENTATION-AUDIT.md`
- 结论：**目标完成**；统计全部来自真实数据，未改 Storage Schema、未开发 Focus / 采集系统；
  新增 81 条断言，全套 **739 / 739** 通过；真实 DSH 宿主**未验证**（按约束未启动）。

---

## 1. 前置架构审计结果（摘要）

完整审计见 `PHASE-5.4-PRE-IMPLEMENTATION-AUDIT.md`。关键结论：

| 检查项 | 结果 |
| --- | --- |
| DailyAggregate 能否反映每日完成 / 专注 | **能**。专注只来自 focus 日志；完成数是绝对重算（`syncDailyTasks`），重开再完成不会重复计 |
| 删除任务 / 日志是否回退 | 完成数与专注分钟都会回退；**非 focus 日志的 sessions 不回退**（缺口 G1） |
| Task.completedAt | 完成写、重开清，可作为唯一完成依据 |
| SessionLog | `kind==='focus' && minutes>0` 才有效；日志上限 400，旧日志会被裁 |
| TimelineEvent | 17 类、1200 条环形；是任务 / 日志的镜像，**不能**再参与计数 |
| 时区 / 跨日 | 全项目本地墙钟；旧 heatmap 用 `+86_400_000` 推进日期，跨 DST 会错格 |
| 已有热力图 | `lib/heatmap.ts` 存在但**无 UI 引用**，只支持自然年、只按专注着色 |
| 已有历史能力 | 项目快照（`HistorySnapshot`）不是「按天历史」；没有 History UI |
| 重复统计风险 | daily 与日志相加会翻倍；timeline 再累加会重复 |
| 复用项 | `levelOf` 阈值、`dayKey`/`recentDayKeys`、`openDetail({kind:'day'})`、`EVENT_META` |

审计还确认：**不需要改 Schema，也不需要改 Actions**；唯一需要绕开的是 `daily.sessions`
的删除缺口与 400 / 500 条上限，采用「实时优先 + 绝对值兜底」。

---

## 2. 热力图的数据来源

数据全部来自真实实体，无演示数组、无推算：

```
DailyAggregate ── focusMinutes / tasksDone（长期聚合，抗日志裁剪）
Task.completedAt ── 当天完成数（列表完整时实时计数）
SessionLog ────── 有效 focus 日志（回退与交叉校验）+ 非 focus 记录条数
TimelineEvent ─── 只用于「当天活动 / 历史列表」明细，绝不参与分数与统计
```

具体规则：

| 字段 | 规则 | 为什么 |
| --- | --- | --- |
| `focusMinutes` | `max(daily.focusMinutes, Σ 有效 focus 日志分钟)` | 不相加，永不翻倍；daily 更多说明日志被裁，日志更多说明 daily 漏记 |
| `tasksDone` | 任务数 < 500 时用实时 `completedAt` 计数；达到上限时退回 `daily.tasksDone` | 删除任务要立即反映；超过上限后任务数组不再完整 |
| `activityCount` | `tasksDone + focus 记录数 + 非 focus 记录数` | 不读 timeline，避免镜像重复；daily-only 的日子按「至少 1 次专注」计下限 |
| `score` | `focusMinutes + tasksDone × 25` | 一个完成任务 ≈ 一个 25 分钟番茄，可解释 |
| `level` | 复用 `heatmap.levelOf()`：`[1, 25, 60, 120]` | 与既有配置一致，不新造标准 |

---

## 3. 活动强度公式与等级阈值

```
activityScore = focusMinutes + completedTasks × 25
```

- 权重来源：项目默认专注时长 25 分钟（`lastDurationMinutes` 的默认值），
  把「完成 1 个任务」折算成「1 个番茄的等效专注分钟」。
- 不使用「其他日志 × 权重」：会话 / 消息类日志反映的是过程，不是学习量；
  把它们计入分数会让「聊天多的一天」比「安静写了 2 小时的一天」更亮。
- 五档阈值（沿用 `BOARD_CONFIG.daily.thresholds`，**不是**科学标准，是产品规则）：

| 等级 | 分数区间 | 含义 |
| --- | --- | --- |
| 0 | 0 | 无活动 |
| 1 | 1–24 | 轻量（不足一个番茄） |
| 2 | 25–59 | 中等（1–2 个番茄） |
| 3 | 60–119 | 较高（约 2.5–4.5 个番茄） |
| 4 | ≥120 | 高强度（5 个番茄以上） |

颜色：低饱和玫瑰 5 档（浅色 `#f0dae1 → #96607a`；深色 rgba 0.24 → 0.86），
0 档是接近透明的底，不使用荧光绿、不给每格阴影、格子固定 12px。

---

## 4. 防止重复统计

| 风险 | 处理 |
| --- | --- |
| daily 与日志相加翻倍 | `max()` 而非求和；只在「日志比 daily 多」时标记 reconciled |
| 同一条日志被投递两次 | 按 `log.id` 去重（不同 id 的两次专注仍算两次） |
| timeline 再累加 | 代码路径根本不把 timeline 传给统计函数；只用于渲染明细 |
| 同一任务重开再完成 | 完成数用实时 `completedAt` 的绝对数量，不做事件 +1 |
| 计划任务当成完成 | 只读 `completedAt`，不看 `dueAt` / `status` |
| 零分钟日志 | `minutes <= 0` 直接排除 |
| 删除后仍显示旧统计 | 任务实时计数；专注取 `max(daily, logs)`，`deleteLog` 已扣 daily |
| 日志超 400 后记录数偏低 | 页面明确说明「记录数可能低于实际，专注分钟与任务数不受影响」 |

任务达到 500 上限时，`tasksSource='daily'`，并在 tooltip 中显示「聚合与原始记录不一致」
（仅当 daily 与实时值确实不同）。

---

## 5. 30 / 90 / 365 天范围实现

- 三个范围都是**含今天的滚动窗口**：30 → 今天与前 29 天；365 → 今天与前 364 天。
- 日期用 `recentDayKeys`（`Date.setDate`）生成，跨月 / 跨年 / 闰年 / 夏令时不会错格。
- 日历按**周一**对齐：首尾用 `inRange=false` 的空格补齐到整周；补齐格不参与统计。
- 月份标签放在「该周包含某月 1 日」的列上；365 视图通常出现 12 个标签。
- 切换到 30 / 90 天时重新计算整窗（不是裁切 365 的结果），分母同步变化。
- 365 天渲染 365 个 button + 最多 6 个补齐格；30 / 90 天只渲染对应数量。

实测（Chromium）：

| 宽度 | 格子数 | 页面横向溢出 | 热力图滚动 |
| --- | --- | --- | --- |
| 1440 | 365 | 无 | 不需要（742px 内容） |
| 1100 | 365 | 无 | 不需要 |
| 720 | 365 | 无 | **需要**（容器内滚动，显示「左右滑动查看全年」） |

---

## 6. 连续学习天数计算规则

- **活跃日**：`score > 0`，即当天有有效专注或完成过任务。
- **最长连续**：在所选窗口内扫描，遇到断档归零，取最大值。
- **当前连续**：
  1. 今天有活动 → 从今天往前数；
  2. 今天没有、昨天有 → 从昨天往前数（与 `stats.countStreak` 的产品规则一致，
     避免早上打开页面就显示 0）；
  3. 今天与昨天都没有 → 0。
- **范围一致**：两个连续指标都只在所选窗口内计算，界面标注「近 N 天」。
  40 天连续在 30 天视图里显示 30，不偷用全年数据。
- 不为了让数字好看延长记录：没有活动的日期一律断开。

---

## 7. 点击日期后的详情

- 热力图格子与历史列表的日期行都调用同一个 `workspace.openDetail({ kind: 'day', id })`，
  复用 Phase 5.2 的 L3 抽屉，没有新弹层。
- 抽屉内容：日期、专注合计、专注记录数、完成任务数、全部记录数、活动事件数、日聚合，
  以及「当天完成的专注」「当天完成的任务」「当天活动」（时间轴）三段明细。
- 空状态：没有记录时明确写「这一天没有 focus 记录 / 没有完成任务」，不伪造数据。
- 关闭后焦点回到触发的格子（`OverlayHost` 的 `returnFocus`），工作台滚动位置保持不变。

---

## 8. History 活动列表

- 数据：`TimelineEvent`（真实事件，最多 1200 条），按天分组、组内按时间倒序。
- 默认每页 8 天，点击「加载更早的 N 天」递增；不会一次渲染全部。
- 每天最多先显示 3 条，可展开其余；组头显示条数、当天专注与完成任务。
- 点击组头打开当天详情；没有记录时显示空状态。
- 明确标注：会话日志的逐条明细尚未迁移（只计入统计），不伪造事件。

---

## 9. 浅色 / 深色适配

- 只使用 `.v4-*`，跟随 `body[data-ds-dark-theme]`，没有第三套主题。
- 热力色阶是两套独立变量（浅色实色 / 深色半透明），深色不是浅色反色。
- tooltip 使用 L3 材质（`--v4-glass-3-fill` + 40px blur + 深投影），在玻璃卡片上方可见。
- 实测深色与浅色 level 3 背景不同；所有采样文字对比度 ≥ 4.5:1（历史页最低 4.91）。

---

## 10. 响应式与视觉测试结果

- 截图 42 张（6 个视图 × 2 主题 × 3 宽度）+ 历史 tooltip / 当日抽屉 / 720 深色 3 张 = 45 张，
  文档内共 48 张 `wb-*.png`；本轮 42 张矩阵 **0 横向溢出**。
- 720：热力图在 625px 容器里滚动 740px 内容，页面 `scrollWidth === clientWidth`；
  格子仍是 12px（未为了塞下而缩小）；统计从 4 列变 2 列。
- 1100：热力图完整显示，无滚动；统计 4 列。
- 1440：卡片宽 1040，热力图左对齐，右侧留白约 200px（GitHub 式布局，不强行拉伸）。
- 深色滚动条单独改为 6px 细条，避免默认浅色滚动条在深色玻璃上刺眼。

测试过程中修掉一个真实缺陷：`position: fixed` 的 tooltip 放在带 `backdrop-filter` 的卡片里时，
**卡片会成为 fixed 的包含块**，导致 tooltip 偏移且被裁剪。改为 portal 到 `overlayHost()`，
定位与视口夹取才正确。

---

## 11. 修改与新增文件

### 新增

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `src/client/lib/activity.ts` | 359 | 纯统计：窗口、分数、等级、连续、日历布局、时间轴分组 |
| `src/client/v4/History.tsx` | 423 | 历史页：统计带、热力图、tooltip、历史列表 |
| `scripts/ui/activity.test.ts` | 297 | 37 条纯函数断言 |
| `scripts/ui/history.test.tsx` | 233 | 16 条 jsdom 交互断言 |
| `scripts/ui/history-browser.test.mjs` | 337 | 28 条 Chromium 断言 |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/client/v4/Shell.tsx` | `V4Page` 新增 `history`；导航新增「历史」；历史页隐藏「新建任务」 |
| `src/client/index.tsx` | 渲染 `History` |
| `src/client/v4/DetailContent.tsx` | 当日详情补充活动事件数与「当天活动」列表；统一统计口径说明 |
| `src/client/style/board.css` | 历史页 / 热力图 / tooltip / 列表样式（3977 → 4464 行） |
| `scripts/ui/workbench-harness.tsx` | 支持 `page=history`；生成 365 天可复现数据；历史数据独立哨兵 |
| `scripts/ui/workbench-shot.mjs` | 新增 history 视图；溢出判定只认文档级滚动 |
| `scripts/ui/glass-contrast.mjs` | 采样页加 history 与 7 个历史选择器 |
| `scripts/register-check.mjs` | React stub 补 `memo` |
| `TESTING.md` | 附 F：5.4 命令、81 条新断言、人工确认 5 项 |

### 未修改（有意）

`DailyAggregate` / `TimelineEvent` / `SessionLog` / `Task` 结构与写入逻辑、`lib/daily`、
`lib/actions`、`lib/heatmap`（保留旧实现但不再引用）、Storage Schema、备份格式、
Dashboard 与 Tasks 页面结构。

---

## 12. TypeScript / Build / Smoke / React / Chromium 测试

| 套件 | 入口 | 项数 | 结果 |
| --- | --- | --- | --- |
| TypeScript | `tsc --noEmit` | — | 0 错误 |
| Build | `node scripts/build.mjs` | 2 产物 | 成功（427,041 B） |
| 挂载链路 | `register-check.mjs` | 13 | 13 / 13 |
| 逻辑冒烟 | `smoke.ts` | 415 | 415 / 415 |
| 组件（jsdom） | `components.test.tsx` | 46 | 46 / 46 |
| 工作台（jsdom） | `workbench.test.tsx` | 25 | 25 / 25 |
| 数据管理（jsdom） | `data.test.tsx` | 28 | 28 / 28 |
| 活动统计（纯函数） | `activity.test.ts` | 37 | 37 / 37 |
| 历史页（jsdom） | `history.test.tsx` | 16 | 16 / 16 |
| 工作台（Chromium） | `workbench-browser.test.mjs` | 26 | 26 / 26 |
| 数据管理（Chromium） | `data-browser.test.mjs` | 31 | 31 / 31 |
| 历史页（Chromium） | `history-browser.test.mjs` | 28 | 28 / 28 |
| 布局（Chromium） | `layout-browser.test.mjs` | 21 | 21 / 21 |
| 入口（Chromium） | `shell-browser.test.mjs` | 11 | 11 / 11 |
| Tasks 布局 | `tasks-browser.test.mjs` | 15 | 15 / 15 |
| Button 系统 | `button-browser.test.mjs` | 13 | 13 / 13 |
| 冲突横幅 | `conflict-browser.test.mjs` | 6 | 6 / 6 |
| V3 hover | `v3-hover.test.mjs` | 8 | 8 / 8 |
| **合计** | | **739** | **739 / 739** |

附加：对比度 73 个采样点全部 ≥ 4.5:1（历史页最低 4.91，全局最低 4.64）。

统计单元测试覆盖：0 / 1 / 7 / 30 / 365 连续；中间断档；跨月；跨年；闰年 2/29；
今天活跃 / 今天不活跃 / 仅昨天活跃；重复日志；daily 缺失；daily 少记；daily 多记；
删除任务；删除日志；任务上限回退；五档阈值；三种窗口边界；日历补齐；时间轴分组。

---

## 13. 未完成能力与风险

### 13.1 明确未做

| # | 未完成 | 原因 / 影响 |
| --- | --- | --- |
| 1 | 按项目过滤历史 | `DailyAggregate` 没有 `projectId`，按项目切会把聚合切成假数据；页面已标注「包含全部项目」 |
| 2 | 历史搜索 / 按类型筛选 | 本阶段不要求；时间轴 1200 条上限内可翻页 |
| 3 | 会话日志逐条明细 | 随 Focus 阶段的采集迁移一起做；当前只计入统计 |
| 4 | 自然年切换（2024 / 2025） | 本阶段是滚动 365 天，不是按自然年浏览 |
| 5 | 导出热力图图片 / CSV | 未要求 |
| 6 | 触摸长按 tooltip | 触摸点击直接打开当天详情；没有为长按另写交互 |

### 13.2 风险与已知偏差

1. **`daily.sessions` 删除不回退**（审计 G1）：本阶段用「日志完整时实时计数」绕开，
   但当日志超过 400 条后，记录数会回退到 `max(daily.sessions, 实时)`，仍可能偏高。
   没有修 `actions.deleteLog`，因为那会改变既有行为；建议在 Focus 阶段一并修正。
2. **记录数是下限**：daily-only 的旧日期（日志被裁）按「至少 1 次专注」计，tooltip 的
   「学习活动」可能小于实际专注轮数；专注分钟与任务数不受影响。
3. **任务上限 500 后无法感知删除**：此时完成数依赖 daily 的绝对值；如果某次删除没有同步
   daily（理论上不会），数字会偏高。tooltip 会提示「聚合与原始记录不一致」。
4. **状态栏 / 时区**：所有日期按本地墙钟；跨时区使用（例如出差改系统时区）会让同一条记录
   落到不同日期，这是项目既有语义，未在本阶段改变。
5. **性能**：365 个 button + memo 化格子；hover 只更新 tooltip 与两个格子的 `focused`，
   未做虚拟化（365 个 DOM 节点可接受）。未在低端设备实测。
6. **对比度**：热力图色块本身不是文字，未做 3:1 非文本对比度测量；0 档接近背景色是刻意设计。

---

## 14. 真实 DSH 宿主验证情况

**未验证。**

- 按约束没有启动或重启 DSH。
- 未验证项：宿主滚动容器中 `position: fixed` tooltip 的表现、宿主主题 token 的实际色值、
  触摸设备行为、宿主窗口在 720px 附近的最小宽度限制。
- 独立 Chromium 的 28 项结果不能替代宿主验收；交付说明中保持「未验证」。

---

**本阶段到此停止。** 未开发 Focus 计时器、未开发自动采集、未改 Storage Schema、
未恢复任何 Classic 入口、未进入 Phase 5.5。
