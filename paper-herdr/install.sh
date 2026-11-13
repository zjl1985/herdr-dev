#!/usr/bin/env bash
# Install paper-herdr into the Herdr app home. Only writes paper-* files.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS=(paper-shell paper-widgets)
if command -v herdr-app >/dev/null 2>&1; then
  for mod in "${MODS[@]}"; do herdr-app check "$ROOT/mods/$mod"; done
fi
mkdir -p "$TARGET/themes" "$TARGET/layouts"
cp "$ROOT/themes/paper-herdr.json" "$TARGET/themes/"
cp "$ROOT/layouts/paper-herdr.json" "$ROOT/layouts/paper-herdr.svg" "$TARGET/layouts/"
mkdir -p "$TARGET/mods/paper-shell/icons" "$TARGET/mods/paper-shell/fonts" "$TARGET/mods/paper-widgets"
cp "$ROOT/mods/paper-shell/"{main.js,ui.js,mod.json} "$TARGET/mods/paper-shell/"
cp "$ROOT/mods/paper-shell/icons/"*.svg "$TARGET/mods/paper-shell/icons/"
cp "$ROOT/mods/paper-shell/fonts/"* "$TARGET/mods/paper-shell/fonts/"
cp "$ROOT/mods/paper-widgets/"{main.js,data.js,mod.json,codex-status.cjs} "$TARGET/mods/paper-widgets/"
if command -v herdr-app >/dev/null 2>&1; then
  for mod in "${MODS[@]}"; do herdr-app check "$TARGET/mods/$mod"; done
  herdr-app do layout.switch --name paper-herdr || true
fi
