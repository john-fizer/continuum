import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSource, conceptCandidates } from '../app/research/worker.mjs';

test('research worker records only evidence-backed candidate connections', () => {
  const result = analyzeSource(
    { id: 'a', body: 'Feedback loops connect observations with experiments.' },
    [
      { id: 'a', body: 'Feedback loops connect observations with experiments.' },
      { id: 'b', body: 'Experiments test feedback from observations.' },
      { id: 'c', body: 'Unrelated cooking recipe with oregano.' },
    ],
  );
  assert.deepEqual(result.links, [
    { source_a: 'a', source_b: 'b', terms: ['experiments', 'feedback', 'observations'] },
  ]);
  assert.match(result.summary, /3 shared terms/);
});

test('research worker does not infer a relationship from one shared generic word', () => {
  const result = analyzeSource(
    { id: 'a', body: 'A single idea needs evidence.' },
    [{ id: 'b', body: 'A separate planet has rings.' }],
  );
  assert.deepEqual(result.links, []);
});

test('concept candidates retain source-local mention evidence', () => {
  const concepts = conceptCandidates({
    title: 'Feedback systems',
    body: 'Feedback improves feedback stability. Stability requires evidence and measurement.',
  }, 4);
  assert.deepEqual(concepts.slice(0, 2).map(({ label, mentions }) => ({ label, mentions })), [
    { label: 'feedback', mentions: 3 },
    { label: 'stability', mentions: 2 },
  ]);
  assert.match(concepts[0].excerpt, /Feedback/i);
});
