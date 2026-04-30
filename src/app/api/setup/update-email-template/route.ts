import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/setup/update-email-template
 *
 * One-time setup endpoint to update the Supabase email template
 * from sending verification LINKS to sending 6-digit OTP CODES.
 *
 * This uses a DIRECT PostgreSQL connection (not the pooler) because
 * auth.config requires a session-level connection.
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

interface QueryResult {
  success: boolean;
  message: string;
}

async function executeAuthConfigUpdate(
  directUrl: string,
  name: string,
  value: string
): Promise<QueryResult> {
  // Dynamic import of pg since it might not be available
  let pg: any;
  try {
    pg = await import('pg');
  } catch {
    return { success: false, message: 'pg module not available' };
  }

  const pool = new pg.Pool({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(
      `UPDATE auth.config SET value = $1 WHERE name = $2`,
      [value, name]
    );
    return { success: true, message: `Updated ${name}` };
  } catch (e: any) {
    return { success: false, message: `${name}: ${e.message}` };
  } finally {
    await pool.end();
  }
}

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

    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) {
      return NextResponse.json(
        { error: 'DIRECT_URL environment variable is required.' },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXTAUTH_URL || 'https://fuhaddesmond-eesha-ai.hf.space';
    const results: string[] = [];

    // ── Update all email templates and auth config ──────────────────────────
    const updates = [
      { name: 'mailer_signup_template', value: SIGNUP_OTP_TEMPLATE },
      { name: 'mailer_magiclink_template', value: MAGIC_LINK_OTP_TEMPLATE },
      { name: 'site_url', value: siteUrl },
      { name: 'uri_allow_list', value: `${siteUrl}/**` },
      { name: 'mailer_otp_length', value: '6' },
    ];

    for (const update of updates) {
      const result = await executeAuthConfigUpdate(directUrl, update.name, update.value);
      results.push(result.success ? `OK: ${result.message}` : `FAIL: ${result.message}`);
    }

    return NextResponse.json({
      success: true,
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
