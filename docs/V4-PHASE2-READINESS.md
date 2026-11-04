# V4 阶段 2 前置门禁报告（Readiness Gate）

> 核查时间：2026-11-02 09:44（GMT+8）
> 核查对象：`dsh-otaku-study-board` 4.0.0-rc.1（阶段 1 数据层）
> 核查方式：**调用点扫描**（`node scripts/audit2/call-sites.mjs`，退出码 1）+ 代码走查 + 已有 441 项测试结果
> **最终结论：需要修复后进入。** 数据层可用，但业务编排层尚未存在，7 个必需函数没有任何业务调用。

---

## 1. 八项核查结果（先看结论表）

| # | 检查项 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | `syncDailyTasks` 有真实业务调用 | **仅有测试模拟** | `call-sites`：`src` 内 0 调用，只有 `lib/daily.ts` 定义；`smoke N9–N11`、`integration A6` 是测试调用 |
| 2 | `rebuildDay` 用于幂等恢复 | **仅有测试模拟** | 0 业务调用。设计上它是「重试路径」入口，但当前没有重试路径 |
| 3 | `pruneReviews` 接入节点删除 | **仅有测试模拟** | 0 业务调用；`removeNode` 不跨存储清理，删除流程不存在 |
| 4 | 跨标签页冲突处理 | **存在缺陷** | 无任何冲突检测；真实 Chrome `T5` 实测「后写覆盖」，`useLocalStore` 收到 `storage` 事件直接替换 |
| 5 | 导入事务覆盖所有写入键 | **已实现且有实际调用** | `DataPanel` 用 `writeTransaction` 写 12 个键（tasks/logs/projects/friction/meta/settings/memory/knowledge/reviews/timeline/history/daily）。`timer`（瞬态）与 `aiRuns`（审计）按设计不参与导入 |
| 6 | 配额满仍能读原有数据 | **已实现且有实际调用** | `repo` 只读探测 + 缓存；Chrome `T3`：灌满后仍读到原值、大写入返回 false、原值未破坏；`smoke N1/N2`。V3 的 `useLocalStore` 读路径不写探针，不受影响 |
| 7 | `meta.memoryDrafts` / `upgradedFrom` 备份往返 | **已实现但没有接入业务** | `smoke N3` 通过（数据层 + 备份层都通）；但没有任何 UI/流程会**产生**草稿，所以往返「无真实数据可测」 |
| 8 | `applyImport` 限制快照/任务/日志/节点/文件大小 | **已实现且有实际调用** | `DataPanel` 导入必走 `parseBackup`；`smoke N4/N5/N12`：快照按项目 12、任务 500、日志 400、节点 500、文件 8MB，超量**拒绝**（不截断） |

### 调用点扫描原始输出（节选）

```
[必需] syncDailyTasks       缺失      仅有定义：src/client/lib/daily.ts
[必需] applyDailyDelta      缺失      仅有定义：src/client/lib/daily.ts
[必需] pruneReviews         缺失      仅有定义：src/client/lib/review.ts
[必需] appendEvent          缺失      仅有定义：src/client/lib/timeline.ts
[必需] buildHistorySnapshot 缺失      仅有定义：src/client/lib/history.ts
[必需] acceptDraft          缺失      仅有定义：src/client/lib/memory.ts
[必需] applyMemoryPatch     缺失      仅有定义：src/client/lib/memory.ts
[必需] writeTransaction     有调用    src/client/board/DataPanel.tsx ×1
结论：7 个必需项没有业务调用（退出码 1）
```

复跑：`node scripts/audit2/call-sites.mjs`。

---

## 2. 真实业务调用链路（现状图）

```
用户操作（V3 卡片）
   │
   ├── TaskList.toggleTask ──► board.setTasks ──► useLocalStore ──► localStorage
   │        ✗ 没有 appendEvent
   │        ✗ 没有 syncDailyTasks
   │        ✗ 没有 history 快照
   │
   ├── FocusTimer.handleComplete ──► setTasks + setLogs ──► localStorage
   │        ✗ 没有 applyDailyDelta（热力图将永远是 0）
   │        ✗ 没有 appendEvent
   │
   ├── SessionLog 采集 ──► mergeLogDraft ──► setLogs
   │        ✗ 没有 applyDailyDelta(sessions/friction)
   │
   └── DataPanel 导入 ──► parseBackup → applyImport → writeTransaction ──► 12 键 ✅

V4 数据层（memory / knowledge / reviews / timeline / history / daily）
   └── 只有备份导出/导入在读写；没有任何业务动作写入
```

**结论：V4 的数据表是「空转」的。** 一旦接上 UI 而不补编排层，用户会看到：热力图全白、时间轴空白、历史快照永远 0 个、记忆/知识页无数据 —— 这不是 bug，是**根本没接线**。

---

## 3. UI 已实现功能（诚实清单）

| 功能 | 状态 |
| --- | --- |
| V3 五个卡片（概览/任务/计时/日志/统计） | ✅ 已有（与本阶段无关） |
| 项目切换条、上下文面板、阻碍面板 | ✅ 已有（V3 交付） |
| 备份面板支持 V4 六实体导出/导入/事务 | ✅ 已有（阶段 1 接入） |
| 项目记忆视图（编辑/草稿确认/版本/提示词） | ❌ 未实现 |
| 知识地图 / 检索 / 关系 | ❌ 未实现 |
| 间隔复习队列 | ❌ 未实现 |
| 开发时间机器 / 历史对比 | ❌ 未实现 |
| 学习热力图卡片 | ❌ 未实现 |
| AI 教练 / 记忆整理 | ❌ 未实现（阶段 3） |

---

## 4. 进入阶段 2 的阻塞项

### B1（阻断）业务编排层缺失 —— 7 个必需调用为零

需要一个**单一动作层**，让 UI 只调用语义动作，不直接拼存储：

```ts
// 建议：src/client/lib/actions.ts（纯函数，输入旧状态输出新状态 + 事件 + 聚合）
completeTask(input): { tasks, timeline, daily }
reopenTask(input):  { tasks, timeline, daily }   // 用 syncDailyTasks 绝对值
deleteTask(input):  { tasks, knowledge, meta, timeline }
addFocusLog(input): { logs, daily, timeline }
addFriction(input): { friction, daily, timeline }
resolveFriction(input): { friction, timeline }
deleteKnowledgeNode(input): { graph, reviews }   // 必须调 pruneReviews
saveMemory(input): { memory, timeline }
adoptDraft(input): { memory, meta, timeline }
```

验收标准（必须有断言）：
- 完成任务 → `daily.tasksDone` 与 `rebuildDaily` 一致；
- 重开再完成 → 仍为 1；
- 删除任务 → 知识节点 `taskIds` 被 `unlinkFrom` 清掉、`meta.sessionTaskMap` 清掉；
- 删除知识节点 → 边删除 + `pruneReviews` + 统计归零；
- 每个动作最多写 1–3 个键（避免「一次点击写 6 个键」）。

### B2（阻断）跨标签页冲突策略缺失

现状：`storage` 事件到达即覆盖，已实测丢更新。建议策略（二选一，需你确认）：

- **策略 A（推荐，改动小）**：`useLocalStore` 记录「本页最近 2 秒内写过该 key」；若窗口内收到远端变更 → 不直接覆盖，弹出「另一标签页修改了数据」并提供「重新载入 / 保留本页」两个按钮。
- **策略 B**：字段级合并（任务按 id 合并、取 `updatedAt` 较新者）。更复杂，容易引入隐蔽 bug。

无论哪种，都必须有自动化：两个 Chrome 标签页、交替写、断言最终状态与提示出现。

### B3（阻断）组件测试设施不存在

- `node_modules` 里没有 `react` / `react-dom` / `jsdom`；
- `register-check` 用 stub，**不渲染**；
- 因此「首次打开、空状态、按钮点击、错误提示」目前**无法自动化**。

两条路：

| 方案 | 代价 | 评价 |
| --- | --- | --- |
| 加 devDeps：`react` `react-dom` `jsdom` `@testing-library/react` | 4 个开发依赖（不进包） | 最标准；可在 Node 里跑真实渲染与点击 |
| 复用已有 Chrome CDP 方案，打包一个含 React 的测试页 | 需要可离线加载的 React UMD | 更接近真实浏览器，但要额外准备 React 产物 |

建议方案一（只在 devDependencies，不影响 `lib/client.js` 体积）。**需要你批准新增开发依赖。**

### B4（非阻断）文档与人工门禁

`TESTING.md` 需补 V4 UI 场景（记忆草稿→采纳→版本、时间轴筛选、热力图下钻、知识成环提示、复习排期、双标签页冲突），并保留「待人工验证」标记。

---

## 5. 新增测试与本轮结果

- 新增 `scripts/audit2/call-sites.mjs`（11 项检查，退出码 1 表示必需项缺失）—— 本轮唯一新增「测试」，且它证明的是**未接通**，不是通过。
- 未修改任何业务代码（遵守「先检查，不要直接修改」）。
- 已有 441 项仍全绿：`tsc 0` / `build 0` / `register 13` / `smoke 362` / `integration 51` / `browser 15`。

---

## 6. PC-DSH 人工验收清单（阶段 2 完成后执行）

| # | 步骤 | 预期 | 当前 |
| --- | --- | --- | --- |
| P1 | 安装 → 打开看板 | 五卡正常，无红色报错 | 待人工验证 |
| P2 | 新建 → 编辑 → 完成 → 重开 | 每步刷新后仍在；今日完成数不重复累计 | 待人工验证（依赖 B1） |
| P3 | 切项目 | 各卡片只显示当前项目数据 | 待人工验证 |
| P4 | 完成一轮番茄钟 | 热力图当天变深、时间轴出现节点 | 待人工验证（依赖 B1） |
| P5 | 记忆：生成草稿 → 逐条采纳 | 版本 +1、时间轴出现「记忆更新」、未采纳内容不落库 | 待人工验证（依赖 B1/UI） |
| P6 | 删除知识节点 | 关系边消失、复习队列/统计同步减少 | 待人工验证（依赖 B1/UI） |
| P7 | 导入损坏/超量备份 | 明确提示，原数据不变 | 待人工验证 |
| P8 | 隐私模式 | 写入提示不保存，页面不崩 | 待人工验证 |
| P9 | 两标签页同时改同一任务 | 出现冲突提示，不静默覆盖 | 待人工验证（依赖 B2） |
| P10 | 卸载重装 | 数据仍在 | 待人工验证 |

---

## 7. 结论

**需要修复后进入阶段 2。**

- 数据层（阶段 1）质量可信：441 项、两轮独立审计、真实 Chrome 存储验证。
- 但 **7/9 个必需函数没有任何业务调用**，V4 的日聚合、时间轴、历史快照、记忆、知识、复习目前**全靠备份导入才有一点点数据**；直接写 UI 会做出「看起来有功能、数据永远为空」的页面。
- 三个阻断项：**B1 编排层 → B2 冲突策略 → B3 组件测试设施**。B1/B2 是纯逻辑，可在 1 个批次内完成并补断言；B3 需要新增 4 个开发依赖（需你批准）。

### 建议的下一批次（按顺序）

1. B1 动作层 + 12 条链路断言（不碰 UI）；
2. B2 冲突策略（选 A）+ Chrome 双标签页测试；
3. B3 组件测试设施（装 devDeps）+ 空状态/点击/错误提示 3 个基础用例；
4. 通过后再做记忆视图 → 知识视图 → 时间轴 → 热力图。

**在你确认 B2 策略与 B3 依赖之前，我不会动 UI 代码。**
