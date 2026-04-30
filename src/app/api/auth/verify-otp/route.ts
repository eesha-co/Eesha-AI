import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { db } from '@/lib/db';

// ─── Rate limiting for OTP verification attempts ──────────────────────────────
const otpAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_OTP_ATTEMPTS = 10;       // per email per window
const OTP_WINDOW_MS = 15 * 60_000; // 15 minutes

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
// Verifies the OTP code sent to the user's email during sign-up.
// On success, marks the user's email as verified in both Supabase and our DB.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required.' },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required.' },
        { status: 400 }
      );
    }

    // OTP should be 6 digits
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: 'Verification code must be 6 digits.' },
        { status: 400 }
      );
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const rateCheck = checkOtpRateLimit(email.toLowerCase());
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please request a new code.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 900) } }
      );
    }

    // ── Verify OTP with Supabase ────────────────────────────────────────────
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: otp,
      type: 'signup',
    });

    if (error) {
      // Map common errors
      if (error.message.includes('expired') || error.message.includes('Token has expired')) {
        return NextResponse.json(
          { error: 'Verification code has expired. Please request a new one.' },
          { status: 400 }
        );
      }

      if (error.message.includes('invalid') || error.message.includes('Incorrect')) {
        return NextResponse.json(
          { error: 'Invalid verification code. Please check and try again.' },
          { status: 400 }
        );
      }

      console.error('[VERIFY-OTP] Supabase error:', error.message);
      return NextResponse.json(
        { error: 'Verification failed. Please try again.' },
        { status: 400 }
      );
    }

    // ── Update our database: mark email as verified ─────────────────────────
    if (data.user) {
      try {
        await db.user.update({
          where: { id: data.user.id },
          data: { emailVerified: new Date() },
        });
      } catch (dbError) {
        console.error('[VERIFY-OTP] Database update error:', dbError);
        // Non-fatal — Supabase auth is the source of truth for verification
      }
    }

    // ── Success ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: 'Email verified successfully! You can now sign in.',
    });

  } catch (error) {
    console.error('[VERIFY-OTP] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
