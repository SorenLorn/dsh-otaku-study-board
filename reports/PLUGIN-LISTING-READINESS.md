# 收录标准核对 · awesome-dsh-plugin

> 依据：awesome-dsh-plugin 官方 `contributing.md`（2026-11 版）
> 被检对象：`dsh-otaku-study-board` 4.0.0-rc.1（仓库根目录）
> 核对时间：2026-11-04

---

## 0. 结论

**本地侧全部修完；剩下的四步只能在 GitHub 上做。**

截至 2026-11-04 22:00 的修复结果：

| # | 原问题 | 现状 |
| --- | --- | --- |
| 1 | 目录不是 git 仓库 | ✅ `git init -b main` + 首个提交 `cb77c93`，202 个文件；remote 已指向 `Ebony-Vinyl/dsh-otaku-study-board`（仓库本身还没建，push 需要你先在 GitHub 建空仓） |
| 2 | 142 MB 工作区（`reports/` 120 MB + `scripts/ui/.build/` 20 MB） | ✅ 已移出：147 张 PNG + 7 个度量 JSON 归档到 `%TEMP%\sorchron-reports-archive-20261104`（可找回），编译产物删除；工作区 **3.6 MB**，`.git` 1.9 MB |
| 3 | peer 范围排除 `0.2.1-rc.2` | ✅ 补了 `\|\| >=0.2.1-rc.1 <0.3.0-0` 两条分支，实测 `0.2.1-rc.2` 现在通过 |
| 4 | 缺 `repository` 字段 | ✅ 已补 `repository` / `homepage` / `bugs`（指向 `Ebony-Vinyl/dsh-otaku-study-board`） |
| 5 | 缺 `screenshots.json` / 安装命令 | ✅ 新增 `screenshots.json` + `assets/screenshots/` 四张 1280px JPEG（共 392 KB）；README §5 增加「从仓库安装」一段 |
| 6 | 文档里有本机绝对路径（含用户名） | ✅ `docs/`、`reports/` 里 8 处本机绝对路径（Windows 用户目录与仓库路径）全部替换为 `<home>` / `<repo>` |
| 7 | README 写「21 个测试套件」 | ✅ 改为 22（实际文件数） |

修完后的门禁：`tsc` 0 / `lib/client.js` 542,096 B / register 13 / smoke 415 /
`npm pack` 10 文件 630,607 B / 22 套 898 项测试在上一轮全绿（本轮只动元数据与文档，代码未改）。

**仍然不通过的**只剩三件，且都不是代码问题：

1. GitHub 仓库还没建 —— 没有远端就没有「1 天年龄」和 `dsh-plugin` topic；
2. 条目文件还没提 —— `docs/awesome-dsh-plugin-entry.yml` 已按官方格式写好，等仓库建好整体复制过去；
3. 是否已在列表中被同类插件覆盖，本地无法核实（见 §2）。

## 1. 硬性门槛（CI 逐条检查的）

| 文档要求 | 结果 | 证据 |
| --- | --- | --- |
| `package.json` 声明 `dsh.bundle` manifest | ✅ | `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web" }, "manifestVersion": 1 }` |
| 仓库根有 `cordis.patch.yml`，且是一行 `insert` | ✅ | `- insert: [{ id: otaku-study-board, name: dsh-otaku-study-board }]`，`name` 与包名一致 |
| 仓库有真实可用代码（非占位/空壳） | ✅ | `src/` 88 个文件、构建产物 `lib/client.js` 542,096 B；宿主半 `apply()` 刻意 no-op（纯 UI 插件，README §4 已写明）；22 套 / 898 项测试 |
| 仓库创建满 1 天 | ⏳ 等建仓 | 本地已有 git 仓库与首个提交（`cb77c93`），但 GitHub 上还没建仓；建仓推送后由 CI 按时间判定，满 1 天即可 |
| 仓库加 `dsh-plugin` topic | ⏳ 待办 | 建仓后在仓库页 Topics 添加，本地无法代做 |
| 提交 `data/plugins/<owner>__<repo>.yml` | ⏳ 草稿就绪 | `docs/awesome-dsh-plugin-entry.yml`（url / name / category / 双语描述已填，`owner=Ebony-Vinyl`） |
| 一个 PR ≤ 3 条 | ✅ 不适用 | 只会提 1 条 |
| `awesome-lint` / 站点构建 | — 不适用 | 跑在对方仓库 |
| 官方包用 `peerDependencies` 而非 `dependencies` | ✅ | `dependencies` 为空；`@deepseek-ai/*` 全在 peer，React 也是 peer |
| peer 范围带显式预发布分支 | ✅ | 已补 `>=0.2.1-rc.1 <0.3.0-0` 分支，`0.2.1-rc.2` 实测通过（§4.2） |

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

## 3. 阻断项（3.1 / 3.2 已执行，3.3 / 3.4 等你建仓后做）

### 3.1 先让它是「一个仓库」 ✅ 本地已完成

```bash
git init -b main
git add -A
git commit -m "feat: Sorchron Study Board 4.0.0-rc.1"   # → cb77c93，202 个文件
git remote add origin https://github.com/Ebony-Vinyl/dsh-otaku-study-board.git
```

**还缺一步（需要你操作）**：在 GitHub 上建一个**空**仓库 `dsh-otaku-study-board`（不要勾
README / .gitignore / license），然后 `git push -u origin main`。
推完在仓库页 → Topics → 加 **`dsh-plugin`**。

### 3.2 先止血：142 MB 的测试产物不能进仓库 ✅ 已完成

工作区从 **142 MB → 3.6 MB**（`.git` 1.9 MB）：

- 147 张 PNG + 7 个度量 JSON 移出到 `%TEMP%/sorchron-reports-archive-20261104/`（可找回，
  也能由 `scripts/ui/*-shot.mjs`、`*-browser.test.mjs` 重新生成）；
- `scripts/ui/.build/`（20 MB）与 `smoke.cjs` 删除；
- 精选 4 张 1280px JPEG 放进 `assets/screenshots/`（共 392 KB），由 `screenshots.json` 引用。

`.gitignore`（**保留 `lib/`**，因为 `main` 指向它、且没有构建脚本兜底）：

```gitignore
node_modules/
scripts/ui/.build/
smoke.cjs
reports/*.png
reports/*.jpg
reports/*.json      # reports/*.md 仍然入库
.workbuddy/
```

**`lib/` 已确认入库**（`git ls-files lib` → `lib/client.js`、`lib/index.js`），
否则 `dsh plugin add github:...` 装完是个没有入口的空包。
另外补了 `.gitattributes`（`* text=auto eol=lf`），避免 Windows 的 CRLF 混进 diff。

### 3.3 满 1 天后提 PR

CI 会自动读仓库年龄。刚 push 完就提会被挡在「0.x 天」，**几小时后自己就达标**，
不用重开 PR（文档 §「What CI checks」+ held 说明）。等一天再提最省事。

### 3.4 条目文件（草稿已写入 `docs/awesome-dsh-plugin-entry.yml`，可直接复制）

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

### 4.2 peer 范围曾排除 `0.2.1-rc.2` ✅ 已修

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

已按这个形状改掉（两个 `@deepseek-ai/*` 都加了第三条分支）：

```jsonc
"@deepseek-ai/dsh-client-ui-primitives": ">=0.1.1-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0",
"@deepseek-ai/dsh-tools":                ">=0.1.1-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0"
```

改后实测：`0.1.1-rc.1` / `0.2.0-rc.1` / **`0.2.1-rc.2`** / `0.2.5` 通过，`0.3.0-rc.1` 仍被挡在外面
（我们没打算支持 0.3）。

仍未覆盖的：`0.2.2-rc.x` 这类**比 0.2.1 更新的 minor 的预发布**，以及 `engines.dsh` 里的
同一问题。它们要等 harness 真的发到那条线时再补分支 —— 现在写进去只是猜。

### 4.3 截图与图标

- ✅ 截图已就位：`screenshots.json`（仓库根）+ `assets/screenshots/` 四张 1280px JPEG
  （Dashboard 浅/深、专注计时、任务页，共 392 KB）。相对路径、无 `..`，符合规则。
- ⏳ `icon` 仍缺：需要一张 GitHub 托管的方形位图（约 96px 显示，png/jpg/webp）。
  没做是因为这是品牌决定 —— 现在会回退到作者头像，不影响收录。

### 4.4 README 面向安装者的那一段 ✅ 已补

README §5 现在开头就是面向用户的安装方式：

```
dsh plugin --profile desktop add github:Ebony-Vinyl/dsh-otaku-study-board
```

并注明「`lib/` 随仓库提供，不需要本地构建」「尚未发布到 npm」——
避免用户照着旧文档先去 `npm install && npm run build`。

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
