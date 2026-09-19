import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the graph selects the low-cost renderer for phone-sized screens', async () => {
  const source = await readFile(new URL('../app/supernova.ts', import.meta.url), 'utf8');
  assert.match(source, /max-width: 700px/);
  assert.match(source, /const particles = compact \? 6000 : 52000/);
  assert.match(source, /compact\s*\?\s*600000/);
});
