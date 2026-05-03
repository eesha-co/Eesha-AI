import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient } from '@/lib/supabase-server';
import { dbRest } from '@/lib/db-rest';
import { rateLimiter } from '@/lib/rate-limiter';

// ─── Rate limiting for resend attempts ────────────────────────────────────────
// Uses the shared RateLimiter abstraction (see @/lib/rate-limiter).
// In-memory for single-instance; set REDIS_URL for multi-instance.
const MAX_RESEND_ATTEMPTS = 5;
const RESEND_WINDOW_MS = 15 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;

const lastResendTime = new Map<string, number>();

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
//
// Resend verification email via Supabase Auth (email delivery only).
// Uses Supabase REST API (HTTPS) for database operations.

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
    const rateCheck = await rateLimiter.check(`resend:${emailKey}`, {
      windowMs: RESEND_WINDOW_MS,
      maxRequests: MAX_RESEND_ATTEMPTS,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many resend attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // ── Check our `users` table first ──────────────────────────────────────
    const user = await dbRest.findUserByEmail(emailKey);

    // SECURITY: Always return success to prevent email enumeration
    // Don't reveal whether the email exists or not
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, a verification code has been sent.',
      });
    }

    // If already verified, tell them to log in
    if (user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: 'Your email is already verified. You can sign in now.',
        alreadyVerified: true,
      });
    }

    // ── Resend verification email via Supabase Auth ────────────────────────
    let anonClient;
    try {
      anonClient = createSignupClient();
    } catch (envError) {
      console.error('[RESEND-OTP] Missing SUPABASE_ANON_KEY:', envError);
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    console.log('[RESEND-OTP] Resending with type=signup for:', emailKey);
    const { error: resendError } = await anonClient.auth.resend({
      type: 'signup',
      email: emailKey,
    });

    if (resendError) {
      console.error('[RESEND-OTP] resend(signup) failed:', resendError.message);

      // Fallback: try signInWithOtp
      console.log('[RESEND-OTP] Falling back to signInWithOtp for:', emailKey);
      const { error: otpError } = await anonClient.auth.signInWithOtp({
        email: emailKey,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        console.error('[RESEND-OTP] signInWithOtp fallback also failed:', otpError.message);
        return NextResponse.json(
          { error: 'Unable to send verification code. Please wait a minute and try again.' },
          { status: 500 }
        );
      }

      console.log('[RESEND-OTP] OTP sent via signInWithOtp fallback to:', emailKey);
    } else {
      console.log('[RESEND-OTP] Verification email resent to:', emailKey);
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
