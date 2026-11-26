import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { T, UI, MONO as ZERO_MONO } from "./zero-tokens.js";
import { glassBg, glassOn } from "./zero-kit.js";
import {
  spaces,
  agents,
  panes,
  terminals,
  focused,
  run,
  openOverlay,
  closeOverlay,
  shared,
  setShared,
  theme,
  setAgentOrder,
  placement,
  updates,
  layout,
  props,
  machines,
  hc,
  keys,
  window as appWindow,
} from "herdr";

const FOLD_KEY = "machines.folded";
const FADE_MS = T.duration.hover;
const OPEN_MS = T.duration.drawer;
const CLOSE_MS = T.duration.drawer;
const GHOST_DELAY = 70;
const SIDEBAR_W = 268;
const INSTANT = "claude-drawer.instant";

const EDGE = 44;
const ROW = 32;
const TILE = 26;
const MONO = ZERO_MONO;
const CLAUDE_ICON = "mods/claude-drawer/claude-code.svg";
const CAT_LOGO = "mods/claude-drawer/cat.png";

function withAlpha(color, alphaHex) {
  if (typeof color !== "string" || !color.startsWith("#")) return color;
  if (color.length === 7) return `${color}${alphaHex}`;
  if (color.length === 9) {
    const orig = parseInt(color.slice(7, 9), 16) / 255;
    const scale = parseInt(alphaHex, 16) / 255;
    const next = Math.round(Math.max(0, Math.min(255, orig * scale * 255)))
      .toString(16)
      .padStart(2, "0");
    return `${color.slice(0, 7)}${next}`;
  }
  return color;
}

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
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

function formatElapsed(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ""}`;
}

function aggregateSpaceStatus(spaceId, agentList, focusedPaneId) {
  let hasDone = false;
  let hasWorking = false;
  for (const a of agentList) {
    if (a.space !== spaceId) continue;
    if (a.focused || (focusedPaneId && a.pane === focusedPaneId)) continue;
    if (a.status === "blocked") return "blocked";
    if (a.status === "working") hasWorking = true;
    if (a.status === "done") hasDone = true;
  }
  if (hasWorking) return "working";
  if (hasDone) return "done";
  return null;
}

function statusColor(status, t) {
  switch (status) {
    case "working":
      return t.accent ?? t.working;
    case "blocked":
      return t.blocked ?? t.ansi3;
    case "done":
      return t.done ?? t.ansi2;
    default:
      return t.dim;
  }
}

function agentProgramIcon(p, size, color) {
  if (!p?.icon) return null;
  if (/(^|\/)claude\.svg$/.test(p.icon)) return image(CLAUDE_ICON).w(size).h(size).flex_none();
  return p.tint
    ? svg(p.icon).size(size).flex_none().text_color(color)
    : image(p.icon).w(size).h(size).flex_none();
}

const cleanTitle = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function taskDetail(a, paneById, termById) {
  const pane = paneById.get(a.pane);
  const term =
    termById.get(a.address) ?? (pane?.terminal ? termById.get(pane.terminal) : null);
  const tabNamed = a.tab_name && !/^(?:tb)?\d+$/i.test(a.tab_name) ? cleanTitle(a.tab_name) : "";
  const raw = tabNamed || cleanTitle(a.title || term?.title || pane?.title || "");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower === (a.program?.name || "").toLowerCase() ||
    lower === (a.program?.key || "").toLowerCase() ||
    lower === (a.space_name || "").toLowerCase() ||
    lower === (a.address || "").toLowerCase() ||
    /^t[0-9a-z]+$/i.test(raw) ||
    /^\d+$/.test(raw) ||
    /^[~/]/.test(raw)
  ) {
    return null;
  }
  return raw;
}

function iconBtn(id, iconPath, t, onClick) {
  return div()
    .id(id)
    .size(24)
    .rounded(6)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .cursor_pointer()
    .text_color(t.dim)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(onClick)
    .child(svg(iconPath).size(13));
}

// 一行：边缘槽（收起时精确居中可见）+ 正文槽（展开后可见）。悬停不改几何尺寸，保证零重排丝滑开合。
function row(
  id,
  onRight,
  height,
  edgeEl,
  bodyEl,
  t,
  { interactive = true, selected = false, expanded = false, rail = false } = {}
) {
  const edgeSlot = div()
    .w(EDGE - 8)
    .h_full()
    .relative()
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .when(rail, (slot) =>
      slot.child(
        div()
          .absolute()
          .when(!onRight, (bar) => bar.left(1))
          .when(onRight, (bar) => bar.right(1))
          .w(2)
          .h(14)
          .rounded_full()
          .bg(t.accent)
      )
    )
    .child(edgeEl);

  const bodySlot = h_flex()
    .flex_1()
    .min_w(0)
    .h_full()
    .items_center()
    .gap(6)
    .pl(10)
    .pr(10)
    .child(bodyEl);

  let r = h_flex()
    .id(id)
    .h(height)
    .flex_none()
    .items_center()
    .rounded(8)
    .when(onRight, (s) => s.ml(6).mr(4))
    .when(!onRight, (s) => s.ml(4).mr(6))
    .when(selected && expanded, (s) => s.bg(t.selected));

  if (interactive) {
    r = r.cursor_pointer().hover((s) => s.bg(selected && expanded ? t.selected : t.hover));
  }
  return onRight ? r.child(bodySlot).child(edgeSlot) : r.child(edgeSlot).child(bodySlot);
}

function tile(content, { active = false } = {}, t) {
  return div()
    .relative()
    .size(TILE)
    .rounded(7)
    .flex()
    .items_center()
    .justify_center()
    .when(active, (d) => d.bg(t.selected))
    .child(content);
}

function statusBadge(id, status, t, haloBg, corner = "bottom") {
  const color = statusColor(status, t);
  const pulse = status === "working";
  const dotSize = status === "blocked" ? 6 : 5;
  return div()
    .absolute()
    .when(corner === "top", (d) => d.top(-1).right(-1))
    .when(corner !== "top", (d) => d.bottom(-1).right(-1))
    .size(dotSize + 3)
    .rounded_full()
    .bg(haloBg)
    .flex()
    .items_center()
    .justify_center()
    .child(
      div()
        .id(id)
        .size(dotSize)
        .rounded_full()
        .bg(color)
        .when(pulse, (el) => el.loop("opacity", { from: 0.48, to: 1, period: 1400 }))
    );
}

// 分组标题：收起态是居中 12px 细刻线，展开态是 Geist Mono 微大写标签 + 计数
function sectionLabel(id, label, rightEl, onRight, t) {
  const edge = div().w(12).h(1).rounded_full().bg(t.border);
  const body = h_flex()
    .w_full()
    .items_center()
    .justify_between()
    .font_family(UI)
    .child(div().text_size(11).font_medium().text_color(t.muted).child(label))
    .when(Boolean(rightEl), (s) => s.child(rightEl));
  return row(id, onRight, 22, edge, body, t, { interactive: false }).mt(10);
}

// 对称分割线行：收起态只显示边缘居中细线，绝不戳穿胶囊右边框；展开态自然延伸
function dividerRow(id, onRight, t) {
  const edge = div().w(14).h(1).rounded_full().bg(t.border);
  const body = div().w_full().h(1).bg(t.border);
  return row(id, onRight, 10, edge, body, t, { interactive: false }).mt(4).mb(2);
}

export default class ClaudeDrawer extends View {
  init(_props, cx) {
    this.wasVisible = false;
    this.shown = false;
    this.leaving = false;
    this.syncing = false;
    this.folded = new Set(JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]"));
    this.hosts = [];
    if (!props()?.ghost && cx?.timer) {
      cx.timer.after(10, (cx) => this.refreshHosts(cx));
      cx.timer.every(15000, (cx) => this.refreshHosts(cx));
      cx.timer.every(1000, (cx) => {
        if (agents().some((a) => a.status === "working")) cx.notify();
      });
    }
  }

  async refreshHosts(cx) {
    try {
      const r = await hc(["machine", "ls", "--json"]);
      if (r.code === 0) {
        this.hosts = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
        cx.notify();
      }
    } catch {}
  }

  foldKey(m, scope = "sp") {
    return scope === "sp" ? (m ?? "") : `${scope}:${m ?? ""}`;
  }

  toggleFold(m, cx, scope = "sp") {
    const key = this.foldKey(m, scope);
    this.folded.has(key) ? this.folded.delete(key) : this.folded.add(key);
    localStorage.setItem(FOLD_KEY, JSON.stringify([...this.folded]));
    cx.notify();
  }

  machineHeader(m, count, onRight, t, haloBg, scope = "sp", urgent = null) {
    const host = this.hosts.find((h) => h.name === m);
    const layoutState = machines().find((k) => k.name === m)?.layout;
    const connected = !m || host?.state === "connected" || (!host && layoutState === "ready");
    const state = connected ? "connected" : (host?.state ?? layoutState ?? "asleep").replace(/_/g, " ");
    const folded = this.folded.has(this.foldKey(m, scope));
    const label = m ?? "Local";
    const canAdd = connected && scope === "sp";

    const edge = tile(
      svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).text_color(t.dim),
      {},
      t
    ).child(
      div()
        .absolute()
        .bottom(1)
        .right(1)
        .size(7)
        .rounded_full()
        .bg(haloBg)
        .flex()
        .items_center()
        .justify_center()
        .child(div().size(4).rounded_full().bg(connected ? t.done ?? t.ansi2 : t.dim))
    );
    if (folded && urgent) {
      edge.child(statusBadge(`fold-urgent-${scope}-${m ?? "local"}`, urgent, t, haloBg, "top"));
    }

    const body = h_flex()
      .w_full()
      .min_w(0)
      .items_center()
      .gap(6)
      .text_size(11)
      .text_color(t.dim)
      .child(div().flex_1().min_w(0).truncate().font_medium().child(label))
      .when(!connected, (s) =>
        s.child(div().flex_none().font_family(MONO).text_size(9.5).child(state))
      )
      .when(folded && Boolean(urgent), (s) =>
        s.child(div().flex_none().size(5).rounded_full().bg(statusColor(urgent, t)))
      )
      .when(folded, (s) =>
        s.child(div().flex_none().font_family(MONO).text_size(9.5).child(String(count)))
      )
      .when(canAdd, (s) =>
        s.child(
          div()
            .id(`drawer-machine-add-${m ?? "local"}`)
            .size(18)
            .flex_none()
            .rounded(5)
            .flex()
            .items_center()
            .justify_center()
            .hover((h) => h.bg(t.hover).text_color(t.foreground))
            .tooltip(`New space on ${label}`)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => {
              cx.stop_propagation();
              run("space.new", { machine: m ?? "" });
            })
            .child(svg("mods/workspace-chrome/plus.svg").size(11).text_color(t.dim))
        )
      )
      .child(
        svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`)
          .size(11)
          .flex_none()
          .text_color(t.dim)
      );

    return row(`drawer-${scope}-machine-${m ?? "local"}`, onRight, 26, edge, body, t)
      .mt(2)
      .tooltip(`${label} · ${state}`)
      .on_click((_e, cx) => this.toggleFold(m, cx, scope));
  }

  openGhost(mode) {
    return openOverlay({
      mod: "claude-drawer",
      kind: "window",
      frame: "none",
      at: { x: 0, y: 0 },
      width: SIDEBAR_W + 1,
      height: 1,
      props: { pinned: true, ghost: mode },
    });
  }

  switchMode(pin, cx) {
    if (this.leaving) return;
    this.leaving = true;
    if (pin) {
      cx.notify();
      cx.timer.after(FADE_MS - 60, (cx) => {
        const ghost = this.openGhost("open");
        cx.timer.after(OPEN_MS + 40, (cx) => {
          setShared(INSTANT, true);
          run("layout.hide", { id: "drawer-gutter" });
          run("layout.show", { id: "sidebar" });
          cx.timer.after(90, (cx) => {
            closeOverlay(ghost);
            this.leaving = false;
            cx.notify();
          });
        });
      });
    } else {
      const ghost = this.openGhost("close");
      cx.timer.after(50, (cx) => {
        run("layout.hide", { id: "sidebar" });
        run("layout.show", { id: "drawer-gutter" });
        cx.timer.after(GHOST_DELAY + CLOSE_MS + 40, (cx) => {
          closeOverlay(ghost);
          this.leaving = false;
          cx.notify();
        });
      });
    }
  }

  render(cx) {
    const pinned = Boolean(props()?.pinned);
    const ghost = props()?.ghost ?? null;
    const tree = layout();
    const sidebarShown = !findNode(tree, "sidebar")?.hidden;
    const gutterShown = !findNode(tree, "drawer-gutter")?.hidden;

    if (!pinned && !ghost && !this.leaving && !this.syncing && sidebarShown === gutterShown) {
      this.syncing = true;
      cx.timer.after(0, (cx) => {
        run(sidebarShown ? "layout.hide" : "layout.show", { id: "drawer-gutter" });
        this.syncing = false;
        cx.notify();
      });
    }

    const visible = ghost ? true : pinned ? sidebarShown : !sidebarShown;
    if (!visible) {
      this.wasVisible = false;
      this.shown = false;
      return div();
    }
    if (!this.wasVisible) {
      this.wasVisible = true;
      if (pinned && !ghost && shared(INSTANT)) {
        this.shown = true;
        cx.timer.after(60, () => setShared(INSTANT, false));
      } else {
        this.shown = false;
        cx.timer.after(16, (cx) => {
          this.shown = true;
          cx.notify();
        });
      }
    }
    const on = ghost === "close" || (this.shown && !(this.leaving && !pinned));

    const t = theme();
    const glass = glassOn();
    const place = placement();
    const onRight = place?.edge === "right";
    const spaceList = spaces();
    const rawAgents = agents();
    const paneList = panes();
    const termList = terminals();
    const foc = focused();
    const focusedPane = foc?.pane ?? null;
    const updateReady = Boolean(updates().app.ready);
    const expanded = !place || Boolean(place.hovered);
    const haloBg = pinned || ghost ? t.chrome : t.popover ?? t.surface;

    const win = appWindow();
    const mac = win?.platform === "macos";
    const newSpaceKey = keyHint("space.new", mac);
    const searchKey = keyHint("mod.open:picker", mac);
    const sidebarKey = keyHint("layout.toggle:sidebar", mac);
    const settingsKey = keyHint("app.settings", mac);

    const spaceOrder = new Map(spaceList.map((s, i) => [s.id, i]));
    const tabByKey = new Map();
    for (const s of spaceList) {
      for (const tb of s.tabs ?? []) tabByKey.set(`${s.id}:${tb.id}`, tb);
    }

    const agentList = [...rawAgents].sort((a, b) => {
      const sa = spaceOrder.get(a.space) ?? 9999;
      const sb = spaceOrder.get(b.space) ?? 9999;
      if (sa !== sb) return sa - sb;
      if (a.tab_index !== b.tab_index) return (a.tab_index ?? 0) - (b.tab_index ?? 0);
      return String(a.pane).localeCompare(String(b.pane));
    });
    setAgentOrder(agentList.map((a) => a.address));

    // 同空间内若同一程序有多个实例，辅助区分标签页序号
    const siblingCounts = new Map();
    for (const a of agentList) {
      const k = `${a.space}:${a.program?.key ?? a.app ?? ""}`;
      siblingCounts.set(k, (siblingCounts.get(k) ?? 0) + 1);
    }

    const paneById = new Map(paneList.map((p) => [p.pane, p]));
    const termById = new Map(termList.map((tm) => [tm.address, tm]));

    const workingCount = agentList.filter((a) => a.status === "working").length;
    const blockedCount = agentList.filter((a) => a.status === "blocked").length;

    const topPad = pinned && mac && !win?.fullscreen ? 34 : pinned ? 8 : 5;
    const slide = onRight ? 10 : -10;
    const root = v_flex()
      .id("claude-drawer-root")
      // F02: a pinned drawer fills its resizable layout column (220-360px);
      // the floating drawer keeps the 268px design width.
      .when(pinned, (r) => r.w_full().h_full().flex_none().overflow_y_scrollbar())
      .when(!pinned, (r) => r.w(SIDEBAR_W))
      .when(!pinned && !ghost && glass, (r) => r.bg(t.popover ?? t.surface).rounded(10))
      .relative()
      .pt(topPad)
      .pb(5)
      .gap(3)
      .font_family(UI)
      .text_size(12.5)
      .opacity(on ? 1 : 0)
      .left(on ? 0 : slide)
      .transition("opacity", { duration: FADE_MS, easing: "ease-out" })
      .transition("left", { duration: FADE_MS + 40, easing: "ease-out" });

    // 1. 顶部：猫咪徽记 + 品牌标题 + 搜索 / 侧栏切换
    const brandEdge = div()
      .size(TILE)
      .rounded(7)
      .bg(withAlpha(t.accent, "14"))
      .border_1()
      .border_color(withAlpha(t.accent, "32"))
      .flex()
      .items_center()
      .justify_center()
      .child(image(CAT_LOGO).w(22).h(22).flex_none());

    const brandBody = h_flex()
      .w_full()
      .items_center()
      .justify_between()
      .child(
        h_flex()
          .min_w(0)
          .items_baseline()
          .gap(6)
          .child(
            div()
              .text_size(13.5)
              .font_semibold()
              .text_color(t.foreground)
              .child("Zero")
          )
          .child(
            div()
              .font_family(MONO)
              .text_size(9.5)
              .text_color(t.dim)
              .child("HERDR")
          )
      )
      .child(
        h_flex()
          .gap(2)
          .items_center()
          .child(
            iconBtn("drawer-search", "mods/workspace-chrome/search.svg", t, () =>
              run("mod.open", { name: "picker" })
            ).tooltip(searchKey ? `Switch or search (${searchKey})` : "Switch or search")
          )
          .when(!props()?.pinOnly, (el) =>
            el.child(
              iconBtn(
                "drawer-sidebar",
                pinned
                  ? "mods/workspace-chrome/panel-left.svg"
                  : "mods/workspace-chrome/sidebar.svg",
                t,
                (_e, cx) => this.switchMode(!pinned, cx)
              ).tooltip(
                (pinned ? "Float sidebar" : "Pin sidebar") +
                  (sidebarKey ? ` (${sidebarKey})` : "")
              )
            )
          )
      );
    root.child(row("drawer-header", onRight, 34, brandEdge, brandBody, t, { interactive: false }));

    // 新建空间：克制温润的微描边按键，不再用高饱和全填充色块抢夺注意力
    const newEdge = div()
      .size(TILE)
      .rounded(7)
      .bg(t.surface)
      .border_1()
      .border_color(t.border)
      .flex()
      .items_center()
      .justify_center()
      .child(svg("mods/workspace-chrome/plus.svg").size(13).text_color(t.muted));
    const newBody = h_flex()
      .w_full()
      .items_center()
      .justify_between()
      .child(div().text_size(12.5).text_color(t.muted).child("New space"))
      .when(Boolean(newSpaceKey), (el) =>
        el.child(div().font_family(MONO).text_size(10).text_color(t.dim).child(newSpaceKey))
      );
    root.child(
      row("drawer-new", onRight, ROW, newEdge, newBody, t)
        .tooltip(newSpaceKey ? `New space (${newSpaceKey})` : "New space")
        .on_click(() => run("space.new"))
    );

    // 2. Spaces 分组
    root.child(
      sectionLabel(
        "drawer-spaces-label",
        "Spaces",
        div().text_size(9.5).text_color(t.dim).child(String(spaceList.length)),
        onRight,
        t
      )
    );

    const drawSpace = (w) => {
      const displayName = w.name === "~" ? "Home" : w.name || "Space";
      const first = [...displayName][0] ?? "";
      const letter = /[\p{L}\p{N}]/u.test(first) ? first.toUpperCase() : null;
      const agg = aggregateSpaceStatus(w.id, agentList, focusedPane);
      const letterEl = letter
        ? div()
            .font_family(MONO)
            .text_size(11)
            .when(w.active, (el) => el.text_color(t.foreground).font_semibold())
            .when(!w.active, (el) => el.text_color(t.muted).font_medium())
            .child(letter)
        : svg("mods/workspace-chrome/folder.svg")
            .size(13)
            .text_color(w.active ? t.foreground : t.muted);

      const rowHalo = w.active && expanded ? t.selected : haloBg;
      const edge = tile(letterEl, { active: w.active && !expanded }, t);
      if (agg) {
        edge.child(statusBadge(`dot-space-${w.id}`, agg, t, rowHalo, "top"));
      }

      const aggColor = agg ? statusColor(agg, t) : t.dim;
      const body = h_flex()
        .w_full()
        .min_w(0)
        .items_center()
        .gap(6)
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .text_size(12.5)
            .when(w.active, (el) => el.text_color(t.foreground).font_medium())
            .when(!w.active, (el) => el.text_color(t.muted))
            .child(displayName)
        )
        .when(agg === "blocked", (el) =>
          el.child(
            div()
              .flex_none()
              .px(6)
              .h(16)
              .rounded_full()
              .bg(withAlpha(aggColor, "1a"))
              .border_1()
              .border_color(withAlpha(aggColor, "38"))
              .flex()
              .items_center()
              .font_family(MONO)
              .text_size(9)
              .text_color(aggColor)
              .child("input")
          )
        )
        .when(agg === "working" || agg === "done", (el) =>
          el.child(
            div()
              .flex_none()
              .font_family(MONO)
              .text_size(9.5)
              .text_color(aggColor)
              .child(agg === "working" ? "active" : "done")
          )
        )
        .when(!agg && Boolean(w.branch), (el) =>
          el.child(
            div()
              .flex_none()
              .max_w(84)
              .truncate()
              .font_family(MONO)
              .text_size(9.5)
              .text_color(t.dim)
              .child(`⑂ ${w.branch}`)
          )
        );

      const tipParts = [displayName, w.branch ? `⑂ ${w.branch}` : null, agg].filter(Boolean);
      return row(`drawer-space-${w.id}`, onRight, ROW, edge, body, t, {
        interactive: true,
        selected: w.active,
        expanded,
        rail: w.active,
      })
        .tooltip(tipParts.join(" · "))
        .on_click(() => run("space.select", { id: w.id }))
        .on_mouse_down("right", (ev, cx) => {
          cx.stop_propagation();
          openOverlay({
            mod: "menu",
            kind: "popup",
            width: 200,
            height: 260,
            anchor: ev.mouse,
            props: { tab: "space", target: { id: w.id } },
          });
        });
    };

    const remote = [
      ...new Set([
        ...spaceList.map((s) => s.machine).filter(Boolean),
        ...this.hosts.map((h) => h.name),
      ]),
    ].sort();
    if (!remote.length) {
      for (const w of spaceList) root.child(drawSpace(w));
    } else {
      for (const m of [null, ...remote]) {
        const mine = spaceList.filter((s) => (s.machine ?? null) === m);
        root.child(this.machineHeader(m, mine.length, onRight, t, haloBg));
        if (this.folded.has(m ?? "")) continue;
        for (const w of mine) root.child(drawSpace(w));
      }
    }

    // 3. Agents 分组（右侧智能汇总活跃/等待比）
    const activeCount = blockedCount + workingCount;
    const agentsMeta =
      activeCount > 0
        ? h_flex()
            .items_center()
            .gap(2)
            .child(
              div()
                .text_size(9.5)
                .font_semibold()
                .text_color(blockedCount > 0 ? statusColor("blocked", t) : statusColor("working", t))
                .child(String(activeCount))
            )
            .child(div().text_size(9.5).text_color(t.dim).child(`/${agentList.length}`))
        : div().text_size(9.5).text_color(t.dim).child(String(agentList.length));

    root.child(sectionLabel("drawer-agents-label", "Agents", agentsMeta, onRight, t));

    if (agentList.length === 0) {
      root.child(
        row(
          "drawer-agents-empty",
          onRight,
          ROW,
          div().size(5).rounded_full().bg(t.border),
          div().text_size(12).text_color(t.dim).child("No active agents"),
          t,
          { interactive: false }
        )
      );
    } else {
      const now = Date.now();
      const drawAgent = (a) => {
        const isFocused = Boolean(
          a.focused ||
            (foc &&
              (a.pane === foc.pane ||
                a.address === foc.terminal ||
                a.address === foc.agent))
        );
        const sc = statusColor(a.status, t);
        const detail = taskDetail(a, paneById, termById);
        const progName = a.program?.name || "Agent";
        const siblingKey = `${a.space}:${a.program?.key ?? a.app ?? ""}`;
        const hasDuplicateProg = (siblingCounts.get(siblingKey) ?? 0) > 1;
        const pic = agentProgramIcon(a.program, 15, isFocused ? t.foreground : t.muted);

        const rowHalo = isFocused && expanded ? t.selected : haloBg;
        const edge = tile(
          pic ?? div().size(6).rounded_full().bg(sc),
          { active: isFocused && !expanded },
          t
        ).when(!isFocused && a.status === "idle", (d) => d.opacity(0.85));

        if (a.status === "working" || a.status === "blocked" || a.status === "done") {
          edge.child(statusBadge(`dot-agent-${a.address}`, a.status, t, rowHalo, "bottom"));
        }

        const spaceName = a.space_name === "~" ? "Home" : a.space_name || "Space";
        const title =
          detail || (hasDuplicateProg && a.tab_index ? `${progName} #${a.tab_index}` : progName);

        const agentTab = tabByKey.get(`${a.space}:${a.tab}`);
        const workingText =
          a.status === "working" && agentTab?.working_since
            ? formatElapsed(now - agentTab.working_since)
            : "working";

        const rightMeta =
          a.status === "blocked"
            ? div()
                .flex_none()
                .px(6)
                .h(17)
                .flex()
                .items_center()
                .rounded_full()
                .bg(withAlpha(sc, "1a"))
                .border_1()
                .border_color(withAlpha(sc, "38"))
                .font_family(MONO)
                .text_size(9.5)
                .font_medium()
                .text_color(sc)
                .child("input")
            : a.status === "working"
              ? div()
                  .flex_none()
                  .font_family(MONO)
                  .text_size(10)
                  .text_color(sc)
                  .child(workingText)
              : a.status === "done"
                ? div()
                    .flex_none()
                    .font_family(MONO)
                    .text_size(10)
                    .text_color(sc)
                    .child("done")
                : div()
                    .flex_none()
                    .max_w(82)
                    .truncate()
                    .font_family(MONO)
                    .text_size(9.5)
                    .text_color(t.dim)
                    .child(spaceName);

        const body = h_flex()
          .w_full()
          .min_w(0)
          .items_center()
          .gap(6)
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(12.5)
              .when(isFocused, (el) => el.text_color(t.foreground).font_medium())
              .when(!isFocused, (el) => el.text_color(t.muted))
              .child(title)
          )
          .child(rightMeta);

        const tipLabel = [
          progName,
          detail && detail !== progName ? detail : null,
          `${spaceName}${a.tab_index ? ` #${a.tab_index}` : ""}`,
          a.status === "working" ? `Working (${workingText})` : a.status,
        ]
          .filter(Boolean)
          .join(" · ");

        return row(`drawer-agent-${a.address}`, onRight, ROW, edge, body, t, {
          interactive: true,
          selected: isFocused,
          expanded,
          rail: isFocused,
        })
          .tooltip(tipLabel)
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .on_mouse_down("right", (ev, cx) => {
            cx.stop_propagation();
            openOverlay({
              mod: "menu",
              kind: "popup",
              width: 220,
              height: 260,
              anchor: ev.mouse,
              props: { tab: "pane", target: { pane: a.pane, terminal: a.address } },
            });
          });
      };

      const spaceMachine = new Map(spaceList.map((s) => [s.id, s.machine ?? null]));
      const machineOf = (a) =>
        spaceMachine.get(a.space) ?? (a.address.includes("/") ? a.address.split("/")[0] : null);
      const RANK = { blocked: 3, done: 2, working: 1 };
      if (!remote.length) {
        for (const a of agentList) root.child(drawAgent(a));
      } else {
        for (const m of [null, ...remote]) {
          const mine = agentList.filter((a) => machineOf(a) === m);
          if (!mine.length) continue;
          const urgent = mine.reduce(
            (top, a) => ((RANK[a.status] ?? 0) > (RANK[top] ?? 0) ? a.status : top),
            null
          );
          root.child(this.machineHeader(m, mine.length, onRight, t, haloBg, "ag", urgent));
          if (this.folded.has(this.foldKey(m, "ag"))) continue;
          for (const a of mine) root.child(drawAgent(a));
        }
      }
    }

    // 4. 底部对称分割线 + 设置栏
    root.child(dividerRow("drawer-divider", onRight, t));
    const footerEdge = tile(
      svg("mods/workspace-chrome/settings.svg").size(14).text_color(t.dim),
      {},
      t
    ).when(updateReady, (d) =>
      d.child(statusBadge("dot-settings-update", "working", t, haloBg, "top"))
    );
    const footerBody = h_flex()
      .w_full()
      .items_center()
      .justify_between()
      .child(
        h_flex()
          .items_center()
          .gap(6)
          .child(div().text_size(12.5).text_color(t.muted).child("Settings"))
          .when(updateReady, (el) =>
            el.child(
              div()
                .px(5)
                .h(16)
                .rounded_full()
                .bg(withAlpha(t.accent, "1c"))
                .flex()
                .items_center()
                .font_family(MONO)
                .text_size(9)
                .text_color(t.accent)
                .child("update")
            )
          )
      )
      .when(Boolean(settingsKey), (el) =>
        el.child(div().font_family(MONO).text_size(10).text_color(t.dim).child(settingsKey))
      );
    root.child(
      row("drawer-footer", onRight, ROW, footerEdge, footerBody, t)
        .tooltip(settingsKey ? `Settings (${settingsKey})` : "Settings")
        .on_click(() => run("app.settings"))
    );

    if (ghost) {
      const open = ghost === "open";
      const width = open ? (this.shown ? SIDEBAR_W : 0) : this.shown ? 0 : SIDEBAR_W;
      return h_flex()
        .id("claude-drawer-ghost")
        .size_full()
        .child(
          div()
            .id("claude-drawer-ghost-panel")
            .h_full()
            .flex_none()
            .w(width)
            .overflow_hidden()
            .bg(glassOn() ? glassBg(t.chrome, "8c", true) : t.chrome)
            .border_r(1)
            .border_color(t.border)
            .transition(
              "width",
              open
                ? { duration: OPEN_MS, easing: "ease-out" }
                : { duration: CLOSE_MS, delay: GHOST_DELAY, easing: "ease-in-out" }
            )
            .child(root)
        );
    }
    if (pinned) {
      return div().id("claude-drawer-clip").size_full().overflow_hidden().child(root);
    }
    return root;
  }
}
