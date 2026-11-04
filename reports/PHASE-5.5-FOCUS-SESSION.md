# Phase 5.5 · Focus & Session 实施报告

> 日期：2026-11-04 · 范围：统一工作台的专注计时、任务绑定、专注记账、休息段、自动采集恢复
> 前置文档：`reports/PHASE-5.5-PRE-IMPLEMENTATION-AUDIT.md`（先审计后编码）
> 结论：**验收标准已满足**。真实 DSH 宿主未验证（按约束未启动），宿主侧一律标注未验证。

---

## 1. 前置审计（要点回顾）

审计发现四个必须先修的硬问题，全部在本阶段修掉了：

| 编号 | 问题 | 证据 | 处理 |
| --- | --- | --- | --- |
| A1 | **自动采集已断链** | `useSessionCapture` 唯一调用点是 `board/SessionLog.tsx`，该文件不在 bundle 里；`setCaptureStatus` 无人调用 | 新增根级 `CaptureBridge`（§9） |
| A2 | **目标时长当实际时长** | `useTimer.finish()` 用 `durationMinutes` 记 `minutes` | 改为按剩余时间反推（§3） |
| A3 | **日志无幂等键** | 每轮现生成 `createId('log')`，刷新重放/双标签各写一条 | 持久化 `roundId`（§4） |
| A4 | **`daily.sessions` 从不写入、删除也不回退** | `applyDailyDelta` 的全部调用点没有 `sessions`；`deleteLog` 对非 focus 只删数组 | 新增 `addSessionLog` + 删除回退（§7） |

审计同时确认：**不需要改 Storage Schema**。`SessionLog.taskId` 已存在，`focusedMinutes` 已在
`Task` 上，`DailyAggregate` 四字段够用。本阶段只给 `timer`（瞬态、不进备份）加了四个可选字段。

---

## 2. Timer 状态机

状态机抽成纯函数 `src/client/lib/focus.ts`：不读 `Date.now()`（时间作参数）、不碰存储、不碰 React。
界面上有六个状态，全部从 `TimerPersistedState` **派生**，没有新增表示状态的字段：

| 状态 | 判定 | 界面 |
| --- | --- | --- |
| `idle` | focus + 未跑 + 剩余 = 全长 + 没有 startedAt | 25:00 ·「开始专注」 |
| `running` | focus + running | 倒计时 ·「暂停 / 结束并记录」 |
| `paused` | focus + 未跑 + **startedAt 非空** + 剩余 > 0 | 「继续 / 结束并记录 / 取消」 |
| `completed` | focus + 未跑 + 剩余 = 0 | 「本轮完成 · 18 分钟」+ 下一轮 / 进入休息 |
| `break` | short/long + running | 休息倒计时 ·「暂停休息 / 跳过休息」 |
| `break-paused` | short/long + 未跑 | 「继续休息 / 结束休息」 |

两条容易踩错的细则：

- **`paused` 的判定不用「剩余 < 全长」**。刚开始就暂停（1 秒内）时 `ceil` 会把剩余取回全长，
  那一刻剩余 === 全长；按剩余判断会错认成 `idle`，用户再点「开始专注」会生成**新的 roundId**，
  那一轮就白记了。现在以 `startedAt` 为准（浏览器测试里正好撞到这条）。
- **`completed` 是持久态**：结算后剩余留在 0 而不是回满，刷新后仍然显示「本轮完成 · 18 分钟」。
  真实分钟另存 `lastMinutes`（剩余是 0 时 `全长 - 剩余` 会算成目标时长，不能拿它显示）。

允许的状态迁移（其余一律无副作用返回原状态）：

```
idle      --start--> running
running   --pause--> paused        running --end--> completed      running --tick=0--> completed
paused    --start--> running       paused  --end--> completed      paused  --cancel--> idle
completed --start--> running（新一轮）   completed --beginBreak--> break
break     --pause--> break-paused  break-paused --resume--> break
break（任意）--skipBreak--> idle（专注待机）   break --tick=0--> idle
```

**禁止项逐一对照**：不会有两个 running（`startRound` 在 running 时直接返回原状态）；
暂停期间剩余不减少（暂停时 `deadline` 清空、剩余冻结）；结束后重复写入被三道闸挡住
（`end()` 判状态、`endRound` 判状态、`addFocusLog` 比日志 id）；结束后不可能仍显示 running；
刷新不会恢复出错误状态（`restoreTimerState` + `focusStatus` 双重兜底）。

---

## 3. 时间戳与计时准确性

- **真实时间只来自 `deadline`**：`remaining = ceil((deadline - now) / 1000)`。
  250ms 的 `setInterval` 只负责刷新显示与「到点」判定，从不做 `seconds - 1`。
- 后台节流、标签页休眠、切页都不影响：回前台第一次 tick 就会纠正；另外监听
  `visibilitychange`，从后台回来时先补一次「是否已到点」。
- **实际专注分钟 = floor((全长 − 剩余) / 60)**。剩余只在跑着时减少，所以多段暂停天然累计，
  不需要额外的 `accumulated` 字段。
- **结束时刻 = min(now, deadline)**。电脑睡眠 3 小时再打开，真实结束点是 deadline，
  不是「打开页面的那一刻」——否则跨零点的那一轮会被算到第二天，热力图日期就错了。
- 不足 1 分钟不写记录，并给出「不足 1 分钟，本轮没有记入专注」的提示（不虚报）。
- 系统时间回拨：剩余夹到全长、`elapsed` 夹到 0，不会出现负分钟或负数日志。
- 超过 24 小时的残留计时沿用既有保护：重置且**不补记**（打开页面不会凭空多一段专注）。

---

## 4. 刷新恢复与幂等

`TimerPersistedState` 新增四个**可选**字段（`timer` 键是瞬态的，不进备份，不需要迁移）：

| 字段 | 作用 |
| --- | --- |
| `roundId` | 本轮唯一标识 = 日志 id，幂等键 |
| `lastMinutes` | 上一轮真实分钟（completed 态显示用） |
| `lastEndedAt` | 上一轮结束时刻 |
| `lastTaskId` | 上一轮绑定的任务 |

同时修掉一个旧缺陷：`restoreTimerState` 原来写 `startedAt: running ? startedAt : null`，
**暂停后刷新会把开始时间清空**——继续之后日志里的时间区间变成「继续的那一刻」。
现在只要「这一轮开始过、还有剩余」就保留。

幂等的三层：

1. `start()` 生成 `roundId` 并立即落盘；
2. `endRound` 先把状态写成 `completed`（`startedAt` 清空、`roundId` 清空）再回调；
3. `finishFocus` 用 `roundId` 作为日志 id，同 id 已存在时整个动作返回空。

老数据兜底：没有 `roundId` 的残留状态用 `focus-<startedAt.toString(36)>` 派生，
所以「同一轮」无论谁来结算都得到同一个 id。实测覆盖：双击结束、按钮连点三次、
`Page.reload()` 后重放、两个标签页同时结算。

---

## 5. 任务绑定

- 复用现有 `SessionLog.taskId`，**没有改 Schema**。
- 下拉里是「不绑定（自由专注）」+ 当前作用域内未完成的任务。
- 专注过程中可以换绑：**归属以结束那一刻的绑定为准**（界面写明了这句话）。
- 任务被删除后：`deleteTask` 会清掉日志上的 `taskId`，但日志本体、标题、分钟都保留；
  正在计时的任务被删掉时，日志照写，只是没有 `taskId`（实测 G17/G18）。
- 结束时同步任务副本：`focusedMinutes += 实际分钟`、`pomodoros += 1`。
  这两个字段在 `lib/stats.ts` 里已被明确定义为「按任务的展示副本，不参与任何总计」，
  所以不会与专注分钟重复计算。

---

## 6. SessionLog 写入链路

```
FocusPanel（useTimer 结算）
  → actions.finishFocus(result)            // 唯一写入入口
      → logs            幂等插入（id = roundId）
      → daily           focusMinutes += 实际分钟（dayKey(endedAt)）
      → tasks           focusedMinutes / pomodoros 累加
      → timeline        focus.completed（refId = 日志 id）
  → 存储（三个键各自立即写盘，写入失败会提示「记录写入失败」）
```

`finishFocus` 的四条口径：

- **实际分钟**：`result.minutes`（向下取整），不是目标时长；
- **幂等**：同 id 直接返回空结果，不会重复加 Daily、不会重复给任务加分；
- **不伪造**：`minutes < 1` 或没有 `roundId` 时整个动作返回空；
- **归属**：`task.projectId` 优先，其次当前活跃项目；项目名一并写进日志便于列表显示。

---

## 7. DailyAggregate 更新与删除回退

### 7.1 本阶段修掉的真实不一致

`rebuildDaily` 的口径是 `sessions = 非 focus 日志条数`，但：

- **没有任何写入路径写 `sessions`**（自动采集落库时只 `setLogs`）；
- **删除非 focus 日志完全不回退**（`deleteLog` 里 `if (log.kind !== 'focus') return { logs }`）。

结果：`daily.sessions` 在实际使用中恒为 0，而一旦有值（导入/重建）就再也降不下来。
Phase 5.4 只能在 `activity.ts` 里用「日志完整时以实时条数为准」绕过。

本阶段的修法（最小改动，口径统一）：

- 新增 `addSessionLog`：非 focus 日志 → `sessions + 1`，**绝不进 `focusMinutes`**；
- `deleteLog` / `deleteLogs`：非 focus 日志 → `sessions - 1`，focus 日志 → `focusMinutes - n`；
- 两者都走 `applyDailyDelta`，自带下限 0 夹取，重复删除不会变成负数。

配套更新了一条 smoke 断言（`D4`）：旧断言「删非专注日志时 daily 原样不动」正是这个缺陷本身，
现在改为「回退 sessions、不动 focusMinutes」。**不是为了让测试变绿而改断言，是把断言改对。**

### 7.2 一致性验证

- 写入三次专注 + 两条会话后，`daily` 与 `rebuildDaily(logs, tasks, friction)` 逐字段相等（G23/G38）；
- 删除专注日志 → `focusMinutes` 回退；删除会话日志 → `sessions` 回退；混合批量删除逐条回退；
- 重复删除返回空结果；
- 同一天多次专注累计正确（18 + 25 + 25 = 68）；
- 跨日归属用 `dayKey(endedAt)`（本地墙钟），睡眠跨午夜时用 deadline（§3）。

---

## 8. TimelineEvent

- 类型沿用白名单里的 `focus.completed`，标题在写入时渲染成短句（`专注 18 分钟：练习条件类型`），
  `refId` 是日志 id，`detail` 是真实时间区间。
- **时间轴不参与任何计数**（`activity.ts` 只用 daily + logs），所以不会出现「一次专注算三遍」。
- 自动采集的会话日志**不逐条写时间轴**（只有 `milestone` 写 `log.milestone`）：
  每条消息都进时间轴会把 1200 条的环挤爆，时间轴就没人看了。这是刻意的降噪，不是漏写。

---

## 9. 自动采集恢复

- 新增 `src/client/v4/CaptureBridge.tsx`，在 `BoardPage` 根节点渲染**唯一一次**。
  `useHarnessEvent` 用模块级 `activeDispose` 保证「同一时刻只有一组监听器」，
  所以绝不能多页面各挂一个（否则互相踢掉）。
- 复用 `useSessionCapture` 全链路：归一化 → 斜杠命令拦截 → 分类 → 项目/任务归属 →
  90 秒同主题合并 → 内容哈希去重 → 每秒限流。**没有扩大采集范围**。
- 落库走新的 `addSessionLog`（只计 `sessions`），与专注完全隔离。
- 状态反馈：`setCaptureStatus` 广播 → `useCaptureState`（`useSyncExternalStore`）→
  设置页「会话采集」卡显示通道状态；关闭开关立刻摘掉监听器，状态变「已关闭」。
- 斜杠命令：**只拦截不执行**（把 `/board-*` 从日志里摘掉，避免把命令记成学习记录）。
  执行通道仍待 Commands 阶段，报告里明确标注未迁移。

实测覆盖：事件落库 1 条、重复投递被合并、`source=auto`、`kind≠focus`、`daily.sessions +1`、
切到任务页后再推事件仍能采集、状态为 `on`。

---

## 10. Dashboard / History / Heatmap 联动

三个视图读的是同一份数据（`daily` + `logs`），没有第二套统计：

- **Dashboard**：今日专注从 50m → 68m（+18），今日统计与「专注」面板同步；
- **History**：当天热力图格子从 level 3 → 3（68 分钟 + 2 个完成任务 = 118 分等效），
  格子 `aria-label` 写明「专注 68 分钟」，当日详情里能看到新增的 focus 记录与时间轴；
- **Heatmap**：同一次写入，无额外同步代码。

浏览器测试把这条链路整个跑了一遍（结束专注 → 点「历史」→ 读当天的格子与统计），
并断言 daily 与日志两侧都变了。

---

## 11. 修改文件

**新增**

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `src/client/lib/focus.ts` | 359 | 纯状态机（状态派生、迁移、实际分钟、roundId、休息） |
| `src/client/v4/FocusPanel.tsx` | 411 | 专注面板（紧凑态 + 展开态，不新开页面/浮层） |
| `src/client/v4/CaptureBridge.tsx` | 90 | 自动采集的根级挂载点 |
| `src/client/hooks/useCaptureState.ts` | 12 | 订阅采集状态 |

**修改**

| 文件 | 改动 |
| --- | --- |
| `src/client/hooks/useTimer.ts` | 重写为 focus.ts 的 React 外壳；`end/cancel/beginBreak/resumeBreak/status`；先落状态再回调 |
| `src/client/lib/actions.ts` | 新增 `finishFocus`、`addSessionLog`；`deleteLog(s)` 回退 sessions |
| `src/client/hooks/useBoardActions.ts` | 暴露 `finishFocus`、`addSessionLog` |
| `src/client/lib/schema.ts` | `restoreTimerState` 保留暂停的 `startedAt`、读写 `roundId/last*` |
| `src/client/types/index.ts` | `TimerPersistedState.roundId / lastMinutes / lastEndedAt / lastTaskId`（均可选） |
| `src/client/lib/defaults.ts` | 默认计时状态补 `roundId: ''` |
| `src/client/lib/activity.ts` | `ActivityRange` 增加 `7`（专注面板复用同一套去重与计分） |
| `src/client/v4/Dashboard.tsx` | 「专注」面板换成 `<FocusPanel />`；删掉「计时器未开放」占位与两个不再使用的派生量 |
| `src/client/v4/Settings.tsx` | 新增「会话采集」卡（开关 + 实时状态 + 口径说明） |
| `src/client/v4/Detail.tsx` | 修 `TaskModal` 的 ref 传递（React 18 函数组件收不到 ref）；初始焦点优先给输入框 |
| `src/client/index.tsx` | `BoardPage` 挂 `<CaptureBridge />`（唯一实例） |
| `src/client/style/board.css` | 新增 `.v4-focus-*`（75 个规则）与 `.v4-capture-*`；脚注分界线；数字输入去箭头 |
| `src/client/board/FocusTimer.tsx` | 仅改一处字段名（`info.boundTaskId` → `info.taskId`），保持 V3 源码可编译 |
| `scripts/ui/workbench-harness.tsx` | 支持 `?timer=running18/paused/completed/break` 种子、`__focus/__click/__focusExpand/__pushEvent`、挂采集桥与 NoticeHost |
| `scripts/ui/glass-contrast.mjs` | 采样选择器加 9 个专注/采集元素（共 87 点） |
| `TESTING.md` | 追加附 G |
| `scripts/smoke.ts` | 更新 `D4` 断言到新口径（见 §7.1） |
| `scripts/ui/workbench.test.tsx` | 更新 `D23`：计时器不再是占位说明，而是真的能开始 |
| `scripts/ui/shell-browser.test.mjs` | 更新到当前产品：导航 3 项、新建任务开弹层不跳页、**断言没有任何经典入口** |
| `scripts/ui/layout-browser.test.mjs` | 导航条数断言从 `=== 2` 改为 `>= 2`（5.4 已加「历史」） |
| `scripts/ui/tasks-harness.tsx` | 补 `WorkspaceProvider`（此前该测试页渲染为空，6 项断言一直假绿/失败） |

> 关于最后四条：它们是**测试与产品不一致**，不是产品回退。`shell-browser` 仍在检查
> 「经典工具可进可回」，而 Phase 5.2 早就删掉了经典入口；`tasks-harness` 缺 Provider 导致
> 整页空白。本阶段把它们改到与当前产品一致，并在报告里列出改了哪几条、为什么。

---

## 12. 测试结果

| 套件 | 结果 |
| --- | --- |
| `tsc --noEmit` | **0 错误** |
| `scripts/build.mjs` | 成功，`lib/client.js` **507,716 B**（Phase 5.4 为 427,041 B） |
| `register-check.mjs` | **13 / 13** |
| `smoke.ts` | **415 / 415** |
| `components.test.tsx` | **46 / 46** |
| `workbench.test.tsx` | **25 / 25** |
| `data.test.tsx` | **28 / 28** |
| `activity.test.ts` | **37 / 37** |
| `history.test.tsx` | **16 / 16** |
| **`focus.test.ts`（新）** | **96 / 96** |
| **`focus-ui.test.tsx`（新）** | **63 / 63** |
| `workbench-browser.test.mjs` | **26 / 26** |
| `data-browser.test.mjs` | **31 / 31** |
| `history-browser.test.mjs` | **28 / 28** |
| **`focus-browser.test.mjs`（新）** | **61 / 61** |
| `layout-browser.test.mjs` | **21 / 21** |
| `shell-browser.test.mjs` | **12 / 12** |
| `tasks-browser.test.mjs` | **15 / 15** |
| `button-browser.test.mjs` | **13 / 13** |
| `conflict-browser.test.mjs` | **6 / 6** |
| `v3-hover.test.mjs` | **8 / 8** |
| **合计** | **960 / 960** |

其他量化结果：

- 截图：`workbench-shot` **42 张，横向溢出 0 张**；新增专注 8 张（idle / running / completed /
  break / 1100 / 720 / dark / settings）。
- 对比度：**87 个采样点全部 ≥ 4.5:1，低于阈值的 0 个**（新增 9 个专注/采集采样点）。
- 计时器布局稳定性：倒计时容器宽度在 idle 与 running、以及秒数变化前后均为 **132px**（不抖动）。
- 计时精度：可控时钟下 65 秒 → `23:55`；真实 Chromium 下 2 秒后 `25:00 → 24:58`。

`focus.test.ts` 覆盖（摘要）：idle/running/paused/completed/break 全迁移；多次暂停累计；
提前结束记实际分钟；重复结束；取消；到点自动结算；休息暂停/继续/跳过；短休长休切换；
刷新恢复（含暂停保留 startedAt）；后台节流；睡眠 3 小时与跨午夜；24 小时残留；
系统时间回拨；非法状态；以及 G 段的数据链路（幂等、任务副本、项目归属、
400 条日志、1200 条时间轴、混合删除、与 rebuildDaily 一致）。

---

## 13. 已知问题与风险

1. **「完成后不自动进休息」是有意的行为变更**。V3 是「专注结束 → 自动开始休息」，
   本阶段改成「停在 completed，由用户点『进入休息』或『开始下一轮』」。
   原因：需求 §8.4 要求完成态显示「实际专注时间 / 关联任务 / 开始下一轮 / 进入休息」，
   自动跳休息会让这个状态永远看不到。设置里的「完成后可进入休息」开关决定是否提供休息入口。
2. **离开 Dashboard 后计时器不再 tick**。计时状态在存储里（deadline 基准），回到 Dashboard 时
   会立刻补结算；但「结束时立刻写日志」只发生在面板挂载期间。极端情况：在历史页停留超过 24 小时，
   回来时该轮会被判为残留并**不补记**（既有保护）。要彻底解决需要把计时器上移到 Shell 级，
   属于下一阶段的结构性改动，本阶段未做。
3. **多标签页同时计时**：`timer` 键不走 `useLocalStore` 的冲突决议（它是瞬态、单独写者），
   后写覆盖先写。幂等键能保证**日志不重复**，但两个标签的倒计时可能不同步。
4. **`daily.sessions` 的历史数据**：修完之后新数据一致；此前被写坏/恒为 0 的老数据不在本阶段迁移，
   需要时可手工做一次「按日志重建 daily」（不做自动迁移：日志有 400 条上限，自动重建会把更早的历史抹平）。
5. **斜杠命令只拦截不执行**：`/board-*` 不会被执行，也不会进日志。执行通道仍待 Commands 阶段。
6. **自动采集的真实通道仍未知**：`HARNESS_EVENT_CANDIDATES` 是探测式绑定，宿主若不暴露这些
   事件名，只有 window 桥可用。本阶段验证的是「桥能通、链路能落库」，不是「宿主一定在推事件」。
7. **两处视觉细节**：数字输入去掉了 spinner（避免 "15" 显示成 "1"）；倒计时宽度固定 132px，
   超过 99 分钟会换行（当前时长上限 90 分钟，不会触发）。

---

## 14. 真实 DSH 宿主验证情况

**未验证。** 按本阶段约束（不启动/不重启 DSH）没有在宿主内加载新的 `lib/client.js`，因此以下
全部标注为未验证，不以独立 Chromium 的结果代替：

- 宿主内 `ctx.slots` 渲染的专注面板、宿主主题 token（`body[data-ds-dark-theme]`）下的取值；
- `ctx` / 宿主服务 上的真实事件通道是否绑定成功（`HARNESS_EVENT_CANDIDATES` 的探测结果）；
- 宿主滚动容器里的浮层与滚动锁行为；
- 宿主内全局 Storage 配额与写入失败路径。

已验证的等价范围：独立 Chromium（1440/1100/720、浅色/深色、真实刷新、真实点击/键盘/触屏、
reduced-motion）+ jsdom（59 条交互断言）。宿主侧需要在验收时按 `TESTING.md` 附 G 的六条
人工清单逐条确认。

---

## 15. 是否达到进入下一阶段的条件

**达到。** 理由：

- 最终验收标准逐条满足：启动 / 暂停 / 恢复 / 结束可用；任务可绑定且可中途更换；刷新后状态、
  剩余时间、绑定任务都正确恢复；每次有效专注都写入 SessionLog + DailyAggregate + TimelineEvent，
  并在 Dashboard / History / 热力图上同时可见（浏览器端逐条断言）。
- 数据安全维度：`minutes < 1` 不写、重复结算不写、任务被删不丢历史、删除日志回滚正确、
  写入失败有明确提示（不假装成功）。
- 960 条断言全绿，其中新增 220 条；没有删除任何旧测试，三条旧断言按新事实修正并说明了原因。
- 唯一遗留的结构性问题（计时器不在 Shell 级、采集通道未在宿主验证）已在 §13/§14 明确列出，
  不影响本阶段的验收标准。

**建议的下一阶段前置条件**（若进入 Projects / Commands / Knowledge）：

1. 在真实 DSH 宿主里跑一遍附 G 的六条清单，确认事件通道与主题；
2. 若要「专注结束立刻入库、无论用户在哪个页面」，需把 `useTimer` 上移到 `Shell` 级
   （本阶段有意留在 Dashboard，避免为跨页计时改一整套 Provider）；
3. `daily.sessions` 的历史修复入口，与「按日志重建 daily」放在同一个维护动作里做。

---

**本阶段到此停止。** 未开发项目管理迁移、未开发 Memory / Knowledge 编辑、未改 Heatmap 统计设计、
未恢复任何 Classic 入口、未引入第三方计时库、未自动进入 Phase 5.6。
