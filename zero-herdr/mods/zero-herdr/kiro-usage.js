// Read the already-open /usage screen. Never type commands or touch drafts.
// Account balances are snapshots, distinct from per-session spending logs.
export function parseKiroAccountUsage(output) {
  const text = String(output ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
  const start = text.lastIndexOf('Estimated Usage');
  if (start < 0) return null;
  const section = text.slice(start);
  const header = section.match(/^Estimated Usage\s*\|\s*resets on\s+(\d{4}-\d{2}-\d{2})\s*\|\s*([^\n]+)/);
  const number = '([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)';
  const plan = section.match(new RegExp('Credits\\s*\\(\\s*' + number + '\\s+of\\s+' + number + '\\s+covered in plan\\s*\\)', 'i'));
  if (!header || !plan) return null;
  const amount = value => Number(value.replace(/,/g, ''));
  const pool = (used, total) => ({ used, total, remaining: Math.max(0, Math.round((total - used) * 100) / 100) });
  const bonus = [];
  const bonusStart = section.indexOf('Bonus credits');
  if (bonusStart >= 0) {
    const pattern = new RegExp('^\\s*([^\\n:]+):\\s*' + number + '\\s*/\\s*' + number + '\\s+credits used(?:,\\s*expires in\\s+(\\d+)\\s+days?)?', 'gmi');
    for (const match of section.slice(bonusStart + 'Bonus credits'.length).matchAll(pattern)) {
      bonus.push({ name: match[1].trim(), ...pool(amount(match[2]), amount(match[3])), expiresInDays: match[4] == null ? null : Number(match[4]) });
    }
  }
  return { planName: header[2].trim(), resetsOn: header[1], plan: pool(amount(plan[1]), amount(plan[2])), bonus: bonusStart >= 0 && !bonus.length ? null : bonus };
}

function processKey(meta, address) {
  if (!['kiro', 'kiro-cli'].includes(meta?.status?.app) || !meta?.foreground?.pid) return null;
  return JSON.stringify([address, meta.created_ms, meta.foreground.pid]);
}

export async function readKiroAccountUsage(hc, address, previous = null, now = Date.now()) {
  const get = async () => {
    const result = await hc(['get', address]);
    if (result.code != null && result.code !== 0) throw new Error('Terminal unavailable');
    return JSON.parse(result.stdout);
  };
  const identity = processKey(await get(), address);
  if (!identity) return null;
  // No history: old /usage output from another login must not be reused.
  const result = await hc(['read', address, '--lines', '0']);
  if (result.code != null && result.code !== 0) throw new Error('Screen unavailable');
  if (processKey(await get(), address) !== identity) return null;
  const parsed = parseKiroAccountUsage(result.stdout);
  const cached = previous?.identity === identity ? previous : null;
  if (!parsed) return cached ? { ...cached, visible: false } : null;
  const signature = JSON.stringify(parsed);
  return { identity, signature, visible: true, capturedAt: cached?.signature === signature ? cached.capturedAt : now, data: parsed };
}
