import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { agents, layout, theme } from "herdr";
import { glassBg, glassOn, openPanelSmooth, withAlpha } from "./zero-kit.js";

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export default class ZeroHerdrToggle extends View {
  render() {
    const panel = findNode(layout(), "zero-herdr");
    if (!panel || !panel.hidden) return div();

    const t = theme();
    const glass = glassOn();
    const agentList = agents();
    const status = agentList.some((agent) => agent.status === "blocked")
      ? "blocked"
      : agentList.some((agent) => agent.status === "working")
        ? "working"
        : agentList.some((agent) => agent.status === "done")
          ? "done"
          : "idle";
    const color = t[status] ?? t.dim;

    return v_flex()
      .id("status-toggle-open")
      .w(30)
      .h(64)
      .items_center()
      .justify_center()
      .gap(10)
      .rounded(9)
      .bg(glass ? glassBg(t.surface, "70", true) : t.surface)
      .when(glass, (el) => el.border(0.5).border_color(withAlpha(t.foreground, "24")))
      .cursor_pointer()
      .text_color(t.dim)
      .hover((style) => style.bg(glass ? glassBg(t.hover, "96", true) : t.hover).text_color(t.foreground))
      .tooltip("All spaces' agent status · open the panel")
      .on_click(() => openPanelSmooth("zero-herdr"))
      .child(
        div()
          .size(6)
          .rounded_full()
          .bg(color)
          .when(status === "working", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1600 }))
      )
      .child(svg("mods/zero-ui/icons/panel-right.svg").size(15));
  }
}
