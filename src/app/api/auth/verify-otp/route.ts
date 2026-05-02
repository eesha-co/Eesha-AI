import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';
import { db } from '@/lib/db';

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
// Clean verification flow:
//
//   1. Try verifyOtp() with token types in priority order:
//      - 'signup' first (signUp() is the primary email sender)
//      - 'email' second (signInWithOtp() / resend-otp uses this type)
//   2. If all fail, check if user is already verified (maybe they clicked a link)
//   3. Return clear, actionable error messages — NO auto-resend
//      (auto-resend caused "Could not send a new verification code" errors
//       due to Supabase's 60-second email rate limit)

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

    // Accept 6 or 8 digit OTPs
    if (!/^\d{6,8}$/.test(otp)) {
      return NextResponse.json({ error: 'Verification code must be 6 digits.' }, { status: 400 });
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

    // ── Verify OTP with Supabase ────────────────────────────────────────────
    // Token type priority:
    //   1. 'signup' — from signUp() (the primary email sender in our signup route)
    //   2. 'email'  — from signInWithOtp() (used by resend-otp and admin fallback)
    const signupClient = createSignupClient();

    const tokenTypes = ['signup', 'email'] as const;
    let lastError: { message: string; status?: number } | null = null;
    let verifiedData: any = null;

    for (const type of tokenTypes) {
      const { data, error } = await signupClient.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type,
      });

      if (!error && data.user) {
        verifiedData = data;
        console.log(`[VERIFY-OTP] Success with type '${type}' for:`, normalizedEmail);
        break;
      }

      if (error) {
        console.warn(`[VERIFY-OTP] type '${type}' failed:`, error.message);
        lastError = { message: error.message, status: error.status };
        // Only continue to next type for "expired/invalid" errors
        // Other errors (rate limit, etc.) should stop immediately
        if (!error.message.includes('expired') && !error.message.includes('invalid')) {
          break;
        }
      }
    }

    // ── If verification failed, check if user is already verified ──────────
    // This handles the case where the user clicked a verification link
    // in their email instead of entering the code.
    if (!verifiedData && lastError) {
      console.error('[VERIFY-OTP] All types failed. Last error:', lastError.message);

      try {
        const adminClient = createServerSupabaseClient();
        const { data: usersData } = await adminClient.auth.admin.listUsers();
        const user = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );

        if (user?.email_confirmed_at) {
          // User is already verified — they must have clicked the link
          console.log('[VERIFY-OTP] User already verified (likely via link click):', normalizedEmail);

          // Update our DB too
          try {
            await db.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date(user.email_confirmed_at) },
            });
          } catch {}

          return NextResponse.json({
            success: true,
            message: 'Your email is already verified! You can sign in now.',
            alreadyVerified: true,
          });
        }

        if (!user) {
          return NextResponse.json({
            error: 'No account found with this email. Please sign up first.',
          }, { status: 400 });
        }

        // User exists but not verified — determine why the code failed
        if (user.confirmation_sent_at) {
          const sentAt = new Date(user.confirmation_sent_at).getTime();
          const elapsedSeconds = (Date.now() - sentAt) / 1000;

          if (elapsedSeconds > 3600) {
            // Code expired (1 hour default)
            return NextResponse.json({
              error: 'Your verification code has expired. Click "Resend" to get a new one.',
            }, { status: 400 });
          }

          // Code was sent recently but is wrong
          return NextResponse.json({
            error: 'Incorrect verification code. Please double-check the code and try again. Make sure you\'re using the most recent code sent to your email.',
          }, { status: 400 });
        }

        // No confirmation_sent_at — the email template might send a link, not a code
        return NextResponse.json({
          error: 'Verification failed. Your email may contain a verification link instead of a code — try clicking the link in the email. If you only see a code, click "Resend" to get a fresh one.',
        }, { status: 400 });

      } catch (adminError) {
        console.error('[VERIFY-OTP] Admin lookup failed:', adminError);
        return NextResponse.json({
          error: 'Verification failed. Please try again or click "Resend" to get a new code.',
        }, { status: 400 });
      }
    }

    if (!verifiedData) {
      return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 });
    }

    // ── Update our database: mark email as verified ─────────────────────────
    if (verifiedData.user) {
      try {
        await db.user.update({
          where: { id: verifiedData.user.id },
          data: { emailVerified: new Date() },
        });
      } catch (dbError) {
        console.error('[VERIFY-OTP] Database update error:', dbError);
        // Non-fatal — Supabase auth is the source of truth
      }
    }

    // ── Success ─────────────────────────────────────────────────────────────
    console.log('[VERIFY-OTP] Email verified for:', normalizedEmail);

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully! You can now sign in.',
    });

  } catch (error) {
    console.error('[VERIFY-OTP] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
