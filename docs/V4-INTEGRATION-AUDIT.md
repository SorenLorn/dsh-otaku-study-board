# V4 第二轮：集成测试与残余漏洞审计

> 对象：`dsh-otaku-study-board` 4.0.0-rc.1（V4 阶段 1）
> 时间：2026-11-02 09:30 – 11:10（GMT+8）
> 方法：**先独立复核上一轮结论 → 再攻击未覆盖场景**；所有结论都有可复跑的命令或探针
> 结论：**新发现 8 个问题（P0×1、P1×3、P2×3、P3×1），修复 6 个、记录 2 个；新增浏览器真实存储测试 15 项、集成链路 51 项；全部门禁通过。**

---

## 1. 第一轮修复复核（不采信报告，逐条实测）

| 项 | 复核方式（独立于上轮断言） | 结果 |
| --- | --- | --- |
| QA-01 备份六实体 | `smoke [24] B2/B3` + `integration [B] B7–B10`（导出→清空→导入→再导出） | ✅ 真修复 |
| QA-02 排期不被 24h 钳制 | `smoke [24] A1/A2`（90 天 / 30 天）+ 探针 A1/A2 | ✅ 真修复 |
| QA-03 禁用存储不谎报 | 真实 Chrome `T6` + `smoke [26] S1/S2` | ✅ 修复，**但引入了 NEW-01 回归**（见 §8） |
| QA-04 跨项目事件去重 | `smoke [24] F2` + `integration [D] D1` | ✅ 真修复 |
| QA-05 非法草稿不崩溃 | `smoke [24] C2`（`done:[123,null]` → 清洗后应用） | ✅ 真修复 |
| QA-06 字典键原型污染 | `smoke [24] C1/C3`（`__proto__` 键被跳过、表为 null 原型） | ✅ 真修复 |
| QA-07 空补丁不涨版本 | `smoke [24] G2` + `integration [B] B4` | ✅ 真修复 |
| QA-08 日聚合重复执行 | `smoke [24] D1`：`rebuildDay` 三次一致；但 `applyDailyDelta` **仍是非幂等** | 🟡 **缓解，不是修复**（见下） |
| QA-09 乱序事件顺序 | `smoke [24] F1`（较旧事件插入后仍在末尾） | ✅ 真修复 |
| QA-10 删节点清复习记录 | `smoke [24] E2` + `integration [C] C8` | 🟡 **缓解**：`pruneReviews` 可用且验证，但删除路径需调用方显式调用 |
| QA-11 `status=review` 入队 | `smoke [24] E1` | ✅ 真修复 |
| QA-13 非法日历日期 | `smoke [24] G1/G1b`（拒 2/31、收闰年 2/29） | ✅ 真修复 |
| QA-16 备份字段恒存在 | `smoke [24] B1` | ✅ 真修复 |

**关于 QA-08 / QA-10 的诚实结论**：

- QA-08：增量接口天生非幂等。我加了幂等入口 `rebuildDay` + `syncDailyTasks`，但**没有**把 `applyDailyDelta` 改成幂等（那会改变语义）。所以「重复执行」的风险仍然存在，取决于调用方是否用了正确入口。阶段 2 接入时必须走 `syncDailyTasks` / `rebuildDay`，并在 TESTING 人工清单里加一条。
- QA-10：`removeNode` 不会自动清复习记录（复习记录在另一个存储键里）。`pruneReviews` 已提供并测试，但**没有任何按钮/流程自动调用**。阶段 7 做知识视图时必须把「删除节点 → pruneReviews」写进同一次操作。

---

## 2. 浏览器存储与并发（真实 Chrome，CDP）

环境：Chrome（本机安装）+ `--headless=new` + DevTools Protocol；测试页同源 `http://127.0.0.1:8765`，通过 harness 调用真实 `repo`（不是 mock）。
复跑：`node scripts/audit2/browser-test.mjs`（先构建 `browser-harness.ts`）。

| 用例 | 场景 | 结果 |
| --- | --- | --- |
| T1 | 正常写入 → 读回 | ✅ 返回 true，内容一致 |
| T2 | **刷新页面**后读取 | ✅ 数据仍在 |
| T3 | 灌满配额（9 × 512KB 后抛 `QuotaExceededError`） | ✅ 已有数据仍可读；写 1MB 返回 false；**原值未被破坏**；清理后写入恢复 |
| T4 | 标签页 A 写 → 标签页 B 读 | ✅ B 读到 A 的值 |
| T4 | 跨标签写入的事件传播 | ✅ A 收到 **1 次 `storage`**、**0 次自定义事件**（没有双触发） |
| T4 | 同页写入的事件 | ✅ 1 次自定义事件、0 次 storage |
| T5 | 两标签页先后写同一键 | ✅ 后写覆盖（见 NEW-08） |
| T6 | 存储被禁用（`localStorage` getter 抛 SecurityError） | ✅ 读降级为空、写入返回 false |

**结论**：正常持久化、刷新、配额、禁用、跨标签读、事件传播都**实测通过**。
**未覆盖**：两标签页同时导入、一边导入一边另一标签页写、删除与写入交错、长时间（>1h）泄漏观察 —— 见 §10。

---

## 3. 备份与恢复破坏性测试

| # | 动作 | 结果 |
| --- | --- | --- |
| 1 | 构造完整 V4 备份（项目/记忆/草稿/知识/复习/时间轴/日聚合/快照） | ✅ 生成成功 |
| 2 | 清空（harness `clearAll`） | ✅ |
| 3 | 导入 | ✅ |
| 4 | 再导出并字段级比对 | ✅ 数量、ID、关键字段一致（未做字节级 diff：`exportedAt` 必然不同） |
| 5 | 每种实体计数与引用 | ✅ 记忆版本、知识节点、日聚合分钟、事件类型、快照 projectId、复习 interval 全部保留 |
| 6 | 连续导入两次 | ✅ 记忆条数不翻倍、版本不倒退（`integration B10`） |
| 7 | 缺字段的旧备份 | ✅ 可导入，缺的走默认（`smoke [12]`） |
| 8 | 损坏 JSON / 错 kind | ✅ 明确拒绝，现有数据不变（`smoke [10]`） |
| 9 | 超量数据（>500 任务、>500 节点、>8MB） | ✅ **拒绝**而不是截断（NEW-04/NEW-07） |
| 10 | 部分非法实体 | ✅ 单条坏数据被丢，其余保留（`coerce*`） |
| 11 | 导入中途写入失败 | ✅ 事务回滚：原值恢复（`smoke N6/N7`、`integration E2–E4`）；持久性故障时如实返回 `restored=false`（E4b） |
| 12 | 失败是否毁掉原数据 | ✅ 回滚后与原值逐字节一致 |

**导入策略的真实语义**（不能只说「合并/覆盖」）：

- `merge`：任务/日志/阻碍/项目/复习/事件 **按 id 合并**（备份覆盖同 id）；记忆 **按 projectId 取版本更高者**；图谱 **节点按 id + 边按语义去重**；日聚合 **同一天以备份为准**；历史 **合并后按项目裁到 12**。
- `overwrite`：上述六类全部替换为备份内容（空字段给空数组），同样裁快照。
- 任何模式下，`settings.activeProjectId` 指向不存在项目时，读取端会退回「全部」。

---

## 4. 五条模块集成链路

| 链路 | 断言数 | 结果 | 关键验证 |
| --- | --- | --- | --- |
| A 任务完成 → 时间轴 → Daily → Heatmap → History | 9 | ✅ | 重开再完成后 Daily 仍为 1（不是 2）；与 `rebuildDaily` 一致 |
| B 记忆草稿 → 采纳 → 版本 → 时间轴 → 备份 → 恢复 | 10 | ✅ | 重复采纳不涨版本、不重复追加；连续导入两次不翻倍 |
| C 知识 → 依赖 → 复习 → 删除 → 清理 | 10 | ✅ | 成环被拒；删节点级联删边；孤儿复习被清理；统计归零 |
| D 两项目同 ID 交替操作 | 9 | ✅ | 同 refId 事件都保留；两份记忆/快照互不覆盖；恢复后同 id 任务各归其项目 |
| E 异常恢复 | 11 | ✅ | 事务回滚、序列化失败零写入、单例、缺失键兜底 |

---

## 5. 随机测试（1000 组，固定种子）

`scripts/audit2/integration.ts`：种子 `20261102 + scenario`，每组随机生成 1–20 天、0–12 任务、0–40 日志、0–8 阻碍、0–12 知识节点。

| 不变量 | 结果 |
| --- | --- |
| 增量聚合 == 完整重建（四字段逐日比对） | ✅ 1000/1000 一致，0 处偏差 |
| 日期合法（真实日历） | ✅ |
| 数量上限（日聚合 ≤ 800） | ✅ |
| 计数非负 | ✅ |
| 备份往返（每 50 组一次，共 20 次） | ✅ 计数与条数一致 |
| 图谱无悬空边 / 无自环 / 再规范化边数不变 | ✅ |

耗时 **184 ms / 1000 组**。这不是「没报错就算过」：每组都做了字段级比对，失败会打印具体 scenario/day/field。

---

## 6. 性能与稳定性（实测，数据规模=运行时可容纳上限）

| 操作 | 规模 | 耗时 |
| --- | --- | --- |
| `rebuildDaily` | 500 任务 + 400 日志 + 200 阻碍 | **1.3 ms** |
| `buildHeatmap` | 800 天 | **1.0 ms** |
| `coerceKnowledge` | 500 节点 / 499 边 | **2.4 ms** |
| 导出 + 序列化 | 全量（记忆/知识/复习/事件/快照/日聚合） | **5.0 ms**，850 KB |
| `parseBackup` | 同上 | **21.5 ms** |
| `applyImport`（merge） | 同上 | **3.7 ms** |
| 1000 组随机场景 | — | **184 ms** |

- 备份 850 KB 在 localStorage 5 MB 预算内；容量预警线 80% 仍有效。
- 观测到的唯一性能隐患仍是 `addEdge` 的 O(E) 复制（1000 节点逐条建边约 100 ms），交互单条 <0.2 ms，列入已知问题。

---

## 7. 人工宿主验收清单（全部「待人工验证」）

> 没有 PC-DSH 运行环境，以下**未执行**，不得视为通过。执行时请在 `TESTING.md` 勾选。

| # | 步骤 | 预期 | 状态 |
| --- | --- | --- | --- |
| H1 | 安装插件 → 重启 DSH → 左导航出现「溯时学习工作台」 | 出现且可点击 | 待人工验证 |
| H2 | 首次打开（无任何数据） | 五个卡片空状态正常，无红色报错 | 待人工验证 |
| H3 | 新建任务 → 刷新 | 任务仍在，勾选状态保留 | 待人工验证 |
| H4 | 切换项目 → 各卡片只显示该项目数据 | 无串数据 | 待人工验证 |
| H5 | 完成一轮番茄钟 | 任务时长 +、日志 +1、统计/热力图更新 | 待人工验证 |
| H6 | 导出备份 → 清空 → 导入 | 数量与内容一致 | 待人工验证 |
| H7 | 导入损坏文件 | 友好提示，数据不变 | 待人工验证 |
| H8 | 隐私模式打开 | 写入提示「不会保存」，页面不崩 | 待人工验证 |
| H9 | 卸载插件 → 重装 | 数据仍在，页面正常 | 待人工验证 |
| H10 | V3 老数据升级 | 任务/日志/计时无损 | 待人工验证 |
| H11 | 两标签页同开，一边改任务另一边观察 | 另一边更新（或提示重新载入，见 NEW-08） | 待人工验证 |
| H12 | 关掉监听开关 | 日志不再增长，状态显示「已停止监听」 | 待人工验证 |

---

## 8. 新发现 Bug

| ID | 级别 | 模块 | 文件 | 复现 | 预期 | 实际 | 根因 | 修复 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NEW-01 | **P0** | 存储 | `lib/repo/local.ts` | 配额灌满后 `readMemory()`（探针 L1 / 浏览器 T3） | 仍读到已有数据 | 读到 **0 条**，看板像被清空 | 用 `setItem` 写探针判断存储可用性；配额满 → 误判 `blocked` → 读退回空内存 | 改**只读探测**（`length` + `getItem`）+ 缓存模式；配额错误不降级读路径 |
| NEW-02 | P1 | 备份 | `lib/backup.ts` | 导出含 `meta.memoryDrafts` 的备份再导入 | 草稿/`upgradedFrom` 保留 | 全部丢失 | `parseBackup` 手搓 `{sessionTaskMap}`，没用 `coerceMeta` | 改用 `coerceMeta(record.meta)` |
| NEW-03 | P2 | 备份 | `lib/backup.ts` | 导入 20 个同项目快照 | ≤12（架构约束） | 20 全留 | `applyImport` 没调用 `pruneSnapshots` | 两条分支都裁剪 |
| NEW-04 | P2 | 备份 | `lib/backup.ts` | 导入 5000 任务 / >8MB 文件 | 拒绝并说明 | 全接受 | V3 遗留：任务/日志条数与文件体积无上限 | 按运行时上限**拒绝**（不截断）+ 8MB 体积上限 |
| NEW-05 | **P1** | 导入 | `board/DataPanel.tsx`、`lib/tx.ts` | 第 N 个键写入失败 | 原数据可恢复 | 半新半旧，且原值已被覆盖 | 12 个键逐个 setter 写，无事务 | 新增 `writeTransaction`：先全序列化 → 逐写 → 失败逆序回滚；`restored:false` 时明确告知 |
| NEW-06 | **P1** | 日聚合 | `lib/daily.ts` | 任务「完成→重开→完成」 | 当天完成数 1 | 若按事件 +1 会变 2，与 `rebuildDaily` 不一致 | 只有增量接口，没有绝对值入口 | 新增 `setDailyValue` / `syncDailyTasks`，任务数必须按状态写绝对值 |
| NEW-07 | P2 | 备份 | `lib/backup.ts` | 导入 1000 知识节点 | 拒绝 | **静默截断到 500** | `coerceKnowledge` 截断 + slice | 超量直接拒绝（与任务/日志策略一致） |
| NEW-08 | P1（记录） | 并发 | localStorage 语义 | 两标签页先后写同一键（浏览器 T5） | 合并或提示 | 后写覆盖，先写丢失 | localStorage 没有 CAS/事务；`useLocalStore` 收到 storage 事件直接替换 | **未修**：需要合并策略或冲突提示（阶段 2 做 UI 时一起处理）；当前建议单标签页编辑 |

### 明确不算 Bug 的

- `daily` 没有 `projectId`（全局聚合）：热力图定位是「个人年度学习轨迹」，按项目切会把一年切成碎片。属设计选择，已在架构文档说明。
- 两标签页写**不同**键：互不影响（T4 验证）。
- 等长覆盖在配额满时仍成功：浏览器先释放旧值，属正常行为（探针 L2 最初的期望写错了）。

---

## 9. 修复记录与回归测试

| Bug | 改动 | 回归断言 |
| --- | --- | --- |
| NEW-01 | `repo/local.ts` 三态改只读探测 + 缓存 + `resetStorageModeCache`；写失败按错误类型决定是否降级 | `smoke N1/N2`、`smoke S1/S2`、浏览器 T3 |
| NEW-02 | `backup.ts` 用 `coerceMeta` | `smoke N3`、`integration B7–B9` |
| NEW-03 | `backup.ts` 两分支 `pruneSnapshots` | `smoke N4` |
| NEW-04 | `parseBackup` 增加体积 8MB + 任务 500 / 日志 400 / 阻碍 200 / 项目 96 上限 | `smoke N5` |
| NEW-05 | 新增 `lib/tx.ts`；`DataPanel.commitImport` 改为事务写 12 键 | `smoke N6/N7/N8`、`integration E2–E4b` |
| NEW-06 | `daily.ts` 新增 `setDailyValue` / `syncDailyTasks` | `smoke N9/N10/N11`、`integration A6/A7/A8` |
| NEW-07 | `parseBackup` 检查 v4 实体与图谱条数 | `smoke N12` |

没有删除任何旧断言；第一轮的 350 条全部保留。

---

## 10. 最终门禁（实测）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `tsc --noEmit` | **0 错误** |
| 构建 | `node scripts/build.mjs` | exit 0，`lib/client.js` 377,086 B |
| 挂载 | `register-check.mjs` | **13 / 13** |
| 逻辑（永久门禁） | `smoke.ts` | **362 / 362** |
| 集成 + 随机 | `scripts/audit2/integration.ts` | **51 / 51**（含 1000 组随机） |
| 浏览器 | `scripts/audit2/browser-test.mjs` | **15 / 15**（真实 Chrome） |

**合计 441 项断言**（13 + 362 + 51 + 15），全部通过。

---

## 11. 尚未解决的风险（不得视为通过）

| # | 风险 | 级别 | 现状 | 建议 |
| --- | --- | --- | --- | --- |
| U-01 | 组件渲染 / 交互无自动化 | P1 | 无 react/react-dom；register-check 用 stub | PC-DSH 人工按 §7 执行 |
| U-02 | 并发写同一键丢更新（NEW-08） | P1 | 已实测复现，未修 | 阶段 2：storage 事件 + 本地脏标记 → 提示「另一标签页已修改，重新载入」；或字段级合并 |
| U-03 | 导入与另一标签页写入交错 | P1 | 未测 | 事务只能保证单页原子性；跨页需要「导入锁 + 版本号」 |
| U-04 | `daily` 写入点尚未接入业务 | P1 | 只有纯函数与链路模拟 | 阶段 2 接 `syncDailyTasks`/`applyDailyDelta` 后跑 §4-A 链路 |
| U-05 | AI 服务全部能力 | — | 未实现 | 阶段 3 按密钥/SSRF/降级门禁验收 |
| U-06 | 删除节点→复习记录需手动调用 | P2 | 已提供 `pruneReviews`，无自动钩子 | 阶段 7 写进同一操作 |
| U-07 | DST 时区排期偏移 | P3 | 中国无 DST | 海外用户改「本地日历日 + N 天」 |
| U-08 | `addEdge` O(E) | P3 | 100 ms/900 边（批量） | 需要批量导入时再改可变结构 |
| U-09 | 长时间（>1h）内存/监听泄漏 | P2 | 未测 | 用 Chrome Performance 录制 1h 会话 |

---

## 附：复跑全部证据

```bash
# 1) 类型 / 构建 / 挂载
node ./node_modules/typescript/bin/tsc --noEmit
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" node scripts/build.mjs
node scripts/register-check.mjs

# 2) 逻辑门禁（362）
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" npx esbuild scripts/smoke.ts \
  --bundle --platform=node --format=cjs --outfile=$TEMP/smoke.cjs && node $TEMP/smoke.cjs

# 3) 集成 + 1000 组随机（51）
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" npx esbuild scripts/audit2/integration.ts \
  --bundle --platform=node --format=cjs --outfile=$TEMP/int.cjs && node $TEMP/int.cjs

# 4) 真实 Chrome（15）——先构建 harness
ESBUILD_BINARY_PATH="$(cygpath -w "$TEMP/esb.exe")" npx esbuild scripts/audit2/browser-harness.ts \
  --bundle --platform=browser --format=iife --outfile=$TEMP/sorchron-audit/harness.js
node scripts/audit2/browser-test.mjs

# 5) 只读探针（打印缺陷点当前值）
npx esbuild scripts/audit2/probe2.ts --bundle --platform=node --format=cjs --outfile=$TEMP/p2.cjs && node $TEMP/p2.cjs
```
