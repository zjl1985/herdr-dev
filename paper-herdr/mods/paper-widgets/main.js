import { View, div, svg } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { agents, appHome, exec, hc, home, notify, panes, props, run, setShared, shared, spaces, theme } from 'herdr';
import { currentSession, formatReset, kindLabel, kindOf, lead, parseGitStatus, parseKimiUsage, sessionBase, sessionKey, short } from './data.js';

const UI = 'Host Grotesk';
const ICON = (name) => 'mods/paper-shell/icons/' + name + '.svg';
const tx = (s, n, c) => div().text_size(n).text_color(c).font_family(UI).line_height(1.25).child(String(s ?? ''));
const quiet = (s, n, c) => div().text_size(n).text_color(c).font_family(UI).line_height(1.25).child(String(s ?? ''));
const label = (s, c, n = 14) => div().text_size(n).text_color(c).font_family(UI).font_weight(500).line_height(1.2).child(String(s ?? ''));
const numeral = (s, n, c) => div().text_size(n).text_color(c).font_family(UI).font_weight(500).line_height(1).child(String(s));
const pad2 = (n) => String(n).padStart(2, '0');
const statusTone = (t, status) => status === 'working' ? t.working : status === 'blocked' ? t.blocked : status === 'done' ? t.done : t.idle;

/** Official widget title: a 6px accent bead, then the word in Host Grotesk 500. */
function head(t, word, meta, live = false) {
  return h_flex().w_full().h(20).flex_none().items_center().justify_between().gap(8)
    .child(h_flex().gap(8).items_center()
      .child(div().size(6).rounded(6).bg(t.accent)
        .when(live, (el) => el.loop('opacity', { from: 0.3, to: 1, period: 1600 })))
      .child(label(word, t.foreground)))
    .child(meta == null ? div() : quiet(meta, 11, t.muted).min_w(0).truncate());
}

/** Three-tone beads: off, ordinary lit, or accent for what matters now. */
function beads(t, total, filled, { size = 5.4, gap = 2.6, on, off, pulse = false, flex = false } = {}) {
  const lit = Math.max(0, Math.min(total, Math.round(filled)));
  const row = h_flex().gap(gap).items_center().when(flex, (el) => el.flex_1().min_w(0));
  return row.children(Array.from({ length: total }, (_, i) => {
    const active = i < lit;
    const tip = pulse && active && i === lit - 1;
    const n = tip ? size + 1 : size;
    return div().size(n).rounded(n).flex_none()
      .bg(active ? (on ?? t.accent) : (off ?? t.unknown))
      .when(tip, (el) => el.loop('opacity', { from: 0.35, to: 1, period: 1400 }));
  }));
}

/**
 * Focus-timer ring: 60 dots, every fifth a little larger when unlit,
 * orange once that share of the window has been used.
 */
function tickRing(t, box, used, pulse) {
  const count = 60;
  const r = box / 2 - 6;
  const c = box / 2;
  const lit = used == null ? 0 : Math.max(used > 0 ? 1 : 0, Math.min(count, Math.round((used / 100) * count)));
  return div().size(box).relative().flex_none().children(Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    const major = i % 5 === 0;
    const active = i < lit;
    const tip = pulse && active && i === lit - 1;
    const n = active ? (tip ? 6.4 : 5.6) : major ? 4.4 : 3.2;
    const color = active ? t.accent : major ? t.idle : t.unknown;
    return div().absolute().left(c + r * Math.cos(a) - n / 2).top(c + r * Math.sin(a) - n / 2)
      .size(n).rounded(n).bg(color)
      .when(tip, (el) => el.loop('opacity', { from: 0.35, to: 1, period: 1400 }));
  }));
}

/** A day's column of 9 dots, filled from the bottom. */
function dotColumn(t, filled, on) {
  const height = 9;
  const n = Math.max(0, Math.min(height, Math.round(filled)));
  return v_flex().gap(2).items_center().flex_none().justify_end()
    .children(Array.from({ length: height }, (_, i) => {
      const active = i >= height - n;
      return div().size(6).rounded(6).flex_none().bg(active ? on : t.unknown);
    }));
}

/** Equaliser as columns of orange dots, height looping natively. */
function equaliser(t, live) {
  const periods = [520, 740, 610, 880, 670];
  const dots = 4;
  return h_flex().h(16).gap(3).items_end().flex_none()
    .children(periods.map((period, i) =>
      div().w(4).h(live ? 6 + (i % 3) * 3 : 4).overflow_hidden().flex_none()
        .when(live, (el) => el.loop('height', { from: 4, to: 16, period }))
        .child(v_flex().gap(1).items_center().justify_end().h(16)
          .children(Array.from({ length: dots }, () =>
            div().size(4).rounded(4).flex_none().bg(live ? t.accent : t.unknown))))));
}

/** Battery-style row: ink well, name, percent, a track of 18 dots. */
function batteryRow(t, { well, name, left, reset, charging, zebra = false, width = 184 }) {
  const dots = Math.max(12, Math.min(18, Math.floor((width - 28 - 8) / 8)));
  const tip = left == null
    ? `${name} has no reading yet`
    : `${Math.round(left)}% left` + (reset ? ` · resets ${reset}` : '');
  const tone = left == null ? t.dim : left <= 20 ? t.blocked : charging ? t.accent : t.foreground;
  const on = left == null ? t.unknown : left <= 20 ? t.blocked : charging ? t.accent : t.idle;
  const filled = left == null ? 0 : (left / 100) * dots;
  const row = h_flex().w_full().gap(8).items_start().tooltip(tip)
    .when(zebra, (el) => el.px(8).py(8).mx(-8).bg(t.hover).rounded(14));
  return row
    .child(h_flex().size(28).flex_none().rounded(10).items_center().justify_center()
      .bg(charging ? t.accent : '#111111')
      .child(tx(well, 11, '#ffffff').font_weight(500)))
    .child(v_flex().flex_1().min_w(0).gap(5)
      .child(h_flex().w_full().items_baseline().justify_between().gap(6)
        .child(tx(name, 14, t.foreground).font_weight(500))
        .child(h_flex().items_end().gap(3).flex_none()
          .child(numeral(left == null ? '—' : Math.round(left), 14, tone))
          .when(left != null, (el) => el.child(quiet('%', 11, t.muted).pb(0.5)))
          .when(charging, (el) => el.child(svg(ICON('bolt')).size(13).flex_none().text_color(t.accent)
            .loop('opacity', { from: 0.2, to: 1, period: 1570 })))))
      .child(beads(t, dots, filled, { size: 6, gap: 2.5, on, off: t.unknown, pulse: charging && left != null, flex: true })));
}

export default class PaperWidgets extends View {
  init(_p, cx) {
    this.kind = props()?.kind ?? 'agents';
    this.height = 300;
    this.width = 212;
    if (this.kind === 'context') {
      this.session = null; this.sessionKey = null; this.sessionBase = null; this.loading = false;
      this.picker = null; this.switching = false;
      cx.spawn((cx) => this.refreshSession(cx));
      cx.timer.every(3000, (cx) => cx.spawn((cx) => this.refreshSession(cx)));
    }
    if (this.kind === 'usage') {
      this.limits = shared('paper.kimi.limits') ?? null;
      this.limitsLoading = false;
      cx.spawn((cx) => this.refreshLimits(cx));
      cx.timer.every(60000, (cx) => cx.spawn((cx) => this.refreshLimits(cx)));
    }
    if (this.kind === 'git') {
      this.git = null; this.gitKey = null; this.gitCwd = null;
      cx.spawn((cx) => this.refreshGit(cx));
      cx.timer.every(4000, (cx) => cx.spawn((cx) => this.refreshGit(cx)));
    }
  }

  publishSession(kind, key, base, data, cx) {
    const same = kind === (this.session && this._pubKind) && key === this.sessionKey && JSON.stringify(data) === JSON.stringify(this.session);
    this.session = data;
    this._pubKind = kind;
    if (!same) {
      setShared('paper.session', { kind, key, base, data, at: Date.now() });
      cx.notify();
    }
  }

  async refreshSession(cx) {
    const l = lead();
    const kind = kindOf(l.agent);
    const key = sessionKey(kind, l);
    const base = sessionBase(kind, l);
    if (base !== this.sessionBase) { this.sessionBase = base; this.session = null; cx.notify(); }
    if (key !== this.sessionKey) this.sessionKey = key;
    if (!kind || !key) {
      this.publishSession(null, null, null, null, cx);
      return;
    }
    if (this.loading) return;
    if (l.sp?.machine) {
      this.publishSession(kind, key, base, { error: `${kindLabel(kind)} data is read on local terminals only` }, cx);
      return;
    }
    this.loading = true;
    let next = null;
    try {
      if (kind === 'codex') {
        const r = await exec('node', [appHome() + '/mods/paper-widgets/codex-status.cjs', l.pane?.cwd ?? '', l.agent?.title ?? ''], { timeout: 5000 });
        next = JSON.parse(r.stdout);
      } else if (kind === 'kiro') {
        const r = await exec('node', [appHome() + '/mods/paper-widgets/kiro-status.cjs', l.pane?.cwd ?? '', l.agent?.title ?? '', JSON.stringify(this.session?.cache ?? null)], { timeout: 5000 });
        next = JSON.parse(r.stdout);
      } else if (kind === 'agy') {
        const r = await exec('node', [appHome() + '/mods/paper-widgets/agy-status.cjs', l.pane?.cwd ?? '', l.agent?.title ?? ''], { timeout: 5000 });
        next = JSON.parse(r.stdout);
      } else if (kind === 'kimi') {
        const r = await hc(['read', l.agent.address, '--lines', '45']);
        const usage = parseKimiUsage(r.stdout ?? '');
        next = usage ? { context: usage } : (this.session?.context ? this.session : { error: 'Waiting for Kimi context in the terminal' });
      }
    } catch {
      next = { error: `${kindLabel(kind)} session data unavailable` };
    } finally { this.loading = false; }
    if (key === this.sessionKey) this.publishSession(kind, key, base, next, cx);
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
      const prompt = screen.split('\n').filter((line) => /^\s*›/.test(line)).pop()?.trim();
      if (prompt !== '› Ask Codex to do anything') {
        throw new Error('请先收起 CLI 弹窗并处理输入框中的草稿，再选择模型或推理强度。');
      }
      const command = selection.model ? '/model ' + selection.model : '/model --reasoning=' + selection.effort;
      run('pane.focus', { pane: agent.pane });
      const result = await hc(['keys', agent.address, ...Array.from(command, (ch) => ch === ' ' ? 'space' : ch), 'enter']);
      if (result.code !== 0) throw new Error('Codex did not accept the switch command.');
      this.picker = null;
      notify({ title: '已发送切换请求', body: 'Codex 确认后，右侧会更新。', timeout: 2500 });
    } catch (error) {
      notify({ title: '暂时无法切换', body: String(error.message ?? error), level: 'warning' });
    } finally { this.switching = false; cx.notify(); }
  }

  async refreshLimits(cx) {
    const l = lead();
    if (kindOf(l.agent) !== 'kimi' || l.sp?.machine || this.limitsLoading) return;
    this.limitsLoading = true;
    try {
      const r = await exec('node', [appHome() + '/mods/paper-widgets/kimi-status.cjs'], { timeout: 10000 });
      const limits = JSON.parse(r.stdout);
      if (!limits.error) {
        this.limits = { ...limits, readAt: Date.now() };
        setShared('paper.kimi.limits', this.limits);
      }
    } catch {} finally {
      this.limitsLoading = false;
      cx.notify();
    }
  }

  async refreshGit(cx) {
    const { sp, pane } = lead();
    const cwd = pane?.cwd ?? sp?.folder ?? null;
    const key = `${sp?.machine ?? ''}:${cwd ?? ''}`;
    if (key !== this.gitKey) { this.gitKey = key; this.gitCwd = cwd; this.git = null; cx.notify(); }
    if (!cwd) return;
    let next = null;
    try {
      const r = await exec('git', ['--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { cwd, on: sp?.machine, timeout: 4000 });
      next = r.code === 0 ? parseGitStatus(r.stdout) : { none: true };
    } catch { next = { none: true }; }
    if (key === this.gitKey && JSON.stringify(next) !== JSON.stringify(this.git)) { this.git = next; cx.notify(); }
  }

  render() {
    const t = theme();
    const root = v_flex().id('paper-w-' + this.kind).size_full().min_h(0).overflow_hidden().px(16).pt(16).pb(14).gap(10).font_family(UI)
      .on_size_change((size, cx) => {
        const h = Math.abs(this.height - size.height) > 1;
        const w = Math.abs((this.width ?? 0) - size.width) > 1;
        if (h) this.height = size.height;
        if (w) this.width = size.width;
        if (h || w) cx.notify();
      });
    if (this.kind === 'agents') return this.agents(t, root);
    if (this.kind === 'context') return this.context(t, root);
    if (this.kind === 'usage') return this.usage(t, root);
    return this.gitTile(t, root);
  }

  agents(t, root) {
    const all = spaces();
    const sp = all.find((s) => s.active) ?? all[0];
    const everyone = agents();
    const here = everyone.filter((a) => a.space === sp?.id);
    const count = (s) => here.filter((a) => a.status === s).length;
    const working = count('working');
    const blocked = count('blocked');
    const done = count('done');
    const idle = count('idle');
    const spacePanes = panes().filter((p) => (sp?.tabs ?? []).some((tb) => tb.id === p.tab) && p.terminal);
    const terms = spacePanes.length;
    const empty = here.length === 0;
    const colsH = empty ? 0 : 96;
    const overhead = 130; // padding, title, count, gaps
    const room = empty ? 0 : Math.max(0, Math.floor((this.height - overhead - colsH) / 32));
    const termRoom = empty ? 0 : Math.max(0, Math.min(terms, Math.floor((this.height - overhead - colsH - room * 32 - 26) / 28)));
    const cols = [
      { label: 'Work', n: working, on: t.accent },
      { label: 'Wait', n: blocked, on: t.blocked },
      { label: 'Done', n: done, on: t.foreground },
      { label: 'Idle', n: idle, on: t.idle },
    ];
    const peak = Math.max(1, ...cols.map((c) => c.n));
    return root
      .child(head(t, 'Agents', sp?.name ?? '—', working > 0))
      .child(h_flex().items_end().gap(10)
        .child(numeral(pad2(here.length), 36, here.length ? t.foreground : t.dim))
        .child(v_flex().pb(3).gap(1)
          .child(tx(here.length === 1 ? 'agent here' : 'agents here', 13, t.foreground).font_weight(500))
          .child(quiet(`${everyone.length} total · ${terms} term`, 11, t.muted))))
      .when(!empty, (el) => el.child(h_flex().w_full().justify_between().items_end()
        .children(cols.map((c) => v_flex().gap(4).items_center().w(36)
          .child(dotColumn(t, c.n ? Math.max(1, Math.round((c.n / peak) * 9)) : 0, c.on))
          .child(quiet(c.label, 11, c.label === 'Work' && working ? t.foreground : t.muted).font_weight(c.label === 'Work' && working ? 500 : 400))))))
      .when(empty, (el) => el.child(v_flex().flex_1().min_h(0).items_center().justify_center().gap(8)
        .child(beads(t, 8, 0, { size: 6, gap: 5 }))
        .child(tx('Nothing running here', 13, t.muted).font_weight(500))
        .child(quiet('Agents appear as they start', 11, t.dim))))
      .when(!empty, (el) => el
        .child(v_flex().gap(4).children(here.slice(0, room).map((a) =>
          h_flex().id('paper-w-agent-' + a.address).h(30).px(6).mx(-6).gap(8).items_center().rounded(10)
            .bg(a.focused ? t.raised : '#00000000')
            .cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click(() => run('agent.focus', { terminal: a.address }))
            .child(div().size(8).rounded(8).flex_none().bg(a.focused || a.status === 'working' ? t.accent : statusTone(t, a.status))
              .when(a.status === 'working', (el) => el.loop('opacity', { from: 0.35, to: 1, period: 1600 })))
            .child(v_flex().flex_1().min_w(0)
              .child(tx(a.program?.name ?? 'Agent', 14.5, t.foreground).font_weight(500).truncate())
              .child(quiet(a.status, 12, t.muted)))
            .when(a.status === 'working', (row) => row.child(equaliser(t, true))))))
        .when(here.length > room && room > 0, (el) => el.child(quiet(`+${here.length - room} more`, 11, t.dim)))
        .child(div().flex_1().min_h(0))
        .when(termRoom > 0, (el) => el.child(v_flex().gap(4).flex_none()
          .child(h_flex().justify_between().child(quiet('Terminals', 11, t.muted)).child(quiet(pad2(terms), 11, t.muted)))
          .children(spacePanes.slice(0, termRoom).map((p) => h_flex().id('paper-w-term-' + p.pane).h(24).gap(8).items_center()
            .cursor_pointer().on_click(() => run('pane.focus', { pane: p.pane }))
            .child(div().size(6).rounded(6).flex_none().bg(p.focused ? t.accent : t.unknown))
            .child(tx(p.program?.name ?? 'Terminal', 13, p.focused ? t.foreground : t.muted).flex_none())
            .child(quiet(short(p.cwd, home()).split('/').pop() || '~', 11, t.muted).flex_1().min_w(0).truncate()))))));
  }

  context(t, root) {
    const { l, kind, key, data } = currentSession();
    const mine = key && key === this.sessionKey ? (this.session ?? data) : data;
    const pct = mine?.context?.percent ?? null;
    const working = l.agent?.status === 'working';
    const rawModel = (mine?.model ?? '').replace(/^gpt/i, 'GPT').replace(/astra/i, 'Astra') || null;
    const programName = l.agent?.program?.name ?? kindLabel(kind);
    const model = rawModel && rawModel.toLowerCase() !== (programName ?? '').toLowerCase() ? rawModel : rawModel;
    const effort = mine?.effort ?? null;
    const isCodex = kind === 'codex';
    const pickerOpen = (which) => this.picker?.kind === which && this.picker?.address === l.agent?.address;
    const box = 100;
    const ring = tickRing(t, box, pct, working && pct != null);
    const center = div().absolute().inset_0().size_full().flex().items_center().justify_center()
      .child(v_flex().items_center().gap(1)
        .child(h_flex().items_end()
          .child(numeral(pct == null ? '—' : Math.round(pct), 28, pct == null ? t.dim : t.foreground))
          .when(pct != null, (el) => el.child(quiet('%', 13, t.muted).pb(2))))
        .when(pct != null, (el) => el.child(quiet('used', 11, t.muted))));
    const used = mine?.context?.used;
    const total = mine?.context?.total;
    const usedLabel = used == null ? '' : typeof used === 'number' ? `${Math.round(used / 1000)}k / ${Math.round((total ?? 0) / 1000)}k` : `${used} / ${total ?? ''}`;
    const options = this.picker?.kind === 'model'
      ? (mine?.models ?? []).map((m) => ({ value: m.id, label: m.name, selected: m.id === mine?.model }))
      : (mine?.models?.find((m) => m.id === mine?.model)?.efforts ?? []).map((e) => ({ value: e, label: e, selected: e === mine?.effort }));
    const chip = (id, word, open, clickable, tip) => h_flex().id(id).h(22).px(9).gap(5).items_center().rounded(99).flex_none()
      .bg(open ? t.selected : t.raised)
      .when(clickable, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip)
        .on_click((_e, cx) => this.togglePicker(id.includes('model') ? 'model' : 'effort', l.agent.address, cx)))
      .child(quiet(word, 12, t.foreground).max_w(96).truncate())
      .when(clickable, (el) => el.child(quiet(open ? '⌃' : '⌄', 11, t.muted)));
    const emptyHint = kind
      ? (mine?.error ? mine.error : key ? 'Matching the terminal' : 'Reading…')
      : 'Focus a local Codex, Kiro, Antigravity or Kimi terminal';
    const picking = Boolean(this.picker?.address === l.agent?.address && this.picker);
    return root
      .child(head(t, 'Context', model ?? kindLabel(kind) ?? '—', working && pct != null))
      .when(picking, (el) => el.child(v_flex().flex_1().min_h(0).gap(6)
        .child(h_flex().justify_between().items_center()
          .child(quiet(this.picker.kind === 'model' ? 'Model' : 'Reasoning', 11, t.muted))
          .child(h_flex().id('paper-context-picker-close').h(20).px(8).items_center().rounded(99)
            .cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { this.picker = null; cx.notify(); })
            .child(quiet('Close', 12, t.muted))))
        .child(v_flex().id('paper-codex-options').flex_1().min_h(0).overflow_y_scrollbar().gap(1)
          .children(options.map((option) => h_flex().id('paper-codex-option-' + option.value).h(28).px(8).items_center().justify_between().rounded(10)
            .bg(option.selected ? t.selected : '#00000000')
            .cursor_pointer().hover((s) => s.bg(t.hover))
            .tooltip(this.switching ? '正在发送…' : option.label)
            .on_click((_e, cx) => {
              if (this.switching) return;
              const selection = this.picker.kind === 'model' ? { model: option.value } : { effort: option.value };
              cx.spawn((cx) => this.selectCodexOption(l.agent, selection, cx));
            })
            .child(tx(option.label, 13, option.selected ? t.foreground : t.muted).font_weight(option.selected ? 500 : 400))
            .child(div().size(8).rounded(8).bg(option.selected ? t.accent : t.unknown))))
          .when(!mine?.models?.length, (el) => el.child(quiet('模型目录尚未就绪', 11, t.dim).px(6).py(4))))))
      .when(!picking, (el) => el
        .child(h_flex().gap(10).items_center().flex_1().min_h(0)
          .child(div().relative().size(box).flex_none().tooltip(pct == null ? emptyHint : `Context ${Math.round(pct)}% used`)
            .child(ring).child(center))
          .child(v_flex().flex_1().min_w(0).gap(3)
            .when(pct != null, (el) => el
              .child(tx('of the window', 13, t.foreground).font_weight(500))
              .child(quiet(usedLabel, 12, t.muted))
              .when(Boolean(effort) && !isCodex, (el) => el.child(quiet(`effort · ${effort}`, 11, t.dim))))
            .when(pct == null, (el) => el
              .child(tx(key ? 'Reading…' : 'No session', 13, t.muted).font_weight(500))
              .child(quiet(emptyHint, 11, t.dim)))))
        .when(Boolean(model || effort), (el) => el.child(h_flex().gap(6).items_center().flex_wrap()
          .when(Boolean(model), (el) => el.child(chip('paper-codex-model', model, pickerOpen('model'), isCodex, 'Choose the model for this session')))
          .when(Boolean(effort), (el) => el.child(chip('paper-codex-effort', effort, pickerOpen('effort'), isCodex, 'Choose reasoning effort'))))));
  }

  usage(t, root) {
    const { l, kind, data } = currentSession();
    const limits = kind === 'kimi' ? (this.limits ?? shared('paper.kimi.limits')) : null;
    const weekly = data?.weekly?.left ?? limits?.weekly?.left ?? null;
    const fiveHour = data?.fiveHour?.left ?? limits?.fiveHour?.left ?? null;
    const weeklyReset = formatReset(data?.weekly?.resetsAt ?? limits?.weekly?.resetsAt);
    const fiveReset = formatReset(data?.fiveHour?.resetsAt ?? limits?.fiveHour?.resetsAt);
    const credits = kind === 'kiro' ? (data?.credits ?? null) : null;
    const hasWeekly = weekly != null;
    const has5h = fiveHour != null;
    const has = hasWeekly || has5h || credits != null;
    const width = Math.max(140, (this.width ?? 212) - 32);
    return root.gap(8)
      .child(head(t, 'Usage', weeklyReset ? `reset ${weeklyReset}` : kindLabel(kind) ?? '—'))
      .when(!has, (el) => el.child(v_flex().flex_1().justify_center().gap(6)
        .child(batteryRow(t, { well: '5', name: '5-Hour', left: null, reset: null, charging: false, width }))
        .child(batteryRow(t, { well: 'W', name: 'Weekly', left: null, reset: null, charging: false, zebra: true, width }))
        .child(quiet(kind ? (data?.error ?? 'No quota for this session') : 'No quota yet', 11, t.dim))))
      .when(has5h, (el) => el.child(batteryRow(t, { well: '5', name: '5-Hour', left: fiveHour, reset: fiveReset, charging: true, width })))
      .when(hasWeekly, (el) => el.child(batteryRow(t, { well: 'W', name: 'Weekly', left: weekly, reset: weeklyReset, charging: !has5h, zebra: true, width })))
      .when(credits != null, (el) => el.child(h_flex().w_full().h(22).items_end().justify_between()
        .tooltip(`${Number(credits).toFixed(2)} credits used`)
        .child(h_flex().items_end()
          .child(numeral(Number(credits).toFixed(2), 22, t.foreground))
          .child(quiet('cr', 11, t.muted).pb(1).pl(3)))
        .child(quiet('Credits used', 11, t.muted))));
  }

  gitTile(t, root) {
    const g = this.git;
    const repo = g && !g.none;
    const { sp } = lead();
    const meta = repo && (g.ahead || g.behind) ? `↑${g.ahead} ↓${g.behind}` : repo ? 'synced' : (sp?.machine ?? null);
    const width = Math.max(140, (this.width ?? 212) - 32);
    const dots = Math.max(12, Math.min(18, Math.floor(width / 9)));
    const dirty = repo ? Math.min(g.changed, dots) : 0;
    return root
      .child(head(t, 'Git', meta))
      .when(repo, (el) => el
        .child(h_flex().gap(8).items_end()
          .child(tx(g.branch ?? 'detached', 16, t.foreground).font_weight(500).min_w(0).truncate())
          .child(quiet(g.changed ? `${g.changed} changed` : 'clean', 13, g.changed ? t.accent : t.muted).flex_none().pb(1)))
        .child(h_flex().justify_between().items_center().gap(8)
          .child(beads(t, dots, dirty, { size: 6, gap: 2.5, on: g.changed ? t.accent : t.idle, pulse: g.changed > 0, flex: true }).tooltip(g.changed ? `${g.changed} changed files` : 'Working tree clean')))
        .child(quiet([sp?.machine, short(this.gitCwd, home()).split('/').pop() || '~'].filter(Boolean).join(' · '), 11, t.muted).truncate()))
      .when(!repo, (el) => el
        .child(tx(g ? 'Not a repository' : 'Reading…', 13, t.muted).font_weight(500))
        .child(beads(t, dots, 0, { size: 6, gap: 2.5 }))
        .child(quiet(short(this.gitCwd, home()) || 'No folder', 11, t.muted).truncate()));
  }
}
