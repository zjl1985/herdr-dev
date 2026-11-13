import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, exec, notify, props, theme } from "herdr";

const ACTIONS = [
  { id: "finder", label: "Open in Finder", icon: "mods/files/folder.svg" },
  { id: "zed", label: "Open with Zed", icon: "mods/workspace-chrome/square-pen.svg" },
];

export default class FilesMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
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
    return v_flex().id("files-menu").track_focus(this.handle).w_full().p(5).gap(2).bg(t.popover).text_size(12.8)
      .on_key_down((event, cx) => {
        if (event.key === "escape") closeOverlay(props()?.overlay);
        else if (event.key === "enter") this.choose(ACTIONS[0], cx);
      })
      .children(ACTIONS.map(action => h_flex().id(`file-action-${action.id}`).h(31).px(8).gap(9).rounded(7).items_center()
        .text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_event, cx) => this.choose(action, cx))
        .child(svg(action.icon).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(action.label))));
  }
}
