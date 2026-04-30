import { createClient } from '@supabase/supabase-js';

/**
 * Supabase browser-side client (anon key — limited privileges).
 * Safe to use in client-side code. Enforced by Row Level Security.
 *
 * Used for:
 * - OTP verification on the client
 * - Session refresh
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables');
  }

  return createClient(url, anonKey);
}
