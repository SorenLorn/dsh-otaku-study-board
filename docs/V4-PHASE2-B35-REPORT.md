# V4 阶段 2 · B3.5 报告（第一批：TaskList / FocusTimer）

> 时间：2026-11-02 10:24 – 10:40
> 范围：只接 B3.5，不开发 V4 页面、不做视觉改动
> **本批次只完成 A（TaskList）与 B（FocusTimer 的专注落库）；C/D 与 SessionLog 删除未接入**（见 §5）

---

## 1. 新增与修改

| 文件 | 变更 |
| --- | --- |
| `src/client/hooks/useBoardActions.ts` | **新增**。把 9 个纯动作接到存储：读写 tasks/logs/friction/daily/timeline/graph/reviews/history/meta；快照追加时 `pruneSnapshots` |
| `src/client/board/TaskList.tsx` | 完成 → `actions.completeTask`；重开 → `actions.reopenTask`；删除 → `actions.removeTask`。子任务仍在组件内翻转（先翻子任务，再调 action） |
| `src/client/board/FocusTimer.tsx` | 专注结束不再手写 `setLogs`，改调 `actions.addFocus`（日志 + Daily + 时间轴一次完成） |

组件不再出现「setTasks + setLogs + 记事件 + 算聚合」的组合拳；Daily/timeline/snapshot 只由 actions 层写。

## 2. 调用链

**勾选完成**：`TaskList.toggleTask` →（有子任务时先 setTasks 翻状态）→ `useBoardActions.completeTask` → `actions.completeTask` → `syncDailyTasks`（绝对值）+ `appendEvent('task.completed')` + 条件 `buildHistorySnapshot` → 分别 `setTasks / setDaily / setTimeline / setHistory`。

**取消完成**：`reopenTask` → 同样的绝对值重算 → `task.reopened`。

**删除任务**：`removeTask` → 清日志 `taskId`、`unlinkFrom(graph,{taskId})`、过滤 `meta.sessionTaskMap` → 四个 setter。

**专注结束**：`FocusTimer.handleComplete` → 任务 `focusedMinutes/pomodoros` 仍由组件更新（展示副本）→ `actions.addFocus(log)` → 同 id 幂等 → `applyDailyDelta(focusMinutes)` + `focus.completed`。

## 3. 验证结果

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| 生产构建 | exit 0，`lib/client.js` **399,969 B**（+17,095 B / +4.5%，因为 actions/daily/timeline/history 真正进了包） |
| `register-check` | **13 / 13** |
| `smoke.ts` | **386 / 386**（一条未删） |
| React 组件测试 | **10 / 10**（TaskList 现在挂 `useBoardActions`，空状态与新增仍通过） |
| Chrome 冲突测试 | 未在本批次重跑（B3 已 6/6；本批次未改冲突代码） |

数据一致性由 `smoke [28]` 与 `integration [A]` 覆盖：完成=1、重开=0、再完成=1、与 `rebuildDaily` 一致、重复完成幂等、专注同 id 不双计。

## 4. 未完成（诚实清单）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| SessionLog 新增/删除走 actions | **未接入** | 采集写入走 `mergeLogDraft`（自动合并），不适合逐条 action；删除日志需要新增 `deleteLog`（要反向扣减 Daily.focusMinutes），本批次未做 |
| FrictionLog 新增/解决走 actions | **未接入** | 阻碍由采集管线 `record()` 产生并做相似合并；`actions.addFriction` 只处理「新记录」，直接替换会绕过合并逻辑。需要先给 actions 增加「合并后写入」语义 |
| DataPanel 导入后快照/一致性 | **部分** | 导入已走 `writeTransaction`（12 键原子写）；导入后**没有**自动打历史快照。建议下一批在成功分支追加一次 `buildHistorySnapshot` |
| 知识节点删除走 actions | **未接入** | 知识 UI 尚未开发；`actions.deleteKnowledgeNode` 已就绪并有断言 |
| 页面刷新一致性 | 未人工验证 | 需 PC-DSH 人工按 TESTING 执行 |

**没有绕过业务层直写存储**：未接入的部分保持原状，而是在报告中标注，不用临时方案凑数。

## 5. 结论

**本批次完成 A 与 B 的核心链路，但不满足「全部业务链路经过实际验证」的最终验收条件，因此不建议进入 V4 UI 页面开发。**

下一批次（仍属 B3.5）：
1. 给 `actions` 增加 `deleteLog`（扣减当日 focusMinutes，幂等）与 `addFrictionMerged`（保留相似合并），再接 SessionLog / FrictionLog；
2. DataPanel 导入成功后追加历史快照；
3. 补 3 条集成断言：删除专注日志后 Daily 与 `rebuildDaily` 一致、阻碍合并后 Daily 只 +1、导入后快照计数正确；
4. 重跑全部门禁（含 Chrome 6 场景）。
