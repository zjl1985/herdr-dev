// Zero UI kit — shared visual primitives for Zero mods, styled only through
// zero-theme.js (live theme()) and zero-tokens.js. Stamped into each
// consuming mod by tools/stamp-zero-ui.mjs.
import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checking, layout, run, setShared, shared } from "herdr";
import { T, UI, MONO } from "./zero-tokens.js";
import { palette } from "./zero-theme.js";

export const PANEL_CLOSE_KEY = "zero.panel.closing";
export const PANEL_OPEN_KEY = "zero.panel.openSeq";
export const PANEL_CLOSE_MS = 230;
export const GLASS_KEY = "zero.glass";

function findLayoutNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findLayoutNode(child, id);
    if (found) return found;
  }
  return null;
}

/** True when frosted-glass UI mode is active across Zero mods. */
export function glassOn() {
  const s = shared(GLASS_KEY);
  if (typeof s === "boolean") return s;
  try {
    const stored = localStorage.getItem(GLASS_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {}
  return Boolean(layout()?.window_blur);
}

/** Return `color` with alpha `alphaHex` when glass is active, else unchanged. */
export function glassBg(color, alphaHex, enabled = glassOn()) {
  if (!enabled || typeof color !== "string" || !color.startsWith("#")) return color;
  const rgb = color.length >= 7 ? color.slice(0, 7) : color;
  return `${rgb}${alphaHex}`;
}

function isDarkHex(hex) {
  const m = /^#([0-9a-f]{6})/i.exec(hex ?? "");
  if (!m) return true;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) < 128;
}

/** Toggle frosted-glass mode across the live layout tree and shared mod state. */
export function setGlassMode(enabled, themeColors) {
  const on = Boolean(enabled);
  try { localStorage.setItem(GLASS_KEY, on ? "1" : "0"); } catch {}
  setShared(GLASS_KEY, on);
  if (checking()) return;
  const current = layout();
  if (!current || typeof current !== "object") return;
  const next = JSON.parse(JSON.stringify(current));
  const chromeBase = themeColors?.chrome ?? themeColors?.surface ?? "#18181b";
  const surfaceBase = themeColors?.surface ?? themeColors?.chrome ?? "#18181b";
  const fgBase = themeColors?.foreground ?? "#ffffff";
  const dark = isDarkHex(surfaceBase);
  // Balanced frosted backdrop (~36% dark / ~43% light): softens bright
  // wallpaper behind gaps while letting macOS blur breathe cleanly.
  const chromeTint = glassBg(chromeBase, dark ? "5c" : "6e", true);
  // Pane tint (~41% dark / ~48% light) over root chrome yields ~62-70% frosted
  // terminal: steady readability with a soft ambient glow.
  const paneTint = glassBg(surfaceBase, dark ? "68" : "7a", true);
  const paneBorder = glassBg(fgBase, dark ? "22" : "18", true);
  const paneFocus = glassBg(fgBase, dark ? "38" : "2e", true);
  const sidebar = findLayoutNode(next, "sidebar");
  const main = findLayoutNode(next, "main");
  if (on) {
    next.window_blur = true;
    next.background = chromeTint;
    next.terminal_opacity = 0;
    // Herdr requires theme `canvas` and `background` to be transparent so
    // macOS window_blur shows through the window backdrop. Keep `popover`
    // opaque so floating drawers/menus over terminal text never bleed through.
    const nextColors = { ...(next.colors ?? {}) };
    nextColors.canvas = "#00000000";
    nextColors.background = "#00000000";
    delete nextColors.popover;
    next.colors = nextColors;
    if (sidebar) sidebar.background = "#00000000";
    if (main?.content?.pane) {
      main.content.pane.background = paneTint;
      if (main.content.pane.border) main.content.pane.border.color = paneBorder;
      if (main.content.pane.focus) main.content.pane.focus.color = paneFocus;
      delete main.content.pane.shadow;
    }
  } else {
    next.window_blur = false;
    next.background = "chrome";
    next.terminal_opacity = 0;
    if (next.colors && typeof next.colors === "object") {
      delete next.colors.canvas;
      delete next.colors.background;
      delete next.colors.popover;
      if (Object.keys(next.colors).length === 0) delete next.colors;
    }
    if (sidebar) sidebar.background = "chrome";
    if (main?.content?.pane) {
      main.content.pane.background = "background";
      if (main.content.pane.border) main.content.pane.border.color = "border";
      if (main.content.pane.focus) main.content.pane.focus.color = "input";
      main.content.pane.shadow = "sm";
    }
  }
  run("layout.set", { layout: next });
}

/** Keep layout glass tint synced after theme switches without touching solid mode. */
export function syncGlassLayout(themeColors) {
  if (checking() || !glassOn()) return false;
  const current = layout();
  if (!current || typeof current !== "object") return false;
  const chromeBase = themeColors?.chrome ?? themeColors?.surface ?? "#18181b";
  const surfaceBase = themeColors?.surface ?? themeColors?.chrome ?? "#18181b";
  const fgBase = themeColors?.foreground ?? "#ffffff";
  const dark = isDarkHex(surfaceBase);
  const wantBg = glassBg(chromeBase, dark ? "5c" : "6e", true);
  const wantPaneBg = glassBg(surfaceBase, dark ? "68" : "7a", true);
  const wantBorder = glassBg(fgBase, dark ? "22" : "18", true);
  const wantFocus = glassBg(fgBase, dark ? "38" : "2e", true);
  const main = findLayoutNode(current, "main");
  const needsUpdate =
    !current.window_blur ||
    current.background !== wantBg ||
    (current.terminal_opacity ?? 0) !== 0 ||
    current.colors?.canvas !== "#00000000" ||
    current.colors?.background !== "#00000000" ||
    Boolean(current.colors?.popover) ||
    main?.content?.pane?.background !== wantPaneBg ||
    main?.content?.pane?.border?.color !== wantBorder ||
    main?.content?.pane?.focus?.color !== wantFocus ||
    Boolean(main?.content?.pane?.shadow);
  if (!needsUpdate) return false;
  setGlassMode(true, themeColors);
  return true;
}

/** True while a docked panel is playing its damped close glide before layout.hide. */
export function panelClosing(panelId) {
  return Boolean(shared(PANEL_CLOSE_KEY)?.[panelId]);
}

/** Play damped spring glide-out, then hide the layout node. */
export function closePanelSmooth(panelId, cx) {
  if (!motionOn() || !cx?.timer?.after) {
    run("layout.hide", { id: panelId });
    return;
  }
  const prev = shared(PANEL_CLOSE_KEY) ?? {};
  if (prev[panelId]) return;
  setShared(PANEL_CLOSE_KEY, { ...prev, [panelId]: Date.now() });
  cx.timer.after(PANEL_CLOSE_MS, () => {
    run("layout.hide", { id: panelId });
    const cur = shared(PANEL_CLOSE_KEY) ?? {};
    if (cur[panelId]) {
      const next = { ...cur };
      delete next[panelId];
      setShared(PANEL_CLOSE_KEY, next);
    }
  });
}

/** Show a layout panel (and optional stack tab), bumping openSeq so spring entry always plays. */
export function openPanelSmooth(panelId, stackTab = null) {
  const cur = shared(PANEL_CLOSE_KEY) ?? {};
  if (cur[panelId]) {
    const next = { ...cur };
    delete next[panelId];
    setShared(PANEL_CLOSE_KEY, next);
  }
  const seqs = shared(PANEL_OPEN_KEY) ?? {};
  setShared(PANEL_OPEN_KEY, { ...seqs, [panelId]: Date.now(), ...(stackTab ? { [stackTab]: Date.now() } : {}) });
  if (stackTab) run("layout.select", { stack: "panel-body", child: stackTab });
  run("layout.show", { id: panelId });
}

/** Track panel mount / reopen / tab-switch so spring entry reliably triggers even when hidden views stop rendering. */
export function trackPanelReveal(view, panelId, visibleNow, cx, tabKey = null) {
  const now = Date.now();
  const closing = panelClosing(panelId);
  if (!motionOn() || !cx?.timer?.after) {
    view._panelSettled = true;
    view._panelWasHidden = !visibleNow;
    view._panelWasClosing = closing;
    view._panelLastRender = now;
    return true;
  }
  if (!visibleNow) {
    view._panelWasHidden = true;
    view._panelSettled = false;
    return false;
  }
  const seqs = shared(PANEL_OPEN_KEY) ?? {};
  const seq = `${seqs[panelId] ?? 0}:${tabKey ? (seqs[tabKey] ?? 0) : 0}`;
  const seqChanged = view._panelOpenSeq !== undefined && seq !== view._panelOpenSeq;
  const reopenedFromClose = Boolean(view._panelWasClosing && !closing);
  const firstMount = view._panelSettled === undefined;
  const unhidden = Boolean(view._panelWasHidden);

  view._panelOpenSeq = seq;
  view._panelWasClosing = closing;
  view._panelLastRender = now;

  if (!closing && (firstMount || unhidden || seqChanged || reopenedFromClose)) {
    view._panelWasHidden = false;
    view._panelSettled = false;
    if (view._panelRevealTimer) try { view._panelRevealTimer.cancel(); } catch {}
    view._panelRevealTimer = cx.timer.after(20, (cx) => {
      view._panelSettled = true;
      cx.notify();
    });
  }
  return Boolean(view._panelSettled);
}

/** Wrap a docked panel in a clipped frame and apply damped GPUI spring slide + fade. */
export function panelMotion(el, { settled = true, closing = false, distance = 56 } = {}) {
  if (!motionOn()) return el;
  const shown = settled && !closing;
  const animated = el
    .relative()
    .left(shown ? 0 : closing ? distance : distance)
    .opacity(shown ? 1 : 0)
    .spring("left", closing ? { response: 250, damping: 0.92 } : { response: 360, damping: 0.72 })
    .transition("opacity", { duration: closing ? 190 : 220, easing: closing ? "ease-in" : "ease-out" });
  return div().size_full().min_h(0).overflow_hidden().child(animated);
}

/** H04: local reduced-motion switch (no system-preference API exists in the
 *  shell). "1" stops every looping animation; dots and bars keep their
 *  outlines so states stay readable. */
export function motionOn() {
  try { return localStorage.getItem("zero.reducedMotion") !== "1"; } catch { return true; }
}

/** "#rrggbb" + two hex digits of alpha; passes through anything else. */
export function withAlpha(color, alphaHex) {
  if (typeof color !== "string" || !color.startsWith("#")) return color;
  if (color.length === 7) return `${color}${alphaHex}`;
  if (color.length === 9) {
    const orig = parseInt(color.slice(7, 9), 16) / 255;
    const scale = parseInt(alphaHex, 16) / 255;
    const next = Math.round(Math.max(0, Math.min(255, orig * scale * 255)))
      .toString(16)
      .padStart(2, "0");
    return `${color.slice(0, 7)}${next}`;
  }
  return color;
}

/** Plain text. Strings only; numbers are coerced, null/undefined render as "". */
export function text(value, size = T.type.body, color) {
  const p = palette();
  return div()
    .text_size(size)
    .text_color(color ?? p.text)
    .font_family(UI)
    .child(String(value ?? ""));
}

/** Monospace text for paths, shortcuts, technical ids and metric numbers. */
export function mono(value, size = T.type.body, color) {
  return text(value, size, color).font_family(MONO);
}

/** Group label: 11px/500. Group titles never drop below the ladder. */
export function label(value, color) {
  const p = palette();
  return text(value, T.type.label, color ?? p.dim).font_weight(500);
}

/** Auxiliary text: 10.5px. */
export function hint(value, color) {
  const p = palette();
  return text(value, T.type.hint, color ?? p.muted);
}

/** A status dot; `pulse` breathes natively (no JS timer). */
export function statusDot(color, pulse = false, size = 6) {
  const p = palette();
  return div()
    .size(size)
    .flex_none()
    .rounded_full()
    .bg(color ?? p.idle)
    .when(pulse && motionOn(), (el) => el.loop("opacity", { from: 0.35, to: 1, period: T.duration.breath }));
}

/** Program icon from the app's program table; tinted glyphs take the color. */
export function programIcon(program, size, color) {
  if (!program?.icon) return null;
  if (program.tint) return svg(program.icon).size(size).flex_none().text_color(color);
  // Clip 1px off the right edge so SVG filter-mask icons don't show a seam on translucent surfaces.
  return div()
    .w(Math.max(1, size - 1))
    .h(size)
    .flex_none()
    .overflow_hidden()
    .child(image(program.icon).w(size).h(size).flex_none());
}

/** Zero's own icon (mods/zero-ui/icons/<name>.svg). */
export function icon(name, size = T.icon.default, color) {
  const p = palette();
  return svg(`mods/zero-ui/icons/${name}.svg`)
    .size(size)
    .flex_none()
    .text_color(color ?? p.muted);
}

/** Icon button: 24x24 hit area, 6px radius, hover/disabled states.
 *  `opts`: { danger, disabled, size, tip }. Disabled buttons render dimmed and
 *  never fire. */
export function iconButton(id, name, tip, onClick, opts = {}) {
  const p = palette();
  const { danger = false, disabled = false, size = T.hit.button } = opts;
  const base = div()
    .id(id)
    .size(size)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(T.radius.control)
    .text_color(disabled ? p.dim : danger ? p.blocked : p.dim);
  if (disabled) {
    return base.when(Boolean(tip), (el) => el.tooltip(tip)).child(icon(name, T.icon.default, p.dim));
  }
  return base
    .cursor_pointer()
    .hover((s) =>
      s.bg(danger ? withAlpha(p.blocked, "1f") : p.hover).text_color(danger ? p.blocked : p.text)
    )
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .when(Boolean(onClick), (el) => el.on_click(onClick))
    .child(icon(name, T.icon.default, undefined));
}

/** Section: border-t divider, label row, then content children.
 *  `right` renders a small element aligned right in the header. */
export function section(id, name, right = null) {
  const p = palette();
  return v_flex()
    .id(id)
    .w_full()
    .gap(T.space.inGroup)
    .pt(T.space.group)
    .border_t(1)
    .border_color(p.line)
    .child(
      h_flex()
        .w_full()
        .items_center()
        .justify_between()
        .child(label(name))
        .when(Boolean(right), (el) => el.child(right))
    );
}

/** A menu row (28px min) for popups and pickers. `selected` marks the current
 *  value; `highlighted` is the keyboard cursor; disabled rows never fire. */
export function menuRow(id, { selected = false, highlighted = false, disabled = false } = {}, ...children) {
  const p = palette();
  let row = h_flex()
    .id(id)
    .min_h(T.hit.menuRow)
    .w_full()
    .px(8)
    .py(5)
    .rounded(T.radius.control)
    .items_center()
    .gap(9)
    .text_color(disabled ? p.dim : selected || highlighted ? p.text : p.muted);
  if (!disabled) {
    row = row
      .cursor_pointer()
      .hover((s) => s.bg(p.hover))
      .when(highlighted, (el) => el.bg(p.hover))
      .when(selected && !highlighted, (el) => el.bg(p.selected));
  }
  return row.children(children);
}
