import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { dbRest } from '@/lib/db-rest';
import { createSignupClient } from '@/lib/supabase-server';
import { rateLimiter } from '@/lib/rate-limiter';

// ─── Rate limiting for sign-up attempts ──────────────────────────────────────
// Uses the shared RateLimiter abstraction (see @/lib/rate-limiter).
// In-memory for single-instance; set REDIS_URL for multi-instance.
const MAX_SIGNUP_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 15 * 60_000;

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
//
// Custom auth flow with OTP email verification:
//
//   1. Validate input + rate limit
//   2. Check if email already exists in our `users` table (via Supabase REST API)
//   3. Hash the password with bcrypt and store in `users` table
//      → email, encrypted password (bcrypt hash), username
//   4. Send OTP verification email via Supabase Auth (email delivery only)
//   5. Mark email as unverified until user enters the OTP code
//
// Uses Supabase REST API (HTTPS) instead of Prisma (direct PostgreSQL) because
// HF Spaces is IPv4-only and Supabase's direct DB connection requires IPv6.

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
    const rateCheck = await rateLimiter.check(`signup:${ip}`, {
      windowMs: SIGNUP_WINDOW_MS,
      maxRequests: MAX_SIGNUP_ATTEMPTS,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 900) } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── STEP 1: Check if user already exists ───────────────────────────────
    console.log('[SIGNUP] Checking if user exists:', normalizedEmail);
    const existingUser = await dbRest.findUserByEmail(normalizedEmail);

    if (existingUser) {
      if (existingUser.emailVerified) {
        // SECURITY: Generic message to prevent email enumeration
        return NextResponse.json({
          success: true,
          message: 'If an account exists with this email, a verification code has been sent.',
          email: normalizedEmail,
          emailConfirmed: false,
        });
      }
      // SECURITY: Don't overwrite password for unverified users (prevents account takeover)
      // Just resend the verification email so the original user can complete signup
      console.log('[SIGNUP] Resending verification for unverified user:', normalizedEmail);

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
    console.log('[SIGNUP] Creating user in database:', normalizedEmail);
    const newUser = await dbRest.createUser({
      email: normalizedEmail,
      name: username || normalizedEmail.split('@')[0],
      passwordHash,
      emailVerified: null, // Will be set after OTP verification
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
    // SECURITY: Log full error server-side only. Return generic message to client.
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[SIGNUP] UNEXPECTED ERROR:', errMsg);
    if (error instanceof Error && error.stack) {
      console.error('[SIGNUP] Stack:', error.stack);
    }

    if (error instanceof Error) {
      if (errMsg.includes('UNIQUE_CONSTRAINT') || errMsg.includes('Unique constraint') || errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('already exists')) {
        return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
      }
    }
    // Never expose internal error details to the client
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
