# Herdr Dev

Herdr 主题、布局与 mod 的统一开发仓库，当前主题为 **zero-herdr**。

## zero-herdr

- 暖灰与陶土橙配色，支持深色、浅色主题。
- 右侧状态面板：当前任务、Git 状态、Codex 上下文与额度信息。
- 模型及推理强度下拉选择器，作用于当前 Codex 会话。
- 紧凑动态 banner，工作时短柱律动，空闲时静止。
- Claude 风格侧栏及终端面板布局。

## 安装

需要已安装并运行 Herdr。Codex 状态读取额外依赖 Node.js、`sqlite3`，以及本机 Codex 会话文件。

```sh
git clone https://github.com/zjl1985/herdr-dev.git
cd herdr-dev
bash zero-herdr/install.sh
```

安装脚本将主题、布局和 mod 复制到 `~/.config/herdr-app/`，校验后切换到 `zero-herdr` 布局。已有同名文件会被覆盖，安装前请备份自己的修改。可以通过 `HERDR_APP_HOME` 指定安装目录。

## 使用与限制

点击右侧模型名或推理强度可展开选项。输入框存在草稿或 CLI 弹窗时，切换会被阻止；请先处理草稿或收起弹窗。

Codex 状态通过本机的会话数据库、日志和模型目录读取，不需要配置 API key。适配依赖 Codex 的本地数据格式；版本变化可能需要更新适配代码，目前不支持远程 Codex 状态读取。切换通过当前终端的 `/model` 命令执行，是否可用以 Codex 确认为准。

仓库不包含个人会话日志、账号凭据或运行时配置。开发截图请保存到临时目录，不要提交包含对话内容的截图。

## 开发

源码位于 `zero-herdr/`。修改 mod 后先校验，再同步到 Herdr 的运行目录：

```sh
herdr-app check zero-herdr/mods/claude-status
```

具体约定见 [AGENTS.md](AGENTS.md)。

## 致谢

主题基于 [dhls201/herdr-claude-theme](https://github.com/dhls201/herdr-claude-theme) 的布局与组件扩展；状态面板设计参考了 [7Mrlan/herdr-theme](https://github.com/7Mrlan/herdr-theme)。
