# V4 Phase 3.5 · P0.5 数据语义修正报告

> 版本 4.0.0-rc.1 ｜ 范围：连续记录口径、完成率去重、今日会话改名 + 视觉改造前置审计
> 未做：背景光晕、玻璃透明度、根作用域、按钮统一、统计卡微可视化

---

## 1. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/client/lib/stats.ts` | `countStreak` 口径重写：只认「任务完成」+「有效专注记录」 |
| `src/client/v4/ui.tsx` | `ProgressRing` 在环内渲染百分比数字 |
| `src/client/v4/Dashboard.tsx` | 移除「完成率 X%」文案，改「共 N 个任务」 |
| `src/client/board/Overview.tsx` | 「今日会话」→「今日记录」（仅文案） |
| `scripts/smoke.ts` | 新增 `[30]` 5 条连续记录断言 |
| `scripts/ui/components.test.tsx` | 新增 C20（环内 0% + 无重复文案）、C21（今日记录） |

未改：V3 业务逻辑、宿主 API、`package.json`、注册配置、schema、依赖。

---

## 2. countStreak：原逻辑与最终逻辑

**原实现的问题**（逐行读出来的）：

```ts
for (const task of tasks) {
  days.add(dayKey(task.createdAt))        // ← 创建任务就算一天
  if (task.completedAt) days.add(...)     // ← 完成也算（这条是对的）
}
for (const log of logs) days.add(dayKey(log.at))  // ← 消息/工具/代码块全算
```

后果：只要今天新建过一个任务，连续记录就 +1；一句普通对话也会被当成「学习」。截图里「0m 专注、0 完成、连续 1 天」正是这么来的。

**最终实现**：

```ts
for (const task of tasks) if (task.completedAt) days.add(dayKey(task.completedAt))
for (const log of logs) {
  if (log.kind !== 'focus' || (log.minutes ?? 0) <= 0) continue
  days.add(dayKey(log.at))
}
```

保留原有「今天没有则从昨天起算」的游标逻辑与 `dayKey`/`startOfDay`，时区口径不变。

---

## 3. 今日记录的实际数据来源

- Dashboard 的四张卡本来就没有「今日会话」，该指标在 **V3 概览卡**；
- 它的数据是 `computeBoardStats().sessionsToday`，即**当天非 focus 日志的条数**（对话/工具/代码块都算）；
- 因此只改文案为「今日记录」，**没有**把它包装成学习量；Dashboard 的四张卡分别是：今日打卡（任务）、当日专注（分钟）、连续记录（天）、本周专注（分钟），全部是学习量。

---

## 4. 新增测试与结果

| 用例 | 结果 |
| --- | --- |
| S1 仅创建任务不算学习记录 | ✅ |
| S2 昨天完成、今天无记录 → 1（截至昨天） | ✅ |
| S3 昨天完成 + 今天专注 → 2 | ✅ |
| S4 同一天多条只算一天 | ✅ |
| S5 消息与 0 分钟专注都不算 | ✅ |
| C20 环内显示 0%，文案不再重复完成率 | ✅ |
| C21「今日会话」改名「今日记录」 | ✅ |

---

## 5. 门禁结果

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| smoke | **403 / 403**（旧 398 全保留 + 5） |
| React 组件 | **21 / 21**（旧 19 全保留 + 2） |
| register-check | **13 / 13** |
| 生产构建 | exit 0，`lib/client.js` **428,443 B**（+303 B） |
| Chrome 冲突 6 场景 | 未改冲突代码，未重跑 |
| 真实 DSH | **未执行**本轮验收 |

---

## 6. 视觉改造前置审计结论

### 6.1 组件树（实际）

```
BoardPage (src/client/index.tsx)
├─ hero（V3，inline JSX）
├─ ProjectBar（V3 board/ProjectBar.tsx）
├─ <div class="v4-scope"> ViewTabs </div>      ← 只有 Tab 在作用域内
├─ view === 'v4' ? <Dashboard/> : <div class="osb-grid"> V3 五卡 </div>
│   └─ Dashboard 根节点自己再包一层 class="v4-scope"
├─ NoticeHost（V3 样式浮层）
└─ ConflictHost（V3 样式浮层）
```

**结论**：`.v4-scope` 目前出现两次且都只覆盖局部；hero 与项目条完全在作用域外，所以页面不会整体变成 V4。

### 6.2 样式边界

- `board.css`：全局 `.osb-*`，通过 `__OSB_CSS_TEXT__` 注入**一个** `<style>`；
- V4 tokens：同一文件里的字符串 `V4_TOKENS_CSS`，只在 `view === 'v4'` 时**追加注入第二个** `<style data-plugin-css=...v4-tokens.css>`；
- 命名空间不冲突（`osb-` vs `v4-`），但 V4 tokens **晚于首次渲染**，首帧可能无样式。

### 6.3 共享组件

| 类型 | V3 | V4 | 是否共享 |
| --- | --- | --- | --- |
| 按钮 | `.osb-btn` | `<Button>` + `.v4-btn` | ❌ 两套 |
| 卡片 | `.osb-card` | `<Card>` + `.v4-glass-*` | ❌ 两套 |
| 弹窗 | `ConfirmDialog`（`.osb-modal`） | 无 | ❌ 仅 V3 |
| 浮层 | `NoticeHost` / `ConflictHost` | 同左 | ✅ 但仍是 V3 样式 |

### 6.4 backdrop-filter 为什么「看不出来」

1. `.v4-glass-*` 的 `backdrop-filter` 确实生效，但**它背后没有可模糊的内容**：整个 V4 容器底层就是 `--v4-bg` 的浅色渐变，与卡片自身 0.42–0.46 的白色几乎同色；
2. 页面外层仍是 V3 白底，模糊边界与页面背景没有反差；
3. 结果：技术上「毛玻璃开着」，视觉上等于实色。
**所以下一步的关键不是调 blur 数值，而是先创造「有层次的背景」**（页面级光晕/色块）。

### 6.5 断点

`board.css` 只有 `1080px` 与 `720px`；V4 用内联 4 列 + 720 断点变 2 列。
**1100px 没有专门规则**（落在 4 列区间），这正是需要在真机确认的宽度。

---

## 7. 下一阶段建议改动的组件 / CSS

| 优先级 | 文件 | 改动 |
| --- | --- | --- |
| 1 | `src/client/index.tsx` | 给 BoardPage 根加 `data-view="v4"`（或条件 class），让 hero/项目条/内容区共享同一作用域；tokens 提前注入 |
| 2 | `src/client/v4/ui.tsx` | 新增页面级背景层（2 个低饱和色块 + blur）；卡片透明度/边框/阴影分两级；容器宽度 token |
| 3 | `src/client/style/board.css` | 追加 `.v4-page` 背景与布局规则；新增 `1100px` 断点；**不改 `.osb-*` 既有规则** |
| 4 | `src/client/v4/Dashboard.tsx` | 2×2 网格在 1100 变 2 列；四张统计卡统一微可视化（环/条二选一） |
| 5 | `src/client/v4/ui.tsx` + V3 按钮 | 用 V4 Button 映射 V3 主按钮，或仅在 V4 视图统一；不动 V3 DOM 结构 |
| 6 | `src/client/ui/NoticeHost.tsx` / `ConflictHost.tsx` | V4 视图下套一层 `v4-scope`，让浮层与主视觉一致 |

---

## 8. 未解决 / 待真机验收

| # | 项 | 状态 |
| --- | --- | --- |
| 1 | 真实 DSH 中连续记录数字变化（0m/0 完成应为 0 天） | **待你验收** |
| 2 | 环内 0% 在真机的字号与对比度 | 待验收 |
| 3 | 「今日记录」文案在 V3 概览的排版宽度 | 待验收 |
| 4 | 720 / 1100 / 1440 横向溢出 | 仍未验证（上轮只到 1080） |
| 5 | 视觉改造（背景、玻璃、作用域、按钮、统计卡） | 仅审计，未实施 |
| 6 | `weeklyGoal` 等其他 streak 使用点 | 只有 `computeBoardStats` 与 Dashboard 两处，已随口径更新 |
