#!/usr/bin/env node
// Stamps the zero-ui foundation into each consuming mod, because Herdr's
// module loader only resolves imports inside a mod's own folder (cross-mod
// imports fail with "resolves outside the application directory").
//
// Per consumer mod:
//   - zero-tokens.js / zero-theme.js / zero-kit.js  (copied verbatim)
//   - fonts/Allo (Regular/Medium/SemiBold) + Geist Mono + OFL licenses
//
// Icons stay in mods/zero-ui/icons/ and are referenced by path
// ("mods/zero-ui/icons/<name>.svg") — svg() reads any file under the app
// home, so no per-mod copies are needed.
//
// Usage: node tools/stamp-zero-ui.mjs [--check]
//   --check  verify stamps match the source instead of writing (used by CI
//            and install.sh before syncing to the runtime directory).
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = join(root, "mods", "zero-ui");
const FILES = ["zero-tokens.js", "zero-theme.js", "zero-kit.js", "switch-shared.js"];
const FONTS = ["Allo-Regular.otf", "Allo-Medium.otf", "Allo-SemiBold.otf", "GeistMono-Regular.ttf", "GeistMono-Medium.ttf", "OFL-Allo.txt", "OFL.txt"];
// Every mod that imports the stamped files. Keep in sync with install.sh.
const CONSUMERS = [
  "zero-herdr",
  "zero-herdr-toggle",
  "zero-status",
  "claude-drawer",
  "claude-pane",
  "files",
  "files-menu",
  "zero-picker",
  "zero-changes",
];

const check = process.argv.includes("--check");
let failed = false;

for (const mod of CONSUMERS) {
  const target = join(root, "mods", mod);
  if (!existsSync(target)) {
    console.error(`stamp: missing consumer mods/${mod}`);
    failed = true;
    continue;
  }
  for (const file of FILES) {
    const src = join(ui, file);
    const dst = join(target, file);
    if (check) {
      const same = existsSync(dst) && readFileSync(dst, "utf8") === readFileSync(src, "utf8");
      if (!same) { console.error(`stale: mods/${mod}/${file}`); failed = true; }
    } else {
      copyFileSync(src, dst);
    }
  }
  const fontsDir = join(target, "fonts");
  if (check) {
    for (const font of FONTS) {
      if (!existsSync(join(fontsDir, font))) { console.error(`missing font: mods/${mod}/fonts/${font}`); failed = true; }
    }
  } else {
    mkdirSync(fontsDir, { recursive: true });
    for (const existing of readdirSync(fontsDir)) {
      if (!FONTS.includes(existing)) rmSync(join(fontsDir, existing), { force: true });
    }
    for (const font of FONTS) copyFileSync(join(ui, "fonts", font), join(fontsDir, font));
  }
}

if (!check) {
  console.log(`stamped ${FILES.length} files + ${FONTS.length} fonts into ${CONSUMERS.length} mods`);
}
process.exit(failed ? 1 : 0);
