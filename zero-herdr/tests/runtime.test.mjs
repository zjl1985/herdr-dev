import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as data from '../mods/zero-herdr/data.js';
import { cardMaterial } from '../mods/zero-herdr/material.js';
import { readKiroAccountUsage } from '../mods/zero-herdr/kiro-usage.js';
const root = fileURLToPath(new URL('../', import.meta.url));
function load(file, globals, tail) {
  const source = fs.readFileSync(root + file, 'utf8').replace(/^import .*;$/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ ...globals });
  vm.runInContext(source + '\n' + tail, context, { filename: file });
  return context;
}
function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
function panel() {
  let current = { address: 'A', cwd: '/a', app: 'codex' }, calls = 0, confirmations = 0;
  const space = { id: 's', active: true, tabs: [{ id: 't', active: true }] };
  const agent = () => ({ ...current, space: 's', tab: 't', pane: current.address, program: { name: 'Codex' } });
  const children = [];
  const el = new Proxy({}, { get: (_, key) => key === 'when' ? (b, yes, no) => { if (b) yes(el); else if (no) no(el); return el; } : key === 'child' ? (...values) => { children.push(...values); return el; } : () => el });
  const context = load('mods/zero-herdr/main.js', {
    ...data, cardMaterial, readKiroAccountUsage, hc: async () => { throw Error('No terminal'); }, View: class {}, Date, console, div: () => el, svg: () => el, h_flex: () => el, v_flex: () => el,
    spaces: () => [space], agents: () => [agent()], panes: () => [{ pane: current.address, cwd: current.cwd }], focused: () => ({ pane: current.address }),
    layout: () => ({ id: 'zero-herdr', hidden: false }), appHome: () => '/tmp', home: () => '/home',
    invalidateSwitch: () => {}, noteCodexData: () => { confirmations++; return true; }, switchState: () => null, closeOverlay: () => {},
    shared: () => null, setShared: () => {}, PICKER_KEY: 'picker', SWITCH_KEY: 'switch',
    palette: () => ({}), programIcon: () => null, motionOn: () => false, withAlpha: (c) => c, statusInfo: () => ({ key: 'idle', label: 'Idle' }),
    closePanelSmooth: () => {}, openPanelSmooth: () => {}, panelClosing: () => false, panelMotion: (node) => node, trackPanelReveal: () => true,
    T: { type: {}, space: {}, radius: {}, hit: {}, icon: {}, duration: {} }, UI: '', MONO: '',
    exec: async () => { calls++; return { stdout: JSON.stringify({ model: 'test', effort: 'high', title: current.address }) }; },
  }, 'globalThis.Panel = ZeroHerdr;');
  const view = Object.assign(new context.Panel(), { channels: {}, busy: {}, seq: {}, lastRender: Date.now() });
  const cx = { notify() {}, spawn(fn) { return fn(cx); } };
  return { view, context, cx, children, read: () => view.readCodex(space, agent(), { cwd: current.cwd }, cx), switchTo: v => { current = { ...current, ...v }; }, calls: () => calls, confirmations: () => confirmations };
}
test('same session is polled repeatedly and confirms unchanged fresh data', async () => {
  const p = panel(); await p.read(); await p.read();
  assert.equal(p.calls(), 2); assert.equal(p.confirmations(), 2);
});
test('failed session reads release the lock and retry', async () => {
  const p = panel(); let n = 0;
  p.context.exec = async () => { if (++n === 1) throw Error('offline'); return { stdout: '{"model":"test"}' }; };
  await p.read(); assert.equal(p.view.channel('codex').state, 'error');
  await p.read(); assert.equal(p.view.channel('codex').state, 'ready');
});
test('late A response cannot populate B and B retries after A settles', async () => {
  const p = panel(), a = deferred(); p.context.exec = () => a.promise;
  const pending = p.read(); p.switchTo({ address: 'B', cwd: '/b' }); await p.read();
  a.resolve({ stdout: '{"model":"old-A"}' }); await pending;
  assert.equal(p.view.channel('codex').data, null);
  p.context.exec = async () => ({ stdout: '{"model":"new-B"}' }); await p.read();
  assert.equal(p.view.channel('codex').data.model, 'new-B');
});
test('A-B-A transitions reject the first A response', async () => {
  const p = panel(), a = deferred(); p.context.exec = () => a.promise;
  const pending = p.read(); p.switchTo({ address: 'B', cwd: '/b' }); await p.read();
  p.switchTo({ address: 'A', cwd: '/a' }); await p.read();
  a.resolve({ stdout: '{"model":"stale-A"}' }); await pending;
  assert.equal(p.view.channel('codex').data, null);
});
test('render with model and reasoning data succeeds and shell focus clears data immediately', async () => {
  const p = panel(); await p.read(); assert.doesNotThrow(() => p.view.render(p.cx));
  p.switchTo({ app: 'shell', address: 'B', cwd: '/b' });
  assert.equal(p.view.model().codex, null);
});
test('Kimi and Antigravity show reset timelines beside unchanged quota values', async () => {
  const now = Date.now();
  const fiveHourReset = Math.floor((now + 2 * 60 * 60 * 1000) / 1000);
  const weeklyReset = Math.floor((now + 3 * 24 * 60 * 60 * 1000) / 1000);
  const quotas = { fiveHour: { left: 80, resetsAt: fiveHourReset }, weekly: { left: 60, resetsAt: weeklyReset } };
  const p = panel();
  p.switchTo({ app: 'agy' });
  p.context.exec = async () => ({ stdout: JSON.stringify(quotas) });
  await p.view.refreshSession(p.cx);
  assert.equal(p.view.model().fiveHour, 80);
  assert.equal(p.view.model().weekly, 60);
  assert.equal(p.view.model().fiveHourReset, fiveHourReset);
  p.view.render(p.cx);
  assert.ok(p.children.includes(data.formatResetTime(fiveHourReset, now).split(' ').pop()));
  assert.ok(p.children.includes(data.formatResetTime(weeklyReset, now).split(' ').pop()));
  assert.ok(!p.children.includes('5-hour left'));
  assert.ok(!p.children.includes('Weekly left'));

  p.switchTo({ app: 'kimi-code' });
  p.view.limits = { data: quotas, readAt: now, account: { credential: 'test' } };
  p.view.setChannel('usage', { state: 'ready', data: { percent: 42 }, observedAt: now });
  assert.equal(p.view.model().fiveHour, 80);
  assert.equal(p.view.model().fiveHourReset, fiveHourReset);
  assert.doesNotThrow(() => p.view.render(p.cx));
});
test('late Git result does not overwrite the next workspace', async () => {
  const p = panel(), a = deferred(); p.context.exec = () => a.promise;
  const pending = p.view.refreshGit(p.cx);
  p.switchTo({ address: 'B', cwd: '/b' }); await p.view.refreshGit(p.cx);
  a.resolve({ code: 0, stdout: '# branch.head old-A' }); await pending;
  assert.equal(p.view.channel('git').data, null);
});
test('Kiro credit card uses decimal session spend and never percentage quotas', async () => {
  const p = panel(); p.switchTo({ app: 'kiro-cli' });
  p.context.exec = async () => ({ stdout: JSON.stringify({ creditUsage: { used: 1234.56, unit: 'credits', scope: 'session' }, context: { percent: 42 }, weekly: { left: 50 } }) });
  await p.view.refreshSession(p.cx);
  assert.equal(p.view.model().credits, 1234.56);
  assert.equal(p.view.model().weekly, null);
  p.view.render(p.cx);
  assert.ok(p.children.includes('Kiro credits'));
  assert.ok(p.children.includes('1234.56 credits'));
  assert.ok(p.children.includes('本会话已用'));
  assert.ok(!p.children.includes('Available quota'));
  assert.ok(p.children.includes('Context'));
});
test('Kiro distinguishes zero credits from unavailable credits', async () => {
  for (const value of [0, null]) {
    const p = panel(); p.switchTo({ app: 'kiro' });
    p.context.exec = async () => ({ stdout: JSON.stringify({ credits: value }) });
    await p.view.refreshSession(p.cx); p.view.render(p.cx);
    assert.equal(p.children.includes('0.00 credits'), value === 0);
    assert.ok(p.children.includes('正在读取账户额度…'));
    assert.ok(!p.children.includes('Available quota'));
  }
});
test('Kiro account quota renders even when no matching session log exists', async () => {
  const p = panel(); p.switchTo({ app: 'kiro-cli' });
  p.context.exec = async (_cmd, args) => ({ stdout: JSON.stringify(args[0].endsWith('kiro-account.cjs')
    ? { state: 'ready', capturedAt: Date.now(), data: { planName: 'KIRO FREE', resetsOn: '2026-12-01',
      plan: { used: 0, total: 50, remaining: 50 }, bonus: [{ name: 'kiroween2026', used: 0, total: 4000, remaining: 4000 }] } }
    : { error: 'Waiting for matching Kiro session' }) });
  await p.view.refreshSession(p.cx); p.view.render(p.cx);
  assert.ok(p.children.includes('50'));
  assert.ok(p.children.includes('4000'));
  assert.ok(p.children.includes('Plan left'));
  assert.ok(p.children.includes('Bonus left'));
  assert.ok(p.children.includes('cr'));
  assert.ok(p.children.includes('Auto refresh'));
});
test('Kiro account errors remain visible even without a matching session log', async () => {
  const p = panel(); p.switchTo({ app: 'kiro-cli' });
  p.context.exec = async (_cmd, args) => ({ stdout: JSON.stringify(args[0].endsWith('kiro-account.cjs')
    ? { state: 'error', source: 'api', data: null, message: 'Kiro 登录已失效' }
    : { error: 'Waiting for matching Kiro session' }) });
  await p.view.refreshSession(p.cx); p.view.render(p.cx);
  assert.ok(p.children.includes('Kiro 登录已失效'));
  assert.ok(!p.children.includes('正在读取账户额度…'));
});
function switcher() {
  const state = new Map(); let writes = 0;
  const context = load('mods/zero-herdr/switcher.js', { ...data, Date, PICK_KEY: 'pick', SWITCH_KEY: 'switch',
    shared: k => state.get(k), setShared: (k, v) => state.set(k, v), notify() {},
    hc: async ([command]) => { if (command === 'get') return { stdout: '{"status":{"app":"codex"}}' }; if (command === 'read') return { stdout: '› Ask Codex to do anything' }; writes++; return { code: 0 }; },
  }, 'globalThis.api = { attemptSwitch, invalidateSwitch, noteCodexData };');
  return { context, api: context.api, state, writes: () => writes, pick: { seq: 1, address: 'A', kind: 'model', value: 'test' } };
}
test('cancellation during screen read prevents all keyboard injection', async () => {
  const s = switcher(), d = deferred(); let writes = 0;
  s.context.hc = async ([cmd]) => { if (cmd === 'get') return { stdout: '{"status":{"app":"codex"}}' }; if (cmd === 'read') return d.promise; writes++; return { code: 0 }; };
  const pending = s.api.attemptSwitch(s.pick); await new Promise(setImmediate);
  s.api.invalidateSwitch('target changed'); d.resolve({ stdout: '› Ask Codex to do anything' }); await pending;
  assert.equal(writes, 0); assert.equal(s.state.get('switch').state, 'error');
});
test('draft refuses keys; fresh confirmation changes awaiting to success; duplicates are ignored', async () => {
  const s = switcher(); await s.api.attemptSwitch(s.pick); await s.api.attemptSwitch(s.pick);
  assert.equal(s.writes(), 1); assert.equal(s.state.get('switch').state, 'awaiting');
  assert.equal(s.api.noteCodexData({ model: 'test' }, 'A'), true);
  assert.equal(s.state.get('switch').state, 'success');
  const d = switcher(); d.context.hc = async ([cmd]) => ({ stdout: cmd === 'get' ? '{"status":{"app":"codex"}}' : '› my unsent draft' });
  await d.api.attemptSwitch(d.pick); assert.equal(d.writes(), 0); assert.equal(d.state.get('switch').state, 'error');
});
test('file list renders read failures and loading status', () => {
  const labels = [];
  const el = new Proxy({}, { get: (_, key) => key === 'when' ? (b, yes, no) => { if (b) yes(el); else if (no) no(el); return el; } : key === 'child' ? (...v) => { labels.push(...v); return el; } : () => el });
  const ctx = load('mods/files/main.js', { View: class {}, div: () => el, svg: () => el, h_flex: () => el, v_flex: () => el, theme: () => ({}), T: { hit: {} }, UI: '', spaces: () => [{active: true, id:'s', folder:'/repo'}], panes: () => [], focused: () => ({}), layout: () => null, closePanelSmooth: () => {}, panelClosing: () => false, panelMotion: (node) => node, trackPanelReveal: () => true }, 'globalThis.Files = Files; globalThis.keyForTest = key;');
  const view = Object.assign(new ctx.Files(), { entries: new Map(), marks: {}, folders: new Set(), context: { key: ctx.keyForTest() }, root: '/repo', error: 'Permission denied' });
  view.render({}); assert.ok(labels.includes('Permission denied'));
  labels.length = 0; view.error = null; view.loading = true; view.render({}); assert.ok(labels.includes('Loading files…'));
});
