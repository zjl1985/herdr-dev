import { test } from "node:test";
import assert from "node:assert/strict";
import { folder, formatDuration, formatResetTime, parseGitStatus, parseKimiUsage, taskTitle, cleanTitle, isValidModelOption, switchLanded } from "../mods/zero-herdr/data.js";

test("folder shortens home paths", () => {
  assert.equal(folder(null, "/h"), "");
  assert.equal(folder("/h", "/h"), "~");
  assert.equal(folder("/h/code/x", "/h"), "~/code/x");
  assert.equal(folder("/other", "/h"), "/other");
});

test("formatDuration representative outputs", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatDuration(419_000), "6m 59s");
  assert.equal(formatDuration(3_600_000 + 120_000), "1h 2m");
  assert.equal(formatDuration(-5), "0s");
});

test("formatResetTime shows an absolute local reset timestamp", () => {
  const now = new Date(2026, 10, 25, 18, 0).getTime();
  const at = (year, month, day, hour, minute) => new Date(year, month, day, hour, minute).getTime() / 1000;
  assert.equal(formatResetTime(at(2026, 10, 25, 23, 5), now), "23:05");
  assert.equal(formatResetTime(at(2026, 10, 26, 8, 9), now), "08:09");
  assert.equal(formatResetTime(at(2026, 11, 2, 14, 55), now), "12/2 14:55");
  assert.equal(formatResetTime(at(2027, 0, 1, 0, 0), now), "2027/1/1 00:00");
  assert.equal(formatResetTime(null, now), null);
  assert.equal(formatResetTime("invalid", now), null);
});

test("parseGitStatus handles branch, ahead/behind and changes", () => {
  const out = [
    "# branch.head main",
    "# branch.ab +2 -1",
    "1 .M N... path",
    "? untracked",
    "u A... U path2",
  ].join("\n");
  assert.deepEqual(parseGitStatus(out), { branch: "main", changed: 3, ahead: 2, behind: 1 });
  assert.deepEqual(parseGitStatus(""), { branch: null, changed: 0, ahead: 0, behind: 0 });
  assert.deepEqual(parseGitStatus("# branch.head (detached)"), { branch: "(detached)", changed: 0, ahead: 0, behind: 0 });
});

test("parseKimiUsage parses footer line, else null", () => {
  assert.deepEqual(parseKimiUsage("context: 42% (90k / 256k)"), { percent: 42, used: "90k", total: "256k" });
  assert.deepEqual(parseKimiUsage("context: 10.5% (1.2k / 8k) more"), { percent: 10.5, used: "1.2k", total: "8k" });
  assert.equal(parseKimiUsage("no data"), null);
  assert.equal(parseKimiUsage(""), null);
});

test("taskTitle prefers named tab, real titles, space name fallback", () => {
  const agent = { title: "› Fix the login bug", program: { name: "Codex" }, app: "codex", address: "t1" };
  assert.equal(taskTitle(agent, { named: true, name: "My task" }, { name: "repo" }), "My task");
  assert.equal(taskTitle(agent, { named: false }, { name: "repo" }), "Fix the login bug");
  assert.equal(taskTitle({ ...agent, title: "› Codex" }, { named: false }, { name: "repo" }), "repo");
  assert.equal(taskTitle({ ...agent, title: "› t2p" }, { named: false }, { name: "repo" }), "repo");
  assert.equal(taskTitle(null, null, { name: "repo" }), "repo");
  assert.equal(taskTitle(null, null, null), "No active task");
  assert.equal(cleanTitle("› › hello"), "hello");
});

test("isValidModelOption guards the switch command", () => {
  assert.equal(isValidModelOption("gpt-6-astra"), true);
  assert.equal(isValidModelOption("high"), true);
  assert.equal(isValidModelOption(""), false);
  assert.equal(isValidModelOption("a b"), false);
  assert.equal(isValidModelOption("../x"), false);
  assert.equal(isValidModelOption(null), false);
});

test("switchLanded detects confirmed model/effort only", () => {
  const pick = { kind: "model", value: "gpt-6-astra" };
  assert.equal(switchLanded({ model: "gpt-6-astra", effort: "high" }, pick), true);
  assert.equal(switchLanded({ model: "gpt-5" }, pick), false);
  assert.equal(switchLanded(null, pick), false);
  assert.equal(switchLanded({ effort: "high" }, { kind: "effort", value: "high" }), true);
  assert.equal(switchLanded({ effort: "low" }, { kind: "effort", value: "high" }), false);
  assert.equal(switchLanded({ model: "x" }, { kind: "banana", value: "x" }), false);
});
