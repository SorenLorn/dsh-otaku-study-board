# Phase 4B.3 · V4 Dashboard 统计卡微可视化

> 日期：2026-11-03 ｜ 版本 4.0.0-rc.1
> 范围：只改 Dashboard 的信息表达；未改统计口径、玻璃/背景/断点/Button System/V3。

---

## 1. 逐卡审计

| 卡片 | 当前数据 | 来源 | 时间范围 | 历史趋势 | 空态 | 是否加微可视化 |
| --- | --- | --- | --- | --- | --- | --- |
| 今日打卡 | `tasksDoneToday / tasksTotal` + 完成率环 | `computeBoardStats` | 今天 | 无 | 无任务时提示「还没有任务」 | 保留现有 ProgressRing，不重复加图 |
| 当日专注 | `focusMinutesToday` | `computeBoardStats` | 今天 | 无 | 0m 时提示「开始一轮计时」 | **不加**（避免与本周/近 7 日重复） |
| 连续记录 | `countStreak` 天数 | `countStreak`（完成任务或有效专注） | 当前连续段 | 无直接历史 | 0 天时干净显示 | **新增 7 日活跃点**（真实布尔） |
| 本周专注 | 近 7 日 Daily 合计 + 活跃天数 | `daily` | 最近 7 天 | 有 | 0m 时无合计 | 保留现有 Sparkline |
| 今日任务进度 | 完成率 + 未完成任务列表 | `board.tasks` | 今天/当前 | 无 | 整卡 Empty State | 保留 ProgressBar；0% 有数字 |
| 近 7 日专注 | 每日 `focusMinutes` | `daily` | 最近 7 天 | 有 | 不画轴，只给空态 | Sparkline 每点加真实 tooltip + 峰值 |
| 项目概览 | 全部项目（含零投入）+ 分钟 + 完成/总数 | `projectRanking(includeEmpty)` + `board.tasks` | 全部时间 | 无 | 无项目时 Empty State | 行内补「完成 x/y」，不新增图表 |
| 当日会话构成 | **Dashboard 没有这张卡** | V3 `Stats` 的 `PieChart` / `sessionsToday` | 今天 | 无 | 无记录时纯文字 | 本阶段**不改**，也不搬到 Dashboard |

> 「当日会话构成」在 V3 经典页，不在 V4 Dashboard；按「不改 V3」的约束，本阶段没有动它，也没有为了凑数在 Dashboard 新增一张卡。

---

## 2. 实际改动

| 文件 | 改动 |
| --- | --- |
| `src/client/v4/ui.tsx` | `Sparkline` 增加 `labels / ariaLabel`，每个点带 `<title>`（日期 + 分钟）；新增 `StreakDots`（7 个点，实心=有记录） |
| `src/client/v4/Dashboard.tsx` | 连续记录卡接入 7 日活跃点；近 7 日增加峰值文案与逐点 tooltip；项目行显示「完成 x/y」（真实任务数） |
| `scripts/ui/components.test.tsx` | 新增 C33–C36 |
| `scripts/ui/layout-harness.tsx` | 测试数据补上 focus 日志，避免「7 天 Daily 有数据但 streak 只有 1」的假象 |

生产 CSS **零修改**：没有动 token、玻璃、渐变、blur、断点。

---

## 3. 视觉与数据原则

- 只有「连续记录」和「近 7 日」带图形；今日打卡沿用环，其余不加图，避免每张卡都长一样；
- 所有图形来自真实数据：
  - 活跃点 = 当天有 `completedAt` 或 `focus minutes > 0` 的日志；
  - Sparkline 点值 = `daily[day].focusMinutes`；
  - 峰值 = 这 7 个真实值的最大项；
  - 项目 `完成 x/y` = 该项目真实任务完成数 / 总数；
- 0 天时 7 个点全部空心，没有动画或假填充；0m 时近 7 日仍是空态，不画轴。

---

## 4. 测试

### 组件（jsdom + RTL）

新增：

- C33 Sparkline 每个点带真实日期与分钟；
- C34 连续记录 7 个点，只有 3 个真实活跃日被填充；
- C35 全无记录时 7 个点全部空心；
- C36 项目卡显示真实「1/2」。

结果：**36 / 36 通过**（原 32 条全保留）。

### 浏览器（真实 Chromium，1440 / 1100 / 720）

- **21 / 21 通过**；
- 三档无横向溢出、无越界元素、Tab/按钮不裁切、卡片内部无溢出；
- 720 下统计卡 2 列、Dashboard 单列；新增的点/峰值没有撑破卡片。

### 其他门禁

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| smoke | **403 / 403** |
| React 组件 | **36 / 36** |
| register-check | **13 / 13** |
| production build | exit 0，**434,161 B**（4B.2 时 431,697 → +2,464 B） |
| Button 浏览器测试 | 13 / 13（本轮未改 Button，沿用上一轮结果） |

---

## 5. 浅色 / 深色

- 浅色：浏览器截图（`reports/layout-harness-1440.png` 等）已更新，点、折线、项目条正常；
- 深色：新图形全部使用 `--v4-accent` / `--v4-border-strong` / `--v4-text-3`，这些 token 在 4A.4 已验证跟随 `body[data-ds-dark-theme]`；但**本轮没有单独做深色截图**，标记为未验证。

---

## 6. V3 回归

- 未修改任何 V3 组件、`.osb-*` 规则或 V3 图表；
- smoke 403 全绿；
- 「当日会话构成」的 V3 空态仍保持 4A.2 的纯文字处理。

---

## 7. 尚未解决

| # | 项 | 说明 |
| --- | --- | --- |
| 1 | 真实 DSH 宿主未测 | 上述浏览器测试是独立 Chromium 页面，不是宿主 |
| 2 | 深色下新图形未截图 | 依赖 token，但未实机看 |
| 3 | 项目列表只显示前 3 个 | 计数是全量；超过 3 个项目时列表不全 |
| 4 | 连续记录点依赖日志（400 条上限） | 与 `countStreak` 口径一致，但极老记录被裁剪后点会减少 |
| 5 | 当日会话构成仍在 V3 | 按约束不迁移、不改口径 |
| 6 | 微图形未加动画 | 刻意保持克制，也避免 reduced-motion 分支复杂化 |

---

## 8. 结论

Dashboard 的统计卡现在能在一眼内表达「今天完成了多少、连续多久、这周什么时候在学、项目投入与完成比例」，且所有图形都有真实数据来源。没有把每张卡都做成图表，也没有引入依赖。停在这里，不进入下一阶段。
