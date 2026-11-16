// The Node bridge keeps credentials out of the mod and caches API reads for
// one minute. Only balances, timestamps and account fingerprints return here.
export async function readKiroAccountUsage(exec, root, previous = null) {
  const result = await exec('node', [root + '/mods/zero-herdr/kiro-account.cjs', JSON.stringify(previous)], { timeout: 8000 });
  if (result.code != null && result.code !== 0) throw new Error('Kiro 额度读取失败，将自动重试');
  return JSON.parse(result.stdout);
}
