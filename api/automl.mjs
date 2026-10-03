import { createClient } from '@supabase/supabase-js';
import { runDeepLearningExperiment, runNumericExperiment, runReinforcementExperiment } from '../app/research/automl.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) return response.status(401).json({ error: 'Sign in to run a private experiment.' });
  if (!url || !key) return response.status(503).json({ error: 'Inference Lab is not configured.' });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: verified, error: authError } = await db.auth.getUser(token);
  if (authError || !verified.user) return response.status(401).json({ error: 'Your session could not be verified.' });
  const input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  const brainId = String(input?.brainId || '');
  const name = String(input?.name || '').trim().slice(0, 200);
  const target = String(input?.target || '').trim().slice(0, 160);
  const dataset = String(input?.dataset || '');
  const mode = ['automl', 'deep_learning', 'reinforcement_learning'].includes(input?.mode) ? input.mode : 'automl';
  if (!brainId || !name || !target || !dataset) return response.status(400).json({ error: 'A brain, experiment name, target, and dataset are required.' });
  if (dataset.length > 200000) return response.status(413).json({ error: 'Dataset must be under 200 KB for the first AutoML runner.' });
  const { data: brain } = await db.from('continuum_brains').select('id').eq('id', brainId).eq('owner_id', verified.user.id).maybeSingle();
  if (!brain) return response.status(404).json({ error: 'That brain is not in your private workspace.' });
  let report;
  try {
    if (mode === 'deep_learning') report = runDeepLearningExperiment(dataset, target);
    else if (mode === 'reinforcement_learning') {
      const [state, action, reward, nextState] = target.split(',').map((field) => field.trim());
      if (!state || !action || !reward) throw new Error('For reinforcement learning, enter CSV fields as state, action, reward[, next_state].');
      report = runReinforcementExperiment(dataset, { state, action, reward, nextState });
    } else report = runNumericExperiment(dataset, target);
  }
  catch (cause) { return response.status(422).json({ error: cause instanceof Error ? cause.message : 'Dataset could not be prepared.' }); }
  const { data: experiment, error } = await db.from('continuum_experiments').insert({ brain_id: brainId, owner_id: verified.user.id, name, target, dataset, report }).select().single();
  if (error) return response.status(500).json({ error: error.message });
  return response.status(201).json(experiment);
}
