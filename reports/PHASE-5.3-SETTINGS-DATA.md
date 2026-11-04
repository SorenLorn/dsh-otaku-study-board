# Phase 5.3 · Settings / Data 交付报告

- 版本：`4.0.0-rc.1`（构建产物 `lib/client.js` 390,474 B）
- 日期：2026-11-03
- 范围：统一工作台内的数据管理入口、导出、导入预览、合并 / 覆盖、事务回滚、清空、存储观测
- 前置审计：`reports/PHASE-5.3-PRE-IMPLEMENTATION-AUDIT.md`
- 结论：**本阶段目标完成**；备份格式、Storage Schema、V3 兼容逻辑均未改动；
  61 项新增断言 + 旧套件共 **658 项全绿**；真实 DSH 宿主**未验证**（按约束未启动）。

---

## 1. 前置审计结果（摘要）

完整审计见 `PHASE-5.3-PRE-IMPLEMENTATION-AUDIT.md`。结论：

| 能力 | 审计结论 | 本阶段处理 |
| --- | --- | --- |
| 全量导出 | 已有，`buildBackup` 恒写 12 个字段 | 迁移并补「大小 / 时间 / 条数」反馈 |
| 时间窗导出（week / month） | 已有，按时间过滤 | 迁移，并明确「不是增量恢复」 |
| 真正的增量恢复 | **不存在**（无基线 / 变更集） | 不发明，报告中明确边界 |
| 导入校验 | 已有：kind / 数组 / 8 MB / 11 类条数上限 | 迁移，新增「原始版本 + 丢弃条数」回报 |
| 冲突预览 | 已有：入 / 本地条数 + 同 id 冲突 | 迁移，补文件信息与 10 类实体 |
| 合并 / 覆盖 | 已有，按 id / 记忆按版本 / 图谱去重 / 日聚合按天 | 直接复用，未改语义 |
| 事务回滚 | 已有：`writeTransaction` 12 键全写或回滚 | 复用；清空也改为事务 |
| 清空 | **有缺陷**：`useBackup` 只清 7 键；DataPanel 清了但无事务、必报成功 | 修正（见 §5.2） |
| 存储观测 | 已有字节数（UTF-16 估算）+ 5 MB 假定配额 | 迁移；补站点级真实用量与可写性探针 |
| 备份历史 | **不存在** | 只在会话内显示，明示未持久化 |
| 多标签冲突 | 有冲突横幅；无导入互斥锁 | 明示边界，未做假锁 |

审计发现的 4 个缺口（G1 版本/丢弃数不可见、G2 清空漏键、G3 导出无大小、G4 存储状态未暴露）
全部在本阶段处理；2 个能力边界（无增量恢复、无精确剩余空间）按要求**标注而不伪造**。

---

## 2. 实际迁移功能

### 2.1 入口

- 顶部工具栏新增「数据」按钮（齿轮图标 + 文字，`aria-label="设置与数据"`），
  进入工作台内部的 `settings` 页；当前页时按钮为 primary 态。
- **没有**恢复 Classic / V4 切换器、**没有**「经典工具」、**没有**跳转 V3；
  备份入口也不在「迁移计划」抽屉里 —— 它在工具栏第一层。
- 设置页复用现有 `V4Shell` / L1 卡片 / `.v4-*` 样式，未新写 Modal / Drawer。
  危险操作是页面内两步确认，不是第二套弹窗系统。

### 2.2 页面结构

```
设置 · 数据
├─ 数据概览    10 类实体真实条数（任务/日志/项目/阻碍/日聚合/时间轴/记忆/知识/复习/快照）
├─ 存储        实测字节 + 估算占比 + 存储状态 + 可写性探针 + 站点级用量/剩余 + 各键明细
├─ 导出        全量 / 近 7 天 / 当月 → 生成并下载 → 文件名 / 大小 / 时间 / 条数
├─ 导入        选择文件 → 预览（不写） → 合并 / 覆盖（危险确认） → 事务写入 → 结果
├─ 危险区      两步确认清空 14 个键（事务，失败回滚）
└─ 能力边界    增量恢复 / 自动快照 / 跨标签锁 / 精确剩余空间 / 回滚局限
```

---

## 3. 新增入口与交互

| 交互 | 行为 | 视觉 / 状态 |
| --- | --- | --- |
| 数据入口 | 工具栏按钮 → settings 页 | primary 表示当前页；不新增导航行 |
| 导出范围 | 全量 / 近 7 天 / 当月 | 复用 `.v4-segment` |
| 生成并下载 | 先进入「正在准备」，再生成 + 下载 | 成功显示文件名、字节数、时间、条数；失败显示原因 |
| 选择备份文件 | 隐藏 `<input type=file>`，按钮触发 | 读取中显示「正在读取并校验」 |
| 导入预览 | 文件名 / 大小 / Schema 版本 / 导出时间 / 范围 / 草稿数 / 10 类条数 / 冲突表 | 预览不写存储；异常记录显示警告 |
| 模式切换 | 合并（默认）/ 覆盖 | 覆盖为红色语义，切换后必须重新勾选确认 |
| 合并确认 | 一次点击，说明「同 id 以备份为准」 | 默认安全路径 |
| 覆盖确认 | 危险面板 + 勾选 + 按钮禁用 + 「先导出当前数据」 | 未勾选时按钮不可点 |
| 导入执行 | 「正在写入 12 个键（全写或回滚）」 | 不伪造百分比 |
| 导入结果 | 成功：条数摘要 + 时间；失败：原因 + 是否回滚 | `role=status` / `role=alert` |
| 清空 | 第一步按钮 → 第二步勾选 + 确认 | 明确列出 14 个键与不可撤销 |
| 测试写入 | 真实写 1 字节再删 | 返回「可写 / 不可写」+ 时间 |

动效沿用 5.2：hover 160ms、active 90ms、modal 180ms、panel 200ms、reduced-motion 全关。
本轮未改材质系统，只新增 `v4-data-*` 组件样式。

---

## 4. 导出与导入数据链路

### 4.1 导出（`useBackup.prepareExport`）

```
board.allTasks / allLogs / allFriction / projects / meta / settings
repo.readMemory / readGraph / readReviews / readTimeline / readHistory / readDaily
        ↓ filterByScope(scope)         ← 已有实现，未改
        ↓ buildBackup(...)             ← 恒写 12 个字段，version = 4
        ↓ serializeBackup(payload)     ← 2 空格缩进，人类可读
        ↓ byteLength(text)             ← UTF-8 字节（与下载文件一致）
        ↓ downloadText(fileName, text) ← 已有实现，失败返回 false
```

- 文件名：`sorchron-board-backup-all-20261103-233811.json`（范围 + 到秒时间戳）。
- 实测：7 个任务 / 7 条日志 / 2 个项目 / 1 份记忆 / 3 个知识点 → 9.9 KB。
- 全量包含**归档项目**（归档不是删除）；时间窗按 `filterByScope` 排除归档项目与过期记录。
- 下载被拒时界面显示「导出失败：浏览器拒绝了下载」，不会谎报成功。

### 4.2 导入（`useDataTransfer`）

```
File → 大小预挡（>16 MB 字节直接拒绝，避免读入内存）
     → readFileAsText → parseBackup
       ├─ 拒绝：JSON 非法 / kind 不符 / 缺 tasks|logs / 8 MB 字符 / 11 类条数上限
       ├─ 逐条 coerce：坏的丢弃并**回报丢弃条数**（本轮新增 ImportReport）
       └─ 得到 payload + sourceVersion
     → previewImport(本地, payload, mode)   ← 只读，不写
     → 用户确认（合并 / 覆盖）
     → applyImport(本地, payload, mode)     ← 已有合并语义，未改
     → buildImportSnapshot（有当前项目时）+ pruneSnapshots，并入同一次事务
     → writeTransaction(12 键)              ← 全写或逆序回滚
     → 结果：成功 / 中止并回滚 / 中止且回滚失败
```

导入会写入的 12 个键：`tasks`、`logs`、`projects`、`friction`、`meta`、`settings`、
`memory`、`knowledge`、`reviews`、`timeline`、`history`、`daily`。

### 4.3 合并语义（复用，未改）

- 任务 / 日志 / 项目 / 阻碍 / 复习 / 事件：按 id，备份优先；本地独有保留。
- 记忆：同项目取 `version` 更高的一份。
- 知识图谱：节点按 id 覆盖；边按语义去重（`related` 无向），悬空边丢弃。
- 日聚合：按天覆盖（恢复语义，不累加）。
- 历史快照：`pruneSnapshots` 每项目 12 条上限；每次导入追加一条 `import` 快照
  （**仅当有当前项目时**，沿用 V3 行为）。
- 重复导入同一文件：任务 / 日志条数不变（浏览器实测 8 → 8）。

### 4.4 版本与丢弃记录（本轮唯一的数据层改动）

`parseBackup` 的 `ok` 分支新增可选 `report`：

```ts
{ sourceVersion: number,
  dropped: { tasks, logs, projects, friction, memory, reviews, timeline, history, daily } }
```

- 不改备份文件格式，不改合并逻辑，老调用方（`DataPanel`）只读 `payload`，不受影响。
- 预览因此能显示「v2 备份」与「1 条记录无法识别，导入时跳过」。

---

## 5. 事务与失败回滚验证

### 5.1 导入事务

`writeTransaction` 的顺序：全部序列化（失败则 0 写入）→ 记录每键原值 → 逐键写 →
任一失败则**逆序回滚** → 返回 `{ ok, failedKey, restored, written }`。

实测（jsdom，令 `:logs` 写入抛 `QuotaExceededError`）：

- 界面显示：「导入已中止（写入「dsh-otaku-study-board:logs」失败），原有数据已回滚，可以重试」。
- 存储校验：`tasks` / `logs` / `daily` 三个键的原始字符串**逐字节一致**（无部分残留）。
- 反例覆盖：如果回滚也失败，界面显示「数据可能不一致，请立刻导出备份」，不显示成功。

### 5.2 清空的必要修正（底层）

审计 G2：`useBackup.clearAll` 原来只写 7 个键，`memory / knowledge / reviews /
timeline / history / daily` 会残留；`DataPanel` 清了这 6 个键但逐个写、无事务、必报成功。

修正：`clearAll` 改为一次 `writeTransaction`，覆盖 **14 个键**（含 `timer` 与 `aiRuns`），
失败时回滚并返回真实原因。实测（浏览器）：清空后 10 类实体全部为 0，刷新后仍为 0。

### 5.3 多标签页

`writeTransaction` 写完后广播 `STORE_EVENT`，其它标签的 `useLocalStore` 会重读；
但**没有跨标签导入互斥锁**：两个标签同时导入时后写者覆盖先写者。
这一条明确写在设置页「能力边界」与报告 §9，没有用假的锁掩盖。

---

## 6. 存储观测实现

| 指标 | 来源 | 口径 / 限制 |
| --- | --- | --- |
| 本插件已用 | `measureStorage()`：14 个键 `raw.length * 2` | UTF-16 字符估算，非磁盘字节 |
| 估算占比 | `bytes / 5 MB`（`BOARD_CONFIG.storage.assumeQuotaBytes`） | 明确标注「按 5 MB 假定配额」；不足 1% 显示 `<1%` |
| 各键明细 | 同上，按字节降序 | `<details>` 展开，14 行 |
| 存储状态 | `lib/storage.storageStatus()` 只读探测 | `可持久化 / 内存模式 / 被禁用` |
| 是否可写 | 「测试写入」按钮 → 写 1 字节再删 | 显式动作，不做后台探针（避免 storage 噪音） |
| 站点用量 / 剩余 | `navigator.storage.estimate()` | **整个站点**（含 DSH 宿主与其它插件），不是本插件配额；不支持时显示「浏览器不提供」 |
| 最近备份时间 | 仅本次会话状态 | 没有持久化记录，刷新即失；页面明确写「没有持久化的备份历史」 |

不存在「用估算冒充真实容量」：三个口径（插件实测 / 假定配额 / 站点真实）在界面上分开写。

---

## 7. 实际修改文件

### 新增

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `src/client/v4/Settings.tsx` | 582 | 设置 · 数据页（概览 / 存储 / 导出 / 导入 / 危险区 / 边界） |
| `src/client/v4/useDataTransfer.ts` | 312 | 导入状态机（读取 → 预览 → 写入 → 结果），串起 backup + tx |
| `src/client/lib/storage.ts` | 111 | 存储三态、写入探针、站点级 estimate |
| `scripts/ui/data.test.tsx` | 409 | jsdom 28 项（导出 / 导入 / 回滚 / 清空） |
| `scripts/ui/data-browser.test.mjs` | 387 | Chromium 31 项（真实文件 / 下载 / 刷新 / 720） |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/client/lib/backup.ts` | `ParseResult.ok` 增加 `report`（原始版本 + 丢弃条数）；改用 raw 数组计数，解析结果不变 |
| `src/client/hooks/useBackup.ts` | 新增 `prepareExport`；`exportAll` 复用它；`clearAll` 改为 14 键事务 |
| `src/client/v4/Shell.tsx` | `V4Page` 加 `settings`；工具栏「数据」入口；设置页隐藏「新建任务」 |
| `src/client/index.tsx` | 渲染 `Settings` |
| `src/client/v4/DetailContent.tsx` | 迁移计划里备份条目从「未开放」改为「本阶段已完成」 |
| `src/client/v4/ui.tsx` | `ProgressBar` 在 >0 且 <1% 时显示 `<1%`，不再四舍五入成 0% |
| `src/client/style/board.css` | 新增 `v4-settings` / `v4-data-*` 样式（3545 → 3977 行） |
| `scripts/ui/workbench-harness.tsx` | 支持 `page=settings`；种子改为只灌一次；暴露 `__counts()` |
| `scripts/ui/workbench-shot.mjs` | 新增 settings 视图（共 36 张） |
| `scripts/ui/glass-contrast.mjs` | 采样页加 settings；选择器扩到 26 个；只采样视口内元素（修掉视口外黑像素的假告警） |
| `scripts/ui/workbench-browser.test.mjs` | 放宽动画等待（原来会在 180ms 动画中途测尺寸） |
| `TESTING.md` | 附 E：5.3 命令、59 条新断言、人工确认 4 项 |

### 未修改（有意）

Storage Schema（仍 `schemaVersion: 4`、14 个键）、备份文件格式、合并算法、
`lib/tx`、`lib/repo`、V3 `board/DataPanel.tsx`（源码保留、不再渲染）、`cordis.patch.yml`。

---

## 8. 测试结果

### 8.1 全量

| 套件 | 入口 | 项数 | 结果 |
| --- | --- | --- | --- |
| TypeScript | `tsc --noEmit` | — | 0 错误 |
| Build | `node scripts/build.mjs` | 2 产物 | 成功（390,474 B） |
| 挂载链路 | `register-check.mjs` | 13 | 13 / 13 |
| 逻辑冒烟 | `smoke.ts` | 415 | 415 / 415 |
| 组件（jsdom） | `components.test.tsx` | 46 | 46 / 46 |
| 工作台交互（jsdom） | `workbench.test.tsx` | 25 | 25 / 25 |
| 数据管理（jsdom） | `data.test.tsx` | 28 | 28 / 28 |
| 工作台（Chromium） | `workbench-browser.test.mjs` | 26 | 26 / 26 |
| 数据管理（Chromium） | `data-browser.test.mjs` | 31 | 31 / 31 |
| 布局（Chromium） | `layout-browser.test.mjs` | 21 | 21 / 21 |
| 入口（Chromium） | `shell-browser.test.mjs` | 11 | 11 / 11 |
| Tasks 布局 | `tasks-browser.test.mjs` | 15 | 15 / 15 |
| Button 系统 | `button-browser.test.mjs` | 13 | 13 / 13 |
| 冲突横幅 | `conflict-browser.test.mjs` | 6 | 6 / 6 |
| V3 hover | `v3-hover.test.mjs` | 8 | 8 / 8 |
| **合计** | | **658** | **658 / 658** |

附加：截图 40 张（36 张页面矩阵 + 4 张导入 / 覆盖 / 清空 / 720 状态），横向溢出 **0**；
对比度 50 个采样点全部 ≥ 4.5:1（最低 4.64:1）。

### 8.2 本阶段新增覆盖

导出：全量结构 / 文件名 / 字节数 / 归档项目 / 时间窗过滤 / 空数据 / 再解析 / 真实下载文件内容。

导入：预览信息、预览不写库、合并（同 id 覆盖 + 新增 + 本地保留）、重复导入幂等、
覆盖、旧 v2 备份、非法 JSON、超大文件、坏记录跳过、写入失败回滚、失败零残留、
清空两步 + 14 键归零、刷新持久化、概览数字自动刷新。

---

## 9. 未完成能力与风险

### 9.1 能力边界（不做，且已写在页面「能力边界」里）

| # | 边界 | 影响 | 处理 |
| --- | --- | --- | --- |
| B1 | 没有真正的增量恢复 | 时间窗导出不能当增量链回滚 | 明确标注，不发明协议 |
| B2 | 导入前不自动创建恢复快照 | 覆盖后只能靠手动导出的备份 | 提供「先导出当前数据」按钮；明示不自动 |
| B3 | 无跨标签导入互斥 | 两标签同时导入后写覆盖先写 | 明示；未做假锁 |
| B4 | 无精确剩余空间 | 只能给估算占比 + 站点级真实值 | 三个口径分开标注 |
| B5 | 无持久化备份历史 | 刷新后看不到上次导出时间 | 会话内显示 + 明示未持久化 |
| B6 | 回滚不是 ACID | 空间真满时回滚可能失败 | 最坏情况明确显示「数据可能不一致」 |
| B7 | 导入历史快照依赖「当前项目」 | 全部项目视图下不追加快照 | 沿用 V3 语义，未改 |

### 9.2 风险

1. **大文件未做真实压力测试**：8 MB 字符上限与 11 类条数上限沿用旧实现，
   只测了预挡（>16 MB 直接拒绝）与小文件；接近上限时的解析耗时未实测。
2. **`DataPanel` 仍是死代码**：源码保留（约束），但不渲染；其中 `writeSettings`
   硬编码 `schemaVersion: 3` 的问题仍在文件里，只是不再执行。若未来复活该组件必须先修。
3. **同步构建导出内容**：`prepareExport` 在点击时同步读 6 个 repo 键并序列化。
   当前数据量（10 KB 级）无感；接近 5 MB 时可能出现可感知停顿（已加「正在准备」状态）。
4. **站点用量口径**：`navigator.storage.estimate()` 返回整个 origin 的用量，
   DSH 宿主的数据也会计入；页面已标注，但仍可能被误读为插件占用。
5. **静默丢弃仍然存在**：坏记录会被 `coerce*` 丢弃（现在会显示条数），
   但不会逐条列出原因；极端情况下用户只知道「少了 3 条」。

---

## 10. 真实 DSH 宿主是否验证

**未验证。**

- 本阶段按约束没有启动或重启 DSH。
- 未验证项：宿主工具栏内的入口位置与换行、宿主滚动容器中的设置页滚动、
  宿主对 `<input type=file>` 的安全策略、宿主对下载（Blob + `<a download>`）的拦截、
  宿主深色 token 下的实际对比度。
- 独立 Chromium 的结果**不能**替代宿主结论；所有宿主项在交付说明里保持「未验证」。

---

## 11. 是否满足进入 Focus 阶段的条件

**数据安全维度：满足。** 备份、导出、导入预览、合并、覆盖、事务回滚、清空、
存储观测都已闭环，且用户不需要离开统一工作台；本阶段没有 P0/P1 数据安全缺口。

**但进入 Focus 前必须同时做一件事**：Phase 5.2 遗留的自动采集仍处于暂停状态
（监听原本挂在 `SessionLog` 上，现在没有组件挂载它）。Focus 阶段把计时器接回来时，
必须把 `useHarnessEvent` / `useSessionCapture` 提升到 Shell 级，并在界面上显示
「采集中 / 已暂停」，否则会出现「计时能用、日志不增长」的新裂缝。

建议的进入顺序：

1. Focus：计时 / 休息 / 任务绑定 + 采集监听上移（一个阶段整体做，不拆半成品）。
2. History：会话列表 → 完整时间轴 → 学习日历（`lib/heatmap` 数据层已就绪）。
3. Tasks 收尾：先给 `actions` 补子任务 / 预估 / 会话绑定方法，再开放 UI。
4. Projects：新建 / 模板 / 归档 / 快照。
5. Memory / Knowledge：草稿逐条采纳、知识编辑与复习排期。

---

**本阶段到此停止。** 未开始 Focus，未提前开发 History，未修改其它未要求的功能。
