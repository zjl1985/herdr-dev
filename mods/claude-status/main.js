import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, home, panes, run, setAgentOrder, spaces, theme } from "herdr";

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

export default class ClaudeStatus extends View {
  render() {
    const t = theme();
    const spaceList = spaces();
    const activeSpace = spaceList.find((space) => space.active) ?? spaceList[0];
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

    const summary = (id, value, label, color) =>
      v_flex()
        .id(id)
        .flex_1()
        .min_w(0)
        .bg(t.background)
        .border(1)
        .border_color(t.border)
        .rounded(9)
        .py(10)
        .px(4)
        .items_center()
        .gap(3)
        .child(div().text_size(17).font_semibold().text_color(color).child(String(value)))
        .child(div().text_size(9).text_color(t.dim).child(label));

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
      .gap(14)
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
          .child(div().w_full().truncate().text_size(15).font_semibold().text_color(t.foreground).child(activeSpace?.name ?? "No workspace"))
          .child(div().w_full().truncate().text_size(10.5).text_color(t.muted).child(activeSpace?.folder ?? ""))
          .when(Boolean(activeSpace?.branch), (el) =>
            el.child(div().text_size(10).text_color(t.accent).child(activeSpace.branch))
          )
          .child(
            div()
              .pt(3)
              .text_size(10)
              .text_color(t.dim)
              .child(`${activeSpace?.tabs?.length ?? 0} tabs · ${agentList.length} agents`)
          )
      )
      .child(
        h_flex()
          .w_full()
          .gap(6)
          .child(summary("status-working", counts.working, "WORKING", t.working))
          .child(summary("status-blocked", counts.blocked, "NEEDS INPUT", t.blocked))
          .child(summary("status-done", counts.done, "FINISHED", t.done))
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
          .child(div().text_size(9).text_color(t.dim).child("LIVE · HERDR ONLY"))
      );
  }
}
