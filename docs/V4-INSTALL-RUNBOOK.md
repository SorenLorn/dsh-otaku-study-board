# DSH 真实安装操作手册（PowerShell · 由你本人执行）

> 目标：把 `dsh-otaku-study-board` 装进 `desktop` profile，并保留可回滚路径。
> **本文件只是操作指南：我没有执行安装、没有改 profile、没有重启 DSH。**
> 环境已确认：CLI `0.1.1-rc.2`、profile `desktop`、插件尚未安装。
> 所有命令都是 PowerShell（不要用 Git Bash 执行，路径与引号行为不同）。

---

## §3.1 备份（先检查存在，再备份，不覆盖）

```powershell
# 1) 定位 profile 并确认存在
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
if (-not (Test-Path -LiteralPath $profileDir)) { throw "profile 目录不存在：$profileDir" }
Write-Host "profile: $profileDir" -ForegroundColor Cyan

# 2) 生成时间戳（到秒）；同一秒内重复执行会因目标已存在而中止，不会覆盖
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$targets = @('package.json', 'pnpm-lock.yaml', 'cordis.yml')
$made = @()

foreach ($name in $targets) {
  $src = Join-Path $profileDir $name
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Warning "跳过（文件不存在）：$name"
    continue
  }
  $dest = Join-Path $profileDir ("{0}.bak-{1}" -f $name, $stamp)
  if (Test-Path -LiteralPath $dest) { throw "备份目标已存在，已中止：$dest" }
  Copy-Item -LiteralPath $src -Destination $dest -ErrorAction Stop
  $made += $dest
  Write-Host "已备份：$name -> $(Split-Path $dest -Leaf)" -ForegroundColor Green
}

# 3) 打印备份清单与大小，方便回滚时挑时间戳
$made | ForEach-Object {
  $item = Get-Item -LiteralPath $_
  "{0}  {1} bytes  {2}" -f $item.Name, $item.Length, $item.LastWriteTime
}
```

**预期结果**
- `profile: C:\Users\<你>\.dsh\profiles\desktop`
- 三行绿色 `已备份：…`（若 `cordis.yml` 不存在，会有一行黄色 `跳过`，属正常）
- 最后列出 3 个 `.bak-<时间戳>` 文件及字节数

**核对（可选，确认备份与原文件一致）**

```powershell
foreach ($name in $targets) {
  $src = Join-Path $profileDir $name
  $bak = Join-Path $profileDir ("{0}.bak-{1}" -f $name, $stamp)
  if ((Test-Path $src) -and (Test-Path $bak)) {
    $a = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
    $b = (Get-FileHash -LiteralPath $bak -Algorithm SHA256).Hash
    "{0}: {1}" -f $name, ($(if ($a -eq $b) { '一致' } else { '不一致！' }))
  }
}
```

预期：三项都是 `一致`。

---

## §3.2 安装（一条命令，**不要现在执行**）

```powershell
dsh plugin --profile desktop add -P "<repo>
```

参数逐项说明：

| 片段 | 作用 |
| --- | --- |
| `dsh` | 已安装的 CLI（0.1.1-rc.2） |
| `plugin` | DSH 的子命令：把后面的参数**原样转发给 pnpm**，并在 profile 目录里执行 |
| `--profile desktop` | 指定 `$HOME\.dsh\profiles\desktop` 这个 profile；由 dsh 消费，不会传给 pnpm |
| `add` | pnpm 的安装子命令 |
| `-P` → `--save-prod` | 写入 `dependencies`，而不是 devDependencies |
| `"<repo>` | 项目绝对路径。pnpm 在 profile 目录里执行，相对路径会解析错，必须绝对路径 |

**预期结果**
- pnpm 输出包含 `+ dsh-otaku-study-board 4.0.0-rc.1`
- 退出码 0
- `profiles\desktop\package.json` 的 `dependencies` 里出现该包（本地目录通常记为 `link:<repo>`）

**如果失败**：把完整输出发我，不要反复重试；先按 §3.4 的恢复步骤回到备份，再定位。

---

## §3.3 安装后验证

### 3.3.1 验证是否进入加载树

```powershell
dsh --profile desktop --dump-config 2>&1 | Select-String -SimpleMatch 'otaku'
```

**预期**：至少一行包含 `otaku-study-board`（插件行）或 `dsh-otaku-study-board`（包名）。
**如果没有任何输出** → bundle 没有注册，走 3.3.3。

### 3.3.2 检查 `dsh.profile.bundles` 与依赖

```powershell
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkgPath = Join-Path $profileDir 'package.json'

$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
"依赖项: " + $pkg.dependencies.'dsh-otaku-study-board'
"bundles 是否包含: " + (@($pkg.dsh.profile.bundles) -contains 'dsh-otaku-study-board')
```

**预期**：依赖项打印 `link:E:\...` 或版本号；`bundles 是否包含: True`。
若依赖项为空 → 安装没成功；若 `False` → 需要 3.3.3。

### 3.3.3 未自动注册时，安全地手动追加（会再备份一次）

```powershell
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkgPath = Join-Path $profileDir 'package.json'

# 修改前再备份一次（不同后缀，绝不覆盖上一份）
$stamp2 = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $pkgPath -Destination (Join-Path $profileDir "package.json.bak2-$stamp2") -ErrorAction Stop

$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
$bundles = @($pkg.dsh.profile.bundles)
if ($bundles -notcontains 'dsh-otaku-study-board') {
  $pkg.dsh.profile.bundles = @($bundles + 'dsh-otaku-study-board')
}

# 用无 BOM 的 UTF-8 写回，避免 JSON 解析器读到 BOM
$json = $pkg | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($pkgPath, $json, (New-Object System.Text.UTF8Encoding($false)))
"已追加 bundles，备份：package.json.bak2-$stamp2"
```

**预期**：打印 `已追加 bundles，备份：package.json.bak2-<时间戳>`。
随后同步依赖并复验：

```powershell
dsh plugin --profile desktop install
dsh --profile desktop --dump-config 2>&1 | Select-String -SimpleMatch 'otaku'
```

预期：`install` 输出 `Already up to date`（或仅更新 lockfile），`--dump-config` 出现 otaku 行。

**注意**：`ConvertTo-Json` 会重排整个 `package.json` 的缩进/键顺序，内容不变；如果 diff 看起来很大是正常的，回滚用 `.bak2-*`。

---

## §3.4 回滚（不删 node_modules）

### 3.4.1 卸载插件依赖

```powershell
dsh plugin --profile desktop remove dsh-otaku-study-board
```

**预期**：输出 `- dsh-otaku-study-board`，退出码 0。

### 3.4.2 如果手动改过 bundles，先移除那一行

```powershell
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkgPath = Join-Path $profileDir 'package.json'
$stamp3 = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $pkgPath -Destination (Join-Path $profileDir "package.json.bak3-$stamp3") -ErrorAction Stop

$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
$pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne 'dsh-otaku-study-board' })
[System.IO.File]::WriteAllText($pkgPath, ($pkg | ConvertTo-Json -Depth 100), (New-Object System.Text.UTF8Encoding($false)))
"已移除 bundles 条目，备份：package.json.bak3-$stamp3"
```

预期：打印已移除；`bundles` 里不再有该名字。

### 3.4.3 从备份恢复三个文件

把 `<STAMP>` 换成 §3.1 打印的真实时间戳：

```powershell
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$stamp = '<STAMP>'   # 例如 20261102-164500

foreach ($name in @('package.json', 'pnpm-lock.yaml', 'cordis.yml')) {
  $bak = Join-Path $profileDir ("{0}.bak-{1}" -f $name, $stamp)
  if (-not (Test-Path -LiteralPath $bak)) { Write-Warning "缺少备份：$bak"; continue }
  Copy-Item -LiteralPath $bak -Destination (Join-Path $profileDir $name) -Force
  Write-Host "已恢复：$name" -ForegroundColor Green
}
```

预期：三行 `已恢复：…`（缺备份的文件会黄色警告并跳过）。

### 3.4.4 重新安装 profile 原有依赖（不删 node_modules）

```powershell
dsh plugin --profile desktop install
```

预期：pnpm 依据恢复后的 `package.json` + `pnpm-lock.yaml` 把依赖对齐到备份状态，输出 `Already up to date` 或仅做必要增删。
**不要** 执行 `Remove-Item node_modules`，也不需要重装其它插件。

### 3.4.5 回滚后确认

```powershell
dsh --profile desktop --dump-config 2>&1 | Select-String -SimpleMatch 'otaku'
```

预期：**无输出**。然后由你手动重启 DSH。

---

## 5. 风险控制（本手册的边界）

- 不升级 / 不降级 CLI（当前 0.1.1-rc.2）；
- 不修改插件源码与它的 `package.json`；
- 不执行安装、不改 profile、不重启 DSH——全部由你本人执行；
- 备份只增不覆盖：`bak-*` / `bak2-*` / `bak3-*` 三套用途分明；
- 回滚顺序固定为「先卸载/移除条目 → 再恢复文件 → 最后 `install`」，避免 lockfile 与 `package.json` 打架。

---

## 6. 逐条执行清单（复制用）

| # | 命令 | 预期 |
| --- | --- | --- |
| 1 | `$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'; Test-Path $profileDir` | `True` |
| 2 | 备份脚本（§3.1） | 3 个 `.bak-<stamp>`，哈希一致 |
| 3 | `dsh plugin --profile desktop add -P "<repo>` | `+ dsh-otaku-study-board 4.0.0-rc.1`，退出码 0 |
| 4 | `dsh --profile desktop --dump-config 2>&1 \| Select-String 'otaku'` | 出现 otaku 行 |
| 5 | bundles 检查（§3.3.2） | `True`；若 False 执行 §3.3.3 |
| 6 | 重启 DSH（你手动） | 左导航出现「溯时学习工作台」 |
| 7 | 打开页面 | V3 五卡正常；切 V4 Dashboard 正常；控制台无红色 error |
| 8 | 回滚（如需） | §3.4；最后 `--dump-config` 无 otaku 行 |
