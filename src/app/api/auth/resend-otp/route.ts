import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';

// ─── Rate limiting for resend attempts ────────────────────────────────────────
const resendAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_RESEND_ATTEMPTS = 5;          // per email per window
const RESEND_WINDOW_MS = 15 * 60_000;   // 15 minutes
const RESEND_COOLDOWN_MS = 60_000;       // 1 minute between resends

const lastResendTime = new Map<string, number>();

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
//
// Resends an OTP code to the user's email.
// Uses signInWithOtp() which ALWAYS sends an OTP code (never a magic link),
// regardless of the Supabase email template configuration.
//
// Falls back to admin API if the user can't be found via the anon key.

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

    const signupClient = createSignupClient();

    // ── Attempt 1: signInWithOtp with shouldCreateUser: false ───────────────
    // This is the preferred approach — user already exists, just send a code.
    const { error: otpError1 } = await signupClient.auth.signInWithOtp({
      email: emailKey,
      options: { shouldCreateUser: false },
    });

    if (!otpError1) {
      lastResendTime.set(emailKey, now);
      console.log('[RESEND-OTP] OTP sent (shouldCreateUser: false) for:', emailKey);
      return NextResponse.json({
        success: true,
        message: 'A new verification code has been sent to your email.',
      });
    }

    console.warn('[RESEND-OTP] Attempt 1 failed:', otpError1.message);

    // ── Attempt 2: signInWithOtp without flag ───────────────────────────────
    // More permissive — works when the user was created via admin API
    // or when Supabase can't find the user via the anon key immediately.
    const { error: otpError2 } = await signupClient.auth.signInWithOtp({
      email: emailKey,
    });

    if (!otpError2) {
      lastResendTime.set(emailKey, now);
      console.log('[RESEND-OTP] OTP sent (no flag) for:', emailKey);
      return NextResponse.json({
        success: true,
        message: 'A new verification code has been sent to your email.',
      });
    }

    console.warn('[RESEND-OTP] Attempt 2 failed:', otpError2.message);

    // ── Attempt 3: Admin API fallback ───────────────────────────────────────
    // If both signInWithOtp calls fail, the user might not be properly
    // recognized by the anon key. Use admin API to verify user exists,
    // then try one more time.
    try {
      const adminClient = createServerSupabaseClient();
      const { data: usersData } = await adminClient.auth.admin.listUsers();
      const user = usersData?.users?.find(u => u.email?.toLowerCase() === emailKey);

      if (user) {
        // User exists — try signInWithOtp one more time (sometimes works after admin lookup)
        const { error: otpError3 } = await signupClient.auth.signInWithOtp({
          email: emailKey,
        });

        if (!otpError3) {
          lastResendTime.set(emailKey, now);
          console.log('[RESEND-OTP] OTP sent (admin fallback) for:', emailKey);
          return NextResponse.json({
            success: true,
            message: 'A new verification code has been sent to your email.',
          });
        }

        console.error('[RESEND-OTP] All attempts failed. User exists but OTP cannot be sent:', otpError3.message);
        return NextResponse.json(
          { error: 'Unable to send verification code. Please try again in a few minutes.' },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          { error: 'No account found with this email. Please sign up first.' },
          { status: 404 }
        );
      }
    } catch (adminError) {
      console.error('[RESEND-OTP] Admin fallback error:', adminError);
      return NextResponse.json(
        { error: 'Unable to send verification code. Please try again in a few minutes.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[RESEND-OTP] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
