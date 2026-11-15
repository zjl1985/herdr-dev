// A gently raised surface derived exclusively from the active palette.
// Keep shadows outside the card and leave padding in the scroll container.
function rgb(value) {
  const match = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value ?? '');
  return match ? [0, 2, 4].map(i => parseInt(match[1].slice(i, i + 2), 16)) : null;
}
function mix(a, b, amount) {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}
export function cardMaterial(p) {
  const surface = rgb(p.bg);
  const dark = surface && (surface[0] * .2126 + surface[1] * .7152 + surface[2] * .0722) < 128;
  return {
    top: dark ? mix(p.bg, p.text, .055) : p.bg,
    edge: dark ? mix(p.line, p.text, .10) : mix(p.bg, p.line, .45),
  };
}
