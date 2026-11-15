import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const installer = fileURLToPath(new URL('../install.sh', import.meta.url));
for (const scenario of ['backup-failure', 'target-check-failure', 'success']) {
  test(`installer ${scenario} preserves existing data and theme`, () => {
    const temp = mkdtempSync(join(tmpdir(), 'zero-install-test-'));
    try {
      const target = join(temp, 'target'), bin = join(temp, 'bin');
      for (const dir of [bin, join(target, 'mods/zero-herdr'), join(target, 'layouts'), join(target, 'themes')]) mkdirSync(dir, { recursive: true });
      writeFileSync(join(target, 'mods/zero-herdr/original.txt'), 'keep me');
      writeFileSync(join(target, 'layouts/zero-herdr.json'), '{"original":true}');
      writeFileSync(join(target, 'themes/claude-dark.json'), 'user theme');
      writeFileSync(join(bin, 'cp'), '#!/bin/bash\nif [[ "$FAIL_BACKUP" == 1 && "${@: -1}" == *"/snapshot/"* ]]; then exit 42; fi\nexec /bin/cp "$@"\n', { mode: 0o755 });
      writeFileSync(join(bin, 'herdr-app'), '#!/bin/bash\nif [[ "$FAIL_TARGET" == 1 && "${2:-}" == "$HERDR_APP_HOME/mods/"* ]]; then exit 43; fi\nexit 0\n', { mode: 0o755 });
      const r = spawnSync('bash', [installer], { encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, HERDR_APP_HOME: target, HERDR_BACKUP_ROOT: join(temp, 'backups'), FAIL_BACKUP: scenario === 'backup-failure' ? '1' : '0', FAIL_TARGET: scenario === 'target-check-failure' ? '1' : '0' } });
      assert.equal(r.status, scenario === 'success' ? 0 : 1, r.stdout + r.stderr);
      assert.equal(readFileSync(join(target, 'themes/claude-dark.json'), 'utf8'), 'user theme');
      if (scenario !== 'success') {
        assert.equal(readFileSync(join(target, 'mods/zero-herdr/original.txt'), 'utf8'), 'keep me');
        assert.equal(readFileSync(join(target, 'layouts/zero-herdr.json'), 'utf8'), '{"original":true}');
        assert.equal(existsSync(join(target, 'mods/zero-picker')), false);
      } else assert.ok(existsSync(join(target, 'mods/zero-picker/main.js')));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
}
