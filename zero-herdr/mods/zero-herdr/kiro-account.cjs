// Read-only account usage. Credentials stay in this process and are sent only
// to the official, fixed regional service. Kiro CLI owns login and refresh.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { homedir, platform } = require('node:os');
const path = require('node:path');

const REFRESH_MS = 60_000;
const MAX_STALE_MS = 10 * 60_000;
const ENDPOINTS = {
  'us-east-1': 'https://codewhisperer.us-east-1.amazonaws.com/',
  'eu-central-1': 'https://q.eu-central-1.amazonaws.com/',
};
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);

function statePath(env = process.env, home = homedir(), os = platform()) {
  const dir = env.KIRO_DATA_DIR || (os === 'darwin'
    ? path.join(home, 'Library/Application Support/kiro-cli')
    : path.join(env.XDG_DATA_HOME || path.join(home, '.local/share'), 'kiro-cli'));
  return path.join(dir, 'data.sqlite3');
}

function identityFromRows(rows, now = Date.now()) {
  let profile;
  try {
    const row = rows.find(r => r.key === 'api.codewhisperer.profile');
    if (row) {
      profile = JSON.parse(row.value).arn;
      if (typeof profile !== 'string' || !profile) throw Error();
    }
  } catch { throw Error('Kiro CLI 账户配置不可用'); }
  const candidates = [];
  for (const row of rows.filter(r => ['kirocli:social:token', 'kirocli:odic:token'].includes(r.key))) {
    let token;
    try { token = JSON.parse(row.value); } catch { continue; }
    if (typeof token.access_token !== 'string' || !token.access_token.trim()) continue;
    const expires = Date.parse(token.expires_at);
    if (Number.isFinite(expires) && expires <= now) continue;
    candidates.push({ token, key: row.key, arn: token.profile_arn || profile });
  }
  const matching = profile ? candidates.filter(c => c.arn === profile) : candidates;
  const active = matching.length === 1 ? matching : candidates;
  if (active.length !== 1) throw Error(active.length ? '无法确定当前 Kiro 账号' : 'Kiro CLI 登录不可用，请检查登录状态');
  const { token, key, arn } = active[0];
  if (arn && (typeof arn !== 'string' || !/^arn:aws:codewhisperer:[a-z0-9-]+:[0-9]*:profile\/[^\s:]+$/.test(arn))) {
    throw Error('Kiro CLI 账户区域不可用');
  }
  const endpoint = ENDPOINTS[arn?.split(':')[3] ?? 'us-east-1'];
  if (!endpoint) throw Error('暂不支持此 Kiro 账户区域');
  return {
    accessToken: token.access_token, profileArn: arn, endpoint,
    identity: hash(key + '\0' + (arn || token.refresh_token || token.access_token)),
    credentialVersion: hash(token.access_token),
  };
}

function readIdentity() {
  const sql = "SELECT key,value FROM auth_kv WHERE key IN ('kirocli:odic:token','kirocli:social:token') UNION ALL SELECT key,value FROM state WHERE key='api.codewhisperer.profile';";
  let rows;
  try {
    rows = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', statePath(), sql], {
      encoding: 'utf8', timeout: 2000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch { throw Error('无法读取 Kiro CLI 登录信息'); }
  return identityFromRows(rows);
}

function amount(record, precise, fallback) {
  const value = record?.[precise] ?? record?.[fallback];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('Kiro 积分数据不完整');
  return value;
}
function pool(used, total) {
  return { used, total, remaining: Math.max(0, Math.round((total - used) * 100) / 100) };
}
function date(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1e9 || value > 4102444800) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function parseAccountUsage(response, now = Date.now()) {
  const credits = Array.isArray(response?.usageBreakdownList) ? response.usageBreakdownList.filter(c => c?.resourceType === 'CREDIT') : [];
  if (!credits || credits.length !== 1) throw Error('Kiro 未返回唯一的积分余额');
  const credit = credits[0];
  const total = amount(credit, 'usageLimitWithPrecision', 'usageLimit');
  const used = amount(credit, 'currentUsageWithPrecision', 'currentUsage');
  const overage = credit.currentOveragesWithPrecision ?? credit.currentOverages ?? 0;
  if (!Number.isFinite(overage) || overage < 0 || overage > used) throw Error('Kiro 超额积分数据不完整');
  // The official CLI reports bonuses separately; never subtract bonus spend
  // from the plan or sum a session's spend into an account balance.
  const bonus = [];
  const addBonus = (entry, name, expiry) => {
    if (expiry != null && !date(expiry)) throw Error('Kiro 积分到期时间不可用');
    if (expiry != null && expiry * 1000 <= now) return;
    bonus.push({ name, ...pool(amount(entry, 'currentUsageWithPrecision', 'currentUsage'),
      amount(entry, 'usageLimitWithPrecision', 'usageLimit')),
      expiresOn: date(expiry), expiresInDays: expiry == null ? null : Math.max(0, Math.floor((expiry * 1000 - now) / 86400000)) });
  };
  const trial = credit.freeTrialInfo;
  if (trial?.freeTrialStatus === 'ACTIVE') addBonus(trial, 'Welcome bonus', trial.freeTrialExpiry);
  for (const entry of credit.bonuses ?? []) {
    if (['ACTIVE', 'EXHAUSTED'].includes(entry.status)) addBonus(entry, entry.displayName || 'Bonus', entry.expiresAt);
  }
  const addOn = [];
  for (const entry of credit.overageCredits ?? []) {
    if (entry.expiresAt != null && !date(entry.expiresAt)) throw Error('Kiro 加购积分到期时间不可用');
    if (entry.expiresAt != null && entry.expiresAt * 1000 <= now) continue;
    addOn.push({ ...pool(amount(entry, 'currentUsageWithPrecision', 'currentUsage'),
      amount(entry, 'usageLimitWithPrecision', 'usageLimit')), expiresOn: date(entry.expiresAt) });
  }
  return {
    planName: response.subscriptionInfo?.subscriptionTitle || 'Kiro',
    resetsOn: date(credit.nextDateReset ?? response.nextDateReset),
    plan: total < 999999 ? pool(used - overage, total) : null,
    bonus, addOn,
  };
}

async function fetchUsage(identity, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(identity.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4500),
      headers: { 'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Target': 'AmazonCodeWhispererService.GetUsageLimits', Authorization: 'Bearer ' + identity.accessToken },
      body: JSON.stringify(identity.profileArn ? { profileArn: identity.profileArn } : {}),
    });
  } catch { throw Error('Kiro 额度读取暂时失败，将自动重试'); }
  if (!response.ok) throw Error(response.status === 401 || response.status === 403
    ? 'Kiro 登录已失效，CLI 更新登录后将自动重试' : 'Kiro 额度接口暂时不可用（HTTP ' + response.status + '）');
  try { return await response.json(); } catch { throw Error('Kiro 额度响应不可用'); }
}

async function readAccountUsage({ previous = null, now = Date.now(), identityReader = readIdentity, fetchImpl = fetch } = {}) {
  let identity;
  try { identity = identityReader(); }
  catch (error) { return { state: 'error', source: 'api', message: error.message, data: null }; }
  const cached = previous?.source === 'api' && previous.identity === identity.identity ? previous : null;
  if (cached?.credentialVersion === identity.credentialVersion && Number.isFinite(cached.attemptedAt)
      && now >= cached.attemptedAt && now - cached.attemptedAt < REFRESH_MS) {
    if (cached.data && (!Number.isFinite(cached.capturedAt) || now < cached.capturedAt || now - cached.capturedAt > MAX_STALE_MS)) {
      return { ...cached, state: 'error', data: null, capturedAt: null };
    }
    return cached;
  }
  let data, message;
  try { data = parseAccountUsage(await fetchUsage(identity, fetchImpl), now); }
  catch (error) { message = error.message; }
  // A login can change while the HTTP request is in flight.
  try {
    if (identityReader().identity !== identity.identity) throw Error();
  } catch { return { state: 'error', source: 'api', message: 'Kiro 账号已变化，等待重新读取', data: null }; }
  const result = { source: 'api', identity: identity.identity, credentialVersion: identity.credentialVersion, attemptedAt: now };
  if (data) return { ...result, state: 'ready', capturedAt: now, data };
  const keep = cached?.data && now >= cached.capturedAt && now - cached.capturedAt <= MAX_STALE_MS;
  return { ...result, state: keep ? 'stale' : 'error', capturedAt: keep ? cached.capturedAt : null,
    data: keep ? cached.data : null, message };
}

if (require.main === module) {
  let previous = null;
  try { previous = JSON.parse(process.argv[2] || 'null'); } catch {}
  readAccountUsage({ previous }).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.log(JSON.stringify({ state: 'error', source: 'api', message: 'Kiro 额度读取失败，将自动重试', data: null }));
  });
}
module.exports = { statePath, identityFromRows, parseAccountUsage, readAccountUsage };
