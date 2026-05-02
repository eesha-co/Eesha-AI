import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

// ─── POST /api/auth/diagnose ─────────────────────────────────────────────────
// Diagnostic endpoint to debug login issues.
// Checks the `users` table directly and tests bcrypt comparison.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required for diagnosis.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const results: Record<string, any> = {
      email: normalizedEmail,
      timestamp: new Date().toISOString(),
    };

    // ── Step 1: Check environment variables ──────────────────────────────
    results.env = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    };

    // ── Step 2: Look up user in our `users` table ───────────────────────
    try {
      const { db } = await import('@/lib/db');
      const user = await db.user.findUnique({ where: { email: normalizedEmail } });

      if (user) {
        results.userTable = {
          found: true,
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: !!user.emailVerified,
          emailVerifiedAt: user.emailVerified?.toISOString() || null,
          hasPasswordHash: !!user.passwordHash,
          passwordHashLength: user.passwordHash?.length || 0,
          passwordHashPrefix: user.passwordHash?.substring(0, 7) || null, // Shows $2a$12$ (bcrypt)
          createdAt: user.createdAt?.toISOString(),
        };

        // ── Step 3: Test bcrypt comparison (if password provided) ────────
        if (password && user.passwordHash) {
          const matches = await bcrypt.compare(password, user.passwordHash);
          results.bcryptTest = {
            passwordProvided: true,
            hashExists: true,
            passwordMatches: matches,
          };
        } else if (password && !user.passwordHash) {
          results.bcryptTest = {
            passwordProvided: true,
            hashExists: false,
            passwordMatches: false,
            issue: 'No password hash stored in users table',
          };
        }
      } else {
        results.userTable = { found: false };
      }
    } catch (dbErr: any) {
      results.userTable = { error: dbErr?.message || String(dbErr) };
    }

    return NextResponse.json(results);

  } catch (error: any) {
    return NextResponse.json({
      error: 'Diagnosis failed',
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
