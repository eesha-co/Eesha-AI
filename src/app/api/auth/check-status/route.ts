import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── POST /api/auth/check-status ────────────────────────────────────────────
// Checks whether an email is registered in our `users` table.
// Used by the login page to give specific error messages after a failed login.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return NextResponse.json({
        exists: false,
        status: 'not_found',
        message: 'No account found with this email.',
      });
    }

    return NextResponse.json({
      exists: true,
      status: 'found',
      message: 'Account found. Please check your password.',
    });

  } catch (error) {
    console.error('[CHECK-STATUS] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
