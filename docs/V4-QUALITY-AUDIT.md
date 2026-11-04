# V4 质量审计报告（Sorchron Study Board）

> 审计对象：`dsh-otaku-study-board` 4.0.0-rc.1（V4 阶段 1：数据层）
> 审计时间：2026-11-02 00:10 – 01:40（GMT+8）
> 审计方式：只读探针取证 → 分类 → 最小修复 → 回归
> 结论：**发现 16 个真实缺陷（1 个 P0 / 4 个 P1 / 7 个 P2 / 4 个 P3），已修复 12 个、缓解 2 个、记录 2 个；断言 302 → 350，全部通过。**

---

## 1. 审计概况

### 1.1 范围

| 类别 | 审计对象 |
| --- | --- |
| 数据层 | `types/{index,v4}.ts`、`lib/{schema,backup,defaults,validate,bus}.ts` |
| 存储层 | `lib/repo/{types,local,index}.ts`、`hooks/useLocalStore.ts` |
| 业务逻辑 | `lib/{daily,timeline,memory,knowledge,review,heatmap,history}.ts` |
| 测试体系 | `scripts/{smoke.ts,register-check.mjs}` |
| 未覆盖 | AI 服务（未实现）、V4 UI（未实现）、真实 DSH 宿主 |

### 1.2 基线（修复前，原始记录）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `tsc --noEmit` | 0 | 无输出（0 错误） |
| `node scripts/build.mjs` | 0 | `lib/index.js` 205 B / `lib/client.js` ~350 KB |
| `node scripts/register-check.mjs` | 0 | 13 通过 / 0 失败 |
| `smoke.ts`（esbuild → node） | 0 | **302 通过 / 0 失败** |

> 断言数是**实际执行**的 `check()` 调用数（`grep -c "PASS"` 与 `console` 汇总一致），不是文档抄来的数字。

### 1.3 审计方法

1. 通读 12 个数据层模块与 2 个测试脚本；
2. 把每个怀疑点写成 `scripts/audit-probe.ts`（只读探针，不写存储、不改代码），逐条打印实测值；
3. 探针确认后才记为 Bug，未确认的写成「待验证」而不是「已发现」；
4. 修复后**复跑同一探针**，对比前后值作为证据。

---

## 2. Bug 清单

| ID | 级别 | 位置 | 问题 | 复现（探针编号） | 状态 |
| --- | --- | --- | --- | --- | --- |
| QA-01 | **P0** | `lib/backup.ts` | 导出/导入完全丢弃 V4 六个实体。`buildBackup` 不接收、`parseBackup` 不解析、`applyImport` 不合并 → 一旦 UI 写入记忆/知识/日聚合，备份就是**假备份** | B1/B2：`buildBackup(...).memory === undefined`；导入含 `memory` 的文件后 `payload.memory === undefined` | 已修复 |
| QA-02 | **P1** | `lib/schema.ts` `readTime` | 「事件时间」的 24 小时钳制被复用到「计划时间」：`nextReviewAt` 90 天被压成 0.51 天，`nextAt` 90 天同样。**间隔复习刷新即失效** | A1/A2：期望 `NOW+30d`，实际 `+0.51d` | 已修复 |
| QA-03 | **P1** | `lib/repo/local.ts` | 用 boolean 判断存储可用性：浏览器**禁用存储**时降级到内存却返回 `true`，用户以为保存成功 | 静态确认 + 新增 S1（模拟 `localStorage` 抛错）：修复前返回 `true` | 已修复 |
| QA-04 | **P1** | `lib/timeline.ts` | 去重键为 `type|refId`，不含 `projectId`：两个项目在同一分钟完成同 id 任务，第二条被静默吞掉 | F2：第二次 `added=false`，列表仍 1 条 | 已修复 |
| QA-05 | **P1** | `lib/schema.ts` `coerceMemoryDrafts` | 草稿 `patch` 原样透传，`meta` 又进备份（用户可编辑）→ 采纳含 `done:[123]` 的草稿时 `item.trim is not a function` **直接崩页** | C2：`崩溃：item.trim is not a function` | 已修复 |
| QA-06 | P2 | `lib/schema.ts` 同上 | 键名 `__proto__` 会**替换草稿表的原型**（`out[key] = {...}`） | C1：`Object.getPrototypeOf(drafts)` ≠ `Object.prototype`，实际为草稿对象 | 已修复 |
| QA-07 | P2 | `lib/memory.ts` | 空补丁也 `version + 1`，历史对比里出现「有变化」的假信号 | G2：空补丁后 `version === 2` | 已修复 |
| QA-08 | P2 | `lib/daily.ts` | 增量接口非幂等：同一事件投递两次就双计，且没有幂等修复入口 | D1：增量两次 50 分钟，重建 25 分钟 | 已缓解（新增 `rebuildDay`） |
| QA-09 | P2 | `lib/timeline.ts` | 乱序写入（导入/补录）直接 unshift，破坏「新→旧」不变式，去重窗口随之错位 | F1：列表为 `["较旧","较新"]` | 已修复 |
| QA-10 | P2 | `lib/knowledge.ts` + `review` | 删除知识节点不清理复习记录，`reviewStats` 把孤儿记录计入「总复习/连续天数」 | E2：节点 0 个，复习统计仍 1 条 | 已缓解（新增 `pruneReviews`） |
| QA-11 | P2 | `lib/review.ts` | `dueNodes` 只认 `nextReviewAt`，手动标记 `status='review'` 的节点永远不进队列（死状态） | E1：队列长度 0 | 已修复 |
| QA-12 | P2 | `lib/memory.ts` `mergeList` | 对数组项直接 `.trim()`，非字符串即崩（靠 QA-05 的入口清洗兜住，属纵深防御） | C2 根因 | 已加固 |
| QA-13 | P3 | `lib/schema.ts` `coerceDaily` | 正则只校验形状，`2026-02-31` 被接受，成为幽灵日期 | G1：原样接受 | 已修复 |
| QA-14 | P3 | `lib/knowledge.ts` `addEdge` | 每次调用全量复制数组（O(E)），批量建 900 边约 100 ms；交互单条无感 | 性能实测 H | 记录不修 |
| QA-15 | P3 | `lib/review.ts` `schedule` | `nextAt = 本地零点 + N×86400000`，夏令时切换会偏移 1 小时（中国无 DST） | 代码审查 | 记录不修 |
| QA-16 | P3 | `lib/backup.ts` `buildBackup` | V4 字段「传了才写」，漏传即静默丢数据且文件里看不出来（QA-01 的第二层） | B1 | 已修复（恒写空值） |

### 修复后探针对比（同一脚本）

| 探针 | 修复前 | 修复后 |
| --- | --- | --- |
| A1 90 天排期 | 0.51 天 | **30.00 天** |
| A2 30 天排期 | 0.51 天 | **90.00 天** |
| B1 导出 v4 字段 | `{}` | `memory` / `daily` / `knowledge` 均在 |
| B2 导入 v4 数据 | 全丢 | 记忆 / 日聚合 / 图谱均保留 |
| C1 草稿原型 | 被替换 | `null`（安全） |
| C2 脏草稿 | 崩溃 | 不崩溃 |
| E1 `status=review` | 0 条 | 1 条 |
| F1 乱序写入 | `["较旧","较新"]` | `["较新","较旧"]` |
| F2 跨项目同 id | 被吞 | 2 条 |
| G1 2026-02-31 | 接受 | 拒绝 |
| G2 空补丁 | version 2 | version 1 |

---

## 3. 安全审计

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| API Key 是否进入客户端 bundle | **不适用（AI 未实现）** | `grep -rniE "apikey|bearer|secret" src` 仅命中 `token` 计数等无关词 |
| 密钥是否进 localStorage / 备份 / 日志 | 不适用（未实现） | 同上；备份字段里无任何凭据 |
| 是否存在外发网络请求 | **否** | `grep -rnE "fetch\\(|XMLHttpRequest|sendBeacon" src` 无结果 |
| XSS 风险 | **无** | 无 `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `new Function`；所有用户内容经 React 文本节点渲染 |
| 原型污染 | **已修复 1 处** | `coerceMemoryDrafts` 的 `__proto__` 键（QA-06）；`sessionTaskMap` 因值必须是字符串，原本就无法注入对象 |
| 导入数据体积 | **有上限** | memory 60 / reviews 2000 / timeline 1200 / history 240 / daily 800 / 图谱 500 节点 900 边 |
| 提示词注入 | **低风险，需说明** | `memoryToPrompt` 只生成**供用户复制**的文本，不自动发送；记忆内容本身是用户自己写的 |
| 未来 AI 代理的攻击面 | **未实现，列为门禁项** | 必须实现：仅 loopback、固定 baseURL 白名单（禁任意 URL，防 SSRF）、请求体大小上限、方法限定 POST、超时与并发限制、密钥仅 host 侧 0600 |

> 结论：**当前版本不存在密钥泄露或外发数据的路径**，因为 AI 层尚未落地。这不是「安全」，而是「还没有那个攻击面」——阶段 3 落地时必须按上表门禁逐项验收。

---

## 4. 测试覆盖矩阵

图例：✅ 有针对性断言｜🟡 只覆盖一部分/间接覆盖｜❌ 无覆盖

| 模块 | 正常流程 | 边界情况 | 异常处理 | 并发/重复 | 数据安全 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| schema 兜底 | ✅ | ✅ 非法日期/超界/NaN | ✅ 类型错、缺字段 | ✅ 重复 coerce 幂等 | ✅ 原型键 | 本次新增 A1–A3、C1–C3、G1 |
| backup | ✅ 往返 | ✅ 空数组、增量范围 | ✅ 坏 JSON/kind 错 | 🟡 重复导入只测合并语义 | ✅ v4 字段不丢 | 本次新增 B1–B5 |
| repo | ✅ 读写 | ✅ 空键兜底 | ✅ 存储被禁用 | ❌ 真实多标签并发 | ✅ 不谎报成功 | 无 window 用内存、有 window 抛错用 blocked |
| daily | ✅ 增量/重建 | ✅ 跨午夜、负数、超限 | 🟡 脏数据靠 coerce | ✅ `rebuildDay` 三次一致 | ❌ | 增量接口非幂等已在文档标注 |
| timeline | ✅ 写入/筛选 | ✅ 1200/1205 环形 | ✅ 非法类型 | ✅ 同键去重/跨项目 | ✅ 白名单 | 乱序写入本次修复 |
| memory | ✅ 补丁/版本 | ✅ 空补丁、去重、限长 | ✅ 脏草稿 | 🟡 多草稿并存未测 | ✅ 不覆盖已有 | 提示词不含日志原文 |
| knowledge | ✅ 增删边/关联 | ✅ 自环/成环/重复/上限 | ✅ 悬空边 | 🟡 批量删除只测单节点 | ✅ 级联 | 1000 节点性能实测 |
| review | ✅ 四档排期 | ✅ 上限/跨年/队列 | 🟡 非法 grade 依赖 coerce | ✅ 重复复习各记一条 | ✅ | `status=review` 本次修复 |
| heatmap | ✅ 年度网格 | ✅ 闰年/年初年末 | ✅ 无数据 | ✅ 与 daily 逐日比对 | ✅ 不伪造 | 5 档边界全部断言 |
| history | ✅ 采样/差异 | ✅ 12 上限/基线 | 🟡 跨版本读取未测 | 🟡 自动快照只测判定 | ✅ 只存 id | 同 id 改标题不算新增 |
| 事件采集/计时/UI | — | — | — | — | — | **V4 未改动，沿用 V3 断言；组件渲染无自动化** |

### 测试体系审查结论（对应任务第三阶段十问）

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 哪些模块完全没有自动化测试 | V4 全部模块原本**只有**正向断言；`repo` 的浏览器分支、`daily` 的幂等、`timeline` 的乱序、`review` 的手动状态完全没测（本次补齐） |
| 2 | 只有正常输入 | `daily`、`timeline`、`memory` 原本只有正常值；现已补负数、超限、脏类型、乱序 |
| 3 | 只验证返回值不验证副作用 | 原 `repo` 只断言读回条数；现补「写入返回 false 时不应谎报」与内存回读 |
| 4 | 弱断言 | 找到 1 处：`负数增量 >= 0`（永远成立）。已改为 `=== 0` |
| 5 | 测试相互依赖 | 无：每个 block 自带数据，`__resetMemoryStore` 显式复位 |
| 6 | 共享状态假阳性 | `globalThis.window` 只在新块内临时注入，`finally` 恢复 |
| 7 | 只验证 mock | `register-check` 用 stub 的 `react-dom`，因此**不渲染组件**——这是已知盲区，不是通过 |
| 8 | 未清理 localStorage/监听器 | smoke 不写真实 localStorage；repo 走内存分支。浏览器侧清理属于人工验收 |
| 9 | catch 吞掉失败 | 新增探针与测试里没有「catch 后不 fail」的写法 |
| 10 | 关键安全约束无测试 | 原型污染、脏草稿、跨项目去重、禁用存储误报，均新增断言 |

---

## 5. 新增测试

在 `scripts/smoke.ts` 追加三个段落，**没有删除或放宽任何旧断言**（旧的 302 条原样保留，仅把 1 处弱断言改强）：

| 段落 | 条数 | 覆盖 |
| --- | --- | --- |
| `[24] 审计回归` | 41 | QA-01~QA-13、QA-16 的逐条回归；含 1200/1205 环形、闰年、跨年排期、同 id 改标题 |
| `[25] 性能与大数据量` | 5 | 1000 节点/900 边构图与 DFS、800 天热力图 |
| `[26] 存储被禁用语义` | 2 | 模拟「有 window 但 localStorage 抛错」，断言写入返回 false |

合计新增 **48** 条（41 + 5 + 2），总数 **302 → 350**。

---

## 6. 性能测试（实测）

环境：Node 22.22.2 / Windows 11 / 单线程，数据在内存中构造。

| 场景 | 数据规模 | 耗时 |
| --- | --- | --- |
| 构图（`addEdge` 逐条） | 1000 节点 / 900 边 | **100.44 ms** |
| DFS 成环检测 | 900 边链 | **0.70 ms** |
| 年度热力图 | 800 天聚合 → 53 周网格 | **1.82 ms** |
| `rebuildDaily` | 2000 条日志 | **2.68 ms** |
| 仓储连续写入 | 100 次 × 50 条事件（内存模式） | **5.49 ms** |

发现的问题：

- **`addEdge` 是 O(E) 全量复制**：单条交互无感（<0.2ms），但「批量导入 900 条边」约 100ms。已记录（QA-14），不在本轮改动——改成可变结构会波及所有调用方，收益不匹配。
- 热力图与重建都远低于一帧预算（16ms），无需优化。

---

## 7. 修复记录

| Bug | 文件 | 根因 | 修复 | 回归测试 |
| --- | --- | --- | --- | --- |
| QA-01/16 | `lib/backup.ts`、`hooks/useBackup.ts`、`board/DataPanel.tsx` | V4 实体没接入备份的四个环节 | `buildBackup` 恒写六个字段（缺省空值）；`parseBackup` 逐条 coerce + 上限；`applyImport` 合并（记忆取高版本、图谱按语义去重、日聚合按天覆盖）；`filterByScope` 支持 v4；两个 UI 调用点改从 repo 读、导入后写 repo | B1–B5 |
| QA-02 | `lib/schema.ts` | 复用「事件时间」读取器处理「计划时间」 | 新增 `readScheduleTime`（上限 10 年），用于 `nextReviewAt` / `nextAt`；`at` / `completedAt` 仍用 24h 钳制 | A1–A3 |
| QA-03 | `lib/repo/local.ts` | `hasStorage(): boolean` 把「无 window」和「存储被禁」混为一谈 | 三态 `storageMode()`；`blocked` 时写内存但返回 `false` 并提示一次；值未变则不写不广播 | S1/S2 |
| QA-04 | `lib/timeline.ts` | 去重键缺项目维度 | 键改为 `type|projectId|refId`；窗口判断改为绝对值比较 | F2 |
| QA-05/06/12 | `lib/schema.ts`、`lib/memory.ts` | 草稿 patch 未清洗；字典键未过滤 | 新增 `coerceDraftPatch` 逐字段清洗；`Object.create(null)` + `isSafeKey` 过滤 `__proto__/constructor/prototype`；`mergeList` 跳过非字符串 | C1–C3 |
| QA-07 | `lib/memory.ts` | 无条件 `version+1` | 新增 `isSameContent`，内容未变直接返回原对象 | G2 |
| QA-08 | `lib/daily.ts` | 增量接口天生非幂等，且无修复入口 | 新增幂等 `rebuildDay`；文档明确「重试路径必须用它」 | D1 |
| QA-09 | `lib/timeline.ts` | 直接 unshift | 按 `at` 找插入位置，维持「新→旧」 | F1 |
| QA-10 | `lib/review.ts` | 删除节点不联动复习记录 | 新增 `pruneReviews(reviews, validIds)`（调用方在删除后调用） | E2 |
| QA-11 | `lib/review.ts` | 只认 `nextReviewAt` | `dueNodes` 同时接受 `status==='review'` | E1 |
| QA-13 | `lib/schema.ts` | 正则只校验形状 | 新增 `isRealDay`（构造 Date 反向校验） | G1 |

**未改动**：V3 的采集、计时、隔离、导入导出、组件——零行改动（除 DataPanel/useBackup 为接入 v4 备份而增加参数）。

---

## 8. 最终门禁（修复后实测）

| # | 检查 | 命令 | 结果 |
| --- | --- | --- | --- |
| 1 | 类型 | `tsc --noEmit` | **退出码 0**，0 错误 |
| 2 | 构建 | `node scripts/build.mjs` | **退出码 0**，`lib/client.js` 370,989 B |
| 3 | 挂载 | `node scripts/register-check.mjs` | **13 通过 / 0 失败** |
| 4 | 逻辑 | `smoke.ts` | **350 通过 / 0 失败** |
| 5 | 审计探针 | `audit-probe.ts` | 退出码 0，11 个原缺陷点全部翻转为期望值 |
| — | 合计断言 | 13 + 350 | **363** |

> 旧断言 0 删除、0 放宽；只有 1 处从 `>= 0` 改为 `=== 0`（更严格）。

---

## 9. 未解决问题（不得视为通过）

| # | 事项 | 原因 | 需要的验证方式 |
| --- | --- | --- | --- |
| U-01 | 组件渲染 / 交互完全无自动化 | 本地无 `react`/`react-dom`，`register-check` 用 stub | 在 PC-DSH 内按 TESTING.md 人工验收 |
| U-02 | 浏览器真实 localStorage I/O、配额、跨标签并发 | Node 环境无真实存储 | 浏览器人工：两标签页同时改同一任务、灌满 5MB |
| U-03 | AI 服务全部能力 | **未实现（阶段 3）** | 实现后按第 3 节门禁验收（loopback/SSRF/密钥/超时/降级） |
| U-04 | `daily` 与真实日志的端到端一致 | 写入点尚未接入（阶段 2+） | 接入后在浏览器比对「某天热力图 = 当天 focus 之和」 |
| U-05 | 多草稿并存、项目删除后的孤儿记忆 | 未定义交互（UI 未做） | 阶段 2 定接口后补测试 |
| U-06 | DST 时区下的排期偏移 | 中国无夏令时；未做跨时区设计 | 若有海外用户，改为「本地日历日 + N 天」实现 |
| U-07 | 跨 schema 版本读取历史快照 | 只有 v4 一种快照格式，无旧样本 | 造 v3 快照样本再补断言 |
| U-08 | `addEdge` 批量性能 | 交互场景无影响 | 若未来做「导入知识库」，再改可变结构 |

### 文档偏差（已同步）

- `README.md` / `docs/V4-ARCHITECTURE.md` 里的断言数原为 302，已更新为 **350**（总 363）。
- 架构文档写的「阶段 1 无 UI」与代码一致，未发现偏差。
- `TESTING.md` 的 V4 人工场景仍待阶段 2+ 落地后才能执行，已在 README「V4 进度」中标注。

---

## 附：复跑方式

```bash
# 类型 / 构建 / 挂载
node ./node_modules/typescript/bin/tsc --noEmit
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" node scripts/build.mjs
node scripts/register-check.mjs

# 逻辑（350 条）
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" npx esbuild scripts/smoke.ts \
  --bundle --platform=node --format=cjs --outfile=$TEMP/smoke.cjs && node $TEMP/smoke.cjs

# 审计探针（只读，打印 11 个缺陷点的当前实测值）
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" npx esbuild scripts/audit-probe.ts \
  --bundle --platform=node --format=cjs --outfile=$TEMP/probe.cjs && node $TEMP/probe.cjs
```
