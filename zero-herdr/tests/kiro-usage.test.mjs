import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKiroAccountUsage, readKiroAccountUsage } from '../mods/zero-herdr/kiro-usage.js';
const screen = `Estimated Usage | resets on 2026-12-01 | KIRO FREE
Credits (0.00 of 50 covered in plan)
0.0%
Bonus credits
kiroween2026: 0/4000 credits used, expires in 46 days
To manage your plan navigate to app.kiro.dev/account/usage`;
test('read plan and promotional credits from the reported /usage screen', () => {
  const usage = parseKiroAccountUsage(screen);
  assert.equal(usage.planName, 'KIRO FREE');
  assert.equal(usage.resetsOn, '2026-12-01');
  assert.deepEqual(usage.plan, { used: 0, total: 50, remaining: 50 });
  assert.deepEqual(usage.bonus, [{ name: 'kiroween2026', used: 0, total: 4000, remaining: 4000, expiresInDays: 46 }]);
});
test('fractional, grouped, wrapped and multiple bonus readings remain separate', () => {
  const usage = parseKiroAccountUsage(screen.replace('0.00 of 50', '12.34 of\n1,000').replace('0/4000', '100.25/4,000') + '\ntrial: 1/20 credits used, expires in 1 day');
  assert.equal(usage.plan.remaining, 987.66);
  assert.equal(usage.bonus[0].remaining, 3899.75);
  assert.equal(usage.bonus[1].remaining, 19);
});
test('last complete panel wins and incomplete or unrelated output is not a balance', () => {
  assert.equal(parseKiroAccountUsage('Credits (0 of 50 covered in plan)'), null);
  assert.equal(parseKiroAccountUsage(screen + '\nEstimated Usage | loading'), null);
  assert.equal(parseKiroAccountUsage(screen + '\n' + screen.replace('0.00 of 50', '3.00 of 50')).plan.used, 3);
  assert.equal(parseKiroAccountUsage(screen.slice(0, screen.indexOf('kiroween'))).bonus, null);
});
test('account reader uses screen only, caches within a process, never sends keys', async () => {
  let pid = 1, output = screen;
  const calls = [];
  const hc = async args => {
    calls.push(args);
    return { code: 0, stdout: args[0] === 'get' ? JSON.stringify({ status: { app: 'kiro-cli' }, foreground: { pid }, created_ms: 10 }) : output };
  };
  const first = await readKiroAccountUsage(hc, 't1', null, 100);
  const identical = await readKiroAccountUsage(hc, 't1', first, 200);
  assert.equal(identical.capturedAt, 100);
  output = 'normal conversation';
  const cached = await readKiroAccountUsage(hc, 't1', first, 300);
  assert.equal(cached.visible, false); assert.equal(cached.data.plan.remaining, 50);
  pid = 2;
  assert.equal(await readKiroAccountUsage(hc, 't1', first, 400), null);
  assert.ok(calls.every(args => args[0] === 'get' || JSON.stringify(args) === JSON.stringify(['read', 't1', '--lines', '0'])));
});
test('process change between metadata and screen read invalidates result', async () => {
  let count = 0;
  const hc = async ([cmd]) => ({ code: 0, stdout: cmd === 'get' ? JSON.stringify({ status: { app: 'kiro-cli' }, foreground: { pid: ++count } }) : screen });
  assert.equal(await readKiroAccountUsage(hc, 't1'), null);
});
