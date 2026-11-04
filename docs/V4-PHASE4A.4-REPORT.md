# V4 Phase 4A.4 · DSH 宿主主题变量适配审计

> 版本 4.0.0-rc.1 ｜ 审计对象：`dsh-client-ui-theme` 0.1.1-rc.2 + 本项目 V4 token
> **性质：静态审计。** 我没有运行中的 DSH 会话，所以「浅色/深色计算值」只能给出宿主 CSS 的定义链，不能宣称是宿主实测。

---

## 1. 宿主变量的真实定义位置

在 `<home>\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-client-ui-theme\lib\client.js` 中，主题插件把自己的样式表注入 `<head>`（`document.createElement('style')` + `data-plugin-css`），变量定义在 **`body` 选择器**上：

```css
body{
  --dsw-alias-bg-base: var(--dsw-static-neutral-bluish-00);
  --dsw-alias-bg-layer-1: var(--dsw-static-neutral-bluish-00);
  --dsw-alias-bg-layer-2: var(--dsw-static-neutral-bluish-00);
  --dsw-alias-bg-layer-3: var(--dsw-static-neutral-bluish-150);
  --dsw-alias-label-primary: var(--dsw-static-neutral-bluish-1000);
  --dsw-alias-label-secondary: var(--dsw-static-neutral-bluish-700);
  --dsw-alias-border-l2: #0000001a;
  --dsw-alias-brand-primary: var(--dsw-static-neutral-bluish-1000);
}
```

**关键发现**：

1. 这些变量**确实存在**，挂载在 `body` 上；`.v4-page` 是 body 的后代，能正常继承。
2. `--dsw-alias-brand-primary` 在浅色下指向 **`neutral-bluish-1000`（近黑）**，不是品牌紫/玫瑰。上一版把它当 accent 用，导致 V4 的圆环、圆点、进度条会变成近黑色——这是真实缺陷。
3. `--dsw-alias-bg-layer-1` 与 `-2` 在浅色下是**同一个值**（neutral-00），所以「底色靠 layer-2 区分」不成立。
4. 样式表里**没有** `[data-theme="dark"]` 选择器；深色由 `ThemeRuntime` 在运行时按 `theme/change` 应用 token 覆盖层（`prefers-color-scheme` 只在 preference=system 时用于感知环境）。所以我们之前写的 `html[data-theme="dark"]` 块是**死代码**，现已删除。
5. 深色 token 的具体取值**不在静态 CSS 里**，我无法在不运行宿主的情况下给出计算值——这一项标记为**未测量**。

---

## 2. 浅色 / 深色计算值

| 变量 | 浅色（静态可确认） | 深色 |
| --- | --- | --- |
| `--dsw-alias-bg-layer-1/2` | → `neutral-bluish-00`（页面白） | 运行时覆盖，**未测量** |
| `--dsw-alias-label-primary` | → `neutral-bluish-1000`（近黑） | 未测量 |
| `--dsw-alias-label-secondary` | → `neutral-bluish-700` | 未测量 |
| `--dsw-alias-label-tertiary` | 变量存在（未取到链尾值） | 未测量 |
| `--dsw-alias-border-l2` | `#0000001a` | 未测量 |
| `--dsw-alias-brand-primary` | → `neutral-bluish-1000`（近黑） | 未测量 |

> 这些是**定义链**，不是 getComputedStyle 的结果。真实数值必须在宿主里读。

---

## 3. V4 token 适配情况（审计后）

| token | 现在取自 | 遗留硬编码 | 说明 |
| --- | --- | --- | --- |
| `--v4-surface-solid` | `--dsw-alias-bg-layer-1` | 仅 fallback `#fdfbfb` | 宿主缺失时兜底 |
| `--v4-surface-1/2` | `color-mix(surface-solid …)` | 无 | 先声明 solid 作为不支持 `color-mix` 的回退 |
| `--v4-bg` | `bg-layer-2` + 6% 暖色混合 | fallback `#f7f2f4` | 保留一点奶油倾向 |
| `--v4-text/-2/-3` | 三个 label token | 浅色 fallback | 深色由宿主 token 决定 |
| `--v4-border/-strong` | `border-l2/l3` | fallback | — |
| `--v4-accent` | **玫瑰 `#b0768a` 与 `label-primary` 混合** | 玫瑰基色 | **不再用 brand**（brand 近黑） |
| `--v4-violet` | `#8a76b8` 与 `label-primary` 混合 | 紫基色 | 深色下自动提亮 |
| `--v4-rose` | 固定玫瑰 | 是（有意） | 作为品牌色锚点 |

**已删除**：`html[data-theme="dark"]` 的整套 V4 深色 token 与玻璃覆盖（宿主不用这个属性，留着会造成「以为适配了」的假象）。

---

## 4. color-mix 与降级

| 场景 | 处理 |
| --- | --- |
| 浏览器不支持 `color-mix` | 每个 token 先给可用值（solid / hex），再声明 `color-mix`；不支持时保留前一条 |
| 不支持 `backdrop-filter` | L1/L2 回退到 `var(--v4-surface-solid)`（**跟随主题**，不再用固定的浅色 `.94`） |
| 背景色块 | `::before` 只使用 `color-mix`；不支持时该层背景为空（页面仍有 `--v4-bg` 实色），不会出现白卡 |
| 风险 | 深色 + 不支持 color-mix 时，L1/L2 都是实色 surface，**层次会消失**——这是明确记录的降级代价 |

之前的真实缺陷：`@supports not (backdrop-filter)` 分支写死 `rgba(253,251,249,.94)`，深色下会变成**白卡**。已改为主题 surface。

---

## 5. ViewTabs

- `.v4-tabs` / `.v4-tab` 全部使用 `--v4-surface-2/-solid/-border/-text`；
- 新增 `:hover`（surface-1 + 主文字）、`:active`（scale .985）、`:focus-visible`（2px accent outline）；
- 经典模式：tokens 现在也定义在 `.osb-page` 上，所以 Tab 在经典视图同样能拿到浅/深色值；
- 无 token 时（极端环境）：`--v4-surface-2` 有 solid 回退，文字有 hex 回退，不会出现透明按钮。

---

## 6. V3 保护范围

- 没有改动任何 `.osb-*` 规则；
- tokens 额外挂到 `.osb-page`，但 V3 元素只读 `--osb-*`，不会因为 V4 变量存在而改变外观；
- `PieChart` 空态沿用 4A.2 的实现，本轮未动；
- V3 深色 Add 按钮、任务行图标按要求**未修**。

---

## 7. 自动化门禁

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| smoke | **403 / 403** |
| React 组件 | **25 / 25** |
| register-check | **13 / 13** |
| 生产构建 | exit 0，`lib/client.js` **430,243 B** |
| 体积对比 | 4A.3 末 430,712 → **−469 B**（删除 data-theme 死代码与内联样式） |

---

## 8. 仍需真实 DSH 验证（不能用本文替代）

1. 深色下 `--dsw-alias-*` 的实际计算值与 V4 卡片观感；
2. `.v4-page` 继承到的是 `body` 的 token，还是宿主在中间层又覆盖了一层——需要在 DevTools 里选中元素读 computed style；
3. `.52/.58` 玻璃在真实深色下的文字对比度；
4. `color-mix` 在宿主 Chromium 的版本是否支持（不支持会走实色回退，层次变平）；
5. 关闭 GPU / 禁用 backdrop-filter 的降级观感；
6. Tab 的 hover / focus-visible 实际效果；
7. 720 / 1100 / 1440 断点与滚动。

**本文所有结论均为静态审计，不构成宿主验收。**
