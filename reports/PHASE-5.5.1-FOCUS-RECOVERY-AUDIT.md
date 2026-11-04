# Phase 5.5.1 · 专注结算事务与恢复专项审计

> 日期：2026-11-04 · 范围：`finishFocus(result)` 的原子性、幂等、失败恢复、多标签并发
> 结论：**原来的结算路径存在可复现的部分写入**，已改为「读最新 → 判幂等 → 一次事务写 4 键 → 写后校验」，
> 补上「待落盘标记 + 重试/自动补写 + 重复记录收敛」。原有 960 条断言全部保留且通过，新增 120 条，合计 **1080**。

---

## 1. 原有结算机制（审计对象）

Phase 5.5 的落盘链路是**四段独立写入**：

```
useTimer.settleFocus()
  → commit(timer: completed + roundId 清空)      // 先落状态，防重放
  → onComplete(result)
      → useBoardActions.finishFocus(result)
          → finishFocusAction(...)                // 纯函数：算出四份新数据
          → board.setLogs(logs)                   // ① 立即写 logs
          → board.setTasks(tasks)                 // ② 立即写 tasks
          → setDaily(daily)                       // ③ 立即写 daily
          → setTimeline(timeline)                 // ④ 立即写 timeline
```

`useLocalStore.update()` 是「动作发生即写盘」（Phase 5.2 修的），所以这四步就是**四次独立的
localStorage 写入**，每一步都可能单独失败（配额、隐私模式、序列化）。它们之间没有任何事务。

幂等只有一层：`finishFocus` 里 `logs.some(log => log.id === result.roundId)`。而 `roundId` 在
`endRound` 里被清空，**一旦某一步写失败，就再也拼不回同一笔专注** —— 用户看到「本轮完成」，
但数据没写全，且没有任何重试入口。

---

## 2. 是否存在部分写入风险：存在，且已复现

用 jsdom 把 `localStorage.setItem` 按 key 打补丁，逐键注入 `QuotaExceededError`，跑真实组件
（Dashboard + FocusPanel，绑定任务，专注 18 分钟后结束）。**修复前**的实测结果：

| 注入的失败键 | SessionLog | Daily.focusMinutes | Task.focusedMinutes | Timeline | 界面 | 用户提示 |
| --- | --- | --- | --- | --- | --- | --- |
| `daily` | 1 条 ✅ | **0** ❌ | 18 ✅ | 1 ✅ | 本轮完成 | 通用「存储已满」 |
| `tasks` | 1 ✅ | 18 ✅ | **0** ❌ | 1 ✅ | 本轮完成 | 通用「存储已满」 |
| `timeline` | 1 ✅ | 18 ✅ | 18 ✅ | **0** ❌ | 本轮完成 | 通用「存储已满」 |
| `logs` | **0** ❌ | 18 ✅ | 18 ✅ | 1 ✅ | 本轮完成 | 通用「存储已满」 |
| 存储完全不可用 | 0 | 0 | 0 | 0 | 本轮完成 · 10m（**假成功**） | 三条通用错误，无补救指引 |

四个实体各自都能「单独缺一个」，这是**确定性可复现**的，不是理论风险。最坏的是 `logs` 失败：
热力图和任务都加上了，历史页却看不到这一笔，而且**永远无法从日志回溯**（没有日志就没有 trace）。

---

## 3. 修复后的设计（复用现有设施，没有另造事务系统）

审计确认现有能力：

| 设施 | 结论 |
| --- | --- |
| `lib/tx.writeTransaction(RawStore, entries)` | 已具备「先序列化 → 逐写 → 失败逆序回滚 → 如实返回 `restored`」，导入与清空都在用 → **直接复用** |
| `lib/tx.createBrowserStore()` | 浏览器适配器，写入时广播 `STORE_EVENT`（四个 hook 自动同步）→ **直接复用** |
| `lib/repo` | 只覆盖 V4 新实体，且是逐键写，没有事务 → 不适合，不动 |
| `useLocalStore` | 有立即写盘与跨标签同步，但没有多键事务 → 结算路径改用它下面的 `writeTransaction` |

于是新增 `src/client/lib/settlement.ts`（一个模块，不新增存储键、不改备份格式）：

```
settleFocus({ result, store })
  1. 从 store **重新读** logs / tasks / daily / timeline（不信调用方手里的快照）
  2. 若 logs 里已有 roundId → duplicate，不写，返回「已经记过」
  3. finishFocus(...) 算四份新数据（纯函数，未变）
  4. writeTransaction 一次写 4 个键；失败 → 逆序回滚 → 返回失败键 + 是否回滚成功
  5. 写后校验：重新读一次，确认这一轮的日志真的在；不在 → 报失败（被覆盖）
  6. 只在成功后返回 next；失败一律不返回（不把半成品交给 UI）
```

配套的恢复机制：

| 机制 | 实现 | 作用 |
| --- | --- | --- |
| **待落盘标记** | `TimerPersistedState.pendingResult`（`timer` 键是瞬态、不进备份） | 结算失败时把这一笔留在存储里：刷新不丢、可重试、`roundId` 不变仍然幂等 |
| **重试** | `useTimer.retryPending()` → FocusPanel 的「重试写入」 | 用同一个 `roundId` 重新提交，成功后清标记 |
| **自动补写** | `useTimer` 挂载时若发现 `pendingResult` → 自动 `retryPending()` | 刷新 / 重开标签页后自动补齐 |
| **不假装成功** | 完成态显示 `未保存` 标记 + 失败键 + 「重试写入 / 放弃这一笔」 | 界面上不可能出现「本轮完成」却没有数据的情况 |
| **防丢** | `pendingResult` 未清时**不渲染「开始下一轮」**（`reset` 会清 pending） | 避免用户点下一轮把待写记录冲掉 |
| **重复收敛** | `repairDuplicateSettlements` + `useSettlementRecovery`（挂在 `BoardPage`） | 同 `roundId` 出现多次时按同一口径回退：日志留一条、Daily 减一次、任务减一次、时间轴留一条 |

**Schema 影响**：只给 `timer` 加了两个可选字段（`pendingResult` 与它的子字段）。
`timer` 不在 `BACKUP_KEYS` 里，所以**备份格式没有任何变化**，旧数据照读（形状不对就整块丢弃）。

---

## 4. 失败注入的实际结果（修复后）

同一套注入手段，重跑：

| 注入键 | SessionLog | Daily | Task | Timeline | 界面 | 提示 |
| --- | --- | --- | --- | --- | --- | --- |
| `daily` | 0 | 0 | 0 | 0 | 未保存 + 重试/放弃 | 「写入失败（日聚合），这一轮没有保存，已回滚到写入前；可以点『重试写入』」 |
| `tasks` | 0 | 0 | 0 | 0 | 同上 | 同上（点名「任务」） |
| `timeline` | 0 | 0 | 0 | 0 | 同上 | 同上（点名「时间轴」） |
| `logs` | 0 | 0 | 0 | 0 | 同上 | 同上（点名「会话日志」） |
| 存储完全不可用 | 0 | 0 | 0 | 0 | 未保存 | 「写入失败（…），已回滚」+「写入计时状态失败」 |

其余场景：

| 场景 | 结果 |
| --- | --- |
| **写入过程中组件卸载** | 结算路径是**全同步**的（没有 await / 没有跨帧中间态），卸载发生在写完之后或下一次渲染；写盘不受影响。真正需要兜底的是「写失败」，已由 `pendingResult` 覆盖。 |
| **写入过程中页面刷新** | 同上：刷新只可能发生在同步写完之后。若上一轮写失败，刷新后 `pendingResult` 仍在 → 自动补写（实测 V3.3–V3.7、浏览器 §12）。 |
| **写入过程中抛其他异常** | `settleFocus` 内的读 / 算 / 写都在 `try` 边界内（`finishFocus` 纯函数不抛；`writeTransaction` 自己吞掉序列化与写入异常）；`useSettlementRecovery` 外层还有 try/catch，失败只记日志不崩页面。 |
| **重试后能否修复** | 能。重试 = 用同一个 `roundId` 重新走一遍完整流程；因为失败时四个键都回滚了，重试是「第一次写」，不会重复累计（实测 V2.1–V2.8）。 |
| **提示是否真实** | 修复后提示点名失败键、明确说「没有保存」「已回滚」，并在不可回滚时提示「数据可能不一致，先导出备份」。不再复用泛化的「存储已满」。 |

---

## 5. 多标签页并发结果

用**同一个 Chrome profile 开 4 个标签页**（共享 localStorage，真实多标签），逐项验证：

| 用例 | 结果 |
| --- | --- |
| 两个标签页同时打开同一轮（roundId 相同） | 都读到 `专注中 · 07:00`（相差 1 秒属正常） |
| A 结束 → B 再结束同一轮 | **1 条日志**、Daily 只加一次（50+18=68）、任务只加一次（18 分钟 / 1 个 pomodoro）、时间轴 1 条；B 收到「这一轮已经记过了」 |
| 一个标签页暂停、另一个结束 | 结束时只写一条（roundId 相同）；暂停那一页再点结束不会再加 |
| 两个标签页各自刷新 | 日志条数、Daily 都不变；`pendingResult` 已清 |
| 预置两条同 `roundId` 的日志（+ 重复 Daily/事件） | 下次挂载自动合并：日志剩 1 条、Daily 回退、时间轴剩 1 条，并提示「发现 N 条重复的专注记录，已合并并回退 X 分钟」 |
| 同一轮重复提交（双击结束按钮 3 次） | 只写一条（V6） |

**能保证的范围**：

- 同一轮无论被结算多少次、在几个标签页里结算，**最终只有一笔**（日志、Daily、任务副本、时间轴都不会翻倍）；
- 后写者会**先读最新状态**再判断幂等，所以「先后」发生的并发完全收敛；
- 写后校验能发现「刚写完就被别人覆盖」的情况，并把它变成一次可重试的失败。

**不能保证的范围（必须说清楚）**：

1. **同一毫秒的真并发**：localStorage 没有锁、没有 CAS，「读 → 写」之间总有窗口。用假存储模拟
   「两边都读到空快照」时，两边写的是**整份数组**，值相同 → 最终仍是 1 条、不翻倍（值幂等）；
   但代价是**后写覆盖先写**。
2. **跨不同 round 的并发会丢一笔**：A 结算第 1 轮、B（旧快照）结算第 2 轮，B 的整份写入会把
   A 的日志覆盖掉。**这种丢失无法自动检测**（先写者已经返回成功，之后没留下任何痕迹），
   除非引入 round 级 ledger（本阶段按要求没有新增实体）。
   实际影响有限：工作台是单页应用，「两个标签页同时专注两轮」是边缘场景；且 `pendingResult`
   机制保证**任一方失败或校验不过**时会重试，只有「两边都成功且互相覆盖」才会丢。
3. **`pendingResult` 在存储完全不可用时只能留在内存**：连 `timer` 都写不进去时，刷新后这一笔
   确实会丢 —— 此时任何持久化方案都无能为力，界面已明确显示「未保存」。

---

## 6. 实际修复的文件

**新增**

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `src/client/lib/settlement.ts` | 419 | 读最新 → 判幂等 → 事务写 4 键 → 写后校验；重复结算检测与修复 |
| `src/client/hooks/useSettlementRecovery.ts` | 46 | 挂载时跑一次重复结算修复（挂在 `BoardPage`） |
| `scripts/ui/settlement.test.ts` | 299 | 纯逻辑：48 条（正常 / 单键失败 / 重试 / 幂等 / 并发 / 修复 / 一致性） |
| `scripts/ui/recovery-ui.test.tsx` | 291 | jsdom：37 条（未保存界面、重试、刷新自动补、放弃、修复、双击） |
| `scripts/ui/focus-multi-tab.test.mjs` | 289 | 真浏览器双标签：24 条 |

**修改**

| 文件 | 改动 |
| --- | --- |
| `src/client/hooks/useBoardActions.ts` | `finishFocus` 从「四次 setter」改为一次 `settleFocus` 事务；失败时给真实提示并返回 false |
| `src/client/lib/focus.ts` | `endRound` 写入 `pendingResult`；`idleState`（取消/重置）清掉它 |
| `src/client/types/index.ts` | `TimerPersistedState.pendingResult` + `PendingSettlement`（均可选，timer 不进备份） |
| `src/client/lib/schema.ts` | `restoreTimerState` 校验并恢复 `pendingResult`（形状不对就丢） |
| `src/client/hooks/useTimer.ts` | `onComplete` 支持返回 boolean；成功后清 pending；`retryPending` / `discardPending`；挂载时自动补写 |
| `src/client/v4/FocusPanel.tsx` | 「未保存」标记 + 重试/放弃按钮；未保存时不渲染「开始下一轮」；完成态「已专注」改用真实结算分钟（原来会显示目标 25 分） |
| `src/client/index.tsx` | `BoardPage` 挂 `useSettlementRecovery()` |
| `scripts/ui/workbench-harness.tsx` | 新增 `?timer=fault` 种子、挂 `useSettlementRecovery`（与生产一致） |
| `scripts/ui/focus-browser.test.mjs` | 新增 §12：真实注入 `QuotaExceededError` → 未保存 → 刷新自动补齐（10 条） |
| `scripts/ui/glass-contrast.mjs` | 采样选择器加 `.v4-focus-unsaved` |
| `src/client/style/board.css` | `.v4-focus-unsaved` 样式（浅色 `#a34a49` / 深色 `#d98a89`） |

**没有改**：备份格式、`BACKUP_KEYS`、`writeTransaction` 本身、导入导出、热力图统计、Dashboard 结构、Classic 入口。

---

## 7. 新增测试数量

| 套件 | 新增 | 覆盖 |
| --- | --- | --- |
| `settlement.test.ts` | **48** | 正常结算、四个键各自失败、重试、重复提交、并发（冻结快照）、写后覆盖、重复修复、删除后回退、四实体一致性 |
| `recovery-ui.test.tsx` | **37** | 失败后界面不撒谎、重试成功、刷新自动补写、放弃、重复记录修复、双击结束、修复失败不谎报 |
| `focus-browser.test.mjs`（增量） | **11** | 真实 `QuotaExceededError` 注入、事务回滚、提示文案、`pendingResult` 落盘、刷新自动补写、完成态分钟数（10 条新用例 + 1 条对「完成态不渲染结束按钮」的补充断言） |
| `focus-multi-tab.test.mjs` | **24** | 双标签同轮结算、暂停+结束、刷新、重复记录合并 |

合计新增 **48 + 37 + 11 + 24 = 120 条**。原有 960 条**一条未删**，全部通过。

> **勘误（Phase 5.5.2 复核）**：本节最初写的是「合计 119 条」，因为 `focus-browser` 只记了
> 10 条新增，漏掉了同一文件里 +1 的补充断言；而文件头写的是 120。逐套件实测的差额正好是这 1 条：
> `focus-browser` 为 72 = 61（Phase 5.5）+ 11。1080 − 120 = 960 与 Phase 5.5 的总数吻合，
> 所以正确值是 **120**，119 是漏算。

---

## 8. 原有 960 条是否仍全部通过

是。逐套件：

| 套件 | 结果 |
| --- | --- |
| `register-check.mjs` | 13 / 13 |
| `smoke.ts` | 415 / 415 |
| `components.test.tsx` | 46 / 46 |
| `workbench.test.tsx` | 25 / 25 |
| `data.test.tsx` | 28 / 28 |
| `activity.test.ts` | 37 / 37 |
| `history.test.tsx` | 16 / 16 |
| `focus.test.ts` | 96 / 96 |
| `focus-ui.test.tsx` | 63 / 63 |
| `workbench-browser.test.mjs` | 26 / 26 |
| `data-browser.test.mjs` | 31 / 31 |
| `history-browser.test.mjs` | 28 / 28 |
| `focus-browser.test.mjs` | 72 / 72（61 原有 + 11 新增） |
| `focus-multi-tab.test.mjs` | 24 / 24（新增） |
| `settlement.test.ts` | 48 / 48（新增） |
| `recovery-ui.test.tsx` | 37 / 37（新增） |
| `layout-browser.test.mjs` | 21 / 21 |
| `shell-browser.test.mjs` | 12 / 12 |
| `tasks-browser.test.mjs` | 15 / 15 |
| `button-browser.test.mjs` | 13 / 13 |
| `conflict-browser.test.mjs` | 6 / 6 |
| `v3-hover.test.mjs` | 8 / 8 |
| **合计** | **1080 / 1080** |

> **勘误（Phase 5.5.2 复核）**：上表逐项相加 = 13+415+46+25+28+37+16+96+63+26+31+28+72+24+48+37+21+12+15+13+6+8 = **1080**，
> 与表尾一致，可放心引用。此前 `focus-browser` 那行写「61 原有 + 10 新增 + 1 补充」，
> 与 §7 的「10」互相矛盾，现已统一为「61 + 11」。

---

## 9. TypeScript / Build / Smoke / Chromium

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | **0 错误** |
| `scripts/build.mjs` | 成功，`lib/client.js` **521,886 B**（Phase 5.5 为 507,716 B，+14 KB） |
| `register-check.mjs` | 13 / 13 |
| `smoke.ts` | 415 / 415 |
| jsdom / 纯逻辑套件（9 套） | 全部通过，合计 **396** 项（46 / 25 / 28 / 37 / 16 / 96 / 63 / 48 / 37） |
| Chromium 套件（11 套） | 全部通过，合计 **256** 项（26 / 31 / 28 / 72 / 24 / 21 / 12 / 15 / 13 / 6 / 8） |
| 截图 | 42 张，横向溢出 **0**；新增 `wb-focus-unsaved-light-1440.png`（未保存态实拍） |
| 对比度 | 87 个采样点全部 ≥4.5:1（0 个低于阈值）；新增的「未保存」标记按 WCAG 公式计算 ≈5.0:1（浅）/ ≈6.4:1（深），因需要注入写入失败才会出现，未纳入像素采样 |

---

## 10. 尚未解决的风险

1. **跨 round 的并发写入会丢一笔**（§5 第 2 条）。没有 round 级 ledger 就无法检测；本阶段按要求
   没有新增实体。缓解：单标签页使用、失败/覆盖时 `pendingResult` 会重试。
2. **存储完全不可用时，待写记录只存在内存**：连 `timer` 都写不进去时无法持久化，刷新即丢。
   界面显示「未保存」，但没有更强的兜底（例如导出到剪贴板）——这属于新功能，本阶段不做。
3. **重复修复的扣减依赖「每次结算恰好 +minutes/+1」这一不变式**。如果将来有人手工改
   `focusedMinutes` 或引入「部分时长补记」，修复逻辑需要同步更新（代码里有注释标注）。
4. **`pendingResult` 只在计时器挂载时重试**（Dashboard 的专注面板）。如果用户长期停留在历史页，
   补写会等到回到 Dashboard 才发生 —— 数据不会丢（标记在存储里），只是延迟。
5. **`settleFocus` 的写后校验只能发现「自己的日志不在了」**，无法发现「别人的日志被别人覆盖」。
6. **多标签页的计时状态本身仍然「后写覆盖先写」**（`timer` 键不走 `useLocalStore` 的冲突决议）——
   这是 Phase 5.5 就记录的已知限制，本阶段没有改它（改了会牵动整套计时器同步）。

---

## 11. 真实 DSH 宿主验证状态

**未验证。** 按本阶段约束（不启动 / 不重启 DSH），以下仍未在宿主内确认：

- 宿主的 Storage 配额行为与 `QuotaExceededError` 的实际表现（测试用的是真实 Chromium + 主动注入）；
- 宿主内 `STORE_EVENT` 广播是否与独立 Chromium 行为一致（宿主可能包了一层，未验证）；
- 宿主内多标签（多个 DSH 窗口）是否共享同一 origin 的 localStorage。

已验证的等价范围：独立 Chromium（真实 localStorage、真实事务回滚、真实失败注入、真实的两个标签页）
+ jsdom（真实组件、按 key 注入失败）+ 纯逻辑（假存储精确控制第几次写入失败）。

---

## 12. 交付边界

**本阶段只做结算事务与恢复**：没有新 UI 页面、没有新业务功能、没有改热力图统计、没有动导入导出、
没有恢复 Classic 入口、没有改备份格式、没有引入第三方库。

**到此停止，不进入下一阶段。**
