import { agents, panes, spaces } from 'herdr';

/** The terminal the widgets describe: the focused agent of the shown tab, else its focused pane. */
export function lead() {
  const sp = spaces().find((s) => s.active) ?? spaces()[0];
  const tab = sp?.tabs?.find((x) => x.active) ?? sp?.tabs?.[0];
  const list = agents().filter((a) => a.space === sp?.id && a.tab === tab?.id);
  const agent = list.find((a) => a.focused) ?? list[0] ?? null;
  const pane = panes().find((p) => p.pane === agent?.pane) ?? panes().find((p) => p.tab === tab?.id && p.focused) ?? null;
  return { sp, tab, agent, pane };
}

export function codexKey({ agent, pane }) {
  return agent?.app === 'codex'
    ? JSON.stringify([agent.address, pane?.cwd, (agent.title ?? '').replace(/^[^\p{L}\p{N}]+/u, '')])
    : null;
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

export const short = (s, home) => (!s ? '' : s === home ? '~' : s.startsWith(home + '/') ? '~' + s.slice(home.length) : s);
