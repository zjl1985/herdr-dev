import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, appHome, closeOverlay, exec, focused, hc, home, layout, nextCommand, notify, openOverlay, panes, run, shared, setShared, spaces, theme } from "herdr";
// C11: Z no longer calls setAgentOrder — the drawer owns traversal order.
import { effortProfile, folder, formatDuration, formatResetCountdown, formatResetTime, formatResetTooltip, normalizeModelName, parseGitStatus, parseKimiUsage, quotaPace, taskTitle, cleanTitle } from "./data.js";
import { T, UI, MONO } from "./zero-tokens.js";
import { palette, statusInfo } from "./zero-theme.js";
import { motionOn, programIcon, withAlpha } from "./zero-kit.js";
import { attemptSwitch, invalidateSwitch, noteCodexData, switchState } from "./switcher.js";
import { PICK_KEY, SWITCH_KEY, PICKER_KEY } from "./switch-shared.js";
import { cardMaterial } from "./material.js";
import { readKiroAccountUsage } from "./kiro-usage.js";

// C10: a hidden panel stops reading — render() stamps lastRender, and every
// timer skips work once the panel has not rendered for this long.
const HIDDEN_AFTER = 60_000;
// C08/C09: cached quota data older than this renders as stale, not fresh.
const STALE_AFTER = 10 * 60_000;

const SESSION_ADAPTERS = ["codex", "kiro", "antigravity", "kimi-code"];

// Intl is unavailable in the mod shell; derive a UTC offset label from Date.
const TZ_LABEL = (() => {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
})();

function programKey(lead) {
  const key = lead?.app ?? lead?.program?.key ?? null;
  if (key === "kiro-cli" || lead?.program?.key === "kiro") return "kiro";
  return key === "agy" || lead?.program?.key === "antigravity" ? "antigravity" : key;
}

function targetKey({ space, lead, pane }) {
  return JSON.stringify([space?.id, space?.machine, programKey(lead), lead?.address, pane?.cwd]);
}

function gitTargetKey({ space, pane }) {
  return JSON.stringify([space?.machine, pane?.cwd ?? space?.folder]);
}

/** C02: the panel only describes what the keyboard is actually on. Resolve
 *  the active space/tab, then match the focused agent — a focused shell or
 *  empty pane yields no lead instead of borrowing the first agent's quota. */
function activeTarget() {
  const spaceList = spaces();
  const space = spaceList.find((s) => s.active) ?? null;
  const tab = space?.tabs?.find((t) => t.active) ?? null;
  const foc = focused();
  const list = agents().filter((a) => a.space === space?.id && a.tab === tab?.id);
  let lead = null;
  if (foc?.agent) lead = list.find((a) => a.address === foc.agent) ?? null;
  if (!lead && foc?.pane) lead = list.find((a) => a.pane === foc.pane) ?? null;
  if (!lead && foc?.terminal) lead = list.find((a) => a.address === foc.terminal) ?? null;
  const pane = lead
    ? panes().find((p) => p.pane === lead.pane) ?? null
    : foc?.pane
      ? panes().find((p) => p.pane === foc.pane) ?? null
      : null;
  return { space, tab, lead, pane };
}

/** C08: bridge payloads -> read state. "Waiting for matching X" is empty (no
 *  session yet); anything else the bridge reports is an error. */
function classifyChannel(payload) {
  if (!payload) return { state: "error" };
  if (payload.error) {
    return /waiting for matching/i.test(payload.error)
      ? { state: "empty" }
      : { state: "error", message: payload.error };
  }
  return { state: "ready" };
}

export default class ZeroHerdr extends View {
  init(_props, cx) {
    // Per-channel read state (C08): state/data/observedAt/message.
    this.channels = {};
    this.busy = {};
    this.seq = {};
    this.lastRender = Date.now();
    this.pickerOverlay = null;
    this.pickSeq = null;
    this.switchWatchdog = null;
    this.copied = null;
    this.copyTimer = null;
    // C09: Kimi quota cache keeps its account identity and read time.
    this.limits = null;
    try {
      const cached = JSON.parse(localStorage.getItem("kimi.limits") ?? "null");
      if (cached?.data?.fiveHour?.left != null || cached?.data?.weekly?.left != null) this.limits = cached;
      else if (cached?.fiveHour?.left != null || cached?.weekly?.left != null) {
        // Pre-C09 envelope: keep the numbers but mark ownership unknown.
        this.limits = { data: cached, readAt: null, account: null };
      }
    } catch {
      this.limits = null;
    }

    this.tasks = [];
    this.every(cx, 3000, (cx) => this.refreshSession(cx));
    this.every(cx, 5000, (cx) => this.refreshGit(cx));
    this.every(cx, 60_000, (cx) => this.refreshLimits(cx));
    // Working elapsed ticks at most 1Hz and only while the panel is visible.
    this.every(cx, 1000, (cx) => {
      if (activeTarget().lead?.status === "working") cx.notify();
    });

    this.refreshSession(cx);
    this.refreshGit(cx);
    this.refreshLimits(cx);

    // E01: the picker mod wakes this loop via run("zero-herdr.pick"); the
    // payload rides shared(PICK_KEY). Only the current target is accepted.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command !== "pick") continue;
        if (!this.visible()) continue;
        const pick = shared(PICK_KEY);
        if (!pick || pick.seq === this.pickSeq) continue;
        this.pickSeq = pick.seq;
        const { lead } = activeTarget();
        if (!lead || lead.address !== pick.address || programKey(lead) !== "codex") continue;
        const identity = targetKey(activeTarget());
        await attemptSwitch(pick, () => targetKey(activeTarget()) === identity);
        if (switchState()?.state === "awaiting") {
          this.switchWatchdog = cx.timer.after(10_000, () => {
            const current = switchState();
            if (current?.state === "awaiting" && current.seq === pick.seq) {
              invalidateSwitch("10 秒内未确认，保留原值；未自动重发。");
              cx.notify();
            }
          });
          this.tasks.push(this.switchWatchdog);
        }
        cx.notify();
      }
    });
  }

  /** C10: tasks die with the view (hot reload, layout hide, tab close). */
  every(cx, ms, fn) {
    const task = cx.timer.every(ms, (cx) => {
      if (this.visible()) fn(cx);
    });
    this.tasks.push(task);
  }

  visible() {
    const find = (node) => node?.id === "zero-herdr" ? node : (node?.children ?? []).map(find).find(Boolean);
    const panel = find(layout());
    return Boolean(panel && !panel.hidden);
  }

  copyValue(key, value, cx) {
    if (!value || !cx?.write_to_clipboard) return;
    cx.write_to_clipboard(String(value));
    this.copied = key;
    if (this.copyTimer) try { this.copyTimer.cancel(); } catch {}
    this.copyTimer = cx.timer?.after?.(1500, () => {
      if (this.copied === key) {
        this.copied = null;
        cx.notify();
      }
    }) ?? null;
    if (this.copyTimer) this.tasks.push(this.copyTimer);
    cx.notify();
  }

  toggleSidePanel(tabId) {
    const find = (node, id) => node?.id === id ? node : (node?.children ?? []).map((c) => find(c, id)).find(Boolean);
    const root = layout();
    const panel = find(root, "panel");
    const body = find(root, "panel-body");
    const isOpen = panel && !panel.hidden && body?.active === tabId;
    if (isOpen) {
      run("layout.hide", { id: "panel" });
    } else {
      run("layout.select", { stack: "panel-body", child: tabId });
      run("layout.show", { id: "panel" });
    }
  }

  async close(_cx) {
    this.closed = true;
    invalidateSwitch("状态面板已关闭，切换已取消。");
    for (const task of this.tasks) {
      try { task.cancel(); } catch {}
    }
    this.tasks = [];
  }

  // ---- channel machinery (C03/C04/C06/C08) ----

  /** Bump the request counter; only the latest request for a channel may
   *  write, so late responses from A can never overwrite B. */
  seqStart(name) {
    this.seq[name] = (this.seq[name] ?? 0) + 1;
    return this.seq[name];
  }

  seqCurrent(name, seq) {
    return !this.closed && seq === (this.seq[name] ?? 0);
  }

  /** Merge a patch into a channel and notify only on a real change (C06). */
  setChannel(name, patch) {
    const prev = this.channels[name] ?? { state: "idle", data: null, message: null, observedAt: null };
    const next = { ...prev, ...patch };
    const changed =
      next.state !== prev.state ||
      next.message !== prev.message ||
      JSON.stringify(next.data) !== JSON.stringify(prev.data);
    this.channels[name] = next;
    return changed;
  }

  /** Shared body for one guarded read: in-flight lock, seq check, result
   *  classification. `read` resolves to a bridge payload or throws. */
  async guarded(name, read, { timeoutMs = 6000, cx = null, isCurrent = () => true } = {}) {
    if (this.busy[name]) return;
    const seq = this.seqStart(name);
    this.busy[name] = true;
    let notify = false;
    try {
      const payload = await this.withTimeout(read(), timeoutMs, cx);
      if (!this.seqCurrent(name, seq) || !isCurrent()) return;
      const verdict = classifyChannel(payload);
      notify = this.setChannel(name, {
        state: verdict.state,
        message: verdict.message ?? (payload?.error ?? null),
        data: verdict.state === "ready" ? payload : null,
        observedAt: verdict.state === "ready" ? Date.now() : null,
      });
      // Freshness/confirmation matters even when the payload is unchanged.
      return verdict.state === "ready" ? payload : null;
    } catch (error) {
      if (!this.seqCurrent(name, seq) || !isCurrent()) return;
      const message = error?.name === "TimeoutError" ? "Read timed out" : String(error?.message ?? error);
      notify = this.setChannel(name, { state: "error", message, data: null, observedAt: null });
    } finally {
      this.busy[name] = false;
      if (notify) cx.notify();
    }
  }

  /** hc() has no timeout of its own; race one so the in-flight lock always
   *  releases (C04). Uses the native timer (setTimeout/clearTimeout do not
   *  exist in the mod shell); the Task is cancelled once the race settles. */
  withTimeout(promise, ms, cx = null) {
    if (!cx?.timer) return promise;
    let cancel = null;
    const timeout = new Promise((_, reject) => {
      const task = cx.timer.after(ms, () => {
        const error = new Error("timeout");
        error.name = "TimeoutError";
        reject(error);
      });
      cancel = () => { try { task.cancel(); } catch {} };
    });
    return Promise.race([promise, timeout]).finally(cancel);
  }

  channel(name) {
    return this.channels[name] ?? { state: "idle", data: null, message: null, observedAt: null };
  }

  /** True when the cached data exists but has passed its freshness window. */
  isStale(ch) {
    return Boolean(ch.data) && ch.observedAt != null && Date.now() - ch.observedAt > STALE_AFTER;
  }

  // ---- session adapters (C05: exactly one runs per tick) ----

  // Invalidate immediately on identity changes, even while a previous read
  // is busy. Keep its in-flight lock until it settles; never overlap reads.
  syncTarget(target) {
    const identity = targetKey(target);
    if (identity === this.targetIdentity) return false;
    this.targetIdentity = identity;
    const app = programKey(target.lead);
    this.adapter = SESSION_ADAPTERS.includes(app) ? app : null;
    for (const name of ["codex", "kiro", "agy", "usage"]) {
      this.seqStart(name);
      this.setChannel(name, { state: "idle", data: null, message: null, observedAt: null });
    }
    this.kiroCache = null;
    invalidateSwitch("目标已切换，切换已取消。");
    if (this.pickerOverlay) closeOverlay(this.pickerOverlay);
    this.pickerOverlay = null;
    return true;
  }

  async refreshSession(cx) {
    const target = activeTarget();
    const { space, lead, pane } = target;
    if (this.syncTarget(target)) cx.notify();
    const app = programKey(lead);
    if (!lead) return;
    if (space?.machine) {
      const name = { codex: "codex", kiro: "kiro", antigravity: "agy", "kimi-code": "usage" }[app];
      if (name && this.setChannel(name, { state: "unsupported", message: "Available on local terminals only", data: null, observedAt: null })) cx.notify();
      return;
    }
    if (app === "codex") await this.readCodex(space, lead, pane, cx);
    else if (app === "kiro") await this.readKiro(space, lead, pane, cx);
    else if (app === "antigravity") await this.readAgy(space, lead, pane, cx);
    else if (app === "kimi-code") await this.readUsage(space, lead, pane, cx);
  }

  async readSessionChannel(name, space, lead, pane, read, cx, timeoutMs = 6500) {
    const target = { space, lead, pane };
    if (this.syncTarget(target)) cx.notify();
    const identity = targetKey(target);
    if (this.channel(name).state === "idle" &&
        this.setChannel(name, { state: "loading" })) cx.notify();
    return this.guarded(name, read, {
      timeoutMs, cx,
      isCurrent: () => identity === this.targetIdentity && identity === targetKey(activeTarget()),
    });
  }

  async readCodex(space, lead, pane, cx) {
    const payload = await this.readSessionChannel("codex", space, lead, pane, () =>
      exec("node", [appHome() + "/mods/zero-herdr/codex-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 }).then((r) => JSON.parse(r.stdout)), cx);
    if (payload && noteCodexData(payload, lead.address)) {
      if (this.switchWatchdog) this.switchWatchdog.cancel();
      this.switchWatchdog = null;
      cx.notify();
    }
  }

  async readKiro(space, lead, pane, cx) {
    const payload = await this.readSessionChannel("kiro", space, lead, pane, async () => {
      const [sessionResult, accountResult] = await Promise.allSettled([
        exec("node", [appHome() + "/mods/zero-herdr/kiro-status.cjs", pane?.cwd ?? "", lead.title ?? "", JSON.stringify(this.kiroCache ?? null)], { timeout: 5000 }).then((r) => JSON.parse(r.stdout)),
        readKiroAccountUsage(exec, appHome(), this.kiroAccountCache),
      ]);
      const session = sessionResult.status === 'fulfilled' ? sessionResult.value : { error: 'Kiro session data unavailable' };
      const account = accountResult.status === 'fulfilled' ? accountResult.value
        : { state: 'error', source: 'api', data: null, message: 'Kiro 额度读取失败，将自动重试' };
      // An empty/new session can still have a valid account credit balance.
      return { ...session, error: null, accountCredits: account };
    }, cx, 10_000);
    if (payload?.cache) this.kiroCache = payload.cache;
    if (payload) this.kiroAccountCache = payload.accountCredits;
  }

  async readAgy(space, lead, pane, cx) {
    await this.readSessionChannel("agy", space, lead, pane, () =>
      exec("node", [appHome() + "/mods/zero-herdr/agy-status.cjs", pane?.cwd ?? "", lead.title ?? ""], { timeout: 5000 }).then((r) => JSON.parse(r.stdout)), cx);
  }

  async readUsage(space, lead, pane, cx) {
    await this.readSessionChannel("usage", space, lead, pane, () =>
      hc(["read", lead.address, "--lines", "45"]).then((r) => {
        const usage = parseKimiUsage(r.stdout ?? "");
        if (!usage) throw new Error("No context line in Kimi terminal");
        return usage;
      }), cx, 4000);
  }

  // ---- independent channels ----

  async refreshGit(cx) {
    const { space, pane } = activeTarget();
    const cwd = pane?.cwd ?? space?.folder ?? null;
    const key = gitTargetKey({ space, pane });
    if (key !== this.gitKey) {
      this.gitKey = key;
      this.seqStart("git");
      if (this.setChannel("git", { state: "loading", data: null, message: null, observedAt: null })) cx.notify();
    }
    if (!cwd) return;
    if (this.busy.git) return;
    const seq = this.seqStart("git");
    this.busy.git = true;
    let changed = false;
    try {
      // C07: --no-optional-locks keeps polling from taking git's index locks.
      const result = await exec("git", ["--no-optional-locks", "status", "--porcelain=v2", "--branch"], { cwd, on: space?.machine, timeout: 5000 });
      if (!this.seqCurrent("git", seq) || key !== gitTargetKey(activeTarget())) return;
      if (result.code === 0) {
        changed = this.setChannel("git", { state: "ready", data: parseGitStatus(result.stdout), message: null, observedAt: Date.now() });
      } else {
        changed = this.setChannel("git", { state: "empty", data: null, message: "Not a git repository", observedAt: null });
      }
    } catch (error) {
      if (!this.seqCurrent("git", seq) || key !== gitTargetKey(activeTarget())) return;
      changed = this.setChannel("git", { state: "error", message: String(error?.message ?? error), data: null, observedAt: null });
    } finally {
      this.busy.git = false;
      if (changed) cx.notify();
    }
  }

  /** C09: quota cache carries account identity; a mismatching account
   *  replaces it, and unknown ownership only ever shows as stale. */
  async refreshLimits(cx) {
    const { space, lead } = activeTarget();
    if (programKey(lead) !== "kimi-code" || space?.machine || this.busy.limits) return;
    this.busy.limits = true;
    let changed = false;
    try {
      const result = await exec("node", [appHome() + "/mods/zero-herdr/kimi-status.cjs"], { timeout: 10000 });
      const payload = JSON.parse(result.stdout);
      if (!payload.error) {
        const account = payload.account ?? null;
        const keepData = { fiveHour: payload.fiveHour, weekly: payload.weekly };
        const prev = this.limits;
        this.limits = { data: keepData, readAt: Date.now(), account };
        localStorage.setItem("kimi.limits", JSON.stringify(this.limits));
        changed = JSON.stringify(prev) !== JSON.stringify(this.limits);
      } else {
        changed = this.setChannel("limits", { state: "error", message: payload.error, data: null, observedAt: null });
      }
    } catch (error) {
      changed = this.setChannel("limits", { state: "error", message: String(error?.message ?? error), data: null, observedAt: null });
    } finally {
      this.busy.limits = false;
      if (changed) cx.notify();
    }
  }

  // ---- picker (kept as-is until E reworks the guard) ----

  // E04: the picker is a popup overlay, out of the right panel's flow.
  togglePicker(kind, address, cx) {
    const existing = shared(PICKER_KEY);
    if (this.pickerOverlay && existing?.overlay === this.pickerOverlay) {
      try { closeOverlay(this.pickerOverlay); } catch {}
      this.pickerOverlay = null;
      cx.notify();
      return;
    }
    const sw = switchState();
    if (sw?.state === "sending" || sw?.state === "awaiting") return;
    setShared(SWITCH_KEY, null);
    const m = this.model();
    const codex = m.adapter === "codex" ? m.codex : null;
    if (!codex) return;
    const options = kind === "model"
      ? (codex.models ?? []).map((mx) => ({ value: mx.id, label: mx.name, selected: mx.id === codex.model }))
      : (codex.models?.find((mx) => mx.id === codex.model)?.efforts ?? []).map((e) => ({ value: e, label: e, selected: e === codex.effort }));
    this.pickerOverlay = openOverlay({
      mod: "zero-picker",
      kind: "popup",
      at: "pointer",
      width: kind === "effort" ? 296 : 250,
      height: kind === "effort" ? 284 : Math.min(360, 60 + options.length * 30),
      props: { kind, address, options },
    });
    setShared(PICKER_KEY, { overlay: this.pickerOverlay, kind, address });
    cx.notify();
  }


  // ---- derived view model (visuals unchanged in C; D reworks these) ----

  model() {
    const target = activeTarget();
    this.syncTarget(target);
    const { space, tab, lead, pane } = target;
    const codexCh = this.channel("codex");
    const kiroCh = this.channel("kiro");
    const agyCh = this.channel("agy");
    const usageCh = this.channel("usage");
    const gitCh = this.gitKey === gitTargetKey(target) ? this.channel("git") : { state: "loading", data: null };
    const adapter = this.adapter;
    const active =
      adapter === "codex" ? codexCh
      : adapter === "kiro" ? kiroCh
      : adapter === "antigravity" ? agyCh
      : adapter === "kimi-code" ? usageCh
      : null;
    const sessionError = active?.state === "error" ? active.message : null;
    const sessionUnsupported = active?.state === "unsupported";
    const sessionEmpty = active?.state === "empty";
    const sessionLoading = active?.state === "loading" || (active?.state === "idle" && Boolean(lead));
    const data = active?.data ?? {};
    const limitsData = !space?.machine ? this.limits?.data ?? {} : {};
    const isKimi = adapter === "kimi-code";
    const context = data.context ?? (isKimi ? usageCh.data : null);
    const isKiro = adapter === "kiro";
    const weekly = isKiro ? null : data.weekly?.left ?? (isKimi ? limitsData.weekly?.left : null);
    const fiveHour = isKiro ? null : data.fiveHour?.left ?? (isKimi ? limitsData.fiveHour?.left : null);
    const fiveHourReset = isKiro ? null : data.fiveHour?.resetsAt ?? (isKimi ? limitsData.fiveHour?.resetsAt : null);
    const weeklyReset = isKiro ? null : data.weekly?.resetsAt ?? (isKimi ? limitsData.weekly?.resetsAt : null);
    const creditValue = data.creditUsage?.used ?? data.credits;
    const credits = creditValue != null && Number.isFinite(Number(creditValue)) && Number(creditValue) >= 0 ? Number(creditValue) : null;
    const quotaStale =
      (isKimi && this.limits && (!this.limits.account || this.limits.readAt == null || Date.now() - this.limits.readAt > STALE_AFTER)) ||
      this.isStale(active ?? {});
    const working = lead?.status === "working";
    return {
      space, tab, lead, pane,
      adapter, sessionError, sessionUnsupported, sessionEmpty, sessionLoading, quotaStale,
      codex: adapter === "codex" ? data : null,
      kiro: adapter === "kiro" ? data : null,
      agy: adapter === "antigravity" ? data : null,
      context, weekly, fiveHour, fiveHourReset, weeklyReset, credits, isKimi, isKiro,
      accountCredits: isKiro ? data.accountCredits : null,
      git: gitCh,
      working,
      gitKey: this.gitKey,
      cwd: data.cwd ?? pane?.cwd ?? space?.folder,
      title: data.title ?? taskTitle(lead, tab, space),
      programName: lead?.program?.name ?? (adapter === "antigravity" ? "Antigravity" : "Status"),
    };
  }


  // Context uses a position scale; quota keeps its original remaining dots.
  // Every color follows theme().
  render(cx) {
    const gone = Date.now() - this.lastRender > HIDDEN_AFTER;
    this.lastRender = Date.now();
    if (gone && cx) {
      cx.spawn((cx) => this.refreshSession(cx));
      cx.spawn((cx) => this.refreshGit(cx));
    }
    const p = palette(), m = this.model();
    const material = cardMaterial(p);
    const { space, tab, lead, pane } = m;
    const list = agents().filter(a => a.space === space?.id);
    const info = statusInfo(lead?.status);
    const stateColor = lead ? p[info.key] : p.idle;
    const working = m.working;
    const elapsed = working && tab?.working_since ? formatDuration(Date.now() - tab.working_since) : null;
    const codex = m.codex;
    const isCodex = m.adapter === 'codex';
    const effort = codex?.effort ?? m.agy?.effort;
    const effortInfo = effortProfile(effort);
    const rawModel = normalizeModelName(codex?.model ?? m.kiro?.model ?? m.agy?.model, effort);
    const model = rawModel && rawModel.toLowerCase() !== m.programName.toLowerCase() ? rawModel : null;
    const sw = isCodex ? switchState() : null;
    const switchNotice = sw && sw.address === lead?.address && sw.state !== 'success' ? sw : null;
    const pickerOpen = kind => {
      const picker = shared(PICKER_KEY);
      return picker?.overlay === this.pickerOverlay && picker?.kind === kind && picker?.address === lead?.address;
    };
    const txt = (value, size = 12, color = p.text) => div().font_family(UI).text_size(size).text_color(color).child(String(value ?? ''));
    const mono = (value, size = 11, color = p.muted) => txt(value, size, color).font_family(MONO);
    const dot = (color, size = 5, pulse = false) => div().size(size).flex_none().rounded_full().bg(color)
      .when(pulse && motionOn(), el => el.loop('opacity', { from: 0.35, to: 1, period: 1600 }));
    const icon = (name, size = 14, color = p.muted) => svg('mods/zero-ui/icons/' + name + '.svg').size(size).flex_none().text_color(color);
    const card = id => v_flex().id(id).w_full().flex_none().relative().p(14).gap(12).rounded(12)
      .bg(material.top)
      .border(.5).border_color(material.edge).shadow_md();
    const heading = (name, right = null) => h_flex().w_full().items_center().gap(7)
      .child(dot(p.accent, 4)).child(txt(name, 12).font_weight(500)).child(div().flex_1())
      .when(Boolean(right), el => el.child(right));
    const action = (id, glyph, tip, fn) => div().id(id).size(24).flex_none().flex().items_center().justify_center()
      .rounded(7).cursor_pointer().hover(s => s.bg(p.hover)).tooltip(tip).on_click(fn).child(icon(glyph));
    const percent = value => Number.isFinite(Number(value)) && value != null ? Math.max(0, Math.min(100, Number(value))) : null;
    const dots = (value, count = 18, color = p.accent) => {
      const n = percent(value);
      const filled = n == null ? 0 : Math.max(n > 0 ? 1 : 0, Math.round(n * count / 100));
      return h_flex().w_full().items_center().justify_between().children(Array.from({ length: count }, (_, i) => dot(i < filled ? color : p.track, 5)));
    };
    const contextRuler = (value, color, nearCapacity = false) => {
      const n = percent(value) ?? 0;
      const fillW = n > 0 ? Math.max(3, Math.min(99, n)) : 0;
      return div().id('context-ruler').relative().w_full().h(28).rounded(7).overflow_hidden()
        .bg(material.well).border(.5).border_color(nearCapacity ? withAlpha(color, '66') : material.wellEdge)
        // Subtle 80%-100% capacity zone
        .child(div().absolute().top(1).bottom(1).right(1).w('20%').rounded(6)
          .bg(withAlpha(p.blocked, nearCapacity ? '18' : '0a')))
        // Inset rounded liquid wash matching inner radius (no corner bleed)
        .when(fillW > 0, el => el.child(div().absolute().top(1).bottom(1).left(1).w(fillW + '%').rounded(6)
          .bg(withAlpha(color, nearCapacity ? '2c' : '1a'))))
        // Ticks + precision needle with micro cap
        .child(div().relative().w_full().h_full().px(8)
          .child(div().relative().w_full().h_full()
            .children(Array.from({ length: 21 }, (_, i) => {
              const tickPct = i * 5;
              const major = i % 5 === 0;
              const passed = tickPct <= n;
              const dangerTick = tickPct >= 80;
              const tickBg = passed
                ? withAlpha(color, major ? 'aa' : '4c')
                : dangerTick
                  ? withAlpha(p.blocked, major ? '55' : '2c')
                  : major ? p.dim : p.track;
              return div().absolute().left(tickPct + '%')
                .ml(i === 20 ? -1 : 0).bottom(7).w(1).h(major ? 10 : i % 2 === 0 ? 7 : 4)
                .rounded_full().bg(tickBg);
            }))
            .child(div().id('context-needle').absolute().left(n + '%')
              .ml(n === 100 ? -2 : n === 0 ? 0 : -2).top(3).w(4).h(20)
              .flex().flex_col().items_center()
              .when(nearCapacity && motionOn(), el => el.loop('opacity', { from: 0.5, to: 1, period: 1400 }))
              .child(div().size(4).flex_none().rounded_full().bg(color))
              .child(div().w(1.5).flex_1().rounded_full().bg(color)))));
    };
    const valueText = (value, size = 23, color = p.text) => h_flex().flex_none().items_baseline().gap(3)
      .child(txt(percent(value) == null ? '—' : Math.round(percent(value)), size, color).font_weight(500))
      .when(percent(value) != null, el => el.child(txt('%', 11, p.muted)));
    const modelChip = (value, caption) => h_flex().id('codex-model-picker').min_w(0).flex_1().h(32).px(10).gap(6)
      .items_center().rounded(8).border(.5).border_color(pickerOpen('model') ? withAlpha(p.accent, '66') : material.wellEdge)
      .bg(pickerOpen('model') ? p.selected : material.well)
      .tooltip(isCodex ? caption : value)
      .when(isCodex, el => el.cursor_pointer().hover(s => s.bg(p.hover))
        .on_click((_e, cx) => this.togglePicker('model', lead.address, cx)))
      .child(txt(value, 11.5).font_weight(500).min_w(0).flex_1().truncate())
      .when(isCodex, el => el.child(icon('chevron-down', 10)));
    const effortTone = (colorKey) => {
      if (colorKey === 'done') return p.done;
      if (colorKey === 'teal') return p.ansi?.(6) ?? p.done;
      if (colorKey === 'amber') return p.ansi?.(3) ?? p.accent;
      if (colorKey === 'blocked') return p.blocked;
      if (colorKey === 'plum') return p.ansi?.(5) ?? p.accent;
      if (colorKey === 'muted') return p.muted;
      return p.accent;
    };
    const effortBars = (info, tone) => h_flex().h(13).items_end().gap(1.5).flex_none()
      .children([4, 6, 8.5, 11, 13].map((height, i) => {
        const active = i < info.bars;
        const barColor = !active ? p.track : tone;
        const animate = active && motionOn() && (
          info.tier === 'ultra' ||
          (working && info.level >= 4) ||
          (working && info.tier === 'high' && i === info.bars - 1)
        );
        return div().id('effort-bar-' + i).w(2).h(height).rounded_full().bg(barColor)
          .when(animate, el => el.loop('opacity', { from: info.tier === 'ultra' ? 0.3 : 0.42, to: 1, period: (info.tier === 'ultra' ? 820 : 1100) + i * 150 }));
      }));
    const effortChip = (info) => {
      const open = pickerOpen('effort');
      const tone = effortTone(info.colorKey);
      const intense = info.level >= 4;
      const shimmerPeriod = info.tier === 'ultra' ? 1350 : info.tier === 'max' ? 1800 : info.tier === 'xhigh' ? 2600 : 0;
      const tip = `${info.label} reasoning · ${info.hint}` + (isCodex ? '\nClick to change effort' : '');
      return div().id('codex-effort-picker').relative().flex_none().h(32).rounded(8).overflow_hidden().border(.5)
        .border_color(open ? tone : info.level >= 3 ? withAlpha(tone, intense ? '70' : '48') : material.wellEdge)
        .bg(open ? p.selected : info.level >= 3 ? withAlpha(tone, info.tier === 'ultra' ? '20' : intense ? '16' : '0e') : material.well)
        .tooltip(tip)
        .when(isCodex, el => el.cursor_pointer().hover(s => s.bg(withAlpha(tone, '24')))
          .on_click((_e, cx) => this.togglePicker('effort', lead.address, cx)))
        .when(shimmerPeriod > 0 && motionOn(), el => el.child(h_flex().id('effort-chip-shimmer').absolute().top(1).bottom(1).left(-32)
          .loop('left', { from: -32, to: 118, period: shimmerPeriod, easing: 'ease-in-out' })
          .child(div().h_full().w(8).bg(withAlpha(tone, info.tier === 'ultra' ? '1a' : '10')))
          .child(div().h_full().w(12).bg(withAlpha(info.tier === 'ultra' ? p.text : tone, info.tier === 'ultra' ? '30' : '22')))
          .child(div().h_full().w(8).bg(withAlpha(tone, info.tier === 'ultra' ? '1a' : '10')))))
        .child(h_flex().relative().h_full().px(9).gap(6).items_center()
          .child(effortBars(info, tone))
          .child(txt(info.short, 11, info.level >= 3 ? p.text : p.muted).font_weight(500))
          .when(isCodex, el => el.child(icon('chevron-down', 10, info.level >= 4 ? tone : p.muted))));
    };

    const session = card('session-card')
      .child(h_flex().w_full().items_center().gap(7)
        .child(programIcon(lead?.program, 16, p.muted) ?? dot(stateColor, 6))
        .child(txt(m.programName, 12).font_weight(500).flex_1().min_w(0).truncate())
        .child(action('status-motion', 'motion', motionOn() ? 'Reduce motion' : 'Enable motion', (_e, cx) => {
          localStorage.setItem('zero.reducedMotion', motionOn() ? '1' : '0'); cx.notify();
        }))
        .child(action('status-close', 'panel-right', 'Hide status panel', () => run('layout.hide', { id: 'zero-herdr' }))))
      .child(h_flex().id('session-signal-banner').w_full().h(34).px(10).rounded(9).border(.5)
        .border_color(working || lead?.status === 'blocked' ? withAlpha(stateColor, '44') : material.wellEdge)
        .bg(material.well).items_center().gap(7)
        .when(working || lead?.status === 'blocked', el => el.child(div().w(2).h(14).flex_none().rounded_full().bg(stateColor)))
        .child(dot(stateColor, 5, working)).child(txt(lead ? info.label : 'No agent', 11, stateColor).font_weight(500))
        .when(Boolean(elapsed), el => el.child(mono(elapsed, 10)))
        .child(div().flex_1())
        .child(h_flex().h(16).items_end().gap(2).flex_none().tooltip('Session activity')
          .children([7, 12, 16, 10, 14, 8, 11].map((height, i) => div().id('signal-bar-' + i).w(2).h(working ? height : 3).rounded_full().bg(stateColor)
            .when(working && motionOn(), el => el.loop('height', { from: 3 + i % 3, to: height, period: 880 + i * 137 }))))))
      .child(txt(m.title, 16).font_weight(500).line_height(1.3).max_h(42).overflow_hidden().tooltip(String(m.title)))
      .child(h_flex().w_full().items_center().gap(4)
        .child(h_flex().id('session-cwd-copy').min_w(0).flex_1().h(24).px(5).gap(6).rounded(6).items_center()
          .when(Boolean(m.cwd), el => el.cursor_pointer().hover(s => s.bg(p.hover))
            .tooltip((m.cwd ?? '') + '\nClick to copy path')
            .on_click((_e, cx) => this.copyValue('cwd', m.cwd, cx)))
          .child(icon('folder', 12, this.copied === 'cwd' ? p.done : p.muted))
          .child(mono(this.copied === 'cwd' ? 'Copied path' : (folder(m.cwd, home()) || 'No folder'), 10.5, this.copied === 'cwd' ? p.done : p.muted)
            .min_w(0).flex_1().truncate()))
        .when(Boolean(m.cwd), el => el.child(action('session-open-files', 'sidebar', 'Toggle files panel', () => this.toggleSidePanel('files')))))
      .when(Boolean(model || effortInfo), el => el.child(h_flex().w_full().gap(6)
        .when(Boolean(model), row => row.child(modelChip(model, 'Select model')))
        .when(Boolean(effortInfo), row => row.child(effortChip(effortInfo)))))
      .when(Boolean(switchNotice), el => el.child(txt(
        switchNotice.state === 'error' ? (switchNotice.message ?? 'Switch failed')
          : switchNotice.state === 'sending' ? 'Switching…' : 'Waiting for Codex confirmation…',
        10.5, switchNotice.state === 'error' ? p.blocked : p.muted)));
    const sessionNotice = m.sessionUnsupported ? 'Remote session · local metrics unavailable'
      : m.sessionEmpty ? 'Waiting for a matching session'
      : m.sessionLoading ? 'Reading session…'
      : m.sessionError;
    if (sessionNotice) session.child(txt(sessionNotice, 11, m.sessionError ? p.blocked : p.muted));

    const contextPercent = percent(m.context?.percent);
    const hasContext = contextPercent != null;
    const contextNearCapacity = hasContext && contextPercent >= 80;
    const contextColor = contextNearCapacity ? p.blocked : p.accent;
    const tokenCount = value => Math.round(Number(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const contextDetail = hasContext ? 'Conversation context · ' + contextPercent + '% used'
      + (Number.isFinite(m.context.used) && Number.isFinite(m.context.total) && m.context.total > 0
        ? '\n' + tokenCount(m.context.used) + ' / ' + tokenCount(m.context.total) + ' tokens' : '') : '';
    const hasQuota = m.fiveHour != null || m.weekly != null;
    const metrics = card('metrics-card')
      .when(hasContext, el => el.child(v_flex().id('context-usage').w_full().gap(8).tooltip(contextDetail)
        .child(h_flex().id('context-readout').w_full().items_center().gap(8)
          .child(txt('Context', 12).font_weight(500).line_height(1).flex_1())
          .child(h_flex().flex_none().items_center().gap(5)
            .child(txt('used', 10.5, p.muted).line_height(1))
            .child(h_flex().h(24).px(8).items_center().rounded(6)
              .bg(contextNearCapacity ? withAlpha(contextColor, '18') : material.well)
              .border(.5).border_color(contextNearCapacity ? withAlpha(contextColor, '66') : material.wellEdge).shadow_xs()
              .child(txt(Math.round(contextPercent) + '%', 16, contextNearCapacity ? p.blocked : p.text).font_weight(500).line_height(1).font_family(MONO)))))
        .child(contextRuler(contextPercent, contextColor, contextNearCapacity))
        .when(contextNearCapacity, row => row.child(txt('Near capacity', 10.5, p.blocked)))))
      .when(hasContext && hasQuota, el => el.child(div().w_full().h(.5).bg(p.line)))
      .when(hasQuota, el => el.child(heading('Available quota')));
    const quotaRow = (id, name, value, badge, credit = null, resetAt = null) => {
      const low = value != null && value <= 20;
      const color = low ? p.blocked : p.accent;
      const reset = formatResetTime(resetAt);
      const resetParts = reset?.split(' ') ?? [];
      const resetTime = resetParts.pop() ?? '';
      const resetDate = resetParts.join(' ');
      const windowMs = id === 'quota-weekly' ? 7 * 24 * 60 * 60_000 : 5 * 60 * 60_000;
      const pace = reset ? quotaPace(value, resetAt, windowMs) : { elapsed: 0, state: 'healthy', label: '' };
      const remaining = reset ? formatResetCountdown(resetAt) : null;
      const activeState = pace.state !== 'healthy';
      const tone = pace.state === 'critical' ? p.blocked : pace.state === 'resetting' ? p.done : p.accent;
      const shimmerPeriod = pace.state === 'critical' ? 1300 : pace.state === 'resetting' ? 1800 : pace.state === 'fast' ? 2200 : 4200;
      const fillPercent = Math.max(4, Math.min(99, pace.elapsed));
      const fillAlpha = pace.state === 'critical' ? '34' : pace.state === 'resetting' ? '26' : pace.state === 'fast' ? '28' : '1c';
      const shimmerOuter = pace.state === 'critical' ? '16' : activeState ? '10' : '08';
      const shimmerCore = pace.state === 'critical' ? '36' : activeState ? '24' : '14';
      const shimmerColor = pace.state === 'critical' ? p.text : tone;
      const resetCapsule = reset ? div().id(id + '-reset-rail').relative().min_w(0).flex_1().h(24).rounded(7)
        .overflow_hidden().bg(material.well)
        .border(.5).border_color(pace.state === 'critical' ? withAlpha(tone, '88') : activeState ? withAlpha(tone, '55') : material.wellEdge)
        .tooltip(formatResetTooltip(resetAt, TZ_LABEL, Date.now(), pace.label))
        // Inset rounded liquid fill (matches inner radius of rounded(7) so corners never bleed out)
        .child(div().absolute().top(1).bottom(1).left(1).w(fillPercent + '%').min_w(8).rounded(6)
          .bg(withAlpha(tone, fillAlpha)))
        // Feathered shimmer beam gliding across the capsule
        .when(motionOn(), el => el.child(h_flex().id(id + '-shimmer').absolute().top(1).bottom(1).left(-40)
          .loop('left', { from: -40, to: 185, period: shimmerPeriod, easing: 'ease-in-out' })
          .child(div().h_full().w(12).bg(withAlpha(shimmerColor, shimmerOuter)))
          .child(div().h_full().w(16).bg(withAlpha(shimmerColor, shimmerCore)))
          .child(div().h_full().w(12).bg(withAlpha(shimmerColor, shimmerOuter)))))
        // Clean single-row readout: reset time left, remaining countdown right
        .child(h_flex().relative().w_full().h_full().px(8).items_center().gap(4)
          .when(Boolean(resetDate), el => el.child(txt(resetDate, 9.5, activeState ? p.muted : p.dim).line_height(1)))
          .child(mono(resetTime, 11, activeState ? p.text : p.muted).font_weight(500).line_height(1))
          .child(div().flex_1())
          .when(Boolean(remaining), el => el.child(mono(remaining, 10, activeState ? tone : p.dim).font_weight(activeState ? 500 : 400).line_height(1).flex_none()))) : null;
      return h_flex().id(id).w_full().items_center().gap(10)
        .when(Boolean(credit), el => el.tooltip(credit.tip))
        .child(div().size(30).flex_none().rounded(9).bg(material.well)
          .border(.5).border_color(pace.state === 'critical' ? withAlpha(tone, '88') : activeState ? withAlpha(tone, '55') : material.wellEdge)
          .flex().items_center().justify_center()
          .child(mono(badge, 10, activeState ? tone : p.muted).font_weight(activeState ? 500 : 400)))
        .child(v_flex().flex_1().min_w(0).gap(7)
          .child(h_flex().w_full().items_center().justify_between().gap(8)
            .when(Boolean(reset), el => el.child(resetCapsule))
            .when(!reset, el => el.child(txt(name, 12).min_w(0).truncate()))
            .child(credit ? h_flex().flex_none().items_baseline().gap(3)
              .child(txt(credit.remaining.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1'), 19, low ? p.blocked : p.text).font_weight(500))
              .child(txt('cr', 10.5, p.muted)) : valueText(value, 19, low ? p.blocked : p.text)))
          .child(dots(value, 18, color))
          .when(low, el => el.child(txt('Low remaining quota', 10.5, p.blocked))));
    };
    if (m.fiveHour != null) metrics.child(quotaRow('quota-5h', '5-hour left', m.fiveHour, '5h', null, m.fiveHourReset));
    if (m.weekly != null) metrics.child(quotaRow('quota-weekly', 'Weekly left', m.weekly, '7d', null, m.weeklyReset));
    if (m.quotaStale) metrics.child(txt('Cached reading · waiting for refresh', 10.5, p.muted));

    const account = m.accountCredits?.data;
    const snapshotTip = m.accountCredits?.capturedAt ? '账户额度 · ' + new Date(m.accountCredits.capturedAt).toLocaleString()
      + '\n每分钟自动刷新' + (m.accountCredits.message ? '\n' + m.accountCredits.message : '') : '';
    const creditCard = card('kiro-credits-card').child(heading('Kiro credits',
      txt(account?.planName ?? '积分', 10.5, p.muted).max_w(100).truncate().tooltip(snapshotTip)));
    const creditPool = (id, name, pool, badge, extra = '') => quotaRow(id, name,
      pool.total > 0 ? pool.remaining / pool.total * 100 : null, badge,
      { remaining: pool.remaining, tip: extra + '\n剩余 ' + pool.remaining.toFixed(2) + ' credits\n已用 '
        + pool.used.toFixed(2) + ' / ' + pool.total.toFixed(2) + ' credits\n' + snapshotTip });
    if (account) {
      if (account.plan) creditCard.child(creditPool('kiro-plan-quota', 'Plan left', account.plan, 'P', account.planName));
      for (const [i, bonus] of (account.bonus ?? []).entries()) {
        creditCard.child(creditPool('kiro-bonus-' + i, account.bonus.length > 1 ? 'Bonus ' + (i + 1) + ' left' : 'Bonus left', bonus, '+',
          bonus.name + (bonus.expiresOn ? '\n到期 ' + bonus.expiresOn : '')));
      }
      for (const [i, addOn] of (account.addOn ?? []).entries()) {
        creditCard.child(creditPool('kiro-addon-' + i, account.addOn.length > 1 ? 'Add-on ' + (i + 1) + ' left' : 'Add-on left', addOn, '+',
          addOn.expiresOn ? '到期 ' + addOn.expiresOn : '加购积分'));
      }
      creditCard.child(h_flex().w_full().items_center().gap(6).pt(2)
        .when(Boolean(account.resetsOn), el => el.child(txt('Reset ' + account.resetsOn.slice(5), 10.5, p.muted).tooltip('套餐重置 ' + account.resetsOn)))
        .child(div().flex_1())
        .child(txt(m.accountCredits.state === 'stale' ? 'Cached · retrying' : 'Auto refresh', 10.5, p.muted).tooltip(snapshotTip)));
    } else {
      creditCard.child(txt(m.accountCredits?.message ?? '正在读取账户额度…', 11, p.muted));
    }
    if (m.credits != null) creditCard.child(div().w_full().h(1).bg(p.line))
      .child(h_flex().w_full().justify_between().gap(6).child(txt('本会话已用', 11, p.muted))
        .child(mono(m.credits.toFixed(2) + ' credits', 12, p.text)));

    const git = m.git.state === 'ready' ? m.git.data : null;
    const branch = git?.branch ?? pane?.branch;
    const syncPill = (id, label, color) => h_flex().id(id).h(21).px(7).rounded(6).items_center()
      .bg(material.well).border(.5).border_color(material.wellEdge)
      .child(mono(label, 10, color).line_height(1));
    const workspace = card('workspace-card')
      .child(heading('Workspace', icon('branch', 15, p.accent)))
      .child(h_flex().w_full().gap(10).items_center()
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(h_flex().id('workspace-branch-copy').min_w(0).px(4).py(2).ml(-4).rounded(6).items_center().gap(5)
            .when(Boolean(branch), el => el.cursor_pointer().hover(s => s.bg(p.hover))
              .tooltip(branch + '\nClick to copy branch')
              .on_click((_e, cx) => this.copyValue('branch', branch, cx)))
            .child(mono(this.copied === 'branch' ? 'Copied branch' : (branch ?? (m.git.state === 'empty' ? 'No repository' : '—')),
              12.5, this.copied === 'branch' ? p.done : p.text).font_weight(500).min_w(0).truncate()))
          .child(txt(space?.machine ?? 'Local workspace', 10.5, p.muted).truncate()))
        .when(Boolean(git), el => el.child(v_flex().id('workspace-open-changes').flex_none().items_end().gap(1)
          .px(8).py(4).mr(-4).rounded(8).cursor_pointer().hover(s => s.bg(p.hover))
          .tooltip('Toggle Git changes panel')
          .on_click(() => this.toggleSidePanel('changes'))
          .child(txt(git.changed, 24, git.changed ? p.text : p.muted).font_weight(500).line_height(1))
          .child(txt(git.changed ? 'changed' : 'clean', 10, git.changed ? p.accent : p.muted)))))
      .when(Boolean(git?.ahead || git?.behind), el => el.child(h_flex().w_full().gap(6).items_center()
        .when(Boolean(git.ahead), row => row.child(syncPill('git-ahead', '↑ ' + git.ahead + ' ahead', p.accent)))
        .when(Boolean(git.behind), row => row.child(syncPill('git-behind', '↓ ' + git.behind + ' behind', p.muted)))))
      .when(m.git.state === 'error', el => el.child(txt(m.git.message, 10.5, p.blocked)));
    const tabsById = new Map((space?.tabs ?? []).map((t) => [t.id, t]));
    const agentCard = card('agents-card').child(heading('Agents', mono(list.length, 10.5)))
      .child(v_flex().w_full().gap(4).max_h(168).overflow_y_scrollbar().children(list.map(agent => {
        const st = statusInfo(agent.status);
        const stColor = p[st.key];
        const isBlocked = agent.status === 'blocked';
        const isWorking = agent.status === 'working';
        const progName = agent.program?.name ?? 'Agent';
        const sub = taskTitle(agent, tabsById.get(agent.tab), space);
        const showSub = Boolean(sub) && sub.toLowerCase() !== progName.toLowerCase() && sub.toLowerCase() !== (space?.name ?? '').toLowerCase();
        return h_flex().id('status-agent-' + agent.address).w_full().min_h(showSub ? 38 : 30).px(8).py(4).gap(7).rounded(8).items_center()
          .when(agent.focused, el => el.bg(p.selected))
          .when(!agent.focused && isBlocked, el => el.bg(withAlpha(p.blocked, '14')).border(.5).border_color(withAlpha(p.blocked, '44')))
          .cursor_pointer().hover(s => s.bg(agent.focused ? p.selected : p.hover))
          .on_click(() => run('pane.focus', { pane: agent.pane }))
          .child(div().w(2).h(showSub ? 18 : 14).flex_none().rounded_full()
            .when(agent.focused || isBlocked, el => el.bg(agent.focused ? p.accent : p.blocked)))
          .child(programIcon(agent.program, 13, agent.focused ? p.text : p.muted) ?? dot(stColor, 5, isWorking))
          .child(v_flex().flex_1().min_w(0).gap(1)
            .child(txt(progName, 11.5, agent.focused ? p.text : p.muted).font_weight(agent.focused ? 500 : 400).line_height(1.1).truncate())
            .when(showSub, col => col.child(txt(sub, 10, p.dim).line_height(1.1).truncate())))
          .child(h_flex().flex_none().items_center().gap(4)
            .child(dot(stColor, 4.5, isWorking))
            .child(txt(st.label, 10, isBlocked || isWorking || agent.status === 'done' ? stColor : p.muted)));
      })));
    return v_flex().id('zero-herdr-root').size_full().font_family(UI)
      // The layout owns the outer spacing. Keep card edges on its grid;
      // only reserve scroll space below the last card for its shadow.
      .child(v_flex().id('zero-herdr-body').w_full().flex_1().min_h(0).overflow_y_scrollbar().pb(12).gap(10)
        .child(session)
        .when(hasContext || hasQuota || m.quotaStale, el => el.child(metrics))
        .when(m.isKiro, el => el.child(creditCard))
        .when(m.git.state !== 'idle' || Boolean(branch), el => el.child(workspace))
        .when(list.length > 1, el => el.child(agentCard)));
  }
}
