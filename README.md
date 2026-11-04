# Sorchron Study Board · 溯时学习工作台

A local-first study workbench for **DSH (DeepSeek Harness)**. One workspace — dashboard, tasks,
pomodoro focus timer with crash-safe settlement, Harness session capture, activity history and JSON
backup — for people who study or code solo and want their records to stay on their own machine.

> **Version** `4.0.0-rc.1` · license MIT · no network calls, no account, no telemetry.
> Every number you see comes from your own `localStorage`.

---

## 1. 项目定位

- **一种人**：长期自学 / 独立开发，用「任务 + 专注时长 + 会话记录」衡量自己的投入。
- **一个界面**：Phase 5.2 起只有**一套**统一工作台（V4）。V3 的卡片界面不再渲染，源码与旧数据
  兼容逻辑保留（见 §7）。
- **一条红线**：不假装成功。写不进去就说「未保存」，判断不了就说「无法确定」，没做的功能明确
  标「尚未开放」，绝不提供一个点了没反应的按钮。

## 2. 核心功能（已上线）

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| Dashboard | ✅ | 4 个指标（任务 / 完成 / 专注 / 连续）+ 今日任务 + 专注卡 + 项目进度 + **全年学习热力图** + 近 7 日趋势 + 最近活动 + 知识与记忆只读概览 |
| 任务 | ✅ | 新建 / 编辑 / 勾选完成 / 重开 / 两步确认删除 / 搜索 / 排序 / 状态筛选 / 行内展开 / 详情抽屉 |
| 专注计时 | ✅ | 时间戳计时、暂停继续、短休长休、任务绑定、结束结算、失败重试、刷新与多标签不重复记账 |
| 会话采集 | ✅ | 挂在工作台根节点，接收 DSH 事件与会话数据，只计「会话条数」，不进专注分钟 |
| 历史 | ✅ | 30 / 90 / 365 天热力图（五档强度，与首页同一组件同一份聚合）、活跃天数、按天时间轴、连续学习 |
| 备份 / 恢复 | ✅ | 全量 / 近 7 天 / 当月导出，导入预览、合并或覆盖、事务回滚、存储观测、二次确认清空 |
| 设置 | ✅ | 数据概览、会话采集开关、存储状态、导出、导入、危险区、能力边界 |

未上线能力见 [`KNOWN-LIMITATIONS.md`](./KNOWN-LIMITATIONS.md)，产品内也可从顶部「迁移计划」查看。

## 3. 技术栈

React 18（函数组件 + hooks）· TypeScript 5.6（`strict`）· esbuild 0.25（两个产物，无打包器配置
文件）· cordis（DSH 插件运行时）· 手写设计系统（`.v4-*` CSS 命名空间，约 4.9k 行）·
测试：jsdom + @testing-library/react + 独立 Chromium（CDP），**无 jest / vitest**。

## 4. 目录结构

```
src/
  index.ts                    # 宿主半（Node ESM，刻意 no-op）
  client/
    index.tsx                 # 客户端入口：注册左侧导航 + main 面板，注入样式
    v4/                       # 唯一用户工作台
      Shell.tsx               # 顶栏：品牌 / 页面 / 项目作用域 / 日期 / 新建 / 数据 / 迁移计划
      Dashboard.tsx Tasks.tsx History.tsx Settings.tsx
      FocusPanel.tsx          # 专注卡（计时 + 绑定 + 未保存恢复）
      Heatmap.tsx             # 学习活动热力图（Dashboard 与 History 共用）
      CaptureBridge.tsx       # 采集的唯一挂载点（根节点）
      Detail.tsx DetailContent.tsx Expandable.tsx workspace.tsx
      TaskComposer.tsx useDataTransfer.ts ui.tsx
    hooks/                    # useLocalStore / useBoardData / useBoardActions / useTimer …
    lib/
      settlement.ts           # 专注结算事务 + 四实体校验 + 修复（最需要小心的一块）
      tx.ts                   # 通用写事务（先序列化 → 逐写 → 失败逆序回滚）
      focus.ts                # 纯状态机（时间作参数，无 React）
      daily.ts activity.ts heatmap.ts stats.ts history.ts backup.ts schema.ts
      repo/                   # V4 实体的仓储端口（persistent / memory / blocked 三态）
    style/board.css           # 全部样式，构建时内联进 bundle
    board/ charts/ ui/        # V3 组件（保留、不参与渲染，见 §7）
scripts/
  build.mjs                   # 产物：lib/index.js + lib/client.js
  register-check.mjs          # 13 项注册/样式/slot 检查
  smoke.ts                    # 415 项纯逻辑
  ui/*.test.ts(x)|mjs         # 22 个测试套件（jsdom / 纯逻辑 / Chromium）
docs/ reports/                # 设计依据与审计（只留对当前代码仍然成立的；更早的阶段报告在 git 历史里）
```

## 5. 安装（作为 DSH 插件）

**从仓库安装（推荐）**

```bash
dsh plugin --profile desktop add github:Ebony-Vinyl/dsh-otaku-study-board
```

`lib/` 随仓库提供，不需要在本地构建；装完重载窗口，左侧导航出现 **溯时学习工作台**。
（尚未发布到 npm，所以没有 `dsh plugin add dsh-otaku-study-board` 这种短写法。）

**从本地源码安装（开发者）**

```bash
# 1. 构建
npm install
npm run build                      # → lib/index.js + lib/client.js

# 2. 装进 profile（profile 名按你自己的来，桌面端通常是 desktop）
dsh plugin --profile desktop add "file:/absolute/path/to/dsh-otaku-study-board"

# 3. 重载 DSH 窗口
dsh plugin --profile desktop list   # 应能看到 dsh-otaku-study-board
```

左侧导航栏会出现 **溯时学习工作台**（时钟图标，order 20，排在「插件」「自动化任务」之后），
点击后主区切换为工作台页面。

> **路径注意（Windows）**：如果检出路径里含 `‑`（U+2011 非断字连字符，作者本机的历史目录名），
> esbuild 的 postinstall 会通过 `cmd.exe` 校验二进制，默认代码页会把它弄乱，`npm install` 可能报
> `Command failed: ...\esbuild.exe --version`。两种解法：把目录改成纯 ASCII（推荐，正常从
> GitHub 克隆就是 `dsh-otaku-study-board`），或用 `npm install --ignore-scripts`
> （预编译的 `@esbuild/win32-x64` 已在 `node_modules` 里，`npm run build` 照常可用）。
>
> 安装目录可以是符号链接：桌面 profile 里 `node_modules/dsh-otaku-study-board` 指向本仓库时，
> 改完源码跑一次 `npm run build` 即可，重载窗口生效，不需要重新安装。

## 6. 开发与构建

```bash
npm run typecheck     # tsc --noEmit（必须 0 错误）
npm run build         # 两个产物；client.js 约 520 KB
npm run clean         # 删掉 lib/
```

测试全部用脚本跑，没有测试框架。命令与环境变量见 [`TESTING.md`](./TESTING.md)；
最常用的一条：

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=cjs --outfile=smoke.cjs && node smoke.cjs
```

关于设计约束（后端能力、宿主 API 实测结论、结算事务为什么长这样），先读
[`ARCHITECTURE.md`](./ARCHITECTURE.md) —— 尤其是 `lib/settlement.ts` 开头那段注释。

## 7. 关于 V3 代码与旧数据

- `src/client/board/`、`src/client/charts/`、`src/client/ui/ConfirmDialog.tsx` 以及
  `hooks/useProject|useContextStats|useFrictionLog|useSlashCommand`、`lib/commands|context|snapshot|subtask`
  **不在客户端 bundle 里**（用 esbuild metafile 实测，60/87 个源文件进 bundle）。
- 它们保留的原因：**旧数据兼容与后续迁移的参考实现**，不是死代码可随手删。删除前必须确认
  14 个存储键的读写兼容不受影响。
- 旧数据读取：`lib/schema.ts` 的 `unwrapEnvelope` 接受 V1（裸数组）、V2、V3（信封）与 V4，
  读时补齐字段、打开页面不写回。

## 8. 本地数据

- 14 个 `localStorage` 键，前缀 `dsh-otaku-study-board:`，写入信封 `{ schemaVersion: 4, data }`。
- `timer` 是瞬态键（不进备份）；`aiRuns` 是审计键（不进备份、不参与统计）。
- 换浏览器 / 清缓存 = 数据消失。定期用「数据 → 导出」保存 JSON。

## 9. 已知限制

见 [`KNOWN-LIMITATIONS.md`](./KNOWN-LIMITATIONS.md)。最短版本：多标签页跨轮次并发写入没有锁
（localStorage 无 CAS）、日聚合没有项目维度、会话日志逐个明细与部分 V3 能力尚未迁移、
真实 DSH 宿主内的验收仍需人工确认。

## 10. License

MIT
