# V4 Phase 3 · UI 架构分析与设计系统方案

> 状态：**设计稿（按你的要求先提交分析，未改动任何 UI 代码）**
> 依据：V3 组件与 `board.css`（1440 行）、`index.tsx` 挂载、`actions` 层、B3.5 报告、DSH slot 机制
> 结论摘要：**可以在不破坏 V3 的前提下并行引入 V4 设计系统与 Dashboard**；但有两项需要你拍板（见 §8）。

---

## 1. UI 架构分析（现状）

### 1.1 挂载与容器

- 入口：`apply(ctx)` 注册 `main`（页面）+ `sidebar.panellist`（导航行），二者共用 `PANEL_ID`；
- 页面根节点：`.osb-page`（`BoardPage`），内部 `.osb-hero` + `.osb-projectbar` + `.osb-grid` + 两个 Host（Notice / Conflict）；
- 布局：`.osb-grid` 是 12 列 CSS Grid（`span-12 / span-7 / span-5`），卡片 `.osb-card`；
- 滚动：**页面自身不滚动**，由 DSH 主区提供滚动容器；插件只负责内容高度；
- 主题：全部颜色走 `--dsw-alias-*` / `--dsw-radius-*` / `--dsw-font-*`，并带浅色兜底；`board.css` 定义了 `--osb-*` 一层别名；
- 浮层：`.osb-modal-backdrop` 用 `position: fixed`，`z-index` 未统一管理（Notice 与 Conflict 各自固定位）。

**结论**：V4 不应重写 `.osb-page` 结构，而应在 **hero 与 grid 之间**插入一个「视图切换」，Dashboard 作为独立视图渲染，V3 的五个卡片原样保留。

### 1.2 与 V3 的共存策略（建议）

```
BoardPage
├─ hero（保留）
├─ ProjectBar（保留）
├─ ViewTabs：经典工作台 | V4 Dashboard（新增，默认「经典」）
├─ 经典视图 = 现有 .osb-grid（原封不动）
└─ V4 视图 = <Dashboard />（新目录 src/client/v4/）
```

好处：零回归风险；V4 可以按模块逐个搬迁，直到功能对等再考虑默认切换。

### 1.3 DSH 宿主的真实约束

| 约束 | 影响 | 对策 |
| --- | --- | --- |
| 主区宽度未知（侧栏可折叠） | 固定像素会溢出 | 全部用 `minmax(0,1fr)` / `clamp()`，断点 720 / 1080 |
| 主区滚动由宿主提供 | 内部再套 `overflow:auto` 会出现双滚动条 | 页面不用 `height:100vh`、不设 `overflow` |
| 主题由宿主注入 CSS 变量 | 硬编码颜色会在深色主题下瞎掉 | token 全部基于 `--dsw-alias-*`，并提供 fallback |
| `backdrop-filter` 在部分环境不生效 | 毛玻璃退化成透明，文字不可读 | `@supports` 降级为不透明奶白表面 |
| 无公开的页面切换动画钩子 | 只能自己做视图内过渡 | 用 CSS `@keyframes` + `prefers-reduced-motion` |

---

## 2. 设计方向

Premium Glassmorphism：**奶白底 + 低饱和玫瑰粉点缀 + 半透明层**。不做暗黑霓虹，不使用大面积渐变。

### 2.1 Design tokens（新增 `v4/tokens.css`）

颜色（浅色为基准，深色靠宿主变量自动反转）：

| Token | 值 | 用途 |
| --- | --- | --- |
| `--v4-bg` | `linear-gradient(160deg, #fbf8f7 0%, #f6f2f4 45%, #f3eef2 100%)` | 页面底 |
| `--v4-surface-1` | `rgba(255,255,255,0.62)` | 一级玻璃 |
| `--v4-surface-2` | `rgba(255,255,255,0.42)` | 二级玻璃 |
| `--v4-surface-solid` | `#fdfbfb` | 降级/弹窗 |
| `--v4-border` | `rgba(120,96,112,0.14)` | 常规描边 |
| `--v4-border-strong` | `rgba(120,96,112,0.24)` | 强调描边 |
| `--v4-text` | `#2c2630` | 主文字 |
| `--v4-text-2` | `#6b6370` | 次文字 |
| `--v4-text-3` | `#9a929e` | 弱文字 |
| `--v4-accent` | `#b0768a`（灰玫瑰） | 主强调 |
| `--v4-accent-soft` | `rgba(176,118,138,0.14)` | 强调底 |
| `--v4-ok / warn / danger` | `#5d8f78 / #b58a4a / #b3605f` | 状态（低饱和） |

圆角：`--v4-r-sm 10px / -md 14px / -lg 20px / -pill 999px`
间距：`4 / 8 / 12 / 16 / 24 / 32 / 48`（`--v4-s1..s7`）
阴影：`--v4-shadow-1 0 1px 2px rgba(44,38,48,.04)`；`--v4-shadow-2 0 12px 32px -20px rgba(44,38,48,.35)`
字号：`11 / 12 / 13 / 15 / 20 / 28`；行高 `1.45`；字重 `400 / 500 / 600`

### 2.2 Glass 层级

| 层级 | 用途 | 参数 |
| --- | --- | --- |
| L1 | 页面级大分区 | `background: var(--v4-surface-1); backdrop-filter: blur(18px) saturate(1.05)` |
| L2 | 卡片 | `surface-2 + blur(14px)` |
| L3 | 弹窗 / 悬浮工具 | `surface-solid + blur(24px) + shadow-2` |

**降级**：
```css
@supports not (backdrop-filter: blur(1px)) {
  .v4-glass { background: var(--v4-surface-solid); }
}
```

### 2.3 动效规范

| 场景 | 时长/曲线 |
| --- | --- |
| Hover 上浮 | `translateY(-1px)`，160ms `cubic-bezier(.22,.61,.36,1)` |
| Active 压缩 | `scale(.985)`，90ms |
| Modal | 淡入 + `scale(.98→1)`，180ms |
| 视图切换 | 透明度 + 4px 位移，200ms |
| 骨架屏 | 1.2s 呼吸，不用旋转 spinner |

```css
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
```

---

## 3. 设计系统组件清单

| 组件 | 变体 | 文件 |
| --- | --- | --- |
| Button | primary / secondary / ghost / danger / icon；sm/md | `v4/ui/Button.tsx` |
| Card | default / stat / feature / interactive | `v4/ui/Card.tsx` |
| Dialog | 确认 / 信息；Esc + 焦点回退 | `v4/ui/Dialog.tsx` |
| Tooltip | 纯 CSS，`title` 降级 | `v4/ui/Tooltip.tsx` |
| StateView | loading（骨架）/ empty / error | `v4/ui/StateView.tsx` |
| ProgressRing | 专注完成度（SVG，无依赖） | `v4/ui/ProgressRing.tsx` |
| Sparkline | 近 7 日（复用 V3 的 SVG 思路） | `v4/ui/Sparkline.tsx` |
| ViewTabs | 经典 / V4 | `v4/ui/ViewTabs.tsx` |

所有组件只吃 token，不写死颜色；不引入任何 UI 库。

---

## 4. Dashboard 信息架构与真实数据映射

| 区块 | 数据来源（真实） | 空状态 |
| --- | --- | --- |
| 今日概览（4 指标） | `computeBoardStats(tasks, logs, now)` + `daily` 当日 | 无任务 → 「先写下一个 25 分钟能推进的任务」 |
| 今日任务进度 | `board.tasks`（已按项目隔离）+ `taskFocusMinutes` | 空 → 引导新建 |
| 专注统计 | `daily` 近 7 天（**不读日志**，避免 400 条上限） | 全 0 → 「完成第一轮专注后这里会有曲线」 |
| 连续记录 | `countStreak` + `daily` 活跃天数 | 0 → 「今天开始就能连上」 |
| 最近活动 | `timeline` 最近 8 条（已有事件才显示） | 无 → 「完成/专注/解决阻碍会出现在这里」 |
| 项目概览 | `projectRanking` + `projects` | 无项目 → 引导创建 / 模板 |
| 快速入口 | 触发视图切换（Tasks/Focus 仍用 V3 现有卡片，**不新建页面**） | — |

**硬规则**：所有数字必须来自上述函数；任何「演示用假数据」都不允许进代码。没有数据的区块显示空状态，不显示 0 以外的编造值。

---

## 5. 文件计划（实施阶段）

```
src/client/v4/
  tokens.css            设计变量（通过 build 注入，不改现有 board.css）
  ui/{Button,Card,Dialog,Tooltip,StateView,ProgressRing,Sparkline,ViewTabs}.tsx
  dashboard/
    Dashboard.tsx       组装（< 150 行）
    sections/{TodayOverview,TaskProgress,FocusTrend,Streak,RecentActivity,ProjectOverview,QuickActions}.tsx
  hooks/useDashboardData.ts   只做「取数 + 派生」，不写存储
```

- `index.tsx` 只增加一个 `view` 状态与 `<ViewTabs />`，V3 代码不动；
- `board.css` 不重写，只追加 `.v4-*` 命名空间；
- 构建仍单产物，不新增依赖。

---

## 6. 测试计划

| 层 | 内容 |
| --- | --- |
| 组件（jsdom + RTL，已有设施） | Dashboard 空状态；有数据时 4 指标数值与函数结果一致；点击快速入口切换视图；骨架屏出现/消失；reduced-motion 不崩 |
| 逻辑 | 复用 smoke/integration；**新增**：Dashboard 派生值 === `computeBoardStats` / `daily` 汇总（防止组件里另算一套） |
| 视觉 | PC-DSH 人工：1100/1440 宽度、深浅主题、滚动、按钮 hover/active |
| 截图 | **必须真实运行后截取**；本地无 DSH 运行环境，本轮无法提供，不会用示意图冒充 |

---

## 7. 风险

1. **无法在本环境截图**：DSH 宿主未运行，截图需你安装后我远程/你本地截；
2. `backdrop-filter` 在低端 GPU 上掉帧：限制同时模糊的面数（L1 ≤ 2，其余用底色 + 细边）；
3. 深色主题下奶白玻璃会脏：token 需按 `html[data-theme=dark]` 提供一组深色玻璃值（实施时验证）；
4. Dashboard 与 V3 统计口径必须同源，否则两页数字会打架。

---

## 8. 需要你拍板的两个决策

1. **默认视图**：V4 Dashboard 先作为「可选视图」（默认经典，推荐）还是直接默认 V4？
2. **卡片复用**：V4 用全新 `.v4-card` 体系（推荐，视觉独立），还是复用 V3 `.osb-card` 只换皮？

确认后我按：tokens → 基础组件 → Dashboard 骨架 → 真实数据接入 → 组件测试 → 构建验收 的顺序实施。
