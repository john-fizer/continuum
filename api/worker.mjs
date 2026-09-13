import { createClient } from '@supabase/supabase-js';
import { analyzeSource } from '../app/research/worker.mjs';

const note = 'Shared terminology is measured evidence of textual overlap, not proof of a causal or conceptual relationship. Check the original passages and alternative explanations.';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return response.status(503).json({ error: 'Research worker credentials are not configured.' });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const authorizedCron = request.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  let ownerId;
  if (!authorizedCron) {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const { data, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: true };
    if (authError || !data?.user) return response.status(401).json({ error: 'Unauthorized worker invocation.' });
    ownerId = data.user.id;
  }
  let jobsQuery = db.from('continuum_jobs').select('*').eq('status', 'queued');
  if (ownerId) jobsQuery = jobsQuery.eq('owner_id', ownerId);
  const { data: jobs, error } = await jobsQuery.order('created').limit(12);
  if (error) return response.status(500).json({ error: error.message });
  let completed = 0;
  for (const job of jobs || []) {
    const { data: claimed } = await db.from('continuum_jobs').update({ status: 'running' }).eq('id', job.id).eq('status', 'queued').select().maybeSingle();
    if (!claimed) continue;
    try {
      const [{ data: source }, { data: sources }] = await Promise.all([
        db.from('continuum_sources').select('id,body').eq('id', job.source_id).single(),
        db.from('continuum_sources').select('id,body').eq('brain_id', job.brain_id),
      ]);
      if (!source) throw new Error('Source was removed before analysis.');
      const analysis = analyzeSource(source, sources || []);
      for (const link of analysis.links) {
        const a = (sources || []).find((s) => s.id === link.source_a);
        const b = (sources || []).find((s) => s.id === link.source_b);
        const termsA = new Set(String(a?.body || '').toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []);
        const termsB = new Set(String(b?.body || '').toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []);
        const similarity = link.terms.length / Math.max(1, new Set([...termsA, ...termsB]).size);
        const { error: linkError } = await db.from('continuum_links').upsert({ brain_id: job.brain_id, owner_id: job.owner_id, source_a: link.source_a, source_b: link.source_b, terms: link.terms, similarity, note }, { onConflict: 'brain_id,source_a,source_b', ignoreDuplicates: true });
        if (linkError) throw linkError;
      }
      const { error: finishError } = await db.from('continuum_jobs').update({ status: 'completed', result: analysis.summary, finished: Date.now() / 1000 }).eq('id', job.id);
      if (finishError) throw finishError;
      completed++;
    } catch (cause) {
      await db.from('continuum_jobs').update({ status: 'failed', result: cause instanceof Error ? cause.message.slice(0, 1000) : 'Worker failed.', finished: Date.now() / 1000 }).eq('id', job.id);
    }
  }
  return response.status(200).json({ completed, queued: Math.max(0, (jobs || []).length - completed) });
}
