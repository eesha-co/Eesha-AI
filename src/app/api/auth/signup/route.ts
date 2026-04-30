import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// ─── Rate limiting for sign-up attempts ──────────────────────────────────────
const signupAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_SIGNUP_ATTEMPTS = 5;       // per IP per window
const SIGNUP_WINDOW_MS = 15 * 60_000; // 15 minutes

function checkSignupRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = signupAttempts.get(ip);

  if (!entry || now > entry.resetTime) {
    signupAttempts.set(ip, { count: 1, resetTime: now + SIGNUP_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_SIGNUP_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// Steps:
//   1. Validate input (email, password, policy agreement)
//   2. Rate limit by IP
//   3. Check if email already exists in Supabase Auth
//   4. Create user in Supabase Auth (email + password, email_confirm: false)
//   5. Supabase automatically sends a verification OTP email
//   6. Create a corresponding user record in our Prisma database
//   7. Return success — client will show OTP input

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, agreedToPolicy } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'A password is required.' },
        { status: 400 }
      );
    }

    // Password strength requirements
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter.' },
        { status: 400 }
      );
    }

    if (!/[a-z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one lowercase letter.' },
        { status: 400 }
      );
    }

    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number.' },
        { status: 400 }
      );
    }

    if (!agreedToPolicy) {
      return NextResponse.json(
        { error: 'You must agree to the Eesha AI Privacy Policy and Terms of Service.' },
        { status: 400 }
      );
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const rateCheck = checkSignupRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 900) } }
      );
    }

    // ── Supabase Auth: Create user ──────────────────────────────────────────
    const supabase = createServerSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        // Don't auto-confirm — require OTP verification
        emailRedirectTo: undefined, // We use OTP, not magic link
        data: {
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      },
    });

    if (authError) {
      // Map Supabase errors to user-friendly messages
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      // Don't leak internal error details
      console.error('[SIGNUP] Supabase auth error:', authError.message);
      return NextResponse.json(
        { error: 'Unable to create account. Please try again.' },
        { status: 500 }
      );
    }

    // ── Create Prisma user record ───────────────────────────────────────────
    if (authData.user) {
      try {
        // Check if user already exists in our DB (edge case: duplicate)
        const existingUser = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        if (!existingUser) {
          await db.user.create({
            data: {
              id: authData.user.id,
              email: email.toLowerCase().trim(),
              name: email.split('@')[0],
              emailVerified: null, // Not verified yet — will be set after OTP
            },
          });
        }
      } catch (dbError) {
        console.error('[SIGNUP] Database user creation error:', dbError);
        // Don't fail the whole request — the Supabase auth user was created
        // We can reconcile the DB record later
      }
    }

    // ── Success ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: 'Account created. A verification code has been sent to your email.',
      email: email.toLowerCase().trim(),
      // If Supabase auto-confirms (e.g., in dev mode), let the client know
      emailConfirmed: authData.user?.email_confirmed_at != null,
    });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
