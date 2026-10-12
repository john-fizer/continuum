const MAX_TEXT = 700;

function compact(value, size = MAX_TEXT) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, size);
}

export function buildJevEvidenceReview(candidate) {
  const title = compact(candidate?.title, 160);
  const signal = compact(candidate?.signal);
  const smallestTest = compact(candidate?.smallestTest);
  const guardrail = compact(candidate?.guardrail);
  if (!title || !signal || !smallestTest || !guardrail)
    throw new Error('A complete proposed capability is required for evidence review.');

  const state = {
    proposed_capability: title,
    evidence_signal: signal,
    smallest_test: smallestTest,
    promotion_guardrail: guardrail,
    scope: 'Beta review only. This assessment cannot modify memories, graph edges, or production behavior.',
  };

  return {
    state,
    model: 'jev-latest',
    questions: [
      {
        id: 'promotion_readiness',
        type: 'choice',
        prompt: 'Based only on this proposed capability and its stated test, what is the appropriate next decision?',
        choices: ['prototype', 'needs_evidence', 'reject'],
      },
      {
        id: 'evidence_strength',
        type: 'score',
        prompt: 'How strong is the stated evidence and test plan for a limited beta experiment?',
        min: 0,
        max: 1,
      },
      {
        id: 'human_review',
        type: 'noul',
        prompt: 'Would promoting this proposed capability require human review before any production release?',
      },
    ],
  };
}

function responseItems(payload) {
  if (Array.isArray(payload?.answers)) return payload.answers;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.answers)) return payload.data.answers;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

function itemValue(item) {
  return item?.value ?? item?.answer ?? item?.result ?? item?.response ?? null;
}

export function parseJevEvidenceReview(payload) {
  const values = new Map(responseItems(payload).map((item) => [item?.id || item?.question_id, itemValue(item)]));
  const readiness = values.get('promotion_readiness');
  const strength = Number(values.get('evidence_strength'));
  const humanReview = Number(values.get('human_review'));
  return {
    decision: ['prototype', 'needs_evidence', 'reject'].includes(readiness) ? readiness : 'needs_evidence',
    evidence_strength: Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : null,
    human_review_probability: Number.isFinite(humanReview) ? Math.min(1, Math.max(0, humanReview)) : null,
    raw: payload,
  };
}
