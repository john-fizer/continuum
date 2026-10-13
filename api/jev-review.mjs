import { createClient } from '@supabase/supabase-js';
import { buildJevEvidenceReview, parseJevEvidenceReview } from '../app/research/jev.mjs';

const endpoint = 'https://api.typesafe.ai/v1/systemone';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const jevKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
  if (!token) return response.status(401).json({ error: 'Sign in to review a private beta candidate.' });
  if (!url || !serviceKey) return response.status(503).json({ error: 'Private cloud memory is not configured.' });
  if (!jevKey) return response.status(503).json({ error: 'JEV evidence review is not configured for this beta deployment.' });

  const input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  const brainId = String(input?.brainId || '');
  if (!brainId) return response.status(400).json({ error: 'Choose a private brain before requesting an evidence review.' });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: verified, error: authError } = await db.auth.getUser(token);
  if (authError || !verified.user) return response.status(401).json({ error: 'Your session could not be verified.' });
  const { data: brain } = await db.from('continuum_brains').select('id').eq('id', brainId).eq('owner_id', verified.user.id).maybeSingle();
  if (!brain) return response.status(404).json({ error: 'That brain is not in your private workspace.' });

  let payload;
  try {
    payload = buildJevEvidenceReview(input?.candidate);
  } catch (cause) {
    return response.status(400).json({ error: cause instanceof Error ? cause.message : 'The proposed capability is incomplete.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jevKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await result.json().catch(() => ({}));
    if (!result.ok) {
      const message = String(body?.error?.message || body?.message || 'JEV evidence review is unavailable.').slice(0, 300);
      return response.status(result.status === 429 ? 429 : 502).json({ error: message });
    }
    return response.status(200).json(parseJevEvidenceReview(body));
  } catch (cause) {
    return response.status(504).json({ error: cause?.name === 'AbortError' ? 'JEV evidence review timed out.' : 'JEV evidence review could not be reached.' });
  } finally {
    clearTimeout(timeout);
  }
}
