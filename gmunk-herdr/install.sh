#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
if command -v herdr-app >/dev/null 2>&1; then
  for mod in gmunk-shell gmunk-telemetry; do herdr-app check "$ROOT/mods/$mod"; done
fi
mkdir -p "$TARGET/themes" "$TARGET/layouts" "$TARGET/mods"
cp "$ROOT/themes/gmunk-herdr.json" "$TARGET/themes/"
cp "$ROOT/layouts/gmunk-herdr.json" "$ROOT/layouts/gmunk-herdr.svg" "$TARGET/layouts/"
for mod in gmunk-shell gmunk-telemetry; do
  mkdir -p "$TARGET/mods/$mod"
  cp "$ROOT/mods/$mod/"*.js "$ROOT/mods/$mod/mod.json" "$TARGET/mods/$mod/"
done
mkdir -p "$TARGET/mods/gmunk-shell/fonts"
cp "$ROOT/mods/gmunk-shell/fonts/"* "$TARGET/mods/gmunk-shell/fonts/"
cp "$ROOT/mods/gmunk-shell/mark.svg" "$TARGET/mods/gmunk-shell/"
mkdir -p "$TARGET/mods/gmunk-telemetry/art"
cp "$ROOT/mods/gmunk-telemetry/art/"*.svg "$TARGET/mods/gmunk-telemetry/art/"
cp "$ROOT/mods/gmunk-telemetry/codex-status.cjs" "$TARGET/mods/gmunk-telemetry/"
if command -v herdr-app >/dev/null 2>&1; then
  for mod in gmunk-shell gmunk-telemetry; do herdr-app check "$TARGET/mods/$mod"; done
  herdr-app do layout.switch --name gmunk-herdr
fi
