// Controlled popup for model / reasoning-effort selection (E04-E07).
// Opens as a popup overlay from the right panel's chips; the keyboard comes
// with it (focusable mod): Up/Down move the highlight, Enter picks, Escape
// closes, a click beside the popup closes it natively. The selection rides
// shared("zero.codex.pick") to zero-herdr's switcher; progress
// (sending/awaiting/success/error) comes back over shared("zero.codex.switch").
//
// Known limits: options are a snapshot from open time — a model-catalog
// refresh mid-open requires reopening; rows without a keyboard highlight
// state would be pointer-only, so Up/Down is part of this view.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { closeOverlay, nextCommand, props, run, setShared, shared } from "herdr";
import { UI, MONO, T } from "./zero-tokens.js";
import { palette } from "./zero-theme.js";
import { hint, menuRow } from "./zero-kit.js";
import { PICK_KEY, SWITCH_KEY, PICKER_KEY } from "./switch-shared.js";

export default class ZeroPicker extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.highlight = Math.max(0, (props()?.options ?? []).findIndex(option => option.selected));
    this.handle.focus();
    // Commands wake this view (pane.go / bindings); state changes arrive via
    // shared(), which re-renders every mod on set.
    cx.spawn(async (cx) => {
      for (;;) {
        await nextCommand();
        cx.notify();
      }
    });
  }

  busy() {
    const sw = shared(SWITCH_KEY);
    return sw?.state === "sending" || sw?.state === "awaiting";
  }

  async close() {
    if (shared(PICKER_KEY)?.overlay === props()?.overlay) setShared(PICKER_KEY, null);
  }

  pick(index, cx) {
    const p0 = props();
    const options = p0?.options ?? [];
    const option = options[index];
    if (!option || this.busy()) return;
    if (option.selected) { closeOverlay(p0.overlay); return; }
    // Payload first, then the wake-up command for zero-herdr's loop.
    setShared(PICK_KEY, { seq: Date.now(), kind: p0.kind, value: option.value, address: p0.address });
    run("zero-herdr.pick");
    cx.notify();
  }

  render(_cx) {
    const p = palette();
    const p0 = props();
    const overlay = p0?.overlay;
    const options = p0?.options ?? [];
    const sw = shared(SWITCH_KEY);
    const currentPicker = shared(PICKER_KEY);
    if (currentPicker && currentPicker.overlay !== overlay) return div();
    // E07: a switch that belongs to another target invalidates this menu;
    // a confirmed switch closes it.
    if (sw && p0?.address && sw.address !== p0.address) {
      closeOverlay(overlay);
      return div();
    }
    if (sw?.state === "success") {
      closeOverlay(overlay);
      return div();
    }
    if (this.highlight >= options.length) this.highlight = Math.max(0, options.length - 1);
    const effort = p0?.kind === "effort";
    const current = options[this.highlight];
    const text = (value, size = 12, color = p.text) => div().font_family(UI).text_size(size).text_color(color).child(String(value ?? ''));
    const move = (offset, cx) => {
      if (this.busy()) return;
      this.highlight = Math.max(0, Math.min(options.length - 1, this.highlight + offset));
      cx.notify();
    };

    let status = null;
    if (sw?.state === "sending") status = hint("正在发送…", p.dim).px(10).py(6).font_family(MONO);
    else if (sw?.state === "awaiting") status = hint("请求已发送 — Codex 确认后更新", p.muted).px(10).py(6);
    else if (sw?.state === "error") status = hint(String(sw.message ?? "切换失败"), p.blocked).px(10).py(6);

    return v_flex().id("zero-picker").track_focus(this.handle)
      .w_full().max_h(360).overflow_y_scrollbar().p(12).gap(8).bg(p.popover).border(1).border_color(p.line)
      .font_family(UI).rounded(12)
      .on_key_down((event, cx) => {
        if (event.key === "escape") { closeOverlay(overlay); cx.stop_propagation(); }
        else if ((event.key === "down" || event.key === "right") && options.length) { move(1, cx); cx.stop_propagation(); }
        else if ((event.key === "up" || event.key === "left") && options.length) { move(-1, cx); cx.stop_propagation(); }
        else if (event.key === "enter") { this.pick(this.highlight, cx); cx.stop_propagation(); }
      })
      .child(text(effort ? 'Reasoning effort' : 'Model', 12, p.muted))
      .when(effort && Boolean(current), el => el
        .child(text(current.label, 22).font_weight(500))
        .child(h_flex().w_full().items_center().gap(3).py(8)
          .children(options.map((option, i) => div().id('effort-step-' + option.value).flex_1().min_w(0).h(32)
            .rounded(8).flex().items_center().justify_center().bg(i === this.highlight ? p.selected : p.inset)
            .cursor_pointer().hover(s => s.bg(p.hover)).tooltip(option.label)
            .on_click((_e, cx) => { if (!this.busy()) { this.highlight = i; cx.notify(); } })
            .child(div().size(i === this.highlight ? 8 : 5).rounded_full().bg(i === this.highlight ? p.accent : p.muted)))))
        .child(h_flex().w_full().justify_between().child(text(options[0]?.label, 10.5, p.muted))
          .child(text(options[options.length - 1]?.label, 10.5, p.muted)))
        .child(div().id('effort-apply').w_full().h(32).mt(6).rounded(8).bg(p.selected)
          .flex().items_center().justify_center().cursor_pointer().hover(s => s.bg(p.hover))
          .on_click((_e, cx) => this.pick(this.highlight, cx))
          .child(text(this.busy() ? 'Waiting for confirmation…' : current.selected ? 'Keep current setting' : 'Apply ' + current.label, 12)))
        .child(text('← → select · Enter apply · Esc close', 10.5, p.muted)))
      .when(options.length === 0, (el) => el.child(hint("模型目录尚未就绪", p.dim).px(8).py(6)))
      .when(!effort, el => el.children(options.map((option, i) =>
        menuRow("zero-picker-" + option.value, { selected: Boolean(option.selected), highlighted: i === this.highlight },
          div().flex_1().min_w(0).truncate().text_size(T.type.body).child(String(option.label ?? option.value)),
          div().text_size(T.type.body).text_color(option.selected ? p.accent : p.dim).child(option.selected ? "✓" : ""))
          .on_click((_e, cx) => this.pick(i, cx)))))
      .when(Boolean(status), (el) => el.child(status));
  }
}
