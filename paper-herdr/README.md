# Paper / Herdr

纸白风格的 Herdr 布局：暖白色圆角卡片放在纸色底上，黑字，细 Geist 数字，小号大写等宽说明，只有一个群青色做强调。
风格参考 uberdesigner 的 paper widgets（Dots 主题）：https://uberdesigner.ai/t/paper-widgets/dots 。
本项目是原创实现，没有使用对方的代码、提示词、Figma 或图片。

## 安装与切换

```sh
./paper-herdr/install.sh                       # 检查 → 复制 → 再检查 → 切换
herdr-app do layout.switch --name paper-herdr
herdr-app do layout.switch --name gmunk-herdr  # 切回 GMUNK
```

安装只写入 `paper-*` 文件（`themes/paper-herdr.json`、`layouts/paper-herdr.*`、`mods/paper-shell`、`mods/paper-widgets`），不改 Zero 和 GMUNK。

## 结构

- `layouts/paper-herdr.json`：左侧窄栏 48px + 侧栏 184px；中间标签栏 34px + 终端卡片；右侧小组件列 212px。没有底栏。
- `themes/paper-herdr.json`：浅色纸张主题。终端 16 色针对 `#fbfaf7` 底色调过，蓝色就是群青强调色，白/亮白改为可读的灰。
- `mods/paper-shell/`：`rail`（窄栏）、`nav`（侧栏）、`tabs`（标签栏）、`pane`（终端头部）四个角色；`icons/` 为自绘线性图标。
- `mods/paper-shell/fonts/`：Geist 与 Geist Mono 静态字重（ExtraLight–SemiBold），SIL OFL 1.1，许可见 `fonts/OFL.txt`。
- `mods/paper-widgets/`：`clock`、`agents`、`context`、`git` 四个卡片，每个是独立的布局块。`codex-status.cjs` 只读本机 Codex 会话数据。

## 收起与切换

- 侧栏：点窄栏顶部的侧栏图标、标签栏右侧的 `NAV`、侧栏底部的 `Collapse`，或按 Ctrl+Shift+B。收起后窄栏保留：空间首字母、新建空间、设置都还在。
- 文件面板：标签栏 `FILES`。小组件列：标签栏 `WIDGETS`。
- 开关亮着时有群青小点和白底，关着时是灰点。

## 数据与性能

- 不填假数据。没有 Agent、没有 Codex 会话、不是 Git 仓库时，卡片显示对应的空状态。
- 时钟在独立的嵌套视图里，只有分钟变化时才重绘；冒号用原生 `loop` 呼吸。
- Codex 卡片每 3 秒读取一次，只在聚焦的是本地 Codex 终端时才执行；Git 卡片每 4 秒执行一次 `git --no-optional-locks status`。结果没变就不重绘。
- 窄栏、侧栏、标签栏、终端头部和 Agent 卡片都没有定时器，只跟随 Herdr 的实时数据刷新。
- 动效全部是原生的：工作中的状态点用 opacity `loop`，上下文圆环的末端点在 Agent 工作时呼吸。

## 验证

```sh
herdr-app check paper-herdr/mods/paper-shell
herdr-app check paper-herdr/mods/paper-widgets
herdr-app status
herdr-app shot /tmp/paper-herdr.png
```

`check` 只渲染默认角色；各个 `role` / `kind` 都已单独检查过，并在运行中的窗口里截图确认。
