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
      bg: t.surface, card: t.background, inset: t.canvas ?? t.background,
      border: t.border, text: t.foreground, muted: t.muted, dim: t.dim,
      green: t.accent, cyan: t.accent, amber: t.ansi3 ?? t.accent,
    };
    const space = spaces().find(s => s.active) ?? spaces()[0];
    const tab = space?.tabs?.find(t => t.active) ?? space?.tabs?.[0];
    const list = agents().filter(a => a.space === space?.id).sort((a,b) => Number(b.focused)-Number(a.focused));
    const lead = list.find(a => a.focused) ?? list.find(a => a.tab === tab?.id) ?? list[0];
    const pane = panes().find(p => p.pane === lead?.pane) ?? panes().find(p => p.tab === tab?.id && p.focused);
    const key = lead?.app === 'codex' ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, '')]) : null;
    const codex = key && key === this.codexKey ? this.codex : null;
    const isKimi = lead?.app === 'kimi-code';
    const context = codex?.context ?? (isKimi ? this.usage : null);
    const weekly = codex?.weekly?.left ?? (isKimi && this.limits?.weekly ? 100-this.limits.weekly.percent : null);
    const fiveHour = codex?.fiveHour?.left ?? (isKimi && this.limits?.fiveHour ? 100-this.limits.fiveHour.percent : null);
    const working = lead?.status === 'working';
    const state = statusInfo(lead?.status);
    const stateColor = lead?.status === 'blocked' ? c.amber : working || lead?.status === 'done' ? c.green : c.muted;
    const cwd = codex?.cwd ?? pane?.cwd ?? space?.folder;
    const title = codex?.title ?? taskTitle(lead, tab, space);
    const model = codex?.model?.replace(/^gpt/i, 'GPT').replace(/astra/i, 'Astra') ?? lead?.program?.name ?? 'No active session';
    const elapsed = tab?.working_since ? formatDuration(Date.now()-tab.working_since) : '—';
    const branch = this.git?.branch ?? pane?.branch;
    setAgentOrder(list.map(a => a.address));

    const text = (value, size=10, color=c.muted) => div().text_size(size).text_color(color).child(String(value));
    const dot = (color, pulse=false) => div().size(5).flex_none().rounded_full().bg(color)
      .when(pulse, el => el.loop('opacity', { from: 0.3, to: 1, period: 1600 }));
    const label = (value, color=c.dim) => text(value, 9, color).font_semibold();
    const badge = (value, color=c.green) => text(value, 8, color).px(5).py(2)
      .border_l(2).border_color(color).bg(c.inset);
    const card = () => v_flex().w_full().border_t(1).border_color(c.border).pt(7).pb(2).gap(6);
    const heading = (value, right=null) => h_flex().w_full().items_center().justify_between()
      .child(h_flex().gap(7).items_center()
        .child(div().w(3).h(11).bg(c.green)).child(label(value,c.text)))
      .when(Boolean(right), el => el.child(right));
    // Instrument ticks express a real 0–100 scale, including an explicit unknown state.
    const meter = (percent, color) => v_flex().w_full().gap(3)
      .child(h_flex().w_full().gap(2).children(Array.from({length:32}, (_,i) =>
        div().flex_1().h(7).bg(percent != null && i < Math.round(Math.max(0,Math.min(100,percent))*32/100) ? color : c.border))))
      .child(h_flex().w_full().justify_between().children(Array.from({length:17},(_,i)=>
        div().w(1).h(i%4===0 ? 5 : 2).bg(i%4===0 ? c.muted : c.border))));
    const metric = (name, value, suffix, color, percent) => v_flex().w_full().gap(5)
      .child(h_flex().w_full().items_center().justify_between()
        .child(label(name,c.muted))
        .child(h_flex().items_center().gap(4)
          .child(text(value == null ? '—' : value,18,value == null ? c.dim : color).font_semibold())
          .child(text(value == null ? 'NO SIGNAL' : '% '+suffix.toUpperCase(),8,c.dim))))
      .child(meter(percent,color))
      .child(h_flex().w_full().justify_between()
        .children(['0','25','50','75','100'].map(n=>text(n,7,c.dim))));
    const row = (name, value, color=c.muted) => h_flex().w_full().justify_between().gap(10)
      .child(text(name,10,c.dim)).child(text(value,10,color).min_w(0).truncate());

    return v_flex().id('claude-status-root').size_full().bg(c.bg).border(1).border_color(c.border)
      .rounded(4).p(10).gap(7).font_family('Geist Mono').overflow_hidden()
      .child(h_flex().w_full().items_center().justify_between()
        .child(h_flex().gap(7).items_center().child(dot(c.green,working)).child(text('HERDR  /  TELEMETRY',10,c.text).font_semibold()))
        .child(div().id('status-close').size(18).flex().items_center().justify_center().cursor_pointer()
          .text_color(c.dim).hover(s=>s.text_color(c.text)).tooltip('Hide status panel')
          .on_click(()=>run('layout.hide',{id:'agent-status'}))
          .child(svg('mods/workspace-chrome/panel-right.svg').size(12))))
      .child(h_flex().id('session-signal-banner').w_full().h(42).flex_none()
        .px(10).bg(c.inset).border_l(2).border_color(stateColor)
        .items_center().justify_between().gap(12)
        .child(h_flex().items_center().gap(9)
          .child(div().w(2).h(24).rounded(1).bg(stateColor)
            .when(working, el=>el.loop('opacity',{from:0.4,to:1,period:1900})))
          .child(v_flex().gap(4)
            .child(text(working ? 'IN PROGRESS' : lead?.status === 'blocked' ? 'NEEDS INPUT' : lead?.status === 'done' ? 'COMPLETE' : 'READY',10,stateColor).font_semibold())
            .child(text((lead?.program?.name ?? 'Herdr') + ' / ' + (working ? 'Session active' : 'Standing by'),8,c.dim))))
        .child(h_flex().h(28).flex_none().items_end().gap(4)
          .tooltip('会话活动指示')
          .children([8,14,22,16,26,20,12,18,9].map((height,i)=>
            div().id('signal-bar-'+i).w(3).h(working ? height : 4+(i%3)*2).rounded(1)
              .bg(i%3 === 0 ? c.dim : stateColor)
              .when(working,el=>el.loop('height',{from:4+(i%3)*2,to:height,period:880+i*137})
                .loop('opacity',{from:0.35,to:1,period:1150+i*93}))))))
      .child(card().gap(8)
        .child(h_flex().w_full().justify_between().items_center()
          .child(label(lead?.app === 'codex' ? '01 / CODEX SESSION' : '01 / ACTIVE SESSION',c.green))
          .child(badge(state.label.toUpperCase(),stateColor)))
        .child(div().w_full().text_size(14).font_semibold().truncate().text_color(c.text).child(title))
        .child(text(folder(cwd,home()),9,c.muted).w_full().truncate().tooltip(cwd ?? ''))
        .child(h_flex().w_full().pt(6).border_t(1).border_color(c.border).items_center().justify_between().gap(8)
          .child(h_flex().id('codex-model-picker').min_w(0).gap(6).items_center().px(3).py(4).rounded(4)
            .when(lead?.app === 'codex', el => el.cursor_pointer().hover(s=>s.bg(c.border))
              .tooltip('选择当前会话的模型').on_click((_e,cx)=>this.togglePicker('model',lead.address,cx)))
            .child(dot(c.cyan)).child(text(model,10,c.cyan).font_semibold().truncate())
            .when(lead?.app === 'codex', el=>el.child(text('⌄',10,c.dim))))
          .when(Boolean(codex?.effort),el=>el.child(badge(codex.effort+' ⌄',c.cyan)
            .id('codex-effort-picker').cursor_pointer().hover(s=>s.bg(c.border)).tooltip('选择推理强度')
            .on_click((_e,cx)=>this.togglePicker('effort',lead.address,cx)))))
        .when(this.picker?.address === lead?.address && Boolean(this.picker), el=>el.child(
          v_flex().id('codex-options').w_full().max_h(210).overflow_y_scrollbar().gap(3)
            .pt(8).border_t(1).border_color(c.border)
            .child(label(this.picker.kind === 'model' ? 'SELECT MODEL' : 'REASONING EFFORT'))
            .children((this.picker.kind === 'model'
              ? (codex?.models ?? []).map(m=>({value:m.id,label:m.name,selected:m.id===codex?.model}))
              : (codex?.models?.find(m=>m.id===codex?.model)?.efforts ?? []).map(e=>({value:e,label:e,selected:e===codex?.effort})))
              .map(option=>h_flex().id('codex-option-'+option.value).w_full().px(8).py(7).rounded(4)
                .bg(option.selected ? c.border : c.inset).items_center().justify_between().cursor_pointer()
                .hover(s=>s.bg(c.border)).tooltip(this.switching ? '正在发送…' : option.label)
                .on_click((_e,cx)=>{ if (!this.switching) { const selection = this.picker.kind==='model' ? {model:option.value} : {effort:option.value}; cx.spawn(cx=>this.selectCodexOption(lead,selection,cx)); } })
                .child(text(option.label,10,option.selected?c.cyan:c.text))
                .child(text(option.selected?'✓':'',10,c.cyan))))
            .when(!codex?.models?.length, el=>el.child(text('模型目录尚未就绪',10,c.dim)))
        )))
      .child(card()
        .child(heading('02 / CAPACITY',label(context || weekly !== null ? 'TELEMETRY' : 'AWAITING DATA',c.dim)))
        .child(v_flex().w_full().gap(7)
          .child(metric('CONTEXT',context?.percent ?? null,'used',c.cyan,context?.percent ?? null))
          .child(metric('WEEKLY',weekly,'left',c.green,weekly)))
        .when(fiveHour !== null, el=>el.child(row('5-hour remaining',`${fiveHour}%`,c.green)))
        .when(Boolean(codex?.weekly?.resetsAt), el=>el.child(row('Weekly reset',new Date(codex.weekly.resetsAt*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}))))
        .when(Boolean(codex?.error),el=>el.child(text(codex.error,8,c.muted)))
        .when(isKimi,el=>el.child(text(this.limitsLoading ? 'Refreshing…' : '↻ Refresh limits',9,c.green)
          .id('refresh-kimi-limits').cursor_pointer().on_click((_e,cx)=>this.refreshLimits(cx)))))
      .child(card()
        .child(heading('03 / RUNTIME',label(working ? 'ACTIVE' : 'STANDBY',stateColor)))
        .child(h_flex().w_full().gap(7)
          .child(v_flex().flex_1().gap(5).child(label('TURN')).child(text(elapsed,18,c.cyan)))
          .child(v_flex().flex_1().border_l(1).border_color(c.border).pl(12).gap(5).child(label('AGENTS')).child(text(String(list.length).padStart(2,'0'),18,c.green))))
        .child(h_flex().w_full().pt(9).border_t(1).border_color(c.border).justify_between().gap(8)
          .child(text(branch ? `⑂ ${branch}` : 'Git',10,c.muted).min_w(0).truncate())
          .child(text(this.git ? (this.git.changed ? `${this.git.changed} changed` : 'Clean') : branch ? '' : 'No repository',9,this.git?.changed ? c.amber : c.dim)))
        .when(Boolean(this.git?.ahead || this.git?.behind),el=>el.child(row('Sync',`↑ ${this.git.ahead}  ↓ ${this.git.behind}`))))
      .child(v_flex().w_full().gap(7)
        .child(h_flex().w_full().justify_between().child(label('04 / CONNECTED',c.muted)).child(label(String(list.length).padStart(2,'0'))))
        .max_h(90).overflow_y_scrollbar().children(list.map(agent=>h_flex().id(`status-agent-${agent.address}`).w_full().items_center().gap(8)
          .px(8).py(8).bg(c.inset).border_l(2).border_color(agent.focused ? c.green : c.border).cursor_pointer()
          .hover(s=>s.bg(c.border)).on_click(()=>run('pane.focus',{pane:agent.pane}))
          .child(dot(agent.status==='working' ? c.green : agent.status==='blocked' ? c.amber : c.dim,agent.status==='working'))
          .child(text(agent.program?.name ?? 'Agent',10,c.text).flex_1())
          .child(text(statusInfo(agent.status).label.toLowerCase(),9,c.muted)))))
      .child(div().flex_1())
      .child(h_flex().w_full().items_center().justify_between().pt(8).border_t(1).border_color(c.border)
        .child(h_flex().gap(5).items_center().child(dot(c.green)).child(label(space?.machine ? 'REMOTE / LINK' : 'LOCAL / LINK',c.green)))
        .child(text('SYS / '+String(list.length).padStart(2,'0'),8,c.dim)));
  }
}
