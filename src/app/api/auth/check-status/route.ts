import { NextRequest, NextResponse } from 'next/server';

// ─── POST /api/auth/check-status ────────────────────────────────────────────
// Checks whether an email is registered and verified in our `users` table.
// Used by the login page to give specific error messages after a failed login.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { db } = await import('@/lib/db');
    const user = await db.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return NextResponse.json({
        exists: false,
        verified: false,
        status: 'not_found',
        message: 'No account found with this email.',
      });
    }

    if (user.emailVerified) {
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
