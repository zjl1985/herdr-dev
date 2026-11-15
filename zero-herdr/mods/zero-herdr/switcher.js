// Codex model / reasoning-effort switcher (E01-E03, E06-E07).
// The picker mod (zero-picker) collects the choice; this module owns the
// send/confirm state transitions. All cross-mod signaling goes through the
// persisted shared keys below — the shell offers no other channel. Timers
// stay with the calling view (cx is never retained across callbacks).
//
// TOCTOU limitation (E03): Herdr exposes no non-keyboard API for configuring
// a Codex session, so the switch is keystrokes into the PTY. The composer is
// re-read immediately before sending, but nothing can atomically lock the
// terminal between that check and the write; a draft typed in that window
// could still receive the keystrokes. Unknown states refuse conservatively.
import { hc, notify, shared, setShared } from "herdr";
import { PICK_KEY, SWITCH_KEY } from "./switch-shared.js";
import { isValidModelOption, switchLanded } from "./data.js";

export function switchState() {
  return shared(SWITCH_KEY) ?? null;
}

/** Picker -> switcher wake-up. The payload rides shared state because
 *  run() command arguments are not delivered to nextCommand(). */
export function requestSwitch(kind, value, address) {
  setShared(PICK_KEY, { seq: Date.now(), kind, value, address });
}

function setStage(state, pick, extra = {}) {
  const current = switchState();
  if (current && current.seq > pick.seq) return;
  setShared(SWITCH_KEY, {
    seq: pick.seq, address: pick.address, kind: pick.kind, value: pick.value,
    state, at: Date.now(), ...extra,
  });
}

/** E06: one send per request; the message says "sent" first; the shown
 *  value only changes once a fresh session read confirms it; the 10s
 *  watchdog lives in the calling view and never resends. */
export async function attemptSwitch(pick, targetIsCurrent = () => true) {
  if (!pick || !pick.address) return;
  const previous = switchState();
  if (previous?.state === "sending" || previous?.state === "awaiting" || previous?.seq === pick.seq) return;
  if (!targetIsCurrent()) return;
  setStage("sending", pick);
  const stillSending = () => {
    const state = switchState();
    return state?.seq === pick.seq && state.address === pick.address && state.state === "sending" && targetIsCurrent();
  };
  try {
    const option = String(pick.value ?? "");
    if (!["model", "effort"].includes(pick.kind) || !isValidModelOption(option)) throw new Error("Invalid model option");
    // E02: the target must still be Codex, and the composer provably empty,
    // re-checked immediately before the keys go out.
    const terminal = JSON.parse((await hc(["get", pick.address])).stdout);
    if (!stillSending()) return;
    if (terminal.status?.app !== "codex") throw new Error("This terminal is no longer running Codex.");
    const screen = (await hc(["read", pick.address, "--lines", "80"])).stdout ?? "";
    if (!stillSending()) return;
    const prompt = screen.split("\n").filter((line) => /^\s*›/.test(line)).pop()?.trim();
    if (prompt !== "› Ask Codex to do anything") {
      throw new Error("请先收起 CLI 弹窗并处理输入框中的草稿，再选择模型或推理强度。");
    }
    const command = pick.kind === "model" ? "/model " + option : "/model --reasoning=" + option;
    // Keys go straight to the terminal address: no pane.focus, so the
    // keyboard never leaves the pane the person is in.
    const result = await hc(["keys", pick.address, ...Array.from(command, (ch) => (ch === " " ? "space" : ch)), "enter"]);
    if (!stillSending()) return;
    if (result.code !== 0) throw new Error("Codex did not accept the switch command.");
    setStage("awaiting", pick);
  } catch (error) {
    if (!stillSending()) return;
    const message = String(error?.message ?? error);
    setStage("error", pick, { message });
    notify({ title: "暂时无法切换", body: message, level: "warning" });
  }
}

/** Called by the view whenever a fresh Codex payload lands (C03 path).
 *  Returns true when the switch just landed. */
export function noteCodexData(data, address) {
  const current = switchState();
  if (!current || current.state !== "awaiting") return false;
  if (current.address !== address) return false;
  if (switchLanded(data, current)) {
    setStage("success", current);
    return true;
  }
  return false;
}

/** E07: anything that changes the target invalidates an open switch. */
export function invalidateSwitch(reason) {
  const current = switchState();
  if (!current) return;
  if (current.state === "sending" || current.state === "awaiting") {
    setStage("error", current, { message: reason ?? "目标已变化，切换已取消。" });
  } else {
    setShared(SWITCH_KEY, null);
  }
}
