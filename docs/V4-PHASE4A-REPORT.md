# V4 Phase 4A · 独立页面视觉基础重构报告

> 版本 4.0.0-rc.1 ｜ 范围：页面根作用域、tokens 时机、背景层、两级玻璃、响应式
> 未做：按钮统一、统计卡微可视化、任务行交互、P2/P3

---

## 1. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/client/style/board.css` | 追加 V4 tokens（从 ui.tsx 迁入）+ 4A 规则：`.v4-page` 根、背景层、两级玻璃、深色变体、`@supports` 降级、1180/720 断点 |
| `src/client/index.tsx` | 根节点按视图加 `v4-page` 与 `data-view`；删除 tokens 的 useEffect 注入；删除 Tab 外层重复 `.v4-scope`；Notice/Conflict 在 V4 下包一层 `v4-scope v4-overlays` |
| `src/client/v4/Dashboard.tsx` | 去掉自身的 `.v4-scope` 背景与 padding（背景改由页面根负责），只保留内容 |
| `src/client/v4/ui.tsx` | 移除已迁出的 `V4_TOKENS_CSS` 字符串，避免两份真相 |

未改：V3 组件 DOM/逻辑、宿主 API、注册配置、package.json、schema、依赖。

---

## 2. V4 页面根容器（最终）

```
<div class="osb-page v4-page" data-view="v4">   ← 根节点按视图切换
  hero（V3 结构，V4 下由 .v4-page 后代规则适配）
  ProjectBar（同上）
  <div> ViewTabs </div>
  <Dashboard/>            ← 自身不再包 v4-scope
  <div class="v4-scope v4-overlays"> NoticeHost / ConflictHost </div>
</div>
```

V3 模式类名仍是 `osb-page`、`data-view="classic"`，结构与样式不变。

---

## 3. V3 / V4 CSS 隔离

- 全部新增规则以 `.v4-page` 为前缀（tokens 同时挂 `.v4-scope`，兼容测试与浮层）；
- `.osb-*` 既有规则一行未改，只在 `.v4-page` 后代上覆盖颜色/背景/边框；
- V4 tokens 定义在 `.v4-page, .v4-scope` 上，V3 页面没有这两个类，不会继承任何 V4 变量；
- 深色覆盖用 `html[data-theme="dark"] .v4-page ...`，不影响 V3。

---

## 4. tokens 注入时机与重复注入

**改法**：tokens 直接写进 `board.css`，随插件唯一的 `<style>` 在 `installBoardStyles()` 时一次性注入。

- 首次渲染就是最终样式，**不存在 V3 白底 → V4 背景的闪切**；
- 只有 1 个 style 标签，`register-check` 的「样式表已注入」断言保持 13/13；
- 切换 V3/V4 只切 class，不增删 style，不会重复或遗留；
- 没有再使用第二次注入，也没有第二份 tokens 字符串。

---

## 5. 背景层与两级玻璃

**背景**：`.v4-page::before` 绝对定位、`inset:0`、`pointer-events:none`、`z-index:0`、`filter:blur(28px)`，三个低饱和径向渐变：

| 色块 | 位置 | 颜色 |
| --- | --- | --- |
| 玫瑰 | 12% 4% | `rgba(196,146,164,.30)` |
| 雾紫 | 88% 10% | `rgba(160,146,196,.26)` |
| 暖灰 | 70% 96% | `rgba(214,196,206,.22)` |

根节点 `isolation:isolate`，内容 `z-index:1`，所以背景不吃点击、不产生滚动。

**玻璃**：

| 级别 | 背景 | blur | 边框/阴影 |
| --- | --- | --- | --- |
| L1（主卡） | `rgba(255,253,250,.58)` | 20px + saturate(1.08) | 内高光 + 18px 环境阴影 + 2px 近影 |
| L2（次级） | `rgba(255,255,255,.40)` | 12px | 细边框 + 8px 轻阴影 |

深色各有一套值（`.62` / `.46` 底，白 6–14% 边框）；`@supports not (backdrop-filter)` 时降级为 `.94` / `.86` 不透明奶油白，文字对比度不丢。

---

## 6. 响应式

| 断点 | 规则 |
| --- | --- |
| >1180 | 统计 4 列、Dashboard 2 列（1.25fr / 1fr） |
| ≤1180 | 统计 **2×2**、Dashboard **单列**（解决 1100 挤压） |
| ≤720 | 页面 padding 收到 `s3`，hero/projectbar 同步收窄；既有 720 规则不变 |

所有网格仍是 `minmax(0,1fr)`，未使用 `overflow-x:hidden`。

---

## 7. 自动化结果

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| smoke | **403 / 403** |
| React 组件 | **21 / 21** |
| register-check | **13 / 13** |
| 生产构建 | exit 0，`lib/client.js` **430,642 B**（+2,199 B，主要是迁入的 CSS） |

---

## 8. V3 视觉回归

代码层：V3 根类名、`.osb-*` 规则、五个卡片与浮层组件均未改；仅在 `.v4-page` 后代上覆盖 Hero/ProjectBar 背景。
**但本轮没有真实 DSH 截图**，不能宣布「V3 无视觉回归」——需要你在宿主里切到经典模式对比确认。

---

## 9. 真实 DSH 待验收

| # | 项 | 预期 |
| --- | --- | --- |
| A1 | 经典模式 | 与 P0.5 截图一致（Hero/项目条/五卡/按钮均不变） |
| A2 | 切到 V4 | 整页（Hero、项目条、Tab、Dashboard）同一奶白背景与字体色，无「一块面板贴旧页」感 |
| A3 | 首帧 | 切换瞬间不应出现 V3 白底闪一下 |
| A4 | 玻璃 | 卡片能透出背景的玫瑰/雾紫色块；文字对比度正常 |
| A5 | 1100px | 统计卡 2×2、Dashboard 单列，无横向滚动 |
| A6 | 720px | padding 收紧，卡片不重叠、不溢出 |
| A7 | 1440px | 4 列统计、双列 Dashboard，留白均衡 |
| A8 | 滚动 | 只有宿主主区滚动，背景层不产生第二条滚动条 |
| A9 | 浮层 | 通知 / 冲突条在 V4 下位置与可读性正常 |
| A10 | 深色主题 | 玻璃为深色一套值，不发灰、不脏 |
| A11 | 控制台 | 无红色 error |

---

## 10. 尚存问题与下一阶段

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | 未实机验证（A1–A11） | 装到 DSH 后逐项截图 |
| 2 | 低端 GPU 下 blur 28px + 多张卡可能掉帧 | 实测 FPS；必要时降到 18px 或减少 L1 玻璃数量 |
| 3 | 按钮仍是 V3 黑胶囊 + V4 灰玫瑰两套 | Phase 4B 统一 |
| 4 | 四张统计卡只有第一张带环 | Phase 4B 统一微可视化 |
| 5 | `V4_TOKENS_CSS` 从 ui.tsx 移除后，若将来要动态换肤需重新设计注入 | 换肤时再引入 CSS 变量主题切换 |
| 6 | Hero/ProjectBar 的 V4 适配只覆盖了背景/边框/标题色 | 4B 精细调字号与间距 |
