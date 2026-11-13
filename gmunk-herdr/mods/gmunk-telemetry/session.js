import { View } from "gpui-kit";
import { agents, appHome, exec, hc, home, notify, panes, run, spaces } from "herdr";

export function folder(cwd, homeDir) {
  if (!cwd) return "";
  return cwd === homeDir ? "~" : cwd.startsWith(homeDir + "/") ? "~" + cwd.slice(homeDir.length) : cwd;
}

export function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function parseGitStatus(output) {
  const result = { branch: null, changed: 0, ahead: 0, behind: 0 };
  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) result.branch = line.slice(14);
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        result.ahead = Number(match[1]);
        result.behind = Number(match[2]);
      }
    }
    if (/^(?:1|2|u|\?) /.test(line)) result.changed += 1;
  }
  return result;
}

export function taskTitle(agent, tab, space) {
  if (tab?.named && tab.name) return tab.name;
  const title = (agent?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const generic = [agent?.program?.name, agent?.app, agent?.address, space?.name]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (title && !generic.includes(title.toLowerCase()) && !/^t[0-9a-z]+$/i.test(title) && !/^[~/]/.test(title)) {
    return title;
  }
  return space?.name ?? "No active task";
}

export default class SessionSource extends View {
  init(_props, cx) {
    this.picker = null;
    this.switching = false;
    this.codex = null;
    this.codexKey = null;
    this.codexLoading = false;
    this.git = null;
    this.gitKey = null;
    this.refreshGit(cx);
    cx.spawn(cx=>this.refreshCodex(cx));
    cx.timer.every(3000,cx=>cx.spawn(cx=>this.refreshCodex(cx)));
    cx.timer.every(5000,cx=>this.refreshGit(cx));
    cx.timer.every(1000, (cx) => {
      const tab = spaces().find((s) => s.active)?.tabs.find((t) => t.active);
      if (tab?.working_since) cx.notify();
    });
  }

  togglePicker(kind, address, cx) {
    this.picker = this.picker?.kind === kind && this.picker?.address === address ? null : { kind, address };
    cx.notify();
  }

  async selectCodexOption(agent, selection, cx) {
    if (this.switching) return;
    this.switching = true;
    cx.notify();
    try {
      const option = selection.model ?? selection.effort;
      if (!/^[a-zA-Z0-9._-]+$/.test(option)) throw new Error('Invalid model option');
      // Recheck the target and composer; never clear or submit a user's draft.
      const terminal = JSON.parse((await hc(['get', agent.address])).stdout);
      if (terminal.status?.app !== 'codex') throw new Error('This terminal is no longer running Codex.');
      const screen = (await hc(['read', agent.address, '--lines', '80'])).stdout ?? '';
      const prompt = screen.split('\n').filter(line => /^\s*›/.test(line)).pop()?.trim();
      if (prompt !== '› Ask Codex to do anything') {
        throw new Error('请先收起 CLI 弹窗并处理输入框中的草稿，再选择模型或推理强度。');
      }
      const command = selection.model ? '/model ' + selection.model : '/model --reasoning=' + selection.effort;
      run('pane.focus', { pane: agent.pane });
      const result = await hc(['keys', agent.address, ...Array.from(command, ch => ch === ' ' ? 'space' : ch), 'enter']);
      if (result.code !== 0) throw new Error('Codex did not accept the switch command.');
      this.picker = null;
      notify({ title: '已发送切换请求', body: 'Codex 确认后，右侧会更新。', timeout: 2500 });
    } catch (error) {
      notify({ title: '暂时无法切换', body: String(error.message ?? error), level: 'warning' });
    } finally { this.switching = false; cx.notify(); }
  }

  async refreshCodex(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.[0];
    const list = agents().filter((agent) => agent.space === space?.id && agent.tab === tab?.id);
    const lead = list.find((agent) => agent.focused) ?? list[0];
    const pane = panes().find((item) => item.pane === lead?.pane);
    const key = lead?.app === "codex" ? JSON.stringify([lead.address, pane?.cwd, lead.title?.replace(/^[^\p{L}\p{N}]+/u, "")]) : null;
    if (key !== this.codexKey) { this.codexKey = key; this.codex = null; cx.notify(); }
    if (!key || this.codexLoading) return;
    if (space?.machine) { this.codex = { error: "Codex data is available on local terminals" }; cx.notify(); return; }
    this.codexLoading = true;
    try {
      const result = await exec("node", [appHome() + "/mods/gmunk-telemetry/codex-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 });
      if (key === this.codexKey) this.codex = JSON.parse(result.stdout);
    } catch { if (key === this.codexKey) this.codex = { error: "Codex session data unavailable" }; }
    finally { this.codexLoading = false; cx.notify(); }
  }

  async refreshGit(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.[0];
    const cwd = panes().find((pane) => pane.tab === tab?.id && pane.focused)?.cwd ?? space?.folder;
    const key = `${space?.machine ?? ""}:${cwd ?? ""}`;
    if (key !== this.gitKey) {
      this.gitKey = key;
      this.git = null;
      cx.notify();
    }
    if (!cwd) return;
    try {
      const result = await exec("git", ["status", "--porcelain=v2", "--branch"], {
        cwd,
        on: space?.machine,
        timeout: 5000,
      });
      if (key === this.gitKey) this.git = result.code === 0 ? parseGitStatus(result.stdout) : null;
    } catch {
      if (key === this.gitKey) this.git = null;
    }
    cx.notify();
  }

}
