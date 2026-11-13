import { View, div, svg, image } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { agents, panes, props, spaces, theme, run, home, layout, placement } from 'herdr';
import { frame, network, dots, hatch, bezel, rule, lines, tx, mono, track, UI, Clock } from './details.js';

const findNode = (n, id) => n?.id === id ? n : (n?.children ?? []).map((c) => findNode(c, id)).find(Boolean);
const short = (s) => s?.startsWith(home()) ? '~' + s.slice(home().length) : s ?? '';

function action(id, label, tip, cmd, args, t) {
  return h_flex().id(id).h(20).px(7).items_center().justify_center()
    .border_b(1).border_color(t.input)
    .cursor_pointer().hover((s) => s.bg(t.hover).border_color(t.accent)).tooltip(tip)
    .on_mouse_down('left', (_e, cx) => { cx.stop_propagation(); run(cmd, args); })
    .on_click((_e, cx) => cx.stop_propagation())
    .child(tx(label, 9, t.accent));
}

function sectionHead(label, meta, t) {
  return h_flex().h(22).flex_none().w_full().items_center().justify_between().relative()
    .child(rule(t)).child(tx(track(label), 8, t.accent).font_weight(500))
    .child(meta == null ? div() : mono(meta, 9, t.working));
}

export default class CommandShell extends View {
  init(_props, cx) {
    this.navHeight = 720;
    this.navPage = 0;
    this.agentPage = 0;
    const role = props()?.role ?? 'pane';
    if (role === 'nav') this.clockView = cx.new(Clock, { size: 14, tone: 'foreground' });
    if (role === 'footer') this.clockView = cx.new(Clock, { size: 11, tone: 'muted' });
    if (role === 'drawer') {
      cx.timer.every(400, (cx) => {
        const sidebarShown = !findNode(layout(), 'sidebar')?.hidden;
        const gutterShown = !findNode(layout(), 'drawer-gutter')?.hidden;
        if (sidebarShown === gutterShown) run(sidebarShown ? 'layout.hide' : 'layout.show', { id: 'drawer-gutter' });
      });
    }
  }

  render() {
    const t = theme();
    const role = props()?.role ?? 'pane';
    const all = spaces();
    const sp = all.find((s) => s.active);
    const live = agents();
    const ps = panes();
    const sidebarShown = !findNode(layout(), 'sidebar')?.hidden;
    const base = () => h_flex().size_full().font_family(UI).items_center();
    if (role === 'bezel') return bezel(t, props()?.side === 'right' ? 'right' : 'left');
    if (role === 'drawer') return this.drawer(t, all, live, sidebarShown);
    if (role === 'tabs') return this.tabs(t, sp, sidebarShown, base);
    if (role === 'pane') return this.pane(t, ps, base);
    if (role === 'diagnostics') return this.diagnostics(t, sp, live, base);
    if (role === 'footer') return this.footer(t, sp, live, ps, base);
    return this.nav(t, all, sp, live, ps);
  }

  drawer(t, all, live, sidebarShown) {
    if (sidebarShown) return div().w(0).h(0);
    const right = placement()?.edge === 'right';
    const edge = (content) => h_flex().w(40).h_full().flex_none().items_center().justify_center().child(content);
    const row = (id, icon, body, command, args, active = false) => {
      const e = edge(icon);
      const b = h_flex().w(188).h_full().px(8).items_center().min_w(0).child(body);
      const r = h_flex().id(id).h(34).flex_none().w_full().relative()
        .bg(active ? t.surface : t.canvas)
        .cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run(command, args));
      return right ? r.child(b).child(e) : r.child(e).child(b);
    };
    const group = (name) => h_flex().h(22).w_full().items_center().relative()
      .child(edge(div().w(14).h(1).bg(t.ansi3))).child(tx(track(name), 7, t.dim));
    return v_flex().id('gmunk-hover-drawer').w(228).py(6).font_family(UI).bg(t.canvas).gap(2).relative()
      .child(dots(t.border))
      .child(row('gmunk-pin', svg('mods/gmunk-shell/mark.svg').size(17).text_color(t.accent),
        h_flex().w_full().justify_between().child(tx(track('NAVIGATION'), 9, t.accent)).child(tx('PIN →', 8, t.working)),
        'layout.show', { id: 'sidebar' }))
      .child(row('gmunk-new-drawer', tx('+', 18, t.working), tx(track('NEW SECTOR'), 9, t.accent), 'space.new', {}))
      .child(group('SECTORS'))
      .children(all.slice(0, 8).map((s) => row('gmunk-drawer-space-' + s.id,
        tx(s.name.slice(0, 1).toUpperCase(), 13, s.active ? t.working : t.muted).font_weight(600),
        tx(s.name, 11, s.active ? t.foreground : t.muted).truncate(), 'space.select', { id: s.id }, s.active)))
      .child(group('AGENTS'))
      .children(live.slice(0, 8).map((a) => row('gmunk-drawer-agent-' + a.address,
        a.program?.icon
          ? (a.program.tint ? svg(a.program.icon).size(15).text_color(a.status === 'working' ? t.working : t.accent) : image(a.program.icon).size(15))
          : tx('◇', 13, t.accent),
        h_flex().w_full().min_w(0).gap(5)
          .child(tx(a.program?.name ?? 'Agent', 10, t.foreground).flex_1().truncate())
          .child(tx(a.status, 7, a.status === 'working' ? t.working : t.dim)),
        'agent.focus', { terminal: a.address }, a.focused)))
      .child(row('gmunk-drawer-settings', tx('⚙', 13, t.dim), tx(track('CONFIGURATION'), 8, t.muted), 'app.settings', {}));
  }

  tabs(t, sp, sidebarShown, base) {
    return base().gap(4).pl(sidebarShown ? 4 : 8).pr(4).relative()
      .child(dots(t.border))
      .child(frame(t, { gold: true, ticks: true }))
      .when(!sidebarShown, (el) => el.child(action('gmunk-nav-open', 'NAV', 'Show navigation / Ctrl+Shift+B', 'layout.show', { id: 'sidebar' }, t)))
      .child(h_flex().flex_1().min_w(0).overflow_x_scroll().gap(3).children((sp?.tabs ?? []).map((s) =>
        h_flex().id('gmunk-tab-' + s.id).h(22).px(7).gap(5).items_center().flex_none()
          .bg(s.active ? t.surface : 'transparent').border_t(1).border_color(s.active ? t.accent : t.border)
          .cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run('tab.select', { id: s.id }))
          .child(mono(String(s.index).padStart(2, '0'), 10, s.active ? t.accent : t.dim))
          .child(tx(s.named ? s.name : s.status ?? 'terminal', 10, s.active ? t.foreground : t.dim).font_weight(500).max_w(140).truncate())
          .when(s.status === 'working', (el) => el.child(div().size(4).bg(t.working).loop('opacity', { from: 0.3, to: 1, period: 1400 }))))))
      .child(action('gmunk-tab-add', '+', 'New terminal', 'tab.new', {}, t))
      .child(v_flex().flex_none().px(8).items_end().justify_center()
        .child(tx(track('WORKSPACE'), 8, t.ansi3).font_weight(500))
        .child(tx(sp?.name ?? '—', 10, t.foreground).truncate()))
      .child(action('gmunk-nav-toggle', 'NAV', 'Toggle navigation / Ctrl+Shift+B', 'layout.toggle', { id: 'sidebar' }, t))
      .child(action('gmunk-panel-toggle', 'FILES', 'Toggle files', 'layout.toggle', { id: 'panel' }, t))
      .child(action('gmunk-telem-toggle', 'TELEM', 'Toggle telemetry', 'layout.toggle', { id: 'gmunk-instruments' }, t));
  }

  pane(t, ps, base) {
    const p = ps.find((p) => p.pane === props()?.pane) ?? ps.find((p) => p.focused);
    if (!p) return div();
    return base().px(6).gap(6).bg(t.chrome).relative()
      .child(frame(t, { ticks: true }))
      .child(tx('⌜', 13, t.working))
      .child(tx((p.program?.name ?? 'TERMINAL').toUpperCase(), 9, t.accent).font_weight(500))
      .child(mono(short(p.cwd), 8, t.dim).flex_1().min_w(0).truncate())
      .child(action('gmunk-split-r', '┊', 'Split right', 'pane.split', { pane: p.pane, direction: 'right' }, t))
      .child(action('gmunk-split-d', '━', 'Split down', 'pane.split', { pane: p.pane, direction: 'down' }, t))
      .child(action('gmunk-zoom', '□', 'Zoom pane', 'pane.zoom', { pane: p.pane }, t))
      .child(action('gmunk-close', '×', 'Close pane', 'pane.close', { pane: p.pane }, t));
  }

  diagnostics(t, sp, live, base) {
    const counts = ['working', 'blocked', 'idle', 'done'].map((state) => ({
      state,
      count: live.filter((a) => a.status === state).length,
    }));
    const blocked = counts.find((c) => c.state === 'blocked')?.count > 0;
    return base().relative().gap(8).px(8).overflow_hidden()
      .child(dots(t.border))
      .child(frame(t, { gold: true, ticks: true }))
      .when(blocked, (el) => el.child(div().absolute().top(0).left(0).right(0).h(6).child(hatch(t.blocked, 1.4, 5, 0.35))))
      .child(v_flex().w(108).flex_none().gap(1)
        .child(tx(track('PROCESS MATRIX'), 8, t.accent).font_weight(500))
        .child(tx(track('AGENT STATE'), 6, t.dim)))
      .child(h_flex().flex_1().gap(8).items_center().children(counts.map((item) => {
        const hot = item.state === 'working' || item.state === 'blocked';
        const color = item.state === 'working' ? t.working : item.state === 'blocked' ? t.blocked : t.accent;
        return v_flex().flex_1().gap(1)
          .child(h_flex().justify_between().items_end()
            .child(tx(track(item.state), 6, t.dim))
            .child(mono(String(item.count).padStart(2, '0'), 16, item.count && hot ? color : item.count ? t.accent : t.dim)))
          .child(h_flex().gap(1).items_end().h(8)
            .children(Array.from({ length: 14 }, (_, j) =>
              div().flex_1().h(j < item.count ? (hot ? 8 : 5) : 2).bg(j < item.count ? color : t.border))));
      })))
      .child(v_flex().w(128).flex_none().gap(1)
        .child(tx(track('ACTIVE SECTOR'), 6, t.dim))
        .child(tx(sp?.name ?? '—', 11, t.foreground).font_weight(600).truncate())
        .child(tx((sp?.machine ?? 'LOCAL HOST').toUpperCase(), 6, t.dim)));
  }

  footer(t, sp, live, ps, base) {
    const counts = ['working', 'blocked', 'idle', 'done'].map((state) => ({
      state,
      count: live.filter((a) => a.status === state).length,
    }));
    return base().px(10).gap(8).justify_between().relative()
      .child(frame(t, { ticks: true }))
      .child(tx(sp?.machine ? 'LINK / ' + sp.machine : 'LINK / LOCAL', 9, t.accent).font_weight(500))
      .child(mono(`${ps.length} TERM  /  ${live.filter((a) => a.status === 'working').length} ACTIVE`, 8, t.dim))
      .children(counts.map((item) => {
        const color = item.state === 'working' ? t.working : item.state === 'blocked' ? t.blocked : item.count ? t.accent : t.dim;
        return h_flex().gap(4).items_center().flex_none()
          .child(tx(track(item.state), 6, t.dim))
          .child(mono(String(item.count).padStart(2, '0'), 10, color));
      }))
      .child(tx(sp?.name ?? '—', 9, t.foreground).truncate().flex_none().max_w(140))
      .child(div().h(1).flex_1().bg(t.input))
      .child(tx(track('LOCAL TIME'), 7, t.dim))
      .child(this.clockView);
  }

  nav(t, all, sp, live, ps) {
    const compact = this.navHeight < 620;
    const spaceLimit = compact ? 3 : 6;
    const agentLimit = compact ? 2 : 4;
    const pages = Math.max(1, Math.ceil(all.length / spaceLimit));
    const page = Math.min(this.navPage, pages - 1);
    const agentPages = Math.max(1, Math.ceil(live.length / agentLimit));
    const agentPage = Math.min(this.agentPage, agentPages - 1);
    const working = live.some((a) => a.status === 'working');
    const blocked = live.some((a) => a.status === 'blocked');
    const status = blocked ? 'INPUT' : working ? 'PROCESSING' : 'STANDBY';
    const statusColor = blocked ? t.blocked : working ? t.working : t.accent;
    const filesOpen = !findNode(layout(), 'panel')?.hidden;
    return v_flex().id('gmunk-nav').size_full().min_h(0).overflow_hidden().font_family(UI)
      .pt(26).px(8).gap(compact ? 5 : 7).relative()
      .on_size_change((size, cx) => { if (Math.abs(this.navHeight - size.height) > 1) { this.navHeight = size.height; cx.notify(); } })
      .child(dots(t.border))
      .child(frame(t, { gold: false, ticks: true, inset: true }))
      .child(h_flex().h(compact ? 44 : 54).flex_none().w_full().gap(8).items_center().relative()
        .child(svg('mods/gmunk-shell/mark.svg').size(compact ? 18 : 22).text_color(t.accent).flex_none())
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(h_flex().justify_between().items_end()
            .child(tx(track('ONLINE'), 13, t.accent).font_weight(600))
            .child(tx(status, 8, statusColor)))
          .child(h_flex().justify_between()
            .child(this.clockView)
            .child(tx(track('LOCAL TIME'), 6, t.dim)))))
      .child(sectionHead('SECTOR INDEX', String(all.length).padStart(2, '0'), t))
      .child(v_flex().gap(3).flex_none().children(all.slice(page * spaceLimit, (page + 1) * spaceLimit).map((s, i) =>
        v_flex().id('gmunk-space-' + s.id).w_full().h(compact ? 38 : 46).px(7).justify_center().gap(3)
          .relative().bg(s.active ? t.surface : 'transparent')
          .border_l(2).border_color(s.active ? t.working : t.border)
          .child(frame(t, { ticks: false }))
          .cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run('space.select', { id: s.id }))
          .child(h_flex().justify_between()
            .child(mono('S / ' + String(page * spaceLimit + i + 1).padStart(2, '0'), 8, s.active ? t.working : t.dim))
            .child(tx(s.status === 'working' ? 'ACTIVE' : s.status === 'blocked' ? 'INPUT' : 'READY', 7, s.status === 'working' ? t.working : t.dim)))
          .child(tx(s.name, 12, s.active ? t.foreground : t.muted).font_weight(500).truncate()))))
      .when(pages > 1, (el) => el.child(tx(`${page + 1}/${pages} NEXT →`, 8, t.accent).id('gmunk-spaces-next').cursor_pointer()
        .on_click((_e, cx) => { this.navPage = (page + 1) % pages; cx.notify(); })))
      .child(action('gmunk-space-add', '+ NEW SECTOR', 'New space', 'space.new', {}, t))
      .child(sectionHead('AGENT NETWORK', String(live.length).padStart(2, '0'), t))
      .child(v_flex().gap(3).flex_none().children(live.slice(agentPage * agentLimit, (agentPage + 1) * agentLimit).map((a) =>
        v_flex().id('gmunk-nav-agent-' + a.address).h(38).px(6).gap(3).justify_center().relative()
          .bg(a.focused ? t.surface : 'transparent')
          .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(a.title ?? a.address)
          .on_click(() => run('agent.focus', { terminal: a.address }))
          .child(h_flex().gap(6).items_center()
            .child(div().size(5).bg(a.status === 'working' ? t.working : a.status === 'blocked' ? t.blocked : t.dim))
            .child(tx(a.program?.name ?? 'Agent', 11, t.foreground).font_weight(500).flex_1().truncate())
            .child(tx(a.status, 7, a.status === 'working' ? t.working : t.dim)))
          .child(tx(a.title ?? a.address, 8, t.dim).truncate()))))
      .when(agentPages > 1, (el) => el.child(tx(`${agentPage + 1}/${agentPages} NEXT →`, 8, t.accent).id('gmunk-agents-next').cursor_pointer()
        .on_click((_e, cx) => { this.agentPage = (agentPage + 1) % agentPages; cx.notify(); })))
      .child(v_flex().flex_1().min_h(0).gap(6)
        .when(live.length === 0, (el) => el.child(v_flex().flex_1().min_h(72).relative().items_center().justify_center().gap(4)
          .child(dots(t.border))
          .child(lines([[[50, 12], [50, 88]], [[12, 50], [88, 50]], [[30, 30], [30, 34], [34, 34]], [[70, 30], [70, 34], [66, 34]], [[30, 70], [30, 66], [34, 66]], [[70, 70], [70, 66], [66, 66]]], t.input, 0.55))
          .child(frame(t, { ticks: true }))
          .child(tx(track('NO ACTIVE AGENTS'), 8, t.dim).font_weight(500))
          .child(tx(track('STANDBY'), 7, t.dim))))
        .when(!compact, (el) => el
          .child(sectionHead('LINK TOPOLOGY', sp?.machine ? 'REMOTE' : 'LOCAL', t))
          .child(div().w_full().h(96).flex_none().child(network(t, live)))
          .child(h_flex().justify_between()
            .child(tx(track('TERMINALS'), 7, t.dim)).child(mono(ps.length, 16, t.accent)))
          .child(h_flex().justify_between()
            .child(tx(track('PROCESSING'), 7, t.dim)).child(mono(live.filter((a) => a.status === 'working').length, 16, t.working)))))
      .child(h_flex().h(28).flex_none().w_full().gap(6).items_center()
        .child(v_flex().flex_1().gap(1)
          .child(tx(track('FILES'), 7, t.dim))
          .child(h_flex().id('gmunk-nav-files').gap(6).items_center().cursor_pointer()
            .on_click(() => run('layout.toggle', { id: 'panel' }))
            .child(tx('OFF', 9, filesOpen ? t.dim : t.foreground).font_weight(filesOpen ? 400 : 600))
            .child(div().w(16).h(6).bg(filesOpen ? t.accent : t.border).relative()
              .child(div().absolute().top(0).size(6).bg(filesOpen ? t.accent : t.muted).left(filesOpen ? 10 : 0)))
            .child(tx('ON', 9, filesOpen ? t.accent : t.dim).font_weight(filesOpen ? 600 : 400))))
        .child(v_flex().flex_1().gap(1)
          .child(tx(track('COMMAND'), 7, t.dim))
          .child(h_flex().gap(6)
            .child(action('gmunk-nav-settings', 'CFG', 'Settings', 'app.settings', {}, t))
            .child(action('gmunk-collapse', 'STOW', 'Collapse navigation / Ctrl+Shift+B', 'layout.hide', { id: 'sidebar' }, t)))))
      .child(h_flex().h(22).flex_none().items_center().justify_between()
        .child(tx(sp?.machine ? 'REMOTE LINK' : 'LOCAL LINK', 8, t.muted))
        .child(tx(track('CONNECTED'), 7, t.accent)));
  }
}
