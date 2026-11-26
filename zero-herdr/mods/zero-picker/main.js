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
import { hint, menuRow, motionOn, withAlpha } from "./zero-kit.js";
import { PICK_KEY, SWITCH_KEY, PICKER_KEY } from "./switch-shared.js";

function effortMeta(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "none" || key === "off") return { label: "Off", hint: "No extended thinking", colorKey: "muted", rank: 0, shimmer: 0 };
  if (key === "minimal" || key === "min") return { label: "Minimal", hint: "Fastest · minimal reasoning", colorKey: "done", rank: 1, shimmer: 0 };
  if (key === "low") return { label: "Low", hint: "Fast & light reasoning", colorKey: "done", rank: 1, shimmer: 0 };
  if (key === "medium" || key === "med") return { label: "Medium", hint: "Balanced speed and depth", colorKey: "teal", rank: 2, shimmer: 0 };
  if (key === "high") return { label: "High", hint: "Deep multi-step reasoning", colorKey: "amber", rank: 3, shimmer: 3200 };
  if (key === "xhigh" || key === "extrahigh") return { label: "X-High", hint: "Extended reasoning depth", colorKey: "accent", rank: 4, shimmer: 2300 };
  if (key === "max" || key === "maximum") return { label: "Max", hint: "Heavy maximum compute", colorKey: "blocked", rank: 5, shimmer: 1650 };
  if (key === "ultra") return { label: "Ultra", hint: "Unbounded frontier depth", colorKey: "plum", rank: 6, shimmer: 1150 };
  const raw = String(value ?? "");
  return { label: raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—", hint: "Reasoning effort", colorKey: "accent", rank: 3, shimmer: 0 };
}

function tierColor(p, colorKey) {
  if (colorKey === "done") return p.done;
  if (colorKey === "teal") return p.ansi?.(6) ?? p.done;
  if (colorKey === "amber") return p.ansi?.(3) ?? p.accent;
  if (colorKey === "blocked") return p.blocked;
  if (colorKey === "plum") return p.ansi?.(5) ?? p.accent;
  if (colorKey === "muted") return p.muted;
  return p.accent;
}

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

    const currentMeta = current ? effortMeta(current.value ?? current.label) : null;
    const activeColor = currentMeta ? tierColor(p, currentMeta.colorKey) : p.accent;
    const canApply = Boolean(current) && !current.selected && !this.busy();

    return v_flex().id("zero-picker").track_focus(this.handle)
      .w_full().max_h(360).overflow_y_scrollbar().p(12).gap(8).bg(p.popover).border(1).border_color(p.line)
      .font_family(UI).rounded(12).shadow_lg()
      .on_key_down((event, cx) => {
        if (event.key === "escape") { closeOverlay(overlay); cx.stop_propagation(); }
        else if ((event.key === "down" || event.key === "right") && options.length) { move(1, cx); cx.stop_propagation(); }
        else if ((event.key === "up" || event.key === "left") && options.length) { move(-1, cx); cx.stop_propagation(); }
        else if (event.key === "enter") { this.pick(this.highlight, cx); cx.stop_propagation(); }
      })
      .child(h_flex().w_full().items_center().justify_between()
        .child(text(effort ? 'Reasoning effort' : 'Model', 11.5, p.muted).font_weight(500))
        .when(effort && Boolean(current), el => el.child(h_flex().items_center().gap(5)
          .when(Boolean(current.selected), row => row.child(text('Current', 10, activeColor).font_weight(500)))
          .child(div().px(6).py(1.5).rounded_full().bg(p.inset).border(.5).border_color(withAlpha(activeColor, '55'))
            .child(div().font_family(MONO).text_size(9.5).text_color(p.muted).font_weight(500).child(`${this.highlight + 1}/${options.length}`))))))
      .when(effort && Boolean(current), el => el
        // Calm preview card: neutral surface, tier-tinted border & colored mini chart
        .child(div().id('effort-preview-' + current.value).relative().w_full().rounded(10).overflow_hidden()
          .bg(p.inset)
          .border(.5).border_color(withAlpha(activeColor, currentMeta.rank >= 4 ? '70' : '48'))
          .when(currentMeta.shimmer > 0 && motionOn(), box => box.child(h_flex().id('effort-preview-shimmer-' + current.value)
            .absolute().top(1).bottom(1).left(-56)
            .loop('left', { from: -56, to: 280, period: currentMeta.shimmer, easing: 'ease-in-out' })
            .child(div().h_full().w(14).bg(withAlpha(activeColor, '08')))
            .child(div().h_full().w(22).bg(withAlpha(activeColor, '14')))
            .child(div().h_full().w(14).bg(withAlpha(activeColor, '08')))))
          .child(v_flex().relative().w_full().px(11).py(9).gap(4)
            .child(h_flex().w_full().items_center().justify_between()
              .child(text(currentMeta.label, 21, p.text).font_weight(600))
              .child(div().size(6.5).rounded_full().bg(activeColor)
                .when(currentMeta.rank >= 3 && motionOn(), dot => dot.loop('opacity', { from: 0.35, to: 1, period: Math.max(700, 1900 - currentMeta.rank * 200) }))))
            .child(text(currentMeta.hint, 11, p.muted))
            // Spectrum power bar segmented across all options
            .child(h_flex().w_full().h(3).mt(3).gap(3)
              .children(options.map((opt, idx) => {
                const segColor = tierColor(p, effortMeta(opt.value ?? opt.label).colorKey);
                const lit = idx <= this.highlight;
                return div().flex_1().h_full().rounded_full()
                  .bg(lit ? (idx === this.highlight ? segColor : withAlpha(segColor, 'bb')) : withAlpha(p.track, '99'));
              })))))
        // Equalizer tiles: neutral surface, colored border & colored bars only
        .child(h_flex().w_full().items_center().gap(4).pt(2)
          .children(options.map((option, i) => {
            const lit = i <= this.highlight;
            const focused = i === this.highlight;
            const ratio = options.length <= 1 ? 1 : i / (options.length - 1);
            const barH = Math.round(7 + ratio * 15);
            const meta = effortMeta(option.value ?? option.label);
            const col = tierColor(p, meta.colorKey);
            const pulsePeriod = Math.max(750, 1750 - meta.rank * 170);
            return div().id('effort-step-' + option.value).relative().flex_1().min_w(0).h(42)
              .rounded(9).overflow_hidden().flex().flex_col().items_center().justify_end().pb(8).gap(3)
              .bg(focused ? p.selected : p.inset)
              .border(focused ? 1 : .5).border_color(focused ? col : lit ? withAlpha(col, '38') : p.line)
              .cursor_pointer().hover(s => s.bg(p.hover).border_color(withAlpha(col, '88')))
              .tooltip(`${meta.label} · ${meta.hint}` + (option.selected ? ' (Current)' : ''))
              .on_click((_e, cx) => { if (!this.busy()) { this.highlight = i; cx.notify(); } })
              .when(Boolean(option.selected), tile => tile.child(div().absolute().top(4).size(3.5).rounded_full().bg(col)))
              .child(div().id('effort-tile-bar-' + option.value).w(focused ? 6 : 4).h(barH).rounded_full()
                .bg(focused ? col : lit ? withAlpha(col, 'aa') : p.track)
                .when(focused && motionOn() && meta.rank >= 2, bar =>
                  bar.loop('height', { from: Math.max(5, barH - 3), to: barH + 2, period: pulsePeriod, easing: 'ease-in-out' })));
          })))
        .child(h_flex().w_full().justify_between()
          .child(text(effortMeta(options[0]?.value ?? options[0]?.label).label, 10, p.dim))
          .child(text(effortMeta(options[options.length - 1]?.value ?? options[options.length - 1]?.label).label, 10, p.dim)))
        .child(h_flex().id('effort-apply').w_full().h(34).mt(2).rounded(9).gap(6)
          .bg(canApply ? p.selected : p.inset)
          .border(.5).border_color(canApply ? withAlpha(activeColor, '88') : p.line)
          .items_center().justify_center().cursor_pointer()
          .hover(s => s.bg(p.hover))
          .on_click((_e, cx) => this.pick(this.highlight, cx))
          .when(canApply, btn => btn.child(div().size(5.5).rounded_full().bg(activeColor)))
          .child(text(this.busy() ? 'Waiting for confirmation…' : current.selected ? 'Keep ' + currentMeta.label : 'Apply ' + currentMeta.label, 12, canApply ? p.text : p.muted).font_weight(500)))
        .child(text('← → select · Enter apply · Esc close', 10, p.dim)))
      .when(options.length === 0, (el) => el.child(hint("模型目录尚未就绪", p.dim).px(8).py(6)))
      .when(!effort, el => el.children(options.map((option, i) =>
        menuRow("zero-picker-" + option.value, { selected: Boolean(option.selected), highlighted: i === this.highlight },
          div().flex_1().min_w(0).truncate().text_size(T.type.body).child(String(option.label ?? option.value)),
          div().text_size(T.type.body).text_color(option.selected ? p.accent : p.dim).child(option.selected ? "✓" : ""))
          .on_click((_e, cx) => this.pick(i, cx)))))
      .when(Boolean(status), (el) => el.child(status));
  }
}
