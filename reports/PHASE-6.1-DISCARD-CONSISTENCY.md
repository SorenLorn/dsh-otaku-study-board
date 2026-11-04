# Phase 6.1 · Focus Discard Consistency

> 项目：Sorchron Study Board（溯时学习工作台） · 版本 **4.0.0-rc.1（未升版）**
> 阶段性质：**修复**，不是重新设计 Focus Settlement。
> 结论：**FIXED WITH DECLARED BOUNDARIES** —— 四种目标场景全部由测试锁定；
> 仍有一类「已累计」的现场被**刻意拒绝清理**（见 §7）。

---

## 1. 根因

Phase 6 审计的 A2 在现场复现为三步：

1. **事务回滚也可能失败。** `settleFocus` 的写入顺序是 `logs → tasks → daily → timeline`，
   失败时逆序回滚。配额耗尽同时命中「写入」和「回滚」时，会留下
   `logs:1 / daily:未变 / timeline:1` 这类半截现场。
2. **「放弃」只清标记、不碰数据。** `useTimer.discardPending` 走的是
   `clearPendingSettlement()` —— 只把 `timer.pendingResult` 删掉。
3. **界面据此认为「已完成」。** `Dashboard → 专注` 面板的完成态在
   `pendingResult === null` 时直接渲染 `已记入「任务名」`。

于是 `daily.focusMinutes` 与 `logs` 对不上，用户看到的却是「已记入」。
**这不是显示 bug，是「陈述」与「数据」各说各话。**

更深一层的根因是**证据不足**：`daily` 与 `task` 这两个实体里**没有 roundId**，
只有累计值。所以对它们只能做一种判断 —— 「本轮有没有动过」，用持久化基线
`current === before` 证明；**不能**反推出「动过了该退多少」。

---

## 2. 修复方案

放弃流程改成 **证明 → 清理 → 回读校验** 三段，任何一段不成立都不说成功。

### 2.1 判定（`planDiscard`，纯函数，只读）

安全清理需要**同时**满足：

| 实体 | 判据 |
| --- | --- |
| 会话日志 | 至多 1 条 `id === roundId`；`kind === 'focus'`；分钟数与本轮一致；`taskId` 与本轮一致；日期与本轮一致 |
| 日聚合 | 有同日基线，且 `dailyNow === baseline.dailyMinutes`（基线为 `null` 时要求当前仍无该日记录） |
| 任务副本 | 任务仍存在时，有该任务基线，且 `focusedMinutes`、`pomodoros` 都仍等于基线 |
| 时间轴 | 按 `refId === roundId` 定位（唯一指向本轮，无需额外证据） |

任何一条不满足 → `safe: false`，把原因写成中文 blocker 直接给用户看。

**两个刻意收紧的地方：**

- **「日志没了」不等于「可以放行」。** 回滚失败的组合会留下「日志已回滚、Daily 却加上了」。
  如果因为「没东西可删」就直接清标记，那 18 分钟会永久留在日聚合里且没有任何日志支撑
  （热力图虚高、再也修不回来）。因此即使日志与事件都不在，日聚合/任务的证据校验照常执行。
- **不做任何回退计算。** 全程不写 `daily`、不写 `task`。只有在证明它们从未被本轮改过之后，
  才允许删除「日志 + 事件」。

### 2.2 执行（`discardSettlement`）

1. 重新读存储（不信任调用方手里的快照），再跑一次判定；
2. **只写真的变了的键**：没删日志就不碰 `logs`，没删事件就不碰 `timeline`；
3. 删除与「清 `pendingResult`」放进**同一个 `writeTransaction`**，避免「数据删了、标记还在
   → 下次挂载又补写回来」；
4. 事务失败 → 数据与标记都不动，文案点名失败的键；
5. 写后**回读校验**（本轮日志/事件是否真的没了）；校验不过就把「待保存标记」**写回原值**，
   不留「标记没了、数据还在」的死角。

### 2.3 界面（三态分开说）

| 状态 | 标题标记 | 第二行文案 |
| --- | --- | --- |
| 完整保存 | — | `已记入「任务名」` / `已记入（自由专注，未绑定任务）` |
| 未保存（失败/被拒绝） | `未保存` | 真实失败原因，例如 `无法安全放弃：日聚合·已累计或无法确定。这一笔的数据可能已经部分写入…` |
| 安全放弃 | `已放弃` | `本轮未完整保存，已清理能够确认属于本轮的部分记录（1 条日志、1 条时间轴事件）；日聚合与任务从未计入…` |

**刷新后的防回落**：`discarded` 只是 React 状态，刷新就没了。所以「是否真的记入」改成
**从存储推导** —— 不存在 `at` 恰好等于本轮结束时刻的 focus 日志就是没记入，
显示 `本轮未记入（已放弃这一笔）`。这样刷新也不会倒退回「已记入」。

---

## 3. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/client/lib/settlement.ts` | `planDiscard` 增加「日期一致」判据与「无痕迹≠可放行」口径；`discardSettlement` 改为只写变更键、写后校验失败时把标记写回、文案三态化 |
| `src/client/hooks/useTimer.ts` | `cbRef` 补上 `onDiscard` 类型（**纯类型修复**，行为不变） |
| `src/client/v4/FocusPanel.tsx` | 三态文案；`recorded` 从存储推导；「已放弃」标记 |
| `src/client/style/board.css` | `.v4-focus-abandoned` 胶囊；放弃说明允许换行（不再被 `nowrap` 截断） |
| `scripts/ui/settlement.test.ts` | 新增 `[E1]–[E10]` 共 **64** 项纯逻辑断言 |
| `scripts/ui/recovery-ui.test.tsx` | 新增 `[V4b]/[V4c]/[V4d]/[V4e]` 与 `[V4]` 扩写，共 **+42** 项界面断言 |
| `KNOWN-LIMITATIONS.md` | A2 从「待修」改为「6.1 已收窄」，写清仍然存在的三条边界 |

**没有动**：`settlement.ts` 的结算主流程（`settleFocus`/`planRepair`/`verifySettlement`）、
事务原语 `lib/tx.ts`、备份格式与 `BACKUP_KEYS`、Focus 状态机 `lib/focus.ts`、
Dashboard/Tasks/History 页面、版本号。

---

## 4. 数据清理安全性说明

**删除范围是「能用 roundId 唯一定位」的两样东西：**

```ts
logs     = state.logs.filter(log => log.id !== result.roundId)
timeline = state.timeline.filter(e => !(e.type === 'focus.completed' && e.refId === result.roundId))
```

- `SessionLog.id` 就是 `roundId`（`finishFocus` 里幂等键同源），天然一 一对应；
- `TimelineEvent.refId` 就是 `roundId`，`focus.completed` 的 `refId` 只由 `finishFocus` 写入；
- **普通 SessionLog（`kind !== 'focus'`）不会命中删除条件**——它们 id 是 `log-*`，
  且即便撞 id 也会被 `kind !== 'focus'` 判为 blocker 而拒绝整次清理；
- **不动 `daily` / `task` 的原因**：focus 日志只贡献 `daily.focusMinutes`，**不计入
  `daily.sessions`**（`finishFocus` 只 `applyDailyDelta(..., { focusMinutes })`），
  所以删掉日志后，只要日聚合本来就没被本轮加过，就已经是自洽状态，不需要再改任何数字。

**为什么「已累计」一律拒绝，而不是按基线扣回去：**

`daily` 与 `task` 里没有 roundId，只有累计值。`current === before + minutes` 只能说明
「可能加过」，不能说明「加的就是这一笔」——同一分钟内另一个标签页的轮次、或用户手动补记，
都会让这个等式成立。倒推扣减一旦猜错，扣掉的是**别人的有效记录**。
最高原则是「宁可保留一笔状态不确定的数据，也不能错误删除其他有效记录」，所以这里**只删可证的，
不修不可证的**。

---

## 5. 四种测试场景结果

### 测试 1 · 部分写入后安全放弃（`[E1]` `[E2]` + `[V4b]`）

现场：`logs` 有本轮 18 分钟、`timeline` 有本轮 `focus.completed`、`daily` 为空、任务为 0，
基线 `{dailyMinutes: null, taskMinutes: 0, taskPomodoros: 0}`。

| 断言 | 结果 |
| --- | --- |
| 判定可安全清理、计划删 1 日志 + 1 事件 | PASS |
| 本轮日志/事件被清理，`daily`/`task` 一个字节没改 | PASS |
| `pendingResult` 在同一事务里清掉（`written === 3`） | PASS |
| 文案是「未完整保存 / 已清理」，不含「已记入」 | PASS |
| 界面：`未保存` 消失、出现 `已放弃`、恢复「开始下一轮」 | PASS |
| 刷新后仍不说「已记入」，改说「本轮未记入」 | PASS |

### 测试 2 · 无法确认时禁止清理（`[E3]` `[E4]` `[E5]` `[E6]` + `[V4c]`）

- 缺基线 → 拒绝：数据未删、`pendingResult` 原样保留、`written === 0`、文案含「部分写入」
  与「导出备份」、不含「已记入」。**PASS**
- 日聚合已累计 / 任务已累计 → 拒绝，且那 18 分钟没被抹掉、任务没被反扣。**PASS**
- 日志分钟/日期/类型不符、同一轮多条 → 拒绝，日志一条不少。**PASS**
- 「日志已被回滚、Daily 却加了 18」→ **拒绝**（这条是刻意防的放行漏洞）。**PASS**
- 界面：日志仍在、`daily` 仍 18、`pendingResult` 仍在、显示「未保存」+「无法安全放弃」+
  「部分写入」、没有「开始下一轮」、仍可「重试写入」。**PASS**

### 测试 3 · 清理失败（`[E8]` `[E9]` `[E10]` + `[V4d]`）

| 现场 | 预期 | 结果 |
| --- | --- | --- |
| 写 `logs` 被拒（回滚成功） | 报失败并点名键、数据未动、标记保留、文案含「没有改动/再试」 | PASS |
| 写 `timeline` 失败 + 回滚 `logs` 也失败 | `restored=false`、标记保留、文案含「中间状态」+「导出备份」 | PASS |
| 删除后校验发现日志被别的标签页写回 | 报失败 + **把标记写回**，文案含「再试」 | PASS |
| 界面：放弃时写盘失败 | `未保存` 仍在、`放弃失败（会话日志写入被拒绝）`、无「已清理/已记入」、无「开始下一轮」 | PASS |

### 测试 4 · 其他数据隔离（`[E2]`）

同一天已有：另一轮 25 分钟的 focus 日志 + 1 条普通 `session` 日志 + 另一轮事件 + 任务 `t2` 的副本，
基线为 `{dailyMinutes: 25, taskMinutes: 0}`。

| 断言 | 结果 |
| --- | --- |
| 只剩别人的 2 条日志（另一轮 + 会话），本轮日志消失 | PASS |
| 别人的 `focus.completed` 事件保留 | PASS |
| 当天 `daily.focusMinutes` 仍是 25（不含本轮） | PASS |
| 任务 `t2` 的副本没被动 | PASS |

---

## 6. 回归测试结果

| 套件 | 命令要点 | 结果 |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **0 error** |
| Production Build | `node scripts/build.mjs` | 成功，`lib/client.js` = **536,092 B**（较 533,438 B **+2,654 B / +0.50%**） |
| 注册自检 | `node scripts/register-check.mjs` | **13 / 13** |
| Settlement（逻辑） | `settlement.test.ts` | **181 / 181**（原 117，新增 64） |
| Recovery UI（jsdom） | `recovery-ui.test.tsx` | **94 / 94**（原 52，新增 42） |
| Focus UI（jsdom） | `focus-ui.test.tsx` | **63 / 63** |
| 备份 / 恢复（jsdom） | `data.test.tsx` | **28 / 28** |
| 多标签（Chromium） | `focus-multi-tab.test.mjs` | **32 / 32** |
| Focus（Chromium） | `focus-browser.test.mjs` | **76 / 76**（原 72，新增 4） |
| 工作台（jsdom） | `workbench.test.tsx` | **25 / 25** |
| 组件（jsdom） | `components.test.tsx` | **46 / 46** |

合计 **545 项全绿**，构建 0 报错。

未重跑的套件（阶段不涉及）：history / activity / conflict / layout / shell / tasks / button /
data-browser / workbench-browser / v3-hover；`workbench.test.tsx` 与 `components.test.tsx` 是本阶段
唯二会渲染专注面板的邻近套件，已一并跑过。

**Chromium 覆盖口径**：真实浏览器里跑的是「结算失败 → 不谎报 → 刷新自动补写」整条链路，
外加 720px 下长文案的排版断言（`whiteSpace: normal`、`scrollWidth ≤ clientWidth`、无横向溢出）。
「放弃」的四条分支在 jsdom（真实 DOM + 真实 React 事件 + 真实 localStorage 故障注入）里覆盖。
没有为放弃单独加 Chromium 用例，原因写在 §7.7。

---

## 7. 未解决风险

1. **跨轮并发仍会丢写（继承 A1，未消除）。** 放弃流程写的是整份数组，如果另一个标签页在
   「读 → 写」之间结算了另一轮，后写覆盖先写。`localStorage` 无锁无 CAS，本阶段没有引入
   新的存储层，因此这条上限不变。同 round 的重复删除是幂等的，不会翻倍。
2. **「已累计」的现场无法放弃，只能重试。** 这是设计取舍不是缺陷：`daily`/`task` 没有
   roundId，扣减只能靠猜。用户看到的是「无法安全放弃 … 请先导出备份，再点重试写入补齐」。
   如果重试也永久失败（配额长期满），当前**没有**「只删日志、保留日聚合」的出口。
3. **导出备份不包含 `pendingResult`。** `timer` 是瞬态键，不在 `BACKUP_KEYS` 里。导出能保住
   数据做证据，但导入回来不会带回「待保存标记」——那一笔就失去了放弃入口（日志仍在，
   可在历史页手动删除单条）。文案说「先导出备份」是为了**留证据**，不是为了让用户导入覆盖。
4. **基线缺失的老数据会卡在「无法安全放弃」。** 5.5.2 之前的 `pendingResult` 没有 `before`，
   放弃一律被拒；出路同样是「重试写入」。
5. **`recorded` 用 `endedAt` 精确匹配推导。** 如果用户事后手工编辑了那条日志的时间戳，
   刷新后会被判成「未记入」。只影响文案，不改任何数据。
6. **没有 `onDiscard` 的调用方仍走旧行为（只清标记）。** 产品内不可达：唯一另一处
   `useTimer` 调用是 V3 的 `board/FocusTimer.tsx`，它没有「放弃」按钮，且 V3 自 5.2 起不进 bundle。
7. **Chromium 侧未覆盖放弃路径。** 真实浏览器里注入「写入 + 回滚同时失败」需要给测试 harness
   增加新的种子模式（改 `workbench-harness.tsx`），超出本阶段「只补必要 jsdom 测试」的范围。

---

## 8. 一句话总结

放弃从「删标记」变成了「**先证明再删、删完再验、验不过就把标记写回**」；
界面从「有标记就是未保存、没标记就是已记入」变成了「**以存储里有没有这条日志为准**」。
证据不足时它不猜 —— 宁可让用户看到一笔「状态不确定」，也不让他看到一句「已记入」。
