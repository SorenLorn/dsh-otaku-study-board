# DSH 真实安装验收准备（只读核查，未执行安装）

> 时间：2026-11-02 11:42
> 版本：`dsh-otaku-study-board` 4.0.0-rc.1 / CLI `0.1.1-rc.2`
> **本轮未安装、未修改 profile、未改 package.json。**

---

## 1. 已经验证的事实

| 项 | 实测结果 |
| --- | --- |
| CLI 版本 | `dsh --version` → **0.1.1-rc.2** |
| `plugin` 子命令的真实语义 | `dsh --help`：`plugin … manage a profile's plugins by **forwarding the remaining arguments to pnpm** in the profile directory`。所以它不是 DSH 自己的插件协议，而是「在 profile 里跑 pnpm」 |
| 完整参数格式 | `dsh plugin --profile <name> <pnpm 参数...>`；安装即 `dsh plugin --profile desktop add <包/路径>`。`dsh plugin --profile desktop --help` 的输出其实是 **pnpm 的 help**（多了一层转发，所以直接看 `dsh plugin --help` 会报 `--profile` 必填） |
| `--profile` 应填什么 | **`desktop`**（已验证：`$DSH_HOME/profiles/desktop` 存在，profile 的 `package.json` name 为 `dsh-profile-desktop`，`dsh.profile.bundles` 里都是当前已装插件） |
| 是否已装同名插件 | **未安装**：`profiles/desktop/node_modules/dsh-otaku-study-board` 不存在，`dependencies` 里也没有 |
| 安装会碰哪些文件 | `profiles/desktop/package.json`、`pnpm-lock.yaml`、`node_modules/`；另有 `cordis.yml`（223B，profile 的自定义层，理论上不该被 add 改动） |
| 打包可用性 | `npm pack --dry-run` 7 个文件（LICENSE / patch / 双产物 / README / TESTING），121.3 kB |
| 挂载自检 | `register-check` 13/13（静态，不等于运行时） |
| 类型 | `tsc --noEmit` 0 错误 |

---

## 2. 尚未验证的风险（不要当成已通过）

| # | 风险 | 说明 |
| --- | --- | --- |
| R1 | **`dsh plugin add` 是否会把包名写进 `dsh.profile.bundles`** | CLI 只说明「转发给 pnpm」，没有说明是否顺带注册 bundle。当前 profile 的 bundles 列表与 dependencies 高度一致，但无法据此断定是自动写入的。**安装后必须用 `--dump-config` 验证**（见 §3.2）；若没有出现，需要手动追加 bundles（见 §3.3） |
| R2 | 0.1.1-rc.2 的运行时 API 是否与 0.2.x 同形 | `ctx.slots` 的 `main` / `sidebar.panellist`、`connection.fetch.register` 都是按 0.2.x 的插件实测出来的；0.1.1 未验证 |
| R3 | 版本号 `4.0.0-rc.1` | 预发布版本，市场排序可能靠后；不影响本地安装 |
| R4 | 真实加载结果 | 导航是否出现、页面是否渲染、控制台有无红色错误——全部未执行 |

---

## 3. 安装操作（**未执行，请你亲自跑**）

### 3.1 安装前备份（30 秒）

```bash
cd "$HOME/.dsh/profiles/desktop"
cp package.json "package.json.bak-$(date +%Y%m%d-%H%M)"
cp pnpm-lock.yaml "pnpm-lock.yaml.bak-$(date +%Y%m%d-%H%M)"
cp cordis.yml "cordis.yml.bak-$(date +%Y%m%d-%H%M)"
```

恢复方法：把 `.bak-*` 三个文件覆盖回去，再执行 `dsh plugin --profile desktop install`，最后重启 DSH。

### 3.2 安装命令（一条，完整可复制）

```bash
dsh plugin --profile desktop add -P "<repo>
```

说明：
- `-P`（`--save-prod`）确保写进 `dependencies`，而不是 devDependencies；
- 路径用绝对路径（pnpm 在 profile 目录里执行，相对路径会解析错）；
- 这条命令会修改 profile 的 `package.json` / `pnpm-lock.yaml` / `node_modules`，**其余不动**。

安装后验证是否真的进了加载树：

```bash
dsh --profile desktop --dump-config 2>&1 | grep -i otaku
```

- 有输出 → bundle 已注册，直接重启 DSH；
- 无输出 → 走 §3.3。

### 3.3 如果没有自动注册（备选，需要你手动改一行）

编辑 `%USERPROFILE%\.dsh\profiles\desktop\package.json`，在 `dsh.profile.bundles` 数组末尾追加：

```json
"dsh-otaku-study-board"
```

然后：

```bash
dsh plugin --profile desktop install
dsh --profile desktop --dump-config 2>&1 | grep -i otaku
```

### 3.4 卸载 / 回滚

```bash
dsh plugin --profile desktop remove dsh-otaku-study-board
# 若手动加过 bundles，把那一行删掉
# 需要彻底复原：用 §3.1 的 .bak 文件覆盖 + dsh plugin install
```

---

## 4. 安装后验收清单（逐项打勾，别跳）

| # | 检查 | 通过标准 |
| --- | --- | --- |
| A1 | 插件是否加载 | `--dump-config` 含 `dsh-otaku-study-board`；DSH 启动无 plugin 加载错误 |
| A2 | 左导航 | 出现「溯时学习工作台」，位置在「上下文洞察」之后 |
| A3 | 页面打开 | 点击后主区出现独立页面，不是空白、不是 tab |
| A4 | V3 五卡 | 概览 / 任务 / 计时 / 日志 / 统计全部渲染 |
| A5 | V4 Dashboard | 顶部「V4 Dashboard」可切换，切回经典无异常 |
| A6 | 控制台 | 无红色 error；`SorchronBoard V3:` 只有 warn 级可接受 |
| A7 | 运行时 API | 日志卡工具栏显示真实采集通道（不是「未接入」）；若显示未接入，说明 `ctx.slots` 或事件面在 0.1.1 下不同，需要贴控制台给我 |
| A8 | 数据 | 新建一个任务 → 刷新仍在；完成后今日打卡 +1 |

**A7 是关键**：它同时验证 `ctx.slots` 的注册链路和事件通道；A5 验证 `inject` 的 client 依赖解析。

---

## 5. 结论

- **安装前准备已完成**：命令格式、profile 名、覆盖文件、备份/恢复、验收项都确定，且都有实测依据。
- **安装本身没有执行**，`bundles` 是否自动注册是唯一的流程性不确定点，已给出「装完用 `--dump-config` 判定 + 手动补 bundles」的兜底。
- 如果 A1 或 A7 失败，把 `dsh --profile desktop --dump-config` 的输出和控制台报错贴给我，我按真实错误修，不再靠猜。
