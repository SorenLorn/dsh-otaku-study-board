# 收录标准核对 · awesome-dsh-plugin

> 依据：awesome-dsh-plugin 官方 `contributing.md`（2026-11 版）
> 被检对象：`dsh-otaku-study-board` 4.0.0-rc.1（仓库根目录）
> 核对时间：2026-11-04

---

## 0. 结论

**插件本身够格，但现在还交不了。**

拆开看是两件事：

- **代码与 manifest 侧：通过。** `dsh.bundle.patch` 齐备、`cordis.patch.yml` 一行 `insert` 正确、
  包自包含（`npm pack` 10 个文件 630 KB）、产物里零网络调用 / 零 `eval` / 零密钥、
  22 套 898 项测试全绿。评审最看重的「是不是真能装、装了真会做事」这一条，本地是能证明的。
- **投稿形态侧：不通过。** 这个目录**根本不是 git 仓库**（无 `.git`、无 remote、无历史），
  因此「1 天年龄」「`dsh-plugin` topic」「条目文件里的 `owner/repo`」三项**全部无从谈起**。
  而收录的第一步就是把 `data/plugins/<owner>__<repo>.yml` 提上去 —— 没有仓库就没有这一行。

另外三个会拖后腿的问题（都能在投稿前一小时修完）：

| # | 问题 | 严重度 |
| --- | --- | --- |
| 1 | 工作区 142 MB（`reports/` 120 MB + `scripts/ui/.build/` 20 MB），一旦 `git add .` 就是灾难 | 高 |
| 2 | `@deepseek-ai/*` 的 peer 范围**排除**了 `0.2.1-rc.2`，而 `engines.dsh` 又明确允许它 | 高（会让用户 `ERESOLVE`） |
| 3 | 没有 `screenshots.json` / `icon`，README 也没有面向安装者的一行安装命令 | 中（可选，但影响上架观感） |

---

## 1. 硬性门槛（CI 逐条检查的）

| 文档要求 | 结果 | 证据 |
| --- | --- | --- |
| `package.json` 声明 `dsh.bundle` manifest | ✅ | `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web" }, "manifestVersion": 1 }` |
| 仓库根有 `cordis.patch.yml`，且是一行 `insert` | ✅ | `- insert: [{ id: otaku-study-board, name: dsh-otaku-study-board }]`，`name` 与包名一致 |
| 仓库有真实可用代码（非占位/空壳） | ✅ | `src/` 88 个文件、构建产物 `lib/client.js` 542,096 B；宿主半 `apply()` 刻意 no-op（纯 UI 插件，README §4 已写明）；22 套 / 898 项测试 |
| 仓库创建满 1 天 | ❌ **无法验证** | `git status` → `fatal: not a git repository`；无 `.git`、无 remote、无 commit |
| 仓库加 `dsh-plugin` topic | ❌ 无从谈起 | 同上，没有远端仓库 |
| 提交 `data/plugins/<owner>__<repo>.yml` | ❌ 缺失 | 工作区内不存在该文件，也没有确定的 `owner/repo` |
| 一个 PR ≤ 3 条 | ✅ 不适用 | 只会提 1 条 |
| `awesome-lint` / 站点构建 | — 不适用 | 跑在对方仓库 |
| 官方包用 `peerDependencies` 而非 `dependencies` | ✅ | `dependencies` 为空；`@deepseek-ai/*` 全在 peer，React 也是 peer |
| peer 范围带显式预发布分支 | ⚠️ **部分不达标** | 见 §4.2：`0.2.1-rc.2` 被判为不满足 |

---

## 2. 评审读码项（维护者会实际打开仓库看）

| 评审关注点 | 结果 | 说明 |
| --- | --- | --- |
| 描述与代码一致（含数字、命令、API 名） | ✅（已修一处） | README 能力表逐条对得上代码；`npm pack` 10 文件与 `files` 一致；**修正了「21 个测试套件」→ 22**（上一阶段新增两套后失准，属于「描述必须属实」的硬伤） |
| 描述无营销词 | ✅ | package.json / README 均为陈述句，无「最强/唯一/极致」类表述 |
| 分类是否贴合 | ✅ 建议 `ui` | 它是带浏览界面（Dashboard / 任务 / 历史）的侧栏工作台，不是主题、不是纯统计工具；`usage` 亦可，但 `ui` 更贴 |
| 是否已被现有条目覆盖 | ⚠️ 未能核实 | 本机无该列表的 `data/plugins/` 快照，无法比对是否已有同类学习/番茄钟插件。投稿前建议自己扫一遍 `ui` 与 `usage` 两个分类 |
| 源码是否有可疑之处（混淆 / 凭据外传 / 安装期异常） | ✅ | 产物中 `fetch(` / `XMLHttpRequest` / `sendBeacon` / `EventSource` / `WebSocket` / `eval(` / `new Function` 命中数均为 **0**；唯一 URL 是 SVG 命名空间 `http://www.w3.org/2000/svg`；`src` 内无 apiKey/token 字样（`token` 命中均为 LLM token 计数） |
| 是否纯聚合包（meta-package） | ✅ 不是 | 零 `dependencies`，`lib/client.js` 自带全部行为 |
| 依赖是否指向原作者 | ✅ 不适用 | 无依赖清单 |
| 安装期行为是否意外 | ✅ | `scripts` 只有 `build` / `typecheck` / `clean`，**无 `prepare` / `postinstall`**；`lib/` 直接随仓库提供，源码安装不需要构建授权 |

---

## 3. 阻断项（按这个顺序做）

### 3.1 先让它是「一个仓库」

```bash
cd <repo>
git init -b main
# 先写 .gitignore，别急着 add（见 3.2）
git add -A
git commit -m "feat: Sorchron Study Board 4.0.0-rc.1"
git remote add origin https://github.com/<owner>/dsh-otaku-study-board.git
git push -u origin main
```

然后：GitHub 仓库页 → Topics → 加 **`dsh-plugin`**。

### 3.2 先止血：142 MB 的测试产物不能进仓库

当前除 `node_modules` 外的工作区就是 **142 MB**，其中 `reports/` 120 MB（147 张 PNG，
单张最大 3.3 MB）、`scripts/ui/.build/` 20 MB。直接 `git add .` 会把这两坨推上去 ——
克隆慢、仓库重，评审第一眼就会皱眉。

建议的 `.gitignore`（**保留 `lib/`**，因为 `main` 指向它、且没有构建脚本兜底）：

```gitignore
node_modules/
reports/
scripts/ui/.build/
smoke.cjs
*.log
.DS_Store
```

如果想让仓库里留几张截图给 README 用，就把挑好的 3–5 张放进 `assets/screenshots/`
（约 1–2 MB），其余仍由 `reports/` 忽略。**注意：`lib/` 必须提交**，否则
`dsh plugin add github:...` 装完是个没有入口的空包。

### 3.3 满 1 天后提 PR

CI 会自动读仓库年龄。刚 push 完就提会被挡在「0.x 天」，**几小时后自己就达标**，
不用重开 PR（文档 §「What CI checks」+ held 说明）。等一天再提最省事。

### 3.4 条目文件（把 `<owner>` 换成你的 GitHub 账号）

`data/plugins/<owner>__dsh-otaku-study-board.yml`：

```yaml
url: https://github.com/<owner>/dsh-otaku-study-board
name: <owner>/dsh-otaku-study-board
category: ui
description:
  en: A local-first study workbench for DSH with dashboard, tasks, a pomodoro timer with crash-safe settlement, session capture, a 365-day activity heatmap, and JSON backup.
  zh: DSH 的本地学习工作台：仪表盘、任务、带崩溃安全结算的番茄钟、会话采集、365 天学习热力图与 JSON 备份。
```

> `en` 结尾有句号、无营销词、每个名词都能在仓库里找到对应实现（这是评审第 1 条要核的）。
> 中文里没有半角 `: `，不必加引号；如果你改写成含 `: ` 的句子，记得整体加单引号。

---

## 4. 建议项（不影响收录，影响安装体验）

### 4.1 发 npm 或挂 tarball

目前只能源码安装（可以，因为 `lib/` 随仓库走），但会触发 `allowBuilds` 构建授权流程。
发个 npm 包能直接跳过；`repository` 字段要指回该仓库（当前 `package.json` 只有
`author: "dsh-otaku-study-board contributors"`，**没有 `repository` 字段** —— 建议补上，
否则 npm 包与列表条目无法关联）。

### 4.2 ⚠️ peer 范围排除了 `0.2.1-rc.2`（建议投稿前修）

文档专门警告过：预发布版本只有在该 `major.minor.patch` 元组上存在**带预发布标签的比较符**时
才会被放行。实测（npm 自带 semver）：

```
范围  >=0.1.1-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0
0.1.1-rc.1   OK
0.2.0-rc.1   OK
0.2.5        OK
0.1.2-rc.1   NO
0.2.1-rc.2   NO   ← engines.dsh 明确允许这个版本
```

而 `engines.dsh` 写的是 `">=0.2.0-rc.2 || >=0.2.1-rc.2"`，`0.2.1-rc.2` 是 OK 的。
**两处自相矛盾**：harness 若是 `0.2.1-rc.2`，`npm install` 会在 peer 上 `ERESOLVE`。

最小修法（给每个要支持的 minor 补一条带预发布标签的分支）：

```jsonc
"@deepseek-ai/dsh-client-ui-primitives": ">=0.1.1-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0",
"@deepseek-ai/dsh-tools":                ">=0.1.1-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0"
```

（同理，`engines.dsh` 也排除了 `0.2.2-rc.x` 与 `0.3.0-rc.x`；如果打算跟到 0.3，需要再加分支。
这一轮**没有改动** `package.json` —— 改 peer 范围等于改安装契约，等你确认要支持哪个版本线再动。）

### 4.3 截图与图标

- 仓库根加 `screenshots.json` 列 1–8 张图（相对路径、不得 `..`）。手头现成的候选：
  `reports/v4-dash-heat-1440-light.png`（首页热力图）、`glass-after-dashboard-light-1440.png`、
  `v4-dash-heat-1440-dark.png`。放进 `assets/screenshots/` 再引用更稳。
- `icon`：需要 GitHub 托管的方形位图（约 96px 显示）。目前**没有**，会回退到作者头像。

### 4.4 README 面向安装者的那一段

现在 README 是开发者视角（`npm install` / `npm run build`）。市场用户需要的是：

```
dsh plugin add dsh-otaku-study-board        # 或 github:<owner>/dsh-otaku-study-board
```

建议在 §1 之前补两行，否则用户点进来先看到的是构建命令。

---

## 5. 已核对通过的证据（可复现）

```bash
# manifest
node -e "const p=require('./package.json');console.log(p.dsh.bundle,p.dsh.client.platform)"
# → { patch: './cordis.patch.yml' } web

# 包内容：10 个文件、629,787 B，lib 与文档齐全，无源码泄漏
npm pack --dry-run --json

# 产物安全性：0 命中
grep -oE "fetch\(|XMLHttpRequest|sendBeacon|EventSource|WebSocket|new Function|eval\(" lib/client.js | wc -l
# → 0

# 门禁（本阶段全绿）
npx tsc --noEmit                 # 0
node scripts/build.mjs           # lib/client.js 542,096 B
node scripts/register-check.mjs  # 13/13
node smoke.cjs                   # 415/415
# jsdom 10 套 608 项 + Chromium 12 套 290 项 = 898
```

---

## 6. 一页 checklist（投稿前照着勾）

- [ ] `git init` + 推送 GitHub，仓库名 = 包名
- [ ] 写 `.gitignore`，确认 `reports/`、`scripts/ui/.build/`、`node_modules/` 没进 commit
- [ ] 确认 `lib/` **进了** commit（`git ls-files lib`）
- [ ] 补 `repository` 字段指向该仓库
- [ ] 决定 peer 版本线并修 §4.2 的分支
- [ ] 加 `dsh-plugin` topic
- [ ] 等满 1 天
- [ ] 决定是否加 `screenshots.json` / `icon` / 安装命令行
- [ ] 提 PR：只加 `data/plugins/<owner>__dsh-otaku-study-board.yml` 一个文件
- [ ] 若被 `held: author`：改完推同一分支，留**一条**评论
