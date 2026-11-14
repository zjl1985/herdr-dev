import { View, div, svg, image } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { agents, panes, props, spaces, theme, run, home, layout, settings, window as win } from 'herdr';
import { UI, tx, cap, mono, icon, dot, shown, statusColor } from './ui.js';

const short = (s) => (s && s.startsWith(home()) ? '~' + s.slice(home().length) : s ?? '');
const stop = (_e, cx) => cx.stop_propagation();

/** A quiet icon button. Presses never start a window drag. */
function iconButton(t, id, name, tip, cmd, args, { size = 26, active = false, glyph = 14 } = {}) {
  return h_flex().id(id).size(size).flex_none().items_center().justify_center().rounded(8)
    .bg(active ? t.selected : '#00000000')
    .cursor_pointer().hover((s) => s.bg(active ? t.selected : t.hover)).tooltip(tip)
    .on_mouse_down('left', stop)
    .on_click(() => run(cmd, args))
    .child(icon(name, glyph, active ? t.accent : t.muted));
}

function programGlyph(t, p, n, color) {
  if (p?.icon) return p.tint ? svg(p.icon).size(n).flex_none().text_color(color) : image(p.icon).size(n).flex_none();
  return div().size(n - 6).rounded(2).flex_none().bg(color);
}

function sectionHead(t, label, meta) {
  return h_flex().w_full().h(24).flex_none().items_center().justify_between().px(14)
    .child(cap(label, t.dim))
    .child(meta == null ? div() : mono(meta, 10, t.dim));
}

export default class PaperShell extends View {
  init() {
    this.navHeight = 700;
  }

  render() {
    const t = theme();
    const role = props()?.role ?? 'pane';
    if (role === 'rail') return this.rail(t);
    if (role === 'tabs') return this.tabs(t);
    if (role === 'nav') return this.nav(t);
    return this.pane(t);
  }

  // ── rail: always there, the folded form of the left side ─────────────
  rail(t) {
    const all = spaces();
    const navOpen = shown('sidebar');
    return v_flex().size_full().items_center().py(10).gap(6).font_family(UI)
      .child(h_flex().size(30).items_center().justify_center().tooltip('Herdr / Paper')
        .child(svg('mods/paper-shell/icons/mark.svg').size(18).text_color(t.foreground)))
      .child(iconButton(t, 'paper-rail-nav', 'panel-left', navOpen ? 'Collapse sidebar  ·  Ctrl+Shift+B' : 'Expand sidebar  ·  Ctrl+Shift+B',
        'layout.toggle', { id: 'sidebar' }, { size: 30, active: navOpen, glyph: 15 }))
      .child(div().w(16).h(1).my(4).bg(t.border))
      .child(v_flex().gap(6).items_center().children(all.slice(0, 9).map((s, i) => {
        const letter = (s.name || '?').trim().slice(0, 1).toUpperCase();
        return div().id('paper-rail-space-' + s.id).size(30).relative().flex_none()
          .tooltip(`${s.name}  ·  Alt+${i + 1}`)
          .cursor_pointer().on_click(() => run('space.select', { id: s.id }))
          .child(h_flex().size_full().rounded(9).items_center().justify_center()
            .bg(s.active ? t.solid : t.raised)
            .hover((st) => st.bg(s.active ? t.solid : t.hover))
            .child(tx(letter, 12, s.active ? t.solid_foreground : t.muted).font_weight(500)))
          .when(s.status === 'working' || s.status === 'blocked', (el) => el.child(
            div().absolute().top(-2).right(-2).size(9).rounded(9).bg(t.surface)
              .child(div().absolute().top(1.5).left(1.5).child(dot(t, s.status, 6)))));
      })))
      .child(iconButton(t, 'paper-rail-new', 'plus', 'New space  ·  Ctrl+Shift+N', 'space.new', {}, { size: 30 }))
      .child(div().flex_1())
      .child(iconButton(t, 'paper-rail-settings', 'gear', 'Settings  ·  Ctrl+,', 'app.settings', {}, { size: 30 }));
  }

  // ── sidebar: the active space in detail ────────────────────────────────
  nav(t) {
    const all = spaces();
    const sp = all.find((s) => s.active) ?? all[0];
    const live = agents();
    const ps = panes();
    const compact = this.navHeight < 560;
    const tabs = sp?.tabs ?? [];
    const branch = ps.find((p) => p.focused)?.branch ?? sp?.branch ?? null;
    const tabLimit = compact ? 4 : 7;
    const agentLimit = compact ? 3 : 6;
    return v_flex().id('paper-nav').size_full().min_h(0).overflow_hidden().font_family(UI).pt(14)
      .on_size_change((size, cx) => { if (Math.abs(this.navHeight - size.height) > 1) { this.navHeight = size.height; cx.notify(); } })
      .child(v_flex().px(14).gap(3).flex_none()
        .child(h_flex().items_center().justify_between()
          .child(cap('Space', t.dim))
          .child(cap(sp?.machine ? sp.machine : 'local', t.dim)))
        .child(tx(sp?.name ?? 'No space', 17, t.foreground).font_weight(500).truncate().mt(4))
        .child(mono(short(sp?.folder) || '—', 10, t.muted).truncate())
        .when(Boolean(branch), (el) => el.child(h_flex().mt(6)
          .child(h_flex().h(20).px(7).gap(5).items_center().rounded(99).bg(t.raised)
            .child(div().size(5).rounded(5).bg(t.accent))
            .child(mono(branch, 10, t.foreground).max_w(130).truncate())))))
      .child(div().h(1).mx(14).my(12).flex_none().bg(t.border))
      .child(sectionHead(t, 'Tabs', String(tabs.length).padStart(2, '0')))
      .child(v_flex().px(6).gap(1).flex_none().children(tabs.slice(0, tabLimit).map((tb) => {
        const n = tb.panes ?? 0;
        return h_flex().id('paper-nav-tab-' + tb.id).h(30).px(8).gap(8).items_center().rounded(8)
          .bg(tb.active ? t.raised : '#00000000')
          .cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run('tab.select', { id: tb.id }))
          .child(mono(String(tb.index ?? '').padStart(2, '0'), 10, tb.active ? t.muted : t.dim).w(16))
          .child(tx(tb.named ? tb.name : tb.status && tb.status !== 'idle' ? tb.status : 'Terminal', 12.5, tb.active ? t.foreground : t.muted)
            .font_weight(tb.active ? 500 : 400).flex_1().min_w(0).truncate())
          .when(tb.status === 'working' || tb.status === 'blocked', (el) => el.child(dot(t, tb.status, 6)))
          .child(mono(String(n), 10, t.dim).tooltip(n === 1 ? '1 pane' : `${n} panes`));
      })))
      .when(tabs.length > tabLimit, (el) => el.child(h_flex().px(14).h(20).child(cap(`+${tabs.length - tabLimit} more`, t.dim))))
      .child(div().h(10).flex_none())
      .child(sectionHead(t, 'Agents', String(live.length).padStart(2, '0')))
      .child(v_flex().px(6).gap(1).flex_none().children(live.slice(0, agentLimit).map((a) =>
        h_flex().id('paper-nav-agent-' + a.address).h(34).px(8).gap(9).items_center().rounded(8)
          .bg(a.focused ? t.raised : '#00000000')
          .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(a.title || a.address)
          .on_click(() => run('agent.focus', { terminal: a.address }))
          .child(programGlyph(t, a.program, 15, a.status === 'working' ? t.accent : t.foreground))
          .child(v_flex().flex_1().min_w(0).gap(1)
            .child(tx(a.program?.name ?? 'Agent', 12.5, t.foreground).font_weight(500).truncate())
            .child(mono(a.space_name ? `${a.space_name} · ${a.tab_index}` : a.address, 9.5, t.dim).truncate()))
          .child(h_flex().gap(5).items_center().flex_none()
            .child(cap(a.status, a.status === 'working' ? t.accent : a.status === 'blocked' ? t.blocked : t.dim, 8.5))
            .child(dot(t, a.status, 6))))))
      .when(live.length === 0, (el) => el.child(v_flex().mx(14).mt(4).p(12).gap(6).rounded(10)
        .border(1).border_dashed().border_color(t.input)
        .child(h_flex().gap(4).children([0, 1, 2, 3, 4].map((i) => div().size(4).rounded(4).bg(i === 0 ? t.accent : t.border))))
        .child(tx('No agents running', 12, t.muted))
        .child(mono('Start one from + in the tab bar', 9.5, t.dim))))
      .child(div().flex_1().min_h(8))
      .child(h_flex().h(44).flex_none().px(10).items_center().justify_between().border_t(1).border_color(t.border)
        .child(h_flex().id('paper-nav-stow').h(26).px(8).gap(6).items_center().rounded(8)
          .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip('Collapse sidebar')
          .on_click(() => run('layout.hide', { id: 'sidebar' }))
          .child(icon('chevron-left', 13, t.muted))
          .child(tx('Collapse', 12, t.muted)))
        .child(mono('⌃⇧B', 10, t.dim).pr(4)));
  }

  // ── tab bar: tabs left, toggles right; the window drags from here ─────
  tabs(t) {
    const sp = spaces().find((s) => s.active);
    const w = win();
    const root = layout();
    const zoom = settings()?.zoom || 1;
    // Same rule as the shipped tabs mod / zero-herdr: macOS traffic lights
    // sit in this 42px bar at [12, 16], and need traffic_lights[0] + 64 px.
    const lightsPadding = w?.platform === 'macos' && w.titlebar === 'none' && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / zoom)
      : 10;
    const toggle = (id, label, node, tip) => {
      const on = shown(node);
      return h_flex().id(id).h(24).px(9).gap(6).items_center().rounded(7)
        .bg(on ? t.surface : '#00000000')
        .when(on, (el) => el.shadow_sm())
        .cursor_pointer().hover((s) => s.bg(on ? t.surface : t.hover)).tooltip(tip)
        .on_mouse_down('left', stop)
        .on_click(() => run('layout.toggle', { id: node }))
        .child(div().size(5).rounded(5).bg(on ? t.accent : t.input))
        .child(cap(label, on ? t.foreground : t.muted, 12));
    };
    return h_flex().size_full().items_center().gap(6).pl(lightsPadding).pr(10).font_family(UI)
      .child(h_flex().flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scroll()
        .children((sp?.tabs ?? []).map((tb) =>
          h_flex().id('paper-tab-' + tb.id).h(28).px(11).gap(8).items_center().flex_none().rounded(10)
            .bg(tb.active ? t.surface : '#00000000')
            .when(tb.active, (el) => el.shadow_sm())
            .cursor_pointer().hover((s) => s.bg(tb.active ? t.surface : t.hover))
            .on_mouse_down('left', stop)
            .on_click(() => run('tab.select', { id: tb.id }))
            .child(mono(String(tb.index).padStart(2, '0'), 10, tb.active ? t.muted : t.dim))
            .child(tx(tb.named ? tb.name : 'Terminal', 12.5, tb.active ? t.foreground : t.muted)
              .font_weight(tb.active ? 500 : 400).max_w(160).truncate())
            .when(tb.status === 'working' || tb.status === 'blocked', (el) => el.child(dot(t, tb.status, 6)))))
        .child(iconButton(t, 'paper-tab-new', 'plus', 'New tab  ·  Ctrl+Shift+T', 'tab.new', {}, { size: 26 })))
      .child(h_flex().h(30).px(3).gap(2).items_center().rounded(16).bg(t.raised).flex_none()
        .child(toggle('paper-toggle-nav', 'Nav', 'sidebar', 'Sidebar  ·  Ctrl+Shift+B'))
        .child(toggle('paper-toggle-files', 'Files', 'panel', 'Files panel'))
        .child(toggle('paper-toggle-widgets', 'Widgets', 'widgets', 'Widgets column')))
      .when(Boolean(w?.buttons), (el) => el.child(h_flex().gap(0).items_center().flex_none().pl(2)
        .child(iconButton(t, 'paper-win-min', 'win-min', 'Minimize', 'window.minimize', {}, { size: 26, glyph: 13 }))
        .child(iconButton(t, 'paper-win-max', 'win-max', w.maximized ? 'Restore' : 'Maximize', 'window.maximize', {}, { size: 26, glyph: 13 }))
        .child(iconButton(t, 'paper-win-close', 'win-close', 'Close', 'window.close', {}, { size: 26, glyph: 13 }))));
  }

  // ── pane header: one copy per pane ─────────────────────────────────────
  pane(t) {
    const ps = panes();
    const p = ps.find((x) => x.pane === props()?.pane) ?? ps.find((x) => x.focused);
    if (!p) return div();
    const name = p.program?.name ?? 'Terminal';
    const color = p.status ? statusColor(t, p.status) : p.focused ? t.accent : t.idle;
    return h_flex().size_full().px(12).gap(9).items_center().font_family(UI).border_b(1).border_color(t.border)
      .child(div().size(6).rounded(6).flex_none().bg(color)
        .when(p.status === 'working', (el) => el.loop('opacity', { from: 0.35, to: 1, period: 1600 })))
      .child(tx(name, 12.5, p.focused ? t.foreground : t.muted).font_weight(500).flex_none())
      .child(mono(short(p.cwd), 10.5, t.dim).flex_1().min_w(0).truncate())
      .when(Boolean(p.branch), (el) => el.child(h_flex().h(18).px(6).gap(4).items_center().rounded(5).bg(t.raised).flex_none()
        .child(mono(p.branch, 9.5, t.muted).max_w(120).truncate())))
      .child(h_flex().gap(0).flex_none()
        .child(iconButton(t, 'paper-split-r-' + p.pane, 'split-right', 'Split right  ·  Ctrl+Shift+O', 'pane.split', { pane: p.pane, direction: 'right' }, { size: 24, glyph: 13 }))
        .child(iconButton(t, 'paper-split-d-' + p.pane, 'split-down', 'Split down  ·  Ctrl+Shift+E', 'pane.split', { pane: p.pane, direction: 'down' }, { size: 24, glyph: 13 }))
        .child(iconButton(t, 'paper-zoom-' + p.pane, 'zoom', p.zoomed ? 'Unzoom' : 'Zoom  ·  Ctrl+Shift+Z', 'pane.zoom', { pane: p.pane }, { size: 24, glyph: 13, active: p.zoomed }))
        .child(iconButton(t, 'paper-close-' + p.pane, 'close', 'Close pane  ·  Ctrl+Shift+X', 'pane.close', { pane: p.pane }, { size: 24, glyph: 13 })));
  }
}
