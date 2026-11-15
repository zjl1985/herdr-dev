import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, exec, notify, props, theme, window } from "herdr";

const ACTIONS = [
  { id: "finder", label: "Open in Finder", icon: "mods/files/folder.svg" },
  { id: "zed", label: "Open with Zed", icon: "mods/workspace-chrome/square-pen.svg" },
];

export default class FilesMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.highlight = 0;
    this.handle.focus();
    // G04: "open" exists on macOS only; other platforms get disabled rows.
    this.supported = window()?.platform === "macos";
  }

  choose(action, cx) {
    const target = props();
    closeOverlay(target?.overlay);
    cx.spawn(async () => {
      const args = action.id === "finder"
        ? target.dir ? [target.path] : ["-R", target.path]
        : ["-a", "Zed", target.path];
      try {
        const result = await exec("open", args);
        if (result.code !== 0) throw new Error(result.stderr || "Cannot open this path");
      } catch (error) {
        notify({ title: action.label, body: String(error.message ?? error), level: "warning" });
      }
    });
  }

  render() {
    const t = theme();
    return v_flex().id("files-menu").track_focus(this.handle).w_full().p(5).gap(2).bg(t.popover).text_size(12)
      .on_key_down((event, cx) => {
        if (event.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
        else if (event.key === "down") { this.highlight = Math.min(this.highlight + 1, ACTIONS.length - 1); cx.stop_propagation(); cx.notify(); }
        else if (event.key === "up") { this.highlight = Math.max(this.highlight - 1, 0); cx.stop_propagation(); cx.notify(); }
        else if (event.key === "enter" && this.supported) { this.choose(ACTIONS[this.highlight], cx); cx.stop_propagation(); }
      })
      .children(ACTIONS.map((action, i) => h_flex().id(`file-action-${action.id}`).h(31).px(8).gap(9).rounded(7).items_center()
        .when(this.supported && i === this.highlight, s => s.bg(t.hover))
        .text_color(this.supported ? t.foreground : t.dim).cursor_pointer()
        .hover(s => s.bg(t.hover))
        .on_click((_event, cx) => this.supported && this.choose(action, cx))
        .child(svg(`mods/zero-ui/icons/${action.id === "finder" ? "folder" : "square-pen"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(action.label))))
      .when(!this.supported, el => el.child(div().px(8).py(4).text_size(10.5).text_color(t.dim).child("Opening in Finder or Zed works on macOS only")));
  }
}
