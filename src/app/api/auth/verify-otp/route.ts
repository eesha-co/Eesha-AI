import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';
import bcrypt from 'bcryptjs';

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
// Supabase OTP verification with fallback:
//   1. Try verifyOtp({ type: 'signup' }) — for tokens from signUp()
//   2. If that fails, try verifyOtp({ type: 'email' }) — for tokens from signInWithOtp()
//   3. If success → mark email verified in DB + ensure password is saved
//
// We try 'signup' first because our signup route now uses signUp() which
// generates signup-type tokens. We fall back to 'email' for backward
// compatibility with any existing users who got tokens from signInWithOtp().

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp, password } = body;

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

    // ── Get Supabase client ─────────────────────────────────────────────────
    let anonClient;
    try {
      anonClient = createSignupClient();
    } catch (envError) {
      console.error('[VERIFY-OTP] Missing Supabase env vars:', envError);
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // ── Try verifyOtp — attempt 'signup' first, then 'email' ──────────────
    let data: any = null;
    let lastError: any = null;

    // Attempt 1: type 'signup' (for signUp-generated tokens)
    console.log('[VERIFY-OTP] Attempting type=signup for:', normalizedEmail);
    const signupResult = await anonClient.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: 'signup',
    });

    if (!signupResult.error) {
      data = signupResult.data;
      console.log('[VERIFY-OTP] Success with type=signup');
    } else {
      console.log('[VERIFY-OTP] type=signup failed:', signupResult.error.message);
      lastError = signupResult.error;

      // Attempt 2: type 'email' (for signInWithOtp-generated tokens)
      console.log('[VERIFY-OTP] Falling back to type=email for:', normalizedEmail);
      const emailResult = await anonClient.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: 'email',
      });

      if (!emailResult.error) {
        data = emailResult.data;
        lastError = null;
        console.log('[VERIFY-OTP] Success with type=email');
      } else {
        console.log('[VERIFY-OTP] type=email also failed:', emailResult.error.message);
        lastError = emailResult.error;
      }
    }

    // ── Handle verification failure ─────────────────────────────────────────
    if (lastError || !data) {
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

    // ── Success — update our DB & ensure password is saved ──────────────────
    if (data.user) {
      const userId = data.user.id;

      // ── Ensure password is set in Supabase Auth ──────────────────────────
      // Critical: signUp() should save the password, but we double-check here.
      if (password && typeof password === 'string') {
        try {
          const adminClient = createServerSupabaseClient();
          await adminClient.auth.admin.updateUserById(userId, { password });
          console.log('[VERIFY-OTP] Password ensured in Supabase Auth for:', normalizedEmail);
        } catch (pwErr) {
          console.error('[VERIFY-OTP] Could not save password to Supabase Auth:', pwErr);
          // Non-fatal — the user is still verified
        }
      }

      // ── Update Prisma DB (upsert — works even if record doesn't exist) ────
      try {
        const { db } = await import('@/lib/db');
        const updateData: any = { emailVerified: new Date() };

        // Also save bcrypt hash as a backup for the fallback in auth.ts
        if (password && typeof password === 'string') {
          updateData.passwordHash = await bcrypt.hash(password, 12);
        }

        // Use upsert — the DB record might not exist if signup's upsert failed
        await db.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email: normalizedEmail,
            name: data.user.user_metadata?.username || normalizedEmail.split('@')[0],
            emailVerified: new Date(),
            passwordHash: updateData.passwordHash,
          },
          update: updateData,
        });
        console.log('[VERIFY-OTP] DB record updated for:', normalizedEmail);
      } catch (dbError) {
        console.error('[VERIFY-OTP] DB update error (non-fatal):', dbError);
      }
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
