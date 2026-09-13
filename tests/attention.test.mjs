import test from 'node:test';
import assert from 'node:assert/strict';
import { workingAttention } from '../app/attention/model.mjs';

test('attention only activates returned source IDs and terms with matching source text', () => {
  const sources = [
    { id: 'a', title: 'Control systems', body: 'Feedback controls stability. Structure matters.' },
    { id: 'b', title: 'Biology', body: 'Feedback regulates temperature.' },
    { id: 'secret', title: 'Other work', body: 'Feedback in a different project.' },
  ];
  const result = workingAttention('feedback emergence', [{ source_id: 'a' }, { source_id: 'b' }, { source_id: 'missing' }], sources);
  assert.deepEqual(result.sourceIds, ['a', 'b']);
  assert.deepEqual(result.concepts.find(c => c.label === 'feedback').sourceIds, ['a', 'b']);
  assert.ok(!result.concepts.some(c => c.label === 'emergence'));
  assert.ok(result.concepts.every(c => c.sourceIds.every(id => result.sourceIds.includes(id))));
  assert.ok(result.evidenceEdges.every(e => result.sourceIds.includes(e.source_b)));
});
test('no fabricated concepts for empty retrieval; repeated query does not create duplicate terms', () => {
  assert.deepEqual(workingAttention('emergence', [], []).concepts, []);
  const result = workingAttention('FEEDBACK feedback', [{ source_id: 'a' }, { source_id: 'a' }], [{ id:'a', title:'Feedback', body:'A note about feedback.' }]);
  assert.equal(result.concepts.filter(c => c.label === 'feedback').length, 1);
  assert.equal(result.sourceIds.length, 1);
});
