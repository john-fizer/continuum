import { cloudClient } from './client';

export async function speakCloud(text: string): Promise<{ audio: string; format: string }> {
  const { data, error } = await cloudClient().auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Sign in to use the neural voice.');
  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ text }),
  });
  const result = (await response.json()) as { audio?: string; format?: string; error?: string };
  if (!response.ok || !result.audio) throw new Error(result.error || 'Neural voice could not respond.');
  return { audio: result.audio, format: result.format || 'audio/mpeg' };
}
