import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// ─── POST /api/auth/check-status ────────────────────────────────────────────
// Checks whether an email is registered and verified in Supabase Auth.
// Used by the login page to give specific error messages after a failed login.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    let adminClient;
    try {
      adminClient = createServerSupabaseClient();
    } catch {
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // Look up the user in Supabase Auth
    let page = 1;
    let user: any = null;

    while (!user) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 50 });
      if (error) {
        console.error('[CHECK-STATUS] listUsers error:', error.message);
        return NextResponse.json({ error: 'Could not check account status.' }, { status: 500 });
      }

      user = data?.users?.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

      if (!user && (data?.users?.length ?? 0) >= 50) {
        page++;
      } else {
        break;
      }
    }

    if (!user) {
      return NextResponse.json({
        exists: false,
        verified: false,
        status: 'not_found',
        message: 'No account found with this email.',
      });
    }

    if (user.email_confirmed_at) {
      return NextResponse.json({
        exists: true,
        verified: true,
        status: 'verified',
        message: 'Account is verified. Please check your password.',
      });
    }

    return NextResponse.json({
      exists: true,
      verified: false,
      status: 'unverified',
      message: 'Your email has not been verified yet. Please check your email for a verification code.',
    });

  } catch (error) {
    console.error('[CHECK-STATUS] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
