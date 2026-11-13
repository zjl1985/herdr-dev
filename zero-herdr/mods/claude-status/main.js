import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, appHome, exec, hc, home, notify, panes, run, setAgentOrder, spaces, theme } from "herdr";

const STATUS = {
  blocked: { label: "Needs input", color: "blocked" },
  working: { label: "Working", color: "working" },
  done: { label: "Finished", color: "done" },
  idle: { label: "Idle", color: "idle" },
  unknown: { label: "Unknown", color: "unknown" },
};

function statusInfo(status) {
  return STATUS[status] ?? STATUS.unknown;
}

function programIcon(program, size, color) {
  if (!program?.icon) return null;
  return program.tint
    ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).w(size).h(size).flex_none();
}

function folder(cwd, homeDir) {
  if (!cwd) return "";
  return cwd === homeDir ? "~" : cwd.startsWith(homeDir + "/") ? "~" + cwd.slice(homeDir.length) : cwd;
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function parseGitStatus(output) {
  const result = { branch: null, changed: 0, ahead: 0, behind: 0 };
  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) result.branch = line.slice(14);
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        result.ahead = Number(match[1]);
        result.behind = Number(match[2]);
      }
    }
    if (/^(?:1|2|u|\?) /.test(line)) result.changed += 1;
  }
  return result;
}

function parseKimiUsage(output) {
  const match = output.match(/context:\s*(\d+(?:\.\d+)?)%\s*\((\d+(?:\.\d+)?[kKM]?)\s*\/\s*(\d+(?:\.\d+)?[kKM]?)\)/);
  if (!match) return null;
  return { percent: Number(match[1]), used: match[2], total: match[3] };
}

function parseKimiLimits(output) {
  const fiveHour = output.match(/5h limit[^\n]*?(\d+(?:\.\d+)?)%\s+used\s+resets in\s+([^\n│]+)/);
  const weekly = output.match(/Weekly limit[^\n]*?(\d+(?:\.\d+)?)%\s+used\s+resets in\s+([^\n│]+)/);
  if (!fiveHour && !weekly) return null;
  return {
    fiveHour: fiveHour ? { percent: Number(fiveHour[1]), resets: fiveHour[2].trim() } : null,
    weekly: weekly ? { percent: Number(weekly[1]), resets: weekly[2].trim() } : null,
  };
}

function taskTitle(agent, tab, space) {
  if (tab?.named && tab.name) return tab.name;
  const title = (agent?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const generic = [agent?.program?.name, agent?.app, agent?.address, space?.name]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (title && !generic.includes(title.toLowerCase()) && !/^t[0-9a-z]+$/i.test(title) && !/^[~/]/.test(title)) {
    return title;
  }
  return space?.name ?? "No active task";
}

export default class ClaudeStatus extends View {
  init(_props, cx) {
    this.picker = null;
    this.switching = false;
    this.codex = null;
    this.codexKey = null;
    this.codexLoading = false;
    this.kiro = null;
    this.kiroKey = null;
    this.kiroBase = null;
    this.kiroLoading = false;
    this.git = null;
    this.gitKey = null;
    this.usage = null;
    this.usageKey = null;
    this.limitsLoading = false;
    try {
      this.limits = JSON.parse(localStorage.getItem("kimi.limits") ?? "null");
    } catch {
      this.limits = null;
    }
    this.refreshGit(cx);
    this.refreshUsage(cx);
    cx.spawn((cx) => this.refreshCodex(cx));
    cx.timer.every(3000, (cx) => cx.spawn((cx) => this.refreshCodex(cx)));
    cx.spawn((cx) => this.refreshKiro(cx));
    cx.timer.every(3000, (cx) => cx.spawn((cx) => this.refreshKiro(cx)));
    cx.timer.after(300, (cx) => {
      if (!this.limits) this.refreshLimits(cx);
    });
    cx.timer.every(5000, (cx) => this.refreshGit(cx));
    cx.timer.every(3000, (cx) => this.refreshUsage(cx));
    cx.timer.every(1000, (cx) => cx.notify());
  }

  togglePicker(kind, address, cx) {
    this.picker = this.picker?.kind === kind && this.picker?.address === address ? null : { kind, address };
    cx.notify();
  }

  async selectCodexOption(agent, selection, cx) {
    if (this.switching) return;
    this.switching = true;
    cx.notify();
    try {
      const option = selection.model ?? selection.effort;
      if (!/^[a-zA-Z0-9._-]+$/.test(option)) throw new Error('Invalid model option');
      // Recheck the target and composer; never clear or submit a user's draft.
      const terminal = JSON.parse((await hc(['get', agent.address])).stdout);
      if (terminal.status?.app !== 'codex') throw new Error('This terminal is no longer running Codex.');
      const screen = (await hc(['read', agent.address, '--lines', '80'])).stdout ?? '';
      const prompt = screen.split('\n').filter(line => /^\s*›/.test(line)).pop()?.trim();
      if (prompt !== '› Ask Codex to do anything') {
        throw new Error('请先收起 CLI 弹窗并处理输入框中的草稿，再选择模型或推理强度。');
      }
      const command = selection.model ? '/model ' + selection.model : '/model --reasoning=' + selection.effort;
      run('pane.focus', { pane: agent.pane });
      const result = await hc(['keys', agent.address, ...Array.from(command, ch => ch === ' ' ? 'space' : ch), 'enter']);
      if (result.code !== 0) throw new Error('Codex did not accept the switch command.');
      this.picker = null;
      notify({ title: '已发送切换请求', body: 'Codex 确认后，右侧会更新。', timeout: 2500 });
    } catch (error) {
      notify({ title: '暂时无法切换', body: String(error.message ?? error), level: 'warning' });
    } finally { this.switching = false; cx.notify(); }
  }

  async refreshCodex(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.[0];
    const list = agents().filter((agent) => agent.space === space?.id && agent.tab === tab?.id);
    const lead = list.find((agent) => agent.focused) ?? list[0];
    const pane = panes().find((item) => item.pane === lead?.pane);
    const key = lead?.app === "codex" ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, "")]) : null;
    if (key !== this.codexKey) { this.codexKey = key; this.codex = null; cx.notify(); }
    if (!key || this.codexLoading) return;
    if (space?.machine) { this.codex = { error: "Codex data is available on local terminals" }; cx.notify(); return; }
    this.codexLoading = true;
    try {
      const result = await exec("node", [appHome() + "/mods/claude-status/codex-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 });
      if (key === this.codexKey) this.codex = JSON.parse(result.stdout);
    } catch { if (key === this.codexKey) this.codex = { error: "Codex session data unavailable" }; }
    finally { this.codexLoading = false; cx.notify(); }
  }

  async refreshKiro(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.[0];
    const list = agents().filter((agent) => agent.space === space?.id && agent.tab === tab?.id);
    const lead = list.find((agent) => agent.focused) ?? list[0];
    const pane = panes().find((item) => item.pane === lead?.pane);
    const isKiro = lead?.app === "kiro" || lead?.program?.key === "kiro";
    const key = isKiro ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, "")]) : null;
    // A title change in the same pane re-reads the session but keeps the last data visible.
    const base = isKiro ? JSON.stringify([lead.address, pane?.cwd]) : null;
    if (base !== this.kiroBase) { this.kiroBase = base; this.kiro = null; cx.notify(); }
    if (key !== this.kiroKey) this.kiroKey = key;
    if (!key || this.kiroLoading) return;
    if (space?.machine) { this.kiro = { error: "Kiro data is available on local terminals" }; cx.notify(); return; }
    this.kiroLoading = true;
    try {
      const result = await exec("node", [appHome() + "/mods/claude-status/kiro-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 });
      if (key === this.kiroKey) this.kiro = JSON.parse(result.stdout);
    } catch { if (key === this.kiroKey) this.kiro = { error: "Kiro session data unavailable" }; }
    finally { this.kiroLoading = false; cx.notify(); }
  }

  async refreshGit(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.[0];
    const cwd = panes().find((pane) => pane.tab === tab?.id && pane.focused)?.cwd ?? space?.folder;
    const key = `${space?.machine ?? ""}:${cwd ?? ""}`;
    if (key !== this.gitKey) {
      this.gitKey = key;
      this.git = null;
      cx.notify();
    }
    if (!cwd) return;
    try {
      const result = await exec("git", ["status", "--porcelain=v2", "--branch"], {
        cwd,
        on: space?.machine,
        timeout: 5000,
      });
      if (key === this.gitKey) this.git = result.code === 0 ? parseGitStatus(result.stdout) : null;
    } catch {
      if (key === this.gitKey) this.git = null;
    }
    cx.notify();
  }

  async refreshUsage(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const agentList = agents().filter((agent) => !space || agent.space === space.id);
    const lead = agentList.find((agent) => agent.status === "blocked")
      ?? agentList.find((agent) => agent.status === "working")
      ?? agentList[0];
    const key = lead?.app === "kimi-code" ? lead.address : null;
    if (key !== this.usageKey) {
      this.usageKey = key;
      this.usage = null;
      cx.notify();
    }
    if (!key) return;
    try {
      const result = await hc(["read", key, "--lines", "12"]);
      const usage = parseKimiUsage(result.stdout ?? "");
      if (key === this.usageKey && usage) this.usage = usage;
    } catch {}
    cx.notify();
  }

  refreshLimits(cx) {
    const key = this.usageKey;
    if (!key || this.limitsLoading) return;
    this.limitsLoading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await hc(["keys", key, "esc"]);
        await hc(["send", key, "/usage"]);
        cx.timer.after(1200, (cx) => {
          cx.spawn(async (cx) => {
            try {
              const result = await hc(["read", key, "--lines", "45"]);
              const limits = parseKimiLimits(result.stdout ?? "");
              if (limits && key === this.usageKey) {
                this.limits = { ...limits, readAt: Date.now() };
                localStorage.setItem("kimi.limits", JSON.stringify(this.limits));
              }
            } catch {} finally {
              try {
                await hc(["keys", key, "esc"]);
              } catch {}
              this.limitsLoading = false;
              cx.notify();
            }
          });
        });
      } catch {
        this.limitsLoading = false;
        cx.notify();
      }
    });
  }

  render() {
    const t = theme();
    const c = {
      bg: t.surface, inset: t.canvas ?? t.background,
      hover: t.hover ?? t.border, selected: t.selected ?? t.border,
      line: t.border, track: t.input ?? t.border,
      text: t.foreground, muted: t.muted, dim: t.dim,
      accent: t.accent, working: t.working ?? t.accent, ok: t.accent,
      warn: t.ansi3 ?? t.accent, alert: t.blocked ?? t.accent,
    };
    const space = spaces().find(s => s.active) ?? spaces()[0];
    const tab = space?.tabs?.find(t => t.active) ?? space?.tabs?.[0];
    const list = agents().filter(a => a.space === space?.id).sort((a,b) => Number(b.focused)-Number(a.focused));
    const lead = list.find(a => a.focused) ?? list.find(a => a.tab === tab?.id) ?? list[0];
    const pane = panes().find(p => p.pane === lead?.pane) ?? panes().find(p => p.tab === tab?.id && p.focused);
    const key = lead?.app === 'codex' ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, '')]) : null;
    const codex = key && key === this.codexKey ? this.codex : null;
    const isKiro = lead?.app === 'kiro' || lead?.program?.key === 'kiro';
    const kiroBase = isKiro ? JSON.stringify([lead.address, pane?.cwd]) : null;
    const kiro = kiroBase && kiroBase === this.kiroBase ? this.kiro : null;
    const credits = kiro?.credits ?? null;
    const isKimi = lead?.app === 'kimi-code';
    const isCodex = lead?.app === 'codex';
    const context = codex?.context ?? kiro?.context ?? (isKimi ? this.usage : null);
    const weekly = codex?.weekly?.left ?? (isKimi && this.limits?.weekly ? 100-this.limits.weekly.percent : null);
    const fiveHour = codex?.fiveHour?.left ?? (isKimi && this.limits?.fiveHour ? 100-this.limits.fiveHour.percent : null);
    const working = lead?.status === 'working';
    const toneOf = status => status === 'working' ? c.working : status === 'blocked' ? c.alert : status === 'done' ? c.ok : c.dim;
    const stateColor = lead ? toneOf(lead.status) : c.dim;
    const known = lead && STATUS[lead.status] && lead.status !== 'unknown';
    const stateLabel = known ? statusInfo(lead.status).label : STATUS.idle.label;
    const cwd = codex?.cwd ?? pane?.cwd ?? space?.folder;
    const title = codex?.title ?? kiro?.title ?? taskTitle(lead, tab, space);
    const programName = lead?.program?.name ?? 'Status';
    const rawModel = codex?.model?.replace(/^gpt/i, 'GPT').replace(/astra/i, 'Astra') ?? kiro?.model ?? null;
    // Hide the model when it only repeats the program name shown in the header.
    const model = rawModel && rawModel.toLowerCase() !== programName.toLowerCase() ? rawModel : null;
    const elapsed = working && tab?.working_since ? formatDuration(Date.now()-tab.working_since) : null;
    const branch = this.git?.branch ?? pane?.branch;
    const pickerOpen = kind => this.picker?.kind === kind && this.picker?.address === lead?.address;
    setAgentOrder(list.map(a => a.address));

    const text = (value, size=10, color=c.muted) => div().text_size(size).text_color(color).child(String(value));
    const dot = (color, pulse=false, size=5) => div().size(size).flex_none().rounded_full().bg(color)
      .when(pulse, el => el.loop('opacity', { from: 0.35, to: 1, period: 1600 }));
    const hairline = () => v_flex().w_full().gap(10).pt(12).border_t(1).border_color(c.line);
    const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
    const meter = (name, value, suffix, low) => v_flex().w_full().gap(6)
      .child(h_flex().w_full().items_end().justify_between()
        .child(text(name,10,c.muted))
        .child(h_flex().items_end().gap(4)
          .child(text(`${Math.round(value)}%`,11,c.text).font_medium())
          .child(text(suffix,9,c.dim))))
      .child(div().w_full().h(2).rounded_full().bg(c.track).overflow_hidden()
        .child(div().h_full().rounded_full().w(`${clamp(value)}%`).bg(low ? c.warn : c.accent)));
    // Only interactive pickers get a frame.
    const chip = (id, open) => h_flex().id(id).min_w(0).items_center().gap(5).py(4)
      .px(7).rounded(5).border(1).border_color(c.line).bg(open ? c.selected : c.inset);
    const icon = programIcon(lead?.program, 14, c.muted);
    const options = this.picker?.kind === 'model'
      ? (codex?.models ?? []).map(m=>({value:m.id,label:m.name,selected:m.id===codex?.model}))
      : (codex?.models?.find(m=>m.id===codex?.model)?.efforts ?? []).map(e=>({value:e,label:e,selected:e===codex?.effort}));

    const hasContext = context?.percent != null;
    const hasWeekly = weekly != null;
    const meta = [
      fiveHour != null ? `5h ${Math.round(fiveHour)}% left` : null,
      codex?.weekly?.resetsAt ? `resets ${new Date(codex.weekly.resetsAt*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : null,
      credits != null ? `credits ${Number(Number(credits).toFixed(2))}` : null,
    ].filter(Boolean);
    const usageError = !hasContext && !hasWeekly && !meta.length ? (codex?.error ?? null) : null;
    const showUsage = hasContext || hasWeekly || meta.length > 0 || Boolean(usageError) || isKimi;
    const showChips = isCodex || Boolean(model);

    const sync = this.git?.ahead || this.git?.behind ? `↑${this.git.ahead} ↓${this.git.behind}` : null;
    const footer = [space?.machine, branch ? `⑂ ${branch}` : null].filter(Boolean).join(' · ');
    const tail = [this.git?.changed ? `${this.git.changed} changed` : null, sync].filter(Boolean);

    return v_flex().id('claude-status-root').size_full().bg(c.bg).border(1).border_color(c.line)
      .rounded(6).p(12).gap(14).font_family('Geist Mono').overflow_hidden()
      .child(h_flex().w_full().items_center().justify_between()
        .child(h_flex().min_w(0).gap(7).items_center()
          .when(Boolean(icon), el => el.child(icon))
          .child(text(programName,11,c.text).font_medium().truncate()))
        .child(div().id('status-close').size(20).flex_none().flex().items_center().justify_center().rounded(5)
          .cursor_pointer().text_color(c.dim).hover(s=>s.bg(c.hover).text_color(c.text)).tooltip('Hide status panel')
          .on_click(()=>run('layout.hide',{id:'agent-status'}))
          .child(svg('mods/workspace-chrome/panel-right.svg').size(12))))
      .child(h_flex().id('session-signal-banner').w_full().h(34).flex_none()
        .px(10).rounded(6).bg(c.inset).border(1).border_color(c.line)
        .items_center().justify_between().gap(10)
        .child(h_flex().min_w(0).items_center().gap(8)
          .child(dot(stateColor, working, 6))
          .child(text(stateLabel,10,known && lead.status !== 'idle' ? stateColor : c.muted).font_medium().flex_none())
          .when(Boolean(elapsed), el => el.child(text(elapsed,9,c.dim).truncate())))
        .child(h_flex().h(16).flex_none().items_end().gap(2)
          .tooltip('会话活动指示')
          .children([7,12,16,10,14,8,11].map((height,i)=>
            div().id('signal-bar-'+i).w(2).h(working ? height : 2+(i%2)*2).rounded_full()
              .bg(working ? c.working : c.dim)
              .when(working,el=>el.loop('height',{from:3+(i%3),to:height,period:880+i*137})
                .loop('opacity',{from:0.4,to:1,period:1150+i*93}))))))
      .child(v_flex().w_full().gap(6)
        .child(div().w_full().text_size(13).font_semibold().truncate().text_color(c.text).child(title))
        .when(Boolean(cwd), el => el.child(text(folder(cwd,home()),10,c.dim).w_full().truncate().tooltip(cwd ?? '')))
        .when(showChips, el => el.child(isCodex
          ? h_flex().w_full().pt(4).items_center().gap(6)
            .child(chip('codex-model-picker', pickerOpen('model'))
              .cursor_pointer().hover(s=>s.bg(c.hover))
              .tooltip('选择当前会话的模型').on_click((_e,cx)=>this.togglePicker('model',lead.address,cx))
              .child(text(rawModel ?? programName,10,c.text).truncate())
              .child(text('⌄',10,c.dim)))
            .when(Boolean(codex?.effort),el=>el.child(chip('codex-effort-picker', pickerOpen('effort')).flex_none()
              .cursor_pointer().hover(s=>s.bg(c.hover)).tooltip('选择推理强度')
              .on_click((_e,cx)=>this.togglePicker('effort',lead.address,cx))
              .child(text(codex.effort,10,c.text)).child(text('⌄',10,c.dim))))
          : h_flex().w_full().items_center().gap(8)
            .child(text(model,10,c.muted).min_w(0).truncate())))
        .when(this.picker?.address === lead?.address && Boolean(this.picker), el=>el.child(
          v_flex().id('codex-options').w_full().max_h(210).overflow_y_scrollbar().gap(1)
            .p(4).rounded(6).bg(c.inset).border(1).border_color(c.line)
            .child(text(this.picker.kind === 'model' ? 'Model' : 'Reasoning',9,c.dim).px(6).pt(2).pb(4))
            .children(options.map(option=>h_flex().id('codex-option-'+option.value).w_full().px(6).py(5).rounded(4)
                .when(option.selected, el=>el.bg(c.selected)).items_center().justify_between().cursor_pointer()
                .hover(s=>s.bg(c.hover)).tooltip(this.switching ? '正在发送…' : option.label)
                .on_click((_e,cx)=>{ if (!this.switching) { const selection = this.picker.kind==='model' ? {model:option.value} : {effort:option.value}; cx.spawn(cx=>this.selectCodexOption(lead,selection,cx)); } })
                .child(text(option.label,10,option.selected?c.text:c.muted))
                .child(text(option.selected?'✓':'',10,c.accent))))
            .when(!codex?.models?.length, el=>el.child(text('模型目录尚未就绪',10,c.dim).px(6).py(4)))
        )))
      .when(showUsage, el => el.child(hairline()
        .when(hasContext, el => el.child(meter('Context',context.percent,'used',context.percent >= 80)))
        .when(hasWeekly, el => el.child(meter('Weekly',weekly,'left',weekly <= 20)))
        .when(meta.length > 0, el => el.child(text(meta.join(' · '),9,c.dim).truncate()))
        .when(Boolean(usageError), el => el.child(text(usageError,9,c.dim).truncate()))
        .when(isKimi, el => el.child(text(this.limitsLoading ? 'Refreshing…' : '↻ Refresh limits',9,c.dim)
          .id('refresh-kimi-limits').cursor_pointer().hover(s=>s.text_color(c.text)).on_click((_e,cx)=>this.refreshLimits(cx))))))
      .when(list.length > 1, el => el.child(hairline().gap(6)
        .child(h_flex().w_full().items_center().justify_between()
          .child(text('Agents',9,c.dim))
          .child(text(String(list.length),9,c.dim)))
        .child(v_flex().id('status-agent-list').w_full().gap(1).max_h(90).overflow_y_scrollbar()
          .children(list.map(agent=>h_flex().id(`status-agent-${agent.address}`).w_full().items_center().gap(8)
            .px(7).py(5).rounded(5).when(agent.focused, el=>el.bg(c.selected)).cursor_pointer()
            .hover(s=>s.bg(c.hover)).on_click(()=>run('pane.focus',{pane:agent.pane}))
            .child(dot(toneOf(agent.status),agent.status==='working'))
            .child(text(agent.program?.name ?? 'Agent',10,agent.focused ? c.text : c.muted).flex_1().min_w(0).truncate())
            .child(text(statusInfo(agent.status).label.toLowerCase(),9,c.dim).flex_none()))))))
      .child(div().flex_1())
      .when(Boolean(footer), el => el.child(h_flex().w_full().min_w(0).items_center().gap(6)
        .child(text(footer,9,c.dim).min_w(0).truncate())
        .when(tail.length > 0, el => el.child(text('· ' + tail.join(' · '),9,this.git?.changed ? c.warn : c.dim).flex_none()))));
  }
}
