import { cloudClient } from './client';

export async function runCloudExperiment(brainId: string, name: string, target: string, dataset: string) {
  const { data, error } = await cloudClient().auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Sign in to run a private experiment.');
  const response = await fetch('/api/automl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ brainId, name, target, dataset }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result?.error || 'Inference Lab could not run that experiment.');
  return result;
}
