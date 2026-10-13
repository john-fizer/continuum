import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('embodied presence is a visual mirror of Continuum conversation state', async () => {
  const [presence, workspace] = await Promise.all([
    readFile(new URL('../app/attention/presence.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/attention/workspace.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(presence, /'idle' \| 'listening' \| 'thinking' \| 'speaking'/);
  assert.match(presence, /voice|spectrum/i);
  assert.match(presence, /memory and evidence remain in Continuum/i);
  assert.match(workspace, /Try embodied presence/);
  assert.match(workspace, /overlay=\{embodiment \? <EmbodiedPresence/);
  assert.match(workspace, /voiceEnergy=\{voiceEnergy\}/);
});
