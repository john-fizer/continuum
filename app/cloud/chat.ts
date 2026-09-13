import { cloudClient } from './client';

export type CloudAnswer = {
  answer: string;
  citations: { source_id: string; title: string; excerpt: string }[];
  mode: 'synthesis';
};

export async function askCloud(brainId: string, question: string): Promise<CloudAnswer> {
  const { data, error } = await cloudClient().auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Sign in to speak with your private brain.');
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ brainId, question }),
  });
  const result = (await response.json()) as CloudAnswer & { error?: string };
  if (!response.ok)
    throw new Error(result.error || 'Continuum could not complete that thought.');
  return result as CloudAnswer;
}
