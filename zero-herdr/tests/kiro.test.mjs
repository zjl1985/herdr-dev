import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { parseMessages } = createRequire(import.meta.url)('../mods/zero-herdr/kiro-status.cjs');
const summary = turns => JSON.stringify({ payload: { type: 'usage_summary', promptTurnSummaries: turns } });
test('Kiro sums fractional credits without turning them into percent', () => {
  const result = parseMessages([
    summary([{ unit: 'credit', usage: .41 }]),
    summary([{ unit: 'credit', usage: 4.73 }, { unit: 'token', usage: 1000 }]),
  ].join('\n'));
  assert.equal(Number(result.credits.toFixed(2)), 5.14);
  assert.equal(result.percent, null);
});
test('Kiro ignores missing, negative and nonfinite credit measurements', () => {
  assert.equal(parseMessages(summary([
    { unit: 'credit', usage: null }, { unit: 'credit', usage: '' },
    { unit: 'credit', usage: -1 }, { unit: 'credit', usage: 'NaN' },
  ])).credits, null);
  assert.equal(parseMessages(summary([{ unit: 'credit', usage: 0 }])).credits, 0);
});
