import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Only the standalone hosted build opts in. The local Python workspace stays local.
export const cloudEnabled = import.meta.env.VITE_CLOUD_MEMORY === 'true';
let client: SupabaseClient | undefined;
export function cloudClient() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      throw new Error(
        'Cloud connection settings are missing from this deployment.',
      );
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
