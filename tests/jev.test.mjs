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
  assert.deepEqual(Object.keys(review.questions), ['promotion_readiness', 'evidence_strength', 'human_review']);
  assert.deepEqual(Object.values(review.questions).map((question) => question.type), ['choice', 'score', 'noul']);
  assert.match(review.questions.promotion_readiness.instructions, /proposed_capability/);
  assert.deepEqual(Object.keys(review.questions.promotion_readiness.criteria), ['prototype', 'needs_evidence', 'reject']);
  assert.equal(review.questions.evidence_strength.criteria.length, 4);
  assert.equal(review.state.proposed_capability, candidate.title);
  assert.equal('sources' in review.state, false);
});

test('JEV review response is a typed recommendation and never a promotion mutation', () => {
  const review = parseJevEvidenceReview({ answers: {
    promotion_readiness: { type: 'choice', choice: 'prototype', probabilities: { prototype: .9, needs_evidence: .1, reject: 0 }, confidence: .8 },
    evidence_strength: { type: 'score', score: 2.13, probabilities: { 0: 0, 1: .1, 2: .67, 3: .23 }, confidence: .6 },
    human_review: { type: 'noul', noul: .88 },
  } });
  assert.equal(review.decision, 'prototype');
  assert.equal(review.evidence_strength, .71);
  assert.equal(review.human_review_probability, .88);
  assert.ok(review.raw);
});

test('JEV API requires a server-side key and verifies private-brain ownership', async () => {
  const source = await readFile(new URL('../api/jev-review.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.TYPESAFE_API_KEY/);
  assert.match(source, /process\.env\.JEV_API_KEY/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /eq\('owner_id', verified\.user\.id\)/);
  assert.match(source, /https:\/\/api\.typesafe\.ai\/v1\/systemone/);
});
