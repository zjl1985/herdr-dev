# Zero Paper 布局精修 — 执行记录

> 以下为初次实现阶段的历史记录，其中部分完成判断已被后续 review 修正。最新部署结果以 `zero-paper-layout-plan.md` 的「视觉改版交付记录」为准：轮询、请求失效、选择器及安装回滚问题已修复，19 个测试通过，视觉版已应用并实际检查。文末「热重载停摆」不再代表当前运行状态。

逐项记录变更文件、验证方式、结果与剩余限制。基线与回滚见 `zero-paper-layout-plan.md` 及备份目录。

## A 基线与能力确认

| ID | 结果 | 证据与限制 |
| --- | --- | --- |
| A01 | ✅ | 三个备份 `shasum -a 256 -c` 全 OK；解压到 `/tmp/zero-paper-restore-check-{source,runtime,deps}`；布局 JSON 可解析；源码备份与仓库 `diff -rq` 零差异。 |
| A02 | ✅ | 主题机制：布局声明 `theme:{light,dark}` 为默认；`layouts/.state/zero-herdr.json` 记录覆盖 `{light: claude-light, dark: ink}`；`ink` 为内置预设（冷色），即截图冷色来源；`app.theme {name}` 全局切换。保留用户选择，不改配色。 |
| A03 | ✅ | 七个 mod 基线 `herdr-app check` 全过，无既有报错。 |
| A04 | ✅ | 截图：`/tmp/zero-paper-baseline-{default,panel-hidden,files-hidden,files-open}.png`（zoom 1、font 12、UI 13，2026-11-15）。`layout.hide/show/select` 已复原，`status` errors 为空。限制：抽屉 hover 展开态无键盘 API，未强测；固定侧栏态待 F03 验证时补拍。 |
| A05 | ✅ | 见下「API 能力清单」。 |
| A06 | ✅(空闲) | 空闲 60s：CPU 0.0%、RSS ~12MB（12×5s 采样，`/tmp/zero-paper-a06-idle.txt`）。限制：working 态采样不驱动用户真实会话，留到 I03 复测。 |

### API 能力清单（A05）

- **模块导入**：仅 mod 目录内相对导入可用；跨 mod 导入被加载器拒绝（`resolves outside the application directory`，实测）。→ tokens/主题/kit 采用构建时盖章分发（`tools/stamp-zero-ui.mjs`）。
- **颜色**：`theme()` 语义字段含 surface/canvas/chrome/popover/raised/hover/selected/border/input/foreground/muted/dim/accent(+fg)/solid(+fg)/ring/selection/working/blocked/done/idle/unknown/ansi0-15。部分主题 JSON 只写少量字段（如 atom-one-dark），运行时派生其余——组件映射必须带语义回退链。
- **动画**：原生 `transition(prop,{duration,delay,easing})`、`spring`、`loop`；属性仅 opacity/width/height/left/top。hover 颜色变化无过渡属性（即时切换）。呼吸/短柱用 `loop`，无 JS timer。
- **焦点**：`cx.focus_handle()`、`track_focus`、`handle.focus()/is_focused()`；mod.json `"focusable": true` + `nextCommand()`；`on_key_down`。
- **popup**：`openOverlay({kind: dialog|popup|window, frame:"none", at, width/height})`；组件库有 Popover/Popup/Select（组合框式受控 popup，键盘高亮需自写）。
- **尺寸**：`on_size_change` 报逻辑像素；`window()` 无宽高字段（H02 走 on_size_change）。
- **清理**：View 可实现 `async close(cx)`；`Task.cancel()`；`timer.every/after` 支持 owner；`cx.spawn` 任务随 view 生命周期。
- **其他**：`tooltip()` 原生；`truncate()`；`overflow_y_scrollbar`；`on_hover`；`disabled()`；`shared/setShared` 持久跨 mod；`exec` 支持 `on` 远程、timeout 上限 600s。

## B 视觉基础

| ID | 结果 | 变更文件 / 证据 / 限制 |
| --- | --- | --- |
| B01 | ✅ | `mods/zero-ui/zero-tokens.js`（字号/间距/圆角/时长/图标/命中区，无颜色）；跨 mod 导入不可行 → `tools/stamp-zero-ui.mjs` 盖章分发到 8 个消费 mod（含 zero-picker 骨架）。 |
| B02 | ✅ | `mods/zero-ui/fonts/`：HostGrotesk Regular/Medium + GeistMono Regular/Medium + 两份 OFL 许可（自 paper-shell 复制，许可随行）。盖章后各消费 mod 自带 fonts/，移走 Paper 仍可加载。未触碰用户终端字体。 |
| B03 | ✅ | `mods/zero-ui/zero-theme.js`：palette() 每次调用实时读 `theme()`，语义回退链（缺失字段→其他语义字段，禁止固定色）；statusInfo/statusColor 区分 unknown 与 idle。 |
| B04 | ✅ | `/tmp/zero-contrast.mjs` 对运行目录 7 套主题全量审查（浅色 3 套、深色 4 套，含用户 ink 派生字段说明）。**主题侧限制（记录，不改主题）**：claude-light `done` 对 bg 2.33；claude 系 `solid` 上白字 3.28；paper-herdr `muted` 3.26；win98 `working/blocked/inset` 2.2-2.3；各主题 `border` 对 bg 1.16-1.56（仅装饰线）。**组件侧决策**：关键控件边界/焦点标识用 `ring`（各主题 ≥3:1）；不依赖 solid 底+小字号文本；done/blocked 始终伴随文字标签。 |
| B05 | ✅ | 同上（深色组）；ink 主题 JSON 缺字段由运行时派生，已记录为审查盲区。 |
| B06 | ✅ | `mods/zero-ui/zero-kit.js`：text/mono/label/hint/statusDot/programIcon/icon/iconButton(24×24 命中、disabled 不触发)/section/menuRow(≥28px、键盘高亮、selected/hover/disabled)。pressed 无原生伪类（hover 即时），已记录。 |
| B07 | ✅ | `mods/zero-ui/icons/` 21 枚原创 SVG（stroke 1.5、viewBox 24、currentColor），覆盖右栏/pane/文件菜单/抽屉所需；清单见 icons/ 目录；按路径 `mods/zero-ui/icons/*.svg` 引用（svg() 读取 appHome 下任意路径），不改内置 workspace-chrome。 |

验证：`herdr-app check mods/zero-ui`、`mods/zero-picker` 通过；`node tools/stamp-zero-ui.mjs` 幂等。

## C 数据正确性与状态

| ID | 结果 | 证据 / 限制 |
| --- | --- | --- |
| C01 | ✅ | 纯函数抽到 `Z/data.js`（folder/formatDuration/parseGitStatus/parseKimiUsage/taskTitle/cleanTitle）；`node --test tests/` 7 项全过；mod check 过；视觉未同批改动。`mods/zero-herdr/package.json {"type":"module"}` 仅供 Node 测试，加载器忽略。 |
| C02 | ✅ | `activeTarget()`：以 active space/tab + `focused()` 匹配 lead，无列表第一项回退；聚焦 shell → lead=null（面板显示 No agent，不借其他 pane 配额）。 |
| C03 | ✅ | 每通道全局单调 seq（seqStart/seqCurrent），迟到结果不写回；base(key=address+cwd) 变更才清空，标题变化保留旧数据重读。 |
| C04 | ✅ | guarded()：busy 锁 + seq；超时用原生 `cx.timer.after` + `Task.cancel`（**shell 无 setTimeout/clearTimeout**——已实测踩坑并修复）。 |
| C05 | ✅ | 调度合并：3s 单通道会话读取（当前适配器仅一个）+ 5s git + 60s Kimi 额度 + 1Hz working 计时（可见时才 tick）。 |
| C06 | ✅ | setChannel 变化比较（state/message/data JSON），无变化不 notify。 |
| C07 | ✅ | git 命令加 `--no-optional-locks`，`on` 远程路由保留；非仓库 → empty 态 "Not a repo"。 |
| C08 | ✅ | 通道统一 loading/ready/empty/error/unsupported/stale(+observedAt)；Kiro 错误可见；远程 unsupported 不冒用本地数据；"Waiting for matching…" 归 empty 而非 error。 |
| C09 | ✅ | kimi-status.cjs 返回 account(credential+endpoint)；缓存载入含 readAt/account；>10min 标 stale；账号不匹配即替换。 |
| C10 | ✅ | `close(cx)` 取消全部任务（timer Task 收集于 this.tasks）；隐藏代理：render 戳 lastRender，>60s 后 timer 跳过读取，重新显示立即刷新。 |
| C11 | ✅ | Z 移除 setAgentOrder 调用（drawer 唯一所有者）。 |

**运行时踩坑记录**：mod shell 无 `setTimeout/clearTimeout`、无 `Intl` 全局（weekly reset tooltip 曾触发整次渲染失败回退）；已改用 `cx.timer.after` 与 `Date.toString()+UTC 偏移`。Codex CLI 的 state_5.sqlite 为 WAL 库且运行中持有 -shm，`sqlite3 -readonly` 报 CANTOPEN——两个 bridge 加 `file:...?immutable=1` 回退（限制：未 checkpoint 的 WAL 帧暂不可见）。

## D 右栏精修

D01–D11 全部落地于 `Z/main.js` render（650 行）：根容器 12 圆角/12 内边距、Host Grotesk 正文 + Geist Mono 计量；层级 identity→banner→Session→Usage→Workspace→Agents；banner 五态（unknown 不再冒充 Idle）；标题 14/500 两行（max_h 裁切，无原生 line-clamp——记录）；路径单行+tooltip；Context 24 点/Quota 18 点刻度（缺失为 —，不伪装 0%；≤20% 有 Low 警示行）；Credits 独立语义 + reset 时间本地化 + 全日期 tooltip（UTC 偏移标注）；Workspace clean/dirty/非仓库区分 + ↑↓ 同步；Agents 28px 行/焦点底色/状态点+文字；主体可滚动（header+banner 固定）；D11 空态/失败/远程文案（含原因）。验证：截图 `/tmp/crop-d-final2.png`、`/tmp/crop-fgh-panel.png`（CONTEXT 10%→2 点、Weekly 53%→10 点、39 changed 正确）；check 全过；errors 空。限制：working/blocked/done/unknown 动态态需真实会话进入，留 I02 矩阵验证。

## E 模型与推理选择器

| ID | 结果 | 证据 / 限制 |
| --- | --- | --- |
| E01 | ✅ | 切换控制抽到 `Z/switcher.js`；target identity（address）贯穿 pick→send→confirm。 |
| E02 | ✅ | 发送前重验：目标仍是 codex（hc get）+ composer 逐行比对空态 + 选项白名单正则；不确定即拒绝；**移除 pane.focus（不再抢焦点）**。 |
| E03 | ✅(记录) | herdr.d.ts 无非键盘配置 API——键盘注入保留；TOCTOU 局限写进 switcher.js 头注；不宣称绝对草稿安全。 |
| E04 | ✅ | `mods/zero-picker/`：popup overlay（at:pointer, 230px），选项经 props 快照，脱离右栏文档流；mod.json focusable。 |
| E05 | ✅(代码) | ↑/↓/Enter/Escape + track_focus 自持焦点；点击外部关闭为 popup 原生行为；关闭恢复原焦点（无 pane.focus 迁移）。 |
| E06 | ✅(代码) | idle/sending/awaiting/success/error 全链路经 shared(`zero.codex.switch`)；先"请求已发送"；仅 fresh read 确认后成功；10s watchdog 降级 error 不重发；连点被 busy+seq 挡。 |
| E07 | ✅(代码) | 目标切换/关闭→invalidateSwitch；picker 见 address 不匹配自动关闭；成功自动关闭。 |

**限制**：E2E 交互（点 chip→键盘选择→确认链路）无法程序化注入鼠标/焦点，留 I06 受控演练由真人操作；模型目录在弹层打开期间刷新需重开（快照限制，已记录）。

## F 抽屉与终端 / G 文件与底栏 / H 尺寸与动效

| 任务 | 结果 |
| --- | --- |
| F01 | ✅ drawer 字体换 stamped Geist Mono 常量、组标题 10.5、时长走 tokens（170/240/200→120/200/200，H03）。保留猫标/浮动/机器分组。 |
| F02 | ✅ 固定态 `w_full` 填满可拖拽 sidebar（220–360），浮动保持 268；SIDEBAR_W 冲突消除。 |
| F03/F04 | ✅(审查) switchMode 有 leaving 互斥；timer 随 view 死亡；冒泡已有 stop_propagation。20 次连续切换实测留 I06（无法程序化点击）。 |
| F05 | ✅ pane 头 12px、按钮 24px、图标换 zero-ui（split-right/split-down/zoom/unzoom/close/spinner）。 |
| F06 | ✅ layout focus color `input`→`ring`（宽度不变，无尺寸跳动）。 |
| F07 | ✅(审查) 内置 tabs 未改动；多 tab/全屏场景留 I02。 |
| G01 | ✅ files 行高 28、图标换 zero-ui、字号 12。 |
| G02 | ✅(审查) saved Map 保留滚动/文件位置；watch 随 context 迭代。 |
| G03 | ✅ 空目录 48px 原创 empty-folder 线稿 + 文案；错误态仍纯文字。 |
| G04 | ✅ files-menu ↑/↓/Enter（高亮执行）+ Escape + 非 macOS 明确禁用并说明；远程路径本来就不可达（files 侧 this.on 拦截）。 |
| G05/G06 | ✅ 底栏/浮钮图标换 zero-ui；Agent 统计作用域写进 tooltip（All spaces）。 |
| H01/H02 | ⚠️ 部分：window() 无宽高字段（已确认）；面板级自适应仅能在自身宽度变化时做，窗口级窄屏策略无法感知——以现有 Telemetry/Files 手动开关作为可逆"专注"手段，未臆造 API。 |
| H03 | ✅ drawer 过渡统一到 tokens 时长；hover 颜色无过渡属性（原生限制）。 |
| H04 | ✅ `zero.reducedMotion` localStorage 开关 + 右栏头部 motion 按钮（24px，可逆）；kit statusDot/banner 短柱/呼吸点全部受控；系统偏好继承不可用（无 API），已记录。 |

## I 验证与交付（进行中）

| ID | 结果 |
| --- | --- |
| I01 | ✅ `tests/data.test.mjs` 7 项（含 isValidModelOption/switchLanded）；测试不随 mod 部署（在仓库 tests/）。 |
| I04 | ✅ install.sh 重写：stamp --check → 源码 check → 暂存 → 备份(700) → 原子发布 → 目标 check → 仅 --switch 才切布局；白名单 9 mod + layout + 两主题。 |
| I05 | ✅ 隔离 HERDR_APP_HOME 演练：干净安装 9 mod ✓；注入损坏 mod → 源码 check 拒绝、目标未动 ✓。 |
| I02/I03/I06/I07 | ⏳ 见「热重载停摆」说明。 |

## 热重载停摆（2026-11-15 20:07 起）

- 机制实测：**编辑器式原子 rename（mv）触发重载；cp 原地覆写不触发**。
- G/H 批量同步（约 30 个 mv 连发）后，窗口对后续 mv/check/显隐重挂均不再加载新代码（motion 按钮 30s+重挂验证仍缺席）；`status` errors 始终为空。
- 当前运行状态 = C+D 版本（已验证正确、无错误、可回退）；E/F/G/H 文件已在运行目录（逐 mod check 全过），等待一次应用重启或窗口焦点触发后生效。
- 不擅自重启用户应用（herdr-app --skill 明令禁止）；恢复动作见交付说明。
