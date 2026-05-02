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
// Simple Supabase OTP resend:
//   1. Verify user exists and isn't already confirmed
//   2. Call signInWithOtp({ shouldCreateUser: false }) — sends a new 6-digit code
//   3. Done
//
// The new code replaces the old one. User must use the NEW code.

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
    const adminClient = createServerSupabaseClient();
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

    // ── Send new OTP via signInWithOtp ──────────────────────────────────────
    // This replaces any existing code. The user must use the NEW code.
    const anonClient = createSignupClient();

    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: emailKey,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      console.error('[RESEND-OTP] signInWithOtp failed:', otpError.message);
      return NextResponse.json(
        { error: 'Unable to send verification code. Please wait a minute and try again.' },
        { status: 500 }
      );
    }

    lastResendTime.set(emailKey, now);
    console.log('[RESEND-OTP] New OTP sent to:', emailKey);

    return NextResponse.json({
      success: true,
      message: 'A new verification code has been sent to your email. Use the new code — the old one is no longer valid.',
    });

  } catch (error) {
    console.error('[RESEND-OTP] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
