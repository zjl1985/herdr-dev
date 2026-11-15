// Read-only bridge for Kimi Code plan quotas; never writes credentials or terminal input.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function kimiRoot() {
  return process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');
}

function resolveAccount(root) {
  let credential = path.join(root, 'credentials', 'kimi-code.json');
  let url = 'https://api.kimi.com/coding/v1/usages';
  try {
    let section = '';
    for (const raw of fs.readFileSync(path.join(root, 'config.toml'), 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('[')) {
        section = line.replace(/^\[+|\]+$/g, '').trim();
        continue;
      }
      const match = line.match(/^([^=#]+)=\s*["']?([^"']*)["']?\s*$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      if (section === 'providers."managed:kimi-code"' && key === 'base_url' && value) {
        url = value.replace(/\/+$/, '') + '/usages';
      }
      if (section === 'providers."managed:kimi-code".oauth' && key === 'key' && value) {
        credential = path.join(root, 'credentials', path.basename(value) + '.json');
      }
    }
  } catch {}
  return { credential, url };
}

function number(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function resetsAt(row) {
  for (const key of ['reset_time', 'resetTime', 'reset_at', 'resetAt']) {
    const value = row?.[key];
    if (typeof value === 'string' && value) {
      const time = Date.parse(value);
      if (Number.isFinite(time)) return Math.floor(time / 1000);
    }
    const epoch = number(value);
    if (epoch != null && epoch > 0) return Math.floor(epoch > 1e11 ? epoch / 1000 : epoch);
  }
  return null;
}

function quota(used, limit, row) {
  used = number(used);
  limit = number(limit);
  if (used == null || limit == null || used < 0 || limit <= 0) return null;
  return { left: Math.max(0, Math.min(100, 100 - used / limit * 100)), resetsAt: resetsAt(row) };
}

function modernQuota(row) {
  const ratio = number(row?.used_ratio ?? row?.usedRatio);
  return ratio == null ? null : quota(ratio, 1, row);
}

function legacyQuota(row) {
  const limit = number(row?.limit);
  const used = number(row?.used);
  if (used == null && limit != null) {
    const remaining = number(row?.remaining);
    return remaining == null ? null : quota(limit - remaining, limit, row);
  }
  return quota(used, limit, row);
}

function parseQuotas(data) {
  const usages = data?.usages ?? {};
  let fiveHour = modernQuota(usages.limit_5h ?? usages.limit5h);
  let weekly = modernQuota(usages.limit_7d ?? usages.limit7d);

  if (!fiveHour) {
    for (const item of data?.limits ?? []) {
      if (number(item?.window?.duration) === 300 && item?.window?.timeUnit === 'TIME_UNIT_MINUTE') {
        fiveHour = legacyQuota(item?.detail);
        if (fiveHour) break;
      }
    }
  }
  if (!weekly) weekly = legacyQuota(data?.usage);
  if (!fiveHour && !weekly) throw new Error('Kimi quota response contained no 5h or weekly window');
  return { fiveHour, weekly, updatedAt: new Date().toISOString() };
}

async function readStatus() {
  const account = resolveAccount(kimiRoot());
  let credential;
  try { credential = JSON.parse(fs.readFileSync(account.credential, 'utf8')); }
  catch { throw new Error('Kimi Code OAuth credentials unavailable'); }
  const token = credential?.access_token ?? credential?.accessToken;
  if (typeof token !== 'string' || !token) throw new Error('Kimi Code OAuth token unavailable');
  const expiresAt = number(credential?.expires_at ?? credential?.expiresAt);
  if (expiresAt != null && expiresAt < Date.now() / 1000 + 10) throw new Error('Kimi Code OAuth token expired');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(account.url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'kimi-code-cli' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kimi quota request failed (${response.status})`);
    const quotas = parseQuotas(await response.json());
    // C09: cache ownership — which credential + endpoint produced this.
    quotas.account = { credential: path.basename(account.credential), endpoint: account.url };
    return quotas;
  } finally { clearTimeout(timeout); }
}

if (require.main === module) {
  readStatus()
    .then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => process.stdout.write(JSON.stringify({ error: error.message || 'Kimi quota unavailable' }) + '\n'));
}

module.exports = { parseQuotas, readStatus, resolveAccount };
