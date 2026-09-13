import { createClient } from '@supabase/supabase-js';

const model = process.env.CONTINUUM_MODEL || 'alibaba/qwen-3-14b';
const gateway = 'https://ai-gateway.vercel.sh/v1/chat/completions';

function compact(text, size = 2200) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, size);
}

function extractiveAnswer(question, citations, reason) {
  const terms = new Set(
    (question.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []).filter(
      (word) => word.length > 3,
    ),
  );
  const excerpts = citations.slice(0, 4).map((citation) => {
    const sentence = citation.excerpt
      .split(/(?<=[.!?])\s+/)
      .find((part) => [...terms].some((term) => part.toLowerCase().includes(term))) || citation.excerpt;
    return `[${citation.title}] ${compact(sentence, 320)}`;
  });
  return {
    answer: `Evidence mode is active${reason ? ` because ${reason}` : ''}. I found ${citations.length} saved ${citations.length === 1 ? 'source' : 'sources'} relevant to your question. ${excerpts.join('\n\n')}`,
    citations,
    mode: 'extractive',
  };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Sign in to speak with your private brain.' });
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!url || !serviceKey) return response.status(503).json({ error: 'Private brain service is not configured.' });
  const input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  const brainId = String(input?.brainId || '');
  const question = compact(input?.question, 2000);
  if (!brainId || !question) return response.status(400).json({ error: 'A brain and question are required.' });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await db.auth.getUser(token);
  if (verifyError || !verified.user) return response.status(401).json({ error: 'Your session could not be verified.' });
  const { data: brain } = await db.from('continuum_brains').select('id,name,direction').eq('id', brainId).eq('owner_id', verified.user.id).maybeSingle();
  if (!brain) return response.status(404).json({ error: 'That brain is not in your private workspace.' });
  const words = question.match(/[a-zA-Z][a-zA-Z0-9'-]{2,}/g) || [];
  let query = db.from('continuum_sources').select('id,title,body').eq('brain_id', brainId).eq('owner_id', verified.user.id).limit(8);
  if (words.length) query = query.or(words.slice(0, 6).map((word) => `body.ilike.%${word}%,title.ilike.%${word}%`).join(','));
  let { data: sources } = await query;
  if (!sources?.length) ({ data: sources } = await db.from('continuum_sources').select('id,title,body').eq('brain_id', brainId).eq('owner_id', verified.user.id).limit(6));
  const citations = (sources || []).map((source) => ({ source_id: source.id, title: source.title, excerpt: compact(source.body, 700) }));
  if (!citations.length) return response.status(200).json({ answer: 'I do not have any saved sources in this brain yet. Add a note, conversation, or document, then ask again.', citations, mode: 'extractive' });
  if (!gatewayToken)
    return response.status(200).json(extractiveAnswer(question, citations, 'the synthesis model is not configured'));
  const prompt = `You are Continuum, a research-minded second brain. Answer only from the supplied private source excerpts. Separate observations from hypotheses. Name uncertainty and alternative explanations. Never claim that a connection proves causation. Cite source titles in square brackets when you use them.\n\nBrain direction: ${brain.direction || 'not set'}\nQuestion: ${question}\n\nSources:\n${citations.map((s, i) => `[${i + 1}] ${s.title}\n${s.excerpt}`).join('\n\n')}`;
  const generated = await fetch(gateway, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gatewayToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.35, max_tokens: 900 }),
  });
  const payload = await generated.json();
  if (!generated.ok)
    return response.status(200).json(
      extractiveAnswer(question, citations, 'generative synthesis is temporarily unavailable'),
    );
  return response.status(200).json({ answer: payload?.choices?.[0]?.message?.content || 'The model returned no answer.', citations, mode: 'synthesis' });
}
