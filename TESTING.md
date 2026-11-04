# 测试 · Testing

没有测试框架：所有断言都是 `check(name, ok, detail)` 往数组里 push，非零退出码即失败。
测试分三层 —— 纯逻辑、jsdom、真实 Chromium —— 用 esbuild 现场打包后直接 `node` 跑。

> 基线（2026-11-04 实测）：`tsc` 0 错 · register 13 · smoke 415 · jsdom 608 · Chromium 290
> = **898 项断言 + 2 条自检**。数字会随代码变化，验收以「全绿」为准，不以数字为准。

---

## 0. 前置

- Node ≥ 20，`npm install`（依赖只有 React 类型、esbuild、jsdom、testing-library）。
- **Windows 路径注意**：如果仓库目录名含 `‑`（U+2011），esbuild 的 postinstall 会失败。
  用 `npm install --ignore-scripts`，或把目录名改成纯 ASCII。
- 若沙箱不允许直接执行 `node_modules` 里的二进制，把它拷出来并指定路径：

```bash
cp node_modules/@esbuild/win32-x64/esbuild.exe "$TEMP/esb.exe"
export ESBUILD_BINARY_PATH="$TEMP/esb.exe"
```

- 产物目录：`scripts/ui/.build/`（打包出来的 cjs，**不进仓库**，`.gitignore` 已忽略）。

---

## 1. 四条门禁（改完代码先跑这一组）

```bash
npx tsc --noEmit                      # 0 错误；strict 模式
node scripts/build.mjs                # → lib/index.js + lib/client.js（约 542 KB）
node scripts/register-check.mjs       # 13 项：bundle 清单 / slot 注册 / 样式注入 / 导航契约
npx esbuild scripts/smoke.ts --bundle --platform=node --format=cjs \
  --outfile=smoke.cjs && node smoke.cjs   # 415 项纯逻辑
```

`register-check` 查的是「装进宿主能不能被认出来」：`dsh.bundle.patch` 存在、`cordis.patch.yml`
只有一行 `insert`、`PANEL_ID` / `order` 没被改、客户端 bundle 里有 slot 注册与样式注入。

---

## 2. 分层与覆盖范围

### 2.1 纯逻辑（无 DOM）

| 套件 | 断言 | 覆盖什么 |
| --- | --- | --- |
| `smoke.ts` | 415 | 存储信封与洗数据、Actions 纯函数、日聚合、备份序列化、时间/哈希/校验工具 |
| `settlement.test.ts` | 181 | 结算事务（四实体校验、部分写入修复、回滚失败、重复收敛）、放弃清理的全部安全分支 |
| `focus.test.ts` | 96 | 状态机六态、时间戳计时、暂停/恢复/结束、跨午夜、幂等键 |
| `activity.test.ts` | 37 | 活跃分与五档阈值、去重优先级、连续天数、日历排版、DST / 闰年 |

### 2.2 jsdom（真实 React 组件 + 真实 localStorage）

| 套件 | 断言 | 覆盖什么 |
| --- | --- | --- |
| `recovery-ui.test.tsx` | 94 | 结算失败不谎报、重试、刷新补写、放弃的三种结局、重复记录自愈 |
| `focus-ui.test.tsx` | 63 | 专注卡交互、时长与任务绑定、休息流程、深浅色下可操作 |
| `components.test.tsx` | 46 | Dashboard 各卡片、统计格、空状态、勾选完成写回 |
| `data.test.tsx` | 28 | 导出准备、导入预览/合并/覆盖、坏记录跳过、写入失败回滚、清空事务 |
| `workbench.test.tsx` | 25 | 顶栏导航、项目作用域、任务页表单、抽屉与弹层互斥 |
| `dashboard-heat.test.tsx` | 22 | 首页 365 格与聚合逐日一致、tooltip 三项、与历史页同日一致、空数据不伪造 |
| `history.test.tsx` | 16 | 历史页 30/90/365 切换、统计同步、键盘漫游、空状态 |

### 2.3 Chromium（真浏览器，CDP 驱动）

| 套件 | 断言 | 覆盖什么 |
| --- | --- | --- |
| `focus-browser.test.mjs` | 76 | 真实倒计时、三档宽度、刷新恢复、采集联动、720 下长文案排版 |
| `focus-multi-tab.test.mjs` | 32 | 两个标签页共享 localStorage：同轮幂等、重复记录合并 |
| `data-browser.test.mjs` | 31 | 真实下载、真实文件选择、导入覆盖 |
| `history-browser.test.mjs` | 28 | 历史页真实 hover / 点击 / 滚动、深色色阶 |
| `workbench-browser.test.mjs` | 26 | 抽屉焦点环与滚动锁、刷新持久化、720 铺满 |
| `dashboard-heat-browser.test.mjs` | 22 | 首页热力图：三档宽度无溢出、悬停、点击开抽屉、深色 |
| `layout-browser.test.mjs` | 21 | 1440 / 1100 / 720 的栅格与越界元素 |
| `tasks-browser.test.mjs` | 15 | 任务页布局与行内编辑 |
| `button-browser.test.mjs` | 13 | 按钮系统（尺寸、层级、禁用态） |
| `shell-browser.test.mjs` | 12 | 整页入口、导航可达、无经典工作台残留 |
| `conflict-browser.test.mjs` | 6 | 跨标签写入冲突的提示与收敛 |
| `v3-hover.test.mjs` | 8 | 卡片 hover 不产生位移（防浮层被裁切） |

---

## 3. 怎么跑

### 3.1 单元 / jsdom

```bash
name=settlement            # 换成任意套件名（去掉 .test.tsx）
npx esbuild scripts/ui/$name.test.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --external:jsdom --loader:.css=text \
  --outfile=scripts/ui/.build/$name.cjs
node scripts/ui/.build/$name.cjs
```

> 纯 `.test.ts`（activity / focus / settlement）去掉 `--jsx=automatic` 即可，其余参数相同。
> **`--external:jsdom` 不能省**：jsdom 是运行时依赖，打进 bundle 会让 `node` 找不到模块。

### 3.2 Chromium

每个套件都从一份测试页启动，页面必须先打包到它约定的临时目录：

```bash
# 6 个套件共用这一份：workbench / focus / focus-multi-tab / history / data / dashboard-heat
mkdir -p "$TEMP/sorchron-wb"
npx esbuild scripts/ui/workbench-harness.tsx --bundle --platform=browser --format=iife \
  --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-wb/harness.js"
node scripts/ui/workbench-browser.test.mjs
```

其余套件各自一份 harness，目录名与套件名对应：

| 套件 | harness | 输出目录 |
| --- | --- | --- |
| `layout-browser` | `layout-harness.tsx` | `$TEMP/sorchron-layout/` |
| `shell-browser` | `shell-harness.tsx` | `$TEMP/sorchron-shell/` |
| `tasks-browser` | `tasks-harness.tsx` | `$TEMP/sorchron-tasks/` |
| `button-browser` | `button-harness.tsx` | `$TEMP/sorchron-button/` |
| `conflict-browser` | `conflict-harness.tsx` | `$TEMP/sorchron-conflict/` |
| `v3-hover` | `v3-hover-harness.tsx` | `$TEMP/sorchron-v3-hover/` |

这层需要本机装 Chrome（脚本里写死 `C:/Program Files/Google/Chrome/Application/chrome.exe`），
会自己起一个 `--headless=new` 实例并连 CDP，不需要手动开浏览器。

### 3.3 全跑一遍

```bash
for f in scripts/ui/*.test.ts scripts/ui/*.test.tsx; do
  n=$(basename "$f" | sed 's/\.test\.tsx\?$//')
  npx esbuild "$f" --bundle --platform=node --format=cjs --jsx=automatic \
    --external:jsdom --loader:.css=text --outfile="scripts/ui/.build/$n.cjs" >/dev/null || exit 1
  node "scripts/ui/.build/$n.cjs" || exit 1
done
```

Chromium 套件按 §3.2 逐个跑（全量约 6–8 分钟）。

---

## 4. 视觉与对比度（可选）

```bash
node scripts/ui/glass-shot.mjs heat        # 12 张截图 → reports/glass-heat-*.png
node scripts/ui/glass-contrast.mjs         # 112 个采样点的 WCAG 对比度，要求全部 ≥ 4.5:1
```

产物写在 `reports/`（`*.png` / `*.json` 已被 `.gitignore` 忽略）。这两个脚本是**手动**视觉回归，
不在 §1 的门禁里。

---

## 5. 尚未覆盖的关键场景

诚实列出，别把这些当成「已测过」：

1. **真实 DSH 宿主内**的渲染、采集通道、主题切换、抽屉层级 —— 宿主不开放渲染进程调试端口，
   本仓库的浏览器测试都是独立 Chromium + 真实 `board.css`，**不是宿主内截图**。
2. **真机 / 触屏**：720px 用设备模拟 + 鼠标事件，没有在真实手机上滑过热力图。
3. **多标签跨轮并发**：`localStorage` 无锁，A 结算第 1 轮、B 用旧快照结算第 2 轮时后写覆盖先写。
   测试只覆盖「同一轮幂等」与「重复记录可收敛」，覆盖不了这个丢写场景（架构上限）。
4. **超长历史**：>1 年数据、日志超过 400 条上限后只剩 `daily` 的日子，只验证了「专注次数记 1 次」
   的下限口径，没有真实大数据量的压力测试。
5. **时区跳变**：跨时区旅行后同日归属会按新时区重算，没有自动化用例。
6. **对比度**只采样深浅两套主题的 112 个点，不是全量 CSS 审计。

---

## 6. 人工验收清单（装到宿主后 10 分钟）

1. 装插件并重载窗口 → 左侧导航出现 **溯时学习工作台**（时钟图标），点开主区切换。
2. Dashboard：四个指标有数字、**学习活动**卡片有 365 格、悬停出 tooltip、点格子开当天详情。
3. 新建任务 → 勾选完成 → 「今日完成」+1，历史页当天格子变亮。
4. 专注 1 分钟（把时长调小后点结束）→ 确认日志、任务、热力图同步；切到「任务」再切回来，数字不变。
5. 数据 → 导出 JSON → 清空全部数据 → 导入刚导出的文件（合并）→ 数字回来。
6. 切宿主深色主题、把窗口拖到 720px 宽 → 无横向滚动条，抽屉铺满。
