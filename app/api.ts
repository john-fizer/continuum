import { cloudClient, cloudEnabled } from './cloud/client';

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (cloudEnabled) {
    const client = cloudClient();
    const {
      data: { session },
      error: authError,
    } = await client.auth.getSession();
    if (authError) throw new Error(authError.message);
    if (!session) {
      if (path === 'brains' && body === undefined) return [] as T;
      window.dispatchEvent(new Event('continuum-sign-in'));
      throw new Error('Sign in first to save and open your private brains.');
    }
    const snapshot = body === undefined && /^brains\/[^/]+$/.test(path);
    const { data, error } = await client.rpc(
      snapshot ? 'continuum_research_snapshot' : 'continuum_api',
      snapshot
        ? { p_brain: path.split('/')[1] }
        : { p_path: path, p_body: body ?? null },
    );
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42P01')
        throw new Error(
          'Cloud tables need their one-time setup. Open Cloud setup at the top of the page.',
        );
      throw new Error(
        error.message ||
          'Cloud memory is unavailable. Your import preview is still on this device.',
      );
    }
    if (
      data &&
      typeof data === 'object' &&
      'source_id' in data &&
      typeof (data as { source_id: unknown }).source_id === 'string' &&
      /\/(imports|sources)$/.test(path)
    ) {
      const { error: queueError } = await client.rpc('continuum_enqueue_research', {
        p_brain: path.split('/')[1],
        p_source: (data as { source_id: string }).source_id,
      });
      if (queueError) throw new Error(queueError.message);
      // A signed-in user may wake only their own queued research. The daily cron
      // still catches anything left waiting after the browser closes.
      void fetch('/api/worker', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => undefined);
    }
    // Opening a private brain can wake only the signed-in user's queued work.
    // This lets an imported backlog resume promptly without exposing the cron secret.
    if (
      snapshot &&
      data &&
      typeof data === 'object' &&
      'pending' in data &&
      Number((data as { pending?: unknown }).pending || 0) > 0
    ) {
      void fetch('/api/worker', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => undefined);
    }
    return data as T;
  }
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      'The local brain service is unavailable. Start the backend and try again.',
    );
  }
  if (!response.ok)
    throw new Error(
      data && typeof data === 'object' && 'error' in data
        ? String(data.error)
        : 'The brain service is unavailable.',
    );
  return data as T;
}
