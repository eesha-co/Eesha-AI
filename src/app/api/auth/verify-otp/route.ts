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
// Supabase OTP verification:
//   1. Call verifyOtp({ type: 'email' }) — confirms email & preserves password
//   2. Update Prisma DB to mark email as verified
//   3. Save bcrypt hash as backup (for Supabase downtime only)
//
// ⚠️  CRITICAL: Do NOT call admin.updateUserById() here!
//     Confirmed Supabase bug (supabase/auth#1578): admin.updateUserById()
//     can wipe the encrypted_password field, making signInWithPassword()
//     fail with "Invalid login credentials" even though the password was
//     correctly set during signUp().
//
//     signUp() already stores the password. verifyOtp() already confirms
//     the email. There is NO need to call admin.updateUserById() at all.

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

    // ── Verify OTP using type 'email' (replaces deprecated 'signup' type) ──
    // The 'email' type is the current recommended type for email OTP verification.
    // It handles both signup verification and magic link verification.
    // The 'signup' type is deprecated (supabase/supabase#27883).
    console.log('[VERIFY-OTP] Attempting type=email for:', normalizedEmail);
    let data: any = null;
    let lastError: any = null;

    const emailResult = await anonClient.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: 'email',
    });

    if (!emailResult.error) {
      data = emailResult.data;
      console.log('[VERIFY-OTP] Success with type=email');
    } else {
      console.log('[VERIFY-OTP] type=email failed:', emailResult.error.message);
      lastError = emailResult.error;

      // Fallback: try type 'signup' for backward compatibility with older tokens
      console.log('[VERIFY-OTP] Falling back to type=signup for:', normalizedEmail);
      const signupResult = await anonClient.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: 'signup',
      });

      if (!signupResult.error) {
        data = signupResult.data;
        lastError = null;
        console.log('[VERIFY-OTP] Success with type=signup (fallback)');
      } else {
        console.log('[VERIFY-OTP] type=signup also failed:', signupResult.error.message);
        lastError = signupResult.error;
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

    // ── Success — update Prisma DB ─────────────────────────────────────────
    // NOTE: We do NOT call admin.updateUserById() here!
    // signUp() already stored the password in Supabase Auth.
    // verifyOtp() already confirmed the email.
    // Calling admin.updateUserById() can WIPE the password (supabase/auth#1578).

    if (data.user) {
      const userId = data.user.id;

      try {
        const { db } = await import('@/lib/db');
        const updateData: Record<string, any> = {
          emailVerified: new Date(),
        };

        // Save bcrypt hash as backup (only used if Supabase Auth is down)
        if (password && typeof password === 'string' && password.length >= 8) {
          updateData.passwordHash = await bcrypt.hash(password, 12);
        }

        // Find existing user by email (consistent with signup route)
        const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });

        if (existingUser) {
          await db.user.update({
            where: { id: existingUser.id },
            data: updateData,
          });
          console.log('[VERIFY-OTP] DB record updated for:', normalizedEmail);
        } else {
          await db.user.create({
            data: {
              id: userId,
              email: normalizedEmail,
              name: data.user.user_metadata?.username || normalizedEmail.split('@')[0],
              emailVerified: new Date(),
              passwordHash: updateData.passwordHash || null,
            },
          });
          console.log('[VERIFY-OTP] DB record created for:', normalizedEmail);
        }
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
