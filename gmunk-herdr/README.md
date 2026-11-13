# GMUNK / Herdr

独立的任务控制台布局，以 GMUNK 为《Oblivion》设计的仪表界面为视觉参考：
https://gmunk.com/Oblivion-GFX 。本项目的矢量图形为代码绘制，没有使用电影素材或原作图片。

## 安装与切换

```sh
./gmunk-herdr/install.sh
herdr-app do layout.switch --name gmunk-herdr
# 回到封板的 Zero
herdr-app do layout.switch --name zero-herdr
```

安装仅写入 `gmunk-*` 文件，不修改 Zero。Zero 封板提交为 `a7cda1f`。
所有项目仍由 `herdr-dev` 根 Git 仓库管理。

## 结构

- `layouts/gmunk-herdr.json`：独立抽屉导航、标签、终端、仪表和底栏；无顶部品牌横幅。
- `themes/gmunk-herdr.json`：黑底、低饱和青色、米黄读数、橙红活动/告警。
- `mods/gmunk-shell/`：自有导航、标签栏、终端头部与系统栏；空间和 Agent 列表分页。
- `mods/gmunk-telemetry/main.js`：响应式仪表及模型/推理选择器。
- `instruments.js`：分层矢量图、细刻度、纵向读数、采样曲线；`art/` 保存预计算的 SVG 动画帧，避免每帧重建几何。
- `session.js`、`codex-status.cjs`：从 Zero 独立保留的数据读取与草稿保护逻辑，无 Zero UI 依赖。

左侧默认收起为窄栏，悬停展开、离开收回；点击 PIN 固定，点击 « 或按 `⌘B` 收起/展开。文件入口在标签栏右侧，设置在抽屉底部。

所有 mod 从 `theme()` 获取颜色。切换主题时矢量和 UI 一同跟随，不在组件中硬编码配色。
终端字体沿用用户设置；界面标签使用随布局附带的 Rajdhani（更接近 Oblivion HUD 字样），数字读数与等宽信息使用本机的 Monaspace Krypton。

## 数据与动效

- 双螺旋活动图在当前 Agent 工作时流动；短柱仅表示活动，不冒充吞吐量。
- 图中 CTX 标注当前上下文百分比；纵向仪表分别显示上下文占用与周额度剩余。
- 曲线为最近 60 次上下文占用采样，每 3 秒一次；切换会话清空，缺失数据断线。
- 未匹配本地 Codex 会话、远程会话或其他程序显示无数据，不填模拟读数。
- 小于 640px 高度切换紧凑布局；小于 500px 收起历史曲线。核心矢量保持比例。
- 选择菜单独立浮在面板内；目录长时只滚动菜单，不撑开整个仪表。
- 切换前重新检查 CLI 和空输入框，有草稿则拒绝发送；不会清空草稿。

## 验证

```sh
herdr-app check gmunk-herdr/mods/gmunk-shell
herdr-app check gmunk-herdr/mods/gmunk-telemetry
herdr-app status
herdr-app shot /tmp/gmunk-herdr.png
```

正常高度与 540px、450px 高度均在实际运行布局中检查；验证了模型与推理菜单展开/关闭、非 Codex 空数据状态。
截图和调试产物留在 `/tmp`。没有通过实际切换模型来干扰当前会话。
