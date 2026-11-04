# V4 阶段 2 · 第一批次报告（B1 编排层 / B2 冲突治理 / B3 依赖方案）

> 时间：2026-11-02 09:49 – 10:20
> 范围：**只做库层与冲突机制，不开发 V4 UI 页面**
> 门禁：`tsc 0` / `build 0` / `register 13` / `smoke 386`（旧 362 + 新 24）
> 结论：**B1/B2 库层完成，可以进入 B3；UI 开发需再等两件事（见 §7）。**

---

## 1. 新增动作函数与真实调用位置

新增 `src/client/lib/actions.ts`（纯函数，不碰 React / DOM / localStorage）。

| 动作 | 真实调用的现有函数 | 写入的集合 |
| --- | --- | --- |
| `completeTask` | `syncDailyTasks`、`appendEvent`、`needsAutoSnapshot`、`buildHistorySnapshot` | tasks / daily / timeline / snapshot |
| `reopenTask` | `syncDailyTasks`、`appendEvent` | tasks / daily / timeline |
| `deleteTask` | `unlinkFrom`（知识节点）、日志 taskId 清理、meta 绑定清理 | tasks / logs / graph / meta |
| `addFocusLog` | `applyDailyDelta`、`appendEvent` | logs / daily / timeline |
| `addFriction` | `applyDailyDelta`、`appendEvent` | friction / daily / timeline |
| `resolveFriction` | `appendEvent` | friction / timeline |
| `deleteKnowledgeNode` | `removeNode`、`pruneReviews` | graph / reviews |
| `saveMemory` | `applyMemoryPatch`、`appendEvent` | memory / timeline |
| `adoptDraft` | `acceptDraft`、`applyMemoryPatch`、`appendEvent` | memory / timeline / drafts |

`node scripts/audit2/call-sites.mjs` 现在 **全部必需项有调用**（退出码 0）：
`syncDailyTasks`、`applyDailyDelta`、`pruneReviews`、`appendEvent`、`buildHistorySnapshot`、`acceptDraft`、`applyMemoryPatch` 均指向 `lib/actions.ts`。

> **必须说清楚**：这是「编排层」的调用，不是「UI 调用」。现有 V3 组件仍然直接 `setTasks/setLogs`，**尚未改为调用 actions**（本批次明确不开发 UI）。调用点扫描只证明「数据层不再空转」，不证明「界面已接入」。

---

## 2. 每条业务链路的执行过程

**完成 / 重开**：`completeTask` 先做幂等判断（已完成直接返回空结果）→ 改任务 → `syncDailyTasks` 按**绝对值**重算当天完成数 → `appendEvent('task.completed')` → 仅当「无快照或距上次 ≥7 天」才 `buildHistorySnapshot`。
`reopenTask` 反向：清 `completedAt` → 同样的绝对值重算 → `task.reopened`。

**删除任务**：移除任务 → 清日志 `taskId` → `unlinkFrom(graph,{taskId})` → 过滤 `meta.sessionTaskMap`。删除不是里程碑，**不写时间轴**（白名单也没有 `task.deleted`，不为它扩类型）。

**专注**：同 `log.id` 已存在直接返回（双击/重试不双计）→ 前置插入日志 → `applyDailyDelta(focusMinutes)` → `focus.completed`。

**阻碍**：新增 `friction.created` + Daily.friction+1；解决只改状态/方案/耗时并写 `friction.resolved`，**不重复累计次数**。

**知识删除**：`removeNode` 级联删边 → `pruneReviews` 清孤儿记录 → 返回二者。

**记忆**：`saveMemory` 内容不变时 `applyMemoryPatch` 返回原对象，动作层据此返回空结果 → **不产生时间轴噪声**；`adoptDraft` 只应用 `accepted === true` 的条目，成功后才从 drafts 中移除。

---

## 3. 跨标签页冲突处理机制（B2 策略 A）

新增 `lib/conflict.ts` + `ui/ConflictHost.tsx`，改造 `hooks/useLocalStore.ts`。

**判定依据不是时间窗口**，而是显式状态：

- `dirtyRef = true`：`update()` 被调用（用户改了值）；
- `dirtyRef = false`：该值**成功**写入 localStorage 之后；
- 写入失败（配额满）时 **保持 true** —— 此时远端变更必须弹冲突。

`decideRemoteChange({dirty, remoteRaw, baseRaw})`：
| 情况 | 结果 |
| --- | --- |
| 远端与本地基线相同 | `apply`（无需提示） |
| 本地已保存（dirty=false） | `apply`（远端覆盖本页，符合预期） |
| 本地未保存（dirty=true）且内容不同 | `conflict`（不覆盖） |

冲突后：`reportConflict(key, remoteRaw)` 登记（同键合并、保留最新远端值）；`ConflictHost` 在底部显示一条横幅（**多键导入合并成一条**，不会弹 12 次），两个按钮派发 `sorchron:conflict-resolve`：

- **重新载入**：解析远端值 → 替换本地状态 → `dirty=false` → 清除冲突；
- **保留本页**：`writeStore` 重写本页值 → 成功则清冲突；**失败则提示「改动仍未保存」并保留冲突**（不静默）。

导入与冲突的关系：导入在单页内由 `writeTransaction` 一次写 12 键；其他标签页各自收到 storage 事件，若其 dirty 则登记冲突，横幅按条数聚合显示（「另一标签页修改了 N 项数据」）。

**未覆盖**：React 接线（`ConflictHost` 的按钮 → 实例回调）没有自动化测试，因为本地无 React 渲染能力（B3）。

---

## 4. 新增自动化测试及结果

`smoke.ts` 新增 `[28]` 共 **24 条**：

| 类别 | 条数 | 关键断言 |
| --- | --- | --- |
| 完成任务 | 5 | Daily=1；时间轴；首次快照；**重复完成返回空** |
| 重开再完成 | 2 | 回落到 0；再完成仍为 1（不累计） |
| 删除任务 | 3 | 清日志 taskId / 知识 taskIds / 会话绑定 |
| 专注 | 2 | Daily 25 分钟；同 id 重复不双计 |
| 阻碍 | 2 | +1；解决方案与耗时 |
| 知识删除 | 1 | 边与复习同时清空 |
| 记忆 | 4 | 版本 2；空补丁无事件；只采纳勾选；草稿移除 |
| 冲突决策 | 5 | 已保存→应用、未保存→冲突、同内容→应用、同键合并、决议清除 |

结果：**386 通过 / 0 失败**（旧 362 条全部保留，未弱化）。

**未完成**：第三部分要求的 6 个真实 Chrome 冲突场景（A/B 同改、未保存冲突、重新载入、保留本页、导入期间写入、配额不足）**未执行**。原因：冲突 UI 在 React 组件里，当前无组件渲染设施；只测了纯决策函数与冲突登记表。这些场景列为 B3 的第一批用例，**不得视为通过**。

---

## 5. 仍未解决的问题

| # | 问题 | 影响 |
| --- | --- | --- |
| 1 | **UI 尚未调用 actions** | 现有 V3 组件仍直写 setter，日聚合/时间轴/历史在真实操作中仍不会更新 |
| 2 | 冲突 UI 无自动化 | 只能人工验证；6 个 Chrome 场景待 B3 |
| 3 | `deleteTask` 不写时间轴 | 白名单无该类型，属设计选择；如需「删除也留痕」需扩类型 |
| 4 | `adoptDraft` 的草稿存储键仍是 `meta.memoryDrafts` | 动作层返回新 `drafts`，但 UI/持久化接入待下一批 |
| 5 | 导入期间另一标签页的 12 键冲突只做了合并展示，未做「整体放弃导入」 | 属交互策略，待 UI 落地时定 |

---

## 6. 生产构建体积变化

| 版本 | `lib/client.js` |
| --- | --- |
| 本批次前 | 377,086 B |
| 本批次后 | **382,874 B（+5,788 B，+1.5%）** |

新增的 `actions.ts` / `conflict.ts` / `ConflictHost.tsx` 全部被打进产物；**未新增任何运行时依赖**。

---

## 7. 是否具备进入 B3 和 UI 开发的条件

**可以进入 B3；暂不具备直接开发 UI 的条件。**

进入 B3 的前置已满足：动作层与冲突机制都是纯逻辑 + 一个有断言的决策函数，B3 装上组件测试设施后可以立刻补：
1. `ConflictHost` 的按钮交互（重新载入 / 保留本页 / 多键聚合）；
2. 6 个 Chrome 双标签页冲突场景；
3. 空状态 / 点击 / 错误提示三类基础组件用例。

**UI 开发前还必须完成两件事**（建议作为下一批次 B3.5）：

- **把 V3 组件的写操作改为调用 actions**（TaskList 完成/重开/删除、FocusTimer 完成、SessionLog 记录删除、FrictionLog 删除、DataPanel 导入后的快照）。否则 UI 做出来仍然是「热力图全白、时间轴空白」。
- **给 actions 的调用方补一条端到端断言**：模拟一次 `completeTask` → 持久化 → 重新读取 → `daily === rebuildDaily`。

### B3 依赖方案（本批次只给方案，不安装）

```bash
npm i -D react@18.3.1 react-dom@18.3.1 jsdom@^24.1.3 @testing-library/react@^14.3.1
```

| 包 | 版本 | 作用 | 是否进生产包 |
| --- | --- | --- | --- |
| `react` | 18.3.1 | 与宿主 React 18 对齐，组件测试渲染 | ❌ 仅 devDependencies |
| `react-dom` | 18.3.1 | `render` / `fireEvent` | ❌ |
| `jsdom` | ^24 | Node 里的 DOM 环境 | ❌ |
| `@testing-library/react` | ^14.3.1 | 组件查询与事件（v14 对应 React 18；v16 需 React 19） | ❌ |

约束核对：
- `build.mjs` 的 `external` 列表不变（react / react-dom 仍由宿主提供）；
- 生产包不 import 这四个包，体积不受影响；
- `peerDependencies` 的 `react` 仍是 optional，不改插件依赖结构；
- 测试脚本独立（如 `scripts/ui/*.test.tsx`），不进入 `src`。

**待你确认后我才安装依赖并开始 B3。**
