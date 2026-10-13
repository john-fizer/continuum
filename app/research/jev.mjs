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
    questions: {
      promotion_readiness: {
        type: 'choice',
        instructions: 'Based only on `proposed_capability`, `evidence_signal`, `smallest_test`, and `promotion_guardrail`, choose the next beta decision. Do not infer evidence that is not present.',
        criteria: {
          prototype: 'The capability has a bounded, reversible smallest test and a stated guardrail; it may enter a limited beta experiment.',
          needs_evidence: 'The idea is plausible but the stated signal or test is too weak, vague, or incomplete to begin a limited beta experiment.',
          reject: 'The proposed experiment is unsafe, unbounded, or conflicts with its stated guardrail.',
        },
      },
      evidence_strength: {
        type: 'score',
        instructions: 'Rate the strength of the stated evidence and smallest test for a limited beta experiment. Judge only the supplied state.',
        criteria: [
          'No usable evidence signal or no testable plan.',
          'A weak or vague signal with a partially specified test.',
          'A concrete signal and bounded test, but incomplete success criteria or guardrails.',
          'A strong, directly relevant signal with a bounded test and explicit guardrail.',
        ],
      },
      human_review: {
        type: 'noul',
        instructions: 'Would any promotion from this beta experiment to production require a human review?',
        criteria: {
          true: 'A human must review outcomes and explicitly approve any production promotion.',
          false: 'The supplied state explicitly establishes a safe, automatic production promotion policy.',
        },
      },
    },
  };
}

export function parseJevEvidenceReview(payload) {
  const answers = payload?.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers)
    ? payload.answers
    : {};
  const readiness = answers.promotion_readiness?.choice;
  // A Score is an ordered probability-weighted value. Normalize the four levels to 0–1 for the UI.
  const rawStrength = Number(answers.evidence_strength?.score);
  const strength = Number.isFinite(rawStrength) ? rawStrength / 3 : null;
  const humanReview = Number(answers.human_review?.noul);
  return {
    decision: ['prototype', 'needs_evidence', 'reject'].includes(readiness) ? readiness : 'needs_evidence',
    evidence_strength: Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : null,
    human_review_probability: Number.isFinite(humanReview) ? Math.min(1, Math.max(0, humanReview)) : null,
    raw: payload,
  };
}
