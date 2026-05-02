import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';

// ─── POST /api/auth/diagnose ─────────────────────────────────────────────────
// Diagnostic endpoint to debug login issues.
// Tests Supabase Auth connection and returns detailed error info.
// This should be removed or secured in production.

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
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    };

    // ── Step 2: Check user in Supabase Auth (admin API) ──────────────────
    try {
      const adminClient = createServerSupabaseClient();
      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();

      if (listError) {
        results.adminApi = { error: listError.message };
      } else {
        const user = usersData?.users?.find((u: any) => u.email?.toLowerCase() === normalizedEmail);
        if (user) {
          results.supabaseUser = {
            found: true,
            id: user.id,
            email: user.email,
            emailConfirmed: !!user.email_confirmed_at,
            emailConfirmedAt: user.email_confirmed_at || null,
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at || null,
            hasPassword: !!(user as any).encrypted_password && (user as any).encrypted_password !== '',
            provider: user.app_metadata?.provider || 'unknown',
            providers: user.app_metadata?.providers || [],
          };
        } else {
          results.supabaseUser = { found: false };
        }
      }
    } catch (err: any) {
      results.adminApi = { error: err?.message || String(err) };
    }

    // ── Step 3: Test signInWithPassword (if password provided) ───────────
    if (password) {
      try {
        const signupClient = createSignupClient();
        const { data, error } = await signupClient.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          results.signInTest = {
            success: false,
            error: error.message,
            code: error.code || null,
            status: error.status || null,
          };
        } else {
          results.signInTest = {
            success: true,
            userId: data.user?.id,
            emailConfirmed: !!data.user?.email_confirmed_at,
          };
        }
      } catch (err: any) {
        results.signInTest = {
          success: false,
          error: err?.message || String(err),
        };
      }
    }

    // ── Step 4: Test direct REST API call ────────────────────────────────
    // This bypasses the Supabase JS client to test the raw API
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && password) {
      try {
        const restResponse = await fetch(
          `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ email: normalizedEmail, password }),
          }
        );

        const restData = await restResponse.json();
        results.restApiTest = {
          status: restResponse.status,
          success: restResponse.status === 200,
          error: restData.error_description || restData.msg || null,
          code: restData.code || null,
        };
      } catch (err: any) {
        results.restApiTest = { error: err?.message || String(err) };
      }
    }

    return NextResponse.json(results);

  } catch (error: any) {
    return NextResponse.json({
      error: 'Diagnosis failed',
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
