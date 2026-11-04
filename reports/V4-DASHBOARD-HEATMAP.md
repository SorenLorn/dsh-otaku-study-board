# V4 第一版需求调整 · Dashboard 首页学习热力图

> 版本仍为 **4.0.0-rc.1（未升版）** · 独立 Chromium 截图，不是 DSH 宿主截图。
> 结论：**DONE** —— 首页无需跳转即可看到最近 365 天的 GitHub 风格热力图，
> 与历史页共用同一个组件与同一份聚合；空数据、深浅色、三档宽度都有测试与截图。

---

## 1. 落地方式（一句话）

把 `History.tsx` 里原本私有的 `Heatmap` 抽成 `v4/Heatmap.tsx`，Dashboard 与 History
各自调同一个 `buildActivityWindow({ range: 365 })` 渲染它 —— 所以「同一天两个页面颜色一样」
是**结构保证**，不是两边各算一遍再对答案。

页面位置：统计带 → 今日任务 / 专注 / 项目 → **学习活动（整行一条）** → 近 7 日专注 / 最近活动 / 知识与记忆。
放在核心操作区**下面**、次级卡片**上面**：一眼扫得到，又不挤占点选区域。
卡片高度约 180px（1440 宽），左边日历 740px、右边一列统计。

---

## 2. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/client/v4/Heatmap.tsx` | **新增**：从 History 抽出的 `ActivityHeatmap` + `HeatCell`（渲染、tooltip、键盘漫游、`is-today`）；新增 `legend: 'top' \| 'bottom'` 与 tooltip 的「专注次数」 |
| `src/client/v4/History.tsx` | 删掉本地 Heatmap/HeatCell（约 190 行），改为引用共用组件；DOM 与类名保持不变 |
| `src/client/v4/Dashboard.tsx` | 新增「学习活动」卡片：365 天窗口 + 日历 + 右列统计（最长连续 / 累计专注 / 完成任务），点击/Enter 打开当天详情 |
| `src/client/lib/activity.ts` | `ActivityDay` 增加 `focusCount`（daily-only 的老日子按下限记 1 次）；`activityCount` 复用同一变量，口径不变 |
| `src/client/style/board.css` | `--v4-heat-*` 从 `.v4-history` 移到 `.v4-heat`（变量跟着组件走）；新增 `.v4-dash-heat*` 整行带、右列统计、≤900px 单列、图例置底的 order |
| `scripts/ui/dashboard-heat.test.tsx` | **新增** 22 项 jsdom 断言 |
| `scripts/ui/dashboard-heat-browser.test.mjs` | **新增** 21 项真实 Chromium 断言 + 4 张截图 |
| `scripts/ui/workbench-harness.tsx` | 新增 `?demo=year` 种子（与历史页同一份 365 天数据），供首页截图/悬停验证 |
| `scripts/ui/components.test.tsx` | C18 的任务标题「一」与热力图星期标签撞名 → 查询限定到 `.v4-today-title` |
| `scripts/ui/workbench-browser.test.mjs` / `layout-browser.test.mjs` / `glass-shot.mjs` | 「越界元素」检测排除 `.v4-heat-scroll` 的后代（那是被裁剪的滚动内容，页面真溢出仍由 `scrollWidth > clientWidth` 判定） |
| `README.md` / `USER-GUIDE.md` / `ARCHITECTURE.md` | 同步首页能力描述、Heatmap.tsx 位置、「两页共用同一份聚合」的约定 |

**没有动**：数据层（`daily` / `logs` / `tasks` / `timeline` 结构）、备份格式、`BACKUP_KEYS`、
结算事务、Focus 状态机、`lib/activity.ts` 的去重与计分规则（只加了一个派生字段）。

---

## 3. 数据口径（为什么不会出现第二套统计）

- 唯一入口仍是 `buildActivityWindow`：`focusMinutes = max(daily, logs)`、`tasksDone` 实时计数、
  `score = focusMinutes + tasksDone × 25`、色阶 `[1, 25, 60, 120]`。首页与历史页传的是
  同一份 `daily` / `allTasks` / `allLogs`。
- 组件**不求和**：`ActivityHeatmap` 只接收 `calendar: ActivityCalendar` 渲染，页面里没有任何
  `reduce` 或 `filter(...).length` 参与颜色计算。
- tooltip 五项全部来自同一个 `ActivityDay`：完成任务 / 专注时长 / 专注次数 / 学习活动 / 强度。
  其中 **专注次数** 是本阶段新暴露的字段，语义是「有效 focus 日志条数」；当某天只剩 `daily`
  聚合（旧日志已超出 400 条上限被裁）时按**下限 1 次**记，不编造具体条数。
- 颜色档位与「活跃」判定沿用 5.4 定稿，**没有**为首页调一套新阈值。

一致性证据：jsdom `D6.1` 把两个页面的 365 个格子逐日对比（0 差异），`D6.2` 对比同一天的
`aria-label`（分钟 / 次数 / 任务数同源）。

---

## 4. 验收清单

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| 打开 Dashboard 无需跳转即可看到完整热力图 | jsdom `D1.1/D1.2`（在 `.v4-dashboard` 内）+ Chromium「首页直接渲染热力图卡片」 | ✅ |
| 最近 365 天日期排列正确 | jsdom `D1.3` 365 格、`D1.4` 12 个月标签 + 一/三/五；`lib/activity` 的 A 系列（闰年 / DST / 跨月） | ✅ |
| 每日颜色与实际聚合数据对应 | jsdom `D2.1` 365 天逐日比对 `level`（0 差异）；Chromium 各档计数 0/1/2/3/4 分布 | ✅ |
| 悬停/点击能查看当天详情 | jsdom `D3.1`（完成 / 时长 / 次数）、`D4.1`（点击开抽屉）、`D5.2`（Enter 开抽屉）；Chromium 真实鼠标悬停 + 点击 | ✅ |
| 浅色与深色主题正常 | Chromium 深色：格子里有色、与浅色档位不同、图例与格子同源；`glass-contrast` 112 个采样点全部 ≥4.5:1 | ✅ |
| 720 / 1100 / 1440 布局正常 | Chromium 三档：无横向溢出、卡片宽度 ≤ 视口、720 由卡片内部滚动 + 出现「左右滑动」提示 | ✅ |
| 空数据状态正常 | jsdom `D7.1–D7.5`：仍画满 365 格、全 0 档、给出「还没有活跃记录」、统计归零、不写任何记录 | ✅ |
| Dashboard 与 History 数据一致 | jsdom `D6.1/D6.2` 逐日逐格比对 | ✅ |
| 不新增重复统计逻辑、不破坏 History | 两页共用 `Heatmap.tsx` + `activity.ts`；history 16 项、history-browser 28 项全绿 | ✅ |

---

## 5. 测试结果

### 5.1 门禁

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **0 error** |
| `node scripts/build.mjs` | 成功，`lib/client.js` = **542,096 B**（较 536,092 B **+6,004 B / +1.12%**） |
| `node scripts/register-check.mjs` | **13 / 13** |
| `scripts/smoke.ts` | **415 / 415** |

### 5.2 jsdom（10 个套件，608 项）

| 套件 | 结果 |
| --- | --- |
| dashboard-heat（**新增**） | **22 / 22** |
| activity | 37 / 37 |
| history | 16 / 16 |
| components | 46 / 46 |
| workbench | 25 / 25 |
| focus | 96 / 96 |
| focus-ui | 63 / 63 |
| settlement | 181 / 181 |
| recovery-ui | 94 / 94 |
| data（备份 / 恢复） | 28 / 28 |

### 5.3 真实 Chromium（12 个套件，290 项）

| 套件 | 结果 |
| --- | --- |
| dashboard-heat-browser（**新增**，含 5 张截图） | **22 / 22** |
| workbench-browser | 26 / 26 |
| history-browser | 28 / 28 |
| focus-browser | 76 / 76 |
| focus-multi-tab | 32 / 32 |
| data-browser | 31 / 31 |
| layout-browser | 21 / 21 |
| shell-browser | 12 / 12 |
| tasks-browser | 15 / 15 |
| button-browser | 13 / 13 |
| conflict-browser | 6 / 6 |
| v3-hover | 8 / 8 |

### 5.4 对比度

`glass-contrast.mjs`：**112 个采样点全部 ≥ 4.5:1，0 违规**（含热力图图例）。

---

## 6. 尚未验证 / 已知边界

1. **DSH 宿主内的真实渲染：未验证。** 宿主进程没有渲染进程调试端口，抓页面必须重启宿主，
   这一步需要项目负责人决定（与 Phase 6 的验收状态一致）。本文截图全部来自**独立 Chromium**
   + 真实 `board.css` + 真实组件，不是宿主内截图。
2. **宿主深色 token 的最终观感**只做了模拟：测试用 `body[data-ds-dark-theme]` + 宿主 token 近似值。
   色值方向已验证（深色档位与浅色不同、无透明），但宿主的真实叠加色需重启后复核。
3. **真机触屏滑动**未验证（720px 用 Chromium 设备模拟 + 鼠标事件）；滚动容器用的是标准
   `overflow-x: auto`，移动端应可滑动，但没有真机证据。
4. **首页多渲染了 365 个按钮**：jsdom 与 Chromium 均未见明显卡顿，但没有做逐帧性能测量；
   如果以后首页再加卡片，建议把热力图格子降级为 `div` + roving tabindex（目前是原生 `button`，
   可键盘操作、可读屏）。
5. **`focusCount` 的下限语义**：老日子只剩 `daily` 时，tooltip 显示「专注次数：1 次」——
   实际可能发生过多次（日志被 400 条上限裁掉）。这是**下限**，不是精确值；没有据此做任何扣减或推断。
6. **日详情抽屉与热力图的小差异（沿用既有实现，未改）**：抽屉里的「专注时长」由 focus 日志求和，
   热力图取 `max(daily, logs)`。正常数据两者相同；只有 `daily` 被重建/日志被裁时会有差。
   本轮没有动 `DayDetail`（属于既有口径，不在本次布局调整范围内），如需统一另开阶段。

---

## 7. 截图（独立 Chromium，非 DSH 宿主）

| 文件 | 内容 |
| --- | --- |
| `reports/v4-dash-heat-1440-light.png` | 1440 · 浅色 · 全年数据（`?demo=year`） |
| `reports/v4-dash-heat-1440-dark.png` | 1440 · 深色 · 同一份数据 |
| `reports/v4-dash-heat-1100-light.png` | 1100 · 浅色 |
| `reports/v4-dash-heat-720-light.png` | 720 · 浅色 · 卡片内横向滚动 +「左右滑动查看全年」 |
| `reports/v4-dash-heat-720-dark.png` | 720 · 深色 · 同上（深色档位与裁切位置同时可见） |
| `reports/glass-heat-dashboard-light-1440.png` | 稀疏数据（只有最近一周）：空档占绝大多数，仍能读出节奏 |
| `reports/glass-heat-dashboard-dark-720.png` | 深色 + 720 的首屏（热力图在首屏下方，用于确认整页材质没被这条卡片带坏） |
