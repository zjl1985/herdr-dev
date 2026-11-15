// Zero UI theme mapping — the ONLY place components ask for colors.
// Every value resolves from the live theme() each time it is called, so a
// theme switch (app.theme) restyles the layout with no cached colors.
// A missing semantic field falls back to another semantic field of the same
// theme — never to a hardcoded warm or cool value. This file is stamped into
// each consuming mod by tools/stamp-zero-ui.mjs.
import { theme } from "herdr";

/** Resolve `key`, then its fallback chain, from the current theme. */
function pick(t, ...keys) {
  for (const key of keys) {
    const value = t[key];
    if (typeof value === "string" && value) return value;
  }
  return "#888888"; // unreachable in practice: themes define foreground
}

/** The component-level palette. Reads theme() fresh on every call. */
export function palette() {
  const t = theme();
  return {
    // Surfaces
    bg: pick(t, "surface", "chrome", "background"),
    inset: pick(t, "canvas", "background"),
    chrome: pick(t, "chrome", "surface", "background"),
    popover: pick(t, "popover", "raised", "surface"),
    raised: pick(t, "raised", "popover", "surface"),
    // Lines & fields
    line: pick(t, "border", "input"),
    track: pick(t, "input", "border"),
    // Text
    text: pick(t, "foreground"),
    muted: pick(t, "muted", "dim", "foreground"),
    dim: pick(t, "dim", "muted", "foreground"),
    // Identity & focus
    accent: pick(t, "accent", "foreground"),
    onAccent: pick(t, "accent_foreground", "background", "foreground"),
    ring: pick(t, "ring", "accent", "foreground"),
    // Status (semantic status fields first, ANSI only as last resort)
    working: pick(t, "working", "accent", "foreground"),
    blocked: pick(t, "blocked", "ansi1", "foreground"),
    done: pick(t, "done", "ansi2", "foreground"),
    idle: pick(t, "idle", "dim", "muted"),
    unknown: pick(t, "unknown", "dim", "muted"),
    // Interaction
    hover: pick(t, "hover", "border"),
    selected: pick(t, "selected", "hover", "border"),
    selection: pick(t, "selection", "selected", "hover"),
    // Primary button
    solid: pick(t, "solid", "accent", "foreground"),
    onSolid: pick(t, "solid_foreground", "accent_foreground", "background"),
    // Terminal palette passthrough (rare: syntax preview, diff marks)
    ansi: (n) => t["ansi" + n] ?? pick(t, "accent", "foreground"),
  };
}

/** Status -> { color, label }. Text always accompanies color. */
const STATUS = {
  working: { key: "working", label: "Working" },
  blocked: { key: "blocked", label: "Needs input" },
  done: { key: "done", label: "Finished" },
  idle: { key: "idle", label: "Idle" },
  unknown: { key: "unknown", label: "Unknown" },
};

export function statusInfo(status) {
  return STATUS[status] ?? STATUS.unknown;
}

/** Color for an agent status; unknown never masquerades as idle. */
export function statusColor(status, p) {
  const palette_ = p ?? palette();
  return palette_[statusInfo(status).key];
}
