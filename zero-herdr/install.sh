#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

mkdir -p "$TARGET/themes" "$TARGET/layouts" "$TARGET/mods"
cp "$ROOT/themes/claude-dark.json" "$ROOT/themes/claude-light.json" "$TARGET/themes/"
cp "$ROOT/layouts/zero-herdr.json" "$ROOT/layouts/claude.svg" "$TARGET/layouts/"
cp -R "$ROOT/mods/claude-drawer" "$ROOT/mods/claude-pane" "$ROOT/mods/zero-herdr" "$ROOT/mods/zero-herdr-toggle" "$TARGET/mods/"

if command -v herdr-app >/dev/null 2>&1; then
  for mod in claude-drawer claude-pane zero-herdr zero-herdr-toggle; do
    herdr-app check "$TARGET/mods/$mod"
  done
  herdr-app do layout.switch --name zero-herdr
fi
