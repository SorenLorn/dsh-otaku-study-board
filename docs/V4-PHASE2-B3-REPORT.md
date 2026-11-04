# V4 阶段 2 · B3 报告（组件测试设施）

> 时间：2026-11-02 10:09 – 10:32
> 范围：只做 B3（组件测试设施与冲突验收），**未开发 V4 UI、未进入 B3.5**
> 结论：**组件设施完成（10/10）；6 个 Chrome 冲突场景未执行 → 暂不具备进入 B3.5 的条件。**

---

## 1. 依赖变更与兼容性

安装前核查：peer `react ^18.3.1` / `react-dom ^18.3.1`、`jsx: react-jsx`、esbuild external 已含 `react`/`react-dom`/`jsx-runtime`、本地未安装 React（无版本冲突）。

```bash
npm i -D react@18.3.1 react-dom@18.3.1 jsdom@^24.1.3 @testing-library/react@^14.3.1
# added 134 packages
```

| 包 | 版本 | 位置 | 进生产包 |
| --- | --- | --- | --- |
| react | 18.3.1 | devDependencies | ❌ |
| react-dom | 18.3.1 | devDependencies | ❌ |
| jsdom | 24.x | devDependencies | ❌ |
| @testing-library/react | 14.3.x（对应 React 18） | devDependencies | ❌ |

未改动 `peerDependencies`、未升级其它依赖、`build.mjs` 未动。

**踩坑（可复现）**：
- esbuild 打包 jsdom 会因 `require.resolve('./xhr-sync-worker.js')` 在 node 端崩 → 必须 `--external:jsdom`，且产物输出到项目内（否则解析不到 `node_modules`）；
- Node 22 的 `globalThis.navigator` 是只读 getter → 用 `Object.defineProperty` 注入，直接赋值会 `TypeError`；
- jsdom 的 `Storage` 方法在原型上，给实例赋值不生效 → 必须改 `Storage.prototype.setItem`。

---

## 2. 组件测试设施

- 目录：`scripts/ui/`；入口 `components.test.tsx`；
- 运行方式（无 jest/vitest）：
  ```bash
  npx esbuild scripts/ui/components.test.tsx --bundle --platform=node --format=cjs \
    --jsx=automatic --external:jsdom --outfile=scripts/ui/.build/ui.cjs \
    && node scripts/ui/.build/ui.cjs
  ```
- 真实渲染：`@testing-library/react` 的 `render / screen / fireEvent / waitFor / act`，组件是生产代码本身（`TaskList`、`ConflictHost`、`NoticeHost`、`useLocalStore`），**没有任何 stub 组件**。

---

## 3. 组件渲染与交互结果（10/10）

| # | 用例 | 结果 |
| --- | --- | --- |
| C1 | `TaskList` 首次渲染出标题 | ✅ |
| C2 | 空状态文案「还没有目标…」 | ✅ |
| C3 | 输入标题 + 点 Add → 任务出现在列表 | ✅ |
| C4 | 错误提示经 `NoticeHost` 渲染（真实 bus） | ✅ |
| C5 | 无冲突时不渲染横幅 | ✅ |
| C6 | 单键冲突显示键名 | ✅ |
| C7 | 两键冲突合并为「2 项数据」一条横幅 | ✅ |
| C8 | 点「重新载入」派发 `reload` 决议 | ✅ |
| C9 | 点「保留本页」派发 `keep` 决议 | ✅ |
| C10 | 写入抛 `QuotaExceededError` 时出现「已满 / 没有保存」提示 | ✅ |

C10 是真实的 `useLocalStore` 写入失败路径：`Storage.prototype.setItem` 对 tasks 键抛错 → `writeStore` 捕获 → `pushNotice` → `NoticeHost` 渲染。

---

## 4. 六个 Chrome 双标签页冲突场景

**未执行。** 原因：冲突 UI 依赖 React 组件，现有 CDP harness 是纯 IIFE（无 React）。要跑这 6 项，需要再做一个「React + useLocalStore + ConflictHost」的测试页 bundle 并在两个 target 里驱动。

| # | 场景 | 状态 |
| --- | --- | --- |
| 1 | A/B 交替修改同一任务 | 未执行 |
| 2 | A 未保存时 B 修改 | 未执行 |
| 3 | A 重新载入后与 B 一致 | 未执行 |
| 4 | A 保留本页后与 A 一致 | 未执行 |
| 5 | 导入期间另一标签页写入 | 未执行 |
| 6 | 配额不足时冲突处理失败提示 | 未执行 |

已有的相关证据（不能替代上述验收）：
- `browser-test.mjs` 的 T4/T5：真实 Chrome 两标签页写同一键 = 后写覆盖、storage 事件恰好 1 次；
- `smoke [28] B1–B5`：`decideRemoteChange` 的决策表与冲突登记表合并/清除。

**按要求，这 6 项不记为通过。**

---

## 5. 生产构建体积

| 版本 | `lib/client.js` |
| --- | --- |
| B1/B2 后 | 382,874 B |
| B3 后（本次） | **382,874 B（0 变化）** |

devDependencies 不被 `src` 引用，产物字节数完全一致（已重跑构建确认）。

---

## 6. 仍未解决的风险

| # | 风险 | 级别 |
| --- | --- | --- |
| 1 | 6 个 Chrome 冲突场景未执行 | **阻断 B3.5** |
| 2 | 冲突「保留本页」的真实重写只在 jsdom 里验证，未在真浏览器双标签页验证 | 高 |
| 3 | UI 仍未调用 `actions.ts`（B3.5 的前置，本批次范围外） | 高 |
| 4 | 组件测试只覆盖 3 个组件，记忆/知识/时间轴视图尚不存在 | 中 |
| 5 | 测试脚本需手动 esbuild，未接入 npm script（不影响正确性） | 低 |

---

## 7. 是否具备进入 B3.5 的条件

**暂不具备。**

- 组件测试设施（B3 的核心目标）已完成，10 项真实渲染全过；
- 但第三部分要求的 6 个真实 Chrome 冲突场景一项都没跑，冲突处理是**数据安全相关**的功能，「决策函数通过」不等于「界面链路通过」；
- 建议下一步（仍在 B3 内）：搭一个 React 版 CDP 测试页（bundle 里带 `useLocalStore` + `ConflictHost` + 一个可编程的写按钮），把 6 个场景跑完，再判 B3.5。

**在 6 个场景跑完之前，我不会开始 B3.5，也不会开发 V4 页面。**
