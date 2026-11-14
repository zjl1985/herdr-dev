import { div, svg } from 'gpui-kit';
import { layout } from 'herdr';

export const UI = 'Host Grotesk';
export const MONO = 'Geist Mono';
export const ICON = (name) => 'mods/paper-shell/icons/' + name + '.svg';

/** Body text in Host Grotesk. */
export const tx = (s, n, c) =>
  div().text_size(n).text_color(c).font_family(UI).line_height(1.25).child(String(s ?? ''));
/** Sentence-case label, weight 500 — the official widget-title voice. */
export const cap = (s, c, n = 13) =>
  div().text_size(n).text_color(c).font_family(UI).line_height(1.2).font_weight(500)
    .child(String(s ?? ''));
/** Small grey caption. The official look has no mono in the chrome. */
export const mono = (s, n, c) =>
  div().text_size(n).text_color(c).font_family(UI).line_height(1.25).child(String(s ?? ''));
/** Display numerals: weight 500, tight line. */
export const numeral = (s, n, c) =>
  div().text_size(n).text_color(c).font_family(UI).font_weight(500).line_height(1).child(String(s ?? ''));
export const icon = (name, n, c) => svg(ICON(name)).size(n).flex_none().text_color(c);

export const statusColor = (t, status) =>
  status === 'working' ? t.working : status === 'blocked' ? t.blocked : status === 'done' ? t.done : t.idle;

/** A status dot; working ones breathe natively (no timer). */
export function dot(t, status, n = 6) {
  return div().size(n).rounded(n).flex_none().bg(statusColor(t, status))
    .when(status === 'working', (el) => el.loop('opacity', { from: 0.35, to: 1, period: 1600 }));
}

export const findNode = (n, id) =>
  n?.id === id ? n : (n?.children ?? []).map((c) => findNode(c, id)).find(Boolean);
export const shown = (id) => {
  const n = findNode(layout(), id);
  return Boolean(n) && !n.hidden;
};
