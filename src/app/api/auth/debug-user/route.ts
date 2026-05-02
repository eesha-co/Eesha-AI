import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// ─── POST /api/auth/debug-user ────────────────────────────────────────────────
// Diagnostic endpoint to check a user's status across Supabase Auth and Prisma DB.
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

    // ── Check Supabase Auth ────────────────────────────────────────────────
    try {
      const adminClient = createServerSupabaseClient();
      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();

      if (listError) {
        result.supabaseAuth = { error: listError.message };
      } else {
        const user = usersData?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);
        if (user) {
          result.supabaseAuth = {
            exists: true,
            id: user.id,
            email: user.email,
            emailConfirmed: !!user.email_confirmed_at,
            confirmedAt: user.email_confirmed_at,
            createdAt: user.created_at,
            hasPassword: !!user.encrypted_password || user.encrypted_password !== '',
            provider: user.app_metadata?.provider,
            metadata: user.user_metadata,
          };
        } else {
          result.supabaseAuth = { exists: false };
        }
      }
    } catch (e) {
      result.supabaseAuth = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    // ── Check Prisma DB ────────────────────────────────────────────────────
    try {
      const { db } = await import('@/lib/db');
      const dbUser = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (dbUser) {
        result.prismaDb = {
          exists: true,
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          emailVerified: dbUser.emailVerified,
          hasPasswordHash: !!dbUser.passwordHash,
          image: dbUser.image,
        };
      } else {
        result.prismaDb = { exists: false };
      }
    } catch (e) {
      result.prismaDb = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    // ── Diagnose issues ────────────────────────────────────────────────────
    const issues: string[] = [];

    if (!result.supabaseAuth?.exists && !result.prismaDb?.exists) {
      issues.push('User does not exist in Supabase Auth or Prisma DB. They need to sign up.');
    }

    if (result.supabaseAuth?.exists && !result.supabaseAuth?.emailConfirmed) {
      issues.push('Email is not verified in Supabase Auth. User needs to verify their email.');
    }

    if (result.supabaseAuth?.exists && !result.supabaseAuth?.hasPassword) {
      issues.push('User exists in Supabase Auth but has NO password set. The password needs to be set via admin.updateUserById().');
    }

    if (result.prismaDb?.exists && !result.prismaDb?.hasPasswordHash) {
      issues.push('User exists in Prisma DB but has NO passwordHash backup. If Supabase Auth password is also missing, the user needs to sign up again.');
    }

    if (result.supabaseAuth?.exists && result.prismaDb?.exists && result.supabaseAuth.id !== result.prismaDb.id) {
      issues.push('ID mismatch between Supabase Auth and Prisma DB! This will cause login issues.');
    }

    if (result.prismaDb?.exists && !result.prismaDb?.emailVerified && result.supabaseAuth?.emailConfirmed) {
      issues.push('Email verified in Supabase Auth but NOT in Prisma DB. The verify-otp route should have updated this.');
    }

    result.issues = issues;
    result.canLogin = issues.length === 0 && result.supabaseAuth?.exists && result.supabaseAuth?.emailConfirmed;

    return NextResponse.json(result);

  } catch (error) {
    console.error('[DEBUG-USER] Error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
