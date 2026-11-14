# Paper / Herdr

纸白风格的 Herdr 布局，视觉按 Paper Widgets 的 Dots 提示来：浅灰画布 `#e9e9eb` 上是无描边的白卡片（半径 20、一层软阴影），字用 Host Grotesk 400/500，近黑墨色 `#111`，一切可计量的量都画成圆点。点只有三种色：淡灰是普通，橙红 `#f2542d` 是此刻要紧的，墨色是按住的。
风格参考：https://uberdesigner.ai/t/paper-widgets/dots 。实现是给 Herdr 写的原创 GPUI 界面，用的是真实会话数据，不是那份 11 秒演示。

布局会按系统外观切换浅色和深色两套主题。浅色跟提示里的纸面一致；深色跟 Focus 卡片一样，是墨底 `#111`、白字、同一颗橙红点和淡白点阵。

## 安装与切换

```sh
./paper-herdr/install.sh                       # 检查 → 复制 → 再检查 → 切换
herdr-app do layout.switch --name paper-herdr
herdr-app do layout.switch --name gmunk-herdr  # 切回 GMUNK
```

安装只写入 `paper-*` 文件（`themes/paper-herdr.json`、`themes/paper-herdr-dark.json`、`layouts/paper-herdr.*`、`mods/paper-shell`、`mods/paper-widgets`、`mods/paper-files`、`mods/paper-files-menu`），不改 Zero 和 GMUNK。

## 结构

- `layouts/paper-herdr.json`：顶栏与 zero-herdr 相同，42px 标签栏兼做标题栏，`traffic_lights` 为 `[12, 16]`；在 macOS 上标签从灯右侧留出 `12 + 64` 像素再画。其下是 10px 画布边距 + 左侧窄栏 48px + 侧栏 184px + 终端卡片 + 右侧小组件列 212px。没有底栏，也没有时钟。
- `themes/paper-herdr.json`：Dots 浅色。画布 `#e9e9eb`，卡片 `#fff`，强调色 `#f2542d`。
- `themes/paper-herdr-dark.json`：Dots 深色。画布 `#111`，卡片略抬起，文字近白，强调色仍是 `#f2542d`。
- 主题按系统外观切换：`"theme": { "light": "paper-herdr", "dark": "paper-herdr-dark" }`。界面颜色全部来自 `theme()`。
- `mods/paper-shell/`：`rail`、`nav`、`tabs`、`pane` 四个角色；`icons/` 为自绘线性图标。
- `mods/paper-shell/fonts/`：Host Grotesk Regular/Medium（界面，SIL OFL 1.1，许可见 `fonts/OFL-HostGrotesk.txt`），以及 Geist Mono（仅终端，许可见 `fonts/OFL.txt`）。
- `mods/paper-widgets/`：`agents`、`context`、`usage`、`git` 四张卡片，和壳、文件面板同一套点阵语言。Usage 按电量行（墨色井、最多 18 个点、充电行带橙点和呼吸的闪电）；Context 按 60 格计时环；Agents 用 9 点柱和橙色均衡器；Git 用一排点表示改动。只读脚本：`codex-status.cjs`、`kiro-status.cjs`、`agy-status.cjs`、`kimi-status.cjs`，读取本机对应会话，不写假数。
- `mods/paper-files/`、`mods/paper-files-menu/`：文件树与预览；在本地条目上右键，可用 macOS `open` / `open -R` 在 Finder 中打开，或 `open -a Zed` 用 Zed 打开。图标为自绘。

## 收起与切换

- 侧栏：点窄栏顶部的侧栏图标、标签栏右侧的 Nav、侧栏底部的 Collapse，或按 Ctrl+Shift+B。收起后窄栏保留：空间首字母、新建空间、设置都还在。
- 文件面板：标签栏 Files。小组件列：标签栏 Widgets。
- 开关亮着时有橙色小点和浅底（深色下是选中色底），关着时是灰点。

## 数据与性能

- 不填假数据。没有 Agent、没有匹配会话、不是 Git 仓库、额度读不到时，卡片显示对应的空状态。
- Context 跟当前聚焦的 Agent 走：Codex、Kiro、Antigravity、Kimi。Codex 可在卡片里切换模型和推理强度；切换前会检查输入框，有草稿时不会清空或提交。
- 各卡片只跑自己的定时器。Context 每 3 秒读取一次，只在聚焦的是本地对应 Agent 时才执行；Kimi 额度每 60 秒读一次；Git 每 4 秒执行一次 `git --no-optional-locks status`（远程空间走 `on: space.machine`）。结果没变就不重绘。
- 窄栏、侧栏、标签栏、终端头部和 Agent 卡片都没有轮询定时器，只跟随 Herdr 的实时数据刷新。
- 动效全部是原生的 `loop`（opacity / height），不用重绘定时器：工作中的状态点、充电行的端点和闪电会呼吸，Agents 的均衡器柱会起伏。

## 验证

```sh
herdr-app check paper-herdr/mods/paper-shell
herdr-app check paper-herdr/mods/paper-widgets
herdr-app check paper-herdr/mods/paper-files
herdr-app check paper-herdr/mods/paper-files-menu
herdr-app status
herdr-app shot /tmp/paper-herdr.png
```

`check` 只渲染默认角色；各个 `role` / `kind` 都已单独检查过，并在运行中的窗口里截图确认。
