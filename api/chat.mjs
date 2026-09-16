import { createClient } from '@supabase/supabase-js';
import { cosineSimilarity } from '../app/research/chunks.mjs';

// Conversation needs a responsive first word. The heavier model remains an
// opt-in environment override, while the default is the gateway's fast model.
const model = process.env.CONTINUUM_MODEL || 'zai/glm-4.7-flash';
const gateway = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const embeddingGateway = 'https://ai-gateway.vercel.sh/v1/embeddings';
const embeddingModel = process.env.CONTINUUM_EMBEDDING_MODEL || 'alibaba/qwen3-embedding-0.6b';

function compact(text, size = 2200) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, size);
}

function visibleAnswer(value) {
  const text = String(value || '').trim();
  // Some reasoning models return an internal draft wrapped in <think> tags.
  // Continuum never presents that draft as a user-facing answer.
  const withoutThought = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  return withoutThought || '';
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

async function embedQuestion(question, token) {
  if (!token) return null;
  try {
    const response = await fetch(embeddingGateway, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModel, input: question }),
    });
    const payload = await response.json();
    return response.ok && Array.isArray(payload?.data?.[0]?.embedding)
      ? payload.data[0].embedding
      : null;
  } catch {
    return null;
  }
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
  const history = Array.isArray(input?.history)
    ? input.history
      .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
      .slice(-8)
      .map((turn) => ({ role: turn.role, content: compact(turn.content, 900) }))
    : [];
  if (!brainId || !question) return response.status(400).json({ error: 'A brain and question are required.' });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await db.auth.getUser(token);
  if (verifyError || !verified.user) return response.status(401).json({ error: 'Your session could not be verified.' });
  const { data: brain } = await db.from('continuum_brains').select('id,name,direction').eq('id', brainId).eq('owner_id', verified.user.id).maybeSingle();
  if (!brain) return response.status(404).json({ error: 'That brain is not in your private workspace.' });
  const retrievalText = [
    ...history.filter((turn) => turn.role === 'user').slice(-2).map((turn) => turn.content),
    question,
  ].join('\n');
  const queryVector = await embedQuestion(retrievalText, gatewayToken);
  let citations = [];
  if (queryVector) {
    const { data: passages } = await db
      .from('continuum_passages')
      .select('source_id,body,char_start,char_end,embedding')
      .eq('brain_id', brainId)
      .eq('owner_id', verified.user.id)
      .not('embedding', 'is', null)
      .limit(240);
    const ranked = (passages || [])
      .map((passage) => ({ ...passage, score: cosineSimilarity(queryVector, passage.embedding) }))
      .filter((passage) => passage.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (ranked.length) {
      const ids = [...new Set(ranked.map((passage) => passage.source_id))];
      const { data: sourceRows } = await db
        .from('continuum_sources')
        .select('id,title')
        .eq('brain_id', brainId)
        .eq('owner_id', verified.user.id)
        .in('id', ids);
      const titles = new Map((sourceRows || []).map((source) => [source.id, source.title]));
      citations = ranked.map((passage) => ({
        source_id: passage.source_id,
        title: titles.get(passage.source_id) || 'Saved source',
        excerpt: compact(passage.body, 700),
        passage: { start: passage.char_start, end: passage.char_end, score: Math.round(passage.score * 1000) / 1000 },
      }));
    }
  }
  if (!citations.length) {
    const words = question.match(/[a-zA-Z][a-zA-Z0-9'-]{2,}/g) || [];
    let query = db.from('continuum_sources').select('id,title,body').eq('brain_id', brainId).eq('owner_id', verified.user.id).limit(8);
    if (words.length) query = query.or(words.slice(0, 6).map((word) => `body.ilike.%${word}%,title.ilike.%${word}%`).join(','));
    let { data: sources } = await query;
    if (!sources?.length) ({ data: sources } = await db.from('continuum_sources').select('id,title,body').eq('brain_id', brainId).eq('owner_id', verified.user.id).limit(6));
    citations = (sources || []).map((source) => ({ source_id: source.id, title: source.title, excerpt: compact(source.body, 700) }));
  }
  if (!citations.length) return response.status(200).json({ answer: 'I do not have any saved sources in this brain yet. Add a note, conversation, or document, then ask again.', citations, mode: 'extractive' });
  if (!gatewayToken)
    return response.status(200).json(extractiveAnswer(question, citations, 'the synthesis model is not configured'));
  const dialogue = history.length
    ? history.map((turn) => `${turn.role === 'user' ? 'Person' : 'Continuum'}: ${turn.content}`).join('\n')
    : '(This is the first turn.)';
  const prompt = `You are Continuum, a fast, grounded thinking partner inside a private second brain. The person may ask a question, direct an investigation, ask what to look for, or talk through a possible connection. Keep the dialogue coherent: treat the latest message as a follow-up when it refers to prior turns.\n\nUse only the supplied private excerpts for factual claims. Separate evidence from hypotheses. A connection is a possible pattern, never proof of causation. Cite source titles in square brackets when you use them.\n\nRespond in this compact shape:\n1. Direct response (2-5 sentences).\n2. "Connection to explore" — the strongest plausible bridge, or say what information is missing.\n3. "What I would look for next" — 2-4 concrete signals, tensions, or source types.\n\nBrain direction: ${brain.direction || 'not set'}\nConversation so far:\n${dialogue}\n\nLatest message: ${question}\n\nPrivate excerpts:\n${citations.map((s, i) => `[${i +1}] ${s.title}\n${s.excerpt}`).join('\n\n')}`;
  let generated;
  let payload;
  for (const candidate of [...new Set([model, 'zai/glm-4.7-flash'])]) {
    generated = await fetch(gateway, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gatewayToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: candidate, messages: [{ role: 'user', content: prompt }], temperature: 0.35, max_tokens: 650, chat_template_kwargs: { enable_thinking: false } }),
    });
    payload = await generated.json();
    if (generated.ok || generated.status !== 429) break;
  }
  if (!generated.ok) {
    console.warn('Continuum synthesis fallback', generated.status, String(payload?.error?.message || payload?.error || 'unknown gateway error').slice(0, 240));
    return response.status(200).json(
      extractiveAnswer(question, citations, 'generative synthesis is temporarily unavailable'),
    );
  }
  const answer = visibleAnswer(payload?.choices?.[0]?.message?.content);
  return response.status(200).json(answer
    ? { answer, citations, mode: 'synthesis' }
    : extractiveAnswer(question, citations, 'the synthesis model returned no visible answer'));
}
