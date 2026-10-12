import { cloudClient } from './client';

export type JevReview = {
  decision: 'prototype' | 'needs_evidence' | 'reject';
  evidence_strength: number | null;
  human_review_probability: number | null;
};

export async function reviewBetaCandidate(brainId: string, candidate: unknown): Promise<JevReview> {
  const { data, error } = await cloudClient().auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Sign in to review a private beta candidate.');
  const response = await fetch('/api/jev-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ brainId, candidate }),
  });
  const result = await response.json() as JevReview & { error?: string };
  if (!response.ok) throw new Error(result.error || 'JEV evidence review could not run.');
  return result;
}
