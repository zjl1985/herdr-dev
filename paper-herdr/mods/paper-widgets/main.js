import { View, div } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { agents, appHome, exec, home, panes, props, spaces, theme, run } from 'herdr';
import { lead, codexKey, parseGitStatus, short } from './data.js';

const UI = 'Geist';
const MONO = 'Geist Mono';
const tx = (s, n, c) => div().text_size(n).text_color(c).font_family(UI).line_height(1.25).child(String(s ?? ''));
const mono = (s, n, c) => div().text_size(n).text_color(c).font_family(MONO).line_height(1.25).child(String(s ?? ''));
const cap = (s, c, n = 9) => div().text_size(n).text_color(c).font_family(MONO).font_weight(500).line_height(1.2).child(String(s ?? '').toUpperCase());
/** Thin Geist numerals: the hero voice of every tile. */
const numeral = (s, n, c) => div().text_size(n).text_color(c).font_family(UI).font_weight(200).line_height(1).child(String(s));
const pad2 = (n) => String(n).padStart(2, '0');

function head(t, label, meta, live = false) {
  return h_flex().w_full().h(16).flex_none().items_center().justify_between().gap(8)
    .child(h_flex().gap(6).items_center()
      .child(div().size(5).rounded(5).bg(t.accent)
        .when(live, (el) => el.loop('opacity', { from: 0.3, to: 1, period: 1600 })))
      .child(cap(label, t.foreground)))
    .child(meta == null ? div() : mono(meta, 9.5, t.dim).min_w(0).truncate());
}

function dotRow(t, total, filled, { size = 4, gap = 3, on, off, head: headColor } = {}) {
  return h_flex().gap(gap).items_center().flex_none().children(Array.from({ length: total }, (_, i) =>
    div().size(size).rounded(size).flex_none()
      .bg(i < filled ? (i === filled - 1 && headColor ? headColor : on ?? t.foreground) : off ?? t.border)));
}

/** A ring of dots; `filled` of `count` lit in the accent. Drawn once per value change. */
function dotRing(t, box, count, filled, pulse) {
  const r = box / 2 - 4;
  const c = box / 2;
  return div().size(box).relative().flex_none().children(Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    const lit = i < filled;
    const n = lit ? 4 : 3;
    return div().absolute().left(c + r * Math.cos(a) - n / 2).top(c + r * Math.sin(a) - n / 2)
      .size(n).rounded(n).bg(lit ? t.accent : t.input)
      .when(pulse && i === filled - 1, (el) => el.loop('opacity', { from: 0.3, to: 1, period: 1400 }));
  }));
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The clock lives in its own view: its timer redraws only when the minute turns. */
class ClockFace extends View {
  init(_p, cx) {
    this.now = new Date();
    this.key = this.stamp(this.now);
    cx.timer.every(1000, (cx) => {
      const d = new Date();
      const k = this.stamp(d);
      if (k !== this.key) { this.key = k; this.now = d; cx.notify(); }
    });
  }
  stamp(d) { return d.getFullYear() * 1e8 + d.getMonth() * 1e6 + d.getDate() * 1e4 + d.getHours() * 100 + d.getMinutes(); }
  render() {
    const t = theme();
    const d = this.now;
    const hour = d.getHours();
    return v_flex().w_full().gap(8)
      .child(h_flex().items_end().gap(10)
        .child(h_flex().items_end()
          .child(numeral(pad2(hour), 42, t.foreground))
          .child(numeral(':', 42, t.foreground).loop('opacity', { from: 0.2, to: 1, period: 2000 }))
          .child(numeral(pad2(d.getMinutes()), 42, t.foreground)))
        .child(v_flex().pb(4).gap(1)
          .child(tx(DAYS[d.getDay()], 12, t.foreground).font_weight(500))
          .child(mono(`${MONTHS[d.getMonth()]} ${d.getDate()}`, 10, t.muted))))
      .child(dotRow(t, 24, hour + 1, { size: 4, gap: 3.6, on: t.foreground, off: t.border, head: t.accent }).tooltip('Hours of the day'));
  }
}

export default class PaperWidgets extends View {
  init(_p, cx) {
    this.kind = props()?.kind ?? 'clock';
    this.height = 300;
    if (this.kind === 'clock') this.face = cx.new(ClockFace, {});
    if (this.kind === 'context') {
      this.codex = null; this.codexKey = null; this.loading = false;
      cx.spawn((cx) => this.refreshCodex(cx));
      cx.timer.every(3000, (cx) => cx.spawn((cx) => this.refreshCodex(cx)));
    }
    if (this.kind === 'git') {
      this.git = null; this.gitKey = null; this.gitCwd = null;
      cx.spawn((cx) => this.refreshGit(cx));
      cx.timer.every(4000, (cx) => cx.spawn((cx) => this.refreshGit(cx)));
    }
  }

  async refreshCodex(cx) {
    const l = lead();
    const key = codexKey(l);
    if (key !== this.codexKey) { this.codexKey = key; this.codex = null; cx.notify(); }
    if (!key || this.loading) return;
    if (l.sp?.machine) {
      if (!this.codex) { this.codex = { error: 'Codex data is read on local terminals only' }; cx.notify(); }
      return;
    }
    this.loading = true;
    let next = null;
    try {
      const r = await exec('node', [appHome() + '/mods/paper-widgets/codex-status.cjs', l.pane?.cwd ?? '', l.agent?.title ?? ''], { timeout: 5000 });
      next = JSON.parse(r.stdout);
    } catch { next = { error: 'Codex session data unavailable' }; }
    finally { this.loading = false; }
    if (key === this.codexKey && JSON.stringify(next) !== JSON.stringify(this.codex)) { this.codex = next; cx.notify(); }
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
    const root = v_flex().id('paper-w-' + this.kind).size_full().min_h(0).overflow_hidden().px(14).pt(13).pb(12).gap(10).font_family(UI)
      .on_size_change((size, cx) => { if (Math.abs(this.height - size.height) > 1) { this.height = size.height; cx.notify(); } });
    if (this.kind === 'clock') return this.clock(t, root);
    if (this.kind === 'agents') return this.agents(t, root);
    if (this.kind === 'context') return this.context(t, root);
    return this.gitTile(t, root);
  }

  clock(t, root) {
    const off = -new Date().getTimezoneOffset() / 60;
    return root.child(head(t, 'Local time', 'UTC' + (off >= 0 ? '+' : '') + off)).child(this.face);
  }

  agents(t, root) {
    const all = spaces();
    const sp = all.find((s) => s.active) ?? all[0];
    const everyone = agents();
    const here = everyone.filter((a) => a.space === sp?.id);
    const count = (s) => here.filter((a) => a.status === s).length;
    const working = count('working');
    const spacePanes = panes().filter((p) => (sp?.tabs ?? []).some((tb) => tb.id === p.tab) && p.terminal);
    const terms = spacePanes.length;
    const listed = here.length ? 0 : 58;
    const termRoom = Math.max(0, Math.min(terms, Math.floor((this.height - 190 - listed) / 28)));
    const room = Math.max(0, Math.floor((this.height - 172 - (termRoom ? 26 + termRoom * 28 : 0)) / 30));
    const stat = (label, n, color) => v_flex().flex_1().gap(3)
      .child(mono(pad2(n), 15, n ? color : t.dim).font_weight(n ? 500 : 400))
      .child(cap(label, t.dim, 8));
    return root
      .child(head(t, 'Agents', sp?.name ?? '—', working > 0))
      .child(h_flex().items_end().gap(10)
        .child(numeral(pad2(here.length), 42, here.length ? t.foreground : t.dim))
        .child(v_flex().pb(4).gap(1)
          .child(tx(here.length === 1 ? 'agent here' : 'agents here', 12, t.foreground).font_weight(500))
          .child(mono(`${everyone.length} total · ${terms} term`, 10, t.muted))))
      .child(h_flex().w_full().gap(4)
        .child(stat('Work', working, t.working))
        .child(stat('Wait', count('blocked'), t.blocked))
        .child(stat('Done', count('done'), t.done))
        .child(stat('Idle', count('idle'), t.muted)))
      .child(div().h(1).w_full().flex_none().bg(t.border))
      .when(here.length === 0, (el) => el.child(v_flex().gap(5)
        .child(dotRow(t, 12, 0, { size: 4, gap: 4 }))
        .child(tx('Nothing running here', 12, t.muted))
        .child(mono('Agents appear as they start', 9.5, t.dim))))
      .child(v_flex().gap(2).children(here.slice(0, room).map((a) =>
        h_flex().id('paper-w-agent-' + a.address).h(28).px(6).mx(-6).gap(8).items_center().rounded(7)
          .bg(a.focused ? t.raised : '#00000000')
          .cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click(() => run('agent.focus', { terminal: a.address }))
          .child(div().size(6).rounded(6).flex_none()
            .bg(a.status === 'working' ? t.working : a.status === 'blocked' ? t.blocked : a.status === 'done' ? t.done : t.idle)
            .when(a.status === 'working', (el) => el.loop('opacity', { from: 0.35, to: 1, period: 1600 })))
          .child(tx(a.program?.name ?? 'Agent', 12, t.foreground).flex_1().min_w(0).truncate())
          .child(cap(a.status, a.status === 'working' ? t.accent : t.dim, 8.5)))))
      .when(here.length > room && room > 0, (el) => el.child(cap(`+${here.length - room} more`, t.dim, 8.5)))
      .child(div().flex_1().min_h(0))
      .when(termRoom > 0, (el) => el.child(v_flex().gap(4).flex_none()
        .child(h_flex().justify_between().child(cap('Terminals', t.dim, 8.5)).child(mono(pad2(terms), 9.5, t.dim)))
        .children(spacePanes.slice(0, termRoom).map((p) => h_flex().id('paper-w-term-' + p.pane).h(24).gap(8).items_center()
          .cursor_pointer().on_click(() => run('pane.focus', { pane: p.pane }))
          .child(div().size(4).rounded(4).flex_none().bg(p.focused ? t.accent : t.input))
          .child(tx(p.program?.name ?? 'Terminal', 11.5, p.focused ? t.foreground : t.muted).flex_none())
          .child(mono(short(p.cwd, home()).split('/').pop() || '~', 9.5, t.dim).flex_1().min_w(0).truncate())))));
  }

  context(t, root) {
    const l = lead();
    const key = codexKey(l);
    const data = key && key === this.codexKey ? this.codex : null;
    const pct = data?.context?.percent ?? null;
    const week = data?.weekly?.left ?? null;
    const working = l.agent?.status === 'working';
    const COUNT = 32;
    const ring = dotRing(t, 84, COUNT, pct == null ? 0 : Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * COUNT)), working);
    const center = div().absolute().inset_0().size_full().flex().items_center().justify_center()
      .child(h_flex().items_end()
        .child(numeral(pct == null ? '—' : pct, 26, pct == null ? t.dim : t.foreground))
        .when(pct != null, (el) => el.child(mono('%', 10, t.muted).pb(2))));
    const reset = data?.weekly?.resetsAt
      ? new Date(data.weekly.resetsAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    const model = data?.model ?? (key ? 'codex' : null);
    return root
      .child(head(t, 'Context', model ?? '—', working && pct != null))
      .child(h_flex().gap(12).items_center()
        .child(div().relative().size(84).flex_none().child(ring).child(center))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .when(pct != null, (el) => el
            .child(tx('of the window', 12, t.foreground).font_weight(500))
            .child(mono(data.context.used ? `${Math.round(data.context.used / 1000)}k / ${Math.round(data.context.total / 1000)}k` : '', 10, t.muted))
            .child(mono(data?.effort ? `effort · ${data.effort}` : '', 10, t.dim)))
          .when(pct == null, (el) => el
            .child(tx(key ? 'Reading…' : 'No session', 12.5, t.muted).font_weight(500))
            .child(mono(data?.error ? data.error : key ? 'Matching the terminal' : 'Focus a local Codex terminal', 9.5, t.dim))))
      )
      .child(v_flex().gap(6)
        .child(h_flex().justify_between().items_center()
          .child(cap('Weekly left', t.dim, 8.5))
          .child(mono(week == null ? '—' : `${Math.round(week)}%${reset ? ' · ' + reset : ''}`, 10, week == null ? t.dim : t.foreground)))
        .child(dotRow(t, 22, week == null ? 0 : Math.round((week / 100) * 22), { size: 4, gap: 4, on: t.foreground })));
  }

  gitTile(t, root) {
    const g = this.git;
    const repo = g && !g.none;
    const meta = repo && (g.ahead || g.behind) ? `↑${g.ahead} ↓${g.behind}` : repo ? 'synced' : null;
    return root
      .child(head(t, 'Git', meta))
      .when(repo, (el) => el
        .child(h_flex().gap(8).items_end()
          .child(tx(g.branch ?? 'detached', 16, t.foreground).font_weight(500).min_w(0).truncate())
          .child(mono(g.changed ? `${g.changed} changed` : 'clean', 10, g.changed ? t.accent : t.muted).flex_none().pb(1)))
        .child(h_flex().justify_between().items_center().gap(8)
          .child(dotRow(t, 10, Math.min(g.changed, 10), { size: 4, gap: 3.6, on: t.accent }).tooltip(g.changed ? `${g.changed} changed files` : 'Working tree clean'))
          .child(mono(short(this.gitCwd, home()).split('/').pop() || '~', 9.5, t.dim).flex_1().min_w(0).text_right().truncate())))
      .when(!repo, (el) => el
        .child(tx(g ? 'Not a repository' : 'Reading…', 13, t.muted).font_weight(500))
        .child(mono(short(this.gitCwd, home()) || 'No folder', 9.5, t.dim).truncate()));
  }
}
