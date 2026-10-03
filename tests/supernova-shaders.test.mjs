import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('plasma core uses a voice-driven superformula deformation field', async () => {
  const source = await readFile(new URL('../app/supernova-shaders.ts', import.meta.url), 'utf8');
  assert.match(source, /uniform vec4 uVoiceBands/);
  assert.match(source, /float superRadius\(/);
  assert.match(source, /superRadius\(phi/);
  assert.match(source, /voiceGate/);
  assert.doesNotMatch(source, /float m=5\.\+floor/);
  assert.match(source, /gl_FragColor=vec4\(col,\(\.42/);
  assert.match(source, /float dissolve=/);
  assert.match(source, /Shared fire field: the core hands its edge color directly to the escaping particles/);
  assert.match(source, /vec3 cyan=vec3\(\.18,\.85,1\.15\)/);
  assert.match(source, /float handoff=smoothstep\(\.24,\.98,length\(vPosition\)\)/);
  assert.match(source, /uniform float uVoice; uniform vec4 uVoiceBands/);
  assert.match(source, /float burst=/);
});
