// Pure data helpers extracted from main.js (C01). No herdr imports, no
// element builders: every export is a pure function of its arguments, so the
// Node test suite can run without the app (zero-herdr/tests/).

/** Shorten an absolute path under home to "~/...". */
export function folder(cwd, homeDir) {
  if (!cwd) return "";
  return cwd === homeDir ? "~" : cwd.startsWith(homeDir + "/") ? "~" + cwd.slice(homeDir.length) : cwd;
}

/** "6m 59s" style elapsed text from milliseconds. */
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** `git status --porcelain=v2 --branch` output -> {branch, changed, ahead, behind}. */
export function parseGitStatus(output) {
  const result = { branch: null, changed: 0, ahead: 0, behind: 0 };
  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) result.branch = line.slice(14);
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        result.ahead = Number(match[1]);
        result.behind = Number(match[2]);
      }
    }
    if (/^(?:1|2|u|\?) /.test(line)) result.changed += 1;
  }
  return result;
}

/** Kimi terminal footer "context: 42% (90k / 256k)" -> {percent, used, total}. */
export function parseKimiUsage(output) {
  const match = output.match(/context:\s*(\d+(?:\.\d+)?)%\s*\((\d+(?:\.\d+)?[kKM]?)\s*\/\s*(\d+(?:\.\d+)?[kKM]?)\)/);
  if (!match) return null;
  return { percent: Number(match[1]), used: match[2], total: match[3] };
}

/** Strip leading punctuation/symbols from terminal titles. */
export function cleanTitle(title) {
  return (title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/** Best human title for the session: the named tab, else the terminal title
 *  when it says something real, else the space name. */
export function taskTitle(agent, tab, space) {
  if (tab?.named && tab.name) return tab.name;
  const title = cleanTitle(agent?.title);
  const generic = [agent?.program?.name, agent?.app, agent?.address, space?.name]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (title && !generic.includes(title.toLowerCase()) && !/^t[0-9a-z]+$/i.test(title) && !/^[~/]/.test(title)) {
    return title;
  }
  return space?.name ?? "No active task";
}

/** E02: model/effort identifiers accepted into the switch command. */
export function isValidModelOption(value) {
  return /^[a-zA-Z0-9._-]+$/.test(String(value ?? ""));
}

/** E06: true when a fresh session payload proves the switch landed. */
export function switchLanded(data, pick) {
  if (!data || (pick.kind !== "model" && pick.kind !== "effort")) return false;
  if (pick.kind === "model") return data.model === pick.value;
  return data.effort === pick.value;
}
