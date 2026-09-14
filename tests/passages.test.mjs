import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkSource, cosineSimilarity } from '../app/research/chunks.mjs';

test('chunks a source into ordered passage-sized evidence with source locations', () => {
  const body = Array.from({ length: 18 }, (_, index) => `Sentence ${index + 1} describes a feedback system and its observations.`).join(' ');
  const passages = chunkSource({ id: 'source-1', title: 'Feedback', body }, 180, 30);
  assert.ok(passages.length > 2);
  assert.deepEqual(passages.map((passage) => passage.ordinal), passages.map((_, index) => index));
  assert.equal(passages[0].source_id, 'source-1');
  assert.ok(passages.every((passage) => passage.body.length <= 220));
  assert.ok(passages.every((passage) => passage.char_end > passage.char_start));
});

test('ranks vectors by cosine similarity without treating magnitude as relevance', () => {
  assert.ok(cosineSimilarity([1, 1], [10, 10]) > .99);
  assert.ok(cosineSimilarity([1, 0], [0, 1]) < .01);
  assert.equal(cosineSimilarity([], [1]), 0);
});
