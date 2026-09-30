import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('conversation mode serializes listening, thinking, and speaking turns', async () => {
  const source = await readFile(new URL('../app/attention/workspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /type ConversationPhase = 'idle' \| 'listening' \| 'thinking' \| 'speaking';/);
  assert.match(source, /function stopListening\(\)/);
  assert.match(source, /phase\.current !== 'listening'/);
  assert.match(source, /scheduleConversationListening\(\)/);
  assert.match(source, /if \(conversationEnabled\.current\) scheduleConversationListening\(\);/);
});

test('the microphone can interrupt speech before starting a new turn', async () => {
  const source = await readFile(new URL('../app/attention/workspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /function interruptSpeechAndListen\(\)/);
  assert.match(source, /if \(speaking\) \{\s*interruptSpeechAndListen\(\);/);
});
