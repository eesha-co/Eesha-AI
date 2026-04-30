import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';

// ─── Rate limiting for sign-up attempts ──────────────────────────────────────
const signupAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_SIGNUP_ATTEMPTS = 5;       // per IP per window
const SIGNUP_WINDOW_MS = 15 * 60_000; // 15 minutes

function checkSignupRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = signupAttempts.get(ip);

  if (!entry || now > entry.resetTime) {
    signupAttempts.set(ip, { count: 1, resetTime: now + SIGNUP_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_SIGNUP_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// Secure signup flow with OTP verification code:
//
//   1. Validate input (email, password, policy agreement)
//   2. Rate limit by IP
//   3. Check if user already exists (admin API)
//   4. Create user via admin.createUser() with email_confirm: false
//      (service role — does NOT send any email, does NOT auto-confirm)
//   5. Send 6-digit OTP code via signInWithOtp() (anon key — ALWAYS sends OTP code)
//   6. Create a corresponding user record in our Prisma database (best-effort)
//   7. Return success — client will show OTP input
//
// Why this approach is secure:
//   - admin.createUser() with email_confirm:false → user is created but NOT verified
//   - signInWithOtp() → ALWAYS sends a 6-digit OTP code (never a link)
//   - User MUST enter the OTP code in our UI to verify their email
//   - No magic links that could redirect to wrong URLs
//   - OTP codes expire after a configurable time (Supabase default: 24h)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, agreedToPolicy } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'A password is required.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter.' },
        { status: 400 }
      );
    }

    if (!/[a-z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one lowercase letter.' },
        { status: 400 }
      );
    }

    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number.' },
        { status: 400 }
      );
    }

    if (!agreedToPolicy) {
      return NextResponse.json(
        { error: 'You must agree to the Eesha AI Privacy Policy and Terms of Service.' },
        { status: 400 }
      );
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const rateCheck = checkSignupRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 900) } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Step 1: Check if user already exists (admin API) ────────────────────
    let adminClient;
    try {
      adminClient = createServerSupabaseClient();
    } catch (envError) {
      console.error('[SIGNUP] Missing Supabase admin env vars:', envError);
      return NextResponse.json(
        { error: 'Server configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    const { data: existingUsers, error: lookupError } = await adminClient.auth.admin.listUsers();

    if (lookupError) {
      console.error('[SIGNUP] User lookup error:', lookupError.message);
      // Non-fatal — continue with signup attempt
    } else {
      const existingUser = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (existingUser) {
        if (existingUser.email_confirmed_at) {
          // User exists and is confirmed — tell them to log in
          return NextResponse.json(
            { error: 'An account with this email already exists. Please log in instead.' },
            { status: 409 }
          );
        }

        // User exists but email is NOT confirmed — send new OTP code
        console.log('[SIGNUP] User exists but unconfirmed, resending OTP for:', normalizedEmail);

        const signupClient = createSignupClient();
        const { error: otpError } = await signupClient.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: false, // Don't create — user already exists
            data: {
              agreed_to_policy: true,
              agreed_at: new Date().toISOString(),
            },
          },
        });

        if (otpError) {
          console.error('[SIGNUP] Resend OTP error:', otpError.message);
          return NextResponse.json(
            { error: 'Could not resend verification code. Please try again.' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'A new verification code has been sent to your email.',
          email: normalizedEmail,
          emailConfirmed: false,
          isResend: true,
        });
      }
    }

    // ── Step 2: Create user via admin API (NO email sent, NO auto-confirm) ──
    // This creates the user record in Supabase Auth without triggering any
    // email or auto-confirming. We control the verification flow ourselves.
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false, // CRITICAL: Do NOT auto-confirm
      user_metadata: {
        agreed_to_policy: true,
        agreed_at: new Date().toISOString(),
      },
    });

    if (createError) {
      console.error('[SIGNUP] Admin create user error:', createError.message);

      if (createError.message.includes('already registered') ||
          createError.message.includes('already been registered') ||
          createError.message.includes('User already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Unable to create account. Please try again.' },
        { status: 500 }
      );
    }

    if (!newUserData?.user) {
      console.error('[SIGNUP] No user returned from admin.createUser');
      return NextResponse.json(
        { error: 'Unable to create account. Please try again.' },
        { status: 500 }
      );
    }

    // ── Step 3: Send 6-digit OTP code via signInWithOtp() ───────────────────
    // signInWithOtp() ALWAYS sends a 6-digit OTP code (never a magic link).
    // Since we already created the user, we set shouldCreateUser: false.
    // The OTP is verified against the existing user in Supabase Auth.
    let signupClient;
    try {
      signupClient = createSignupClient();
    } catch (envError) {
      console.error('[SIGNUP] Missing Supabase anon env vars:', envError);
      return NextResponse.json(
        { error: 'Server configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    const { error: otpError } = await signupClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false, // User already created via admin API
        data: {
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      },
    });

    if (otpError) {
      console.error('[SIGNUP] Send OTP error:', otpError.message);
      // User was created but OTP failed — they can request a resend
      return NextResponse.json(
        { error: 'Account created but we could not send the verification code. Please try resending.' },
        { status: 500 }
      );
    }

    // ── Best-effort: Create Prisma user record ──────────────────────────────
    try {
      const { db } = await import('@/lib/db');
      const existingDbUser = await db.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!existingDbUser) {
        await db.user.create({
          data: {
            id: newUserData.user.id,
            email: normalizedEmail,
            name: normalizedEmail.split('@')[0],
            emailVerified: null,
          },
        });
      }
    } catch (dbError) {
      console.error('[SIGNUP] DB user creation failed (non-fatal):', dbError instanceof Error ? dbError.message : dbError);
    }

    // ── Success ─────────────────────────────────────────────────────────────
    console.log('[SIGNUP] Success for:', normalizedEmail, '| OTP sent');

    return NextResponse.json({
      success: true,
      message: 'Account created. A 6-digit verification code has been sent to your email.',
      email: normalizedEmail,
      emailConfirmed: false,
    });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    console.error('[SIGNUP] Stack:', error instanceof Error ? error.stack : 'N/A');

    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
