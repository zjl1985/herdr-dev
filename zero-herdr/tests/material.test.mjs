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
