# Phase 6 · Final Release Audit

> 项目：Sorchron Study Board（溯时学习工作台）· 包名 `dsh-otaku-study-board`
> 版本：`4.0.0-rc.1` · 日期：2026-11-04 · 范围：Phase 6（发布审计与项目收尾）
> 结论：**RELEASE READY WITH LIMITATIONS**（无 P0/P1 遗留阻断；宿主内交互验证 NOT VERIFIED）

---

## A. 项目最终状态

| 项 | 事实 |
| --- | --- |
| 当前版本 | `4.0.0-rc.1`（未改版；仍为 RC） |
| 代码状态 | 只有一个统一工作台（V4）；V3 源码保留但不进 bundle；无 Classic 入口 |
| 构建 | `npm run build` 成功 → `lib/index.js` (205 B) + `lib/client.js` **533,601 B** |
| 类型 | `tsc --noEmit` **0 错误** |
| 注册 | `register-check.mjs` **13 / 13** |
| 自动化 | **1172 项 / 23 套件全绿**（分级见 §E） |
| 视觉门禁 | 截图 42 + 12 张，横向溢出 **0**；对比度 87 点，低于 4.5 的 **0** 点 |
| 发布准备 | 产物、清单、文档齐备；`npm pack --dry-run` = 10 个文件 / 148 kB（解包 618 kB） |
| 是否建议发布 | **建议**，前提是接受 §G 的已知限制，并补一次宿主内人工验收（§E.E） |
| 是否仍有阻断问题 | **无 P0/P1 遗留**；§B 的两处 P1 已在本阶段修复并回归 |

本阶段**默认代码冻结**：只解冻了「假按钮 + 不实文案」这一簇（见 §B），没有新增功能、没有重构、
没有碰结算架构、没有改备份格式与 `BACKUP_KEYS`、没有恢复 Classic、没有启动或重启 DSH 宿主。

---

## B. 本阶段审计结果

### B.1 发现的问题与处置

| # | 问题 | 等级 | 处置 | 依据 |
| --- | --- | --- | --- | --- |
| 1 | Dashboard「近 7 日专注」为空时有一个 **「去专注」假按钮**：点开是一个「尚未开放 · 专注计时器」的抽屉，写着「计时器迁移完成后…」。而计时器在 Phase 5.5 就已上线 —— 首屏最显眼的引导入口在告诉用户核心功能不存在 | **P1** | **已修**：删除该按钮，空状态改为「在上方「专注」卡里开始第一轮」 | 代码审计 + 实测渲染；与「不允许假按钮」硬规则冲突；`components.test.tsx` C32 原断言正是在保护这个错误行为 |
| 2 | 「迁移计划」抽屉与多处详情页文案把**已完成**的能力写成未完成：专注计时器 `next`、会话日志与自动采集 `later` 且称「自动采集处于暂停状态」、会话绑定 `next` | **P1** | **已修**：ROADMAP 逐条改为 `now` 并重写描述；新增「斜杠命令执行」独立条目保持 `later` | 产品内自述与实现矛盾（5.5 已迁移），违反「状态必须真实」 |
| 3 | 三处详情页残留 V3 时代文案：子任务「仍在任务页（经典结构）」、预估「与任务绑定专注会话尚未迁移」、「完整计时器随 Focus 阶段迁移」、时间轴「随 History 阶段迁移」 | P2 | **已修**（只改文案，指向真实位置或明确「不开放」） | 同上；「经典结构」现在根本不存在，会误导用户去找不存在的入口 |
| 4 | 「放弃这一笔」在部分写入后**只清标记、不删已写入的日志**，随后界面显示「已记入…」，但 `daily`/任务副本没有这一笔 → 统计漂移 | **P2（实测确认，未修）** | 记录到 `KNOWN-LIMITATIONS.md` A2，给出最小修法，不在本阶段动结算代码 | 实测（见 §D.A）；数据不丢、`max(daily, logs)` 让热力图不出现负数偏差，但日聚合与任务投入少一笔 |
| 5 | `package.json` 的 `description` 仍在描述 **V3**，且宣传了 V4 未上线的能力（上下文洞察、斜杠命令、阻碍日志、项目快照） | P2 | **已修**（改写为 V4 实际能力；版本号未动） | 发布元数据要与产品一致 |
| 6 | `lib/backup.ts` 的入参注释写「不传就不写该字段」，与实现（恒写空值）相反 | P3 | **已修**（注释改正） | 这条正是历史上踩过的坑，注释留着会害下一个人 |
| 7 | `v4/ui.tsx` 的 `ViewTabs` 是死组件（仅测试 C22 引用），仍打进 bundle，产物里能 grep 到「经典工作台」 | P3 | **记录未修**（冻结） | 不影响运行时；删除要同步改测试与 CSS，收益低于冻结成本 |
| 8 | `board.css` 约 146 个类未被引用（含 138 个 `.osb-*`，约 22 KB / 18%） | P3 | **记录未修** | 属 V3 下线时的批量清理，现在删了迁移还要抄回来 |
| 9 | 根目录残留陈旧构建目录 `.build/`（8.3 MB，两个 08:46 的 .cjs 副本） | P3 | **已删** | 临时产物，不被任何脚本引用，也不在 `files` 清单里 |

### B.2 修改文件清单（全部改动）

| 文件 | 改动 | 风险 |
| --- | --- | --- |
| `src/client/v4/Dashboard.tsx` | 删除「去专注」假按钮及其 `unavailable` 抽屉调用；文件头注释改为真实状态 | 低：只删一个空状态按钮，无数据路径 |
| `src/client/v4/DetailContent.tsx` | 4 处详情文案改为指向真实位置；迁移计划 4 条改成 6 条（专注/采集/绑定 → `now`，斜杠命令执行单列 `later`，子任务与预估合并为 `next`） | 低：纯文案与静态数组 |
| `src/client/v4/Shell.tsx` | 文件头注释去重（「第二套界面」措辞） | 无 |
| `src/client/lib/backup.ts` | 入参注释与实现对齐 | 无 |
| `scripts/ui/components.test.tsx` | C32 改为断言「不再有『去专注』占位入口 + 专注卡可开始」 | 低：断言跟随产品 |
| `package.json` | `description` 改写；`files` 增加 3 份发布文档 | 低：不影响运行时 |
| `README.md` | 重写为 V4 现状（原为 V3 时代） | 无 |
| `USER-GUIDE.md` `ARCHITECTURE.md` `KNOWN-LIMITATIONS.md` | 新增 | 无 |
| `scripts/audit-bundle.mjs` `audit-css.mjs` `audit-discard.mjs` | 新增一次性审计工具（不进发布包） | 无 |

### B.3 未发现问题的项（审计过、结论是「干净」）

- **Classic/V3 用户入口**：无。`ViewTabs` 未被任何产品代码引用，全局搜不到 `#classic`、切换器、
  「经典工具」按钮。
- **调试代码 / 开发开关**：产品代码里没有 `console.log`（只有 `index.tsx` 的一处 `console.warn`
  兜底）、没有 `location.search`/`window.__debug` 之类的开关、没有 URL 参数分支。
- **监听器与定时器**：11 处 `addEventListener` / `setInterval` / `setTimeout` 全部有对应清理
  （`useLocalStore` 的 `STORE_EVENT` 与 `storage`、`useStorageQuota` 的 15s 巡检、`useBoardData` 的
  30s 时钟、`NoticeHost` 的 2s 巡检、`useTimer` 的 tick 与 `visibilitychange`、`conflict` 的冲突事件、
  `Detail` 的 keydown、`useHarnessEvent` 的 window 桥）。唯一脱离生命周期的是
  `workspace.closeOverlay` 的 `setTimeout(0)`：只做 `scrollTo` 与 `focus`，不 setState，无卸载告警。
- **未处理的 Promise rejection**：`readOriginEstimate` 内部 try/catch 且只返回 `null`；
  `useDataTransfer` 的 `commit` 全程 `try/catch` 并把真实错误交给 UI。
- **XSS 面**：整个 `src` 里没有 `innerHTML` / `dangerouslySetInnerHTML`，导入的 JSON 只经
  `coerce*` 结构化处理。
- **重复状态**：`activeProjectId` 只有一个来源（`settings.activeProjectId` → `useBoardData` 派生
  `scoped*`），组件不做二次筛选。模块级单例（notice bus / capture state / conflict 表 /
  `useHarnessEvent.activeDispose`）都是刻意的单例，有注释说明。
- **依赖**：运行时零 `dependencies`；`devDependencies` 六个全部被使用（esbuild / jsdom /
  testing-library / types / typescript）。`peerDependencies` 里 react 与两个 DSH 包均为 optional。
- **样式隔离**：`board.css` 4947 行，顶层规则**全部**以 `.v4-*` / `.osb-*` 开头，没有 `body`、`*`、
  裸标签选择器；深色只在 `body[data-ds-dark-theme]` 下覆写（13 处）；颜色优先用 `--dsw-alias-*`；
  `prefers-reduced-motion` 2 个块；z-index 只有 4 个值（60 ×2、45、-1），浮层统一 60。

---

## C. 功能完整性矩阵

状态口径：**COMPLETE** = 有真实数据与真实操作；**PARTIAL** = 只读或缺写入口；
**UNAVAILABLE** = 无入口（产品内明确标注）；**BLOCKED** = 有阻断问题（本阶段 0 项）。

| # | 功能 | 状态 | 用户能看到 | 用户能做什么 | 数据来源 / 持久化 | 测试覆盖 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Dashboard | **COMPLETE** | 4 指标、今日任务、专注卡、项目进度、近 7 日趋势、最近活动、知识与记忆概览 | 勾选完成任务、展开卡片、点指标/项目/事件开抽屉、发起专注 | `tasks`/`daily`/`logs`/`timeline`/`projects`，全部 localStorage | components 46（含 C46 勾选写回）、workbench 25、workbench-browser 26 |
| 2 | Tasks | **COMPLETE** | 列表、计数、搜索、排序、4 种状态筛选、行内摘要、详情抽屉 | 新建 / 编辑 / 完成 / 重开 / 两步确认删除 / 搜索 / 排序 / 筛选 | `tasks` + `daily.tasksDone` + `timeline` | workbench 25、tasks-browser 15 |
| 3 | Focus Timer | **COMPLETE** | 时钟、状态徽标、已专注分钟、绑定任务、休息提示 | 开始 / 暂停 / 继续 / 结束并记录 / 取消 / 短休长休 / 开始下一轮 / 重试写入 / 放弃 | `timer` 瞬态 + 结算写 `logs`/`daily`/`tasks`/`timeline` | focus 96、focus-ui 63、focus-browser 72、multi-tab 32、settlement 117、recovery-ui 52 |
| 4 | Session Capture | **COMPLETE**（客户端链路） | 设置卡：开关、监听状态、事件通道、口径说明 | 开 / 关自动记录 | 宿主事件 → `logs`（`kind!=='focus'`）+ `daily.sessions` | focus-ui（采集卡）、focus-browser（window 桥）。**宿主真实事件通道 NOT VERIFIED** |
| 5 | History | **PARTIAL** | 30/90/365 天热力图、活跃天数、连续天数、按天时间轴 | 切范围、点某天、键盘方向键 + Enter | `daily`+`logs`+`tasks` 聚合（只读视图，不写库） | history 16、history-browser 28、activity 37。缺：会话日志逐条明细/编辑 |
| 6 | Activity Heatmap | **COMPLETE** | 五档强度格子、tooltip、图例、连续统计 | 同上（点击/键盘） | `lib/activity`：`score = 专注分钟 + 完成数×25`，阈值 `[1,25,60,120]` | activity 37、history-browser 28 |
| 7 | Projects | **PARTIAL** | 项目进度条、顶部项目作用域、项目抽屉（只读） | 切换作用域查看、展开全部项目 | `projects` + `scoped*` 过滤 | components/workbench（渲染）、Dashboard 只读。缺：新建/模板/归档/快照 |
| 8 | Memory | **PARTIAL** | Dashboard 卡片里的记忆文档数、复习次数 | 打开抽屉看概览 | `memory`（repo 读取） | components/workbench 渲染断言。缺：草稿/采纳/版本对比 |
| 9 | Knowledge | **PARTIAL** | 知识点数、节点列表、熟练度 | 展开看节点 | `knowledge` + `reviews` | workbench D22（只读且无写入口）。缺：编辑/依赖/排期 |
| 10 | Backup / Restore | **COMPLETE** | 导出范围、条数、预览冲突、导入进度、结果、存储占用 | 导出（全量/7 天/当月）、导入预览、合并/覆盖、清空（两步确认） | 12 键事务写；`pendingResult` 不参与导入 | data 28、data-browser 31、smoke（往返/合并/覆盖） |
| 11 | Settings | **COMPLETE** | 数据概览、会话采集、存储、导出、导入、危险区、能力边界 | 开关采集、探针写测试、导出导入、清空 | 读全量 + 事务写 | data 28、workbench |
| 12 | Friction Log | **PARTIAL** | 阻碍出现在时间轴事件里（「出现阻碍/解决阻碍」） | 只能看，不能编辑或标记解决 | `friction` + `timeline`（采集写入/合并） | smoke（`addFrictionMerged`/`resolveFriction`）。缺：独立页面 |
| 13 | Monthly Goals | **UNAVAILABLE** | 无入口（迁移计划里标注 `later`，目标位置 Settings 低频工具区） | — | `meta` 字段保留 | 无 UI 测试 |
| 14 | Context Stats | **UNAVAILABLE** | 无入口 | — | 旧 `lib/context` 保留但不在 bundle | smoke 覆盖纯函数；无 UI |
| 15 | Slash Commands | **PARTIAL** | 无 UI；`/board-*` 不会写进日志 | 不能执行命令 | 捕获侧只过滤 | smoke（`parseCommand`）。缺：执行通道 |

**关于「假按钮」**：本阶段把唯一一处（Dashboard 的「去专注」）删掉了。
现在点击后只剩三种结果：跳转 / 打开抽屉或弹层 / 真的写数据。产品内所有「尚未开放」的能力
都没有按钮，只在迁移计划里列出条目。

---

## D. 数据安全结论（Focus Settlement / pending / 恢复 / 备份）

审计对象：`settlement.ts`、`pendingResult`、`SettlementBaseline`、`snapshotBaseline`、
`verifySettlement`、`planRepair`、`discardPending`、`keepBaseline`、`finishFocus`、
`repairDuplicateSettlements`。逐条回答 Phase 6 §二.3 的 A–G：

| 问 | 结论 | 证据 |
| --- | --- | --- |
| **A. 部分写入后「放弃恢复」会留下不一致吗？** | **会。P2，已披露，未修**（本阶段唯一新发现的真实缺陷） | 实测：造「日志在（18m）、daily=基线+5、pending 在」的现场 → 界面「未保存 / 无法确定」→ 点「放弃这一笔」（DOM click）→ 结果 `logs:1, daily:未变, timeline:1, pending:null`，面板随即显示「已记入…」。详见 §D.1 |
| **B. `discardPending` 是否只清标记？** | **是**，不删已落盘数据 | 代码只 `delete pendingResult` 后 commit；实测日志与时间轴均保留 |
| **C. 没有基线时是否不猜？** | **是** | `planRepair` 只用 `input.baseline`；无基线 → `ambiguous` → 不写，返回 `ok:false` 且 `pending` 保留。T8、V9 |
| **D. 校验模糊时是否保留 pending 并说明？** | **是** | 界面显示「只写了一部分（仍缺 日聚合）；其中 日聚合 无法确定是否已经累计过，已保留待保存状态，请先导出备份再重试」，且**没有**「开始下一轮」。实测输出见 §D.1 |
| **E. 同 roundId 重试会重复写吗？** | **不会** | 三层幂等：`roundId` → 四实体校验 → 重复收敛。T6（第二次是「已完整」）、V6（双击只写一条）、multi-tab（两标签同时恢复只记一笔） |
| **F. 重复记录修复会误删正常记录吗？** | **不会** | 只处理「同一 id 出现多次」的 focus 日志，按 id 留最早一条；`kind!=='focus'` 不参与；S8/S9 + V5 实测（正常日志与任务不受影响） |
| **G. 跨轮次多标签 lost update 还在吗？** | **在，无法检测** | localStorage 无锁无 CAS；同 round 值幂等不翻倍，跨 round 后写覆盖先写。已写入 `KNOWN-LIMITATIONS.md` A1 与 `settlement.ts` 头注释 |

### D.1 「放弃这一笔」的实测现场（可复现）

```
现场：日志条数 = 1 ｜基线 Daily = 68 ｜当前 Daily = 73
放弃前：{ unsaved: true, logs: 1, daily: 73, pending: 'focus-seed-partial', timeline: 1 }
        文案：「本轮完成 · 18m 未保存 …只写了一部分（仍缺 日聚合）；其中 日聚合 无法确定是否已经
               累计过，已保留待保存状态，请先导出备份再重试」
点击「放弃这一笔」后：{ logs: 1, daily: 73, pending: null, timeline: 1 }
        文案：「本轮完成 · 18m 已记入「…任务…」 · 1 分钟前  [开始下一轮] [进入休息]」
```

结论：**数据没丢，但停在「日志在、日聚合不在」的状态，界面却回到了「已记入」**。
影响：导出备份里 `logs` 与 `daily` 对不上；任务投入少 18 分钟；「今日专注」按日志求和仍然包含它，
所以热力图不会出现负数偏差，用户很难自己发现。

最小修法（建议 Phase 6.1 做，不在本阶段）：基线证明本轮**未计入**时，放弃时删除本轮日志与对应
时间轴事件（回到完全没记过的一致态）；证明不了时保留数据并把文案改成「日志保留，日聚合未计入」。
需要新增一个 `discardSettlement(store, result, baseline)` 导出 + 2 条 jsdom 断言，不动事务本原语。

### D.2 数据兼容与备份恢复（§三 全 12 项）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| V1/V2/V3 旧数据读取 | 通过 | `unwrapEnvelope` 接受裸数组（V1）/`schemaVersion 2|3`/V4；`coercePayload` 读时补齐。smoke「只有 data 没有版本号时按 V1 处理」 |
| V4 读取 | 通过 | `SCHEMA_VERSION = 4`；14 个键独立，缺失即空 |
| 导出 | 通过 | 12 个实体字段**恒写**（缺省给空值）；E3 断言字段齐全、版本 4；E5 全量不丢归档 |
| 导入恢复 | 通过 | 预览不写盘（I2）→ 合并（I3）/覆盖（I7）→ 一次事务 12 键 |
| 重复导入 | 通过 | 按 id 幂等，I5「同一文件再导入任务数不变」 |
| 非法文件 | 通过 | I10 明确报错、I11 不改动任何数据 |
| 超大文件 | 通过 | `MAX_IMPORT_CHARS = 8,000,000`，读取**之前**拒绝（I12） |
| 部分无效数据 | 通过 | `coerce*` 丢弃并计数，I13 警告说明跳过条数、I14 只写可识别记录 |
| 事务失败回滚 | 通过 | I15 显示回滚结果、I16 无部分导入残留 |
| 存储空间不足 | 通过（有边界） | `probeWritable` 实测三态；回滚本身也可能失败，此时明确提示「数据可能不一致」（已知限制 A4） |
| `pendingResult` 恢复 | 通过 | 挂载自动 `retryPending`；V3/V8；导入**不触碰** `timer` 键，所以导入不会冲掉待保存的专注 |
| 数据版本升级 | 通过 | 打开页面不写回；只有真正修改才写成 `schemaVersion: 4` |

**没有为这些重复编写测试**：E1–E8 / I1–I16 / D1–D3 / S1 已覆盖，本阶段只做「测试还是否对应当前代码」
的复核（结论：对得上；唯一需要改的是 C32，因为产品行为变了）。

---

## E. 测试结果（分级，全部为本次真实执行）

环境：Windows · Node 22.22.2 · Chrome（独立无头实例，非 DSH 宿主）· 2026-11-04 11:2x–11:5x。

### E.A TypeScript / Build

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | **0 错误** |
| `node scripts/build.mjs` | 成功 |
| `lib/client.js` | **533,601 B**（521.1 KiB） |
| `lib/index.js` | 205 B |
| `register-check.mjs` | **13 / 13** |

### E.B Unit / Integration（纯逻辑，无 DOM）

| 套件 | 结果 |
| --- | --- |
| `smoke.ts` | 415 / 415 |
| `activity.test.ts` | 37 / 37 |
| `focus.test.ts` | 96 / 96 |
| `settlement.test.ts` | 117 / 117 |

### E.C React / jsdom

| 套件 | 结果 |
| --- | --- |
| `components.test.tsx` | 46 / 46（含改写后的 C32） |
| `workbench.test.tsx` | 25 / 25 |
| `data.test.tsx` | 28 / 28 |
| `history.test.tsx` | 16 / 16 |
| `focus-ui.test.tsx` | 63 / 63 |
| `recovery-ui.test.tsx` | 52 / 52 |

### E.D Independent Chromium（**不是** DSH 宿主）

| 套件 | 结果 |
| --- | --- |
| `workbench-browser` | 26 / 26 |
| `data-browser` | 31 / 31 |
| `history-browser` | 28 / 28 |
| `focus-browser` | 72 / 72 |
| `focus-multi-tab`（同 profile 多标签） | 32 / 32 |
| `layout-browser` | 21 / 21 |
| `shell-browser` | 12 / 12 |
| `tasks-browser` | 15 / 15 |
| `button-browser` | 13 / 13 |
| `conflict-browser` | 6 / 6 |
| `v3-hover` | 8 / 8 |
| 截图（`workbench-shot` 42 + `glass-shot` 12） | 横向溢出 **0** |
| 对比度（`glass-contrast`） | 87 点，低于 4.5 的 **0** 点 |

**合计 1172 项全绿**（13+415+46+25+28+37+16+96+63+117+52+26+31+28+72+32+21+12+15+13+6+8）。

### E.E Real DSH Host —— **NOT VERIFIED**

已核查的**只读事实**：

- DSH 桌面版**正在运行**（`DeepSeek Harness`，5 个进程，主进程 PID 7072，启动于 11:17:41）。
- profile = `desktop`；`dsh.profile.bundles` 包含 `dsh-otaku-study-board`。
- `~/.dsh/profiles/desktop/node_modules/dsh-otaku-study-board` 是指向本仓库的 **junction**，
  目标是 `<repo>`（目录名含 U+2011 连字符，解析正常）。
- 宿主只在 127.0.0.1 上监听了 8326 / 62900–62903，均为**需要 API key 的模型网关类端口**
  （返回 401），**没有**渲染进程调试端口（9222 / 9223 / 9344 / 9345 全部未监听）。

为什么**无法**完成宿主内验证：要抓页面必须让 Electron 带 `--remote-debugging-port` 启动，
也就是**重启宿主**。Phase 6 明确禁止擅自启动/关闭/重启 DSH，也禁止修改系统安全策略来绕过限制。
因此按规则标记 **NOT VERIFIED**，不写成 PASS。

另外必须说明：本阶段改过 Dashboard / DetailContent 的文案（删了一个假按钮），而宿主内存里是
11:17 启动时加载的**旧 bundle**（`lib/client.js` 于 11:32 / 11:47 重新生成）。要看本次改动，需要
**重载 DSH 窗口**（或重启宿主）—— 这一步需要用户授权，本阶段未执行。

建议的人工验收清单（重载窗口后 5 分钟）：

1. 左侧导航出现「溯时学习工作台」，点击后主区是工作台（不是空白、不是旧看板）。
2. Dashboard 四个数字来自真实数据；「近 7 日专注」为空时**没有**「去专注」按钮。
3. 新建一个任务 → 勾选完成 → 历史页当天出现 `task.completed`。
4. 开始专注 → 暂停 → 继续 → 结束并记录 → 任务「已专注」增加、今日专注增加。
5. 设置 → 会话采集：状态为「监听中」；在宿主里跑一次会话，日志条数增加、专注分钟不变。
6. 宿主切深色 → 工作台跟随；打开抽屉与弹层，检查不遮挡、可 `Esc` 关闭。
7. 刷新窗口 → 数据仍在，专注不会重复记账。

---

## F. 发布产物

| 项 | 值 |
| --- | --- |
| 版本 | `4.0.0-rc.1`（未修改） |
| 包名 / 显示名 | `dsh-otaku-study-board` / Sorchron Study Board · 溯时学习工作台 |
| 注册清单 | `cordis.patch.yml`：`id: otaku-study-board` · `name: dsh-otaku-study-board`（`register-check` 13/13） |
| Bundle | `lib/client.js` 533,601 B · `lib/index.js` 205 B |
| 发布包 | `npm pack --dry-run` → 10 个文件 / 148 kB（解包 618 kB） |
| 产物位置 | `<repo>/lib/`；`package.json` 的 `files` 白名单决定入包内容 |
| 文档清单 | `README.md`、`USER-GUIDE.md`、`ARCHITECTURE.md`、`KNOWN-LIMITATIONS.md`、`TESTING.md`、本文件（本文件是内部审计，**刻意不进 npm 包**） |
| **Git 状态** | **本目录不是 git 仓库**（`fatal: not a git repository`），所以无 commit、无分支、无 staged 变更；本阶段**未**执行任何 `git init` / `add` / `commit` / `push` |
| 安装路径 | `~/.dsh/profiles/desktop/node_modules/dsh-otaku-study-board` → junction → 本仓库 |
| 安装方式验证 | `dsh plugin --profile desktop add "file:..."` 的产物已存在（junction + profile bundles 行），`register-check` 通过 |
| 临时产物 | 已删根目录陈旧 `.build/`（8.3 MB）；`scripts/ui/.build/`（18 MB，测试缓存）与 `smoke.cjs`（252 KB，测试产物）保留，均**不在** `files` 白名单里，不会进发布包 |
| 未执行 | 未发布 npm、未打 tag、未创建 Release、未上传、未覆盖任何已有发布文件 |

版本建议：**保持 `4.0.0-rc.1` 不变**。理由：本阶段没有新增功能，只修了两处 P1 文案/入口问题；
是否升到 `4.0.0` 是发布策略问题，应由项目负责人决定（升版需要同时确认宿主侧验收完成）。
如需我改，请明确版本号。

---

## G. 已知限制（摘要，全文见 `KNOWN-LIMITATIONS.md`）

| 编号 | 限制 | 等级 | 能否规避 |
| --- | --- | --- | --- |
| A1 | 多标签页跨轮次并发写入会丢一笔且无法检测（localStorage 无锁） | **P1** | 只开一个标签页计时；导入/清空时关掉其他标签 |
| A2 | 「放弃这一笔」在部分写入后留下「日志在、日聚合不在」的半截数据 | P2 | 优先「重试写入」；必须放弃时先导出备份 |
| A3 | 基线丢失且数据被改动时只能报「无法确定」，需人工判断 | P2 | 导出备份 → 人工核对 → 再决定 |
| A4 | 存储真满时回滚也可能失败（已如实提示「数据可能不一致」） | P2 | 先导出、清理站点数据再重试 |
| A5 | 没有跨标签的导入/清空互斥锁 | P2 | 数据操作只在一个标签页做 |
| B1–B6 | 日聚合无项目维度 / 历史窗口 365 天 / 时间轴 1200 条环形上限 / 快照每项目 12 份 / 站点用量含宿主 / 5 MB 估算 | P2–P3 | 导出 JSON 自行分析 |
| C | 9 项 V3 能力尚未迁移（子任务勾选、预估、项目管理写操作、记忆/知识编辑、阻碍 UI、月度目标、上下文统计、斜杠命令执行、日志逐条明细） | P2–P3 | 无假入口，迁移计划里标明目标位置 |
| D1 | **真实 DSH 宿主内验收未完成** | 发布级限制 | 重载窗口后按 §E.E 清单人工过一遍 |
| D2 | 离开 Dashboard 时计时器不 tick（回来自动补算） | P3 | 停在 Dashboard 看钟 |
| D3 | 跨时区旅行后日期归属按新本地时区重算 | P3 | 跨时区前导出备份 |
| D4 | 隐私模式/存储被禁用时写入会明确失败，待保存那笔刷新即丢 | P2 | 不要在隐私窗口使用 |
| E1–E3 | `ViewTabs` 死组件仍在 bundle、146 个未用 CSS 类（22 KB）、27 个 V3 源文件保留不上线 | P3 | 无（不影响运行） |

---

## H. 最终结论

# RELEASE READY WITH LIMITATIONS

**判定依据**

- 没有已知 **P0/P1 遗留阻断**：本阶段发现的两处 P1（假按钮 + 已完成功能被写成未完成）已修复并回归；
  剩余问题里最高等级是 P1 的 **A1（多标签跨轮次并发）**，那是 localStorage 的架构上限、
  早已在代码注释与文档中披露，且同轮次完全幂等、最坏结果是「少记一笔」而不是「数据被写坏」。
- 必要验证已完成：类型 0 错误、构建成功、注册 13/13、**1172 项自动化全绿**、
  截图 0 溢出、对比度 0 违规、备份/导入/回滚/旧版本兼容全部有断言。
- 未完成的验证已明确标注：**真实 DSH 宿主内的交互验收 = NOT VERIFIED**（宿主在运行，但没有调试端口，
  完成它必须重启宿主，本阶段无授权）。

**发布前请确认两件事（需要你决定）**

1. **是否重载/重启 DSH 窗口**，以便我完成宿主内验收（§E.E 那 7 条）。不重载的话，宿主里看到的
   UI 仍是 11:17 的旧 bundle。
2. **是否升版本号**（`4.0.0-rc.1 → ?`）。我建议保持 RC，等宿主验收通过再定。

**本阶段到此结束。** 未进入任何新功能开发，未发布、未推送、未改动宿主。
