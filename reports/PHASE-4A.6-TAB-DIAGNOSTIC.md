# Phase 4A.6 · V4 深色 Tab 选中态诊断

> 时间：2026-11-03 10:29 ｜ 版本 4.0.0-rc.1
> 结论：**源码与磁盘上的 bundle 都是最新的，没有发现旧版文件；但 Tab 深色选中态仍未取得运行时 computed style，因此不能判定「缓存」还是「CSS 被覆盖」。本轮未改任何代码。**

---

## 1. 当前加载的是不是最新 bundle？

| 检查 | 结果 |
| --- | --- |
| 项目是否 git 仓库 | **不是**（`git rev-parse` 报 not a git repository），无法用 commit 标识版本 |
| 构建产物 | `lib/client.js`，**430,243 B**，mtime `2026-11-02 23:39` |
| 已安装路径 | `~/.dsh/profiles/desktop/node_modules/dsh-otaku-study-board` 是指向项目目录的**符号链接** |
| 解析结果 | `<repo>` |
| SHA-256 | 项目与已安装路径**完全一致**：`ed0966f8d96b2ccf3526e844a31f9d24bd645c961798e7e3131f5394bcdcd47d` |
| bundle 内容 | 含 `.v4-tab[aria-selected="true"]` 规则、13 处 `--v4-surface-solid`、**0 处** `data-theme="dark"` |
| `.dsh` 下其它 client.js 副本 | 未发现含 `v4-tab` 的其它副本（安装目录是链接，没有第二份） |

**磁盘层面：没有旧 bundle，加载路径就是最新构建。**
但「Node 文件是最新的」不等于「已经打开的 Electron renderer 重新加载了它」——后者需要运行时确认，本轮没有 CDP，无法确认。

---

## 2. 源码里的 Tab 选中态是否用了固定浅色？

```css
.v4-tabs {
  background: var(--v4-surface-2);
  border: 1px solid var(--v4-border);
}
.v4-tab {
  background: transparent;
  color: var(--v4-text-2);
}
.v4-tab[aria-selected="true"] {
  background: var(--v4-surface-solid);
  color: var(--v4-text);
  box-shadow: var(--v4-shadow-1);
}
```

- **没有**固定浅色背景，也没有固定 `#fdfbfb` / `#2c2630` 文字色；
- 唯一的 `#fdfbfb` 出现在 token 的 **fallback**：`--v4-surface-solid: var(--dsw-alias-bg-layer-1, #fdfbfb)`；
- `ViewTabs` 组件已改为 `className="v4-tabs" / "v4-tab"`，不再有内联颜色。

---

## 3. 宿主深色 token 的实际作用域

从 `dsh-client-ui-theme/lib/client.js` 读出：

```css
body { --dsw-alias-bg-layer-1: var(--dsw-static-neutral-bluish-00); }        /* #fff */
body[data-ds-dark-theme] { --dsw-alias-bg-layer-1: var(--dsw-static-neutral-bluish-875); } /* 深色 */
```

- 深色不是 `data-theme`，而是 **`body[data-ds-dark-theme]`**；
- 因此只要 `.v4-page` 在 body 之内，`--v4-surface-solid` 在深色下应解析为 `bluish-875`（深色），
  Tab 选中态理论上应是**深底浅字**，与截图里「浅底黑字」不一致。

---

## 4. 为什么仍可能显示浅色（按可能性排序）

| # | 假设 | 支持证据 | 反证/待查 |
| --- | --- | --- | --- |
| 1 | **Renderer 仍持有旧 JS**（窗口在重建前打开、未真正 reload） | 旧 JS 里 ViewTabs 是内联 `#fdfbfb` 选中态，正好呈现浅胶囊 | 磁盘 bundle 是最新；但无法证明页面已重新加载 |
| 2 | **宿主全局按钮样式覆盖** | 宿主可能有 `button` 背景规则；截图只影响 Tab 不影响其它卡片 | 需要 computed style 才能确认；我们的选择器 `0,2,0` 通常能压过 `0,1,2` |
| 3 | **宿主 token 没有继承到该节点** | 若 `--dsw-alias-bg-layer-1` 在 Tab 处为空，fallback `#fdfbfb` 生效 | 同一节点的卡片是深色，说明 token 大体上是继承到的 |
| 4 | 截图/选中判断误差 | 分辨率低 | 需要重新截图或 computed style |

**没有 computed style，就不能在第 1–3 之间下结论。**

---

## 5. 正常刷新后问题是否消失？

**未验证。** 本轮约束禁止重启/改启动参数，也没有 CDP/Playwright，因此我无法执行「宿主内刷新插件 → 再观察」。
我没有用静态分析冒充这一步。

---

## 6. 如果仍是浅色，最小修复位置

优先验证，不要盲改。确认是「旧内联样式残留」或「宿主覆盖」后，最小改动只有一处：

```css
.v4-tab[aria-selected="true"] {
  background: var(--v4-surface-solid) !important;
  color: var(--v4-text) !important;
}
```

`!important` 能压过旧的内联 `background:#fdfbfb`（非 important）与多数宿主覆盖，不动其它规则。

如果 computed 显示 `--v4-surface-solid` 本身就是浅色（token 没继承），则改用不依赖 solid 的 Tab 专用 token：

```css
.v4-tab[aria-selected="true"] {
  background: color-mix(in srgb, var(--v4-text) 10%, transparent);
  border: 1px solid var(--v4-border-strong);
  color: var(--v4-text);
}
```

**两者都未实施，等你确认后再改。**

---

## 7. 是否可以正式冻结 Phase 4A？

- **其余部分可以冻结**：浅色/深色页面统一、玻璃、空态、V3 无回归，已有截图证据；
- **Tab 选中态暂不冻结**：它有一个未解释的浅色异常，且无法用现有手段取得 computed style；
- 建议：要么接受「Tab 选中态带一个已知视觉瑕疵」冻结，要么给我一次 computed style / 重新加载后的截图，再决定用 §6 的哪一条修复。

在此之前不进入 Phase 4B，也不调整玻璃参数。
