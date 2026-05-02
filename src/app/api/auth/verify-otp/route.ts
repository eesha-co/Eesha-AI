import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';

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
// Simple Supabase OTP verification:
//   1. Call verifyOtp({ type: 'email' }) — one type, one call
//   2. If success → mark email verified in DB
//   3. If error → clear message
//
// That's it. No multiple token types, no auto-resend, no fallbacks.

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

    // ── Verify OTP — type is always 'email' ────────────────────────────────
    // Our signup route uses signInWithOtp() which creates tokens of type 'email'.
    // Our resend route also uses signInWithOtp(), same type.
    // So we always verify with type: 'email'. Simple.
    const anonClient = createSignupClient();

    const { data, error } = await anonClient.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: 'email',
    });

    if (error) {
      console.warn('[VERIFY-OTP] Failed:', error.message);

      // Map common Supabase errors to user-friendly messages
      const msg = error.message.toLowerCase();

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

      // Generic error
      return NextResponse.json({
        error: 'Verification failed. Please try again or click "Resend" to get a new code.',
      }, { status: 400 });
    }

    // ── Success — update our DB ─────────────────────────────────────────────
    if (data.user) {
      try {
        const { db } = await import('@/lib/db');
        await db.user.update({
          where: { id: data.user.id },
          data: { emailVerified: new Date() },
        });
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
