// Paper surfaces use the active palette, including its translucent colors.
// Herdr's presets use #rrggbbaa for borders: dropping alpha turns their
// faint black hairlines into opaque grey outlines on a light card.
function rgba(value) {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value ?? '');
  return match ? [...[0, 2, 4].map(i => parseInt(match[1].slice(i, i + 2), 16)),
    match[2] ? parseInt(match[2], 16) / 255 : 1] : null;
}
function mix(a, b, amount) {
  const x = rgba(a), y = rgba(b);
  if (!x || !y) return a;
  return '#' + x.slice(0, 3).map((v, i) => Math.round(v + (y[i] - v) * amount * y[3])
    .toString(16).padStart(2, '0')).join('');
}
export function cardMaterial(p) {
  const base = mix(p.inset ?? p.bg, p.bg, 1);
  const surface = rgba(base);
  const dark = surface && (surface[0] * .2126 + surface[1] * .7152 + surface[2] * .0722) < 128;
  const top = dark ? mix(base, p.text, .055) : base;
  const well = dark ? mix(top, p.inset, .8) : mix(top, p.track, .3);
  return {
    top,
    edge: mix(top, p.line, dark ? .65 : .3),
    well,
    wellEdge: mix(well, p.line, .25),
  };
}
