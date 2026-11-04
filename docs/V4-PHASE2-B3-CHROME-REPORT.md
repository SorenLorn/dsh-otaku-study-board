# V4 阶段 2 · B3 Chrome 双标签页冲突测试报告

> 时间：2026-11-02 10:17 – 10:30
> 范围：只补 B3 剩余六个真实 Chrome 场景；**未开发 V4 UI、未进入 B3.5、未改业务逻辑**
> 结果：**6 / 6 通过**，B3 完成。

---

## 1. 测试环境（生产代码，无模拟）

- 测试页 `scripts/ui/conflict-harness.tsx`：真实 `useLocalStore`（含冲突判定）+ `ConflictHost` + `NoticeHost` + `writeTransaction`，React 18 由测试 bundle 自带；
- 驱动 `scripts/ui/conflict-browser.test.mjs`：本机 Chrome `--headless=new` + CDP，两个真实 target 同源共享 localStorage；
- 测试键 `dsh-otaku-study-board:__conflict_probe`（不触碰真实实体键）；
- **未修改** 生产入口、`build.mjs`、`package.json` 的 peerDependencies；
- 复跑：
  ```bash
  npx esbuild scripts/ui/conflict-harness.tsx --bundle --platform=browser --format=iife \
    --jsx=automatic --outfile=$TEMP/sorchron-conflict/harness.js
  node scripts/ui/conflict-browser.test.mjs
  ```

---

## 2. 六个场景结果

| # | 场景 | 初始 | 操作 | A 页面 | localStorage | 冲突提示 | 覆盖/丢失 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 交替写同一键（均已保存） | 空 | A 写 1 → B 写 2 | **2** | 2 | 无（不需要） | 无；A 自动同步 B 的值 | ✅ PASS |
| S2 | A 未保存时 B 修改 | A 写失败，UI=5，storage=0 | B 写 7 | **5（保留本地）** | 7 | **出现 1 条** | 无：本地未被覆盖 | ✅ PASS |
| S3 | A 点「重新载入」 | 承接 S2 | 关失败 → 点重新载入 | **7** | 7 | 冲突清除 | 无 | ✅ PASS |
| S4 | A 点「保留本页」 | A 写 9 失败，B 写 3 | 关失败 → 点保留本页 | **9** | **9（A 值写回）** | 冲突清除 | 无 | ✅ PASS |
| S5 | 批量写（导入）后 B 写入 | 空 | A `writeTransaction` 写两键（100 / 1）→ B 写 5 | **5** | 5，第二键仍为 1 | 无（A 已保存） | 无；B 写入生效、导入另一键保留 | ✅ PASS |
| S6 | 配额不足时保留本页 | A 写 11 失败，B 写 2 | 点保留本页（仍失败） | **11（保持未保存态）** | 2 | **冲突保留 1 条** | 无：A 值未写入，也未被远端覆盖 | ✅ PASS |

S6 的两条提示（真实 `NoticeHost`）：
`本地存储已满，本次修改没能保存。可以导出备份后清理旧日志` / `保留本页失败：本地存储不可写，改动仍未保存`。

> 说明：S1/S5 的「无冲突」是**预期**——本地已保存（dirty=false），远端变更应直接应用；冲突只在有未保存修改时出现。

---

## 3. 发现的问题与修复

| 问题 | 性质 | 处理 |
| --- | --- | --- |
| S5 首轮 FAIL：断言写成 `bulk === true`，而 `writeTransaction` 返回 `{ok,...}` | **测试期望错误**，非产品缺陷（数据实际正确：raw=5、第二键=1） | 改为 `bulk?.ok === true`；未改业务代码 |
| 冲突提示不显示 | 测试页缺少 `NoticeHost` | 测试页补渲染（生产组件），非产品缺陷 |

没有为了让测试变绿而放宽标准：S5 只修正了断言对象的结构，判定条件反而更精确。

---

## 4. 回归与体积

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 退出码 0 |
| `build.mjs` | 退出码 0；`lib/client.js` **382,874 B（与 B3 前完全一致）** |
| `register-check` | 本轮输出被 `tail` 截断未取到计数；上一轮为 13/13，**不计入本次新增通过** |
| `smoke.ts` | **386 / 386** |
| React 组件测试 | **10 / 10** |
| Chrome 冲突测试 | **6 / 6** |

测试依赖（react/react-dom/jsdom/@testing-library）只在 devDependencies，未被 `src` 引用，产物字节数 0 变化。

---

## 5. 剩余风险

| # | 风险 | 说明 |
| --- | --- | --- |
| 1 | 导入与另一标签页写入的**真并发**未覆盖 | CDP 的 evaluate 是串行执行的；S5 验证的是「导入后另一标签页写入生效」，不是同一毫秒的交错 |
| 2 | 12 键导入时多标签冲突聚合只在组件测试验证（C7），未在 Chrome 里一次导入 12 键 | 机制一致，但未端到端 |
| 3 | 冲突横幅没有键盘焦点管理 | 可访问性待 UI 阶段补 |
| 4 | 冲突只覆盖 `useLocalStore` 的 7 个 V3 键；V4 仓储（memory/knowledge…）没有走 hook，暂无冲突提示 | 阶段 3 UI 接入时需给 repo 也加冲突检测，或统一走 hook |

---

## 6. 是否具备进入 B3.5

**具备。**

- B3 的三项要求（组件测试设施、8 个组件用例、6 个 Chrome 场景）全部落地并有可复跑证据；
- 生产构建体积未变，旧 386 条断言与 10 条组件断言全部保留；
- 已知风险均记录在案，不阻塞 B3.5。

建议 B3.5 的第一件事仍是：**把 V3 组件的写操作改为调用 `actions.ts`**，否则日聚合/时间轴/历史依然不会在真实操作中更新。
