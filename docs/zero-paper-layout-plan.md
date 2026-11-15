# Zero Herdr 融合 Paper 的布局精修开发计划

交接对象：接手实现的开发模型。目标是在 Zero 现有空间结构上，吸收 Paper 的排版、留白、低噪声层次和点阵计量语言，做一套长期使用舒适、状态准确、交互稳定的工作界面。

主题是通用能力，与布局解耦。本计划适配用户当前选择的任何主题，不限定 Zero 或 Paper 配色，不修改主题文件来满足某种视觉风格。此项为用户最新明确要求，优先于仓库指令中暖灰、陶土橙的旧约定。

视觉参考补查及修订方向见文末「网站参考核验与视觉修订」。原计划的功能正确性任务不能替代视觉设计交付；仅通过 check 和数据测试，不代表已完成 Zero 与 Paper 的视觉融合。

最新状态：已按用户后续授权实施并应用视觉改版。具体完成项与实际验证范围见文末「视觉改版交付记录」；此前备份和网站访问状态为当时记录，不代表当前状态。

本轮只完成备份、源码与实际界面审查、开发计划。以下任务均为待实施，不能把计划中的验收标准写成已经通过的结果。除备份及本文外，本轮没有修改或部署产品代码。

## 已完成的备份与基线

- 日期：2026-11-15，Asia/Shanghai。
- 仓库：`/Users/zero/code/herdr-dev`。
- 基线提交：`105ef252b1daf9e521ddb214455d547f95766fc9`；开始时工作区干净。
- 备份目录：`/Users/zero/.local/share/herdr-backups/zero-before-paper-20261115-174423/`，目录权限 700。
- `source-zero-herdr.tar.gz`：整个 `zero-herdr/` 源码，含布局、主题、mod、资源和安装脚本。
- `runtime-zero-herdr.tar.gz`：实际运行目录内 Zero 布局、预览、两套主题、七个 mod，以及 `settings.json`、`keys.json`。
- `runtime-dependencies.tar.gz`：运行目录所有主题、内置 `tabs`、`workspace-chrome` 和 `view.json`，用于补足主题覆盖与外部图标依赖。
- `git-head.txt`、`SHA256SUMS`：基线提交和三个压缩包的 SHA-256。三个压缩包均已通过目录读取检查。
- 临时截图：`/tmp/zero-herdr-before-paper.png`。它含实际会话，不提交；后续丢失时重新捕获。
- `herdr-app status`：当前布局 `zero-herdr`，无错误；zoom 1，终端字号 12，UI 字号 13。
- 当前设置保留用户终端字体 `Maple Mono NF CN`。布局、右栏 mod、深色主题抽样与运行目录一致；尚未做整个运行目录逐文件一致性审计。

备份是文件快照，不是运行会话或 PTY 的可恢复镜像。恢复步骤见最后一节。

## 设计决策

### 保留的空间结构

保持节点 ID 和导航语义：`root → sidebar + work`，`work → tabs + work-body + status`；`work-body` 内保留 `drawer-gutter / main / panel / zero-herdr`。保留浮动 `claude-drawer`、右侧 `status-toggle`、文件与 Changes 的 stack。

| 部位 | 当前值 | 本计划默认值 |
| --- | --- | --- |
| 标签栏 | 42px | 42px，沿用内置 tabs |
| 抽屉固定宽度 | 268px，布局范围 220–360 | 268px；修复内部硬编码宽度与可拖拽宽度的冲突 |
| 浮动抽屉占位 | 50px，peek 44px | 保持 |
| 外边距和区域间隔 | 10px | 保持 |
| 终端卡片 | 圆角 12，头部 30px | 保持 |
| 终端内边距 | `[14,12]` | 保持；不移植 Paper 的终端字体和字号 |
| 文件面板 | 368px，范围 280–900 | 首轮保持，先解决内部溢出 |
| 右侧状态栏 | 300px，范围 280–420 | 保持；外圆角由 6 统一为 12 |
| 底栏 | 26px | 保持 |

不引入 Paper 的常驻双左栏，不改成四张独立的大卡片，不删除底栏，不把所有圆角扩大到 20。右栏内容继续是一个面板，分组靠留白与少量分隔完成。

### 参考选择与转译

来源集合：[Notion 设计与 UI 收藏](https://app.notion.com/p/9ef3d08fae74407eb363af6e7b26500d?v=e0de20c89b8b40b39fc0e8320a174109&source=copy_link)，本轮读取了该视图的全部 22 条记录。

| 参考 | 采用到哪里 | 转译边界 |
| --- | --- | --- |
| [Paper Widgets Dots](https://uberdesigner.ai/t/paper-widgets/dots)；本仓库 `paper-herdr/` | UI 字体层级、圆点额度条、平静的背景层次 | 外站本轮未能直接读取；落地以可检查的本地实现为依据。只转译组件表现，所有配色服从当前主题，不移植参考配色 |
| [Hairline](https://hairline.lucasmarkes.com/figures) | 文件空态、无会话空态的微型线稿 | 参考其 Terminal、Branches、Empty 分类的线稿语言；原创 SVG，不搬网页运行时或交互框架 |
| [60fps](https://60fps.design) | 菜单出现、收起、反馈的节奏检查 | 网站是交互细节参考库；本文时长是本项目设计值，不冒称摘自某个视频 |
| [Impeccable](https://impeccable.style/) | 层级、对齐、文案、减少嵌套卡片的审查 | 采用审查思路；不自动安装 skill，不引入 Web 技术栈 |
| Cult UI、Mobbin、PinUI、Inspora | 可选的图标和交互审稿参考 | 非首轮依赖；遇到具体设计缺口才查阅 |
| Shader、3D、电影 HUD、背景素材、生成工具 | 本轮不采用 | 长时间终端工作需要稳定阅读面，不增加全屏动效、纹理噪声和数字雨 |

### 视觉规范

以下均为实施目标；不覆盖终端内部 CLI 的排版与语法颜色。

- UI 正文优先 Host Grotesk Regular/Medium，中文使用系统回退；路径、快捷键、技术标识与计量数字使用等宽字体。复制字体必须同时带上本地 Paper 已有的 OFL 许可。
- 字号档位：会话标题 14/500；主读数 20/500；正文与控件 12；分组标题 11/500；辅助文字 10.5。删除 7–9px 的必要说明；装饰刻度无需增加字号，直接减少。
- 右栏内边距 12；组间距 12–16；组内间距 6–8；行内间距 4–6。禁止逐处发明近似数值。
- 外层圆角 12；内部 banner 8；控件和菜单项 6；圆点全圆。正常面板保留 1px 主题边界，不叠加深阴影；弹层才允许轻阴影。
- 所有颜色从当前 `theme()` 的语义字段读取，包括 canvas、surface、foreground、muted、border、accent、ring 和状态色。布局不指定固定色值、不强制切换主题、不新增配色覆盖；现有布局的默认主题声明仅保留兼容，不作为组件依赖。缺失字段只能回退到其他已存在的主题语义字段，不能回退到固定暖色或冷色。
- `foreground` 承担必要文字，`muted` 承担辅助文字；`dim` 只用于非必要提示或装饰。普通文本对比度目标 4.5:1，关键控件边界和焦点标识 3:1，逐个实际前景/背景组合计算。
- working 用 `working`，blocked 用 `blocked`，done 用 `done`，unknown 用 `unknown`；同时提供文字，避免只靠颜色。
- 默认图标 14，主要导航图标 16，线宽统一约 1.5；小按钮命中区至少 24×24，菜单行至少 28。保持底栏 26px 时按钮可用高度 24px。
- hover 100–140ms，菜单 140–180ms，抽屉 180–240ms；仅在 GPUI 支持时实现。banner 呼吸沿用 1600ms，短柱保留原有错峰节奏；所有数值只在数据变化时更新。
- 静态模式下保留状态点和短柱轮廓，停止循环。不能为了动画引入高频 JS timer。

## 实际问题清单

1. 当前冷蓝色截图是通用主题能力的正常使用，不是缺陷。需要审查的是所有组件能否随主题切换一致更新，而非让截图匹配仓库附带的主题配色。
2. `zero-herdr/main.js` 的根容器全局使用 Geist Mono，必要说明最小 7px，与 Paper 的信息层级存在明显差距。
3. 右栏 `overflow_hidden()`，选择器内联展开最高 210px，短窗口中下方内容有被裁切的风险。
4. `activeAgent()` 在没有聚焦 Agent 时退回列表第一项；需区分真正聚焦 shell 与 tab 中仍存活的后台 Agent。
5. unknown 状态在渲染中回退为 Idle；done 与 working 的颜色又都映射为 accent，语义不统一。
6. 三类会话各有 3s timer；多个刷新 `finally` 无条件 notify，工作时再每秒刷新整个 View。性能影响尚需采样，不直接声称已经卡顿。
7. Git 轮询缺少独立 in-flight 保护，也未使用 Paper 已采用的 `--no-optional-locks`。
8. Kiro 错误未进入现有 Usage 错误展示条件；空、失败、远程不支持、新鲜度不足需要独立表达。
9. `selectCodexOption()` 通过终端文字判断草稿为空，检查与发送之间仍有竞态；`run('pane.focus')` 也可能夺走后续焦点。
10. 抽屉 `SIDEBAR_W=268` 与 layout 可拖拽范围不一致；ghost 动画和 timer 需要检查取消与热重载。
11. 右栏和抽屉都调用 `setAgentOrder()`，可能竞争全局遍历顺序，需实测确定唯一所有者。
12. Paper 的 `batteryRow()` 硬编码黑白色；其 `shared('paper.session')` 命名空间与跨组件依赖不适合整段复制。
13. `files-menu` 的 Enter 总是执行第一项，缺少上下键选择；本地系统打开命令要继续与远程文件分隔。
14. 当前安装脚本先复制到运行目录再检查，与仓库要求的“源码校验通过再同步”不一致。

## 原子任务与依赖

任务粒度为一个可独立评审的行为或视觉结果。表内文件路径相对仓库根；`Z` 指 `zero-herdr/mods/zero-herdr/`，`D` 指 `zero-herdr/mods/claude-drawer/`。每个任务完成后记录变更文件、验证方式、结果与剩余限制。不得因一项受阻而擅自扩大到 Herdr 核心重写。

### A 基线与能力确认

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| A01 | 无 | 校验现有三个备份校验和；分别解压到 `/tmp/zero-paper-restore-check-*`，抽查布局和 mod | 校验和匹配；解压后的布局 JSON 可解析，关键文件存在；不覆盖运行目录 |
| A02 | A01 | 记录当前主题及通用主题切换机制，确认 layout 与 mod 的主题取值路径 | 保留用户主题选择；将当前冷蓝主题作为正常基线；不诊断或“修复”配色风格差异 |
| A03 | A02 | 对源码七个 mod 运行基线 `herdr-app check`，记录既有报错 | 新问题与旧问题可区分；没有把既有报错归因于后续改动 |
| A04 | A03 | 捕获当前默认、抽屉打开、固定侧栏、右栏收起、Files 打开的基线 | 截图在 `/tmp`，标注窗口逻辑尺寸与缩放；会话草稿不动 |
| A05 | A03 | 查阅本地 `AGENTS.md / herdr.d.ts / gpui-kit.d.ts`，探测模块导入、焦点、popup、尺寸读取、动画、清理 API | 每项给出真实 API 或“不支持”；不能照搬 DOM、CSS media query、React、Framer Motion |
| A06 | A04,A05 | 记录空闲和 working 各 60s 的刷新次数、读取进程数、CPU 基线 | 标注机器与场景；临时采样代码不进入发布包 |

### B 视觉基础

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| B01 | A05 | 新建 `mods/zero-ui/tokens.js`，集中字号、间距、圆角、动效时长，不存颜色值 | 原生导入试验通过；若跨 mod 导入不支持，改用构建时生成，不能用未验证路径 |
| B02 | B01 | 在 `mods/zero-ui/` 添加 Host Grotesk 两个字重及许可，参考 `paper-shell/fonts` 的加载方式 | 拉丁/中文混排无缺字；移走 Paper 安装仍可加载；不覆盖用户终端字体 |
| B03 | B01 | 新建主题到组件语义映射，只在调用时读取 `theme()` | 浅色、深色和用户替代主题切换即时更新；无缓存旧颜色 |
| B04 | B03 | 在至少两套不同色系浅色主题下审查组件语义色使用与对比度；只改组件映射 | 记录实际色对；必要文字不用 dim；不修改主题文件或 ANSI；主题自身对比度不足单独记录，不以固定色覆盖 |
| B05 | B03 | 在至少两套不同色系深色主题下执行同样审查，包含用户当前主题 | 关键数值和 focus 清楚；无固定黑白色块；切换后无残留旧色；主题本身限制与组件错误分开记录 |
| B06 | B01,B03 | 统一 button、label、section、status dot 原语，落于 `mods/zero-ui/` | 支持 normal/hover/pressed/focus/disabled；禁用项不触发动作；不靠减透明度降低必要文字可读性 |
| B07 | B06 | 整理自有 SVG 图标及清单，先替换右栏、pane、文件菜单的外部图标依赖 | 图标 stroke、盒尺寸一致；无丢图；不修改上游内置 mods |

### C 数据正确性与状态

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| C01 | A05 | 从 Z/main.js 抽出纯函数到 Z/data.js，保持现有输出 | Git、Kimi 文本、时长格式的代表性输入输出一致；不同时改视觉 |
| C02 | C01 | 修正活动对象解析，以 `focused()`、活动 space/tab/pane 为准 | 聚焦 shell 时不显示其他 pane 的 Agent 配额；跨空间切换不串数据 |
| C03 | C02 | 为每次读取生成 session identity 和请求序号；区分地址/cwd 身份与仅标题变化 | A→B→A 快速切换中迟到结果不得覆盖更新结果；标题变化不闪成空态 |
| C04 | C03 | 为 Git、Kimi usage 补 in-flight 保护和超时后的释放 | 同一来源最多一个在途读取；失败后下周期可恢复，无永久 loading |
| C05 | C03,C04 | 合并为仅针对当前有效 Agent 的会话读取调度，保留 Kimi 额度独立周期 | 只执行当前适配器；会话约 3s、Git 5s、额度 60s；不因为调度调整增加命令量 |
| C06 | C05 | 对标准化结果做变化比较，移除无变化的 notify | 连续三次相同结果不触发数据重绘；working 计时最多 1Hz，仅在可见时工作 |
| C07 | C04 | Git 命令增加 `--no-optional-locks`，保留远端 `on` 路由 | 非仓库、detached HEAD、无 upstream、冲突、未跟踪文件都显示准确；只读 |
| C08 | C03 | 统一读取状态为 loading/ready/empty/error/unsupported/stale，附 observedAt | 0 与无数据不同；Kiro 错误可见；远端不冒用本地数据；旧缓存标注时间 |
| C09 | C08 | 整理 Kimi 额度缓存身份和过期规则 | 切账号/机器不能展示不明归属的旧额度；无法识别账号时仅作为过期缓存或不展示 |
| C10 | C05,A05 | 在隐藏、销毁、热重载时暂停或清理读取与 timer | 隐藏 60s 不再发起面板读取；重新打开立即刷新；连续热重载没有倍增 timer |
| C11 | C02 | 统一 Agent 排序所有权，审查 Z/main.js 与 D/main.js 的 `setAgentOrder` | 展开/关闭右栏不改变键盘遍历顺序；按稳定 space/tab/pane 顺序循环 |

### D 右栏精修

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| D01 | B06 | 调整 Z/main.js 根容器为 12 圆角，保留 12 内边距；正文与 mono 分开 | 与终端卡片外圆角协调；300px 默认宽不变；不引入大卡片套小卡片 |
| D02 | D01 | 重排右栏信息层级：身份头→banner→Session→Usage→Workspace→Agents | 分组顺序明确；默认宽度标题/模型/读数完整；重要标签不低于 10.5px |
| D03 | D02,C08 | 统一 banner 五种状态，保留 36px 高和 7 根短柱 | unknown 不显示 Idle；blocked、done 有正确文字；短柱只表示活动，不冒充吞吐量 |
| D04 | D02 | 会话标题最多两行，路径单行截断并有完整 tooltip | 中英文长标题不覆盖关闭按钮；路径 tooltip 与真实 cwd 一致；不重复程序名 |
| D05 | D02,C08 | Context 改为一条 24 点线性刻度，旁边保留精确百分比和 Used | 0/1/50/80/100% 无越界；非零小值可见至少一颗点；缺失值为 —，不伪装 0% |
| D06 | D05 | 5-hour 与 Weekly 各用 18 点额度行，明确 Left；上下两行 | 20% 以下有低额度文字/主题警示；不使用 Paper 的硬编码黑底白字；没有重复 Tokens 行 |
| D07 | D06,C08 | Credits 保留独立语义，重置时间用本地时间且可查看完整日期/时区 | Credits 不换算成假百分比；时间字段无效时显示未知；正常字段保留可用部分 |
| D08 | D02,C07 | Workspace 行整理 branch、changed、ahead/behind；长分支截断 | clean/dirty/非仓库可区分；点击入口如保留只打开对应 Changes，不切错仓库 |
| D09 | D02,C11 | Agents 列表统一 28px 行高、焦点底色、状态点和文字 | 1/8/30 个 Agent 可用；多项滚动；列表点击不因排序变化跳错目标 |
| D10 | D03,D04,D07,D09 | 将右栏主体改为可滚动，顶部身份与关闭入口保持可达 | 高度 600px、长标题、全部指标、30 Agent 时仍能到达末项；不盖住终端 |
| D11 | D10,C08 | 增加无 Agent、读取失败、远程不支持的紧凑状态内容 | 每种文案给出原因和恰当下一步；失败保留最后读数并标 stale；不显示无限 loading |

### E 模型与推理选择器

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| E01 | A05,C02 | 从 Z/main.js 抽出切换控制到 Z/switcher.js，记录 target identity | 切换逻辑只接受明确目标；模型列表来自真实读取，不新写死模型名称 |
| E02 | E01 | 将切换前提收敛为“目标仍是 Codex、身份相同、可证明输入为空、无 CLI 弹窗、非进行中切换” | 中文/英文 prompt、未知 prompt、已有草稿、CLI 菜单、运行中状态均不会误发按键；不确定时保守拒绝 |
| E03 | E02 | 检查 Herdr/CLI 是否提供无键盘注入的配置 API；有则替换注入路径 | 记录实际支持证据；没有原子 API 时说明 TOCTOU 局限，不能宣称绝对草稿安全；若无法满足保草稿契约，禁用一键发送并提供手动命令说明 |
| E04 | B06,E01 | 新建 `mods/zero-picker/` 为受控 popup，移出右栏文档流 | 280px 右栏、窗口边缘均可用；打开菜单不推动 Session 以下内容；关闭不清空草稿 |
| E05 | E04 | 实现上下键、Enter、Escape、点击外部关闭和焦点返回 | 按键在菜单内消费，不透传终端；关闭恢复原 pane；选中项、键盘高亮和 hover 可区分 |
| E06 | E03,E05,C03 | 增加 idle/sending/awaiting-confirmation/success/error 状态 | 连点仅发一次；消息先称“请求已发送”；重新读取确认后才更新选中值；超时 10s 保留原值并提示，不能自动重发 |
| E07 | E06 | 目标切换、关闭 pane、模型目录刷新时失效旧菜单 | 从 A 打开的菜单不能应用到 B；已失效回调不发送命令 |

### F 抽屉与终端

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| F01 | B06 | 仅更新 D/main.js 的字体、分组、hover、选中标记 | 保留猫标、空间入口、机器列表和现有浮动展开方式；不变成 Paper 常驻 rail+nav |
| F02 | F01,A05 | 让固定抽屉内容使用可用宽度；浮动态保持 268px | sidebar 在 220/268/360px 均无超出；长名 tooltip 完整；无法获取实际宽度时固定态 w_full |
| F03 | F02 | 明确浮动/固定/转换中状态，保证 sidebar 与 gutter 互斥 | 连续切换 20 次后没有双占位、残留 ghost 或消失的入口；停止/热重载可清理回调 |
| F04 | F01 | 抽屉搜索/菜单/操作的 focus 与事件冒泡审查 | 点击 pin、设置、新建不会误激活其他空间；Escape 只关闭当前弹层 |
| F05 | B06,B07 | 精修 `claude-pane/main.js` 标题基线、路径省略、24px 操作区和 tooltip | 30px 头部不增高；分屏/缩放/关闭各只执行一次；保留现有 stop_propagation |
| F06 | F05,B04,B05 | 修改 layout pane focus 从弱 input 色到可辨识 ring 语义 | 多 pane 时一眼识别键盘所在；不改变边框宽度引起终端尺寸跳动 |
| F07 | A04,F05 | 审查内置 tabs 在深浅色、长标题、多 tab、全屏下的表现 | 42px 顶栏与 macOS traffic lights 不重叠；只调整布局和组件的语义色用法，不调主题配色；禁止直接覆写内置 tabs，实在需要定制则另立后续任务 |

### G 文件与底栏

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| G01 | B06,B07 | 精修 `files/main.js` 行高、缩进、选中、悬停、图标与预览标题 | 维持惰性加载与已有数量/预览限制；深目录和长中文名不覆盖动作 |
| G02 | G01 | 保持 tree/preview 的滚动边界与返回位置；核查 watch 生命周期 | 打开再返回保留位置；切 cwd 不混入旧目录响应；不增加全盘扫描 |
| G03 | G01 | 给空目录、权限失败、二进制、过大文件独立说明 | 说明明确；最多一个 48px 原创 Hairline 风格静态线稿；不抢占正文面积 |
| G04 | B06 | 为 `files-menu/main.js` 添加上下键选择与对应 Enter 执行 | 可键盘选择 Finder 或 Zed；Escape 返回；远程路径不交给本地 open；平台不支持时明确禁用 |
| G05 | B06,C11 | 精修 `zero-status/main.js` 文本层次、分隔、状态聚合和窄屏截断 | 26px 保留；Commands/Files/Changes/右栏开关仍可达；全局 Agent 统计作用域在 tooltip 中说明 |
| G06 | B06,C02 | 更新 `zero-herdr-toggle/main.js`，明确其状态统计作用域 | 状态与 tooltip 一致；关闭右栏后入口可找到；不把其他空间 blocked 冒充当前会话状态 |

### H 尺寸适配与动效

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| H01 | D10,F03,G05 | 建立宽度预算与窄屏策略，修改最少必要的 layout/mod | 以终端至少约 640px 为设计目标；先截断次要文本、再收起可选 panel、再右栏、最后固定 sidebar 回浮动；不反复覆盖用户手动开关 |
| H02 | H01,A05 | 实现经验证支持的尺寸感知；若无可用 API，提供显式“专注模式”及可逆恢复 | 不臆造 window().width（当前类型无此字段）；恢复保留用户原宽度/显隐；默认宽屏布局不变 |
| H03 | D03,F03,E05 | 统一 hover、popup、抽屉过渡时长，只用原生能力 | 动画不影响命中区和焦点；没有每帧 JS 定时器；连续触发不排队播放陈旧动作 |
| H04 | H03,C10 | 增加局部减少动效选项；支持系统偏好时继承 | 静态模式无循环；working 仍可理解；隐藏右栏与窗口不活动时按实际可用能力暂停 |

### I 验证与交付

| ID | 依赖 | 单一任务与文件范围 | 完成判据 |
| --- | --- | --- | --- |
| I01 | C11,E07 | 添加数据与切换边界测试；建议 Node 内置测试，测试文件不随 mod 部署 | 覆盖空数据、0、错误、请求乱序、草稿拒绝、目标失效；无测试向用户真实终端发按键 |
| I02 | D11,F07,G06,H04 | 跑下节视觉/交互矩阵，缺陷逐项修复 | 必测场景有截图或操作记录；不能只靠默认 role 的 check 宣称通过 |
| I03 | C06,C10,H04 | 在同机器同场景复测 A06 性能 | 空闲无变化不因数据 polling 重绘；隐藏无读取；读取进程不重叠；CPU 如持续高于基线需解释并修复 |
| I04 | I01,I02,I03 | 重写 `zero-herdr/install.sh` 为源码校验→暂存→备份目标→复制白名单→目标校验→显式切换 | 任一步失败停止且可恢复；默认安装不要悄悄切布局；新 helper/picker/字体均在白名单；不修改 Paper、GMUNK 或全局字体 |
| I05 | I04 | 在独立 `HERDR_APP_HOME` 暂存目录演练安装失败与恢复 | 故意损坏一个 mod 后拒绝发布；原目标校验和不变或恢复；隔离目录不调用活动窗口切换 |
| I06 | I05 | 准备受控运行部署与回滚演练，完成后再切到目标布局 | 运行目录逐 mod check 通过；status errors 为空；实际窗口核心流程通过；保留部署前新快照 |
| I07 | I06 | 更新 Zero 使用说明、依赖清单与最终验收记录 | 写明减少动效、专注模式、模型切换限制、恢复办法；审查 git diff，只纳入任务文件；本任务不自动提交或推送 |

## 验证矩阵

尺寸按逻辑像素，截图记录屏幕倍率。测试数据放 `/tmp` 或专用 fixtures，不改真实会话内容。

| 类别 | 必测组合 | 通过标准 |
| --- | --- | --- |
| 主题 | 至少两套浅色、两套深色，覆盖不同强调色并包含用户当前主题；连续切换 | 布局与组件均跟随当前主题；无硬编码异色、无缓存旧色、无缺字；记录对比度及主题自身限制；不强制覆盖选择 |
| 尺寸 | 1600×1000、1440×900、1280×800、1024×768；另测高度 600 | 终端优先；所有操作能到达；长内容可滚动；无遮挡/横向裁切 |
| 字体缩放 | UI 默认及放大 125%、150%（使用实际支持的设置） | 标签不压住读数；tooltip 不能成为唯一可读内容 |
| 导航 | drawer 浮动/固定；Files/Changes/右栏显隐；1/4 pane；多 tab | 节点 ID 和快捷键正常；恢复状态不丢；焦点清楚 |
| 会话 | 无 Agent、shell、Codex、Kiro、Antigravity、Kimi、远端 | 数据属于当前目标；不支持有说明；零额度仍准确显示 |
| 状态 | working、blocked、done、idle、unknown | 文案与颜色一致；只有 working 循环；静态模式仍可辨识 |
| 数值 | null、0、1、20、50、80、100、非法/超范围 | 无数据不当作 0；图形夹限；异常值不冒充精确有效读数；Used/Left 清楚 |
| 异步 | 慢请求、超时、乱序、连续切换会话、热重载 | 不串会话；不无限 loading；无重复 timer；失败可恢复 |
| 选择器 | 空输入、草稿、多行中文草稿、CLI 弹窗、运行中、快速双击、选中后换 pane | 非安全状态绝不发按键；只读 UI 操作保留草稿；确认后才变值 |
| 文件 | 空目录、深层目录、权限失败、远端、二进制、大文件、带空格/引号路径 | 不执行错误本地命令；不无界读取；导航位置合理 |
| 菜单 | 鼠标、键盘、Escape、点击外部、窗口边缘、列表长于可视区 | 不向终端漏 Enter；正确恢复焦点；弹层不越界 |

源码和同步后均运行（新 helper 若非独立 mod，则由其消费者校验）：

```sh
for mod in claude-drawer claude-pane zero-herdr zero-herdr-toggle zero-status files files-menu; do
  herdr-app check "zero-herdr/mods/$mod" || exit 1
done
# zero-picker 等新增 mod 也必须加入安装脚本校验白名单。
# 完成同步后，对 ~/.config/herdr-app/mods/ 下同一白名单逐一 check。
herdr-app status
herdr-app shot /tmp/zero-paper-final.png
```

## 实施顺序与停止条件

建议按 A → B → C → D → E → F → G → H → I 推进。表中依赖是最低前提；共享文件串行编辑。先解决数据身份和草稿保护，再对这些状态做视觉精修，避免漂亮界面掩盖错误数据。

每个小任务都遵循：读取相关文件及项目指令 → 最小改动 → 对应验证 → 更新任务记录。一个提交如获授权，最多包含一个行为或一组紧耦合任务。发现新结构需求先记录，不擅自替换 Zero 骨架。

以下任一发生即停止当前变更的部署：草稿被修改/提交、数据串会话、隐藏后持续新增读取、无法回到终端焦点、存在不可达按钮、源码或目标 check 失败。先回退该任务，再修复；不能以视觉“更好看”豁免。

## 回滚步骤

1. 部署前再次备份当时源码与运行文件，保留原始基线不覆盖。记录这次新增的文件清单。
2. 对选定备份执行 `shasum -a 256 -c SHA256SUMS`；先解压至新的 `/tmp` 目录，检查路径与内容。
3. 仅恢复本次修改过的 `zero-herdr` 源文件及运行目录对应白名单；如后来新增 helper/picker，仅移走这次新增且确认无其他依赖的目录。非 Git 历史文件默认用 `trash`。
4. `settings.json / keys.json / view.json` 是参考快照，不整份覆盖：其中可能包含用户之后的新设置和新视图状态。只恢复此次变更明确涉及的字段；备份里的 tabs/workspace-chrome 也仅在确实被本次改动损坏时恢复。
5. 对恢复后的 mod 逐项 `herdr-app check`，确认 `status` 无错误。需要时使用已确认的 `herdr-app do layout.switch --name zero-herdr`，不会恢复或重建 PTY 会话。
6. 检查布局、抽屉、Files、模型控件和草稿。保留失败版本及日志，便于定位；不要用 `git reset --hard` 清掉其他工作。

## 可直接交给开发模型的指令

> 在 `/Users/zero/code/herdr-dev` 工作，先读根目录 AGENTS.md 和本计划。当前任务是保留 Zero 骨架、融合 Paper 细节，按原子任务依赖逐项实现。主题通用且与布局解耦：用户最新要求优先于旧的暖灰陶土橙约定；全部颜色来自当前 theme()，不限定色系、不修改主题配色、不强制主题。先验证已有备份。保留 banner、短柱、模型和推理选择器，不增加重复 Tokens 行。尊重现有终端字体。不要改 Paper/GMUNK，不操作真实会话草稿。每项报告文件、行为、验证结果；源码 check 通过后才能同步，目标目录再次 check。API 不支持时执行文中的降级方案并记录限制，不发明 Web API。不自动提交、不推送。最终交付源码差异、尺寸/主题/交互验收证据和可执行回滚记录。

## 网站参考核验与视觉修订

2026-11-15 补查。此前仅凭收藏说明及部分页面文本，就宣称已参考多个网站，证据不足。这一节区分页面内容、实际图片和动态体验，不能互相替代。本轮没有修改产品代码。

浏览器连接报错 `The browser access host is unavailable`，原生应用连接也不可用。因此本轮没有实际操作网页交互；通过公开网页读取、下载官方预览图并打开图片完成可进行的核验。

### 全部收藏的访问记录

| 网站 | 本轮证据 | 在本项目中的用途 |
| --- | --- | --- |
| [Hairline](https://hairline.lucasmarkes.com/figures) | 读取 figures 分类和条目；未验证鼠标交互 | Terminal、Branches、Empty 是后续线稿候选，不能宣称已看过动态细节 |
| [Diagram Design](https://github.com/cathrynlavery/diagram-design) | 读取公开仓库页面 | 可辅助表达结构，不作为终端界面视觉模板 |
| [Cult UI](https://www.cult-ui.com/) | 阅读目录及 Collab Toolbar、Shift Card 具体文档和页面提供的示例代码 | 工具按钮分组、次要信息按需展开 |
| [Backgrounds Supply](https://backgrounds.supply/) | 读取公开目录 | 背景与纹理素材库；本轮不向终端添加背景纹理 |
| [Pen](https://pen.dev/) | 读取产品页 | 设计工具入口，没有据此选定具体界面组件 |
| [Logo to Use](https://logotouse.com/) | 读取失败 | 未验证，不引用其设计结论 |
| [UX Pilot](https://uxpilot.ai/) | 读取产品页 | 设计生成工具，没有据此选定具体界面组件 |
| [Visily](https://visily.ai/) | 跳转应用后仅有需要 JavaScript 的页面壳 | 未看到产品界面，不引用其视觉结论 |
| [60fps](https://60fps.design/) | 读取目录及 Plasma Duo Style Bottom Sheet Open Interaction 页面；未播放视频 | 动效候选来源，暂不能标注其实际曲线、持续时间或手感 |
| [Magic Patterns](https://magicpatterns.com/) | 读取产品页 | 设计工具入口，没有据此选定具体组件 |
| [Mobbin](https://mobbin.com/) | 读取公开页，并实际查看其 Linear Web 截图 | 导航层级、平面信息分区、选中态与工具栏位置 |
| [HorizonX](https://horizonx.so/) | 读取 Kurage Dashboard 详情，并实际查看 Kurage 与 Glass Effort Slider 官方预览图 | 离散推理档位、控制分组、局部强调；不移植装饰背景 |
| [Inspora](https://inspora.design/) | 读取失败 | 未验证 |
| [Recraft](https://www.recraft.ai/) | 读取产品页 | 资产生成工具；本轮不需要生成品牌图像 |
| [Paper Animation](https://paperanimation.ai/) | 读取产品页 | 纸片动画工具，与 Paper Widgets 不是同一产品；不混为参考 |
| [Impeccable](https://impeccable.style/) | 读取公开的层级与过度卡片化反例 | 用于审查“每项一样重”“卡片套卡片”，未安装工具 |
| [PinUI](https://www.pinui.xyz/) | 读取失败 | 未验证 |
| [Paper Widgets Dots](https://uberdesigner.ai/t/paper-widgets/dots) | 外站读取失败；此前已读本地 paper-herdr 实现 | 可以引用本地 60 点环、额度点列和字体分工，不能称已验证外站原版 |
| [Scroll Shaders](https://scrollshaders.com/) | 读取公开目录 | 着色器背景；目前不符合稳定终端阅读面的需求 |
| [Scrolltide](https://scrolltide.co/) | 读取失败 | 未验证 |
| [GMUNK Oblivion GFX](https://gmunk.com/Oblivion-GFX) | 读取项目说明，并实际查看 Light Table UI 官方图片 | 信息分区、刻度与读数对应；不照搬高密度 HUD |
| [Snapblocks](https://snapblocks.site/) | 读取失败 | 未验证 |

合计：尝试 22 个链接，15 个取得公开页面内容，6 个读取失败，1 个仅取得应用壳。实际打开检查了 4 张官方预览图片；没有完成网站动态交互体验。该记录不是“22 个网站全部看完”的证明。

### 实际图像观察与设计转译

**Mobbin 的 Linear Web。** 截图中左侧导航用缩进、组间留白和单个浅底选中项表达层级；右侧详情主要靠横向分区、标签与读数对齐表达关系，没有给每一行再套一个容器。用于 Zero：抽屉统一图标列与正文起点，组标题降级，当前空间单一选中底色；右栏保留少数大分区，减少重复分隔线。不是复制白色主题。[公开图片](https://mobbin.com/mobbin-marketing-pages/_next/image?dpl=dpl_GBwqyUPrYJHDRMPELXrzFWFqY7JU&q=75&url=%2Fimages%2Fproblem%2Fclean-dashboards%2FLinear%2520Web.png&w=3840)

**HorizonX 的 Glass Effort Slider。** 图片把 Effort、当前 High、离散点位、Faster/Smarter 端点放在同一控件内，含义比一个孤立的 high 标签完整。用于 Zero：推理选择弹层显示真实支持的离散档位、当前值和方向说明；使用明确点击提交，不能在拖动经过每个档位时连续发 CLI 命令；未知模型档位保持普通列表，不假造推荐档位。[官方图片](https://cdn.horizonx.so/site-media/9d744e015de2/images/tools/effort-slider-glass/cover.webp)

**HorizonX 的 Kurage Dashboard。** 图片中主输入区域有集中焦点边界，操作组位于其底部，左侧导航由一致的单线图标组成。用于 Zero：pane 头部把分屏、缩放归组，关闭动作单独区分；焦点只标在当前 pane；图标统一盒尺寸。ASCII 水母、网格和渐变是其产品装饰，不搬进终端正文。[详情](https://horizonx.so/explore/kurage-dashboard) · [官方图片](https://cdn.horizonx.so/kurage-dashboard/gallery-01-composer.webp)

**GMUNK 的 Light Table UI。** 图片将地图、重复的仪表列和诊断面板分区，各组读数与对应图形贴近。用于 Zero：Context 的百分比与点环组成一个视觉单元，额度名称、剩余量和点列组成另一个单元；不能把图形和数值分到面板两端再靠标签猜关系。保留紧凑活动 banner，不新增假遥测。[项目页](https://gmunk.com/Oblivion-GFX) · [官方图片](https://freight.cargo.site/t/original/i/82d595d6390737b6eb7e57ddcff37e13bcf33b6e7072ccd585b0d1366fb7980e/01_OBLVN_Light_Table_UI_01.jpg)

**Cult UI 的具体文档。** Collab Toolbar 明确按区分组图标按钮，Shift Card 明确以 hover/focus 展开次要内容。用于 Zero：工具组与主要内容分层；路径、重置时间的完整信息放在 tooltip 或可展开详情，但模型、状态和百分比不能隐藏。此处依据是文档和代码，不是实际体验动画。[Collab Toolbar](https://www.cult-ui.com/docs/components/collab-toolbar) · [Shift Card](https://www.cult-ui.com/docs/components/shift-card)

### 替换原方案中的视觉任务

以下是视觉修订候选，不是已实现结果。数值为针对 Zero 300px 右栏提出的设计值，不冒称来自网站。实施时保留原有功能回归约束。

| ID | 替代或补充 | 原子任务 | 看得见的完成标准 |
| --- | --- | --- | --- |
| V01 | D02、D04 | 右栏重排为会话身份、读数、工作区三个主要分区；Session 标题提升到 16px，正文 12px，组内 8px、组间 16px；去掉每节重复的顶边线 | 与当前截图并列时，用户能直接区分标题、核心数字、次要说明三个层级；280px 下不裁切 |
| V02 | D05 | 采用本地 Paper 的 60 点环思路，Context 以 96px 点环和中心精确百分比呈现，旁边保留 Context/Used 语义 | 环不是装饰；0、1、50、100 和未知值含义准确；与当前线性小条有明确视觉区别 |
| V03 | D06 | 额度统一为纵向两行，每行名称、精确剩余百分比、18 个等大圆点；取消当前被 flex 拉长的胶囊状点列 | 圆点实际宽高一致；同时有 5h/Weekly 时不挤成两个半宽栏；无重叠标签 |
| V04 | E04、E05 | 推理弹层采用真实模型支持的离散档位展示，选中档位和当前值关联；保留键盘选择与一次确认 | 每个档位可辨识；点击前后状态不同；不新增连续拖动发命令路径；不写死选项数量 |
| V05 | F01、F02 | 按 Linear 截图统一抽屉正文起点、图标列、组标题、选中行；保留折叠时原位置与猫标 | 展开态的所有同级条目左边缘对齐，长名不碰计数；浮动和固定态一致 |
| V06 | F05 | 终端头部按 Collab Toolbar 分为身份区、路径区、分屏缩放组、独立关闭区 | 操作组视觉成组、同尺寸；标题没有按钮同等强调；仍保留事件阻止冒泡 |
| V07 | G01、G03 | 文件面板沿用同一图标列和行间距；空、加载、错误分别呈现；Hairline 仅作为后续原创微线稿候选 | 与抽屉和右栏字体一致；错误不会被线稿或空态遮盖；无权访问时有清晰原因 |
| V08 | I02 | 保存改前与改后同尺寸、同主题、同一状态截图；单独圈出 V01–V07 的变化并逐条对照 | 不以“19 个测试通过”代替视觉完成；每个已实施视觉任务都有可辨认的对比证据 |

本轮预览图下载到 `/tmp/zero-design-references/`，仅用于研究，不作为项目自有资源发布。网站浏览器连接恢复后，优先补查 Paper Widgets 原站、Hairline 具体 figure 和 60fps 视频；在此之前，不指定这些网站未验证的动画参数。

## 视觉改版交付记录

2026-11-15：Edge 原生控制恢复后，实际打开并检查了以下页面：

- Paper Widgets Dots：看到七组件预览、圆点环与电量圆点行，并操作暂停预览。其 Dots 画面使用橙色点阵；页面正文的通用配色说明与 Dots 预览不完全对应，实施继续采用当前 theme()。
- Hairline：筛选 Coding，打开 Branches 详情，看到了细线分支图、局部抬升状态和 intensity 控件。采用克制线条与清晰层次的原则，没有安装其运行库或复制品牌图形。
- Cult UI Collab Toolbar：滚动到真实预览，检查了图标组、分隔线、头像组和外层容器。
- 60fps Plasma Duo Style Bottom Sheet：视频成功播放，观察到初始卡片与展开后的详情层。此参考用于明确弹层与背景的关系，不在 GPUI 中强行仿制网页模糊、共享元素或物理弹簧。

已实施：

| 范围 | 结果 |
| --- | --- |
| 右侧状态栏 | 移除单一满高外框，形成会话、读数、工作区的独立轻卡片；16px 会话标题、统一留白，保留动态 banner 与短柱 |
| Context | 60 点环、中心精确百分比、Used 标签；颜色与阈值仍来自当前主题和真实数据 |
| 额度 | 5-hour/Weekly 使用纵向行、18 个等大圆点、真实剩余百分比；取消被横向拉长的胶囊点 |
| Workspace | 分支与本地/远程信息靠近，改动文件数形成独立读数；只有多个 Agent 时展示 Agent 列表，避免重复 |
| 推理选择器 | 真实支持的档位点列、当前档位标题、左右键预选、Apply 明确提交；Escape 取消；选择当前值仅关闭菜单 |
| 模型菜单 | 滚动列表、选中背景与选中标记；修正通用菜单构建器遗漏第二个子元素的问题 |
| 终端头部 | UI 字体与等宽路径分工，分屏/缩放操作放入统一工具组，关闭按钮用分隔线区分 |
| 抽屉与文件 | 统一 UI 字体、分组标题、图标起点及间距；降低重复描边，保留猫标和原导航方式 |
| 主题 | 所有新视觉从 theme() 读取；没有修改主题配色；浅色检查后恢复用户原来的深色 ink 与终端字体 |

验证完成：19 个自动化测试通过；9 个 mod 源码与部署目录 check 均通过；实际打开推理菜单、按右键预选 xhigh、Escape 取消后仍为 high；打开模型菜单、Files 和浮动抽屉；当前深色 ink 与浅色 claude-light 截图均已检查；最终 `herdr-app status` 无错误、无残留弹层。真实 CLI 模型切换提交没有在用户工作中的会话上试发，发送/取消路径由隔离测试覆盖。

截图：`/tmp/zero-before-visual.png`、`/tmp/zero-paper-final.png`、`/tmp/zero-paper-light.png`。原尺寸为 2940×1630 物理像素；未声称原计划全部窄屏、缩放及多 Agent 组合已经验收。

改版前源码备份：`/Users/zero/.local/share/herdr-backups/zero-before-visual-20261115-211136/source.tar.gz`。首次视觉部署前运行备份：`/Users/zero/.local/share/herdr-backups/zero-pre-install-20261115-211440.TgoIDF/`。后续菜单标记修正部署备份：`/Users/zero/.local/share/herdr-backups/zero-pre-install-20261115-211646.ECFUph/`。未提交或推送。
