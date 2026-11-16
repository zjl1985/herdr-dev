import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readKiroAccountUsage } from '../mods/zero-herdr/kiro-usage.js';
const { statePath, identityFromRows, parseAccountUsage, readAccountUsage } = createRequire(import.meta.url)('../mods/zero-herdr/kiro-account.cjs');
const NOW = Date.parse('2026-11-16T00:00:00Z');
const RESET = Date.parse('2026-12-01T00:00:00Z') / 1000;
const EXPIRY = Date.parse('2027-01-01T00:00:00Z') / 1000;
const ARN = 'arn:aws:codewhisperer:us-east-1:123456789012:profile/test-profile';
const endpoint = 'https://codewhisperer.us-east-1.amazonaws.com/';
const identity = { accessToken: 'test-access-secret', profileArn: ARN, endpoint, identity: 'account-A', credentialVersion: 'token-A' };
function response(patch = {}) {
  return { subscriptionInfo: { subscriptionTitle: 'KIRO FREE' }, nextDateReset: RESET,
    usageBreakdownList: [{ resourceType: 'CREDIT', currentUsageWithPrecision: 0, usageLimitWithPrecision: 50,
      currentOveragesWithPrecision: 0, bonuses: [{ displayName: 'kiroween2026', status: 'ACTIVE', currentUsage: 88.12, usageLimit: 4000, expiresAt: EXPIRY }],
      freeTrialInfo: { freeTrialStatus: 'EXPIRED', currentUsageWithPrecision: 29.72, usageLimitWithPrecision: 500 }, ...patch }] };
}
const ok = async () => ({ ok: true, json: async () => response() });
const read = options => readAccountUsage({ now: NOW, identityReader: () => identity, fetchImpl: ok, ...options });
function rows(key = 'kirocli:social:token', overrides = {}, profile = ARN) {
  return [{ key, value: JSON.stringify({ access_token: 'test-access-secret', refresh_token: 'test-refresh-secret', expires_at: '2027-01-01T00:00:00Z', ...overrides }) },
    ...(profile === undefined ? [] : [{ key: 'api.codewhisperer.profile', value: JSON.stringify({ arn: profile }) }])];
}

test('API separates plan, promotional and expired trial credits', () => {
  const account = parseAccountUsage(response(), NOW);
  assert.equal(account.planName, 'KIRO FREE');
  assert.equal(account.resetsOn, '2026-12-01');
  assert.deepEqual(account.plan, { used: 0, total: 50, remaining: 50 });
  assert.equal(account.bonus.length, 1);
  assert.equal(account.bonus[0].remaining, 3911.88);
  assert.equal(account.bonus[0].expiresOn, '2027-01-01');
});

test('active trials, exhausted bonuses and purchased packs retain separate balances', () => {
  const account = parseAccountUsage(response({ currentUsageWithPrecision: 60.25, usageLimitWithPrecision: 50, currentOveragesWithPrecision: 10.25,
    freeTrialInfo: { freeTrialStatus: 'ACTIVE', currentUsageWithPrecision: 1.25, usageLimitWithPrecision: 500, freeTrialExpiry: EXPIRY },
    bonuses: [{ status: 'EXHAUSTED', displayName: 'Spent', currentUsage: 10, usageLimit: 10, expiresAt: EXPIRY },
      { status: 'EXPIRED', currentUsage: 0, usageLimit: 999 },
      { status: 'ACTIVE', currentUsage: 0, usageLimit: 999, expiresAt: NOW / 1000 - 1 }],
    overageCredits: [{ currentUsage: 2.75, usageLimit: 125, expiresAt: EXPIRY }, { currentUsage: 0, usageLimit: 999, expiresAt: NOW / 1000 - 1 }],
  }), NOW);
  assert.deepEqual(account.plan, { used: 50, total: 50, remaining: 0 });
  assert.equal(account.bonus.length, 2);
  assert.equal(account.bonus[0].remaining, 498.75);
  assert.equal(account.bonus[1].remaining, 0);
  assert.equal(account.addOn.length, 1);
  assert.equal(account.addOn[0].remaining, 122.25);
});

test('missing and invalid amounts do not become zero; unlimited plans do not invent a balance', () => {
  for (const value of [null, -1, NaN, Infinity, '12']) {
    assert.throws(() => parseAccountUsage(response({ currentUsageWithPrecision: value }), NOW));
  }
  assert.throws(() => parseAccountUsage({ usageBreakdownList: {} }, NOW));
  assert.throws(() => parseAccountUsage({ usageBreakdownList: [response().usageBreakdownList[0], response().usageBreakdownList[0]] }, NOW));
  assert.throws(() => parseAccountUsage(response({ currentUsageWithPrecision: 0, currentOveragesWithPrecision: 1 }), NOW));
  assert.equal(parseAccountUsage(response({ usageLimitWithPrecision: 999999 }), NOW).plan, null);
});

test('credential discovery supports current social and Builder ID CLI logins', () => {
  for (const kind of ['kirocli:social:token', 'kirocli:odic:token']) {
    const account = identityFromRows(rows(kind), NOW);
    assert.equal(account.endpoint, endpoint);
    assert.equal(account.profileArn, ARN);
    assert.equal(account.accessToken, 'test-access-secret');
  }
  const builder = identityFromRows([{ key: 'kirocli:odic:token', value: JSON.stringify({ access_token: 'test-access-secret' }) }], NOW);
  assert.equal(builder.endpoint, endpoint);
  assert.equal(builder.profileArn, undefined);
  const frankfurt = identityFromRows(rows('kirocli:odic:token', {}, ARN.replace('us-east-1', 'eu-central-1')), NOW);
  assert.equal(frankfurt.endpoint, 'https://q.eu-central-1.amazonaws.com/');
});

test('credentials reject expired, ambiguous, malformed and unsupported profiles', () => {
  assert.throws(() => identityFromRows(rows('kirocli:social:token', { expires_at: '2026-01-01T00:00:00Z' }), NOW));
  assert.throws(() => identityFromRows(rows('kirocli:social:token', {}, 'https://invalid.test/'), NOW));
  assert.throws(() => identityFromRows(rows('kirocli:social:token', {}, ARN.replace('us-east-1', 'ap-southeast-1')), NOW));
  assert.throws(() => identityFromRows([...rows(), ...rows('kirocli:odic:token').slice(0, 1)], NOW));
  assert.equal(statePath({}, '/test', 'darwin'), '/test/Library/Application Support/kiro-cli/data.sqlite3');
  assert.equal(statePath({ KIRO_DATA_DIR: '/custom' }, '/test', 'darwin'), '/custom/data.sqlite3');
  assert.equal(statePath({ XDG_DATA_HOME: '/xdg' }, '/test', 'linux'), '/xdg/kiro-cli/data.sqlite3');
});

test('API is read-only, does not follow redirects, and returns no credential material', async () => {
  const result = await read({ fetchImpl: async (url, options) => {
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-Amz-Target'], 'AmazonCodeWhispererService.GetUsageLimits');
    assert.deepEqual(JSON.parse(options.body), { profileArn: ARN });
    return ok();
  } });
  assert.equal(result.state, 'ready');
  assert.ok(!JSON.stringify(result).includes('test-access-secret'));
  assert.ok(!JSON.stringify(result).includes(ARN));
});

test('account refresh is cached for one minute but a rotated token refreshes immediately', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return ok(); };
  const first = await read({ fetchImpl });
  assert.equal(await read({ previous: first, now: NOW + 3000, fetchImpl }), first);
  assert.equal(calls, 1);
  await read({ previous: first, now: NOW + 60001, fetchImpl });
  assert.equal(calls, 2);
  await read({ previous: first, now: NOW + 3000, identityReader: () => ({ ...identity, credentialVersion: 'token-B' }), fetchImpl });
  assert.equal(calls, 3);
});

test('login changes cannot reuse another account or accept an in-flight old response', async () => {
  const first = await read();
  const switched = await read({ previous: first, now: NOW + 1, identityReader: () => ({ ...identity, identity: 'account-B' }), fetchImpl: async () => { throw Error('offline'); } });
  assert.equal(switched.state, 'error');
  assert.equal(switched.data, null);
  let active = identity;
  const raced = await read({ identityReader: () => active, fetchImpl: async () => { active = { ...identity, identity: 'account-B' }; return ok(); } });
  assert.equal(raced.data, null);
});

test('network failure retains a marked, bounded cache and retries without leaking errors', async () => {
  const first = await read();
  const offline = async () => { throw Error('test-access-secret'); };
  const stale = await read({ previous: first, now: NOW + 61000, fetchImpl: offline });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.data.plan.remaining, 50);
  assert.ok(!stale.message.includes('test-access-secret'));
  const expired = await read({ previous: stale, now: NOW + 660000, fetchImpl: offline });
  assert.equal(expired.data, null);
  const justExpired = await read({ previous: { ...stale, attemptedAt: NOW + 599000 }, now: NOW + 600001,
    fetchImpl: async () => { throw Error('must wait for the next scheduled retry'); } });
  assert.equal(justExpired.data, null);
  const unauthorized = await read({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(unauthorized.state, 'error');
  assert.match(unauthorized.message, /登录/);
});

test('renderer bridge passes only balance cache to Node and never sends terminal keys', async () => {
  const previous = { source: 'api', identity: 'account-A', data: { plan: { remaining: 50 } } };
  const exec = async (cmd, args, options) => {
    assert.equal(cmd, 'node');
    assert.equal(args[0], '/app/mods/zero-herdr/kiro-account.cjs');
    assert.deepEqual(JSON.parse(args[1]), previous);
    assert.equal(options.timeout, 8000);
    return { code: 0, stdout: JSON.stringify(previous) };
  };
  assert.deepEqual(await readKiroAccountUsage(exec, '/app', previous), previous);
  await assert.rejects(() => readKiroAccountUsage(async () => ({ code: 1 }), '/app'));
});
