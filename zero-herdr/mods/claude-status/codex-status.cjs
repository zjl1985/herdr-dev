// Read-only bridge: independent of the Codex terminal footer.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function chooseThread(rows, title) {
  const clean = title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const matches = rows.filter(r => [r.name, r.title].filter(Boolean).some(name => clean === name || clean.startsWith(name + ' | ')));
  return matches.length === 1 ? matches[0] : null;
}
function parseUsage(text) {
  let info = null, limits = null, context = null, updatedAt = null;
  for (const line of text.split('\n')) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type === 'turn_context') context = row.payload;
    if (row.type !== 'event_msg' || row.payload?.type !== 'token_count') continue;
    if (row.payload.info) info = row.payload.info;
    if (row.payload.rate_limits) limits = row.payload.rate_limits;
    updatedAt = row.timestamp;
  }
  const used = info?.last_token_usage?.total_tokens;
  const total = info?.model_context_window;
  const windows = [limits?.primary, limits?.secondary].filter(Boolean);
  const weekly = windows.find(w => w.window_minutes === 10080);
  const fiveHour = windows.find(w => w.window_minutes === 300);
  return {
    model: context?.model, effort: context?.effort,
    context: Number.isFinite(used) && total > 0 ? { used, total, percent: total <= 12000 ? 100 : 100 - Math.round(100 * Math.max(0, total - 12000 - Math.max(0, used - 12000)) / (total - 12000)) } : null,
    weekly: weekly ? { left: Math.max(0, Math.min(100, 100 - weekly.used_percent)), resetsAt: weekly.resets_at } : null,
    fiveHour: fiveHour ? { left: Math.max(0, Math.min(100, 100 - fiveHour.used_percent)), resetsAt: fiveHour.resets_at } : null,
    updatedAt,
  };
}
function readModels() {
  const root = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'models_cache.json'), 'utf8')).models
      .filter(m => m.visibility === 'list')
      .map(m => ({ id: m.slug, name: m.display_name, efforts: (m.supported_reasoning_levels || []).map(r => r.effort) }));
  } catch { return []; }
}
function readStatus(cwd, title) {
  const root = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const query = `SELECT id, name, title, cwd, model, reasoning_effort, rollout_path FROM threads WHERE archived=0 AND cwd=${quote(cwd)} ORDER BY updated_at DESC LIMIT 100`;
  const rows = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', path.join(root, 'state_5.sqlite'), query], { encoding: 'utf8', timeout: 2500 }) || '[]');
  const thread = chooseThread(rows, title);
  if (!thread) return { error: 'Waiting for matching Codex session' };
  const fd = fs.openSync(thread.rollout_path, 'r');
  let text;
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, 4 * 1024 * 1024));
    fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
    text = buffer.toString('utf8');
  } finally { fs.closeSync(fd); }
  const usage = parseUsage(text);
  return { ...usage, id: thread.id, title: thread.name || thread.title, cwd: thread.cwd,
    model: thread.model || usage.model, effort: thread.reasoning_effort || usage.effort, models: readModels() };
}
if (require.main === module) {
  try { console.log(JSON.stringify(readStatus(process.argv[2] || '', process.argv[3] || ''))); }
  catch { console.log(JSON.stringify({ error: 'Codex session data unavailable' })); }
}
module.exports = { chooseThread, parseUsage, readStatus };
