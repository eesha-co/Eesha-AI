import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';

// ─── Rate limiting for resend attempts ────────────────────────────────────────
const resendAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_RESEND_ATTEMPTS = 5;
const RESEND_WINDOW_MS = 15 * 60_000;
const RESEND_COOLDOWN_MS = 60_000; // 1 minute between resends (Supabase enforced)

const lastResendTime = new Map<string, number>();

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
//
// Resend verification email using Supabase resend() method:
//   1. Verify user exists and isn't already confirmed
//   2. Call resend({ type: 'signup' }) — resends the verification email
//   3. Done
//
// This uses the standard Supabase resend() method which works with signUp().

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

    // ── Verify the user exists before sending ───────────────────────────────
    let adminClient;
    try {
      adminClient = createServerSupabaseClient();
    } catch (envError) {
      console.error('[RESEND-OTP] Missing Supabase env vars:', envError);
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const user = usersData?.users?.find(u => u.email?.toLowerCase() === emailKey);

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email. Please sign up first.' },
        { status: 404 }
      );
    }

    // If already verified, tell them to log in
    if (user.email_confirmed_at) {
      return NextResponse.json({
        success: true,
        message: 'Your email is already verified. You can sign in now.',
        alreadyVerified: true,
      });
    }

    // ── Resend verification email ──────────────────────────────────────────
    // Use resend() with type 'signup' — this is the standard way to resend
    // verification emails for signUp()-created users.
    let anonClient;
    try {
      anonClient = createSignupClient();
    } catch (envError) {
      console.error('[RESEND-OTP] Missing SUPABASE_ANON_KEY:', envError);
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // Try type 'signup' first (for signUp-created users), then 'emailchange' or 'magiclink'
    console.log('[RESEND-OTP] Resending with type=signup for:', emailKey);
    const { error: resendError } = await anonClient.auth.resend({
      type: 'signup',
      email: emailKey,
    });

    if (resendError) {
      console.error('[RESEND-OTP] resend(signup) failed:', resendError.message);

      // Fallback: try signInWithOtp as a last resort
      // This handles cases where the user was created with the old admin.createUser + signInWithOtp flow
      console.log('[RESEND-OTP] Falling back to signInWithOtp for:', emailKey);
      const { error: otpError } = await anonClient.auth.signInWithOtp({
        email: emailKey,
        options: {
          shouldCreateUser: false,
        },
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
