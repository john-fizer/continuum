import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile attention exposes direct labeled actions instead of icon-only controls', async () => {
  const source = await readFile(new URL('../app/attention/workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /attention-mobile-actions/);
  assert.match(source, /Talk\s*<\/button>/);
  assert.match(source, /Ask\s*<\/button>/);
  assert.match(source, /Add knowledge\s*<\/button>/);
  assert.match(source, /void ask\(true\)/);
  assert.match(source, /speaking \? 'Speaking' : 'Replay'/);
});
