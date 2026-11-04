# Phase 5.5 前置审计 · Focus & Session

> 审计时间：2026-11-04 · 审计对象：`<repo>` 当前工作树
> 方法：直接读源码，不引用历史报告的结论；每条判断都附文件与行为证据。
> 结论先行：**自动采集确实已断链**，**计时器会把目标时长当作实际时长记账**，**日志没有幂等键**，
> **`daily.sessions` 没有任何写入路径、删除也不回退**。前两条不修，Focus 阶段做出来也是错的。

---

## 1. 现状：Focus / Timer

### 1.1 存在的东西

| 文件 | 行数 | 状态 |
| --- | --- | --- |
| `src/client/hooks/useTimer.ts` | 419 | 完整可用，但**只被 `board/FocusTimer.tsx` 引用** |
| `src/client/board/FocusTimer.tsx` | 317 | V3 卡片，Phase 5.2 起不进 bundle |
| `src/client/hooks/useSessionCapture.ts` | 225 | 只被 `board/SessionLog.tsx` 引用 |
| `src/client/hooks/useHarnessEvent.ts` | 356 | 只被 `useSessionCapture` 引用 |
| `src/client/hooks/useSlashCommand.ts` | 401 | 只被 `board/SessionLog.tsx` 引用 |

`grep -rn "useTimer\|useSessionCapture\|useSlashCommand" src/client` 的引用点全部落在
`src/client/board/` 下；而 `src/client/index.tsx` 只 import `v4/*`。**没有任何一个 V4 文件
引用它们** —— 三个 hook 目前在 bundle 里是死代码（esbuild 会 tree-shake）。

### 1.2 `TimerPersistedState` 够不够用

```ts
interface TimerPersistedState {
  running: boolean
  deadline: number | null
  durationMinutes: number
  boundTaskId: string
  startedAt: number | null
  remainingSeconds: number
  phase?: 'focus' | 'short' | 'long'
  roundInCycle?: number
  focusMinutes?: number
}
```

**时间戳口径是对的**：`computeRemaining()` 用 `deadline - Date.now()` 反推，250ms 的
`setInterval` 只负责刷新显示，`commit()` 只在状态边界写盘。后台节流、刷新、睡眠都不会让
「已经过去多久」失真。这一条不需要重做。

**缺三样，都必须补**：

1. **没有幂等键**。每轮专注没有稳定 id，`TimerCompleteInfo` 只有 `minutes/boundTaskId/startedAt/endedAt`，
   日志 id 由调用方 `createId('log')` 现生成。后果：
   - 连续两次点「结束」→ 第一次把 `startedAt` 清空，第二次走「没有开始时间」分支，侥幸不写；
   - 但**刷新重放**（deadline 已过、页面重开）会重新走 `finish()` 并生成**新 id** → 重复记一轮；
   - 两个标签页同时结算同一轮 → 各写一条，id 不同，`addFocusLog` 的幂等判断完全失效。
2. **`restoreTimerState` 在暂停时把 `startedAt` 清成 `null`**（`schema.ts` 里
   `startedAt: running ? startedAt : null`）。暂停 → 刷新 → 继续，日志的「开始时间」会变成
   「继续的那一刻」，`detail` 里的时间区间就错了。
3. **没有 paused / completed 语义**。`running=false` 同时表示「还没开始」和「暂停了」，
   UI 只能靠 `remainingSeconds < durationSeconds` 去猜，休息段同理。状态机需要显式化。

### 1.3 记账口径是错的（P0）

`useTimer.finish()`：

```ts
const minutes = clampDurationMinutes(current.durationMinutes, DEFAULT_DURATION_MINUTES)
const completed: TimerCompleteInfo = { minutes, ... }
```

`minutes` 是**目标时长**，不是实际专注时长。目标 25 分钟、专注 18 分钟手动结束，会记 25。
这正是需求 §5.1 明令禁止的行为。

实际时长其实**已经可以精确算出**，不需要新字段：
`elapsed = durationMinutes * 60 - remainingSeconds`（多段暂停会自动累计，因为暂停期间
`deadline` 被清空、剩余时间被冻结）。当前实现没有用它，只是没用而已。

### 1.4 休息段

`phase = 'short' | 'long'`，循环 `focus → break → focus`，`roundInCycle` 数到
`roundsBeforeLongBreak` 给长休。休息结束**不写 focus 日志**（`finish()` 的休息分支只回阶段）。
逻辑本身符合需求 §6，可以沿用；但休息段的「暂停/继续/跳过」在 V3 UI 里只暴露了「跳过」，
需要补暂停与结束。

---

## 2. 现状：数据链路

### 2.1 实体与字段（不需要改 Schema）

- `SessionLog` 已有 `taskId` / `projectId` / `minutes` / `kind` / `source` / `detail` —— 任务绑定、
  实际分钟、来源全部有位置。**任务绑定不需要动 Schema**。
- `DailyAggregate = { day, focusMinutes, tasksDone, sessions, friction }`。
- `TimelineEvent` 白名单里已有 `focus.completed`，`makeEvent` 会渲染短句。
- `Task` 已有 `focusedMinutes` / `pomodoros` / `completedAt`。

### 2.2 `addFocusLog` 做了什么、没做什么

```ts
export function addFocusLog(input) {
  if (input.logs.some(log => log.id === input.log.id)) return {}   // 按 id 幂等
  const minutes = Math.max(0, Math.round(input.log.minutes ?? 0))
  const logs = [input.log, ...input.logs]
  const daily = applyDailyDelta(input.daily, dayKey(at), { focusMinutes: minutes }, at)
  const timeline = pushEvent(...'focus.completed'...)
  return { logs, daily, timeline }
}
```

- 幂等只在「同 id」这一层有效，而 id 是调用方现生成的 → 实际不幂等。
- **不更新任务**。V3 是 `FocusTimer` 自己 `setTasks` 累加 `focusedMinutes` + `pomodoros`。
  迁移后如果 UI 不写，任务「已专注」永远停在旧值；如果 UI 自己写，就绕过了动作层。
- 没有「实际分钟 ≤ 0 不写」的保护，`minutes=0` 也会落一条日志并写时间轴。

### 2.3 `deleteLog` / `deleteLogs`

```ts
if (log.kind !== 'focus') return { logs }          // ← 非 focus 日志：只删数组
```

`rebuildDaily` 的口径是 `sessions = 非 focus 日志条数`。而删除路径对非 focus 日志
**完全不动 daily** → 删除会话日志后 `daily.sessions` 永久偏高。这是 Phase 5.4 审计记为
「`daily.sessions` 删除非 focus 日志后可能不回退」的问题，**至今未修**，`activity.ts` 里只能
用「日志完整时以实时条数为准」绕过。

### 2.4 更基础的问题：`daily.sessions` 从来没有被写过

`applyDailyDelta` 的全部调用点（`grep` 结果）：

| 位置 | 字段 |
| --- | --- |
| `addFocusLog` | `focusMinutes` |
| `addFriction` | `friction` |
| `deleteLog` / `deleteLogs` | `focusMinutes`（负） |
| `syncDailyTasks` / `completeTask` / `reopenTask` / `deleteTask` | `tasksDone`（绝对值） |

**没有任何一处写 `sessions`**。也就是说 `daily.sessions` 只有三种来源：导入的备份、
`rebuildDaily` 的手动修复、以及测试种子。真实使用中它恒为 0。
原因是自动采集的落库路径（V3 `SessionLog.tsx`）只 `setLogs`，从来没碰过 daily。

### 2.5 日志 400 条上限

`coerceLog` 的读取路径按 `MAX_LOG_ENTRIES = 400` 截断，写入路径不截断。
所以第 401 条之后 F5 会丢掉最旧的记录。这是既有设计（daily 承担长期聚合），
本阶段**不改**，但要求：**focus 日志写入时必须同步 daily**，否则被裁掉后热力图会掉数据。

### 2.6 删除任务与历史日志

`deleteTask` 会把受影响日志的 `taskId` 删掉，但保留日志本体与标题。符合需求
「已删除任务的历史日志不能因此丢失」。**不需要改**。

---

## 3. 现状：自动采集（P0 断链）

### 3.1 事实

- `useSessionCapture` 的调用点只有 `board/SessionLog.tsx:104`。
- `SessionLog.tsx` 不在 `index.tsx` 的 import 图里 → **监听器没有任何挂载点**。
- `setCaptureStatus()` 的调用点也只有 `useSessionCapture` 内部 → 状态恒为 `off / 未开始监听`。
- `emitHarnessEvent()`（window 桥）仍然存在且可导出，但没有消费者。

结论：**Phase 5.2 移除 SessionLog 卡片时，监听器一起消失了，且至今没有恢复。**
历史报告里写的「自动采集暂停」是准确的，不是过期结论。

### 3.2 生命周期风险（迁移时必须一并处理）

读 `useHarnessEvent` 的实现，三个真实风险：

1. **模块级单例 `activeDispose`**：新实例挂载时先执行旧实例的 cleanup，再绑定。
   设计意图是「永远只有一组监听器」。但**同一页面两个实例同时挂载**时，
   后挂载的会把先挂载的摘掉 —— 所以**只能有一个挂载点**，不能「顺手在 Dashboard 也挂一个」。
2. **`useEffect` 依赖 `[ctx, enabled, debounceMs]`**：`ctx` 是对象引用，如果调用方每次渲染
   传一个新对象字面量，会不停重绑。`BoardPage` 的 `ctx` 来自 props（稳定），可以接受；
   但 capture 桥必须把 `rules` / `projectId` / `taskId` 放进 ref，不能进依赖。
3. **去重是两层的**：`useHarnessEvent` 按内容哈希挡「重复推送」，`mergeLogDraft` 按
   `(type, kind, project, title)` 在 90 秒内合并。两层都在，迁移时不能只留一层。

### 3.3 与手动 Focus 的边界

`kind` 语义已经很清楚：`focus` = 用户主动计时，其余（`message` / `code-block` /
`tool-call` / `milestone` / `manual` / `friction`）= 自动采集或手动记录。
`stats.focusMinutesOn` 只累加 `kind === 'focus'`，所以自动记录**不会**污染专注分钟。
本阶段要守住这条，不做任何「按消息数折算分钟」的事。

---

## 4. 现状：UI 与存储

### 4.1 UI

- `Dashboard` 的「专注」`ExpandablePanel` 里，按钮现在打开
  `openDetail({ kind: 'unavailable', title: '专注计时器', ... })` —— 明确标注未开放。
  这是 Phase 5.5 要替换的位置，**不需要新页面、不需要新浮层**。
- `ExpandablePanel` 的 `actions` 槽位可以放按钮，`summary` 常驻、`detail` 展开后才挂载。
  计时器放在 `summary` 会一直可见，但会挤占「今天 / 本周 / 峰值」的数字；
  放在 `detail` 则要先点一次展开。取舍见 §7。
- `WorkspaceProvider` 已有 `expandedId`（同组唯一）、`openDetail`、`openModal`，
  不需要新增浮层类型。

### 4.2 存储

- `useLocalStore.update()` 已经是「动作发生即写盘」，effect 兜底（Phase 5.2 修的）。
- `useTimer` **不走** `useLocalStore`，它直接 `writeStore(STORAGE_KEYS.timer)` 并自己
  `readStoreEnvelope`。好处是没有双写者；代价是**计时状态不参与跨标签冲突决议**
  （`dirty / conflict` 只在 `useLocalStore` 里）。多标签同时计时 = 后写覆盖先写。
  这一条本阶段**只记录不修**（见 §8）。
- `timer` 键不在 `BACKUP_KEYS` 里 → 导入导出不带计时状态。刷新恢复靠 localStorage，
  跨设备不恢复。符合「瞬态」定位。

---

## 5. 必须修 / 可绕过 / 需迁移

### 必须修（本阶段内，最小范围）

| # | 问题 | 修法 | 风险 |
| --- | --- | --- | --- |
| F1 | `finish()` 用目标时长当实际时长 | `elapsed = duration*60 - remaining`，取整分钟，`< 1 分钟`不写 | 无，纯计算 |
| F2 | 日志没有幂等键 | 计时状态加可选 `roundId`（`timer` 键不进备份，无迁移） | 旧状态缺字段 → 读取时补 `''` |
| F3 | 暂停刷新丢 `startedAt` | `restoreTimerState` 保留 `startedAt`（仅 focus 且 `remaining < duration`） | 旧数据无影响 |
| F4 | 没有显式状态机 | 新增纯函数 `lib/focus.ts` 派生 `idle/running/paused/completed/break` | 无，不改字段语义 |
| F5 | `deleteLog` 不回退 `sessions` | 非 focus 日志 `applyDailyDelta({ sessions: -1 })` | 已扣过的历史数据会偏低；`rebuildDay` 可修 |
| F6 | `sessions` 从不写入 | 新增 `addSessionLog` 动作（logs + sessions + 可选时间轴） | 与 F5 配套，口径统一为「非 focus 条数」 |
| F7 | 采集监听器无挂载点 | `v4/CaptureBridge.tsx` 挂在 `BoardPage` 根（全局单实例） | 必须保证只有一个挂载点 |
| F8 | 专注不更新任务 | `finishFocus` 复合动作里同步 `focusedMinutes += minutes`、`pomodoros += 1` | 与 V3 语义一致；`stats` 明确它只是展示副本 |
| F9 | `minutes = 0` 也写日志 | 动作层拒绝 `minutes <= 0` 的 focus 日志 | 无 |

### 可以安全绕过（本阶段不修，写进报告）

- **`daily.sessions` 的历史偏低/偏高**：`activity.ts` 已经用「日志完整时优先实时条数」兜住；
  修完 F5/F6 后新数据一致，老数据可用 `rebuildDay` 修。不做批量迁移。
- **400 条日志上限**：既有设计，daily 承担长期聚合。不新增策略。
- **`Task.pomodoros` 的 V1 语义**（`pomodoros × 25`）保持不变，只在新写入时 +1。
- **`ViewTabs` 死代码**：与本阶段无关，不动。

### 需要后续数据迁移（本阶段不做）

- 若某天要「从日志重算全部 daily」，应提供一键修复入口而不是自动跑 —— 自动跑会在日志被
  400 条裁掉的情况下把历史抹平。这属于 Maintenance 阶段。

---

## 6. 本阶段的数据链路设计（实施前定稿）

```
FocusTimer.start()
  → 生成 roundId，写 timer{running, deadline, startedAt, roundId}
  → tick 只改显示，不改存储

pause()  → remaining = deadline - now，running=false，startedAt 保留
resume() → deadline = now + remaining*1000
end()    → 实际分钟 = floor((duration*60 - remaining)/60)
           → 先写 timer{finished}（清 startedAt，保证重放不二次记账）
           → finishFocus({ log: {id: `focus-${roundId}`, minutes: 实际, taskId, projectId} })
                → logs 幂等插入（同 id 直接返回）
                → daily.focusMinutes += minutes
                → task.focusedMinutes += minutes, pomodoros += 1
                → timeline: focus.completed
cancel() → 丢弃本轮（不写日志、不写 daily、不写时间轴）

break 段：short/long，不写 focus 日志，不碰 daily。
```

**幂等边界**：`roundId` 在 `start()` 时生成并持久化，`end()` 用它拼日志 id。
无论重复点击、刷新重放、双标签，都以同一条 id 写入，`addFocusLog` 的同 id 判断挡下重复。

**跨日归属**：`dayKey(log.at)`，`at` 用 `endedAt`（本地墙钟），与 `rebuildDaily` 一致。

---

## 7. UI 落点（不改 Dashboard 结构）

选**方案 A：`summary` 常驻紧凑态 + `detail` 展开完整态**。

- `summary`：一行 `25:00` + 状态标签 + 「开始 / 暂停 / 结束」主按钮 + 绑定任务名。
  默认状态也在这里显示「今天 50 分钟」。用户不展开也能开始计时。
- `detail`：时长选择、任务下拉（含「不绑定」）、本轮进度、休息控制、最近 3 条专注记录。
- 不新增页面、不新增 Modal、不新增 Drawer 类型；点「今天 N 段专注」仍然走 `kind: 'day'`。
- 计时数字用 `tabular-nums` + 固定宽度，避免每秒跳动导致布局抖动。

---

## 8. 已知风险（实施前就承认的）

1. **多标签页计时**：`timer` 键不走 `useLocalStore` 的冲突决议，后写覆盖先写。
   幂等键能保证「日志不重复」，但两个标签各自的倒计时可能不同步。
2. **睡眠 > 24 小时**：`restoreTimerState` 判定为残留，直接重置且**不补记**（既有保护，
   避免打开页面凭空多出一段专注）。睡眠 2 小时回来会正常结算。
3. **采集通道在真实宿主里可能仍是 `none`**：`HARNESS_EVENT_CANDIDATES` 是探测式绑定，
   宿主若不暴露这些事件名，只有 window 桥可用。**不能宣称「自动采集已在真实 DSH 里验证」**。
4. **真实 DSH 宿主未验证**：按约束不启动 DSH，所有结论来自独立 Chromium + jsdom。
5. **`daily.sessions` 语义收窄**：本阶段之后它明确等于「非 focus 日志数」，
   与旧备份里可能存在的其它含义并存 —— 只影响展示，不影响热力图（热力图只用 `focusMinutes`）。

---

## 9. 实施清单（按依赖排序）

1. `src/client/lib/focus.ts`（新，纯函数：状态派生、转移、实际分钟、roundId）。
2. `src/client/hooks/useTimer.ts`（扩展：`roundId` / `status` / `end` / `cancel` / 精确分钟 / 保留 `progress`）。
3. `src/client/lib/schema.ts`（`restoreTimerState` 保留 `startedAt`、读 `roundId`）。
4. `src/client/types/index.ts`（`TimerPersistedState.roundId?`、`TimerCompleteInfo.roundId`）。
5. `src/client/lib/actions.ts`（`finishFocus` 新、`addSessionLog` 新、`deleteLog(s)` 回退 `sessions`）。
6. `src/client/hooks/useBoardActions.ts`（暴露新动作）。
7. `src/client/v4/FocusPanel.tsx`（新，UI）。
8. `src/client/v4/CaptureBridge.tsx`（新，根级采集）。
9. `src/client/v4/Dashboard.tsx` / `index.tsx` / `Settings.tsx` / `board.css`（接线与样式）。
10. 测试：`focus.test.ts`（纯状态机 + 链路）、`focus-ui.test.tsx`（jsdom）、`focus-browser.test.mjs`（Chromium）、
    `smoke.ts` 追加口径断言、`workbench-harness.tsx` 支持 focus 场景。
11. `reports/PHASE-5.5-FOCUS-SESSION.md`。

**明确不做**：不改 Heatmap 统计设计、不改 Dashboard 结构、不恢复 Classic、不新建第二套浮层、
不迁移项目管理/记忆编辑、不引入第三方计时库、不自动进入 Phase 5.6。
