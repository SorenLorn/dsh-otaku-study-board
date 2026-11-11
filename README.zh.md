# Sorchron Study Board · 溯时学习工作台

[![version](https://img.shields.io/badge/version-4.0.0--rc.1-blue)](https://github.com/SorenLorn/dsh-otaku-study-board/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-22%20suites-brightgreen)](./TESTING.md)

[English](./README.md) · **中文**

一个 DSH（DeepSeek Harness）插件：在左侧导航里加一个面板，把仪表盘、任务、番茄钟、会话采集、
学习热力图与备份恢复放进同一个工作台，面向长期自学与独立开发的使用场景。所有记录只写入浏览器
`localStorage`，插件不发起任何网络请求。

---

## 目录

[功能特性](#-功能特性) · [安装](#-安装) · [快速上手](#-快速上手) · [配置说明](#-配置说明) ·
[截图](#-截图) · [开发与构建](#-开发与构建) · [卸载](#-卸载) · [贡献](#-贡献) · [许可证](#-许可证)

---

## ✨ 功能特性

面板分四个页面：**仪表盘**、**任务**、**历史**、**设置**（顶栏「数据」进入）。下表列出的能力均已
实装且能从界面操作，不存在点了没反应的占位按钮。

| 区域 | 能力 |
| --- | --- |
| **仪表盘** | 四个汇总指标（任务 / 完成 / 专注 / 连续）、今日任务可直接勾选、专注卡、项目进度、365 天学习热力图、近 7 日趋势、最近活动、知识与记忆只读概览 |
| **任务** | 新建、编辑、完成、重开、两步确认删除、搜索、排序、状态筛选、行内展开、详情抽屉 |
| **专注计时** | 基于时间戳的倒计时、暂停继续、短休长休、绑定任务、结束时显式结算、写入失败可重试、刷新与多标签下不重复记账 |
| **会话采集** | 只挂在工作台根节点一次；接收 DSH 会话事件，仅统计会话条数，不计入专注分钟 |
| **历史** | 30 / 90 / 365 天热力图（五档强度）、活跃天数、按天时间轴、连续天数 |
| **备份 / 恢复** | 全量、近 7 天、当月导出；导入前预览；合并或覆盖；事务回滚；存储探测；两步确认清空 |
| **设置** | 数据概览、会话采集开关、存储状态、导出、导入、危险区、能力边界 |

### 结算机制

结束一轮专注会写入四个实体——日志、日聚合、任务累计、时间轴事件——它们处于**同一个**事务中。
事务失败时这一轮会带着持久化基线留在待结算状态；插件先校验四个实体，再决定修复、重试，还是
不做任何改动。

界面只会给出三种结论：

| 状态 | 含义 |
| --- | --- |
| **已记入** | 四个实体全部校验通过 |
| **未保存**（红色） | 写入失败，本轮被保留，可重试 |
| **已放弃**（中性） | 仅在证明清理安全之后出现 |

当某一轮的日聚合或任务累计已经生效时，放弃会被拒绝：这两个结构不含 roundId，需要退回多少无法
推断。详见 [`KNOWN-LIMITATIONS.md`](./KNOWN-LIMITATIONS.md)。

## 📦 安装

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile desktop add github:SorenLorn/dsh-otaku-study-board
```

`lib/index.js` 与 `lib/client.js` 随仓库提供，本机无需构建。装完重载 DSH 窗口，左侧导航出现
**溯时学习工作台**（时钟图标，order 20）。

> `dsh plugin add dsh-otaku-study-board` 这种短写法要求包已发布到 npm。目前尚未发布，
> 请使用上面的 `github:` 形式。

### 从本地克隆安装

```bash
npm install
npm run build

dsh plugin --profile desktop add "file:/absolute/path/to/dsh-otaku-study-board"
dsh plugin --profile desktop list      # 确认已登记
```

### 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | `>= 20` |
| DSH | `0.1.1-rc.1` – `0.2.x`（见 `engines.dsh` 与 `peerDependencies`） |
| 浏览器 | 任意当前版本 Chromium 或 Firefox；存储需可用 |

也可以使用符号链接：profile 中的 `node_modules/dsh-otaku-study-board` 指向克隆目录时，
改完源码只需重新 `npm run build`，不必重装。

## 🚀 快速上手

1. **跑一轮专注** —— 仪表盘 → 专注卡 →「开始专注」。默认 25 分钟，展开设置可调 10–90 分钟。
   中途可暂停，结束后点「结束并记录」。
2. **记一件事** —— 任务页 →「新建」→ 填标题 → 在列表里勾选。
3. **看反馈** —— 首页热力图当天格子变色；悬停查看当天数字，点击打开当天详情。
4. **备份一次** —— 顶栏「数据」→ 导出 JSON。数据只存在于当前浏览器配置中。

一轮会话产生的数据：

```
09:30  开始 25 分钟专注，绑定任务「第三章 习题」
09:55  结束 → 1 条专注日志（25 分）+ 日聚合 +25
              + 任务 +25 分 / +1 个番茄
09:56  勾选任务 → 状态变为已完成，记下完成时间
       仪表盘：专注 25m · 任务 1 · 热力图得分 25 + 25×1 = 50 → 第 2 档
```

每个按钮的完整说明见 [`USER-GUIDE.md`](./USER-GUIDE.md)。

## ⚙️ 配置说明

没有配置文件——宿主半是刻意 no-op，插件由客户端 bundle 自行注册。运行期选项位于**设置（数据）**
页，保存在 `localStorage` 中：

| 选项 | 默认值 | 范围 / 说明 |
| --- | --- | --- |
| 专注时长 | 25 分钟 | 10–90 分钟，按轮生效 |
| 短休 | 5 分钟 | 1–30 分钟 |
| 长休 | 15 分钟 | 1–30 分钟 |
| 几轮后长休 | 4 轮 | 决定轮次指示 |
| 会话采集 | 开 | 关闭后不再产生新的采集记录 |
| 项目作用域 | 全部项目 | 两种情况都排除已归档项目的数据 |

数据存放在 14 个以 `dsh-otaku-study-board:` 为前缀的键中，写入信封 `{ schemaVersion: 4, data }`。
其中 `timer` 为瞬态键、`aiRuns` 为审计键，两者均不进备份。V1 / V2 / V3 的旧数据就地读取并在读时
补齐，打开页面不写回。

## 🖼️ 截图

| 仪表盘（浅色） | 专注计时 |
| --- | --- |
| ![仪表盘，浅色主题](assets/screenshots/dashboard-light-1440.jpg) | ![专注计时](assets/screenshots/focus-1440.jpg) |

| 仪表盘（深色） | 任务页 |
| --- | --- |
| ![仪表盘，深色主题](assets/screenshots/dashboard-dark-1440.jpg) | ![任务页](assets/screenshots/tasks-1440.jpg) |

截图取自独立 Chromium，宽度 1440px，使用真实组件与真实样式表；数字为演示数据。插件市场通过
[`screenshots.json`](./screenshots.json) 读取同一批文件，增删与替换方式见
[`assets/README.md`](./assets/README.md)。

## 🛠️ 开发与构建

```bash
npm run typecheck     # tsc --noEmit，必须 0 错误
npm run build         # 产出 lib/index.js + lib/client.js
npm run clean         # 删除 lib/
```

技术栈：React 18 函数组件与 hooks、TypeScript 5.6（`strict`）、esbuild 0.25（两个产物，无打包器
配置文件）、cordis 作为 DSH 插件运行时、手写 `.v4-*` 命名空间的 CSS。测试为纯脚本——组件测试用
jsdom，浏览器测试用独立 Chromium 走 CDP，不使用 jest 或 vitest。最常用的一条：

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=cjs --outfile=smoke.cjs && node smoke.cjs
```

### 目录结构

```
src/
  index.ts                 宿主半（Node ESM，刻意 no-op）
  client/
    index.tsx              注册左侧导航条目与页面
    v4/                    工作台：Shell、Dashboard、Tasks、History、Settings、
                           FocusPanel、Heatmap、CaptureBridge、浮层
    hooks/                 存储、看板数据、计时器、备份
    lib/                   专注状态机、结算、写事务、日聚合、活跃度统计、schema
    style/board.css        全部样式，构建时内联进 bundle
scripts/                   构建、注册检查、smoke 测试、UI 测试套件
lib/                       构建产物（入库）
assets/                    市场图标与截图
docs/                      awesome-dsh-plugin 收录条目
```

套件清单与未覆盖场景见 [`TESTING.md`](./TESTING.md)。设计约束——宿主 API 行为、事务语义、
存储规则——见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

## 🗑️ 卸载

```bash
dsh plugin --profile desktop remove dsh-otaku-study-board
```

如果 profile 的 `package.json` 中 `dsh.profile.bundles` 仍列着 `dsh-otaku-study-board`，请一并删除
该行，否则加载器会继续查找一个已不存在的包。之后重载窗口。

卸载不会删除数据。如需一并清理，在 DSH 窗口的开发者工具中执行：

```js
Object.keys(localStorage)
  .filter(k => k.startsWith('dsh-otaku-study-board:'))
  .forEach(k => localStorage.removeItem(k))
```

## 🤝 贡献

欢迎提交 issue 与 PR。提 PR 之前：

- `npm run typecheck` 与上面的 smoke 命令必须通过。
- 写入失败就报失败，判断不了就报无法确定；不允许存在点了不产生任何效果的按钮。
- 修改业务逻辑请附带测试；仅文档改动不需要。

## 📄 许可证

MIT —— 见 [`LICENSE`](./LICENSE)。

## 延伸阅读

| 文档 | 内容 |
| --- | --- |
| [`USER-GUIDE.md`](./USER-GUIDE.md) | 每个按钮的操作步骤与常见问题 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 模块划分、数据流、一致性约束 |
| [`KNOWN-LIMITATIONS.md`](./KNOWN-LIMITATIONS.md) | 确实存在的限制与未实现项 |
| [`TESTING.md`](./TESTING.md) | 如何运行测试、覆盖了什么 |
