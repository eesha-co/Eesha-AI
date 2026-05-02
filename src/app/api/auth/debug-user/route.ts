import { NextRequest, NextResponse } from 'next/server';

// ─── POST /api/auth/debug-user ────────────────────────────────────────────────
// Diagnostic endpoint to check a user's status in our `users` table.
// Helps diagnose login failures.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const result: any = { email: normalizedEmail };

    // ── Check our `users` table ─────────────────────────────────────────
    try {
      const { db } = await import('@/lib/db');
      const dbUser = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (dbUser) {
        result.usersTable = {
          exists: true,
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          emailVerified: !!dbUser.emailVerified,
          emailVerifiedAt: dbUser.emailVerified?.toISOString() || null,
          hasPasswordHash: !!dbUser.passwordHash,
          passwordHashPrefix: dbUser.passwordHash?.substring(0, 7) || null,
          image: dbUser.image,
          createdAt: dbUser.createdAt?.toISOString(),
        };
      } else {
        result.usersTable = { exists: false };
      }
    } catch (e) {
      result.usersTable = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    // ── Diagnose issues ──────────────────────────────────────────────────
    const issues: string[] = [];

    if (!result.usersTable?.exists) {
      issues.push('User does not exist in the users table. They need to sign up.');
    }

    if (result.usersTable?.exists && !result.usersTable?.emailVerified) {
      issues.push('Email is not verified. User needs to enter the OTP code sent to their email.');
    }

    if (result.usersTable?.exists && !result.usersTable?.hasPasswordHash) {
      issues.push('User exists but has NO password hash. This is unusual — they may need to sign up again.');
    }

    result.issues = issues;
    result.canLogin = issues.length === 0 && result.usersTable?.exists && result.usersTable?.emailVerified && result.usersTable?.hasPasswordHash;

    return NextResponse.json(result);

  } catch (error) {
    console.error('[DEBUG-USER] Error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
