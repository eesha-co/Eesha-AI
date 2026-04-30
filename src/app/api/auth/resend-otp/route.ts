import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient } from '@/lib/supabase-server';

// ─── Rate limiting for resend attempts ────────────────────────────────────────
const resendAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_RESEND_ATTEMPTS = 3;          // per email per window
const RESEND_WINDOW_MS = 15 * 60_000;   // 15 minutes
const RESEND_COOLDOWN_MS = 60_000;       // 1 minute between resends

const lastResendTime = new Map<string, number>();

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
// Resends a 6-digit OTP code to the user's email.
// Uses signInWithOtp() which ALWAYS sends a code (never a magic link).

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();

    // ── Cooldown check (1 minute between resends) ───────────────────────────
    const lastSent = lastResendTime.get(emailKey) || 0;
    const now = Date.now();
    if (now - lastSent < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSeconds} seconds before requesting a new code.` },
        { status: 429 }
      );
    }

    // ── Rate limit check ────────────────────────────────────────────────────
    const entry = resendAttempts.get(emailKey);
    if (!entry || now > entry.resetTime) {
      resendAttempts.set(emailKey, { count: 1, resetTime: now + RESEND_WINDOW_MS });
    } else if (entry.count >= MAX_RESEND_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many resend attempts. Please try again later.' },
        { status: 429 }
      );
    } else {
      entry.count++;
    }

    // ── Send OTP code via signInWithOtp() ───────────────────────────────────
    // This ALWAYS sends a 6-digit OTP code to the user's email.
    // shouldCreateUser: false — the user already exists in Supabase Auth.
    const signupClient = createSignupClient();

    const { error } = await signupClient.auth.signInWithOtp({
      email: emailKey,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error('[RESEND-OTP] Supabase error:', error.message);

      if (error.message.includes('not found') || error.message.includes('No user')) {
        return NextResponse.json(
          { error: 'No account found with this email. Please sign up first.' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Unable to resend verification code. Please try again.' },
        { status: 500 }
      );
    }

    lastResendTime.set(emailKey, now);

    return NextResponse.json({
      success: true,
      message: 'A new verification code has been sent to your email.',
    });

  } catch (error) {
    console.error('[RESEND-OTP] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
