// Read-only bridge for Antigravity (AGY) sessions and quota
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function agyRoot() {
  return process.env.AGY_HOME || process.env.ANTIGRAVITY_HOME || path.join(os.homedir(), '.gemini/antigravity-cli');
}

function getConversationTitle(root, conversationId) {
  if (!conversationId) return null;
  const dbPath = path.join(root, 'conversation_summaries.db');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    const query = `SELECT title FROM conversation_summaries WHERE conversation_id=${quote(conversationId)} LIMIT 1`;
    const res = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', dbPath, query], { encoding: 'utf8', timeout: 2000 }) || '[]');
    return res[0]?.title || null;
  } catch {
    return null;
  }
}

function readStatus(cwd, title) {
  const root = agyRoot();
  const presenceDir = path.join(root, 'presence');
  if (!fs.existsSync(presenceDir)) {
    return { error: 'Waiting for matching Antigravity session' };
  }

  let candidates = [];
  try {
    const files = fs.readdirSync(presenceDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const fullPath = path.join(presenceDir, file);
        const stat = fs.statSync(fullPath);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        candidates.push({ file, fullPath, data, mtime: stat.mtimeMs });
      } catch {}
    }
  } catch {}

  if (!candidates.length) {
    return { error: 'Waiting for matching Antigravity session' };
  }

  // Filter or score candidates based on cwd and title
  const cleanTitle = (title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  for (const c of candidates) {
    const dataCwd = c.data.workspace?.project_dir || c.data.workspace?.current_dir || c.data.cwd || '';
    let depth = -1;
    if (cwd && dataCwd) {
      const p = dataCwd.replace(/\/+$/, '') || '/';
      if (cwd === p || cwd.startsWith(p === '/' ? '/' : p + '/')) {
        depth = p.length;
      }
    }
    c.depth = depth;

    // Check title match
    let rank = 0;
    const cid = c.data.conversation_id || c.data.session_id;
    const convTitle = getConversationTitle(root, cid);
    c.convTitle = convTitle;
    if (cleanTitle && convTitle) {
      if (cleanTitle === convTitle) rank = 2;
      else if (cleanTitle.startsWith(convTitle) || convTitle.startsWith(cleanTitle)) rank = 1;
    }
    c.rank = rank;
  }

  // Best match: rank > depth > mtime
  candidates.sort((a, b) => (b.rank - a.rank) || (b.depth - a.depth) || (b.mtime - a.mtime));
  const best = candidates[0];
  const data = best.data;

  // Extract model
  const rawModel = data.model?.display_name || data.model?.id || 'Gemini';
  const effort = data.model?.effort || null;

  // Extract context window
  let context = null;
  if (data.context_window?.used_percentage != null) {
    context = {
      percent: Number(data.context_window.used_percentage),
      used: data.context_window.total_input_tokens || null,
      total: data.context_window.context_window_size || null,
    };
  }

  // Extract quotas (prefer gemini quota, fallback to 3p)
  const g5h = data.quota?.['gemini-5h'];
  const t5h = data.quota?.['3p-5h'];
  const target5h = (g5h && g5h.remaining_fraction != null) ? g5h : t5h;
  let fiveHour = null;
  if (target5h && target5h.remaining_fraction != null) {
    fiveHour = {
      left: Math.round(Number(target5h.remaining_fraction) * 100),
      resetsAt: target5h.reset_time ? Math.floor(new Date(target5h.reset_time).getTime() / 1000) : null,
    };
  }

  const gwk = data.quota?.['gemini-weekly'];
  const twk = data.quota?.['3p-weekly'];
  const targetWk = (gwk && gwk.remaining_fraction != null) ? gwk : twk;
  let weekly = null;
  if (targetWk && targetWk.remaining_fraction != null) {
    weekly = {
      left: Math.round(Number(targetWk.remaining_fraction) * 100),
      resetsAt: targetWk.reset_time ? Math.floor(new Date(targetWk.reset_time).getTime() / 1000) : null,
    };
  }

  return {
    id: data.conversation_id || data.session_id,
    title: best.convTitle || (data.workspace?.project_dir ? path.basename(data.workspace.project_dir) : null),
    model: rawModel,
    effort,
    context,
    weekly,
    fiveHour,
    cwd: data.workspace?.project_dir || data.cwd,
    updatedAt: new Date(best.mtime).toISOString(),
  };
}

if (require.main === module) {
  const [, , cwd = '', title = ''] = process.argv;
  try {
    process.stdout.write(JSON.stringify(readStatus(cwd, title)) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message || 'Antigravity session data unavailable' }) + '\n');
  }
}

module.exports = { readStatus, agyRoot };
