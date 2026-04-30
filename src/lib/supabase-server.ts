import { createClient } from '@supabase/supabase-js';

/**
 * Supabase server-side client (service role key — admin privileges).
 * Use ONLY in server-side API routes. NEVER expose to the browser.
 *
 * This client bypasses Row Level Security and is used for:
 * - Creating users (sign-up)
 * - Sending / verifying OTP codes
 * - Looking up user records securely
 */
export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
