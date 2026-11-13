import { div } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { agents, home, panes, spaces, theme, run, setAgentOrder } from 'herdr';
import SessionSource, { folder, formatDuration, taskTitle } from './session.js';
import { tx, mono, track, tower, history, ring, section, frame, dots, hatch, UI, ActivityCore } from './instruments.js';

export default class Telemetry extends SessionSource {
  init(props, cx) {
    super.init(props, cx);
    this.height = 720;
    this.coreBox = { width: 302, height: 180 };
    this.samples = [];
    this.sampleKey = null;
    this.rosterPage = 0;
    this.coreView = cx.new(ActivityCore, { working: false, percent: null });
    cx.timer.every(3000, (cx) => {
      if (this.sampleKey !== this.codexKey) { this.samples = []; this.sampleKey = this.codexKey; }
      const value = this.codex?.context?.percent ?? null;
      const last = this.samples[this.samples.length - 1]?.value ?? null;
      this.samples.push({ at: Date.now(), value });
      this.samples = this.samples.slice(-60);
      this.syncCore();
      if (value != null || last != null) cx.notify();
    });
  }

  syncCore() {
    if (!this.coreView) return;
    const lead = agents().find((a) => a.focused);
    this.coreView.set_props({
      working: lead?.status === 'working',
      percent: this.codex?.context?.percent ?? null,
    });
  }

  async refreshCodex(cx) {
    await super.refreshCodex(cx);
    this.syncCore();
  }

  render() {
    const t = theme();
    const sp = spaces().find((s) => s.active) ?? spaces()[0];
    const tab = sp?.tabs.find((s) => s.active);
    const list = agents().filter((a) => a.space === sp?.id);
    const lead = list.find((a) => a.focused) ?? list.find((a) => a.tab === tab?.id) ?? list[0];
    const pane = panes().find((p) => p.pane === lead?.pane) ?? panes().find((p) => p.focused);
    const key = lead?.app === 'codex' ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, '')]) : null;
    const data = key && key === this.codexKey ? this.codex : null;
    const working = lead?.status === 'working';
    const status = lead?.status === 'blocked' ? 'INPUT REQUIRED' : working ? 'PROCESSING' : lead ? 'STANDBY' : 'OFFLINE';
    const color = lead?.status === 'blocked' ? t.blocked : working ? t.working : t.accent;
    const compact = this.height < 640;
    const tiny = this.height < 500;
    const model = data?.model ?? lead?.program?.name ?? 'No session';
    const field = (a, b, c = t.foreground) =>
      h_flex().w_full().h(18).items_center().justify_between().gap(8)
        .child(tx(a, 8, t.dim)).child(tx(b, 9, c).min_w(0).truncate());
    const control = (id, title, value, kind) =>
      h_flex().id(id).flex_1().min_w(0).h(26).px(6).relative()
        .border_b(1).border_t(1).border_color(t.input)
        .items_center().justify_between().gap(5)
        .when(lead?.app === 'codex', (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)))
        .tooltip(lead?.app === 'codex' ? title : '模型选择仅支持本地 Codex 会话')
        .on_click((_e, cx) => { if (lead?.app === 'codex') this.togglePicker(kind, lead.address, cx); })
        .child(tx(value, 9, t.accent).min_w(0).truncate())
        .when(lead?.app === 'codex', (el) => el.child(tx('⌄', 9, t.working)));
    const picker = this.picker?.address === lead?.address && this.picker;
    const options = picker
      ? (picker.kind === 'model'
        ? (data?.models ?? []).map((m) => ({ value: m.id, label: m.name, active: m.id === data?.model }))
        : (data?.models?.find((m) => m.id === data?.model)?.efforts ?? []).map((e) => ({ value: e, label: e, active: e === data?.effort })))
      : [];
    const pageSize = compact ? 1 : 3;
    const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
    const page = Math.min(this.rosterPage, pageCount - 1);
    setAgentOrder(list.map((a) => a.address));
    return v_flex().id('gmunk-telemetry').size_full().min_h(0).relative().overflow_hidden()
      .bg(t.canvas).px(10).gap(compact ? 4 : 6).font_family(UI)
      .on_size_change((size, cx) => { if (Math.abs(this.height - size.height) > 1) { this.height = size.height; cx.notify(); } })
      .child(dots(t.border))
      .child(frame(t, { gold: false, ticks: true, inset: true }))
      .child(h_flex().w_full().h(compact ? 36 : 42).flex_none().items_end().justify_between()
        .child(v_flex().gap(1)
          .child(tx(track('TELEMETRY'), 16, t.accent).font_weight(600))
          .child(tx(track('SESSION INSTRUMENTS'), 6, t.dim)))
        .child(v_flex().items_end().gap(1)
          .child(h_flex().gap(6).items_center()
            .child(tx(track('NODES'), 7, t.dim))
            .child(mono(String(list.length).padStart(2, '0'), 16, t.working)))
          .child(mono(lead?.address ?? '—', 8, t.dim))))
      .child(h_flex().w_full().h(30).flex_none().items_center().justify_between().relative()
        .when(!lead, (el) => el.child(hatch(t.blocked, 1.4, 5, 0.28)))
        .child(h_flex().gap(6).items_center()
          .child(div().w(4).h(14).bg(color))
          .child(tx(track(status), 11, color).font_weight(600)))
        .child(h_flex().h(20).items_end().gap(3).tooltip('Session activity indicator, not throughput')
          .children([8, 15, 10, 20, 12, 17, 7, 13].map((h, i) =>
            div().id('gmunk-signal-' + i).w(3).h(working ? h : 3).bg(i % 2 ? t.accent : color)
              .when(working, (el) => el.loop('height', { from: 3, to: h, period: 900 + i * 173 }))))))
      .child(v_flex().w_full().flex_none().gap(2)
        .child(tx(taskTitle(lead, tab, sp), compact ? 12 : 14, t.foreground).font_weight(500).truncate().tooltip(data?.title ?? lead?.title ?? ''))
        .child(tx(folder(data?.cwd ?? pane?.cwd ?? sp?.folder, home()), 8, t.dim).truncate()))
      .child(div().w_full().flex_1().min_h(tiny ? 36 : compact ? 56 : 88).max_h(210).id('gmunk-core-bounds')
        .on_size_change((size, cx) => {
          if (size.width > 0 && size.height > 0 && (Math.abs(this.coreBox.width - size.width) > 1 || Math.abs(this.coreBox.height - size.height) > 1)) {
            this.coreBox = size; cx.notify();
          }
        })
        .child(this.coreView))
      .child(section(t, 'RESOURCE MATRIX', 'CTX / WEEK'))
      .child(h_flex().w_full().flex_none().gap(14)
        .child(tower(t, 'CONTEXT', data?.context?.percent ?? null, 'USED', t.accent, compact))
        .child(tower(t, 'WEEKLY', data?.weekly?.left ?? null, 'REMAINING', t.ansi3, compact)))
      .when(!compact, (el) => el.child(field('RESET', data?.weekly?.resetsAt ? new Date(data.weekly.resetsAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—', t.muted)))
      .child(h_flex().w_full().flex_none().gap(5)
        .child(control('gmunk-model', '选择模型', model, 'model'))
        .child(control('gmunk-effort', '选择推理强度', data?.effort ?? 'Reasoning', 'effort')))
      .when(!tiny, (el) => el.child(v_flex().w_full().flex_none()
        .child(section(t, 'CONTEXT TRACE', '3s × 60 / % USED'))
        .child(history(t, this.sampleKey === key ? this.samples : [], compact ? 32 : 44))))
      .child(section(t, 'LINK / RUNTIME', String(list.length).padStart(2, '0') + ' NODES'))
      .child(h_flex().w_full().flex_none().gap(12)
        .child(ring(t, data?.context?.percent ?? null, 'CONTEXT ARC', t.accent))
        .child(v_flex().flex_1().min_w(0).gap(4).justify_center()
          .child(tx(track('TURN'), 7, t.dim))
          .child(mono(tab?.working_since ? formatDuration(Date.now() - tab.working_since) : '—', 20, t.accent))
          .child(tx(('GIT / ' + (this.git?.branch ?? pane?.branch ?? '—')).toUpperCase(), 7, t.dim).truncate())
          .child(tx(this.git ? (this.git.changed ? `${this.git.changed} MODIFIED` : 'CLEAN') : '—', 11, this.git?.changed ? t.working : t.ansi2))
          .child(h_flex().justify_between()
            .child(tx(track('HOST'), 6, t.dim))
            .child(tx((sp?.machine ?? 'LOCAL').toUpperCase(), 7, t.accent)))))
      .when(Boolean(data?.error), (el) => el.child(tx(data.error, 8, t.muted).truncate().tooltip(data.error)))
      .child(section(t, 'AGENT FEED', String(list.length).padStart(2, '0')))
      .when(list.length === 0, (el) => el.child(h_flex().w_full().h(22).px(5).items_center().justify_between().relative()
        .child(frame(t, { ticks: false })).child(tx(track('NO NODES'), 8, t.dim)).child(tx('STANDBY', 7, t.dim))))
      .child(v_flex().w_full().flex_none().gap(2).children(list.slice(page * pageSize, (page + 1) * pageSize).map((a) =>
        h_flex().id('gmunk-agent-' + a.address).w_full().h(22).px(5).items_center().justify_between().relative()
          .border_l(2).border_color(a.focused ? t.accent : t.border).bg(t.surface)
          .cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click(() => run('pane.focus', { pane: a.pane }))
          .child(tx(a.program?.name ?? 'Agent', 9, t.foreground).font_weight(500))
          .child(tx(a.status, 8, a.status === 'working' ? t.working : t.dim)))))
      .child(h_flex().w_full().h(22).flex_none().items_center().justify_between()
        .child(tx(sp?.machine ? 'REMOTE / ' + sp.machine : 'LOCAL / CONNECTED', 7, t.dim))
        .child(tx(pageCount > 1 ? `${page + 1}/${pageCount} NEXT →` : 'LINK / OK', 7, t.accent)
          .id('gmunk-roster-next').cursor_pointer().on_click((_e, cx) => { this.rosterPage = (page + 1) % pageCount; cx.notify(); })))
      .when(Boolean(picker), (el) => el.child(v_flex().id('gmunk-options').absolute().left(6).right(6).top(60).max_h(280)
        .p(10).gap(4).bg(t.popover).border(1).border_color(t.accent)
        .child(h_flex().justify_between().items_center()
          .child(tx(picker.kind === 'model' ? track('SELECT MODEL') : track('REASONING'), 10, t.accent))
          .child(tx('CLOSE ×', 9, t.working).id('gmunk-picker-close').cursor_pointer().on_click((_e, cx) => { this.picker = null; cx.notify(); })))
        .child(v_flex().max_h(220).overflow_y_scrollbar().gap(3).children(options.map((o) =>
          h_flex().id('gmunk-option-' + o.value).w_full().h(28).px(6).items_center().justify_between()
            .bg(o.active ? t.selected : t.surface).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { if (!this.switching) cx.spawn((cx) => this.selectCodexOption(lead, picker.kind === 'model' ? { model: o.value } : { effort: o.value }, cx)); })
            .child(tx(o.label, 10, t.foreground)).child(tx(o.active ? '●' : '', 9, t.accent)))))
        .when(!options.length, (el) => el.child(tx('模型目录尚未就绪', 10, t.muted)))));
  }
}
