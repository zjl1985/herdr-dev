// Read-only bridge: reads Kiro session files, never writes to ~/.kiro.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TAIL_BYTES = 8 * 1024 * 1024;

function kiroRoot() {
  return process.env.KIRO_HOME || path.join(os.homedir(), '.kiro');
}
function listDirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); }
  catch { return []; }
}
function inWorkspace(cwd, session) {
  const paths = [...(session.workspacePaths || []), ...(session.rootPaths || [])].filter(p => typeof p === 'string' && p);
  return paths.some(p => cwd === p || cwd.startsWith(p.replace(/\/+$/, '') + '/'));
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
      if (session && typeof session === 'object' && inWorkspace(cwd, session)) found.push({ dir, session });
    }
  }
  if (!found.length) return null;
  const clean = (title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const titled = clean ? found.filter(({ session: s }) => s.title && (clean === s.title || clean.startsWith(s.title))) : [];
  const pool = titled.length ? titled : found;
  const time = s => Date.parse(s.lastModifiedAt || s.createdAt || '') || 0;
  return pool.sort((a, b) => time(b.session) - time(a.session))[0];
}
function parseMessages(text) {
  let percent = null, credits = null, updatedAt = null;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const payload = row?.payload;
    if (row?.timestamp) updatedAt = row.timestamp;
    if (payload?.type === 'session_metadata' && payload.key === 'contextUsage') {
      const value = Number(payload.value?.usagePercentage);
      if (Number.isFinite(value)) percent = value;
    }
    if (payload?.type === 'usage_summary') {
      for (const turn of payload.promptTurnSummaries || []) {
        const usage = Number(turn?.usage);
        if (turn?.unit === 'credit' && Number.isFinite(usage)) credits = (credits ?? 0) + usage;
      }
    }
  }
  return { percent, credits, updatedAt };
}
function readTail(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, TAIL_BYTES));
    fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
    return buffer.toString('utf8');
  } finally { fs.closeSync(fd); }
}
function readStatus(cwd, title) {
  const match = findSession(cwd, title);
  if (!match) return { error: 'Waiting for matching Kiro session' };
  const { dir, session } = match;
  let usage = { percent: null, credits: null, updatedAt: null };
  try { usage = parseMessages(readTail(path.join(dir, 'messages.jsonl'))); } catch {}
  return {
    id: session.id, title: session.title,
    model: session.contextSnapshotModelDisplay?.display ?? session.modelId ?? null,
    context: usage.percent != null ? { percent: usage.percent } : null,
    credits: usage.credits != null ? Math.round(usage.credits * 100) / 100 : null,
    updatedAt: usage.updatedAt ?? session.lastModifiedAt ?? null,
  };
}
if (require.main === module) {
  try { console.log(JSON.stringify(readStatus(process.argv[2] || '', process.argv[3] || ''))); }
  catch { console.log(JSON.stringify({ error: 'Kiro session data unavailable' })); }
}
module.exports = { findSession, parseMessages, readStatus };
