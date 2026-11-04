# Phase 5.4 · 前置架构审计：History 与活动热力图

- 日期：2026-11-04
- 范围：`v4/`、`lib/repo`、`lib/timeline`、`lib/actions`、`lib/daily`、`lib/heatmap`、
  `hooks/useBoardData`、`hooks/useBoardActions`、`board/`、`DailyAggregate`、`TimelineEvent`、
  `SessionLog`、`Task`、`StreakDots`、`Sparkline`、现有 Dashboard 统计
- 方法：逐文件阅读 + 调用点核对 + 现有 smoke / 组件测试；结论标注「代码确认」或「未验证」。

---

## 1. 数据实体与写入链路

### 1.1 DailyAggregate（`types/v4.ts` + `lib/daily.ts`）

字段：`day`（本地 `YYYY-MM-DD`）、`focusMinutes`、`tasksDone`、`sessions`、`friction`。

| 字段 | 写入点 | 口径 | 删除时是否回退 |
| --- | --- | --- | --- |
| `focusMinutes` | `addFocusLog` → `applyDailyDelta(+minutes)` | 只来自 `kind === 'focus'` 的日志 | `deleteLog` / `deleteLogs` 按 `-minutes` 扣减 |
| `tasksDone` | `completeTask` / `reopenTask` / `deleteTask` → `syncDailyTasks` | **绝对数量**：当天 `completedAt` 的任务数（幂等） | 删除已完成任务会重算该天 |
| `sessions` | 非 focus 日志 +1 | 非 focus 日志条数 | **不回退**（`deleteLog` 对非 focus 直接返回） |
| `friction` | 新增阻碍 +1 | 阻碍首次出现 | 删除阻碍不回退（V3 既有行为） |

结论：
- 专注分钟与完成数**能够**准确反映当日活动，且删除任务 / 专注日志会同步。
- `sessions` 在删除非 focus 日志后会偏高（确认缺口，见 §5）。
- 保留上限 800 天（`BOARD_CONFIG.daily.maxDays`），覆盖 365 天视图。

### 1.2 Task

- `completedAt` 只在完成时写入、重开时清除（`completeTask` / `reopenTask`），可作为「当天完成」的唯一依据。
- 任务列表上限 500（`MAX_TASK_ENTRIES`）：超过后旧任务会被裁掉，**不能**把任务数组当成永远完整的历史。
- `done` 与 `completedAt` 在正常路径一致；导入的旧数据可能只有 `done`，`coerceTask` 会补 `completedAt`（无则为未完成）。

### 1.3 SessionLog

- `at` / `kind` / `minutes` / `projectId` / `taskId` / `source`。
- 有效专注 = `kind === 'focus' && minutes > 0`；`minutes` 缺失按 0。
- 日志上限 400（`BOARD_CONFIG.storage.logSoftLimit`）：**超过后旧日志会被裁掉**，
  因此「全量专注分钟」不能只读日志，必须以 DailyAggregate 为准。
- 非 focus 日志（message / code-block / tool-call / milestone / manual / friction）不计入专注分钟。

### 1.4 TimelineEvent

- `type` 白名单 17 种；`at`、`projectId?`、`refId?`、`title`、`detail?`。
- 由 Actions 在真实动作后写入（任务增删改完成、专注、阻碍、记忆、知识、快照）。
- 上限 1200 条（环形），只用于**明细展示**，不参与任何数量统计 —— 它与任务 / 日志是同一事件的两种表示。
- 删除任务 / 日志时**不会**删除历史事件（保留审计），因此列表里仍会出现「删除任务」这类事件，这是预期。

### 1.5 HistorySnapshot

- 每项目 12 条，记录任务 id 集合与计数，是**项目快照**，不是「按天的历史」。
- 本阶段不复用它做热力图数据源。

---

## 2. 现有聚合与热力图能力

### 2.1 `lib/heatmap.ts`（V4 早期实现，**当前没有 UI 使用**）

- `buildHeatmap(daily, year)`：按自然年生成 53 周，只读 `daily`。
- `levelOf(minutes)`：`BOARD_CONFIG.daily.thresholds = [1, 25, 60, 120]` 五档。
- 局限（本阶段必须解决）：
  1. 只按**专注分钟**着色，完成任务但没有 focus 日志的一天会被涂成 0；
  2. 只支持自然年，不支持 30 / 90 / 365 天滚动窗口；
  3. `currentStreak` 算了但没返回，`activeDays` 也只认 `focusMinutes > 0`；
  4. 用 `+86_400_000` 推进日期，跨夏令时会偏一小时（本地时区规则下会错格）。
- 可复用：`levelOf` 的阈值语义（本阶段把「活动分数」定义为等效专注分钟，直接复用它）。

### 2.2 Dashboard 现有统计

- `computeBoardStats`：今日完成 / 今日专注 / 连续天数（`countStreak`）。
- `countStreak` 口径：完成任务的日期 ∪ 有效 focus 日志日期；今天没活动时允许从昨天起算。
- `Sparkline` / `StreakDots`：只做 7 天展示，不承载 365 天。
- 结论：连续天数的**产品规则**已有先例（今天空则从昨天算），本阶段沿用，避免两处规则打架。

---

## 3. 时区、跨日与日期运算

- 全项目日期桶都用本地墙钟：`dayKey()` 基于 `getFullYear/getMonth/getDate`，不使用 UTC。
- `recentDayKeys` 用 `Date.setDate` 做日历运算，跨月 / 跨年 / 闰年正确。
- 现有 `buildHeatmap` 用毫秒加法，是本阶段要避开的写法；新实现全部用 `setDate`。
- 夏令时：本地日历日仍为 24 小时制日期桶；用 `setDate` 推进不会错格。
- 今日边界：以本地 00:00 为准；`useNow` 每 30 秒推进，跨零点后「今天」会自然切换。

---

## 4. 数据一致性与重复统计风险

| 风险 | 结论 | 本阶段处理 |
| --- | --- | --- |
| daily 与原始 focus 日志重复累计 | 若两者相加会翻倍 | 取 `max(daily, logsSum)`，不求和；不一致时标记 |
| 任务重复计数 | `tasksDone` 是绝对数；同一任务重开再完成只算一次 | 用实时任务数或 daily 绝对值，不做事件累加 |
| timeline 再次累加 | timeline 是任务 / 日志的镜像 | 只用于明细列表，不参与分数与统计 |
| 删除任务后仍显示完成 | `syncDailyTasks` 已回退 | 任务列表完整时用实时 `completedAt` 计数 |
| 删除日志后仍显示专注 | `deleteLog` 已扣减 | 用 `max(daily, logs)` 兜底 |
| 计划任务被当成完成 | 只读 `completedAt` | 不看 `dueAt` / `done` |
| 零分钟日志算有效 | `minutes <= 0` 排除 | 过滤 |
| 无效日期 | `dayKey` 产物定长，非法数据被 `coerceDaily` 丢弃 | 只信任 `YYYY-MM-DD` |

---

## 5. 审计发现的缺口（只修必要项）

| # | 缺口 | 影响 | 处理 |
| --- | --- | --- | --- |
| G1 | 删除非 focus 日志时 `daily.sessions` 不回退 | 「记录数」可能偏高 | 本阶段不用 `sessions` 作为唯一来源：日志完整时用实时条数；不完整时才取 `max(daily.sessions, 实时)` |
| G2 | 日志上限 400，旧日志会被裁掉 | 旧日期的「记录数」可能偏低 | 专注分钟与任务数走 daily，不受影响；记录数不足在页面上明确说明 |
| G3 | 任务上限 500 | 超限后任务数组不完整 | 任务数在列表完整时用实时值，超限时退回 daily 绝对值 |
| G4 | 旧 heatmap 用毫秒加法 | 夏令时错格 | 新模块全部日历运算；旧函数保留但不再被引用 |
| G5 | daily 无 projectId | 无法按项目过滤历史 | 历史页统计全部项目，并在页头说明；不伪造项目维度 |
| G6 | 时间轴不含「会话日志逐条」明细 | 列表覆盖不全 | 明确标注「会话日志只计入统计，明细随 Focus 阶段」 |

---

## 6. 可复用清单

- `levelOf()` 阈值：`[1, 25, 60, 120]`。
- `dayKey` / `recentDayKeys` / `formatDateInput` / `weekdayOfDayKey`。
- `useSpace.openDetail({ kind: 'day' })` 与 `DetailContent.DayDetail`（已有当天专注与完成任务）。
- `ExpandablePanel`（可选）、`Card`、`Button`、`.v4-*` 材质。
- `EVENT_META`（时间轴类型 → 中文标签）。
- `countStreak` 的产品口径（今天空则从昨天起算）。

---

## 7. 实施决策

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 新增纯函数模块 `lib/activity.ts`，不改造 `lib/heatmap.ts` | 旧函数无引用；新需求是滚动窗口 + 活动分数，硬改会破坏原语义 |
| D2 | 活动分数 = `focusMinutes + tasksDone × 25`（等效专注分钟） | 25 分钟 = 一个番茄；可解释、可回退到现有阈值 |
| D3 | 五档等级沿用 `[1, 25, 60, 120]` | 与既有 heatmap/配置一致，不新造标准 |
| D4 | 专注取 `max(daily, logs)`；任务在列表完整时取实时数 | 既不重复累计，又能反映删除 |
| D5 | 30/90/365 = 含今天的滚动窗口，周一对齐 | 与项目周起始一致 |
| D6 | 当前连续与最长连续都在所选窗口内计算，并在界面标注 | 满足「范围一致」要求，不偷换口径 |
| D7 | 日期详情复用统一 Drawer；热力图与列表都调用 `openDetail({kind:'day'})` | 不新写弹层 |
| D8 | 历史页为工作台第三个主视图（Dashboard / 任务 / 历史） | 365 天热力图 + 列表需要宽度；不挤 Dashboard |
| D9 | 列表按天分组、分页（每页 8 天），不一次渲染 1200 条 | 性能要求 |

---

## 8. 审计结论

- 数据足够支撑「每日完成数 / 专注分钟 / 连续天数 / 活跃天数」的真实统计；
- **不需要改 Storage Schema，也不需要改 Actions**；
- 唯一需要绕开的是 `daily.sessions` 的删除回退缺口与日志/任务上限，采用「实时优先 + 绝对值兜底」；
- 现有 `lib/heatmap.ts` 无引用，保留但不再扩展；新逻辑放进独立模块，便于单测。
