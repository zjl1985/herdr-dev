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

function activeAgent() {
  const space = spaces().find((item) => item.active) ?? spaces()[0];
  const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.[0];
  const list = agents().filter((agent) => agent.space === space?.id && agent.tab === tab?.id);
  const lead = list.find((agent) => agent.focused) ?? list[0];
  const pane = panes().find((item) => item.pane === lead?.pane);
  return { space, tab, lead, pane };
}

export default class ZeroHerdr extends View {
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
    this.agy = null;
    this.agyKey = null;
    this.agyBase = null;
    this.agyLoading = false;
    this.git = null;
    this.gitKey = null;
    this.usage = null;
    this.usageKey = null;
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
    cx.spawn((cx) => this.refreshAgy(cx));
    cx.timer.every(3000, (cx) => cx.spawn((cx) => this.refreshAgy(cx)));
    cx.timer.every(5000, (cx) => this.refreshGit(cx));
    cx.timer.every(3000, (cx) => this.refreshUsage(cx));
    cx.timer.every(1000, (cx) => {
      if (activeAgent().lead?.status === "working") cx.notify();
    });
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
    const { space, lead, pane } = activeAgent();
    const key = lead?.app === "codex" ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, "")]) : null;
    if (key !== this.codexKey) { this.codexKey = key; this.codex = null; cx.notify(); }
    if (!key || this.codexLoading) return;
    if (space?.machine) { this.codex = { error: "Codex data is available on local terminals" }; cx.notify(); return; }
    this.codexLoading = true;
    try {
      const result = await exec("node", [appHome() + "/mods/zero-herdr/codex-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 });
      if (key === this.codexKey) this.codex = JSON.parse(result.stdout);
    } catch { if (key === this.codexKey) this.codex = { error: "Codex session data unavailable" }; }
    finally { this.codexLoading = false; cx.notify(); }
  }

  async refreshKiro(cx) {
    const { space, lead, pane } = activeAgent();
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
      const result = await exec("node", [appHome() + "/mods/zero-herdr/kiro-status.cjs", pane?.cwd ?? "", lead.title ?? "", JSON.stringify(this.kiro?.cache ?? null)], { timeout: 5000 });
      if (key === this.kiroKey) this.kiro = JSON.parse(result.stdout);
    } catch { if (key === this.kiroKey) this.kiro = { error: "Kiro session data unavailable" }; }
    finally { this.kiroLoading = false; cx.notify(); }
  }

  async refreshAgy(cx) {
    const { space, lead, pane } = activeAgent();
    const isAgy = lead?.app === "antigravity" || lead?.app === "agy" || lead?.program?.key === "antigravity" || lead?.program?.name?.toLowerCase().includes("antigravity");
    const key = isAgy ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, "")]) : null;
    const base = isAgy ? JSON.stringify([lead.address, pane?.cwd]) : null;
    if (base !== this.agyBase) { this.agyBase = base; this.agy = null; cx.notify(); }
    if (key !== this.agyKey) this.agyKey = key;
    if (!key || this.agyLoading) return;
    if (space?.machine) { this.agy = { error: "Antigravity data is available on local terminals" }; cx.notify(); return; }
    this.agyLoading = true;
    try {
      const result = await exec("node", [appHome() + "/mods/zero-herdr/agy-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 });
      if (key === this.agyKey) this.agy = JSON.parse(result.stdout);
    } catch { if (key === this.agyKey) this.agy = { error: "Antigravity session data unavailable" }; }
    finally { this.agyLoading = false; cx.notify(); }
  }

  async refreshGit(cx) {
    const { space, pane } = activeAgent();
    const cwd = pane?.cwd ?? space?.folder;
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
    const { lead } = activeAgent();
    const key = lead?.app === "kimi-code" ? lead.address : null;
    if (key !== this.usageKey) {
      this.usageKey = key;
      this.usage = null;
      cx.notify();
    }
    if (!key) return;
    try {
      const result = await hc(["read", key, "--lines", "45"]);
      const output = result.stdout ?? "";
      const usage = parseKimiUsage(output);
      const limits = parseKimiLimits(output);
      if (key === this.usageKey && usage) this.usage = usage;
      if (key === this.usageKey && limits) {
        this.limits = { ...limits, readAt: Date.now() };
        localStorage.setItem("kimi.limits", JSON.stringify(this.limits));
      }
    } catch {}
    cx.notify();
  }

  render() {
    const t = theme();
    const c = {
      bg: t.surface, inset: t.canvas ?? t.background,
      hover: t.hover ?? t.border, selected: t.selected ?? t.border,
      line: t.border, track: t.input ?? t.border,
      text: t.foreground, muted: t.muted, dim: t.dim,
      accent: t.accent, working: t.accent, ok: t.accent,
      warn: t.ansi3 ?? t.accent, alert: t.blocked ?? t.accent,
    };
    const { space, tab, lead, pane } = activeAgent();
    const list = agents().filter(a => a.space === space?.id).sort((a,b) => Number(b.focused)-Number(a.focused));
    const key = lead?.app === 'codex' ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, '')]) : null;
    const codex = key && key === this.codexKey ? this.codex : null;
    const isKiro = lead?.app === 'kiro' || lead?.program?.key === 'kiro';
    const kiroBase = isKiro ? JSON.stringify([lead.address, pane?.cwd]) : null;
    const kiro = kiroBase && kiroBase === this.kiroBase ? this.kiro : null;
    const isAgy = lead?.app === 'antigravity' || lead?.app === 'agy' || lead?.program?.key === 'antigravity' || lead?.program?.name?.toLowerCase().includes('antigravity');
    const agyBase = isAgy ? JSON.stringify([lead.address, pane?.cwd]) : null;
    const agy = agyBase && agyBase === this.agyBase ? this.agy : null;
    const credits = kiro?.credits ?? null;
    const isKimi = lead?.app === 'kimi-code';
    const isCodex = lead?.app === 'codex';
    const context = codex?.context ?? kiro?.context ?? agy?.context ?? (isKimi ? this.usage : null);
    const weekly = codex?.weekly?.left ?? agy?.weekly?.left ?? (isKimi && this.limits?.weekly ? 100-this.limits.weekly.percent : null);
    const fiveHour = codex?.fiveHour?.left ?? agy?.fiveHour?.left ?? (isKimi && this.limits?.fiveHour ? 100-this.limits.fiveHour.percent : null);
    const weeklyReset = codex?.weekly?.resetsAt ?? agy?.weekly?.resetsAt ?? null;
    const working = lead?.status === 'working';
    const toneOf = status => status === 'working' ? c.working : status === 'blocked' ? c.alert : status === 'done' ? c.ok : c.dim;
    const stateColor = lead ? toneOf(lead.status) : c.dim;
    const known = lead && STATUS[lead.status] && lead.status !== 'unknown';
    const stateLabel = known ? statusInfo(lead.status).label : STATUS.idle.label;
    const cwd = codex?.cwd ?? kiro?.cwd ?? agy?.cwd ?? pane?.cwd ?? space?.folder;
    const title = codex?.title ?? kiro?.title ?? agy?.title ?? taskTitle(lead, tab, space);
    const programName = lead?.program?.name ?? (isAgy ? 'Antigravity' : 'Status');
    const rawModel = codex?.model?.replace(/^gpt/i, 'GPT').replace(/astra/i, 'Astra') ?? kiro?.model ?? agy?.model ?? null;
    const effort = codex?.effort ?? agy?.effort ?? null;
    // Hide the model when it only repeats the program name shown in the header.
    const model = rawModel && rawModel.toLowerCase() !== programName.toLowerCase() ? rawModel : null;
    const elapsed = working && tab?.working_since ? formatDuration(Date.now()-tab.working_since) : null;
    const branch = this.git?.branch ?? pane?.branch;
    const pickerOpen = kind => this.picker?.kind === kind && this.picker?.address === lead?.address;
    setAgentOrder(list.map(a => a.address));

    const text = (value, size=10, color=c.muted) => div().text_size(size).text_color(color).child(String(value));
    const dot = (color, pulse=false, size=5) => div().size(size).flex_none().rounded_full().bg(color)
      .when(pulse, el => el.loop('opacity', { from: 0.35, to: 1, period: 1600 }));
    const label = (value, color=c.dim) => text(value, 9, color).font_medium();
    const section = (name, right=null) => v_flex().w_full().gap(6).pt(10).border_t(1).border_color(c.line)
      .child(h_flex().w_full().items_center().justify_between()
        .child(label(name))
        .when(Boolean(right), el => el.child(right)));
    const row = (name, value, color=c.muted) => h_flex().w_full().items_center().justify_between().gap(10)
      .child(text(name,10,c.dim).flex_none()).child(text(value,10,color).min_w(0).truncate());
    const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
    // Instrument ticks express a real 0–100 scale with 32 segments (full) or 16 segments (half).
    const meterBar = (percent, color, segments = 32) => v_flex().w_full().gap(3)
      .child(h_flex().w_full().gap(2).children(Array.from({length: segments}, (_, i) =>
        div().flex_1().h(7).rounded(1).bg(percent != null && i < Math.round(clamp(percent) * segments / 100) ? color : c.track))))
      .child(h_flex().w_full().justify_between().children(Array.from({length: segments === 16 ? 9 : 17}, (_, i) =>
        div().w(1).h(i % 4 === 0 ? 5 : 2).bg(i % 4 === 0 ? c.muted : c.line))))
      .child(h_flex().w_full().justify_between()
        .children((segments === 16 ? ['0', '50', '100'] : ['0', '25', '50', '75', '100']).map(n => text(n, 7, c.dim))));
    const metric = (name, value, suffix, color, percent, half = false) => v_flex().when(half, el => el.flex_1().min_w(0), el => el.w_full()).gap(4)
      .child(h_flex().w_full().items_center().justify_between()
        .child(label(name, c.muted))
        .child(h_flex().items_baseline().gap(3)
          .child(text(value == null ? '—' : Math.round(value), half ? 15 : 18, value == null ? c.dim : color).font_semibold())
          .child(text(value == null ? 'NO DATA' : '% ' + suffix.toUpperCase(), 7, c.dim))))
      .child(meterBar(percent, color, half ? 16 : 32));
    const creditMetric = (credits) => v_flex().w_full().gap(5)
      .child(h_flex().w_full().items_center().justify_between()
        .child(label('CREDITS',c.muted))
        .child(h_flex().items_baseline().gap(4)
          .child(text(Number(credits).toFixed(2),18,c.accent).font_semibold())
          .child(text('USED',8,c.dim))));
    const chip = (id, open, framed=true) => h_flex().id(id).min_w(0).items_center().gap(5).py(4)
      .when(framed, el => el.px(7).rounded(5).border(1).border_color(c.line).bg(open ? c.selected : c.inset));
    const icon = programIcon(lead?.program, 12, c.muted);
    const sync = this.git?.ahead || this.git?.behind ? `↑${this.git.ahead} ↓${this.git.behind}` : '';
    const options = this.picker?.kind === 'model'
      ? (codex?.models ?? []).map(m=>({value:m.id,label:m.name,selected:m.id===codex?.model}))
      : (codex?.models?.find(m=>m.id===codex?.model)?.efforts ?? []).map(e=>({value:e,label:e,selected:e===codex?.effort}));

    const hasContext = context?.percent != null;
    const hasWeekly = weekly != null;
    const has5h = fiveHour != null;
    const hasUsageData = hasContext || hasWeekly || has5h || credits != null || weeklyReset != null;

    return v_flex().id('zero-herdr-root').size_full().bg(c.bg).border(1).border_color(c.line)
      .rounded(6).p(12).gap(12).font_family('Geist Mono').overflow_hidden()
      .child(h_flex().w_full().items_center().justify_between()
        .child(h_flex().min_w(0).gap(7).items_center()
          .child(icon ?? dot(stateColor, working))
          .child(text(programName,10,c.text).font_medium().truncate()))
        .child(div().id('status-close').size(20).flex_none().flex().items_center().justify_center().rounded(5)
          .cursor_pointer().text_color(c.dim).hover(s=>s.bg(c.hover).text_color(c.text)).tooltip('Hide status panel')
          .on_click(()=>run('layout.hide',{id:'zero-herdr'}))
          .child(svg('mods/workspace-chrome/panel-right.svg').size(12))))
      .child(h_flex().id('session-signal-banner').w_full().h(36).flex_none()
        .px(10).rounded(6).bg(c.inset).border(1).border_color(c.line)
        .items_center().justify_between().gap(10)
        .child(h_flex().min_w(0).items_center().gap(8)
          .child(dot(stateColor, working, 6))
          .child(h_flex().min_w(0).items_baseline().gap(7)
            .child(text(stateLabel,10,known && lead.status !== 'idle' ? stateColor : c.text).font_medium())
            .when(working && elapsed, el => el.child(text(elapsed,8,c.dim).truncate()))))
        .child(h_flex().h(16).flex_none().items_end().gap(2)
          .tooltip('会话活动指示')
          .children([7,12,16,10,14,8,11].map((height,i)=>
            div().id('signal-bar-'+i).w(2).h(working ? height : 2+(i%2)*2).rounded_full()
              .bg(working ? c.working : c.dim)
              .when(working,el=>el.loop('height',{from:3+(i%3),to:height,period:880+i*137})
                .loop('opacity',{from:0.4,to:1,period:1150+i*93}))))))
      .child(section('Session')
        .child(div().w_full().text_size(13).font_semibold().truncate().text_color(c.text).child(title))
        .child(text(folder(cwd,home()) || '—',9,c.muted).w_full().truncate().tooltip(cwd ?? ''))
        .when(Boolean(model || effort), el => el.child(h_flex().w_full().pt(4).items_center().gap(6)
          .when(Boolean(model), el => el.child(chip('codex-model-picker', pickerOpen('model'), isCodex)
            .when(isCodex, el => el.cursor_pointer().hover(s=>s.bg(c.hover))
              .tooltip('选择当前会话的模型').on_click((_e,cx)=>this.togglePicker('model',lead.address,cx)))
            .child(text(model,10,c.text).truncate())
            .when(isCodex, el=>el.child(text('⌄',10,c.dim)))))
          .when(Boolean(effort),el=>el.child(chip(isCodex ? 'codex-effort-picker' : 'session-effort', isCodex && pickerOpen('effort')).flex_none()
            .when(isCodex, el => el.cursor_pointer().hover(s=>s.bg(c.hover)).tooltip('选择推理强度').on_click((_e,cx)=>this.togglePicker('effort',lead.address,cx)))
            .child(text(effort,10,c.text))
            .when(isCodex, el=>el.child(text('⌄',10,c.dim)))))))
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
      .when(hasUsageData || Boolean(codex?.error ?? agy?.error) || isKimi, el => el.child(section('Usage')
        .child(v_flex().w_full().gap(10)
          .when(hasContext, el => el.child(metric('CONTEXT', context.percent, 'used', (context.percent >= 80 ? c.warn : c.accent), context.percent, false)))
          .when(hasWeekly && has5h, el => el.child(h_flex().w_full().gap(8)
            .child(metric('5-HOUR', fiveHour, 'left', (fiveHour <= 20 ? c.warn : c.accent), fiveHour, true))
            .child(metric('WEEKLY', weekly, 'left', (weekly <= 20 ? c.warn : c.accent), weekly, true))))
          .when(hasWeekly && !has5h, el => el.child(metric('WEEKLY', weekly, 'left', (weekly <= 20 ? c.warn : c.accent), weekly, false)))
          .when(!hasWeekly && has5h, el => el.child(metric('5-HOUR', fiveHour, 'left', (fiveHour <= 20 ? c.warn : c.accent), fiveHour, false)))
          .when(credits != null, el => el.child(creditMetric(credits)))
          .when(weeklyReset != null, el => el.child(row('Weekly reset', new Date(weeklyReset * 1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}))))
          .when(Boolean(codex?.error ?? agy?.error), el => el.child(text((codex?.error ?? agy?.error),8,c.dim))))))
      .when(Boolean(branch || space?.machine || this.git), el => el.child(section('Workspace')
        .child(h_flex().w_full().items_center().justify_between().gap(10)
          .child(text([space?.machine, branch ? `⑂ ${branch}` : null].filter(Boolean).join(' · '),10,c.muted).min_w(0).truncate())
          .child(text((this.git ? (this.git.changed ? `${this.git.changed} changed` : 'Clean') : '') + (sync ? `  ${sync}` : ''),9,this.git?.changed ? c.warn : c.dim).flex_none()))))
      .when(list.length > 1, el => el.child(section('Agents', text(String(list.length),9,c.dim))
        .child(v_flex().id('status-agent-list').w_full().gap(1).max_h(90).overflow_y_scrollbar()
          .children(list.map(agent=>h_flex().id(`status-agent-${agent.address}`).w_full().items_center().gap(8)
            .px(7).py(5).rounded(5).when(agent.focused, el=>el.bg(c.selected)).cursor_pointer()
            .hover(s=>s.bg(c.hover)).on_click(()=>run('pane.focus',{pane:agent.pane}))
            .child(dot(toneOf(agent.status),agent.status==='working'))
            .child(text(agent.program?.name ?? 'Agent',10,agent.focused ? c.text : c.muted).flex_1().min_w(0).truncate())
            .child(text(statusInfo(agent.status).label.toLowerCase(),9,c.dim).flex_none()))))))
      .child(div().flex_1());
  }
}
