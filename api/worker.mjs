import { createClient } from '@supabase/supabase-js';
import { analyzeSource, conceptCandidates } from '../app/research/worker.mjs';

const note = 'Shared terminology is measured evidence of textual overlap, not proof of a causal or conceptual relationship. Check the original passages and alternative explanations.';

async function indexSemanticMemory(db, job, source) {
  const candidates = conceptCandidates(source, 12);
  const concepts = [];
  for (const candidate of candidates) {
    const { data: existing, error: lookupError } = await db
      .from('continuum_concepts')
      .select('id,mention_count,activation_strength')
      .eq('brain_id', job.brain_id)
      .eq('normalized_label', candidate.label)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const payload = existing
      ? {
          mention_count: existing.mention_count + candidate.mentions,
          activation_strength: Math.min(1, existing.activation_strength + 0.08),
          updated: Date.now() / 1000,
        }
      : {
          brain_id: job.brain_id,
          owner_id: job.owner_id,
          label: candidate.label,
          normalized_label: candidate.label,
          mention_count: candidate.mentions,
          activation_strength: Math.min(0.5, candidate.mentions / 10),
        };
    const query = existing
      ? db.from('continuum_concepts').update(payload).eq('id', existing.id)
      : db.from('continuum_concepts').insert(payload);
    const { data: concept, error: conceptError } = await query.select('id').single();
    if (conceptError) throw conceptError;
    concepts.push({ ...candidate, id: concept.id });
    const { error: evidenceError } = await db.from('continuum_concept_evidence').upsert({
      brain_id: job.brain_id,
      owner_id: job.owner_id,
      concept_id: concept.id,
      source_id: source.id,
      mentions: candidate.mentions,
      excerpt: candidate.excerpt,
    }, { onConflict: 'concept_id,source_id' });
    if (evidenceError) throw evidenceError;
  }
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const [concept_a, concept_b] = [concepts[i].id, concepts[j].id].sort();
      const { data: existing, error: lookupError } = await db
        .from('continuum_relationships')
        .select('id,source_count,confidence,activation_strength')
        .eq('brain_id', job.brain_id)
        .eq('concept_a', concept_a)
        .eq('concept_b', concept_b)
        .eq('relationship_type', 'co_occurs')
        .maybeSingle();
      if (lookupError) throw lookupError;
      const now = Date.now() / 1000;
      const confidence = Math.min(.82, .12 + (concepts[i].mentions + concepts[j].mentions) / 24);
      const relation = existing
        ? {
            source_count: existing.source_count + 1,
            confidence: Math.max(existing.confidence, confidence),
            activation_strength: Math.min(1, existing.activation_strength + .06),
            recency: now,
            updated: now,
          }
        : {
            brain_id: job.brain_id,
            owner_id: job.owner_id,
            concept_a,
            concept_b,
            relationship_type: 'co_occurs',
            confidence,
            source_count: 1,
            activation_strength: .12,
            recency: now,
          };
      const relationQuery = existing
        ? db.from('continuum_relationships').update(relation).eq('id', existing.id)
        : db.from('continuum_relationships').insert(relation);
      const { error: relationError } = await relationQuery;
      if (relationError) throw relationError;
    }
  }
  return concepts.length;
}

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
        db.from('continuum_sources').select('id,title,body').eq('id', job.source_id).single(),
        db.from('continuum_sources').select('id,title,body').eq('brain_id', job.brain_id),
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
      let indexed = 0;
      let semanticStatus = '';
      try {
        indexed = await indexSemanticMemory(db, job, source);
        semanticStatus = ` Indexed ${indexed} evidence-backed concept candidate${indexed === 1 ? '' : 's'}.`;
      } catch (semanticError) {
        const message = semanticError instanceof Error
          ? semanticError.message
          : semanticError && typeof semanticError === 'object' && 'message' in semanticError
            ? String(semanticError.message)
            : String(semanticError || '');
        if (!/continuum_(concepts|concept_evidence|relationships).*does not exist|relation .*continuum_/i.test(message)) throw semanticError;
        semanticStatus = ' Semantic memory is awaiting its database migration.';
      }
      const result = `${analysis.summary}${semanticStatus}`;
      const { error: finishError } = await db.from('continuum_jobs').update({ status: 'completed', result, finished: Date.now() / 1000 }).eq('id', job.id);
      if (finishError) throw finishError;
      completed++;
    } catch (cause) {
      await db.from('continuum_jobs').update({ status: 'failed', result: cause instanceof Error ? cause.message.slice(0, 1000) : 'Worker failed.', finished: Date.now() / 1000 }).eq('id', job.id);
    }
  }
  return response.status(200).json({ completed, queued: Math.max(0, (jobs || []).length - completed) });
}
