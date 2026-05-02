import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createSignupClient } from '@/lib/supabase-server';

// ─── Rate limiting for sign-up attempts ──────────────────────────────────────
const signupAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_SIGNUP_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 15 * 60_000;

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
//
// Custom auth flow with OTP email verification:
//
//   1. Validate input + rate limit
//   2. Check if email already exists in our `users` table
//   3. Hash the password with bcrypt and store in `users` table
//      → email, encrypted password (bcrypt hash), username
//   4. Send OTP verification email via Supabase Auth (email delivery only)
//   5. Mark email as unverified until user enters the OTP code
//
// The `users` table is in Supabase PostgreSQL (via Prisma + DATABASE_URL).
// We do NOT rely on Supabase Auth for password storage or verification.
// Supabase Auth is ONLY used to send/verify the OTP email code.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, username, agreedToPolicy } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'A password is required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one uppercase letter.' }, { status: 400 });
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one lowercase letter.' }, { status: 400 });
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one number.' }, { status: 400 });
    }
    if (!agreedToPolicy) {
      return NextResponse.json({ error: 'You must agree to the Privacy Policy and Terms of Service.' }, { status: 400 });
    }
    if (username && typeof username !== 'string') {
      return NextResponse.json({ error: 'Invalid username format.' }, { status: 400 });
    }
    if (username && (username.length < 3 || !/^[a-zA-Z0-9_-]+$/.test(username))) {
      return NextResponse.json({ error: 'Username must be at least 3 characters and contain only letters, numbers, underscores, or hyphens.' }, { status: 400 });
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkSignupRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 900) } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── STEP 1: Check if user already exists in our `users` table ───────────
    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
      if (existingUser.emailVerified) {
        // Already verified — tell them to log in
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }
      // Not verified yet — update their password and resend verification
      const newHash = await bcrypt.hash(password, 12);
      await db.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash: newHash,
          name: username || existingUser.name,
        },
      });
      console.log('[SIGNUP] Updated password for unverified user:', normalizedEmail);

      // Resend OTP via Supabase Auth
      try {
        const signupClient = createSignupClient();
        await signupClient.auth.resend({ type: 'signup', email: normalizedEmail });
        console.log('[SIGNUP] Verification email resent to:', normalizedEmail);
      } catch (resendErr) {
        console.error('[SIGNUP] Could not resend verification email:', resendErr);
      }

      return NextResponse.json({
        success: true,
        message: 'A new verification code has been sent to your email.',
        email: normalizedEmail,
        emailConfirmed: false,
      });
    }

    // ── STEP 2: Hash the password with bcrypt ──────────────────────────────
    console.log('[SIGNUP] Hashing password for:', normalizedEmail);
    const passwordHash = await bcrypt.hash(password, 12);

    // ── STEP 3: Create user in our `users` table ───────────────────────────
    // Email is marked unverified until the user enters the OTP code.
    const newUser = await db.user.create({
      data: {
        email: normalizedEmail,
        name: username || normalizedEmail.split('@')[0],
        passwordHash,
        emailVerified: null, // Will be set after OTP verification
      },
    });
    console.log('[SIGNUP] User created in users table:', normalizedEmail, '| id:', newUser.id);

    // ── STEP 4: Send OTP verification email via Supabase Auth ──────────────
    // We use Supabase Auth ONLY as an email delivery service.
    // We call signUp() which triggers the "Confirm signup" email template.
    // The actual password in Supabase Auth doesn't matter — we verify
    // against our own `users` table.
    try {
      const signupClient = createSignupClient();
      const { error: signUpError } = await signupClient.auth.signUp({
        email: normalizedEmail,
        password, // Supabase requires a password, but we don't use theirs for login
        options: {
          data: {
            username: username || undefined,
            db_user_id: newUser.id,
          },
        },
      });

      if (signUpError) {
        console.error('[SIGNUP] Supabase signUp error:', signUpError.message);
        const msg = signUpError.message.toLowerCase();
        if (!msg.includes('already registered')) {
          console.error('[SIGNUP] Non-critical Supabase error, user record is safe');
        }
      } else {
        console.log('[SIGNUP] Verification email sent via Supabase for:', normalizedEmail);
      }
    } catch (supabaseErr) {
      // Supabase email sending failed — our user record is still created.
      // The user can request a resend later.
      console.error('[SIGNUP] Supabase email sending failed (non-fatal):', supabaseErr);
    }

    console.log('[SIGNUP] Success — user created, verification email sent to:', normalizedEmail);
    return NextResponse.json({
      success: true,
      message: 'A verification code has been sent to your email.',
      email: normalizedEmail,
      emailConfirmed: false,
    });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint') || error.message.includes('unique')) {
        return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
      }
    }
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
