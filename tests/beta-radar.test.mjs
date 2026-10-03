import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('beta radar keeps proposed research separate from promoted system changes', async () => {
  const source = await readFile(new URL('../app/beta-radar.tsx', import.meta.url), 'utf8');

  assert.match(source, /type CandidateStage = 'watch' \| 'prototype' \| 'ready';/);
  assert.match(source, /Proposed research/);
  assert.match(source, /'Ready for beta'/);
  assert.match(source, /Evidence-backed promotion gate/);
  assert.match(source, /localStorage/);
});

test('the main navigation exposes the isolated beta radar workspace', async () => {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /\| 'Beta Radar'/);
  assert.match(source, /\['Beta Radar', GitFork\]/);
  assert.match(source, /<BetaRadar \/>/);
});
