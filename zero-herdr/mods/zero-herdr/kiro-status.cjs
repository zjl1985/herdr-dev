// Read-only bridge: reads Kiro session files, never writes to ~/.kiro.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHUNK_BYTES = 1024 * 1024;

function kiroRoot() {
  return process.env.KIRO_HOME || path.join(os.homedir(), '.kiro');
}
function listDirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); }
  catch { return []; }
}
// Length of the deepest workspace path containing cwd, or -1 when none does.
function workspaceDepth(cwd, session) {
  const paths = [...(session.workspacePaths || []), ...(session.rootPaths || [])].filter(p => typeof p === 'string' && p);
  let depth = -1;
  for (const raw of paths) {
    const p = raw.replace(/\/+$/, '') || '/';
    if (cwd === p || cwd.startsWith(p === '/' ? '/' : p + '/')) depth = Math.max(depth, p.length);
  }
  return depth;
}
// 2 = terminal title equals the session title, 1 = long-enough prefix, 0 = no match.
function titleRank(clean, sessionTitle) {
  if (!clean || typeof sessionTitle !== 'string' || !sessionTitle) return 0;
  if (clean === sessionTitle) return 2;
  return sessionTitle.length >= 8 && clean.startsWith(sessionTitle) ? 1 : 0;
}
function findSession(cwd, title) {
  if (!cwd) return null;
  const sessionsDir = path.join(kiroRoot(), 'sessions');
  const found = [];
  for (const group of listDirs(sessionsDir)) {
    if (group === 'cli') continue;
    for (const name of listDirs(path.join(sessionsDir, group))) {
      if (!name.startsWith('sess_')) continue;
      const dir = path.join(sessionsDir, group, name);
      let session;
      try { session = JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')); } catch { continue; }
      if (!session || typeof session !== 'object') continue;
      const depth = workspaceDepth(cwd, session);
      if (depth >= 0) found.push({ dir, session, depth });
    }
  }
  if (!found.length) return null;
  const clean = (title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const time = s => Date.parse(s.lastModifiedAt || s.createdAt || '') || 0;
  // Title match first, then the closest workspace, then the most recent session.
  for (const item of found) { item.rank = titleRank(clean, item.session.title); item.time = time(item.session); }
  found.sort((a, b) => (b.rank - a.rank) || (b.depth - a.depth) || (b.time - a.time));
  const { dir, session } = found[0];
  return { dir, session };
}
function newUsage() {
  return { percent: null, credits: null, updatedAt: null };
}
function parseLine(usage, line) {
  if (!line) return;
  let row;
  try { row = JSON.parse(line); } catch { return; }
  const payload = row?.payload;
  if (row?.timestamp) usage.updatedAt = row.timestamp;
  if (payload?.type === 'session_metadata' && payload.key === 'contextUsage') {
    const value = Number(payload.value?.usagePercentage);
    if (Number.isFinite(value)) usage.percent = value;
  }
  if (payload?.type === 'usage_summary') {
    for (const turn of payload.promptTurnSummaries || []) {
      const value = Number(turn?.usage);
      if (turn?.unit === 'credit' && Number.isFinite(value)) usage.credits = (usage.credits ?? 0) + value;
    }
  }
}
function parseMessages(text) {
  const usage = newUsage();
  for (const line of text.split('\n')) parseLine(usage, line);
  return usage;
}
function readMessages(file, previous = null) {
  const stat = fs.statSync(file);
  if (previous?.path === file && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs) {
    return { usage: previous.usage, cache: previous };
  }

  const append = previous?.path === file && stat.size > previous.size && previous.offset <= previous.size;
  const usage = append ? { ...previous.usage } : newUsage();
  let offset = append ? previous.offset : 0;
  let rest = Buffer.alloc(0);
  const buffer = Buffer.alloc(CHUNK_BYTES);
  const fd = fs.openSync(file, 'r');
  try {
    let position = offset;
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (read === 0) break;
      position += read;
      const data = rest.length ? Buffer.concat([rest, buffer.subarray(0, read)]) : buffer.subarray(0, read);
      const newline = data.lastIndexOf(0x0a);
      if (newline < 0) { rest = data; continue; }
      for (const line of data.subarray(0, newline).toString('utf8').split('\n')) parseLine(usage, line);
      offset += newline + 1;
      rest = data.subarray(newline + 1);
    }
  } finally { fs.closeSync(fd); }
  return { usage, cache: { path: file, size: stat.size, mtimeMs: stat.mtimeMs, offset, usage } };
}
function readStatus(cwd, title, previous = null) {
  const match = findSession(cwd, title);
  if (!match) return { error: 'Waiting for matching Kiro session' };
  const { dir, session } = match;
  let usage = newUsage();
  let cache = null;
  try {
    const result = readMessages(path.join(dir, 'messages.jsonl'), previous);
    usage = result.usage;
    cache = result.cache;
  } catch {}
  return {
    id: session.id, title: session.title,
    model: session.contextSnapshotModelDisplay?.display ?? session.modelId ?? null,
    context: usage.percent != null ? { percent: usage.percent } : null,
    credits: usage.credits != null ? Math.round(usage.credits * 100) / 100 : null,
    updatedAt: usage.updatedAt ?? session.lastModifiedAt ?? null,
    cache,
  };
}
if (require.main === module) {
  let cache = null;
  try { cache = JSON.parse(process.argv[4] || 'null'); } catch {}
  try { console.log(JSON.stringify(readStatus(process.argv[2] || '', process.argv[3] || '', cache))); }
  catch { console.log(JSON.stringify({ error: 'Kiro session data unavailable' })); }
}
module.exports = { findSession, parseMessages, readStatus };
