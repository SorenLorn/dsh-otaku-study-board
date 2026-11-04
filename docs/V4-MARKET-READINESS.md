继续处理 `dsh-otaku-study-board` 4.0.0-rc.1 的真实安装验收准备。

当前已完成：

- bundle manifest 和 cordis.patch.yml 检查
- peerDependencies 兼容范围修正
- manifestVersion 补齐
- MIT LICENSE 补齐
- npm pack --dry-run 通过
- register-check 13/13

本轮只做安装准备，不要擅自执行安装，不要修改我的 DSH desktop profile。

请完成：

1. 检查本机 DSH CLI：
   - 确认版本为 0.1.1-rc.2。
   - 读取 `dsh plugin --help` 和相关子命令帮助。
   - 确认 `dsh plugin add` 的完整参数格式。
   - 明确 `--profile` 应填写什么值，不能猜测。
2. 检查安装前状态：
   - 确认当前 desktop profile 的名称。
   - 检查当前是否已经安装同名插件。
   - 检查是否存在可能被覆盖的配置或文件。
   - 给出备份建议和恢复方法。
3. 输出一条完整、可复制的安装命令。
   - 不要执行该命令。
   - 不要修改 profile。
   - 不要升级或降级 DSH CLI。
   - 不要修改 package.json 的版本范围，除非发现明确证据证明当前范围仍然不兼容。
4. 输出安装后验收清单：
   - 插件是否成功加载。
   - 左侧导航是否出现。
   - 页面是否正常打开。
   - V3 五张卡片是否正常。
   - V4 Dashboard 是否能切换。
   - 控制台是否存在红色错误。
   - `ctx.slots` 和 `connection.fetch.register` 是否出现运行时兼容问题。

最终报告必须区分：

- 已经验证的事实
- 尚未验证的风险
- 需要用户亲自确认的操作

不要把静态检查或打包成功描述成真实安装成功。
