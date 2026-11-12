import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, exec, hc, home, panes, run, setAgentOrder, spaces, theme } from "herdr";

const STATUS = {
  blocked: { label: "Needs input", color: "blocked" },
  working: { label: "Working", color: "working" },
  done: { label: "Finished", color: "done" },
  idle: { label: "Idle", color: "idle" },
  unknown: { label: "Unknown", color: "unknown" },
};

function statusInfo(status) {
  return STATUS[status] ?? STATUS.unknown;
}

function programIcon(program, size, color) {
  if (!program?.icon) return null;
  return program.tint
    ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).w(size).h(size).flex_none();
}

function folder(cwd, homeDir) {
  if (!cwd) return "";
  return cwd === homeDir ? "~" : cwd.startsWith(homeDir + "/") ? "~" + cwd.slice(homeDir.length) : cwd;
}

function formatDuration(ms) {
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

function parseKimiUsage(output) {
  const match = output.match(/context:\s*(\d+(?:\.\d+)?)%\s*\((\d+(?:\.\d+)?[kKM]?)\s*\/\s*(\d+(?:\.\d+)?[kKM]?)\)/);
  if (!match) return null;
  return { percent: Number(match[1]), used: match[2], total: match[3] };
}

function parseKimiLimits(output) {
  const fiveHour = output.match(/5h limit[^\n]*?(\d+(?:\.\d+)?)%\s+used\s+resets in\s+([^\n│]+)/);
  const weekly = output.match(/Weekly limit[^\n]*?(\d+(?:\.\d+)?)%\s+used\s+resets in\s+([^\n│]+)/);
  if (!fiveHour && !weekly) return null;
  return {
    fiveHour: fiveHour ? { percent: Number(fiveHour[1]), resets: fiveHour[2].trim() } : null,
    weekly: weekly ? { percent: Number(weekly[1]), resets: weekly[2].trim() } : null,
  };
}

function taskTitle(agent, tab, space) {
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

export default class ClaudeStatus extends View {
  init(_props, cx) {
    this.git = null;
    this.gitKey = null;
    this.usage = null;
    this.usageKey = null;
    this.limitsLoading = false;
    try {
      this.limits = JSON.parse(localStorage.getItem("kimi.limits") ?? "null");
    } catch {
      this.limits = null;
    }
    this.refreshGit(cx);
    this.refreshUsage(cx);
    cx.timer.after(300, (cx) => {
      if (!this.limits) this.refreshLimits(cx);
    });
    cx.timer.every(5000, (cx) => this.refreshGit(cx));
    cx.timer.every(3000, (cx) => this.refreshUsage(cx));
    cx.timer.every(1000, (cx) => cx.notify());
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

  async refreshUsage(cx) {
    const space = spaces().find((item) => item.active) ?? spaces()[0];
    const agentList = agents().filter((agent) => !space || agent.space === space.id);
    const lead = agentList.find((agent) => agent.status === "blocked")
      ?? agentList.find((agent) => agent.status === "working")
      ?? agentList[0];
    const key = lead?.app === "kimi-code" ? lead.address : null;
    if (key !== this.usageKey) {
      this.usageKey = key;
      this.usage = null;
      cx.notify();
    }
    if (!key) return;
    try {
      const result = await hc(["read", key, "--lines", "12"]);
      const usage = parseKimiUsage(result.stdout ?? "");
      if (key === this.usageKey && usage) this.usage = usage;
    } catch {}
    cx.notify();
  }

  refreshLimits(cx) {
    const key = this.usageKey;
    if (!key || this.limitsLoading) return;
    this.limitsLoading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await hc(["keys", key, "esc"]);
        await hc(["send", key, "/usage"]);
        cx.timer.after(1200, (cx) => {
          cx.spawn(async (cx) => {
            try {
              const result = await hc(["read", key, "--lines", "45"]);
              const limits = parseKimiLimits(result.stdout ?? "");
              if (limits && key === this.usageKey) {
                this.limits = { ...limits, readAt: Date.now() };
                localStorage.setItem("kimi.limits", JSON.stringify(this.limits));
              }
            } catch {} finally {
              try {
                await hc(["keys", key, "esc"]);
              } catch {}
              this.limitsLoading = false;
              cx.notify();
            }
          });
        });
      } catch {
        this.limitsLoading = false;
        cx.notify();
      }
    });
  }

  render() {
    const t = theme();
    const spaceList = spaces();
    const activeSpace = spaceList.find((space) => space.active) ?? spaceList[0];
    const activeTab = activeSpace?.tabs?.find((tab) => tab.active) ?? activeSpace?.tabs?.[0];
    const paneList = panes();
    const agentList = agents()
      .filter((agent) => !activeSpace || agent.space === activeSpace.id)
      .sort((a, b) => Number(b.focused) - Number(a.focused));
    setAgentOrder(agentList.map((agent) => agent.address));

    const counts = {
      working: agentList.filter((agent) => agent.status === "working").length,
      blocked: agentList.filter((agent) => agent.status === "blocked").length,
      done: agentList.filter((agent) => agent.status === "done").length,
    };
    const lead = agentList.find((agent) => agent.status === "blocked")
      ?? agentList.find((agent) => agent.status === "working")
      ?? agentList[0];
    const leadStatus = statusInfo(lead?.status);
    const homeDir = home();
    const activePane = paneList.find((pane) => pane.tab === activeTab?.id && pane.focused)
      ?? paneList.find((pane) => pane.tab === activeTab?.id);
    const workspaceFolder = activePane?.cwd ?? activeSpace?.folder;
    const workingMs = activeTab?.working_since ? Date.now() - activeTab.working_since : null;
    const leadIcon = programIcon(lead?.program, 15, t[leadStatus.color] ?? t.dim);
    const branch = this.git?.branch ?? activePane?.branch ?? activeSpace?.branch;
    const gitDetails = [];
    if (this.git) gitDetails.push(this.git.changed ? `${this.git.changed} changed` : "Clean");
    if (this.git?.ahead) gitDetails.push(`↑${this.git.ahead}`);
    if (this.git?.behind) gitDetails.push(`↓${this.git.behind}`);

    const agentCard = (agent) => {
      const info = statusInfo(agent.status);
      const color = t[info.color] ?? t.dim;
      const pane = paneList.find((item) => item.pane === agent.pane);
      const name = agent.program?.name ?? "Agent";
      const pic = programIcon(agent.program, 16, color);
      return v_flex()
        .id(`status-agent-${agent.address}`)
        .w_full()
        .bg(t.background)
        .border(1)
        .border_color(agent.focused ? t.input : t.border)
        .rounded(10)
        .p(10)
        .gap(8)
        .cursor_pointer()
        .hover((style) => style.bg(t.hover))
        .on_click(() => {
          if (agent.pane) run("pane.focus", { pane: agent.pane });
          else run("agent.focus", { terminal: agent.address });
        })
        .child(
          h_flex()
            .w_full()
            .items_center()
            .gap(8)
            .child(
              div()
                .size(28)
                .flex_none()
                .rounded(8)
                .bg(t.surface)
                .flex()
                .items_center()
                .justify_center()
                .when(Boolean(pic), (el) => el.child(pic))
                .when(!pic, (el) => el.child(div().size(7).rounded_full().bg(color)))
            )
            .child(
              v_flex()
                .flex_1()
                .min_w(0)
                .gap(2)
                .child(div().truncate().text_size(12).font_medium().text_color(t.foreground).child(name))
                .child(div().truncate().text_size(10).text_color(t.dim).child(agent.space_name ?? activeSpace?.name ?? "Space"))
            )
            .when(agent.status === "working", (el) =>
              el.child(svg("mods/workspace-chrome/spinner.svg").size(13).flex_none().text_color(color).spin(900))
            )
        )
        .child(
          h_flex()
            .w_full()
            .items_center()
            .justify_between()
            .child(
              h_flex()
                .items_center()
                .gap(5)
                .child(div().size(5).rounded_full().bg(color))
                .child(div().text_size(10).text_color(color).child(info.label))
            )
            .child(
              div()
                .flex_1()
                .min_w(0)
                .pl(8)
                .truncate()
                .text_size(9)
                .text_color(t.dim)
                .child(folder(pane?.cwd, homeDir))
            )
        );
    };

    return v_flex()
      .id("claude-status-root")
      .size_full()
      .bg(t.surface)
      .border(1)
      .border_color(t.border)
      .rounded(12)
      .p(14)
      .gap(12)
      .overflow_y_scrollbar()
      .child(
        h_flex()
          .w_full()
          .items_center()
          .justify_between()
          .child(
            h_flex()
              .items_center()
              .gap(7)
              .child(div().size(7).rounded_full().bg(t[leadStatus.color] ?? t.dim))
              .child(div().text_size(11).font_semibold().text_color(t.foreground).child("WORKSPACE"))
          )
          .child(
            h_flex()
              .items_center()
              .gap(8)
              .child(div().text_size(9).font_medium().text_color(t[leadStatus.color] ?? t.dim).child(leadStatus.label.toUpperCase()))
              .child(
                div()
                  .id("status-close")
                  .size(22)
                  .rounded(6)
                  .flex()
                  .items_center()
                  .justify_center()
                  .cursor_pointer()
                  .text_color(t.dim)
                  .hover((style) => style.bg(t.hover).text_color(t.foreground))
                  .tooltip("Hide workspace status")
                  .on_click(() => run("layout.hide", { id: "agent-status" }))
                  .child(svg("mods/workspace-chrome/panel-right.svg").size(13))
              )
          )
      )
      .child(
        v_flex()
          .w_full()
          .bg(t.background)
          .border(1)
          .border_color(t.border)
          .rounded(10)
          .p(12)
          .gap(7)
          .child(
            h_flex()
              .w_full()
              .items_center()
              .justify_between()
              .child(div().text_size(9).font_semibold().text_color(t.dim).child("CURRENT TASK"))
              .when(workingMs !== null, (el) =>
                el.child(div().text_size(10).font_medium().text_color(t.working).child(formatDuration(workingMs)))
              )
          )
          .child(div().w_full().truncate().text_size(14).font_semibold().text_color(t.foreground).child(taskTitle(lead, activeTab, activeSpace)))
          .child(
            h_flex()
              .items_center()
              .gap(6)
              .when(Boolean(leadIcon), (el) => el.child(leadIcon))
              .child(div().text_size(10).text_color(t.muted).child(lead?.program?.name ?? "No active agent"))
              .child(div().text_size(10).text_color(t[leadStatus.color] ?? t.dim).child(`· ${leadStatus.label}`))
          )
      )
      .when(lead?.app === "kimi-code" && this.usage, (el) =>
        el.child(
          v_flex()
            .id("kimi-context")
            .w_full()
            .bg(t.background)
            .border(1)
            .border_color(t.border)
            .rounded(10)
            .p(12)
            .gap(8)
            .child(
              h_flex()
                .w_full()
                .items_center()
                .justify_between()
                .child(div().text_size(9).font_semibold().text_color(t.dim).child("KIMI CONTEXT"))
                .child(div().text_size(13).font_semibold().text_color(t.accent).child(`${this.usage.percent}%`))
            )
            .child(
              div()
                .w_full()
                .h(4)
                .bg(t.border)
                .rounded_full()
                .child(
                  div()
                    .h_full()
                    .w(Math.round(220 * Math.min(100, this.usage.percent) / 100))
                    .rounded_full()
                    .bg(t.accent)
                )
            )
            .child(div().text_size(10).text_color(t.muted).child(`${this.usage.used} / ${this.usage.total} tokens`))
            .when(this.limits?.fiveHour, (el) =>
              el.child(
                h_flex()
                  .w_full()
                  .items_center()
                  .justify_between()
                  .child(div().text_size(10).text_color(t.foreground).child("5h limit"))
                  .child(div().text_size(9).text_color(t.muted).child(`${this.limits.fiveHour.percent}% used · resets in ${this.limits.fiveHour.resets}`))
              )
            )
            .when(this.limits?.weekly, (el) =>
              el.child(
                h_flex()
                  .w_full()
                  .items_center()
                  .justify_between()
                  .child(div().text_size(10).text_color(t.foreground).child("Weekly limit"))
                  .child(div().text_size(9).text_color(t.muted).child(`${this.limits.weekly.percent}% used · resets in ${this.limits.weekly.resets}`))
              )
            )
            .child(
              h_flex()
                .w_full()
                .justify_end()
                .child(
                  div()
                    .id("refresh-kimi-limits")
                    .px(5)
                    .py(2)
                    .rounded(4)
                    .cursor_pointer()
                    .text_size(8)
                    .text_color(t.dim)
                    .hover((style) => style.bg(t.hover).text_color(t.foreground))
                    .tooltip("Refresh plan limits")
                    .on_click((_event, cx) => this.refreshLimits(cx))
                    .child(this.limitsLoading ? "Refreshing…" : "Refresh limits")
                )
            )
        )
      )
      .child(
        v_flex()
          .w_full()
          .bg(t.background)
          .border(1)
          .border_color(t.border)
          .rounded(10)
          .p(12)
          .gap(7)
          .child(div().w_full().truncate().text_size(14).font_semibold().text_color(t.foreground).child(activeSpace?.name ?? "No workspace"))
          .child(div().w_full().truncate().text_size(10.5).text_color(t.muted).child(folder(workspaceFolder, homeDir)))
          .when(Boolean(branch), (el) =>
            el.child(
              h_flex()
                .w_full()
                .items_center()
                .justify_between()
                .child(div().flex_1().min_w(0).truncate().text_size(10).font_medium().text_color(t.accent).child(branch))
                .child(div().flex_none().pl(6).text_size(9).text_color(t.dim).child(gitDetails.join(" · ")))
            )
          )
          .child(
            div()
              .pt(3)
              .text_size(10)
              .text_color(t.dim)
              .child(`${activeSpace?.tabs?.length ?? 0} tabs · ${agentList.length} agents`)
          )
          .child(
            h_flex()
              .w_full()
              .items_center()
              .gap(8)
              .child(div().text_size(9).text_color(t.working).child(`${counts.working} working`))
              .child(div().text_size(9).text_color(t.blocked).child(`${counts.blocked} needs input`))
              .child(div().text_size(9).text_color(t.done).child(`${counts.done} finished`))
          )
      )
      .child(
        h_flex()
          .w_full()
          .items_center()
          .justify_between()
          .child(div().text_size(10).font_semibold().text_color(t.dim).child("AGENTS"))
          .child(div().text_size(9).text_color(t.dim).child(String(agentList.length)))
      )
      .when(agentList.length === 0, (el) =>
        el.child(
          v_flex()
            .w_full()
            .bg(t.background)
            .border(1)
            .border_color(t.border)
            .rounded(10)
            .p(16)
            .items_center()
            .gap(5)
            .child(div().text_size(12).text_color(t.muted).child("No active agents"))
            .child(div().text_size(10).text_color(t.dim).child("Start an agent in a terminal"))
        )
      )
      .children(agentList.map(agentCard))
      .child(div().flex_1())
      .child(
        h_flex()
          .w_full()
          .items_center()
          .justify_center()
          .gap(5)
          .child(div().size(5).rounded_full().bg(t.done))
          .child(div().text_size(9).text_color(t.dim).child("LIVE · HERDR + GIT"))
      );
  }
}
