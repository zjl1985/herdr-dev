import { View, div, PathBuilder, Background } from 'gpui-kit';
import { theme } from 'herdr';

export const UI = 'Rajdhani';
export const MONO = 'Monaspace Krypton';

export const track = (s) =>
  String(s)
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((word) => word.split('').join(' '))
    .join('   ');

export function tx(s, n, c, family = UI) {
  return div().text_size(n).text_color(c).font_family(family).line_height(1).child(String(s));
}
export const mono = (s, n, c) => tx(s, n, c, MONO);

export const clock = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};

export class Clock extends View {
  init(p, cx) {
    this.now = clock();
    this.size = p?.size ?? 11;
    this.tone = p?.tone ?? 'muted';
    cx.timer.every(1000, (cx) => {
      const next = clock();
      if (next !== this.now) {
        this.now = next;
        cx.notify();
      }
    });
  }

  update(p) {
    if (p?.size != null) this.size = p.size;
    if (p?.tone) this.tone = p.tone;
  }

  render() {
    const t = theme();
    return mono(this.now, this.size, t[this.tone] ?? t.muted);
  }
}


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

export function rule(t, gold = false) {
  const ink = gold ? t.ansi3 : t.input;
  return lines(
    [
      [[0, 50], [100, 50]],
      [[0, 20], [0, 80]],
      [[100, 20], [100, 80]],
      [[12, 15], [12, 85]],
      [[88, 15], [88, 85]],
    ],
    ink,
    0.6,
  );
}

export function bezel(t, side) {
  const left = side === 'left';
  const x = left ? 100 : 0;
  const dir = left ? -1 : 1;
  const marks = [[[x, 0], [x, 100]]];
  for (let i = 0, y = 3; y <= 97; y += 2.4, i++) {
    const long = i % 5 === 0;
    marks.push([[x, y], [x + dir * (long ? 72 : 38), y]]);
  }
  marks.push(
    [[left ? 0 : 100, 0], [left ? 18 : 82, 0], [left ? 18 : 82, 2]],
    [[left ? 0 : 100, 100], [left ? 18 : 82, 100], [left ? 18 : 82, 98]],
  );
  return div().relative().size_full()
    .child(dots(t.border))
    .child(lines(marks, t.ansi3, 0.65));
}

export function network(t, agents) {
  const rows = Math.max(1, Math.min(agents.length, 4));
  const wire = [[[50, 6], [50, 18]], [[12, 18], [88, 18]], [[8, 90], [92, 90]], [[50, 76], [50, 90]]];
  const marks = [];
  const lit = [];
  for (let i = 0; i < rows; i++) {
    const x = rows === 1 ? 50 : 18 + (i * 64) / (rows - 1);
    wire.push([[x, 18], [x, 44]], [[x, 58], [50, 76]]);
    marks.push([[x - 7, 44], [x + 7, 44], [x + 7, 58], [x - 7, 58], [x - 7, 44]]);
    if (agents[i]?.status === 'working') lit.push([[x - 3, 51], [x + 3, 51]], [[x, 48], [x, 54]]);
    else marks.push([[x - 2, 51], [x + 2, 51]]);
  }
  for (const [x, y] of [[50, 6], [50, 76], [8, 90], [92, 90]]) {
    marks.push([[x - 1.4, y - 1.4], [x + 1.4, y - 1.4], [x + 1.4, y + 1.4], [x - 1.4, y + 1.4], [x - 1.4, y - 1.4]]);
  }
  for (let i = 0; i < 21; i++) wire.push([[6 + i * 4.4, 94], [6 + i * 4.4, 97 + (i % 3 === 0 ? 2.2 : 0)]]);
  return div().relative().w_full().h_full()
    .child(dots(t.border))
    .child(lines(wire, t.input, 0.5))
    .child(lines(marks, t.accent, 0.7))
    .child(lines(lit, t.working, 1.5));
}

export function bus(t) {
  const paths = [];
  const points = [];
  for (let j = 0; j < 4; j++) {
    const y = 18 + j * 20;
    paths.push([[0, y], [10 + j * 4, y], [18 + j * 4, y + 12], [58 - j * 3, y + 12], [68 - j * 3, y], [100, y]]);
    for (const x of [8, 36, 62, 88]) points.push([[x, y - 1.4], [x + 0.6, y + 1.4]]);
  }
  return div().relative().w_full().h(28)
    .child(lines(paths, t.input, 0.5))
    .child(lines(points, t.accent, 1.15));
}
