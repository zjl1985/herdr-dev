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

/** Compact local timestamp for the next quota reset. */
export function formatResetTime(epochSeconds, now = Date.now()) {
  if (epochSeconds == null || epochSeconds === "" || typeof epochSeconds === "boolean") return null;
  const reset = new Date(Number(epochSeconds) * 1000);
  if (!Number.isFinite(reset.getTime())) return null;
  const current = new Date(now);
  const time = `${String(reset.getHours()).padStart(2, "0")}:${String(reset.getMinutes()).padStart(2, "0")}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  if (sameDay(reset, current) || sameDay(reset, tomorrow)) return time;
  const year = reset.getFullYear() === current.getFullYear() ? "" : `${reset.getFullYear()}/`;
  return `${year}${reset.getMonth() + 1}/${reset.getDate()} ${time}`;
}

/** Compact remaining time until a quota reset: "28m", "4h 37m", "6d 15h". */
export function formatResetCountdown(epochSeconds, now = Date.now()) {
  if (epochSeconds == null || epochSeconds === "" || typeof epochSeconds === "boolean") return null;
  const target = Number(epochSeconds) * 1000;
  if (!Number.isFinite(target)) return null;
  const ms = target - now;
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** Combined quota + time pace model for a reset window. */
export function quotaPace(remainingQuota, epochSeconds, windowMs, now = Date.now()) {
  const target = Number(epochSeconds) * 1000;
  if (!Number.isFinite(target) || !Number.isFinite(windowMs) || windowMs <= 0) {
    return { elapsed: 0, remainingMs: 0, state: "healthy", label: "On pace" };
  }
  const remainingMs = Math.max(0, target - now);
  const remainingTimePct = Math.max(0, Math.min(100, (remainingMs / windowMs) * 100));
  const elapsed = 100 - remainingTimePct;
  const left = remainingQuota != null && Number.isFinite(Number(remainingQuota))
    ? Math.max(0, Math.min(100, Number(remainingQuota)))
    : null;
  const used = left != null ? 100 - left : null;
  const resettingThreshold = windowMs >= 24 * 60 * 60_000 ? 6 * 60 * 60_000 : 30 * 60_000;
  const resettingSoon = remainingMs <= resettingThreshold;

  if (left != null && (left <= 5 || (left <= 20 && remainingTimePct > 10))) {
    return { elapsed, remainingMs, state: "critical", label: "Low quota" };
  }
  if (resettingSoon) {
    return { elapsed, remainingMs, state: "resetting", label: "Resetting soon" };
  }
  if (used != null && (used > elapsed + 20 || (left <= 35 && remainingTimePct > 25))) {
    return { elapsed, remainingMs, state: "fast", label: "Burning fast" };
  }
  return { elapsed, remainingMs, state: "healthy", label: "On pace" };
}

/** Concise tooltip text for a quota reset (avoids wide Date.toString overflow). */
export function formatResetTooltip(epochSeconds, tzLabel = "", now = Date.now(), paceLabel = "") {
  if (epochSeconds == null || epochSeconds === "" || typeof epochSeconds === "boolean") return "";
  const reset = new Date(Number(epochSeconds) * 1000);
  if (!Number.isFinite(reset.getTime())) return "";
  const date = `${reset.getMonth() + 1}/${reset.getDate()}`;
  const time = `${String(reset.getHours()).padStart(2, "0")}:${String(reset.getMinutes()).padStart(2, "0")}`;
  const left = formatResetCountdown(epochSeconds, now);
  const parts = [`Resets ${date} ${time}`];
  if (left) parts.push(`in ${left}`);
  if (paceLabel) parts.push(paceLabel);
  if (tzLabel) parts.push(tzLabel);
  return parts.join(" · ");
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

/** Clean model display name and strip duplicate trailing effort suffix when effort is shown separately. */
export function normalizeModelName(rawModel, effort = null) {
  if (!rawModel) return null;
  let name = String(rawModel).trim().replace(/^gpt/i, "GPT").replace(/astra/i, "Astra");
  if (effort) {
    name = name.replace(/\s*\((?:none|off|minimal|min|low|medium|med|high|xhigh|x-high|extra[\s_-]*high|max|maximum)\)\s*$/i, "").trim();
  }
  return name || null;
}

/** Semantic profile (bars 0..4, label, hint, tier) for a reasoning effort level. */
export function effortProfile(effort) {
  if (effort == null || effort === "") return null;
  const raw = String(effort).trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "none" || key === "off") return { level: 0, bars: 0, label: "Off", short: "Off", hint: "No extended thinking", tier: "idle" };
  if (key === "minimal" || key === "min") return { level: 1, bars: 1, label: "Minimal", short: "Min", hint: "Fastest · minimal reasoning", tier: "low" };
  if (key === "low") return { level: 1, bars: 1, label: "Low", short: "Low", hint: "Fast & light reasoning", tier: "low" };
  if (key === "medium" || key === "med" || key === "default" || key === "normal") return { level: 2, bars: 2, label: "Medium", short: "Med", hint: "Balanced speed and depth", tier: "mid" };
  if (key === "high") return { level: 3, bars: 3, label: "High", short: "High", hint: "Deep multi-step reasoning", tier: "high" };
  if (key === "xhigh" || key === "extrahigh" || key === "max" || key === "maximum") return { level: 4, bars: 4, label: "X-High", short: "Max", hint: "Maximum reasoning depth", tier: "max" };
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { level: 2, bars: 2, label, short: label, hint: "Reasoning effort", tier: "mid" };
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
