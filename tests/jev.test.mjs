import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildJevEvidenceReview, parseJevEvidenceReview } from '../app/research/jev.mjs';

const candidate = {
  title: 'Evidence-readiness gate',
  signal: 'Check whether evidence is sufficient before a consequential action.',
  smallestTest: 'Record avoided errors in a limited beta.',
  guardrail: 'Promotion remains human-reviewed.',
};

test('JEV review sends only a bounded proposed capability, not private source history', () => {
  const review = buildJevEvidenceReview(candidate);
  assert.equal(review.model, 'jev-latest');
  assert.equal(review.questions.length, 3);
  assert.deepEqual(review.questions.map((question) => question.type), ['choice', 'score', 'noul']);
  assert.equal(review.state.proposed_capability, candidate.title);
  assert.equal('sources' in review.state, false);
});

test('JEV review response is a typed recommendation and never a promotion mutation', () => {
  const review = parseJevEvidenceReview({ answers: [
    { id: 'promotion_readiness', value: 'prototype' },
    { id: 'evidence_strength', value: .71 },
    { id: 'human_review', value: .88 },
  ] });
  assert.equal(review.decision, 'prototype');
  assert.equal(review.evidence_strength, .71);
  assert.equal(review.human_review_probability, .88);
  assert.ok(review.raw);
});

test('JEV API requires a server-side key and verifies private-brain ownership', async () => {
  const source = await readFile(new URL('../api/jev-review.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.JEV_API_KEY/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /eq\('owner_id', verified\.user\.id\)/);
  assert.match(source, /https:\/\/jevmodel\.net\/v1\/systemone/);
});
