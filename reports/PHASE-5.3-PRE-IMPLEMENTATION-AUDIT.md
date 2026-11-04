# Phase 5.3 · 前置审计：数据管理与备份恢复

- 日期：2026-11-03
- 范围：`board/DataPanel.tsx`、`hooks/useBackup.ts`、`lib/backup.ts`、`hooks/useStorageQuota.ts`、
  `lib/repo/*`、`lib/timeline.ts`、`lib/snapshot.ts`、`hooks/useLocalStore.ts`（含 5.2 的立即写盘修复）
- 方法：逐文件阅读 + 核对调用点 + 跑现有测试；所有结论标注「代码确认」或「未验证」。
- 结论：**备份/导入的主干完整且可用**（12 个键、事务回滚、按 id 合并、覆盖、上限拒绝），
  但存在 4 个必须在本阶段处理的缺口，以及 2 个必须如实标注的能力边界。

---

## 1. 现有能力清单（逐项给出证据）

| 能力 | 结论 | 证据 / 位置 | 备注 |
| --- | --- | --- | --- |
| 全量导出 | 有 | `DataPanel.handleExport` → `filterByScope(scope='all')` → `buildBackup` → `serializeBackup` | 含 tasks / logs / projects / settings / friction / meta + memory / knowledge / reviews / timeline / history / daily |
| 时间窗导出 | 有 | `filterByScope`：`week` / `month`，按 `createdAt/completedAt/updatedAt`、`log.at`、`friction.at`、`daily.day` 过滤 | 记忆与知识整体带出（活文档不切半份） |
| 真正的「增量恢复」 | **没有** | 无基线 / 序号 / 变更集；导入永远走合并或覆盖 | 不能把它包装成增量备份协议 |
| JSON 格式 | 有 | `kind: 'sorchron-study-board-backup'`、`version: 4`、12 个数据字段 | 刻意人类可读（2 空格缩进） |
| 导入校验 | 有 | `parseBackup`：JSON 合法性 → kind → tasks/logs 必须为数组 → 体积 8 MB → 条数上限（任务 500 / 日志 400 / 阻碍 200 / 项目 96 / 记忆 60 / 复习 2000 / 事件 1200 / 快照 240 / 日聚合 800 / 节点 500 / 边 900） | 超限**拒绝**，不截断 |
| 非法记录处理 | 部分 | `coerceTask/coerceLog/...` 逐条兜底，坏的被丢弃 | **丢弃条数没有回报给 UI**（缺口 G2） |
| 导入预览 | 有 | `previewImport`：入/本地条数 + 同 id 内容冲突数 + 导出时间 + 范围 + V4 条数 | 无文件名 / 文件大小 / 原始 schema 版本 |
| 合并导入 | 有 | `applyImport(mode='merge')`：任务/日志/项目/阻碍/复习/事件按 id（备份优先）；记忆按 `version` 取高；图谱节点按 id、边按语义去重并丢弃悬空边；日聚合按天覆盖；历史快照 `pruneSnapshots` | 重复导入同一文件幂等（除历史快照会继续叠加到上限） |
| 覆盖导入 | 有 | `applyImport(mode='overwrite')`：整体替换，日志按时间倒序，事件截到 1200，历史仍受每项目 12 条上限 | UI 确认文案会写「本地独有记录会被丢弃」 |
| 事务 | 有 | `lib/tx.writeTransaction`：先全序列化 → 记原值 → 逐条写 → 任一失败逆序回滚 | 明确局限：localStorage 无真事务，回滚本身可能失败，失败时返回 `restored:false` |
| 失败回滚覆盖范围 | 12 键 | tasks / logs / projects / friction / meta / settings / memory / knowledge / reviews / timeline / history / daily | **不含 `timer` 与 `aiRuns`**（它们也不在备份里） |
| 数据清空（V3 面板） | 有但不完整 | `DataPanel.handleClear`：7 个键走 setter + 6 个 V4 键走 repo | **无事务、无失败处理、必定提示成功**（缺口 G3） |
| `useBackup.clearAll` | 有但不完整 | 只写 7 个键；V4 六个键原样保留；结果只做 `every(Boolean)` | 与「清空全部数据」语义不符（缺口 G3） |
| 存储空间观测 | 有，但为估算 | `measureStorage`：`raw.length * 2`（UTF-16）/ `BOARD_CONFIG.storage.assumeQuotaBytes = 5 MB` | 浏览器真实配额拿不到，当前只有「估算容量」（边界 B1） |
| 存储可写性 | 未直接暴露 | `repo/local` 内部有三态 `persistent / memory / blocked`，未导出 | 设置页需要真实状态（缺口 G4） |
| 备份历史记录 | **没有** | 全仓无「上次备份时间」的持久化字段 | 不能用假数据填（边界 B2） |
| 旧 Schema 兼容 | 有 | `unwrapEnvelope` + `coerce*`；备份缺 V4 字段时按空处理；V1 裸数组 / V2/V3 信封均可读 | 导入时 `payload.version` 被强制为 4，**原件版本丢失**（缺口 G1） |
| 多标签页冲突 | 有 | `writeTransaction` 写入后广播 `STORE_EVENT`；`useLocalStore` 监听 `storage`，有本地未保存改动时弹 `ConflictHost` | 导入期间无跨标签互斥锁（边界 B3） |
| 导入进度 | 只有「处理中」 | 读取/校验/写入是同步或单次异步，没有可测进度 | 不许伪造百分比（约束） |
| 下载失败提示 | 有 | `downloadText` 返回 boolean，`DataPanel` 区分成功/失败 | 没有文件大小 / 导出时间（缺口 G5） |

---

## 2. 必须处理的缺口

### G1 原始 schema 版本与丢弃记录数不可见

`parseBackup` 返回的 `payload.version` 恒为 `4`，即使文件里写的是 `2`；
被 `coerce*` 丢弃的坏记录数量也没有任何回报。设置页要展示「Schema Version」与
「是否存在异常数据」，只能改 `lib/backup.ts` 的返回值。

**方案（最小改动）**：`ParseResult.ok` 增加可选 `report`：
`{ sourceVersion: number; dropped: { tasks, logs, projects, friction, memory, reviews, timeline, history, daily } }`。
不改备份格式，不改合并逻辑，老调用方不受影响。

### G2 清空不是事务，而且漏了 6 个 V4 键（`useBackup`）

`useBackup.clearAll` 只清 7 个键 → 记忆、知识、复习、时间轴、历史、日聚合会留下来；
`DataPanel` 清了但逐个写、失败也报成功。两者都不能直接迁移。

**方案**：把 `useBackup.clearAll` 改成一次 `writeTransaction`，覆盖 14 个键
（含 `timer` 与 `aiRuns`），返回真实结果；`DataPanel` 的旧路径保留不动（不再被渲染）。

### G3 导出的「成功」只有布尔值

无法展示文件大小与导出时间，也不能区分「准备中 / 已生成 / 下载被拒」。
**方案**：`useBackup` 增加 `prepareExport(scope)`，返回 payload、序列化文本、字节数、
文件名与各实体条数；`exportAll` 改为调用它 + `downloadText`，行为不变。

### G4 存储可写性 / 存储模式没有对外接口

设置页要显示「当前存储状态」与「是否可写」，不能让组件直接碰 `localStorage`。
**方案**：新增 `lib/storage.ts`：`storageStatus()`（读 repo 的三态探测结果，新增导出）
与 `probeWritable()`（显式按钮触发一次写入探针，立即删除，不常驻）。

---

## 3. 必须如实标注的边界（不修，只说明）

### B1 「剩余空间」拿不到精确值

浏览器不提供 localStorage 的剩余配额。现有实现按 5 MB 估算总量，属**估算**。
可选补充：`navigator.storage.estimate()` 能给**整个站点**的 usage/quota（含宿主数据），
可以展示但必须标注「整个站点，不只是本插件」，不能当作插件自己的剩余空间。

### B2 没有「上次备份时间」

没有任何持久化记录。本阶段只在**本次会话**里显示最近一次成功导出的时间，
并明确写「未持久化，刷新后不可见」；不新增存储键（会动 schema 边界）。

### B3 没有跨标签导入互斥

两个标签页同时导入，后写者覆盖先写者；`writeTransaction` 不提供锁。
现有机制只能保证「本页失败回滚 + 广播让其它标签重读」。报告中标注，
不做假的分布式锁。

### B4 回滚不是 ACID

`rollback` 也可能失败（空间真满）。此时 UI 必须显示「数据可能不一致，请立刻导出备份」，
不能显示成功。现有代码已按此处理，设置页照搬。

### B5 合并语义的几个细节（会被用户感知）

- 同 id 冲突时**备份优先**（不是本地优先）；重复导入同一文件不会翻倍。
- 日志合并后按时间倒序，超出 400 条上限的部分在 parse 阶段就被**拒绝**（不是截断）。
- 历史快照每次导入都会追加一条 `import` 快照，直到每项目 12 条上限。
- 日聚合按天覆盖，不做累加（避免重复导入把分钟数翻倍）。
- 知识边若端点不在节点集内会被丢弃（防悬空边）。

---

## 4. 本阶段实施决策

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 导入/导出全部走 `lib/backup` + `lib/tx`，不新写协议 | 约束八；现有实现已覆盖 12 键与回滚 |
| D2 | 只给 `parseBackup` 加可选 `report` 字段 | 展示版本与异常数据的最小改动，不碰格式 |
| D3 | `useBackup.clearAll` 改事务并覆盖 14 键 | 语义正确 + 失败可回滚；属于必要底层修正 |
| D4 | `useBackup` 增加 `prepareExport`，`exportAll` 复用它 | 展示真实字节数 / 时间，不重复构建逻辑 |
| D5 | 设置页放在工作台内部（顶部齿轮 → `settings` 页），不用第二套抽屉/弹层 | 约束三；导入预览需要宽度 |
| D6 | 覆盖确认用「勾选 + 危险按钮」行内两步，不新写 Modal | 复用 L3 样式与现有规范，不新增浮层系统 |
| D7 | 进度只显示阶段（读取 / 校验 / 写入 / 完成），不显示百分比 | 没有可测进度，不伪造 |
| D8 | 容量同时给「插件实测字节」与「站点估算（可选）」，并标注口径 | 不把估算伪装成真实容量 |
| D9 | 不新增存储键记录备份历史 | 避免动 schema；会话内记录 + 明示未持久化 |

---

## 5. 审计结论

- 主干能力**足以支撑**本阶段目标：导出、预览、合并、覆盖、事务回滚都在，且已有单测。
- 需要补的是「可见性」与「清空语义」，不是重写备份系统。
- 不存在「增量恢复」能力，本阶段不会发明它；导出仍提供全量 / 近 7 天 / 当月三种范围，
  导入仍只有合并 / 覆盖两种语义。
- 未验证项：真实 DSH 宿主内的下载与文件选择行为（本阶段按约束不启动 DSH）。
