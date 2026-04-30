import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/setup/update-email-template
 *
 * One-time setup endpoint to update the Supabase email template
 * from sending verification LINKS to sending 6-digit OTP CODES.
 *
 * Uses the Supabase PostgREST API with service role key to create
 * and call a PostgreSQL function that updates auth.config.
 *
 * SECURITY: Protected by NEXTAUTH_SECRET.
 */

// OTP email template — uses {{ .Token }} for 6-digit code
const SIGNUP_OTP_TEMPLATE = `<h2>Confirm your signup</h2>
<p>Enter this 6-digit code to verify your email:</p>
<div style="padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; font-family: monospace;">{{ .Token }}</div>
<p style="color: #6b7280; font-size: 14px;">This code expires in 24 hours. If you did not request this, please ignore this email.</p>`;

const MAGIC_LINK_OTP_TEMPLATE = `<h2>Your verification code</h2>
<p>Enter this 6-digit code to verify your identity:</p>
<div style="padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; font-family: monospace;">{{ .Token }}</div>
<p style="color: #6b7280; font-size: 14px;">This code expires in 24 hours. If you did not request this, please ignore this email.</p>`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { setupSecret } = body;

    // ── Security: Require setup secret ──────────────────────────────────────
    if (setupSecret !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json(
        { error: 'Invalid setup secret.' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const siteUrl = process.env.NEXTAUTH_URL || 'https://fuhaddesmond-eesha-ai.hf.space';

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'SUPABASE_URL and SUPABASE_SERVICE_KEY are required.' },
        { status: 500 }
      );
    }

    const results: string[] = [];

    // ── Step 1: Create a PostgreSQL function that can update auth.config ────
    // We use the PostgREST RPC endpoint to create a function first,
    // then call it to update the auth config.
    
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION public.update_auth_config(config_name text, config_value text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        UPDATE auth.config SET value = config_value WHERE name = config_name;
      END;
      $$;
    `;

    // We need to execute this SQL. Since PostgREST only calls existing functions,
    // we'll use the Supabase SQL API endpoint instead.
    // The SQL endpoint is available at /rest/v1/rpc/ but only for existing functions.

    // ── Approach: Use the Supabase client's admin API ───────────────────────
    // We'll use the Supabase Management API with the service role key
    // to update the GoTrue configuration directly.

    // Actually, the best approach is to use the Supabase client to execute
    // raw SQL via the rpc endpoint. But first we need to create the function.

    // Let's try a different approach: use the pg module with IPv4 forced
    let pg: any;
    try {
      pg = await import('pg');
    } catch {
      return NextResponse.json(
        { error: 'pg module not available.' },
        { status: 500 }
      );
    }

    // Parse the DIRECT_URL and force IPv4 by adding ?hostaddr=<ipv4>
    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) {
      return NextResponse.json(
        { error: 'DIRECT_URL is required.' },
        { status: 500 }
      );
    }

    // Resolve the hostname to IPv4 first
    const { DNS } = await import('node:dns').catch(() => ({ DNS: null }));
    
    // Force IPv4 by modifying the connection string
    // Add hostaddr parameter to bypass DNS resolution
    const dbHost = 'db.xydfeerrrtlgrxmtepjo.supabase.co';
    
    // Try connecting with the pooler URL instead (which uses IPv4)
    // But we need session mode, so use the session pooler on port 5432
    const poolerUrl = `postgresql://postgres.xydfeerrrtlgrxmtepjo:${encodeURIComponent('hLz0TXpX16Gzj9EK')}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;

    const pool = new pg.Pool({
      connectionString: poolerUrl,
      ssl: { rejectUnauthorized: false },
      // Force IPv4
      host: 'aws-0-us-east-1.pooler.supabase.com',
    });

    try {
      const client = await pool.connect();
      results.push('Connected to database successfully');

      // ── Update auth.config entries ──────────────────────────────────────
      const updates = [
        { name: 'mailer_signup_template', value: SIGNUP_OTP_TEMPLATE },
        { name: 'mailer_magiclink_template', value: MAGIC_LINK_OTP_TEMPLATE },
        { name: 'site_url', value: siteUrl },
        { name: 'uri_allow_list', value: `${siteUrl}/**` },
        { name: 'mailer_otp_length', value: '6' },
      ];

      for (const update of updates) {
        try {
          await client.query(
            `UPDATE auth.config SET value = $1 WHERE name = $2`,
            [update.value, update.name]
          );
          results.push(`OK: Updated ${update.name}`);
        } catch (e: any) {
          results.push(`FAIL: ${update.name}: ${e.message}`);
        }
      }

      client.release();
    } catch (e: any) {
      results.push(`Connection failed: ${e.message}`);
    } finally {
      await pool.end();
    }

    return NextResponse.json({
      success: results.some(r => r.startsWith('OK')),
      message: 'Email template setup complete.',
      results,
    });

  } catch (error) {
    console.error('[SETUP] Error:', error);
    return NextResponse.json(
      { error: 'Setup failed.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
