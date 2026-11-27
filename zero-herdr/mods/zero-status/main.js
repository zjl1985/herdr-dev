import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, focused, layout, home, theme, run, window as appWindow, keys } from "herdr";

import { UI, MONO } from "./zero-tokens.js";
import { closePanelSmooth, depthTokens, glassBg, glassOn, gradientLayer, openPanelSmooth, setGlassMode, syncGlassLayout, withAlpha } from "./zero-kit.js";

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function shortPath(cwd, homeDir) {
  if (!cwd) return "";
  if (cwd === homeDir) return "~";
  if (homeDir && cwd.startsWith(homeDir + "/")) return "~" + cwd.slice(homeDir.length);
  return cwd;
}

function keyHint(action, mac) {
  const mod = {
    cmd: mac ? "⌘" : "Ctrl+",
    ctrl: mac ? "⌃" : "Ctrl+",
    shift: mac ? "⇧" : "Shift+",
    alt: mac ? "⌥" : "Alt+",
    option: mac ? "⌥" : "Alt+",
  };
  const binding = keys().find((k) => k.section === "global" && k.action === action);
  if (!binding?.keys) return null;
  const parts = binding.keys.endsWith("--")
    ? [...binding.keys.slice(0, -2).split("-"), "-"]
    : binding.keys.split("-");
  return parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
}

function sep(t) {
  return div().w(1).h(10).flex_none().bg(t.border);
}

function pill(id, t, tip, onClick, glass = false) {
  return h_flex()
    .id(id)
    .h(20)
    .px(6)
    .gap(5)
    .rounded(5)
    .flex_none()
    .items_center()
    .cursor_pointer()
    .hover((s) => s.bg(glass ? glassBg(t.hover, "88", true) : t.hover).text_color(t.foreground))
    .tooltip(tip)
    .on_click(onClick);
}

export default class ZeroStatus extends View {
  init() {
    this._syncedGlassBg = null;
  }

  toggleSidePanel(tabId, cx) {
    const root = layout();
    const panel = findNode(root, "panel");
    const body = findNode(root, "panel-body");
    const isOpen = panel && !panel.hidden && body?.active === tabId;
    if (isOpen) {
      closePanelSmooth("panel", cx);
    } else {
      openPanelSmooth("panel", tabId);
    }
  }

  render() {
    const t = theme();
    const glass = glassOn();
    const d = depthTokens(t, { glass });
    if (glass) {
      const syncKey = `${t.chrome ?? ""}:${t.surface ?? ""}`;
      if (this._syncedGlassBg !== syncKey) {
        this._syncedGlassBg = syncKey;
        syncGlassLayout(t);
      }
    } else {
      this._syncedGlassBg = null;
    }
    const spaceList = spaces();
    const space = spaceList.find((s) => s.active) ?? spaceList[0];
    const foc = focused();
    const allPanes = panes();
    const activePane =
      (foc?.pane ? allPanes.find((p) => p.pane === foc.pane) : null) ??
      allPanes.find((p) => p.focused);
    const list = agents();

    const blockedAgents = list.filter((a) => a.status === "blocked");
    const workingAgents = list.filter((a) => a.status === "working");
    const doneAgents = list.filter((a) => a.status === "done");
    const total = list.length;

    const spaceName = space?.name === "~" ? "Home" : space?.name || "Workspace";
    const hostLabel = space?.machine ? `${space.machine} / ${spaceName}` : spaceName;
    const branch = activePane?.branch ?? space?.branch ?? null;
    const rawCwd = activePane?.cwd ?? space?.folder ?? "";
    const cwd = shortPath(rawCwd, home());
    const cwdLeaf = rawCwd.replace(/\/+$/, "").split("/").pop() || "";
    const showCwd =
      Boolean(cwd) &&
      cwd !== "~" &&
      cwdLeaf.toLowerCase() !== spaceName.toLowerCase();

    const win = appWindow();
    const mac = win?.platform === "macos";
    const paletteKey = keyHint("app.palette", mac);
    const pickerKey = keyHint("mod.open:picker", mac);

    const rootTree = layout();
    const statusPanel = findNode(rootTree, "zero-herdr");
    const statusOpen = Boolean(statusPanel && !statusPanel.hidden);

    // 动态 Agent 聚合状态色与文案
    const urgentStatus =
      blockedAgents.length > 0
        ? "blocked"
        : workingAgents.length > 0
          ? "working"
          : doneAgents.length > 0
            ? "done"
            : "idle";
    const dotColor =
      urgentStatus === "blocked"
        ? t.blocked ?? t.ansi3
        : urgentStatus === "working"
          ? t.accent ?? t.working
          : urgentStatus === "done"
            ? t.done ?? t.ansi2
            : total > 0
              ? t.dim
              : t.border;

    const agentPill = pill(
      "zero-status-agents",
      t,
      blockedAgents.length > 0
        ? "All spaces · jump to the agent waiting for input"
        : workingAgents.length > 0
          ? "All spaces · cycle working agents"
          : total > 0
            ? "All spaces · cycle agents"
            : "No active agents",
      () => {
        const target = blockedAgents[0] ?? doneAgents[0];
        if (target) run("agent.focus", { terminal: target.address });
        else if (total > 0) run("agent.next");
      }
    ).child(
      div()
        .id("zero-status-agent-dot")
        .size(5)
        .flex_none()
        .rounded_full()
        .bg(dotColor)
        .when(urgentStatus === "working", (el) =>
          el.loop("opacity", { from: 0.48, to: 1, period: 1400 })
        )
    );

    if (blockedAgents.length > 0) {
      agentPill
        .child(
          div()
            .text_color(dotColor)
            .font_medium()
            .child(`${blockedAgents.length} needs input`)
        )
        .when(total > blockedAgents.length, (el) =>
          el.child(div().text_color(t.dim).child(`· ${total}`))
        );
    } else if (workingAgents.length > 0) {
      agentPill
        .child(
          div()
            .text_color(dotColor)
            .font_medium()
            .child(`${workingAgents.length} working`)
        )
        .when(total > workingAgents.length, (el) =>
          el.child(div().text_color(t.dim).child(`· ${total} agents`))
        );
    } else if (doneAgents.length > 0) {
      agentPill
        .child(div().text_color(dotColor).font_medium().child(`${doneAgents.length} finished`))
        .when(total > doneAgents.length, (el) =>
          el.child(div().text_color(t.dim).child(`· ${total} agents`))
        );
    } else {
      agentPill
        .child(
          div()
            .text_color(total > 0 ? t.muted : t.dim)
            .child(`${total} ${total === 1 ? "agent" : "agents"}`)
        )
        .when(total > 0, (el) => el.child(div().text_color(t.dim).child("· idle")));
    }

    return h_flex()
      .id("zero-status-bar")
      .size_full()
      .px(12)
      .gap(6)
      .items_center()
      .bg(glass ? glassBg(t.chrome, "72", true) : t.chrome)
      .when(glass, (el) => el.border_t(1).border_color(withAlpha(t.foreground, "18")))
      .font_family(UI)
      .text_size(11)
      .text_color(t.muted)
      .child(
        pill(
          "zero-status-space",
          t,
          (space?.machine ? `Remote: ${space.machine}` : "This computer") +
            (pickerKey ? ` · Switch (${pickerKey})` : " · Switch space"),
          () => run("mod.open", { name: "picker" }),
          glass
        )
          .child(
            svg(`mods/zero-ui/icons/${space?.machine ? "server" : "monitor"}.svg`)
              .size(11.5)
              .text_color(t.dim)
          )
          .child(div().max_w(160).truncate().font_medium().text_color(t.foreground).child(hostLabel))
      )
      .when(Boolean(branch), (bar) =>
        bar
          .child(sep(t))
          .child(
            pill(
              "zero-status-branch",
              t,
              "Toggle Git changes",
              (_e, cx) => this.toggleSidePanel("changes", cx),
              glass
            )
              .child(svg("mods/zero-ui/icons/branch.svg").size(11.5).text_color(t.accent))
              .child(div().max_w(140).truncate().text_color(t.muted).child(branch))
          )
      )
      .when(showCwd, (bar) =>
        bar
          .child(sep(t))
          .child(
            pill(
              "zero-status-cwd",
              t,
              `${rawCwd || cwd} · Toggle files`,
              (_e, cx) => this.toggleSidePanel("files", cx),
              glass
            ).child(div().max_w(200).truncate().text_color(t.dim).child(cwd))
          )
      )
      .child(sep(t))
      .child(agentPill)
      .child(div().flex_1().min_w(8))
      .child(
        pill(
          "zero-status-glass-toggle",
          t,
          glass ? "Frosted glass on · click for solid UI" : "Solid UI · click for frosted glass",
          (_e, cx) => {
            this._syncedGlassBg = null;
            setGlassMode(!glass, t);
            cx.notify();
          },
          glass
        )
          .child(
            div()
              .size(4)
              .rounded_full()
              .bg(glass ? t.accent : t.dim)
          )
          .child(
            div()
              .text_color(glass ? t.foreground : t.dim)
              .child("Glass")
          )
      )
      .child(sep(t))
      .when(Boolean(statusPanel), (bar) =>
        bar
          .child(
            pill(
              "zero-status-panel-toggle",
              t,
              statusOpen ? "Hide telemetry panel" : "Show telemetry panel",
              (_e, cx) => (statusOpen ? closePanelSmooth("zero-herdr", cx) : openPanelSmooth("zero-herdr")),
              glass
            )
              .child(
                div()
                  .size(4)
                  .rounded_full()
                  .bg(statusOpen ? t.accent : t.dim)
              )
              .child(
                div()
                  .text_color(statusOpen ? t.muted : t.dim)
                  .child("Telemetry")
              )
          )
          .child(sep(t))
      )
      .child(
        pill("zero-status-palette", t, "Command palette", () => run("app.palette"), glass)
          .when(Boolean(paletteKey), (el) => {
            const keyFill = gradientLayer(d.keycapTop, d.keycapBottom);
            return el.child(
              div()
                .relative()
                .overflow_hidden()
                .px(5)
                .h(16)
                .rounded(4)
                .bg(d.keycapBg)
                .border(0.5)
                .border_color(d.keycapBorder)
                .when(!glass, (k) => k.shadow_xs())
                .flex()
                .items_center()
                .text_size(9.5)
                .text_color(t.muted)
                .when(Boolean(keyFill), (k) => k.child(keyFill))
                .child(paletteKey)
            );
          })
          .child(div().text_color(t.dim).child("Commands"))
      );
  }
}
