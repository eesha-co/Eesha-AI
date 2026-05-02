import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient } from '@/lib/supabase-server';

// ─── Rate limiting for OTP verification attempts ──────────────────────────────
const otpAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_OTP_ATTEMPTS = 10;
const OTP_WINDOW_MS = 15 * 60_000;

function checkOtpRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = otpAttempts.get(identifier);

  if (!entry || now > entry.resetTime) {
    otpAttempts.set(identifier, { count: 1, resetTime: now + OTP_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_OTP_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
//
// Verify the OTP code that was sent to the user's email via Supabase Auth.
//
// Flow:
//   1. Call Supabase verifyOtp() to validate the code (email delivery check)
//   2. If valid → mark email as verified in our `users` table
//   3. Done — the user can now log in
//
// We do NOT call admin.updateUserById() — that wipes passwords (supabase/auth#1578).
// We do NOT touch the password in our `users` table — it was set during signup.
// Supabase Auth is ONLY used for OTP validation (email delivery verification).

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    if (!otp || typeof otp !== 'string') {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'Verification code must be exactly 6 digits.' }, { status: 400 });
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const normalizedEmail = email.toLowerCase().trim();
    const rateCheck = checkOtpRateLimit(normalizedEmail);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please request a new code.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 900) } }
      );
    }

    // ── Get Supabase client (for OTP validation only) ──────────────────────
    let anonClient;
    try {
      anonClient = createSignupClient();
    } catch (envError) {
      console.error('[VERIFY-OTP] Missing Supabase env vars:', envError);
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // ── Verify OTP via Supabase Auth (email delivery verification) ─────────
    // Try type 'email' first (current recommended), then 'signup' (deprecated fallback)
    console.log('[VERIFY-OTP] Attempting type=email for:', normalizedEmail);
    let lastError: any = null;
    let otpVerified = false;

    const emailResult = await anonClient.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: 'email',
    });

    if (!emailResult.error) {
      otpVerified = true;
      console.log('[VERIFY-OTP] Success with type=email');
    } else {
      console.log('[VERIFY-OTP] type=email failed:', emailResult.error.message);
      lastError = emailResult.error;

      // Fallback: try type 'signup'
      console.log('[VERIFY-OTP] Falling back to type=signup for:', normalizedEmail);
      const signupResult = await anonClient.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: 'signup',
      });

      if (!signupResult.error) {
        otpVerified = true;
        lastError = null;
        console.log('[VERIFY-OTP] Success with type=signup (fallback)');
      } else {
        console.log('[VERIFY-OTP] type=signup also failed:', signupResult.error.message);
        lastError = signupResult.error;
      }
    }

    // ── Handle verification failure ─────────────────────────────────────────
    if (!otpVerified) {
      const msg = (lastError?.message || '').toLowerCase();

      if (msg.includes('expired')) {
        return NextResponse.json({
          error: 'Your verification code has expired. Click "Resend" to get a new one.',
        }, { status: 400 });
      }

      if (msg.includes('invalid') || msg.includes('incorrect') || msg.includes('no such otp')) {
        return NextResponse.json({
          error: 'Incorrect verification code. Please check the code and try again.',
        }, { status: 400 });
      }

      if (msg.includes('rate limit') || msg.includes('too many')) {
        return NextResponse.json({
          error: 'Too many attempts. Please wait a minute and try again.',
        }, { status: 429 });
      }

      return NextResponse.json({
        error: 'Verification failed. Please try again or click "Resend" to get a new code.',
      }, { status: 400 });
    }

    // ── Success — mark email as verified in our `users` table ───────────────
    // That's it. No admin.updateUserById(). No password changes.
    // The password was already stored (bcrypt hashed) during signup.
    try {
      const { db } = await import('@/lib/db');

      await db.user.update({
        where: { email: normalizedEmail },
        data: { emailVerified: new Date() },
      });
      console.log('[VERIFY-OTP] Email marked as verified in users table:', normalizedEmail);
    } catch (dbError) {
      console.error('[VERIFY-OTP] DB update error:', dbError);
      return NextResponse.json({ error: 'Could not update verification status. Please try again.' }, { status: 500 });
    }

    console.log('[VERIFY-OTP] Email verified:', normalizedEmail);

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully! You can now sign in.',
    });

  } catch (error) {
    console.error('[VERIFY-OTP] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
