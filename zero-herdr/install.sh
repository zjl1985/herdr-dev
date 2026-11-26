#!/usr/bin/env bash
# Validate sources, stage, verify backup, publish whitelist, validate target.
# A failed publish restores the original files; existing themes are preserved.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
SWITCH=0
case "${1:-}" in
  '') ;;
  --switch) SWITCH=1 ;;
  *) printf 'Usage: %s [--switch]\n' "$0" >&2; exit 2 ;;
esac
if [[ "$SWITCH" == 1 && "$TARGET" != "$HOME/.config/herdr-app" ]]; then
  printf 'Refusing to switch the active window from an isolated install.\n' >&2
  exit 2
fi
BACKUP_ROOT="${HERDR_BACKUP_ROOT:-$HOME/.local/share/herdr-backups}"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/zero-herdr-install.XXXXXX")"
BACKUP=''
INCOMING=''
PUBLISHING=0
TOUCHED=()
MOD_WHITELIST=(claude-drawer claude-pane zero-herdr zero-herdr-toggle zero-status zero-tabs files files-menu zero-ui zero-picker zero-changes)
FILES=(layouts/zero-herdr.json layouts/claude.svg)
for mod in "${MOD_WHITELIST[@]}"; do FILES+=("mods/$mod"); done
# Themes are shared user assets. Seed defaults only on first installation.
for theme in claude-dark claude-light; do
  if [[ ! -e "$TARGET/themes/$theme.json" ]]; then FILES+=("themes/$theme.json"); fi
done
say() { printf 'install: %s\n' "$*"; }
die() { printf 'install: FAILED — %s\n' "$*" >&2; exit 1; }
finish() {
  local result=$? path i
  trap - EXIT
  if [[ "$result" != 0 && "$PUBLISHING" == 1 ]]; then
    printf 'install: restoring previous files from %s\n' "$BACKUP" >&2
    for ((i=${#TOUCHED[@]}-1; i>=0; i--)); do
      path="${TOUCHED[$i]}"
      mkdir -p "$BACKUP/failed/$(dirname "$path")"
      if [[ -e "$TARGET/$path" ]]; then
        mv "$TARGET/$path" "$BACKUP/failed/$path" || { printf 'Rollback blocked at %s\n' "$path" >&2; continue; }
      fi
      if [[ -e "$BACKUP/previous/$path" ]]; then
        mv "$BACKUP/previous/$path" "$TARGET/$path" || printf 'Restore manually: %s\n' "$BACKUP/snapshot/$path" >&2
      fi
    done
  fi
  # Only task-owned temporary staging directories are deleted.
  rm -rf "$STAGE"
  if [[ -n "$INCOMING" ]]; then rm -rf "$INCOMING"; fi
  if [[ -n "$BACKUP" ]]; then printf 'install: backup %s\n' "$BACKUP"; fi
  exit "$result"
}
trap finish EXIT
say "target $TARGET"
node "$ROOT/tools/stamp-zero-ui.mjs" --check || die 'generated UI files are stale'
for mod in "${MOD_WHITELIST[@]}"; do
  herdr-app check "$ROOT/mods/$mod" || die "source check failed: $mod"
done
for path in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$path")"
  cp -R "$ROOT/$path" "$STAGE/$path" || die "staging failed: $path"
done
mkdir -p "$BACKUP_ROOT"
BACKUP="$(mktemp -d "$BACKUP_ROOT/zero-pre-install-$(date +%Y%m%d-%H%M%S).XXXXXX")"
chmod 700 "$BACKUP"
for path in "${FILES[@]}"; do
  if [[ -e "$TARGET/$path" ]]; then
    mkdir -p "$BACKUP/snapshot/$(dirname "$path")"
    cp -R "$TARGET/$path" "$BACKUP/snapshot/$path" || die "backup failed: $path"
    diff -qr "$TARGET/$path" "$BACKUP/snapshot/$path" || die "backup verification failed: $path"
  else
    printf '%s\n' "$path" >> "$BACKUP/absent-before.txt"
  fi
done
printf '%s\n' "${FILES[@]}" > "$BACKUP/manifest.txt"
mkdir -p "$TARGET"
INCOMING="$(mktemp -d "$TARGET/.zero-install.XXXXXX")"
for path in "${FILES[@]}"; do
  mkdir -p "$INCOMING/$(dirname "$path")"
  cp -R "$STAGE/$path" "$INCOMING/$path" || die "target staging failed: $path"
done
PUBLISHING=1
for path in "${FILES[@]}"; do
  mkdir -p "$TARGET/$(dirname "$path")" "$BACKUP/previous/$(dirname "$path")"
  # Journal only after moving the old entry succeeds. The originals remain
  # in the backup; no runtime/user files are permanently deleted.
  if [[ -e "$TARGET/$path" ]]; then mv "$TARGET/$path" "$BACKUP/previous/$path" || die "cannot preserve: $path"; fi
  TOUCHED+=("$path")
  mv "$INCOMING/$path" "$TARGET/$path" || die "publish failed: $path"
done
for mod in "${MOD_WHITELIST[@]}"; do
  herdr-app check "$TARGET/mods/$mod" || die "target check failed: $mod"
done
PUBLISHING=0
if [[ "$SWITCH" == 1 ]]; then
  herdr-app do layout.switch --name zero-herdr || die 'files installed; layout switch failed'
fi
say 'installed; existing themes and global settings preserved'
