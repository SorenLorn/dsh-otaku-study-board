# Phase 4B.2 · V4 Button System 统一报告

> 日期：2026-11-03 ｜ 版本 4.0.0-rc.1
> 范围：只统一 V4 按钮；未改 ViewTabs 选中态、V3 按钮、玻璃参数、断点、数据层。

---

## 1. 按钮盘点（重要：很多“V4 页面”并不存在）

### V4 命名空间（本次范围内）

| 位置 | 组件 | class | 类型 | 业务行为 | 复用 Button | 原问题 |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard 头部「任务」 | `Dashboard.tsx` | `.v4-btn.v4-btn-sm`（secondary） | 次级 | `onNavigate('tasks')` | ✅ | 无 hover 背景，尺寸偏小 |
| Dashboard 头部「专注」 | 同上 | secondary | 次级 | `onNavigate('timer')` | ✅ | 同上 |
| Dashboard 头部「日志」 | 同上 | ghost | 轻量 | `onNavigate('log')` | ✅ | hover 无反馈 |
| 近 7 日空态「去专注」 | 同上 | secondary → **primary** | 主操作 | `onNavigate('timer')` | ✅ | 没有主次区分 |
| ViewTabs 两个 Tab | `v4/ui.tsx` | `.v4-tab` | 选项卡 | `setView` | ❌（原生 button） | 深色选中态已知问题，**本阶段不动** |

### V4 中不存在、因此没有按钮可统一的部分

Tasks / Focus / Memory / Knowledge / History / Settings 的 **V4 页面尚未开发**；Dialog 也只有 V3 的 `ConfirmDialog`。
这些位置目前的按钮全部是 V3 `.osb-btn`（TaskList 的 Add/图标按钮、FocusTimer 的 Start/Reset、FrictionLog 等），按约束**未触碰**。

> 因此本阶段不是“全站按钮统一”，而是“**V4 Button 基础组件 + 目前唯一使用它的 Dashboard**”。

---

## 2. 新旧组件结构

```tsx
// 旧
<Button variant size disabled onClick>{children}</Button>

// 新（向后兼容，新增可选 props）
<Button
  variant="primary | secondary | ghost | danger | icon"
  size="sm | md"
  disabled?
  loading?          // 新增：禁用 + 保留标签宽度 + spinner
  onClick?
  ariaLabel?
  id?
>{children}</Button>
```

没有新建第二套 Button，也没有拆出 button factory；CSS 仍在 V4 命名空间下。

---

## 3. 类型与状态规范

| 类型 | 背景 | 文字 | 边框 | hover | active |
| --- | --- | --- | --- | --- | --- |
| Primary | `color-mix(accent 88%, text)` | `--dsw-alias-label-primary-inverted` | 无 | accent 76% 混合 | `scale(.985)` |
| Secondary | `--v4-surface-2` | `--v4-text` | `--v4-border` | 上浮 1px + 阴影 | `scale(.985)` |
| Ghost | 透明 | `--v4-text-2` | 无 | `surface-2` 背景 + 主文字色 | `scale(.985)` |
| Danger | 透明 | `--v4-danger` | `--v4-danger` | danger 12% 背景 | `scale(.985)` |
| Icon | 同 secondary | 同 secondary | 同 secondary | 30×30 固定点击区 | `scale(.985)` |

- `focus-visible`：`outline: 2px solid var(--v4-accent); outline-offset: 2px`；
- `disabled`：`opacity:.5`、`cursor:not-allowed`、无阴影、不触发回调；
- `loading`：`disabled` + `aria-busy=true`，标签 `visibility:hidden`（**宽度不变**），spinner 绝对定位；
- 所有过渡 160ms / active 90ms 量级，`prefers-reduced-motion` 下关闭动画与旋转。

---

## 4. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/client/v4/ui.tsx` | Button 新增 `loading` / `id`；标签包 `.v4-btn-label`；loading 时禁用并渲染 spinner |
| `src/client/style/board.css` | `:focus-visible`、loading/spinner/keyframes、primary 用 `label-primary-inverted`、ghost/danger hover、disabled 阴影 |
| `src/client/v4/Dashboard.tsx` | 「去专注」改为 `variant="primary"`（唯一主操作） |
| `scripts/ui/components.test.tsx` | 新增 C26–C32 |
| `scripts/ui/button-harness.tsx` / `button-browser.test.mjs` | 新增：真实 Button + board.css + 代表性宿主 token 的浏览器状态测试 |

未改：ViewTabs 选中态、V3 组件/CSS、数据层、断点、玻璃/渐变/blur、依赖。

---

## 5. 浅色 / 深色实测（真实 Chromium）

方法：真实 Button + 真实 `board.css`，注入宿主代表性的 `--dsw-alias-*` 浅/深值，切 `body[data-ds-dark-theme]` 后读 computed style 并计算对比度。**不是 DSH 宿主。**

| 类型 | 浅色对比度 | 深色对比度 |
| --- | --- | --- |
| Primary | **5.78** | **5.36** |
| Secondary | **18.80** | **13.08** |
| Ghost | **5.74** | **6.94** |

全部 ≥ 4.5。Primary 深色使用 `label-primary-inverted`（`#353638`）配提亮后的玫瑰，不再出现白字压浅玫瑰。

浏览器断言：**13 / 13 通过**，含：
- hover 位移 `translateY(-1px)`；
- active `scale(.985)`；
- loading 宽度 56 → 56（0px 变化）；
- Tab 聚焦，`outline 2px solid`；
- Space 触发回调。

**Enter 激活未通过**：焦点确实在按钮上，但 headless CDP 的 Enter 没有触发 click（Space 可以）。这更像 CDP/headless 的限制，不能据此判定产品键盘不可用；标记为**未验证**，不写成通过。

---

## 6. 业务回调与可访问性

- C26 默认点击回调可用；
- C27 disabled 不触发；
- C28 loading 保留标签 + spinner + 禁用；
- C29 loading 不触发；
- C30 图标按钮有 `aria-label`；
- C32 Dashboard「去专注」仍回调 `onNavigate('timer')`；
- 所有按钮仍是原生 `<button type="button">`，Tab 可聚焦，Space 可激活。

---

## 7. V3 回归

- 未修改任何 `.osb-*` 规则或 V3 组件；
- smoke 403 / 组件 32 全绿；
- V3 按钮保持原样（包括已知的深色 Add 对比度问题，仍不在本阶段处理）。

---

## 8. 门禁

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| smoke | **403 / 403** |
| React 组件 | **32 / 32** |
| register-check | **13 / 13** |
| production build | exit 0，**431,697 B**（4B.1 时 430,243 → +1,454 B） |
| Button 浏览器测试 | **13 / 13** |

---

## 9. 尚未解决

| # | 问题 | 说明 |
| --- | --- | --- |
| 1 | V4 其它页面不存在 | Tasks/Focus/Memory/Knowledge/History/Settings 仍是 V3，没有 V4 按钮可统一 |
| 2 | Danger / Icon 未在产品中使用 | 样式与测试就绪，但没有实际入口可验收 |
| 3 | Enter 激活未验证 | headless CDP 限制；需真实宿主键盘确认 |
| 4 | 真实 DSH 未测 | 浅/深对比度来自带代表性 token 的 Chromium 测试页，不是宿主 |
| 5 | ViewTabs 深色选中态 | 4A.6 遗留，按要求未动 |
| 6 | loading 无真实业务入口 | 组件能力已就绪，等后续 V4 页面使用 |

---

## 10. 结论

V4 Button 的基础体系（类型、状态、对比度、loading、可访问性）已经建立并通过浏览器与组件测试；当前只有 Dashboard 使用它。后续 V4 页面应直接复用，不再新写按钮样式。不进入 4B.3。
