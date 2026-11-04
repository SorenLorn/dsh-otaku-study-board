# 架构说明 · Sorchron Study Board

写给接手这个仓库的人。目标：十分钟内知道「数据从哪来、写到哪去、哪一块不能随便动」。

> 适用范围：`4.0.0-rc.1`。本文件只描述**当前代码**。所有踩过的坑与不可动摇的约束都写在下面，
> 不再另存历史阶段报告 —— 想追旧决策请查 git 历史，想改代码只读这一份。

---

## 1. 整体形状

DSH 插件 = 两个半 + 一份清单。

```
package.json  ──dsh.bundle.patch──▶  cordis.patch.yml ──▶ profile 的插件树
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
            lib/index.js（宿主半）                     lib/client.js（客户端半）
            刻意 no-op，只为了有东西可 import            浏览器 bundle，注册 slot 并渲染页面
```

- **宿主半**（`src/index.ts`）：不订阅服务、不起进程、不读配置。它存在只为满足「bundle 里必须有
  一个可 import 的入口」。真正的功能全在客户端。
- **客户端半**（`src/client/index.tsx`）：`apply(ctx)` 做三件事 ——
  1. `ctx.effect(installBoardStyles)`：把内联的 CSS 注入一个 `<style data-plugin-css=…>`，
     卸载时移除（重复加载不会叠加）；
  2. 注册左侧导航行与它打开的页面；
  3. 把 `BoardPage` 作为组件交出去。

### 左导航是怎么注册的（别再重复探）

宿主**没有** `ctx.slots.sidebarGuide`（本机 profile 的 node_modules 里 grep 不到该标识符）。
现行可用写法与 `dsh-context` 完全一致，两条 slot 用同一个 id 对齐：

```ts
ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, Page))
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
  id: PANEL_ID, order: 20, label }, Icon))
```

`registerSidebarGuide()` 里保留了一个 `sidebarGuide` 分支：宿主哪天真的提供该 API，改走它即可，
不用重写调用点。`PANEL_ID` / `PANEL_ORDER = 20` 是稳定契约，测试会检查。

---

## 2. 数据层

### 2.1 存储键（14 个）

前缀 `dsh-otaku-study-board:`，写入信封 `{ schemaVersion: 4, data }`。

| 键 | 内容 | 备份 |
| --- | --- | --- |
| `tasks` `logs` `projects` `settings` `friction` `meta` | V3 起的核心实体 | ✅ |
| `daily` `timeline` `memory` `knowledge` `reviews` `history` | V4 新增 | ✅ |
| `timer` | 计时器瞬态状态（含 `pendingResult`） | ❌ 不进备份 |
| `aiRuns` | AI 调用审计 | ❌ 不进备份、不参与统计 |

读时补齐、**打开页面不写回**（`useLocalStore` 里的 `touchedRef`）：老数据只有真正被修改时才升版。

### 2.2 两条读写通道（刻意并存，不做统一重构）

| 通道 | 用在哪 | 特点 |
| --- | --- | --- |
| `useLocalStore<T>(key, initial)` | 6 个核心键 + `daily`/`timeline` 等 | React 状态 + 立即写盘 + `STORE_EVENT` 广播 + 跨标签 `storage` 冲突决议 |
| `lib/repo`（`getRepo()`） | `memory` / `knowledge` / `reviews` / `timeline` / `history` / `daily` / `aiRuns` 的整表读写 | 非 React 的仓储端口，供 `useBackup` / `useDataTransfer` 直接读快照 |

`repo` 的存储可用性是**三态**：`persistent`（正常）/ `memory`（没有 window，测试用）/ `blocked`
（浏览器禁用存储）。`blocked` 时写入必须返回 `false`，不能谎报成功。

### 2.3 写事务：`lib/tx.ts`

```ts
writeTransaction(store, [{ key, value }, ...])
// 先全部序列化（序列化失败 = 一个字节都不写）
// 再逐写；任一失败 → 逆序回滚已写的键 → 返回 { ok, failedKey, restored, written }
```

`restored === false` 表示**回滚也失败了**，数据可能不一致 —— 上层必须如实告诉用户，不能当成功。
这是全项目唯一的事务原语，导入、清空、结算都走它。

### 2.4 版本与兼容：`lib/schema.ts`

`unwrapEnvelope` 接受四种输入：裸数组（V1）、`{schemaVersion: 2|3, data}`、V4 信封。
统一用 `coercePayload(key, data)` 洗一遍：字段缺失给默认值、类型不对就丢弃该条并计数。
**没有迁移脚本**，只有「读时补齐」，因为数据在用户浏览器里，迁移脚本跑不成的场景太多。

### 2.5 备份与导入（`lib/backup.ts` / `hooks/useBackup.ts` / `v4/useDataTransfer.ts`）

- **导出恒写 12 个实体字段**（`BACKUP_KEYS`：tasks / logs / projects / settings / friction / meta /
  memory / knowledge / reviews / timeline / history / daily），缺省也写空值。这条不能改成
  「调用方传了才写」—— 漏传一个键就是静默丢一份数据。
- **导入是一条固定流水线**：大小预挡（>16 MB 直接拒绝）→ `parseBackup`（JSON / kind / 必填键 /
  条数上限；坏记录逐条丢弃并**回报丢弃条数**）→ `previewImport`（只读，不写库）→
  用户确认「合并 / 覆盖」→ `applyImport` → 快照裁剪 → **一次 `writeTransaction` 写 12 个键**。
- **合并语义**：实体按 id 取备份侧（本地独有保留）；记忆取 `version` 更高的一份；知识节点按 id
  覆盖、`related` 边无向去重、悬空边丢弃；**日聚合按天覆盖而不是累加**（恢复语义）。
- **清空是另一条路径**：`clearAll` 一次事务写 **14 个键**（比备份多 `timer` 与 `aiRuns`），
  失败回滚并返回真实原因。
- **没有跨标签导入锁**：两个标签同时导入时后写覆盖先写，不报冲突；设置页「能力边界」里明写。

---

## 3. Actions 层

`lib/actions.ts` 是**纯函数**：输入「当前状态 + 意图」，输出「新状态 + 要写哪些键」。不碰 React、
不碰存储。`hooks/useBoardActions.ts` 负责把它们的结果落到 `useLocalStore`（或 `settleFocus`）。

几条不变量：

- 任务完成 → `daily.tasksDone + 1` + `timeline` 记一条 `task.completed`；
- 任务删除 → 回退当天 `tasksDone` + 记 `task.deleted`（幂等）；
- 专注结算 → `logs` + `daily.focusMinutes` + 任务 `focusedMinutes/pomodoros` + `timeline`，**一次事务**；
- 非专注日志（`kind !== 'focus'`）→ 只 `daily.sessions + 1`，**永不进 `focusMinutes`**。

---

## 4. React 组件结构

```
BoardPage（src/client/index.tsx）
├── CaptureBridge            采集的唯一挂载点（useHarnessEvent 单例）
├── useSettlementRecovery()  每次会话跑一次「重复结算」收敛
└── V4Shell（v4/Shell.tsx）
    ├── .v4-topbar           品牌 / Dashboard·任务·历史 / 项目作用域 / 日期 / 新建 / 数据 / 迁移计划
    ├── 页面                   Dashboard | Tasks | History | Settings
    └── OverlayHost（v4/Detail.tsx）
        ├── 抽屉（Detail / DetailContent）
        └── 弹层（TaskComposer 等）
```

### WorkspaceProvider（`v4/workspace.tsx`）

一份状态管三件事：**行内展开**（`expandedId`，全局只开一个）、**抽屉**（`detail`）、**弹层**（`modal`）。
抽屉与弹层互斥。`closeOverlay` 会：解除滚动锁 → 恢复滚动位置 → 把焦点还给来源元素。
焦点环由 `useDialogKeys` 负责（Tab 循环、Esc 关闭、初始焦点优先给输入框）。

### 为什么浮层不放在卡片里

`position: fixed` 的浮层如果渲染在卡片内部，会被 `backdrop-filter` 建立的包含块「关」进卡片，
表现为浮层被裁切、hover 时边缘抖动。所以浮层统一挂到页面根的 `.v4-overlays`，
卡片内只做「展开」（`ExpandablePanel`），不做浮层。卡片 hover 只改 border/shadow/background，
**禁止 transform 位移**（同上原因）。

---

## 5. Focus 状态机（`lib/focus.ts`）

纯函数，时间全部作为参数传入，方便测试。

```
        start                pause                end/到点
 idle ─────────▶ running ───────────▶ paused ────────────▶ completed
   ▲                │                    │                     │
   │  cancel        │ 到点/结束           │ resume              │ beginBreak
   └────────────────┴────────────────────┴─────────────────────┤
                                                               ▼
                                            break ⇄ break-paused ──▶ idle
```

六态 `idle | running | paused | completed | break | break-paused` **全部派生**，不额外存状态字段。

要点（改之前必读）：

- **计时靠时间戳**：`deadline` 是唯一真相，`remainingSecondsAt(state, now)` 反推剩余；interval 只负责
  刷新显示与「到点」判定，不做 `seconds - 1` 累减。
- **实际分钟** = `floor((全长 − 剩余) / 60)`；剩余只在跑着时减少，多段暂停天然累计。
- **`paused` 用 `startedAt !== null` 判定**，不能用「剩余 < 全长」—— 刚开始就暂停时 `ceil` 会把剩余
  取回全长，误判成 `idle` 会换掉 `roundId`。
- **结束时刻取 `min(now, deadline)`**：睡眠跨午夜回来时按 deadline 归属，否则热力图日期错。
- `completed` 是持久态（剩余留 0 不回满），真实分钟另存 `lastMinutes`。
- **幂等三层**：`timer.roundId`（同一轮只有一个 id）→ 日志 id（`finishFocus` 见到同 id 直接返回空）
  → `settleFocus` 的重复判定。没有 roundId 的老状态用 `focus-<startedAt.toString(36)>` 派生，
  所以刷新重放、双标签同时结算都只会记一笔。
- **`daily.sessions` 的口径是「非 focus 日志条数」**：`addSessionLog` 时 +1、`deleteLog(s)` 时 -1，
  **不进 `focusMinutes`**。任何新增写日志的路径都必须同步这两条，否则与 `rebuildDaily` 不一致。

---

## 6. 结算事务与恢复（`lib/settlement.ts`）—— 最需要小心的文件

### 6.1 为什么不能用四个 setter

`useLocalStore.update` 是「动作发生即写盘」。四个 setter = 四次独立写盘，任一次失败就留下部分写入。
实测：`daily` 失败时日志与任务已经加上了；`logs` 失败时 daily/任务/时间轴已经加上了。而 `roundId`
在 `endRound` 已清空，失败后拼不回同一笔，也没有重试入口。所以改成 `settleFocus` 一次事务写 4 键。

### 6.2 判据：四个实体投票，不是「日志在不在」

```
settleFocus(input)
├── 日志不存在 → finishFocus 算新状态 → writeTransaction 写 4 键 → verifySettlement
├── 日志存在   → verifySettlement
│                 ├── 通过 → 「本来就完整」，直接成功（duplicate）
│                 └── 不通过 → planRepair（只用持久化基线）→ 只补缺失 → recheck
└── 任何一步失败 → ok=false，不返回 next，保留 pendingResult
```

`verifySettlement(state, result, baseline)` 校验四件事：日志恰好 1 条且分钟/日期/绑定一致；
`daily ≥ 基线 + 本轮`；任务 `focusedMinutes ≥ 基线 + 本轮` 且 `pomodoros ≥ 基线 + 1`；
指向本轮的 `focus.completed` 恰好 1 条。**只比对本轮关键字段**，不做整对象深比较（别人可能同时改
无关字段）。

### 6.3 三态判定与基线

每个实体只有三种结论：**已应用 / 未应用 / 判断不了**。

| 比较 | 结论 |
| --- | --- |
| `current === before` | 未应用 → 补 |
| `current >= before + minutes` | 已应用 → 不动（不加也不下调） |
| 其它（中间值 / 整行被删） | 判断不了 → **不写**，报「无法确定」 |

基线 `SettlementBaseline { day, dailyMinutes, taskId, taskMinutes, taskPomodoros }` 在写入前快照，
失败时存进 `pendingResult.before`（`useTimer.keepBaseline` 只写一次，绝不覆盖成失败后的值）。

> **踩过的坑**：`planRepair` 曾写成 `input.baseline ?? snapshotBaseline(fresh)`。没有持久化基线时，
> 它把「失败后的当前值」当成基线，于是 `current >= before + minutes` 恒成立 → 永远判「已算过」→
> 修复空转却报成功。现在**只用 `input.baseline`**，没有就不修。

### 6.4 `pendingResult` 生命周期

`endRound` 产生 → 结算失败保留（并补基线）→ 四实体通过才清 → `retryPending` 带 `before` 重放 →
挂载自动重试一次 → 用户点「放弃这一笔」走 6.7 的证明流程 → 未保存时 UI **不渲染**
「开始下一轮」（reset 会清掉 pending）。

`timer` 是瞬态键、不进备份，所以这一整套不污染备份格式。

### 6.5 重复结算收敛

同一 `roundId` 出现多次 → 只留最早一条日志，`daily` / 任务 / 时间轴各回退一份
（`repairDuplicateSettlements`，确定性：每次应用都恰好加一次同样的量）。`useSettlementRecovery`
挂在 `BoardPage`，每次会话跑一次并给出「已合并并回退 N 分钟」提示。

### 6.6 能保证 / 不能保证

**能**：单标签内 4 键全写或全不写；同 round 幂等（重试 / 刷新 / 多标签恢复都不翻倍）；
部分写入可按基线精确补齐；失败绝不谎报成功。

**不能**：localStorage 无锁无 CAS，跨不同 round 的并发写入会后写覆盖先写且**无法检测**；
基线丢失且数据被第三方改动时只能报「无法确定」，由人决定。

### 6.7 「放弃这一笔」的安全边界（`planDiscard` / `discardSettlement`）

放弃**不是**「清掉标记」那么简单。它只做一件事：**在能证明的前提下，把本轮自己写的痕迹删掉**。

**只允许删两样**，都靠 roundId 唯一定位：

```ts
logs     = state.logs.filter(log => log.id !== result.roundId)
timeline = state.timeline.filter(e => !(e.type === 'focus.completed' && e.refId === result.roundId))
```

`daily` / `task` **一个字节都不写** —— 只有在证明它们从未被本轮改过之后，才允许删日志与事件。

**判据（缺一即拒绝）**：日志至多 1 条且 `kind==='focus'`、分钟 / 日期 / `taskId` 都与本轮一致；
`daily` 有同日基线且当前值仍等于基线；任务仍在时 `focusedMinutes` 与 `pomodoros` 都仍等于基线。

**「日志没了」不等于「可以放行」**：事务顺序是 logs → tasks → daily → timeline，回滚失败会留下
「日志已回滚、Daily 却加上了」。所以即使本轮在日志和事件里都找不到痕迹，`daily` / `task` 的
基线校验也照常跑 —— 否则那 18 分钟会永久留在日聚合里，没有任何日志支撑。

**执行**：删除与「清 `pendingResult`」在**同一个事务**里；只写真的变了的键；写后回读校验，
校验不过就把标记**写回原值**，绝不留「标记没了、数据还在」。

**刻意拒绝的一类**：日聚合或任务**已经累计**时一律不给放弃 —— 这两个实体里没有 roundId，
扣减只能猜，猜错扣的是别人的有效记录。出口是「重试写入」。
（结构与取舍见 `KNOWN-LIMITATIONS.md` A2；界面三态：`已记入` / `未保存` / `已放弃`，
刷新后由「存储里有没有 `at === 本轮 endedAt` 的 focus 日志」推导，不靠内存状态。）

---

## 7. 会话采集

```
DSH 事件 ─┐
宿主服务 ─┼─▶ useHarnessEvent（模块级 activeDispose 单例，同一时刻只有一组监听器）
window 桥 ─┘        │ 防抖 + 内容哈希去重
                    ▼
             useSessionCapture（归一化 / 分类 / 合并同主题续写）
                    ▼
             CaptureBridge（BoardPage 根节点，只渲染一次）
                    ▼
             useBoardActions.addSessionLog → daily.sessions + 1（不进 focusMinutes）
```

三条纪律：**只有一个挂载点**（多挂会互相踢掉，表现为时好时坏）；**不新增采集范围**（复用
`lib/detect`）；**不污染专注**。斜杠命令 `/board-*` 只从日志里摘掉，不执行。

---

## 8. History 聚合与统计口径

- 热力图 / 活跃分都用 `lib/activity.ts`：`score = focusMinutes + tasksDone × 25`，
  色阶阈值 `[1, 25, 60, 120]`（0 分永远是空档）。这五个档是**产品规则**，不是科学标准，
  不要为某一处显示另算一套。
- **去重优先级**：`daily` 聚合优先，`logs` 只作补充，取 `max(daily, logs)`；日志按 `id` 去重；
  `timeline` 只用于明细展示，**永不参与计数**（否则一次专注会被算三遍）。
- **专注次数 `focusCount`**：有效 focus 日志条数。只剩 `daily` 聚合的老日子（日志已超出 400 条
  上限被裁）按下限记 **1 次** —— 是下限，不编造具体条数。
- **连续天数**：活跃 = `score > 0`。最长连续取窗口内最大连跑；当前连续在今天没活动时**从昨天起算**
  （与 `stats.countStreak` 的产品规则一致，避免早上打开就显示 0）。两个指标都只在所选窗口内算，
  40 天连续在 30 天视图里显示 30。
- 日期键一律走本地日键 `YYYY-MM-DD`（`lib/daily` / `lib/time`），**不要**用 `toISOString()` 切 UTC。
- 历史页是只读视图：不写库、不触发 `applyDailyDelta`、不重构 daily。
- **Dashboard 首页的全年热力图与历史页共用 `v4/Heatmap.tsx` + `lib/activity.ts`**：
  两处都调 `buildActivityWindow({range:365})`，同一天的颜色/数字是同一份聚合算出来的；
  组件只渲染不统计，禁止在页面里另写一套求和。历史页额外提供 30 / 90 / 365 天切换。

---

## 9. 样式与主题

- 单文件 `src/client/style/board.css`（约 4.9k 行），构建时内联进 bundle；全部规则以 `.v4-*` 或
  `.osb-*` 开头，**没有** `body` / `*` / 裸标签选择器，不会污染宿主。
- 深色由宿主驱动：`body[data-ds-dark-theme] .v4-page …`，深色单独覆写 `background-image` 去掉浅色
  斜向反光。颜色 token 优先用 `--dsw-alias-*`，没有就退回本地 `--v4-*`。
- 三层材质：`.v4-page`（环境渐变 + 颗粒）→ `.v4-glass-1`（主面板，blur 24px）→ `.v4-glass-2`（次级，
  blur 14px）。嵌套控件用 `--v4-inset-*`，**不叠 backdrop-filter**。
- `prefers-reduced-motion: reduce` 下关掉过渡与动画（浏览器测试会断言 `transition-duration: 0s`）。

---

## 10. 测试结构

| 层 | 套件 | 怎么跑 |
| --- | --- | --- |
| 纯逻辑 | `smoke.ts` / `activity` / `focus` / `settlement` | esbuild 打成 cjs 后 `node` |
| jsdom | `components` / `workbench` / `data` / `history` / `focus-ui` / `recovery-ui` / `dashboard-heat` | 同上，额外 `--external:jsdom` |
| Chromium | 11 个 `*-browser.test.mjs` + `focus-multi-tab` + `v3-hover` | 起独立 Chrome（`--headless=new` + CDP），页面来自 `scripts/ui/*-harness.tsx` |

没有 jest / vitest，断言就是 `check(name, ok, detail)` 往数组里 push。共 22 个套件，
命令、基线与未覆盖场景见 [`TESTING.md`](./TESTING.md)。

---

## 11. DSH 宿主适配的已知边界

- 宿主 API：`ctx.slots.*`、`ctx.effect`、`ctx.inject(['slots'])`、`connection.fetch.register` 可用；
  `ctx.get('llm')` 只有 provider 注册表、没有生成接口；`settings.describe()` 拿不到密钥；
  没有 `commands.register`。所以任何「AI 能力」都得自带配置，不能借宿主密钥。
- 主题：宿主在 `body` 上打 `data-ds-dark-theme`，只能靠它判断深浅色。
- 真实宿主内的验收（页面加载、采集通道、深浅色、抽屉层级）**尚未由本仓库自动化覆盖**，
  需要人工过一遍，清单见 `TESTING.md` 末尾与 `KNOWN-LIMITATIONS.md`。
