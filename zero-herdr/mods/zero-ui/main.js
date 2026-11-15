// zero-ui is the source of truth for Zero's shared visual foundation. It is
// not rendered itself: tools/stamp-zero-ui.mjs copies zero-tokens.js,
// zero-theme.js, zero-kit.js and the fonts into each consuming mod, and
// icons/ is referenced by path from anywhere. Loading it here once exercises
// the imports so `herdr-app check` catches breakage early.
import { View, div } from "gpui-kit";
import { T, UI, MONO } from "./zero-tokens.js";
import { palette, statusInfo, statusColor } from "./zero-theme.js";
import { text, mono, label, hint, statusDot, icon, iconButton, section, menuRow, withAlpha } from "./zero-kit.js";

export default class ZeroUi {
  render() {
    const p = palette();
    void T; void UI; void MONO; void statusInfo; void statusColor;
    void text; void mono; void label; void hint; void statusDot; void icon;
    void iconButton; void section; void menuRow; void withAlpha;
    return div().bg(p.bg);
  }
}
