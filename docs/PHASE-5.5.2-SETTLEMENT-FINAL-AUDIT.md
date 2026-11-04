# Phase 5.5.2 · 专注结算最终一致性与故障恢复闭环

> 日期：2026-11-04 · 范围：`settleFocus()` 的四实体写后校验、回滚失败后的恢复、`pendingResult` 生命周期、同 roundId 重复结算、故障注入回归
> 基线：Phase 5.5.1（1080 项）→ 本阶段 **1172 项**（+92）
> **最终结论：CONDITIONAL PASS**（见 §15；范围内 6 项验收全部通过，残留 3 条明确前提）

---

## 1. 结论先说

| 要求 | 结果 | 证据 |
| --- | --- | --- |
| P1-1 回滚失败后不得误判「已保存」 | **已修复** | §3；`settlement.test.ts` T1.1–T1.6 |
| P1-2 写后校验覆盖四个实体 | **已实现** | §4；`verifySettlement` + D1–D9 |
| `pendingResult` 生命周期（保留/重试/清除/放弃） | **已定稿** | §6；V1–V4、V10 |
| 同 roundId 重复结算与异常恢复一致 | **已收敛** | §7；S6–S8、T6–T7、V5 |
| 故障注入测试 | **已补齐** | §9；7 类失败点 × 4 实体 |
| 修正 Phase 5.5.1 统计口径 | **已修正** | §11；119 → 120，套件数 8/10 → 9/11 |

核心判断只有一句：**「日志在」不再等于「这一轮记过了」。** 一个 roundId 是否记全，由四个实体各自
校验后投票决定；投不出来就不写、不猜、保留待保存状态，并如实告诉用户。

---

## 2. 审计方法与边界

**读了什么**：`lib/tx.ts`（`writeTransaction` / `createBrowserStore` / `createFakeStore`）、
`lib/settlement.ts`、`lib/focus.ts`、`lib/schema.ts`（`restoreTimerState`）、`hooks/useTimer.ts`、
`hooks/useBoardActions.ts`、`hooks/useSettlementRecovery.ts`、`v4/FocusPanel.tsx`、`index.tsx`（`BoardPage`），
以及全部相关测试文件。

**怎么注入故障**（三层，都是真实失败，不是打桩返回假值）：

| 层 | 手段 | 覆盖 |
| --- | --- | --- |
| 纯逻辑 | `createFakeStore(失败键)` / `createScriptedStore(每步脚本)` / `createWindowStore(from, to)`（指定第 N 次到第 M 次写入失败） | 写入失败、回滚失败、回滚也失败 |
| jsdom | 按 key 给 `localStorage.setItem` 打补丁抛 `QuotaExceededError`，跑真实组件 | 界面「未保存」、重试、刷新补写、放弃、双击 |
| 真实 Chromium | `Page.addScriptToEvaluateOnNewDocument` 注入 `:daily` 配额错误；`json/new` 开多标签共享 profile | 真实回滚 + 刷新自动补齐 + 双标签并发 |

**没做什么**（约束遵守）：没有新增业务功能；没改 Dashboard / Tasks / History 结构；没引入新存储实体、
数据库或三方库；没动备份格式与 `BACKUP_KEYS`；没恢复 Classic；没改热力图口径；没重构存储系统；
**没有启动 DSH 宿主**（本阶段全部验收在独立 Chromium 里完成，见 §14）。

---

## 3. P1-1：回滚失败后的行为（本次最严重的缺陷）

`writeTransaction` 的语义是「逐写，失败后逆序回滚，返回 `restored`」。问题在于**回滚本身也可能失败**：
`logs` 写成功 → `daily` 写失败（配额满了）→ 回滚 `logs` 又失败（还是满的）。最终存储里留下
「日志在，Daily / 任务 / 时间轴都不在」。

5.5.1 的判据是 `logs.some(log => log.id === result.roundId)`，命中就返回 `ok: true, duplicate: true`，
上层据此清掉 `pendingResult` —— 那一笔专注的日聚合与任务投入**永久丢失**，而界面显示「已记入」。

| 现场（日志在、其余缺失） | 旧行为（5.5.1） | 新行为（5.5.2） |
| --- | --- | --- |
| 再次 `settleFocus` | 立刻返回 `duplicate` + `ok=true`；`pending` 被清 | 先跑 `verifySettlement` → 失败 → 进入 `planRepair` → 只补缺的部分 → 补齐后重新校验 |
| 用户看到 | 「这一轮已经记过了」 | 「这一轮之前只写了一部分，已补齐：日聚合、任务、时间轴」 |
| 无基线可用时 | 同上（假装成功） | `ok=false`，保留 `pendingResult`，提示「无法确定是否已经累计过，请先导出备份再重试」 |

对应断言：`T1.1` 首次结算报失败且 `restored === false`；`T1.2` 确认现场确实是「日志在、其余缺失」；
`T1.5` 重试走的是**修复路径**（`repaired === true`）而不是 `duplicate` 直接成功。

---

## 4. P1-2：写后校验覆盖四个实体

`verifySettlement(state, result, baseline?)` 只看**本轮结算相关的关键字段**，不做整对象深比较
（别的标签页可能同时改了任务标题、别的天的聚合，深比较会误报）：

| 实体 | 判定条件 | 不满足时 |
| --- | --- | --- |
| `SessionLog` | 该 roundId 恰好 **1** 条；分钟数一致；日期键一致；绑定关系一致（任务已删则允许无 `taskId`） | 记「会话日志」失败 |
| `DailyAggregate` | 该日 `focusMinutes ≥` 基线值 + 本轮分钟（无基线时退化为 `≥` 本轮分钟） | 记「日聚合」失败 |
| `Task` | 仅在「有绑定且任务仍存在」时校验：`focusedMinutes ≥` 基线 + 本轮，`pomodoros ≥` 基线 + 1 | 记「任务」失败 |
| `TimelineEvent` | 指向本轮的 `focus.completed` 恰好 **1** 条（重复也算失败，会走去重） | 记「时间轴」失败 |

三条调用点都用了它：首次写入后（`ok=false` 且**不返回 `next`**，不把半成品交给 UI）、
修复写入后（recheck）、以及「日志已存在」分支的前置判断（决定是「已完整」还是「要修」）。

`D1`–`D9` 是它的单元测试：四实体各自缺失、日志重复、任务已删、未绑定任务、时间轴重复、分钟数不符。

---

## 5. 修复的前提：基线快照，而且必须是**持久化的**基线

判断「Daily 是否已经加上这一轮」不能靠日志在不在（日志先写），也不能靠猜。所以写入前先快照：

```
current === before            → 还没应用 → 补
current >= before + minutes   → 已经应用 → 不动（不重复加、也不下调）
其它（0 < current < minutes，或整行被删） → 判断不了 → 不写，报告「无法确定」
```

**这里是本阶段第二个真 bug**：修复路径最初写的是
`planRepair(fresh, result, input.baseline ?? snapshotBaseline(fresh))`。
一旦 `input.baseline` 缺失，它就把**刚刚读到的当前值**当成基线 —— 而当前值正是「失败之后」的值，
于是 `dailyNow === before` 恒成立、`dailyNow >= before + minutes` 也恒成立，永远判「已经算过」，
修复变成空转，上层却收到 `repaired` 的成功提示。

现在只剩 `input.baseline`：没有持久化基线就**不修**，返回 `ambiguousEntities` 与
「无法确定」的文案，让用户先导出备份。基线由 `useTimer.keepBaseline` 写进
`pendingResult.before`（只写一次，绝不覆盖成「失败后」的值；这一步自己写盘失败也不影响正确性 ——
没有基线只会让下次修复更保守）。

对应断言：`T8.1–T8.4`（无基线不假装成功、只补可确定的时间轴）、`T9.1–T9.2`（中间值不写错数）、
`V9.1–V9.7`（界面直接显示「无法确定」原因、只留一个重试入口）、`V10.1–V10.2`（失败后基线进 pending）。

---

## 6. `pendingResult` 生命周期（定稿）

| 时机 | 谁负责 | 结果 |
| --- | --- | --- |
| 专注结束（到点 / 手动） | `focus.ts` 的 `endRound` | 写入 `pendingResult`（此时还没有 `before`） |
| 首次结算失败 | `useTimer.keepBaseline` | 把 `{ ok:false, baseline }` 里的基线补进 `pendingResult.before`（已有则不覆盖） |
| 首次结算成功 | `clearPendingSettlement` | 删除（仅当四实体校验通过） |
| 点「重试写入」 | `retryPending` → `onComplete(info, pending.before)` | 成功删除、失败保留并更新基线 |
| 重新打开页面 / 刷新 | 挂载时 `retriedRef` 只跑一次的 `retryPending()` | 自动补写；`settleFocus` 与它都幂等，重复提交只会得到 `duplicate` |
| 点「放弃这一笔」 | `discardPending` → `clearPendingSettlement` | **只清标记，不删任何已落盘的数据**（V4.3：放弃后 logs/daily 仍为空，不会被偷偷补写） |
| 取消 / 重置到待机 | `idleState` / `cancelRound` | 清掉 `pendingResult` |

两条界面硬约束（`FocusPanel`）：

1. `timer.pendingResult !== null` → 「本轮完成」旁出现**未保存**徽标，副标题是真实原因
   （`saveError`，或「写入失败：这一笔还在计时状态里，刷新也不会丢，可以重试」）。
2. 未保存时**不渲染「开始下一轮」**，只给「重试写入 / 放弃这一笔」—— 因为 `reset` 会清掉
   `pendingResult`，等于替用户把这一笔悄悄丢掉（V1.4 就在测这件事）。

`timer` 是瞬态键、不进备份，所以 `pendingResult` 不会污染备份格式。

---

## 7. 同 roundId 重复结算：三层幂等

| 层 | 机制 | 拦住什么 |
| --- | --- | --- |
| ① 键 | `roundId`（无 roundId 的老状态用 `focus-<startedAt.toString(36)>` 派生） | 同一次专注的两次提交 |
| ② 四实体校验 | 都完整才算「记过」；缺就修；判断不了就留 pending | 部分写入被当成成功 |
| ③ 收敛 | `detectDuplicateRounds` + `repairDuplicateSettlements`（留一条日志，Daily/任务/时间轴各回退一份），挂载时由 `useSettlementRecovery` 跑一次 | 旧版本/极端并发留下的重复记录 |

③ 的「回退一份」不是猜测：同一个 roundId 出现两次，只可能是同一轮被应用了两次，而每次应用都恰好做了
「日志 +1、daily +minutes、task +minutes/+1、事件 +1」，按同一口径扣回是确定性的。
修复本身也走事务，写不进去就如实提示「修正未能写入」（V7）。

---

## 8. 多标签并发复核

真实 Chromium，同一个 profile 开多个标签页（`json/new`），共享 localStorage。

**能保证（已实测，32 项）**：
- 两个标签页先后结束同一轮 → 日志只 1 条，Daily 只 +18，任务只 +18/+1，时间轴只 1 条；
- 暂停态在另一标签页结束 → 仍只 1 条，Daily 不会被加第二次；
- 预置重复记录 → 挂载时合并，Daily 回退掉多算的那一份，并给出「重复…回退」提示；
- **两个标签页同时恢复同一笔部分写入** → 值幂等（都写同一个结果），最终日志 1 条、Daily 恰好 +18、
  任务 +18/+1、时间轴 1 条、`pending` 清空；后开的第三个标签页看到的是「已完整」，不再累计。

**不能保证（localStorage 硬上限，已在代码注释与本报告同时声明）**：
- 两个标签页在同一毫秒内各自「读 → 改 → 写」，无锁无 CAS，后写覆盖先写；
- **跨不同 round 的并发**：A 结算第 1 轮、B 拿着旧快照结算第 2 轮，A 的写入会被 B 覆盖，
  而且**无法检测**（A 的校验只保证「自己那一条还在」，覆盖后确实还在，但少了别人那一笔）。

---

## 9. 故障注入测试矩阵

| 失败/异常场景 | 用例 | 断言要点 |
| --- | --- | --- |
| logs 写失败 | S5、V1 | 四个实体都不写；`pending` 保留；界面「未保存」 |
| tasks 写失败 | S2 | 回滚后数据不变 |
| daily 写失败 | S3、V1、focus-browser §12 | 日志与任务被回滚；提示点名「日聚合」 |
| timeline 写失败 | S4 | 回滚后数据不变 |
| **logs 成功 + daily 失败 + 回滚失败** | **T1、V8** | 现场「日志在、其余缺失」；重试按基线补齐；任务/日聚合各只加一次 |
| 单点缺失（daily / 任务 / 时间轴 / 日志） | T2–T5 | 只补缺的那个，不动其它 |
| 修复后再次重试 | T6 | 第二次是「已完整」（`duplicate && !repaired`），不再重复累计 |
| 修复后刷新 | T7、V3、V8 | 挂载自动补齐，`pending` 清空，界面不再显示「未保存」 |
| 无基线可用 | T8、V9 | 不猜：只补可确定的时间轴，Daily/任务不动，`ambiguousEntities` 非空 |
| 基线有值但当前值是中间值 | T9 | 不改数（不写成 5、也不写成 18），报「无法确定」 |
| 任务已被删除 | T10 | 结算仍成功，不重建任务，日志不带 `taskId` |
| 未绑定任务 | T11 | 结算成功，不动任何任务副本，Daily 正常累计 |
| 时间轴重复 | T12 | 去重到 1 条，不重复加分钟 |
| 双击「结束并记录」 | V6 | 只写一条日志，Daily 只加一次 |
| 重复记录修复写不进去 | V7 | 数据保持原样，明确提示「修正未能写入」 |
| 两标签同时恢复同一笔 | focus-multi-tab §5 | 见 §8 |

---

## 10. 全量回归（逐套件实测，2026-11-04）

| 套件 | 结果 | 类型 |
| --- | --- | --- |
| `register-check.mjs` | 13 / 13 | 宿主注册 |
| `smoke.ts` | 415 / 415 | 纯逻辑 |
| `components.test.tsx` | 46 / 46 | jsdom |
| `workbench.test.tsx` | 25 / 25 | jsdom |
| `data.test.tsx` | 28 / 28 | jsdom |
| `activity.test.ts` | 37 / 37 | 纯逻辑 |
| `history.test.tsx` | 16 / 16 | jsdom |
| `focus.test.ts` | 96 / 96 | 纯逻辑 |
| `focus-ui.test.tsx` | 63 / 63 | jsdom |
| `settlement.test.ts` | **117** / 117（原 48 + 新 69） | 纯逻辑 + 假存储 |
| `recovery-ui.test.tsx` | **52** / 52（原 37 + 新 15） | jsdom |
| `workbench-browser.test.mjs` | 26 / 26 | Chromium |
| `data-browser.test.mjs` | 31 / 31 | Chromium |
| `history-browser.test.mjs` | 28 / 28 | Chromium |
| `focus-browser.test.mjs` | 72 / 72 | Chromium |
| `focus-multi-tab.test.mjs` | **32** / 32（原 24 + 新 8） | Chromium 多标签 |
| `layout-browser.test.mjs` | 21 / 21 | Chromium |
| `shell-browser.test.mjs` | 12 / 12 | Chromium |
| `tasks-browser.test.mjs` | 15 / 15 | Chromium |
| `button-browser.test.mjs` | 13 / 13 | Chromium |
| `conflict-browser.test.mjs` | 6 / 6 | Chromium |
| `v3-hover.test.mjs` | 8 / 8 | Chromium |
| **合计** | **1172 / 1172** | 23 套件 |

新增 **92** 项（settlement +69、recovery-ui +15、multi-tab +8），原有 1080 项一条未删。

其它门禁：

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `scripts/build.mjs` | 成功，`lib/client.js` **533,438 B**（5.5.1 为 521,886 B，+11,552 B） |
| 截图（`workbench-shot.mjs`） | 42 张，横向溢出 **0** |
| 截图（`glass-shot.mjs`） | 12 张，横向溢出 **0** |
| 对比度（`glass-contrast.mjs`） | 87 个采样点，低于 4.5:1 的 **0** 项 |

---

## 11. Phase 5.5.1 报告的统计口径修正

5.5.1 的报告有两处口径不自洽，已在本阶段逐套件实测后改正（改动落在
`reports/PHASE-5.5.1-FOCUS-RECOVERY-AUDIT.md`，并附勘误说明）：

| 位置 | 原文 | 修正后 | 原因 |
| --- | --- | --- | --- |
| 文件头 | 新增 120 条，合计 1080 | 不动（本来是对的） | 与逐项相加吻合 |
| §7 新增测试数量 | 合计 **119** 条 | 合计 **120** 条（`focus-browser` 行 10 → **11**） | 该文件实际是 61 + 11 = 72，§7 漏掉了「+1 补充断言」，与文件头的 120 差正好 1 |
| §8 逐套件表 | `focus-browser` 写「61 + 10 新增 + 1 补充」 | 「61 + **11**」 | 与 §7 统一；表内 22 项相加 = 1080，可复核 |
| §9 汇总 | 「jsdom 套件（**8** 套）」列了 9 个数字；「Chromium 套件（**10** 套）」列了 11 个数字 | **9 套 = 396 项**；**11 套 = 256 项** | 套数与列表数量不符；396 + 256 + 415(smoke) + 13(register) = 1080，闭合 |

复核方法：本阶段把 23 个套件全部重跑一遍，逐个记下各自输出的通过数（见 §10），
再用「逐套件相加 = 总数」校验。现在是 **1172 = 13+415+46+25+28+37+16+96+63+117+52+26+31+28+72+32+21+12+15+13+6+8**。

---

## 12. 代码与测试改动清单

**核心（改）**

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/client/lib/settlement.ts` | 756 | 新增 `SettlementBaseline` / `snapshotBaseline` / `verifySettlement`（四实体）/ `planRepair`（已应用·未应用·判断不了的判定）；`settleFocus` 改为三分支（无日志→正常事务；有日志→校验+修复；失败→不返回 `next`）；修复只用持久化基线 |
| `src/client/hooks/useTimer.ts` | 634 | `onComplete(info, baseline?)`；`readOutcome` 归一 boolean / `{ok, baseline}`；`keepBaseline`（只写一次）；`retryPending` 带上 `pending.before`；`discardPending` 只清标记；挂载自动 `retryPending` |
| `src/client/hooks/useBoardActions.ts` | 283 | `finishFocus(result, baseline?)` 返回 `{ ok, baseline?, message }`；失败 `pushNotice(message,'error')`；修复成功时把 `next` 灌回内存态 |
| `src/client/v4/FocusPanel.tsx` | 443 | 未保存徽标 + 真实原因（紧凑态也显示）；未保存时不渲染「开始下一轮」；完成态「已专注」用结算值 |
| `src/client/types/index.ts` | — | `PendingSettlement.before?: PendingBaseline`（可选，timer 不进备份） |
| `src/client/lib/schema.ts` | — | `restoreTimerState` 校验并恢复 `pendingResult` 与 `before`，形状不对就丢 |

**测试（改/增）**

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `scripts/ui/settlement.test.ts` | 703 | 117 项：S1–S10（5.5.1 的 48 条全部保留）+ T1–T12（60）+ D1–D9（9） |
| `scripts/ui/recovery-ui.test.tsx` | 411 | 52 项：V1–V7（37 原有）+ V8 部分写入自动补齐 + V9 无基线不猜 + V10 失败后基线入 pending |
| `scripts/ui/focus-multi-tab.test.mjs` | 374 | 32 项：新增 §5「两个标签页同时恢复同一笔部分写入」（8 条） |
| `scripts/ui/workbench-harness.tsx` | 500 | `?timer=partial` 种子的基线改为**读存储真实当前值**（见 §13 备注） |
| `scripts/ui/focus-browser.test.mjs` | 505 | 72 项（本阶段未增，§12 真实配额注入沿用） |

**没有改**：`lib/tx.ts`、`lib/focus.ts` 的状态机语义、`lib/daily` 口径、备份格式、`BACKUP_KEYS`、
导入导出、热力图、Dashboard/Tasks/History 结构、`cordis.patch.yml`、`scripts/build.mjs`。

---

## 13. 测试基础设施的一个坑（记录下来，避免下次重复踩）

`?timer=partial` 种子最初把基线写死成 `dailyMinutes: 50 / taskMinutes: 0 / taskPomodoros: 0`。
多标签测试在**已有历史数据**上重放同一现场时（daily 已经 86、任务已经 36/2），基线（50）低于当前值（86），
`planRepair` 按规则判「已经算过」→ 不再补写 → 断言 `before + 18` 失败。

这不是被测代码的错，是**种子不自洽**：「回滚失败」的现场本应是「结算前的值 == 此刻的值」。
种子现在改为在写入前读存储真实值来构造基线，任何历史数据下现场都自洽。这类失败很有欺骗性
（看起来像修复逻辑坏掉），所以写进报告。

---

## 14. 未验证 / 需人工确认

1. **DSH 宿主内的行为未验证**：本阶段按约束没有启动 DSH 宿主，所有验收（含真实 Chromium、多标签、
   配额注入）都在独立 Chromium 里完成。宿主内的 `connection.fetch` 路由、`STORE_EVENT` 广播时序、
   宿主侧主题变量下的深色表现，仍需在宿主里走一遍（与 5.5/5.5.1 的结论一致，不是本阶段新增缺口）。
2. **真实的配额耗尽**：测试用 `QuotaExceededError` 注入，不代表真实磁盘满时的行为（浏览器可能在
   写入前就拒绝，也可能清掉别的 site data）。
3. **移动端 / 触屏长按**：本阶段未覆盖（5.5 已覆盖触屏点击）。
4. **人工确认建议（5 分钟）**：在浏览器 DevTools 里给 `:daily` 打断点或用
   `Storage.prototype.setItem` 抛错，结束一轮专注 → 应看到「未保存」且没有「开始下一轮」→
   刷新 → 数据自动补齐。

---

## 15. 最终结论：CONDITIONAL PASS

**为什么不是 FAIL**：本阶段列出的 6 项要求全部实现并有断言覆盖（§1 表格），全部 23 个套件
1172 项全绿，`tsc` 0 错误，构建与视觉门禁（42 张 + 12 张截图 0 溢出、87 个对比度采样点全 ≥4.5）
与上一轮持平。范围内没有发现新的、未处理的部分写入路径。

**为什么不是无条件 PASS**：以下三条是明确的能力边界，不是「待办」而是一时无法在本架构内消除：

1. **跨 round 并发无法检测**：localStorage 无锁无 CAS，A 结算第 1 轮、B 用旧快照结算第 2 轮时，
   后写覆盖先写，且 A 的写后校验发现不了（它只保证「自己那一条还在」）。
   缓解：同 round 完全幂等；跨轮丢的那一笔会在「今日专注分钟」与日志条数之间出现不一致，
   可通过导出备份 + 历史页明细发现，但没有自动修复。
2. **「判断不了」的场景只能人工处置**：基线丢失且该实体已被第三方改动时，系统不写、只报
   「无法确定」。这是刻意的（宁愿少写也不写错），但用户必须自己决定是重试、导出核对还是放弃。
3. **DSH 宿主内未验收**（§14 第 1 条）。

**通过的前提**：上述三条已在代码注释、界面文案与本报告中如实披露，且都不会导致「数据被写坏」
——最坏情况是「少记一笔 + 明确告知」。若后续要求「跨标签并发也不丢」，那需要换存储层
（IndexedDB 事务或宿主侧持久化），属于另一个阶段的架构决定，不在本阶段范围内。

**本阶段到此结束，不进入 Phase 5.6。**
