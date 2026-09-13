import { createClient } from '@supabase/supabase-js';

const gateway = 'https://ai-gateway.vercel.sh/v4/ai/speech-model';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return response.status(401).json({ error: 'Sign in to use the neural voice.' });
  if (!url || !serviceKey || !gatewayToken)
    return response.status(503).json({ error: 'Neural voice is not configured for this deployment.' });
  const input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  const text = String(input?.text || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
  if (!text) return response.status(400).json({ error: 'There is no response to speak.' });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return response.status(401).json({ error: 'Your session could not be verified.' });
  const generated = await fetch(gateway, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gatewayToken}`,
      'ai-gateway-protocol-version': '0.0.1',
      'ai-speech-model-specification-version': '4',
      'ai-model-id': 'openai/tts-1-hd',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice: 'nova',
      outputFormat: 'mp3',
      speed: 1,
    }),
  });
  const payload = await generated.json();
  if (!generated.ok || !payload?.audio)
    return response.status(generated.status || 502).json({ error: payload?.error?.message || 'Neural voice could not respond.' });
  return response.status(200).json({ audio: payload.audio, format: 'audio/mpeg' });
}
