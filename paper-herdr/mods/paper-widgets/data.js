import { agents, panes, shared, spaces } from 'herdr';

/** The terminal the widgets describe: the focused agent of the shown tab, else its focused pane. */
export function lead() {
  const sp = spaces().find((s) => s.active) ?? spaces()[0];
  const tab = sp?.tabs?.find((x) => x.active) ?? sp?.tabs?.[0];
  const list = agents().filter((a) => a.space === sp?.id && a.tab === tab?.id);
  const agent = list.find((a) => a.focused) ?? list[0] ?? null;
  const pane = panes().find((p) => p.pane === agent?.pane) ?? panes().find((p) => p.tab === tab?.id && p.focused) ?? null;
  return { sp, tab, agent, pane };
}

/** Which status reader, if any, applies to this agent. */
export function kindOf(agent) {
  if (!agent) return null;
  const app = agent.app;
  const key = agent.program?.key;
  const name = (agent.program?.name ?? '').toLowerCase();
  if (app === 'codex') return 'codex';
  if (app === 'kiro' || key === 'kiro') return 'kiro';
  if (app === 'antigravity' || app === 'agy' || key === 'antigravity' || name.includes('antigravity')) return 'agy';
  if (app === 'kimi-code') return 'kimi';
  return null;
}

export function kindLabel(kind) {
  return kind === 'codex' ? 'Codex' : kind === 'kiro' ? 'Kiro' : kind === 'agy' ? 'Antigravity' : kind === 'kimi' ? 'Kimi' : null;
}

export function sessionKey(kind, { agent, pane }) {
  if (!kind || !agent) return null;
  return JSON.stringify([kind, agent.address, pane?.cwd, (agent.title ?? '').replace(/^[^\p{L}\p{N}]+/u, '')]);
}

/** Address + cwd only, so a title change can re-read without flashing empty. */
export function sessionBase(kind, { agent, pane }) {
  if (!kind || !agent) return null;
  return JSON.stringify([kind, agent.address, pane?.cwd]);
}

/** Session payload published by the context widget; ignored when it no longer matches the focused agent. */
export function currentSession() {
  const l = lead();
  const kind = kindOf(l.agent);
  const stored = shared('paper.session');
  const base = sessionBase(kind, l);
  const data = stored && stored.kind === kind && stored.base === base ? stored.data : null;
  return { l, kind, key: sessionKey(kind, l), base, data };
}

export function parseGitStatus(output) {
  const r = { branch: null, changed: 0, ahead: 0, behind: 0 };
  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.head ')) r.branch = line.slice(14);
    const m = line.startsWith('# branch.ab ') && line.match(/\+(\d+) -(\d+)/);
    if (m) { r.ahead = Number(m[1]); r.behind = Number(m[2]); }
    if (/^(?:1|2|u|\?) /.test(line)) r.changed += 1;
  }
  return r;
}

export function parseKimiUsage(output) {
  const match = output.match(/context:\s*(\d+(?:\.\d+)?)%\s*\((\d+(?:\.\d+)?[kKM]?)\s*\/\s*(\d+(?:\.\d+)?[kKM]?)\)/);
  if (!match) return null;
  return { percent: Number(match[1]), used: match[2], total: match[3] };
}

export function formatReset(resetsAt) {
  if (resetsAt == null) return null;
  const d = new Date(resetsAt * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const short = (s, home) => (!s ? '' : s === home ? '~' : s.startsWith(home + '/') ? '~' + s.slice(home.length) : s);
