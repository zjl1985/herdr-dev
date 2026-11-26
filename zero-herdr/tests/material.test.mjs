import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardMaterial } from '../mods/zero-herdr/material.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

test('a translucent black border stays faint on a light card', () => {
  const p = { bg: '#ffffff', inset: '#fafafa', text: '#111111', track: '#00000024' };
  const material = cardMaterial({ ...p, line: '#00000018' });
  assert.ok(rgb(material.edge).every(channel => channel > 240));
  assert.equal(cardMaterial({ ...p, line: '#00000000' }).edge, material.top);
});

test('a translucent white border stays faint on a dark card', () => {
  const p = { bg: '#181715', inset: '#141413', text: '#faf9f5', track: '#3d3a35' };
  const material = cardMaterial({ ...p, line: '#ffffff18' });
  const face = rgb(material.top);
  assert.ok(rgb(material.edge).every((channel, i) => channel >= face[i] && channel - face[i] < 20));
  assert.equal(cardMaterial({ ...p, line: '#ffffff00' }).edge, material.top);
});

test('high-contrast dark themes trim excess lift while claude-dark keeps full depth', () => {
  const paperDark = {
    bg: '#1c1c1e', chrome: '#111111', inset: '#111111', text: '#ffffff',
    line: '#2c2c30', track: '#3a3a3e', idle: '#5c5c62', muted: '#8c8c8c',
  };
  const m = cardMaterial(paperDark);
  // Card top stays restrained relative to terminal surface (#1c1c1e)
  assert.ok(rgb(m.top)[0] - rgb(paperDark.bg)[0] <= 8);
  // Recessed well keeps clear tactile depth without collapsing into pure black
  assert.ok(rgb(m.top)[0] - rgb(m.well)[0] >= 8 && rgb(m.well)[0] > rgb(paperDark.inset)[0] + 5);
  // Low-contrast idle falls back to muted
  assert.equal(m.idleText, '#8c8c8c');

  const claudeDark = {
    bg: '#1f1e1b', chrome: '#1f1e1b', inset: '#141413', text: '#faf9f5',
    line: '#2c2a26', track: '#3d3a35', idle: '#a09d96', muted: '#a09d96',
  };
  const c = cardMaterial(claudeDark);
  // When surface matches chrome, full original sculpted lift and well depth are preserved
  assert.ok(rgb(c.top)[0] - rgb(claudeDark.bg)[0] >= 10);
  assert.ok(rgb(c.top)[0] - rgb(c.well)[0] >= 15);
  assert.equal(c.idleText, '#a09d96');
});
