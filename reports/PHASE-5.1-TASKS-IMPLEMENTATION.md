# Phase 5.1 · V4 Tasks 页面与业务 Action 接入报告

> 日期：2026-11-03 ｜ 版本 4.0.0-rc.1
> 范围：Tasks 页面 + create/update action + 删除任务 Daily 一致性修复；未触碰 Memory/Knowledge/History/Settings。

---

## 1. 专项审计结果

| 问题 | 现状 | 结论 |
| --- | --- | --- |
| 任务创建 | V3 `TaskList` 直接 `board.setTasks([...])`，不走 action | **无任务事件、无统一校验** |
| 任务编辑 | V3 `TaskList` 直接 `setTasks(map)` | 同上 |
| 完成/重开 | `TaskList` → `useBoardActions.completeTask/reopenTask` | 已接 actions，Daily/Timeline 正确 |
| 删除 | `TaskList` → `useBoardActions.removeTask` | 清理 logs/graph/meta，但**不回退 Daily** |
| 项目归属 | Task 有 `projectId`；`TaskList` 表单可选项目；创建/编辑**未做 action 层校验** | 需要 action 校验 |
| done/status/completedAt | 完成/重开 action 同时维护三者 | 一致 |
| Dashboard 读取 | `useBoardData().tasks` + `computeBoardStats` + `countStreak` | 真实数据，无 mock |

### 发现的 Daily 一致性 Bug

**复现**：创建任务 → 完成（Daily.tasksDone +1）→ 删除该已完成任务。
**原行为**：任务消失，但 `daily` 里的 `tasksDone` 仍然保留 1 → Dashboard「今日打卡」虚高。
**根因**：`deleteTask` 只删任务、清关联，没有重算当天聚合。
**修复**：`deleteTask` 新增 `daily` / `timeline` 输入；删除后若有 `completedAt`，调用 `syncDailyTasks` 重算当天（绝对值，非增量）。**没有修改 Daily 算法**。

---

## 2. Action 设计与实现

### createTask

```ts
createTask({ tasks, timeline, id, title, note?, priority?, dueAt?, projectId?, projects?, at? })
```

- 标题 trim 后为空 → 返回 `{}`；
- 重复 id → `{}`；
- `dueAt` 非有限数 → `{}`；
- 提供 `projects` 时，项目必须存在且未归档；
- 写入 `task.created` 时间轴；
- 返回 `{ tasks, timeline }`；
- **不生成 id**：由 `useBoardActions` 用 `createId('task')` 传入，便于幂等与测试。

### updateTask

```ts
updateTask({ tasks, taskId, patch, projects?, at? })
```

- 只允许改 `title/note/priority/dueAt/projectId`，**不能改 done/status/completedAt**；
- 空补丁或值未变化 → `{}`（不更新时间戳、不写事件）；
- 标题为空、项目无效、`dueAt` 非法 → `{}`；
- `dueAt: null` / `projectId: ''` 表示清除；
- 普通编辑**不写时间轴**，避免噪声。

### 其它调整

- `deleteTask` 增加 `task.deleted` 事件，并回退 Daily；
- 新事件类型 `task.deleted` 加入 `BoardEventType` 与 `EVENT_META`（无字段/schema 变更）。

---

## 3. V4 Tasks 页面

新增 `src/client/v4/Tasks.tsx`，挂在 V4 视图的二级导航（Dashboard / 任务）。

功能：

- 列表、新建、编辑、删除（行内二次确认）、完成/重开；
- 优先级（普通/重要/紧急）、截止日期、项目归属、备注；
- 子任务只读展示（完成数/总数），**没有新增子任务编辑逻辑**；
- 筛选：全部 / 未完成 / 已完成 / 逾期；项目筛选；关键词搜索；
- 排序：优先级 / 截止日期 / 创建时间；
- 空列表、搜索无结果都有 Empty State；
- 所有写操作走 `useBoardActions`，页面不直接碰 `localStorage`；
- 使用 V4 `Button`、`Card`、`StateView`；表单/确认均为内联，不引入新 Modal。

导航：`index.tsx` 增加 `v4Page: 'dashboard' | 'tasks'`；Dashboard 的「任务」快捷入口在 V4 下直接切到 Tasks，不再跳回经典。

---

## 4. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/client/lib/actions.ts` | 新增 `createTask` / `updateTask`；`deleteTask` 增加 Daily 回退、`task.deleted` 事件 |
| `src/client/types/v4.ts` | `BoardEventType` 增加 `task.deleted` |
| `src/client/lib/timeline.ts` | `EVENT_META` 增加 `task.deleted` |
| `src/client/hooks/useBoardActions.ts` | 暴露 `createTask/updateTask`；删除任务传 daily/timeline |
| `src/client/v4/Tasks.tsx` | 新增页面 |
| `src/client/index.tsx` | V4 二级导航、Tasks 接入、Dashboard 快捷入口跳转 |
| `src/client/style/board.css` | `.v4-tasks` / 表单 / 列表 / 筛选 / 720 规则 |
| `scripts/smoke.ts` | T1–T12 |
| `scripts/ui/components.test.tsx` | C37–C43 |
| `scripts/ui/tasks-harness.tsx` / `tasks-browser.test.mjs` | 新增 Tasks 浏览器测试 |

未改：V3 组件、V3 `.osb-*` 既有规则、Memory/Knowledge/History/Settings、依赖、schema 键。

---

## 5. 数据一致性测试

| 用例 | 结果 |
| --- | --- |
| 创建写标题/优先级/项目 + `task.created` | ✅ |
| 空标题 / 无效项目 / 重复 id 被拒 | ✅ |
| 编辑更新字段与 `updatedAt`，不动 done/status | ✅ |
| 空补丁不产生变更 | ✅ |
| 完成 → Daily=1 | ✅ |
| **删除已完成任务 → Daily 回退 0** | ✅ |
| 删除写 `task.deleted` | ✅ |
| 重复删除幂等 | ✅ |
| 筛选不修改原始 localStorage 数据 | ✅ |

---

## 6. V3 回归

- 未修改 V3 TaskList 的 DOM/样式与交互；
- V3 创建/编辑仍然直接 `setTasks`（按约束不改 V3），因此**只有 V4 创建的任务有 `task.created` 事件**；
- V3 删除现在也会走同一个 `deleteTask`，因此同样获得 Daily 回退与 `task.deleted` 事件（行为增强，不是视觉变化）；
- smoke 415 / 组件 43 全绿，均包含原 V3 用例。

---

## 7. 自动化结果

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| smoke | **415 / 415** |
| React 组件 | **43 / 43** |
| register-check | **13 / 13** |
| production build | exit 0，**458,336 B**（4B.3 时 434,161 → +24,175 B，主要是 Tasks 页面与样式） |
| Tasks 浏览器测试 | **15 / 15**（1440/1100/720） |
| 既有 Dashboard 布局测试 | 21 / 21（本轮未改 Dashboard） |

Tasks 浏览器测试（真实 Chromium，独立测试页，不是 DSH）：

| 宽度 | client / scroll | 溢出 | 表单列数 |
| --- | --- | --- | --- |
| 1440 | 1425 / 1425 | 否 | 3 |
| 1100 | 1085 / 1085 | 否 | 3 |
| 720 | 705 / 705 | 否 | 1 |

表单、输入框、列表行均未超出视口；无越界元素。

---

## 8. 真实 DSH 宿主测试状态

**未执行。** 本轮没有安装/重启 DSH，也没有宿主截图；上述 15 项是 Chromium 测试页结果，不能写成宿主通过。

待宿主确认：

1. V3 仍默认、经典五卡正常；
2. V4 Dashboard 正常，二级导航可切到 Tasks；
3. Tasks 创建/编辑/完成/重开/删除；
4. 删除已完成任务后 Dashboard「今日打卡」回退；
5. 深浅色下表单、按钮、列表可读；
6. 刷新后任务仍在。

---

## 9. 未解决 / 风险

| # | 项 | 说明 |
| --- | --- | --- |
| 1 | V3 创建/编辑仍绕过 actions | 只有 V4 有 `task.created`；若以后要统一，需改 V3（本阶段禁止） |
| 2 | `task.deleted` 是新事件类型 | 旧版本插件回退时 `EVENT_META` 不认识它，可能显示异常；无数据迁移 |
| 3 | 创建/编辑 action 失败时静默返回 `{}` | UI 已预校验，但归档项目等边界可能表现为「点了没反应」 |
| 4 | 子任务只读 | 没有新增/编辑子任务，避免复制 V3 业务 |
| 5 | 搜索无防抖 | 任务量上限 500，当前可接受 |
| 6 | V4 视图/页面不持久 | 刷新回 Dashboard/Classic |
| 7 | V4 repo 仍无跨标签冲突提示 | 与 5.0 报告一致，未在本阶段处理 |
| 8 | 真实 DSH、深色 Tasks 未验证 | 无宿主截图 |

---

## 10. 下一阶段建议

按 5.0 顺序，下一步是 **Focus**：`useTimer` + `addFocusLog` 已 READY，页面可以直接复用，不需要再补任务相关 action。进入前建议先在 DSH 里验收本阶段的 Tasks（尤其删除已完成任务后的 Dashboard 数字），再开始 Focus。
