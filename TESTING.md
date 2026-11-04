# TESTING · 溯时学习工作台 V3（Sorchron Study Board）

本文件是**人工验收清单**，按交付要求分成四类：正向功能、边界异常、版本升级、稳定性。
每个场景都给出：目标 → 前置 → 步骤 → 预期 → **不通过信号**。

> 不通过信号比预期更好用：现象对上就是 bug，不用纠结「这算不算预期内」。

自动化能覆盖的部分（识别规则、聚合口径、版本兜底、去重、子任务一致性、项目隔离、
快照往返、导入合并、命令解析）已经落在 `scripts/smoke.ts`；挂载链路在
`scripts/register-check.mjs`。本文件只保留**必须在真实浏览器里点一遍**的部分。

---

## 0. 前置准备

### 0.1 打开看板

左侧导航出现 **溯时学习工作台** → 点击 → 主区打开独立页面。页面结构：

```
页头
项目切换条           ← V3 新增（全部 / 各项目 / 新建 / 模板 / 管理 / 快照）
今日概览
任务清单              专注计时器
开发会话日志（整行）
学习数据看板
  ├ 近 7 日专注 / 当日构成 / 项目排行 / 本周完成率 / 每日完成时序
  └ 折叠面板：会话上下文观测 · 开发阻碍记录 · 月度目标 · 数据备份 · 调试 & 自测
```

### 0.2 控制台

F12 → Console，过滤 `SorchronBoard V3:`。**正常情况下几乎没有输出** —— 只在有事
发生时才打印（通道绑定、去重命中、导入被拒、清理脏数据）。有红色 `error` 就是真问题。

### 0.3 存储位置（7 个 key）

| key | 内容 | 进备份 |
| --- | --- | --- |
| `dsh-otaku-study-board:tasks` | 任务（含子任务 / 截止日期 / 项目 / 会话） | ✅ |
| `…:logs` | 会话日志（含专注记录、token 估算） | ✅ |
| `…:projects` | 项目 | ✅ |
| `…:settings` | 采集开关、时长、规则、月度目标、当前项目、休息参数 | ✅ |
| `…:friction` | 开发阻碍记录 | ✅ |
| `…:meta` | 会话→任务绑定表 | ✅ |
| `…:timer` | 计时状态（阶段 / deadline） | ❌ 瞬态 |

V3 写入格式：`{ "schemaVersion": 3, "data": … }`。

### 0.4 自动化自检（先跑，全绿再手动）

```bash
node ./node_modules/typescript/bin/tsc --noEmit          # 类型：0 错误
node scripts/register-check.mjs                          # 挂载链路：13 项
npx esbuild scripts/smoke.ts --bundle --platform=node \
  --format=cjs --outfile=smoke.cjs && node smoke.cjs      # 逻辑：174 项
```

合计 **187 项**。任何一项红就不必往下走。

---

# 一、正向功能用例

## 场景 1 · 项目创建 / 切换 / 归档（数据严格隔离）

**目标**：三个项目互不串数据；归档项目退出日常统计但历史可查。

**步骤**

1. 项目条点 `＋ 新建项目` → 输入 `插件开发` → 回车。
2. 再建 `前端学习`、`算法练习`。
3. 切到「插件开发」，在任务清单加 2 个任务、在日志卡手动新增 1 条记录。
4. 切到「前端学习」，确认任务清单与日志里 **看不到** 刚才那 3 条。
5. 切回「插件开发」，确认 2 个任务 / 1 条日志都还在。
6. 项目条 → `项目管理` → 把「算法练习」`归档`。
7. 点 `全部项目`，确认「算法练习」不再出现在切换条里，也不参与统计。
8. 回到项目管理 → `解封`，确认它重新出现。

**预期**

- 每个项目只看得到自己的任务 / 日志 / 阻碍；「全部项目」= 所有**未归档**项目的并集 +
  未归属项目的数据。
- 切项目不搬数据、不重排、不丢记录（隔离是**视图作用域**，不是物理分区）。
- 归档后：切换条消失、统计不计入；管理面板里仍能看到并可解封。
- 归档「当前正在看的项目」时，自动退回「全部项目」，页面不会突然空白。

**不通过信号**

- 切项目后旧项目的任务仍显示（隔离失效，P0）；
- 归档后统计里仍然算进该项目的专注时长；
- 归档当前项目后页面变成全空、且没有任何提示（用户会以为数据没了）。

## 场景 2 · 子任务与主任务进度

**目标**：子任务勾选驱动主任务状态，两个方向都一致。

**步骤**

1. 建任务 `重构 TaskList`，点行尾 `☰` 展开子任务。
2. 添加三条子任务：`拆出子组件`、`抽出 hook`、`补回归用例`。
3. 勾第 1、2 条 → 看主任务复选框状态与「子任务 2/3」。
4. 勾第 3 条 → 主任务应自动完成。
5. 取消勾选第 1 条 → 主任务应退回未完成。
6. 点 `全选 / 全不选` 两次。

**预期**

- 主任务行显示 `子任务 n/m` 和一条细进度条。
- 勾完最后一条 → 主任务自动打勾、概览「今日打卡」+1。
- 取消任意一条 → 主任务取消完成，`completedAt` 被清掉（统计不会多算）。
- 全选 → 全部完成且主任务完成；再点 → 全部取消且主任务未完成。

**不通过信号**

- 子任务全勾了但主任务还是未完成（`syncParent` 失效）；
- 取消子任务后主任务仍显示完成，且今日完成数没有回落；
- 展开/收起后子任务列表错位或丢失。

## 场景 3 · 会话一键绑定任务（采集自动归属）

**目标**：绑定之后，该会话采集的日志自动带上项目和任务。

**步骤**

1. 切到某个项目（例如「插件开发」）。
2. 任务行点 `⇄`（绑定当前会话）。若提示「拿不到当前会话 id」，先在日志卡「手动新增记录」一次再试。
3. 打开调试面板 → 点 `模拟代码消息`。
4. 回到日志卡，看新记录的「↳ 任务名」角标与项目列。
5. 再点日志行右侧的 `任务…` 下拉，改绑到另一个任务。

**预期**

- 绑定成功后提示「当前会话已绑定「xxx」」，任务行出现「已绑定当前会话」。
- 之后采集的日志自动带 `taskId`，行内显示 `↳ 任务名`，并归属任务所在项目。
- 手动改绑只影响这一条，同时把当前会话也绑到新任务。
- 刷新页面后绑定仍然有效（存在 `meta.sessionTaskMap`）。

**不通过信号**

- 绑定后新日志没有任务角标；
- 刷新后绑定丢失；
- 改绑一条日志导致整段历史都改绑（过度同步）。

## 场景 4 · 斜杠命令（三条）

> 实现说明：当前 DSH 未公开命令注册 API，所以命令走三条通道 —— ① 宿主若提供
> `commands.register` 就注册；② 聊天里以 `/board-` 开头的**用户消息**被采集链路
> 消费；③ window 桥 `sorchron:command`。三条走同一个 `execute()`，行为一致。

**步骤**

1. 调试面板的输入框依次执行（点「触发命令」）：
   - `/board-todo 写一份自测清单`
   - `/board-bind 写一份自测清单`
   - `/board-report`
2. 每次执行后看日志卡上方的结果提示、任务清单、日志列表。
3. 在 DSH 聊天框直接输入 `/board-todo 验证聊天触发`（若宿主会把用户消息转发给采集链路）。

**预期**

- `/board-todo`：任务清单新增一条，落在当前项目，日志里多一条 `/board-todo` 里程碑；
- `/board-bind`：会话绑定到匹配的任务；匹配不到会列出前 5 个候选；
- `/board-report`：生成今日简报（专注 / 任务 / 会话 / 构成 / 阻碍 / 项目 / 连续天数），
  自动尝试复制到剪贴板，并写一条里程碑日志。**不会**往 DSH 会话里插消息。
- 三条命令的参数为空 / 非法时给出用法提示，而不是静默失败。

**不通过信号**

- 命令被当成普通消息记录了两遍（拦截失效）；
- `/board-report` 报错或出现 `NaN` / `undefined`；
- 命令执行后页面白屏。

## 场景 5 · 会话上下文观测（统计 + 膨胀预警）

**目标**：只统计摘要、不读原文；条数涨上去能预警。

**步骤**

1. 打开学习数据看板 → `会话上下文观测`。
2. 调试面板选 `45 条（触发预警）` → 点 `模拟会话上下文`，等约 6 秒。
3. 再选 `90 条（触发红线）` 执行一次。
4. 点 `生成精简摘要（保留 N 条）`，看剪贴板与下方摘要块。
5. 点 `采纳建议（写操作日志）`。

**预期**

- 面板显示：消息条数、估算 token、代码块数、报错数、构成占比条与图例。
- 45 条时等级变「注意膨胀」（黄），90 条时变「接近溢出」（红）并自动展开面板。
- 摘要块里只有**任务标题级别的信息**，没有任何源码或消息正文。
- 采纳建议后：写一条里程碑日志，提示「未修改 DSH 会话」，`上次采纳：刚刚`。

**不通过信号**

- 面板里出现整段源码（隐私边界被破坏，P0）；
- 条数涨到 90 但等级仍是「健康」；
- 点采纳后 DSH 原生会话内容被改动（越界，P0）。

## 场景 6 · 开发阻碍自动沉淀

**目标**：排错类日志自动变成「问题」，反复出现只累加次数，方案可补。

**步骤**

1. 确保监听开启，调试面板连点 3 次 `模拟报错消息`（间隔 1 秒以上）。
2. 打开 `开发阻碍记录`，看列表。
3. 点 `补充方案`，输入 `加空值判断，并在 TaskList 里兜底 []` → 保存。
4. 切到 `已解决` 标签，再切回 `未解决`。
5. 再模拟一次同样的报错。

**预期**

- 第一次生成一条记录（`hits: 1`），后两次**不新增行**，而是 `×3`。
- 保存方案后：记录变「已解决」、显示 `✓ 方案`、`平均定位` 出现数值。
- 再模拟同类报错时：因为该记录 7 天内已存在，会继续累加 `hits`（不会重新开一条未解决）。
- 面板顶部：`本周 N 次 · 未解决 M`。

**不通过信号**

- 每点一次就多一行（相似度合并失效）；
- 填了方案后 `hits` 被重置；
- 删除记录没有二次确认（P1）。

## 场景 7 · 项目快照导出 / 导入

**目标**：把一个项目的上下文打包，导入后在新项目里延续。

**步骤**

1. 切到「插件开发」→ 项目条 `导出项目快照`。
2. 打开下载的 `sorchron-snapshot-*.json`，确认只有摘要，没有源码。
3. 项目条 `导入快照` → 选这个文件。
4. 看切换条与任务清单。

**预期**

- 生成一个新项目（重名时自动加 `(2)` 后缀），并自动切过去。
- 任务、阻碍记录（含方案）都在；阻碍的任务引用指向**新 id** 的任务。
- 提示「已从快照创建「xxx」：N 个任务 / M 条阻碍」。
- 导入不会改已有项目的任何数据。

**不通过信号**

- 导入后阻碍记录的任务关联丢失；
- 新项目与旧项目 id 冲突，导致列表出现重复条目；
- 导入坏文件时页面报错而不是给提示。

## 场景 8 · 番茄钟休息与刷新续跑

**目标**：专注结束自动进入休息；休息不计入专注；刷新不丢状态。

**步骤**

1. 计时器里把 `自动休息` 勾上（默认开），时长设 10 分钟（测试用最短）。
2. 绑定一个任务 → `Start`。
3. 等这一轮结束（或把系统时间往前拨 10 分钟）。
4. 观察：阶段标签变「短休」、倒计时开始、提示条出现。
5. 休息中点 `Pause`，刷新页面，确认阶段仍是短休且剩余时间连续。
6. 点 `跳过休息`。
7. 连续做完 4 轮（可用 10 分钟 + 跳过休息加速），确认第 4 轮后是 **长休**。

**预期**

- 专注结束：任务 `focusedMinutes` 增加、生成一条 focus 日志、进入休息并自动倒计时。
- **休息期间不产生 focus 日志**，统计里的专注时长不增加。
- 刷新后：阶段、剩余秒数、绑定任务都保留（`phase` 持久化）。
- 第 4 轮后进入长休（默认 15 分钟），提示文案明确写「长休」。
- 关掉 `自动休息` 后：专注结束直接停在专注阶段，不进入休息。

**不通过信号**

- 休息被打成 focus 日志（专注时长虚高，P0）；
- 刷新后回到专注 25:00（阶段没持久化）；
- 跳过休息后 `roundInCycle` 没复位，导致长休永远不触发。

## 场景 9 · 截止日期与逾期率

**步骤**

1. 编辑一个任务，把截止日期设为**昨天**。
2. 观察任务行、筛选条、统计面板。
3. 勾选该任务完成，再看统计。

**预期**

- 任务行「截止」变成 `已逾期 x 天前` 并标红；筛选条的「逾期」计数 +1。
- 统计面板 `本周任务完成率` 下方显示 `逾期 1 / 设了截止的 N 个（xx%）`。
- 完成后不再计入逾期（逾期率的分母也同步减少）。
- 截止日期设为当天 → 当天结束前**不算**逾期（内部按 23:59:59 处理）。

**不通过信号**

- 设成今天一早就显示逾期；
- 完成后逾期数没有回落；
- 分母用了「全部任务」导致比率失真（应为「设了截止的未完成任务」）。

---

# 二、边界异常用例

## 场景 10 · 导入损坏 JSON

**步骤**

1. `bad.json` 内容 `{"kind":"something-else"}` → 导入。
2. `notjson.txt` 内容 `not json` → 导入。
3. 残缺备份 `{"kind":"sorchron-study-board-backup","version":2,"tasks":[{"id":"x","title":"ok"}],"logs":[]}` → 导入。

**预期**

- 前两个：明确提示「不是…备份文件（kind 不匹配）」/「文件不是合法的 JSON」，
  **现有数据一条都不变**。
- 第三个：可以导入（向后兼容），缺少的字段补默认值，任务列表出现 1 条。
- 控制台只有 `warn`，没有红色 `error`。

**不通过信号**

- 导入坏文件后数据被清空（P0）；
- 页面白屏；
- 提示文案是 `undefined`。

## 场景 11 · 连续快速消息（防抖 + 去重）

**步骤**

1. 调试面板选 `90 条（触发红线）`，点 `模拟会话上下文`（内部 120ms 一条）。
2. 观察日志条数增长与控制台。
3. 立刻再点一次同样的按钮（内容完全相同）。

**预期**

- 第一轮：日志条数远小于 90（防抖合并 + 业务合并），且没有重复的 `×N` 行爆炸。
- 第二轮：绝大部分被**内容哈希**挡掉（5 分钟窗口），控制台出现
  `duplicate suppressed (N total)`，日志几乎不增长。
- 采集状态灯保持绿色，`去重 N` 出现在状态文案里。

**不通过信号**

- 90 条消息生成 90 条日志（防抖/合并失效）；
- 同一批消息第二次投递又生成一整批（哈希去重失效）；
- 状态灯变红（说明有回调抛错）。

## 场景 12 · 关闭面板 / 长时间挂起（监听器销毁）

**步骤**

1. 打开日志卡，确认状态 `监听开启`。
2. 切到别的导航页（让看板卸载），等 10 秒。
3. 控制台执行：
   ```js
   window.dispatchEvent(new CustomEvent('sorchron:harness-event', {
     detail: { type: 'bridge/message', payload: { text: '卸载后不该被采集' } },
   }))
   ```
4. 回到看板，看日志。

**预期**

- 卸载期间投递的事件**没有被记录**（监听已摘）。
- 控制台能看到 `listener detached`。
- 回到看板后监听重新绑定，新投递的事件正常入库；且**只有一份**（不会因为重复挂载
  导致一条消息记两次）。

**不通过信号**

- 卸载后事件仍被记录（监听泄漏，P1）；
- 回到看板后同一条消息出现两次（旧实例没销毁）；
- 反复进出页面后日志翻倍。

## 场景 13 · localStorage 爆满 + 超长日志截断

**步骤**

1. 控制台灌数据直到写满：
   ```js
   let i = 0
   try { for (;;) { localStorage.setItem('__filler_' + i, 'x'.repeat(512 * 1024)); i += 1 } }
   catch (e) { console.log('filled at', i, e.name) }
   ```
2. 回到看板，新建一个任务、手动新增一条日志。
3. 打开 `数据备份`，看容量条。
4. 清理：删除 `__filler_*` 后再试一次写入。

**预期**

- 容量条变红并提示「空间告急 / 再写就可能失败」。
- 写入失败时出现角落提示「本地存储已满，本次修改没能保存」，**页面不崩**。
- 清理后写入恢复正常，数据一致。
- 代码块摘要始终不超过 300 字符的窗口用于提取特征，落库的 detail 不超过上限
  （`config.code.maxDetailChars`）。

**不通过信号**

- 写满后页面白屏或卡死；
- 失败没有任何提示（用户以为保存成功）；
- 清理后仍然写不进去（需要刷新才恢复可以接受，永久失败不行）。

## 场景 14 · 非法时长 / 负数 / 空消息

**步骤**

1. 计时器时长输入 `abc` 回车、`-5` 回车、`1e9` 回车。
2. 任务输入框只敲空格回车。
3. 调试面板把命令输入框清空后点「触发命令」。
4. 手动新增日志后把备注清空保存。

**预期**

- `abc`：恢复原值 + 提示「时长需要是 10–90 之间的整数」。
- `-5` → 10；`1e9` → 90，各给一次提示。
- 空格标题：不创建、不产生空行。
- 空命令：不执行、不写日志。
- 空备注：允许保存（备注本来就是可选的），不产生 `undefined` 文本。

**不通过信号**

- 出现 `NaN:NaN` 倒计时；
- 列表出现空标题行；
- 统计数字变成 `NaN`。

---

# 三、版本升级兼容用例

## 场景 15 · V2 → V3 无损加载

**步骤**

1. 手工写入一份 V2 形状的数据（`schemaVersion: 2`，任务没有 `subtasks` / `dueAt`，
   没有 `friction` / `meta` key）：

   ```js
   const K = 'dsh-otaku-study-board'
   localStorage.setItem(K + ':tasks', JSON.stringify({ schemaVersion: 2, data: [
     { id: 'v2-t1', title: 'V2 的任务', status: 'todo', done: false, pomodoros: 2,
       focusedMinutes: 50, estimateMinutes: 45, priority: 'important', createdAt: 1750000000000, updatedAt: 1750000000000 }
   ]}))
   localStorage.setItem(K + ':logs', JSON.stringify({ schemaVersion: 2, data: [
     { id: 'v2-l1', at: 1750000000000, kind: 'focus', sessionType: 'dev', title: '25 分钟专注',
       minutes: 25, source: 'manual', edited: false }
   ]}))
   localStorage.setItem(K + ':settings', JSON.stringify({ schemaVersion: 2, data: {
     autoCapture: true, lastDurationMinutes: 45, projectRules: [], monthlyGoal: { month: '', targetMinutes: 600, targetTasks: 10 }
   }}))
   localStorage.removeItem(K + ':friction'); localStorage.removeItem(K + ':meta')
   ```

2. 刷新页面。

**预期**

- 任务 / 日志 / 时长 / 优先级全部保留；设置里的 45 分钟生效。
- 新字段用默认值：没有子任务就不显示进度、没有截止就不显示逾期、当前项目 = 全部。
- 阻碍记录与 meta 为空但不报错。
- 页面不白屏，控制台无红色错误。
- **只浏览不操作时**，存储里仍是 `schemaVersion: 2`（读时补齐、不写回）。

**不通过信号**

- 任务或日志少了一半；
- 打开就白屏；
- 只是打开页面就把 V2 数据改写成 V3（违背「读时补齐」策略）。

## 场景 16 · V1 → V2 → V3 逐级升级

**步骤**

1. 写入 V1 的**裸数组**（无 `schemaVersion`）：

   ```js
   const K = 'dsh-otaku-study-board'
   localStorage.setItem(K + ':tasks', JSON.stringify([
     { id: 'v1-1', title: 'V1 遗留任务', status: 'todo', done: false, pomodoros: 3,
       createdAt: 1700000000000, updatedAt: 1700000000000 }
   ]))
   localStorage.setItem(K + ':logs', JSON.stringify([]))
   ```

2. 刷新 → 确认能读（V1 直接进 V3 的路径）。
3. 做一次修改（勾选任务），确认写回变成 `schemaVersion: 3`。
4. 再用场景 15 的 V2 数据覆盖一次，重复步骤 2–3。

**预期**

- 两条路径（V1 直达、V1→V2→V3）读出来的结果一致。
- 第一次修改后才升级版本号；升级后字段齐全（`subtasks` 可选、`dueAt` 可选）。
- `pomodoros: 3` 在缺少 `focusedMinutes` 时按 `3 × 25 = 75` 分钟展示。

**不通过信号**

- V1 裸数组读不出来（兼容分支失效）；
- 升级后旧字段（`pomodoros`）被删掉；
- 同一份数据两次加载结果不同（不确定性）。

---

# 四、稳定性验证

## 场景 17 · 长时间操作无红色报错

**步骤**

1. 打开控制台（不过滤），Console 面板只看 Error 级别。
2. 连续执行 5 分钟混合操作：切项目 10 次、开/关监听 5 次、Start/Pause/Reset 计时 10 次、
   导入导出各 3 次、模拟报错 10 次、模拟上下文 2 轮。
3. 观察首屏与交互是否卡顿。

**预期**

- 控制台**没有红色 error**（`SorchronBoard V3:` 的 warn 可以有，那是可恢复问题）。
- 内存不持续上涨（任务管理器里标签页内存趋于平稳）。
- 所有交互仍在 100ms 内响应。

**不通过信号**

- 出现 `Maximum update depth exceeded`（渲染循环）；
- 出现未捕获的 Promise rejection；
- 操作越来越卡（监听器或定时器累积）。

## 场景 18 · 反复导入导出双向一致

**步骤**

1. 记录当前：任务数 / 日志数 / 阻碍数 / 月度目标 / 当前项目。
2. 导出全量 → 清空全部数据 → 导入刚才的文件（合并模式）。
3. 再导出一次，用文本 diff 比较两份 JSON（忽略 `exportedAt`）。
4. 重复上面流程 3 次。

**预期**

- 每一轮恢复后的数量与第一次记录一致。
- 两次导出的 JSON 只有 `exportedAt` 不同（顺序与字段稳定）。
- 计时器不参与导入导出（`timer` 不在备份里），导入后计时状态保持本机原样。

**不通过信号**

- 每轮数量递减（合并把数据吃掉）；
- diff 显示字段顺序或内容每次都在变；
- 导入后 `settings.activeProjectId` 指向不存在的项目（应自动退回「全部」）。

---

# 附 A · 调试 & 自测面板速查

位置：学习数据看板底部 → **调试 & 自测**（默认收起）。

| 控件 | 作用 | 对应场景 |
| --- | --- | --- |
| 状态灯 + 文字 | 采集状态（绿=监听开启 / 灰=关闭 / 红=异常） | 3、12 |
| 打印当前全部存储 | 控制台分组打印 7 个 key 的原始值 + 字符体积 | 1、15、16 |
| 模拟代码消息 | 走真实链路，命中「代码开发」，顺带验证代码摘要 | 3、5 |
| 模拟报错消息 | 走真实链路，命中「排错调试」，并沉淀阻碍记录 | 6 |
| 模拟项目切换 | 在「全部 / 各项目」之间循环，打印切换后的条数 | 1 |
| 触发命令 | 把输入框内容投到 `sorchron:command`，走真实命令逻辑 | 4 |
| 模拟会话上下文 | 连续投递 10/20/45/90 条消息（120ms 一条，避开限流） | 5、11 |
| 注入脏数据 | 往三个列表塞空标题 / NaN / 负数 / 非法类型 | 14 |
| 运行清理 | `sanitizeAll` 洗一遍，报告丢弃了几条 | 14 |
| 清空本地存储（开发专用） | 二次确认后清空 7 个 key | 1、10 |

模拟按钮**不绕过任何环节**：监听关闭时点它不会有任何反应 —— 这本身是场景 12 的验证点。

## 控制台速查

```js
// 看板日志前缀
SorchronBoard V3:

// 手动投一条采集事件（等价于调试面板的模拟按钮）
window.dispatchEvent(new CustomEvent('sorchron:harness-event', {
  detail: { type: 'bridge/message', payload: { text: '修复了 useTimer 的报错' } },
}))

// 手动跑一条斜杠命令（等价于调试面板的「触发命令」）
window.dispatchEvent(new CustomEvent('sorchron:command', {
  detail: { text: '/board-report' },
}))
```

# 附 B · 自动化自检覆盖了什么

| 脚本 | 覆盖范围 | 项数 |
| --- | --- | --- |
| `register-check.mjs` | `__ModuleLoader__` 交接、模块名、`inject`、`main` 面板、`sidebar.panellist` 行、id 对齐、样式注入 | 13 |
| `smoke.ts` [1]–[3] | 事件归一化与六类分类、聚合口径、备份往返 | 42 |
| `smoke.ts` [5] | 信封 / V1 兼容、逐字段兜底、计时残留、数值夹取、输入解析 | 42 |
| `smoke.ts` [6] | 子任务进度、主任务一致性（双向）、批量勾选 | 12 |
| `smoke.ts` [7] | 内容哈希去重窗口、相似度阈值 | 6 |
| `smoke.ts` [8] | 上下文统计、token 估算、精简计划 | 12 |
| `smoke.ts` [9] | 阻碍识别、相似合并、解决耗时、周统计 | 9 |
| `smoke.ts` [10] | 项目隔离（任务 / 日志 / 阻碍）、归档排除、排行、模板 | 13 |
| `smoke.ts` [11] | 快照生成、序列化往返、导入重编号与引用映射 | 12 |
| `smoke.ts` [12] | 增量导出范围、冲突预览、合并 / 覆盖语义 | 11 |
| `smoke.ts` [13] | 斜杠命令解析（大小写、参数、非法输入） | 7 |
| `smoke.ts` [14] | V3 schema：版本号、休息阶段、子任务一致性、meta 清洗 | 9 |

合计 **174** 条逻辑断言 + **13** 条挂载断言 = **187 项**。

# 附 C · 交付前自查表

每次改动后逐条打勾：

- [ ] `tsc --noEmit` 0 错误
- [ ] `register-check.mjs` 13/13
- [ ] `smoke.ts` 174/174
- [ ] 没有未捕获的异步风险（`void promise` 都有 `catch`，事件回调都有 try-catch）
- [ ] V1 / V2 裸数据仍有兼容路径（`unwrapEnvelope` + `coerce*`），且「打开不写回」
- [ ] 所有事件监听器在卸载时解绑，内容去重窗口被清空
- [ ] 所有高危操作都有二次确认（清空、覆盖导入、删除任务 / 日志 / 阻碍 / 项目、批量删除）
- [ ] 斜杠命令三条都能从调试面板触发
- [ ] 项目隔离在五个卡片上都生效（任务 / 日志 / 阻碍 / 统计 / 概览）
- [ ] 空状态（无任务 / 无日志 / 无项目 / 无阻碍）都看过一遍
- [ ] 控制台没有红色 error

---

# 附 D · Phase 5.2 自动化（统一工作台）

这一阶段的产品形态变了（只剩一个工作台），但**存储格式、Actions、V3 兼容逻辑一行未改**。
自动化分成四层，交付前必须全绿：

```bash
# 1. 静态与链路
npx tsc --noEmit                                              # 0 错误
ESBUILD_BINARY_PATH="$TEMP/esb.exe" node scripts/build.mjs    # lib/index.js + lib/client.js
node scripts/register-check.mjs                               # 13 项

# 2. 逻辑
npx esbuild scripts/smoke.ts --bundle --platform=node --format=cjs \
  --outfile=smoke.cjs && node smoke.cjs                       # 415 项

# 3. 组件（jsdom）
npx esbuild scripts/ui/components.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --outfile=scripts/ui/.build/ui.cjs \
  && node scripts/ui/.build/ui.cjs                            # 46 项
npx esbuild scripts/ui/workbench.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --outfile=scripts/ui/.build/wb.cjs \
  && node scripts/ui/.build/wb.cjs                            # 25 项（统一浮层 / 展开 / 写回）

# 4. 真实 Chromium（不是 DSH 宿主）
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
  --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/workbench-browser.test.mjs                    # 26 项
node scripts/ui/workbench-shot.mjs                            # 30 张截图 + 溢出检查
SORCHRON_HARNESS_DIR="$TEMP/sorchron-wb" \
  SORCHRON_CONTRAST_OUT=reports/wb-contrast.json \
  node scripts/ui/glass-contrast.mjs                          # 32 个采样点
```

合计 **599 条断言** + 30 张截图 + 32 个对比度采样点。

**未验证**：真实 DSH 宿主内的渲染、主题切换、滚动容器与快捷键冲突。本阶段约束禁止启动 DSH，
因此宿主侧一律标记为「未验证」，不以独立 Chromium 的结果代替。

## 5.2 需要人工确认的三件事

1. 顶部工具栏**没有**「经典工具」「经典工作台」任何字样；`#classic` 不再打开旧界面。
2. 「功能迁移计划」抽屉里能查到每一项未迁移能力的去向，且**没有**任何一项被假装完成。
3. 新建任务（弹层）→ 立刻刷新页面，任务仍在（写入不依赖组件是否还挂着）。

---

# 附 E · Phase 5.3 自动化（设置 · 数据）

数据管理新增两套测试，全部复用现有备份格式与事务，不引入新协议：

```bash
# jsdom：导出准备 / 导入预览 / 合并 / 覆盖 / 旧版本 / 坏记录 / 回滚 / 清空
npx esbuild scripts/ui/data.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --outfile=scripts/ui/.build/data.cjs \
  && node scripts/ui/.build/data.cjs                            # 28 项

# Chromium：真实文件选择 + 真实下载 + 刷新持久化 + 720 布局 + 清空
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
  --format=iife --jsx=automatic --loader:.css=text \
  --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/data-browser.test.mjs                           # 31 项
```

合计新增 **59 条断言**，全套自动化 **658 项**。

## 5.3 需要人工确认的四件事

1. 顶部「数据」按钮进入设置页；页面里没有经典入口、没有第二套工作台。
2. 选一个 `.json` 备份：预览里能看到文件名、大小、Schema 版本、10 类条数与冲突数；
   确认前刷新页面，数据不应变化（预览不写库）。
3. 覆盖导入必须先勾选「我了解本地数据将被替换」，否则按钮不可点；
   点「先导出当前数据」应先落一份全量 JSON。
4. 清空同样是两步：勾选后才可点「确认清空」；清空后刷新，所有实体归零。

**未验证**：真实 DSH 宿主内的文件选择与下载（按约束未启动 DSH）。

---

# 附 F · Phase 5.4 自动化（历史与热力图）

```bash
# 纯统计（无 DOM）：0/1/7/30/365 连续、断档、跨月、跨年、闰年、重复日志、删除、上限回退
npx esbuild scripts/ui/activity.test.ts --bundle --platform=node --format=cjs \
  --outfile=scripts/ui/.build/activity.cjs && node scripts/ui/.build/activity.cjs   # 37 项

# jsdom：365 格渲染、范围切换、tooltip、点击/键盘详情、空状态、分页
npx esbuild scripts/ui/history.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --outfile=scripts/ui/.build/history.cjs \
  && node scripts/ui/.build/history.cjs                                            # 16 项

# Chromium：真实悬停 / 边缘夹取 / 12px 点击 / 键盘漫游 / 720 滚动 / 深色 / reduced-motion
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
  --format=iife --jsx=automatic --loader:.css=text \
  --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/history-browser.test.mjs                                           # 28 项
```

新增 **81 条断言**，全套自动化 **739 项**。

## 5.4 需要人工确认的五件事

1. 历史页显示 365 天热力图；切 30 / 90 / 365 天时，格子数与活跃天数分母同步变化。
2. 悬停任意格子出现 tooltip（日期 / 等级 / 完成 / 专注 / 活动）；最左、最右列不超出屏幕。
3. Tab 进入热力图后，方向键移动、Enter 打开当天详情、Esc 关闭且焦点回到原格。
4. 打开某一天：专注分钟、完成任务、活动事件必须与当天真实数据一致；没有活动时显示空状态。
5. 720px：热力图在自己的容器里横向滚动，页面本身不横向溢出。

**未验证**：真实 DSH 宿主内的滚动容器、触摸设备长按/点击行为（按约束未启动 DSH）。

---

# 附 G · Phase 5.5 自动化（Focus & Session）

计时器与数据链路分成三层测：**纯状态机**（可控时钟，不 sleep）、**jsdom 交互**、
**真实 Chromium**（真实 tick / 刷新 / 触屏 / 三档布局 / 视图联动）。

```bash
# 1. 纯状态机 + 数据链路（无 DOM，96 项）
npx esbuild scripts/ui/focus.test.ts --bundle --platform=node --format=cjs \
  --outfile=scripts/ui/.build/focus.cjs && node scripts/ui/.build/focus.cjs

# 2. jsdom 交互（63 项）：六态、绑定/解绑、快速连点、刷新恢复、页面切换、休息、采集卡、深色
npx esbuild scripts/ui/focus-ui.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --loader:.css=text --outfile=scripts/ui/.build/focus-ui.cjs \
  && node scripts/ui/.build/focus-ui.cjs

# 3. Chromium（61 项）：真实倒计时、布局稳定、刷新、三段宽度、深色、键盘、触屏、
#    Dashboard→历史→热力图 联动、window 桥采集、reduced-motion
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
  --format=iife --jsx=automatic --loader:.css=text \
  --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/focus-browser.test.mjs
```

新增 **220 条断言**，全套自动化 **960 项**（含此前 740 项全部保留）。

## 5.5 需要人工确认的六件事

1. Dashboard 的「专注」面板默认显示 `25:00` 与「开始专注」；点开始后数字每秒走，
   按钮变成「暂停 / 结束并记录」，**别的元素不随秒数抖动**。
2. 点「暂停」→「继续」→「结束并记录」：结束提示写的是**实际**专注分钟
   （例如 18 分钟，而不是目标 25 分钟）。
3. 点任务行展开面板，绑定一个任务；结束后任务行的「已专注」增加同样的分钟数。
4. 计时中刷新页面：状态、剩余时间、绑定的任务都还在；已完成的轮次不会因刷新重复记账。
5. 设置页出现「会话采集」卡：能看到监听状态；关闭后状态立刻变「已关闭」。
6. 完成后点「进入休息」：倒计时变成短休/长休，休息期间「已专注」不增长，
   结束后不会多出专注记录。

**未验证**：真实 DSH 宿主内的事件通道（本阶段按约束未启动 DSH，采集只验证到
window 桥与宿主事件的绑定探测）、多标签页同时计时的同步行为。

---

# 附 H · Phase 5.5.1 自动化（结算事务与恢复）

结算从「四次独立写盘」改成「一次事务写 4 键」，因此测试要专门盯**失败注入**：

```bash
# 1. 纯逻辑 + 假存储（48 项）：正常 / 四个键各自失败 / 重试 / 幂等 / 并发 / 修复 / 一致性
npx esbuild scripts/ui/settlement.test.ts --bundle --platform=node --format=cjs \
  --outfile=scripts/ui/.build/settlement.cjs && node scripts/ui/.build/settlement.cjs

# 2. jsdom（37 项）：按 key 注入 QuotaExceededError，验证「未保存 → 重试 / 刷新补写 / 放弃」
npx esbuild scripts/ui/recovery-ui.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --loader:.css=text \
  --outfile=scripts/ui/.build/recovery-ui.cjs && node scripts/ui/.build/recovery-ui.cjs

# 3. 真实 Chromium 双标签（24 项）：同一 profile 开多个标签页，先后结束同一轮
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
  --format=iife --jsx=automatic --loader:.css=text \
  --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/focus-multi-tab.test.mjs
```

`focus-browser.test.mjs` 也追加了 10 项：用 `Page.addScriptToEvaluateOnNewDocument` 在真实浏览器里
让 `:daily` 的写入抛 `QuotaExceededError`，验证事务回滚、界面「未保存」、刷新后自动补写。

新增 **120 条断言**，全套自动化 **1080 项**。
（勘误：此处曾写 119，是 §7 漏算了 `focus-browser` 里 +1 的补充断言；逐套件相加 = 1080。）

---

# 附 I · Phase 5.5.2 自动化（结算最终一致性与恢复闭环）

这一阶段只加「失败之后怎么办」的用例：**日志已经写进去、其余三个实体没写**这种现场，
以及「判断不了就别猜」的保守路径。

```bash
# 1. 纯逻辑 + 假存储（117 项）：S1–S10（原 48 条全部保留）+ T1–T12（60）+ D1–D9（9）
#    T1 用 createWindowStore(from, to) 让「写 + 回滚」一起失败，制造真实的「日志在、其余缺失」
npx esbuild scripts/ui/settlement.test.ts --bundle --platform=node --format=cjs \
  --outfile=scripts/ui/.build/settlement.cjs && node scripts/ui/.build/settlement.cjs

# 2. jsdom（52 项）：V1–V7 原有 + V8 部分写入自动补齐 / V9 无基线不猜 / V10 基线入 pending
npx esbuild scripts/ui/recovery-ui.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --loader:.css=text \
  --outfile=scripts/ui/.build/recovery-ui.cjs && node scripts/ui/.build/recovery-ui.cjs

# 3. 真实 Chromium 双标签（32 项）：新增 §5「两标签页同时恢复同一笔部分写入」
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser \
  --format=iife --jsx=automatic --loader:.css=text \
  --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/focus-multi-tab.test.mjs
```

`?timer=partial` 种子会把存储做成「日志已写、Daily/任务/时间轴未结算」，并在 timer 里留下
**带基线**的 `pendingResult`。注意：基线取的是写入前存储里的**真实值**（不是写死的数字），
否则在已有历史数据上重放时基线会低于当前值，`planRepair` 会判「已算过」而不再补写 ——
那不是产品 bug，是种子不自洽。

新增 **92 条**（settlement +69 / recovery-ui +15 / multi-tab +8），全套 **1172 项**
（23 个套件：13 + 415 + 46 + 25 + 28 + 37 + 16 + 96 + 63 + 117 + 52 + 26 + 31 + 28 + 72 + 32 + 21 + 12 + 15 + 13 + 6 + 8）。

## 5.5.2 需要人工确认的三件事

1. 结束一轮专注时让 `:daily` 写入抛错 → 界面「本轮完成」旁出现**未保存**，且**没有「开始下一轮」**，
   只有「重试写入 / 放弃这一笔」。
2. 刷新页面 → 数据自动补齐，`pending` 清空，界面不再显示「未保存」。
3. 打开两个标签页同时恢复同一笔（刷新同一个页面两次）→ 今日专注分钟只加一次，日志只有一条。

**未验证**：DSH 宿主内的结算时序（本阶段按约束未启动宿主，全部在独立 Chromium 完成）；
跨不同 round 的并发丢一笔无法检测（localStorage 无锁的硬上限，已写进 `lib/settlement.ts` 头注释）。

## 5.5.1 需要人工确认的四件事

1. 正常结束一轮：日志、日聚合、任务「已专注」、时间轴四处都更新，且没有「未保存」标记。
2. 手动改坏存储（例如把 `daily` 写成非法 JSON 后再结束一轮）：应显示「未保存 + 重试写入」，
   **不应**显示「本轮完成」却什么都没有；点重试仍能补上。
3. 开两个标签页，先后对同一轮点「结束并记录」：日志只多一条，日聚合只加一次，
   第二个标签页提示「这一轮已经记过了」。
4. 故意把同一条专注日志复制成两份（DevTools 改 localStorage）后刷新：应自动合并成一条，
   并提示「发现 N 条重复的专注记录，已合并并回退 X 分钟」。

**未验证**：真实 DSH 宿主内的存储配额行为与 `STORE_EVENT` 广播（按约束未启动 DSH）。

---

# 附 J · Phase 6 发布审计（未新增业务测试）

本阶段是发布审计与收尾，**没有为凑数新增测试**：§10 的 23 个套件、1172 项即当前全部基线
（`tsc` 0 / register 13 / smoke 415 / components 46 / workbench 25 / data 28 / activity 37 /
history 16 / focus 96 / focus-ui 63 / settlement 117 / recovery-ui 52 / workbench-browser 26 /
data-browser 31 / history-browser 28 / focus-browser 72 / focus-multi-tab 32 / layout 21 /
shell 12 / tasks 15 / button 13 / conflict 6 / v3-hover 8）。

唯一被改写的断言：`components.test.tsx` 的 **C32**。原来是「未迁移的计时器入口说明『尚未开放』
且不跳转」，即保护了 Phase 5.2 留下的「去专注 → 尚未开放」假按钮；Phase 6 删掉了那个按钮，
C32 改为断言「不再有『去专注』占位入口，且专注卡里能直接开始」。

另有三份一次性审计脚本（不进发布包、不参与回归）：

```bash
# 1. bundle 到底包含哪些源文件（用 esbuild metafile，输出 kept 列表）
npx esbuild src/client/index.tsx --bundle --platform=browser --format=cjs --jsx=automatic \
  --loader:.css=text --metafile="$TEMP/meta.json" --define:__OSB_CSS_TEXT__='""' \
  --outfile="$TEMP/probe.js" && node scripts/audit-bundle.mjs

# 2. board.css 里有多少类已经不在打包代码中（死 CSS 体积）
node scripts/audit-css.mjs

# 3. 部分写入后点「放弃这一笔」，存储里留下什么（真实 Chromium）
node scripts/audit-discard.mjs
```

第 3 个脚本就是 `FINAL-RELEASE-AUDIT.md` §D.1 的证据来源；结论已写进 `KNOWN-LIMITATIONS.md` A2。
