# V4 Phase 4A.3 · 宿主验收报告（含证据采集工具）

> 版本 4.0.0-rc.1 ｜ DSH CLI 0.1.1-rc.2
> **本轮未执行真实 DSH 宿主验收**：我没有你的桌面会话，也没有 4A.2 之后的任何截图。
> 按你的规则，**不能把静态 CSS 审查或 jsdom 结果当作宿主验收**，因此结论只能先记为 C（未通过/未验证），直到你回传证据。

---

## 1. 环境信息

| 项 | 值 |
| --- | --- |
| DSH CLI | 0.1.1-rc.2（已确认） |
| 插件版本 | 4.0.0-rc.1 |
| 安装方式 | 你在 `desktop` profile 中本地路径安装（link），我未执行 |
| 是否真实运行 | **本轮没有**（无宿主画面、无浏览器控制台访问） |
| 代码基线（4A.2 后） | tsc 0 / smoke 403 / 组件 25 / register 13 / build 430,767 B |

---

## 2. 宿主验收结果（全部未验证）

| 项 | 结果 | 说明 |
| --- | --- | --- |
| V4 浅色毛玻璃 | 未验证 | L1 `.52` 的实际透色、中部渐变是否压字，均无截图 |
| V4 深色 L1/L2 | 未验证 | `.66 / .44` 的明度差是否可辨、文字是否清晰，无截图 |
| V3 经典浅色 | 未验证 | 4A.2 未改 V3 浅色规则，但没有新截图 |
| V3 环形图空态 | 未验证 | 代码已改；需在经典统计卡里看 160px 空态的实际垂直位置 |
| 1440 / 1100 / 720 | 未验证 | 没有测量值 |
| 视图切换首帧 | 未验证 | 静态截图无法判断闪白 |
| 弹窗层级 | 未验证 | 需要「打开确认框时通知条存在」的截图 |
| 滚动与背景 | 未验证 | 需要滚动后截图 |
| 控制台错误 | 未验证 | 没有控制台输出 |
| backdrop-filter 性能 | **未测量** | 没有 FPS 数据；上一轮 HUD 显示 `FPS N/A`，不能作为依据 |

---

## 3. 证据采集（请按顺序执行，约 5 分钟）

### 3.1 准备

```powershell
# 让 DSH 重新加载本地插件（不重装、不改依赖）
dsh plugin --profile desktop install
# 然后由你重启 DSH（或完全退出后重开）
```

确保能看到页面后，按 F12 打开 DevTools。

### 3.2 每个宽度执行一次这段脚本

```js
(() => {
  const page = document.querySelector('.v4-page');
  const l1 = page && page.querySelector('.v4-glass-1');
  const l2 = page && page.querySelector('.v4-glass-2');
  const cs = el => (el ? getComputedStyle(el) : null);
  const info = el => el ? {
    background: cs(el).backgroundColor,
    border: cs(el).borderColor,
    backdrop: cs(el).backdropFilter || cs(el).webkitBackdropFilter,
    shadow: cs(el).boxShadow.slice(0, 80),
  } : null;
  return {
    view: page ? 'v4' : 'classic',
    theme: document.documentElement.getAttribute('data-theme') || '(未设置)',
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    l1: info(l1),
    l2: info(l2),
    heroWidth: Math.round(document.querySelector('.osb-hero')?.getBoundingClientRect().width || 0),
    pageWidth: Math.round(page?.getBoundingClientRect().width || 0),
  };
})()
```

**请把返回值原样贴给我**，尤其是 `scrollWidth / clientWidth / overflowX` 与 `l1/l2` 的 background/border。

### 3.3 需要的截图（缺一不可）

1. V4 浅色 · 顶部（含 Hero、项目条、Tab、四张统计卡）；
2. V4 浅色 · 向下滚动到「最近活动 / 项目概览」；
3. V4 深色 · 同 1；
4. V4 深色 · 同 2；
5. V3 经典浅色 · 统计卡的「当日会话构成」空态；
6. 弹窗：在 V3 或 V4 点一个删除操作，让确认框与通知条同时出现；
7. 720 / 1100 / 1440 各一张（可用 DevTools 设备工具栏切换宽度，截图含宽度信息更好）。

### 3.4 视图切换首帧

DevTools → Performance 录制 → 点「V4 Dashboard / 经典工作台」切换两次 → 停止。
看是否有一次白色闪帧；如果有，截取该帧时间点。

### 3.5 性能

DevTools → Performance 录制 5 秒（期间滚动两屏），记录 **FPS 平均值与长任务数量**。
如果拿不到，就写「未测量」，不要写「正常」。

---

## 4. 修改记录

**本轮无代码修改。** 4A.2 的参数即为待验收版本：

| 项 | 值 |
| --- | --- |
| 浅色 L1 | `rgba(255,253,250,.52)` |
| 浅色 L2 | `rgba(255,255,255,.40)` |
| 深色 L1 | `rgba(46,39,49,.66)`，边框 `.10` |
| 深色 L2 | `rgba(48,41,52,.44)`，边框 `.06` |
| 中部落日渐变 | `radial-gradient(74% 56% at 50% 60%, rgba(208,184,198,.26), transparent 74%)` |

---

## 5. 遗留问题（先记录，不修）

| 分类 | 项 |
| --- | --- |
| 必须修复（若截图证实） | `.52` 导致正文对比度不足 → 回退 `.55`；中部渐变压暗 Hero 标题 → 下移或降低 alpha |
| 可以延期 | 4B 的按钮统一、统计卡微可视化、V3 深色 Add 按钮、任务行图标对比度 |
| 不属于本阶段 | 无数据时统计卡的大面积留白、快捷入口样式、字号阶梯 |

---

## 6. 最终结论

**C · 未通过（未验证）。**

原因不是发现了失败，而是**宿主验收还没有发生**：没有 4A.2 之后的截图、没有 `scrollWidth` 测量、没有深色实机、没有弹窗层级证据。按你的规则，这些都不能用代码审查替代。

你把 §3 的返回值与 6 类截图发我后，我可以：
- 若数值与观感都正常 → 改判 **A（冻结，进入 4B）**；
- 若只差对比度或渐变位置 → 改判 **B（小范围修复后复验）**；
- 若出现溢出或层级遮挡 → 保持 C 并给最小修复。

在此之前，不进入 Phase 4B，也不调整参数。
