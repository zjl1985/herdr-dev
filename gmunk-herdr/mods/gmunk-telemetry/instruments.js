import { View, div, svg, PathBuilder, Background } from 'gpui-kit';
import { agents, theme } from 'herdr';
import { h_flex, v_flex } from 'gpui-base';

export const UI = 'Rajdhani';
export const MONO = 'Monaspace Krypton';
export const track = (s) =>
  String(s).toUpperCase().trim().split(/\s+/).map((word) => word.split('').join(' ')).join('   ');
export const tx = (s, n, c, family = UI) =>
  div().text_size(n).text_color(c).font_family(family).line_height(1).child(String(s));
export const mono = (s, n, c) => tx(s, n, c, MONO);
export const clamp = (n) => Math.max(0, Math.min(100, n));

export function lines(sets, color, width = 0.55, dash = null) {
  const path = PathBuilder.stroke(width);
  if (dash) path.dash_array(dash);
  for (const pts of sets) {
    pts.forEach(([x, y], i) => {
      const X = typeof x === 'string' ? x : `${x}%`;
      const Y = typeof y === 'string' ? y : `${y}%`;
      path[i ? 'line_to' : 'move_to'](X, Y);
    });
  }
  return window.paint_path(path.build(), color).absolute().inset_0().size_full();
}

export function hatch(color, width = 1.3, interval = 5, opacity = 0.42) {
  const path = PathBuilder.fill();
  path.add_polygon([['0%', '0%'], ['100%', '0%'], ['100%', '100%'], ['0%', '100%']], true);
  return window
    .paint_path(path.build(), Background.pattern_slash(color, width, interval).opacity(opacity))
    .absolute()
    .inset_0()
    .size_full();
}

export function dots(color) {
  const marks = [];
  for (let x = 6; x < 100; x += 8)
    for (let y = 6; y < 100; y += 8) marks.push([[x, y], [x + 0.2, y]]);
  return lines(marks, color, 0.55);
}

export function frame(t, { gold = false, ticks = true, inset = false } = {}) {
  const ink = gold ? t.ansi3 : t.input;
  const rails = [
    [[0, 10], [0, 0], [12, 0]],
    [[88, 0], [100, 0], [100, 10]],
    [[0, 90], [0, 100], [12, 100]],
    [[88, 100], [100, 100], [100, 90]],
  ];
  if (inset) {
    rails.push(
      [[2.2, 8], [2.2, 2.2], [8, 2.2]],
      [[92, 2.2], [97.8, 2.2], [97.8, 8]],
      [[2.2, 92], [2.2, 97.8], [8, 97.8]],
      [[92, 97.8], [97.8, 97.8], [97.8, 92]],
    );
  }
  const marks = [];
  if (ticks) {
    for (let x = 16; x <= 84; x += 7) {
      const long = x % 14 < 1;
      marks.push([[x, 0], [x, long ? 3.6 : 1.7]], [[x, 100], [x, 100 - (long ? 3.6 : 1.7)]]);
    }
    for (let y = 16; y <= 84; y += 7) {
      const long = y % 14 < 1;
      marks.push([[0, y], [long ? 3.6 : 1.7, y]], [[100, y], [100 - (long ? 3.6 : 1.7), y]]);
    }
  }
  return div().absolute().inset_0().size_full()
    .child(lines(rails, ink, 0.9))
    .child(lines(marks, gold ? t.ansi3 : t.dim, 0.5));
}

// Native vector geometry, normalized to a 320 × 180 drawing surface.
// Colors always come from the selected theme, including every decorative mark.
export function strokes(sets, color, width = 0.65, box = null) {
  const path = PathBuilder.stroke(width);
  for (const points of sets) {
    path.add_polygon(points.map(([x, y]) => {
      if (box) {
        const scale = Math.min(box.width / 320, box.height / 180);
        x = ((x - 160) * scale + box.width / 2) / box.width * 320;
        y = ((y - 90) * scale + box.height / 2) / box.height * 180;
      }
      return [`${x / 3.2}%`, `${y / 1.8}%`];
    }), false);
  }
  return window.paint_path(path.build(), color).absolute().inset_0().size_full();
}

export function arc(x, y, r, start, end, steps = 48, sy = 1) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (start + (end - start) * i / steps) * Math.PI / 180;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r * sy];
  });
}

// Layered activity diagram: an abstract double helix and triangulated network.
// Its motion is decorative state feedback; only the labelled % is a measured value.
export function core(t, working, percent, phase = 0) {
  const frameNo = working ? Math.floor(phase) % 24 : 0;
  const asset = (name, color, animated = false) =>
    svg('mods/gmunk-telemetry/art/' + name + (animated ? '-' + frameNo : '') + '.svg')
      .absolute().inset_0().size_full().text_color(color);
  return div().relative().w_full().h_full().overflow_hidden()
    .tooltip('Abstract activity topology; animation follows agent state. CTX is measured context usage.')
    .child(dots(t.border))
    .child(asset('grid', t.border))
    .child(asset('frame', t.input))
    .child(asset('mesh', t.dim, true))
    .child(asset('light', t.accent, true))
    .child(asset('points', t.foreground, true))
    .child(asset('hot', working ? t.working : t.dim, true))
    .child(frame(t, { gold: true, ticks: true, inset: true }))
    .child(tx(track('SESSION / ACTIVITY TOPOLOGY'), 7, t.muted).absolute().left(8).top(4).font_weight(500))
    .child(mono(percent == null ? 'CTX —' : 'CTX ' + percent + '%', 8, t.accent).absolute().right(8).top(16))
    .child(tx(working ? 'PROCESSING' : 'STANDBY', 7, working ? t.working : t.dim).absolute().right(8).bottom(4));
}

export class ActivityCore extends View {
  init(p, cx) {
    this.working = Boolean(p?.working);
    this.percent = p?.percent ?? null;
    this.phase = 0;
    cx.timer.every(180, (cx) => {
      const working = agents().find((a) => a.focused)?.status === 'working' || this.working;
      if (working) {
        this.phase = (this.phase + 1) % 24;
        cx.notify();
      }
    });
  }

  update(p) {
    if (!p) return;
    this.working = Boolean(p.working);
    this.percent = p.percent ?? null;
  }

  render() {
    const working = agents().find((a) => a.focused)?.status === 'working' || this.working;
    return core(theme(), working, this.percent, this.phase);
  }
}


export function tower(t, name, value, suffix, color, compact) {
  const ticks = [];
  const bars = [];
  const active = [];
  const accents = [];
  for (let i = 0; i < 30; i++) {
    const y = 169 - i * 5.1;
    ticks.push([[16, y], [i % 5 === 0 ? 32 : 24, y]], [[288, y], [i % 5 === 0 ? 304 : 296, y]]);
    for (let j = 0; j < 5; j++) {
      const x = 74 + j * 30;
      const segment = [[x, y], [x + 24, y]];
      (value != null && (i + 0.5) / 30 * 100 <= clamp(value) ? active : bars).push(segment);
    }
  }
  accents.push(
    [[48, 14], [48, 4], [92, 4]],
    [[228, 4], [272, 4], [272, 14]],
    [[48, 164], [48, 176], [92, 176]],
    [[228, 176], [272, 176], [272, 164]],
  );
  const indicator = value == null ? null : 169 - clamp(value) * 1.53;
  if (indicator != null) accents.push([[274, indicator - 4], [282, indicator], [274, indicator + 4]]);
  return v_flex().flex_1().min_w(0).gap(2).relative()
    .child(h_flex().w_full().justify_between().items_end()
      .child(tx(track(name), 7, t.muted).font_weight(500))
      .child(mono(value == null ? '—' : value + '%', 22, value == null ? t.dim : color)))
    .child(div().relative().w_full().h(compact ? 56 : 80).flex_none()
      .child(strokes(ticks, t.dim, 0.45))
      .child(strokes(bars, t.border, 1.15))
      .child(strokes(active, color, 1.15))
      .child(strokes(accents, t.ansi3, 0.6))
      .child(frame(t, { gold: true, ticks: false })))
    .child(h_flex().justify_between()
      .child(tx(suffix, 7, t.dim))
      .child(tx(value == null ? 'NO DATA' : '0 ─ 100', 6, t.dim)));
}

export function history(t, samples, height) {
  const grid = [];
  for (let y = 16; y <= 164; y += 28) grid.push([[0, y], [320, y]]);
  for (let x = 0; x <= 320; x += 32) grid.push([[x, 12], [x, 168]]);
  const values = [];
  let segment = [];
  samples.forEach((s, i) => {
    if (s.value == null) {
      if (segment.length > 1) values.push(segment);
      segment = [];
      return;
    }
    segment.push([320 - (samples.length - 1 - i) * 320 / 59, 160 - clamp(s.value) * 1.4]);
  });
  if (segment.length > 1) values.push(segment);
  return div().relative().w_full().h(height).flex_none()
    .child(strokes(grid, t.border, 0.3))
    .child(frame(t, { gold: true, ticks: true }))
    .when(values.length > 0, (el) => el.child(strokes(values, t.accent, 1.3)))
    .when(values.length === 0, (el) => el.child(tx(track('ACQUIRING SAMPLES'), 7, t.dim).absolute().left(8).top(10)));
}

// Circular instrument. The arc is a measured percent, or an empty calibrated ring.
export function ring(t, value, label, color) {
  const cx = 50, cy = 52, r = 34;
  const ticks = [];
  for (let i = 0; i < 36; i++) {
    const a = (i * 10 - 90) * Math.PI / 180;
    const inner = r - (i % 9 === 0 ? 7 : 3.2);
    ticks.push([
      [cx + Math.cos(a) * inner, cy + Math.sin(a) * inner],
      [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
    ]);
  }
  const rings = [arc(cx, cy, r - 10, 0, 360, 60), arc(cx, cy, 8, 0, 360, 32)];
  const sweep = value == null ? [] : [arc(cx, cy, r - 16, -90, -90 + clamp(value) * 3.6, Math.max(8, Math.round(clamp(value) / 3)))];
  return v_flex().flex_none().w(84).gap(2)
    .child(tx(track(label), 7, t.dim).font_weight(500))
    .child(div().relative().w(84).h(84)
      .child(lines(ticks, t.dim, 0.55))
      .child(lines(rings, t.input, 0.6))
      .child(lines(sweep, color, 1.6))
      .child(frame(t, { gold: true, ticks: false }))
      .child(h_flex().absolute().inset_0().items_center().justify_center()
        .child(mono(value == null ? '—' : value + '%', 16, value == null ? t.dim : color))))
    .child(tx(value == null ? 'NO DATA' : '0 ─ 100', 6, t.dim));
}

export function section(t, a, b) {
  return h_flex().w_full().h(20).flex_none().items_center().justify_between().relative()
    .child(lines([[[0, 50], [100, 50]], [[0, 10], [0, 90]], [[100, 10], [100, 90]]], t.input, 0.55))
    .child(h_flex().gap(4).items_center().child(div().size(3).bg(t.working)).child(tx(track(a), 7, t.accent).font_weight(500)))
    .child(tx(b, 6, t.dim));
}
