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
function luma(c) {
  return c ? c[0] * .2126 + c[1] * .7152 + c[2] * .0722 : 0;
}
function alpha(hex, aa) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  return (hex.length >= 7 ? hex.slice(0, 7) : hex) + aa;
}
export function cardMaterial(p, { glass = false } = {}) {
  const insetRgba = rgba(p.inset);
  const solidInset = insetRgba && insetRgba[3] > 0.05 ? p.inset : null;
  const base = mix(solidInset ?? p.bg, p.bg, 1);
  const surface = rgba(base);
  const chrome = rgba(p.chrome ?? solidInset ?? p.bg);
  const dark = surface && luma(surface) < 128;
  // Preserve the sculpted lift & well depth when surface sits on chrome
  // (e.g. claude-dark), and only trim excess lift when a theme already
  // separates surface strongly from chrome (e.g. #1c1c1e on #111111).
  const chromeGap = surface && chrome ? Math.abs(luma(surface) - luma(chrome)) : 0;
  const highContrastSurface = chromeGap >= 6;
  const top = dark ? mix(base, p.text, highContrastSurface ? .028 : .055) : base;
  const darkWellTarget = solidInset ?? mix(top, '#000000', .45);
  const well = dark ? mix(top, darkWellTarget, highContrastSurface ? .62 : .8) : mix(top, p.track, .3);
  const wellRgb = rgba(well);
  const idleRgb = rgba(p.idle);
  const idleText = wellRgb && idleRgb && Math.abs(luma(idleRgb) - luma(wellRgb)) < 85
    ? (p.muted ?? p.idle)
    : (p.idle ?? p.muted);
  const edge = mix(top, p.line, dark ? .65 : .3);
  const wellEdge = mix(well, p.line, .25);
  if (glass) {
    // Milky frosted sheen + luminous specular rim over balanced translucent root
    // chrome (~55% effective dark / ~66% light) so cards read as crisp frosted glass.
    const frostFace = dark ? mix(top, p.text, .12) : mix(top, '#ffffff', .35);
    return {
      top: alpha(frostFace, dark ? '4c' : '64'),
      edge: dark ? alpha(p.text, '28') : alpha('#ffffff', '88'),
      well: alpha(well, dark ? '58' : '44'),
      wellEdge: dark ? alpha(p.text, '18') : alpha(p.line, '55'),
      idleText,
    };
  }
  return {
    top,
    edge,
    well,
    wellEdge,
    idleText,
  };
}
