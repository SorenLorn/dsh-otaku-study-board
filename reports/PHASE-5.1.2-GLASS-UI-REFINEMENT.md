# Phase 5.1.2 — V4 Glass UI Visual Refinement

> 范围：只改 V4 的视觉材质（Dashboard / Tasks），不动 V3、数据层、Actions、Hooks、存储。
> 本文所有截图来自**独立 Chromium 视觉测试页**（真实组件 + 真实 `board.css`），
> **不是 DSH 宿主截图**。真实宿主验收见 §10，状态为「待完成」。

---

## 0. 结论摘要

| 项 | 结果 |
| --- | --- |
| 修改前最核心的问题 | 页面底色几乎和卡片同值，`backdrop-filter` 没有可折射的内容，玻璃退化成白卡 |
| 修改后 | 环境层（奶油底 + 玫瑰/淡紫光斑）→ L1 主玻璃 → L2 次级玻璃，三层材质分开 |
| 卡片/背景明度差（浅色） | 修改前 Δ≈6（243,235,237 vs 247,243,245）→ 修改后 Δ≈28（244,227,236 vs 225,198,212） |
| Dashboard 统计区 | 4 张小白卡 → 1 块玻璃 + 4 格发丝分隔 |
| 文字对比度 | 20 个采样点全部 ≥ 4.5:1（最低 4.75，最高 13.54） |
| 自动化 | tsc 0｜build 474,835 B｜smoke 415｜组件 43｜register 13｜布局 21｜Tasks 15｜Button 13｜V3 8｜对比度 20/20 |
| 真实 DSH 宿主 | **未验证**（本轮未启动/重启 DSH，宿主仍加载旧 bundle） |

---

## 1. 修改前的视觉问题（逐条给证据）

审计对象：`src/client/v4/{Dashboard,Tasks,ui}.tsx`、`src/client/style/board.css`
（Phase 4A 的 `.v4-page` / `.v4-glass-1` / `.v4-glass-2` 段落）。

### 1.1 为什么看起来仍像普通白卡

`.v4-page::before` 只在页面四周画了三团 `alpha 16%–26%` 的径向渐变，还套了
`filter: blur(28px)`；页面底色 `--v4-bg` 本身是 `#f7f2f4`。三团光斑被 28px 模糊
摊平后，页面等于一块接近纯白的平涂。玻璃的 `backdrop-filter` 在没有颜色变化
的背景上**不产生任何可见效果**，剩下的就只有"半透明白"。

实测（`glass-before-dashboard-light-1440.png`）：卡片内部 `rgb(243,235,237)`，
卡片间隙 `rgb(247,243,245)` —— 卡片比背景**还暗 6 级**，没有任何"浮起来"的读感。

### 1.2 透明度：L1 只在表单里出现

Phase 4A 把 `Card` 的 `default` 映射到 `v4-glass-2`（40% + blur 12px），
只有 `variant="feature"` 才用 L1（58% + blur 20px）。结果是 Dashboard 的
8 张卡里 **8 张全是 L2**，主面板和辅助面板同一材质。实测 `cards=8`，`.v4-glass-1` 数量为 0。

### 1.3 模糊层缺少背景内容

环境光只覆盖页面上半部分；卡片区域下方是纯底色。即使把 blur 拉到 40px，
卡片内部也只是"白色的不同白"。

### 1.4 边缘与反光：只有一条顶部内阴影

```css
box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, ...;
```

- 没有底部内侧反射，没有 1px 外环，没有斜向高光；
- 深色主题下这条 `rgba(255,255,255,.55)` 的**边框**反而变成硬白描边
  （见 `glass-before-tasks-dark-1440.png`），像"给黑卡描了白边"。

### 1.5 L1 与 L2 没有材质差异

两者只差透明度（58% / 40%）与 blur（20 / 12），边框、内阴影、投影完全同一套。
放在一起只像"同一张卡的两个明度"。

### 1.6 阴影缺少悬浮层次

`--v4-shadow-1: 0 1px 2px rgba(44,38,48,.05)` + 一条 `-24px` 扩散的大阴影。
没有近距接触阴影，卡片像贴纸而不是厚玻璃。

### 1.7 深色不是设计过的深色

V4 没有独立的深色材质 token，所有玻璃色都是字面量白色 `rgba(255,255,255,…)`；
深色下只靠宿主 `--dsw-*` 换文字色，面板仍是近黑平涂 + 白描边 —— 就是"简单反色"。

### 1.8 视觉单调

Dashboard 4 个统计卡 + 4 个内容卡，全部同尺寸、同材质、同圆角、同阴影；
统计数字（20px）和卡片标题（13px）之间没有层级差。

---

## 2. 设计方案：三层材质

### 2.1 结构

```
L0 环境   .v4-page 背景（底色 + 6 段渐变 + 极细颗粒）
L1 主玻璃  .v4-glass-1   主面板 / 统计带 / 表单
L2 次级   .v4-glass-2   辅助面板（最近活动、项目概览）
嵌入面     --v4-inset-* 输入框 / 分段控件 / 项目条：不叠 backdrop-filter
```

### 2.2 Token（浅色 → 深色是另一套值，不是反色）

| Token | 浅色 | 深色 |
| --- | --- | --- |
| `--v4-bg-base` | `#eae1e3` | `#17151b` |
| `--v4-env-rose` | `rgba(219,158,182,.54)` | `rgba(126,68,90,.40)` |
| `--v4-env-violet` | `rgba(176,164,222,.46)` | `rgba(92,76,142,.42)` |
| `--v4-glass-1-fill` | `rgba(255,253,252,.54)` + `color-mix(surface 54%)` | `rgba(47,43,59,.64)` |
| `--v4-glass-1-hi` | `rgba(255,255,255,.24)` | `rgba(255,255,255,.12)` |
| `--v4-glass-1-rim` | `rgba(255,255,255,.80)` | `rgba(255,255,255,.15)` |
| `--v4-glass-1-ring` | `rgba(120,88,110,.055)` | `rgba(0,0,0,.45)` |
| `--v4-glass-2-fill` | `rgba(255,253,252,.44)` | `rgba(32,29,40,.52)` |
| `--v4-hairline` | `rgba(120,88,110,.10)` | `rgba(255,255,255,.10)` |
| `--v4-inset-fill` | `color-mix(surface 38%)` | `rgba(255,255,255,.07)` |
| `--v4-blur-1 / 2` | `24px saturate(1.35)` / `14px saturate(1.22)` | 同左 |
| `--v4-text-1/2/3` | `#2c2630` / `#5c5560` / `#6a6371` | 宿主 `#ebeef2` / `#b6b4be` / `#a8a6b0` |

所有 `color-mix()` 之前都有一条字面量声明；不支持 `color-mix` 的引擎拿到近似值。

### 2.3 L1 主玻璃

```css
background-color: var(--v4-glass-1-fill);
background-image:
  radial-gradient(120% 72% at 6% -18%, var(--v4-glass-1-hi), transparent 56%),  /* 顶部高光 */
  linear-gradient(112deg, rgba(255,255,255,.10), transparent 36%),              /* 斜向反光 */
  linear-gradient(180deg, rgba(255,251,245,.08), …),                            /* 乳白过渡 */
  linear-gradient(168deg, var(--v4-glass-1-tint), …, rgba(219,166,186,.09));    /* 底部玫瑰折射 */
box-shadow:
  inset 0 1px 0 var(--v4-glass-1-edge),          /* 顶部边缘高光 */
  inset 0 14px 20px -16px rgba(255,255,255,.75), /* 内侧反射 */
  inset 0 -22px 28px -26px rgba(120,80,105,.22), /* 底部内侧阴影 */
  inset 0 -1px 0 var(--v4-glass-1-edge-b),
  0 0 0 1px var(--v4-glass-1-ring),              /* 外环 */
  0 34px 78px -48px …, 0 10px 22px -16px …, 0 2px 6px -3px …; /* 三层投影 */
```

**深色单独覆写 `background-image`**：去掉浅色那层斜向反光（它会把深色卡顶抬到
`rgb(75,68,81)`，把 11px 说明文字压到 3.6:1），改用更弱的顶部高光。

### 2.4 L2 次级玻璃

透明度 44%、blur 14px、单层内高光、两层投影。和 L1 的差异不只是"更透"：
L1 有两层内反射 + 斜向反光，L2 没有；L1 圆角 20px，L2 14px。

### 2.5 边缘与反光

- 顶部 1px 近白高光 + 1px 外环（`--v4-glass-1-ring`），代替"粗白边"；
- 内侧 14px 的柔和高光，模拟玻璃厚度；
- 底部 22px 的内阴影，让面板有"压住背景"的重量；
- hover 只提升边框与投影（`border-color` + `box-shadow` 过渡 160ms），
  **不做位移**——位移会让 `position: fixed` 弹窗被关进卡片，也会在边缘抖动
  （Phase 5.1.1 之前修过的闪烁 bug，本次继续避开）。

### 2.6 环境层

`.v4-page` 直接用 6 段 `radial-gradient`（不再套 `filter: blur(28px)`）：
左上玫瑰、右上淡紫、右下淡紫、左下暖沙、中段玫瑰、顶部白色天光。
再加一层 `::after` 的 SVG 颗粒（140×140 tile，`soft-light`，opacity .35），
让玻璃背后不是一块纯色，同时压住大面积渐变的色带。

### 2.7 动效

| 交互 | 时长 | 实现 |
| --- | --- | --- |
| hover（卡片/行/控件） | 160ms | `box-shadow` / `border-color` / `background` |
| active | 90ms | `.v4-task-check` 缩放 0.94 |
| 页面切换 | 200ms | `v4-page-in`：淡入 + 2px 上移 |
| 弹层 | 180ms | 本轮无新增弹层（V4 删除确认是行内条） |
| `prefers-reduced-motion` | —— | 既有规则 `animation/transition: none !important` 全部覆盖 |

---

## 3. 页面级改动

### 3.1 Dashboard

| 区域 | 修改前 | 修改后 |
| --- | --- | --- |
| Hero | 一块半透明白卡 | 透明 + 底部发丝线，直接坐在环境光上 |
| 项目条 | 白卡 | 嵌入面（`--v4-inset-fill`）+ 发丝边框 |
| 统计区 | 4 张 L2 小白卡 | **1 块 L1 玻璃**，4 格用发丝线分隔（1440 四列 / 1100、720 两列两行） |
| 今日任务 / 近 7 日 | L2 | L1（主面板） |
| 最近活动 / 项目概览 | L2 | L2（`variant="quiet"`，辅助信息更轻） |
| 空状态 | 文案 | 文案不变，落在 L1 玻璃上（不再单独套白卡） |

统计带新增 `.v4-stat-label / .v4-stat-value / .v4-stat-hint` 三个类，
数字从 20px → 22px，标签与提示统一 11px；数据和口径完全没动。

### 3.2 Tasks

- 工具条：底部发丝线，不再是一排白盒子；输入框/下拉框改为**嵌入面**（内阴影 + 1px 内框），
  focus 时用 `--v4-accent` 边 + 3px 柔光圈（原 2px outline 改为柔光，键盘可见性保留）。
- 列表：整块 L1；行与行之间 1px 发丝线，行 hover 只加一层很淡的底色（`--v4-row-hover`），
  不给每行加 backdrop-filter；行圆角 12px，列表负 8px 外边距让分隔线更贴近卡片边。
- 行内操作：`编辑 / 删除` 保留 Button 组件，删除去掉描边药丸（`border-color: transparent`），
  只在 hover 时出现 danger 底色 —— 不再打断列表连续性。
- 新建/编辑表单：`variant="feature"`（L1 + 顶部 1px 玫瑰→淡紫渐变主线）。
- 删除确认：行内 danger 嵌入条（9% danger 底色 + 22% danger 边框）。
- 空态：沿用 `StateView`，落在玻璃上，不再另起卡片。

---

## 4. 修改文件清单

| 文件 | 改动 |
| --- | --- |
| `src/client/style/board.css` | 新增「Phase 5.1.2 材质系统」整段（环境 / L1 / L2 / 深色 / 卡片头 / 统计带 / Hero 与项目条 / 回退 / 响应式），新增 Tasks 材质段落；移除旧 `::before` 28px blur 环境层；V4 三级/二级文字色上调 |
| `src/client/v4/ui.tsx` | `Card` 增加 `variant: 'quiet'`、`pad: 'none'`，头部改为 `.v4-card-head/.v4-card-title/.v4-card-meta` 类；`feature` 追加 `.v4-glass-elevated` |
| `src/client/v4/Dashboard.tsx` | 4 个 `Stat` 合并进一块 `Card variant="feature" pad="none"`；`Stat` 从 Card 改为 `<div class="v4-stat">`；活动/项目卡降为 `quiet` |
| `scripts/ui/glass-harness.tsx`（新） | 视觉测试页：真实组件 + 真实 CSS + 宿主深浅 token 模拟 |
| `scripts/ui/glass-shot.mjs`（新） | 12 张截图 + 溢出/材质指标 JSON |
| `scripts/ui/glass-contrast.mjs`（新） | 用「隐藏文字后截图取样」的方式量真实对比度 |

未修改：V3 所有 `.osb-*` 规则、`v4/Tasks.tsx` 业务逻辑、`v4/ui.tsx` 的 Button / Sparkline /
ProgressRing / ProgressBar、任何数据层 / Actions / Hooks / 存储键。

---

## 5. 视觉对比

### 5.1 浅色 · Dashboard（上=修改前，下=修改后）

![Dashboard 浅色对比](glass-compare-dashboard-light.png)

- 修改前：4 张同材质小白卡，页面底色与卡片同值；
- 修改后：一块统计带 + 4 格发丝分隔，主面板 L1 / 辅助面板 L2，环境光从卡片边缘透出。

### 5.2 深色 · Dashboard

![Dashboard 深色对比](glass-compare-dashboard-dark.png)

- 修改前：近黑平涂 + 白描边；
- 修改后：深紫底 + 玫瑰/淡紫环境光，面板有顶部 1px 高光和底部内阴影，
  深色不再是"浅色反色"。

### 5.3 Tasks

| 浅色 | 深色 |
| --- | --- |
| ![Tasks 浅色](glass-compare-tasks-light.png) | ![Tasks 深色](glass-compare-tasks-dark.png) |

行不再是孤立白条：发丝线把列表连成一片，hover 只加一层很淡的底色。

### 5.4 单张原图

`reports/glass-after-{dashboard,tasks}-{light,dark}-{1440,1100,720}.png`（12 张）
`reports/glass-before-…`（12 张，同一 harness、同一数据）

---

## 6. 响应式（独立 Chromium）

| 宽度 | Dashboard | Tasks |
| --- | --- | --- |
| 1440 | 统计 4 列 / 内容 2 列 | 表单 3 列 |
| 1100 | 统计 2×2 / 内容 1 列 | 表单 3 列 |
| 720 | 统计 2×2 / 内容 1 列 | 表单 1 列 |

- 12 张截图全部 `overflowX=false`，越界元素 0；
- 既有布局测试 21/21（含 720px 卡片宽度 ≥ 240、卡片内部无溢出）；
- Tasks 布局测试 15/15（表单不超出视口、输入框不越界）。

---

## 7. 自动化测试结果

| 项目 | 结果 |
| --- | --- |
| TypeScript `tsc --noEmit` | **0 错误** |
| Production build | **exit 0，474,835 B**（Phase 5.1 为 459,071，+15,764） |
| Smoke（数据层 / Actions / Daily / 复习 / 备份） | **415 / 415** |
| React 组件（jsdom，含 Dashboard/Tasks C1–C43） | **43 / 43** |
| register-check（13 条注册/权限断言） | **13 / 13** |
| Dashboard/Tasks 浏览器布局 | **21 / 21**、**15 / 15** |
| V4 Button 浏览器（浅/深对比度、hover/active、键盘） | **13 / 13** |
| V3 闪烁回归（遮罩、卡片边缘、Esc/取消） | **8 / 8** |
| Glass 文字对比度（20 个采样点） | **20 / 20 ≥ 4.5:1**（最低 4.75，最高 13.54） |

对比度明细见 `reports/glass-contrast.json`；材质指标见 `reports/glass-metrics-{before,after}.json`。

**必须说明**：以上全部是静态检查、Node/jsdom 测试与独立 Chromium 测试，
**不是 DSH 宿主验证**。

---

## 8. V3 隔离审计

1. 新增选择器全部以 `.v4-` 开头，或为 `body[data-ds-dark-theme] .v4-*`；
   唯一带 `.osb-` 的是 `.v4-page .osb-hero / .osb-projectbar / .osb-hero-title`，
   与 Phase 4A 的写法一致，**只在 `.v4-page` 下命中**，V3 页面没有 `.v4-page` 祖先。
2. `.osb-*` 规则本身一行未改（本轮所有编辑都在 V4 段与文件末尾新增段）。
3. V3 回归：`scripts/ui/v3-hover.test.mjs` 8/8 通过（遮罩尺寸稳定、卡片边缘不抖、
   Esc/取消可关闭、计时结束提示不在卡片内、悬停保留边框/阴影）。
4. V3 页面的 class 里不存在 `.v4-*`，因此新增的 `.v4-stat / .v4-card-head / .v4-glass-elevated`
   在 V3 中无法命中。

---

## 9. 性能与兼容性风险

### 9.1 性能

| 项 | 处理 |
| --- | --- |
| 大面积 blur | 删除了旧的全页 `filter: blur(28px)` 环境层；环境改为纯渐变绘制 |
| backdrop-filter 数量 | 每页最多 5 个 L1 + 2 个 L2；任务行、输入框、分段控件一律不用 |
| 颗粒层 | 140×140 SVG tile，`mix-blend-mode: soft-light`，单层合成 |
| 动效 | 只有 opacity/transform/box-shadow，均 ≤ 200ms，reduced-motion 全关 |

### 9.2 兼容

- `@supports not (backdrop-filter)` → 退回实色 `--v4-surface-solid`，不假装透明；
- `color-mix()` 前均有字面量回退；
- 深色依赖宿主约定 `body[data-ds-dark-theme]`（已在 `dsh-better-sidebar` 的
  `theme.ts` 中确认：宿主 ThemePresenter 把主题写到 `body[data-ds-dark-theme]`，
  并在 `html` 上写 `color-scheme`）；
- z-index / 滚动：没有新增 fixed 层；`.v4-page` 仍是唯一滚动容器，未引入嵌套滚动。

### 9.3 已知代价

- 页面底色从"接近白"变成"奶油玫瑰"，与宿主其它面板并排时，V4 页会显得更暖；
- 浅色下三级文字从 `#9a929e` 压到 `#6a6371`，与二级文字（`#5c5560`）差别变小，
  层级更多靠字号与字重表达（这是为 4.5:1 做的取舍）。

---

## 10. 未解决 / 待验证

1. **真实 DSH 宿主未验证**：本轮没有启动、重启或加参数运行 DSH；
   构建产物已更新（474,835 B），宿主需要刷新页面才会加载新 bundle。
   宿主下需要复看：深浅主题切换、V4 页面在宿主容器里的圆角/边缘、滚动性能。
2. **深色只在模拟 token 下测过**：`body[data-ds-dark-theme]` + 宿主 token 近似值，
   不是 DSH 的真实深色皮肤（若宿主皮肤自带玻璃或背景图，叠加效果待看）。
3. **V4 卡片 hover 没有位移**：与 Phase 5.1.1 的闪烁修复保持一致；
   V4 Button 仍保留 1px 上浮（Button System 未改），小按钮边缘理论上仍有同类抖动，
   如需要可单独评估。
4. **未做**：Focus / Memory / Knowledge / History / Settings 的材质适配；
   本轮没有新增弹层，因此"modal 180ms"只在既有 V3 弹窗上成立，V4 尚无弹层可验。
5. **尚未做像素级视觉回归基线**：目前是"改前/改后各存一份"+ 人眼对比，
   没有引入截图 diff 阈值（会增加依赖，本轮按约束未引入）。

---

### 复现命令

```bash
ESBUILD_BINARY_PATH=... node scripts/build.mjs
node scripts/register-check.mjs
# 视觉截图（独立 Chromium，不是 DSH）
esbuild scripts/ui/glass-harness.tsx --bundle --platform=browser --format=iife \
  --jsx=automatic --loader:.css=text --outfile="$TEMP/sorchron-glass/harness.js"
node scripts/ui/glass-shot.mjs after
node scripts/ui/glass-contrast.mjs
```

**本阶段到此为止，不进入 Focus / Memory / Knowledge / History / Settings。**
