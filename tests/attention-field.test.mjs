import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the resting attention field hides the stored source graph until a query activates it', async () => {
  const source = await readFile(new URL('../app/attention/workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /const graphNodes = result[\s\S]*?: \[\];/);
  assert.match(source, /const graphLinks = result[\s\S]*?: \[\];/);
});
