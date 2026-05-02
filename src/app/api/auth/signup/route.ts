import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

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
// Custom auth flow — we own the credentials entirely:
//
//   1. Validate input + rate limit
//   2. Check if email already exists in our `users` table
//   3. Hash the password with bcrypt and store in `users` table
//      → email, encrypted password (bcrypt hash), username
//   4. Mark email as verified immediately (auto-verify)
//   5. Return success — user can now log in
//
// The `users` table is in Supabase PostgreSQL (via Prisma + DATABASE_URL).
// We do NOT use Supabase Auth API at all. Pure custom authentication.

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
      // User already exists — tell them to log in
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in instead.' },
        { status: 409 }
      );
    }

    // ── STEP 2: Hash the password with bcrypt ──────────────────────────────
    // bcrypt.hash() generates a salt and hashes the password in one call.
    // The hash includes the salt, so we don't need to store it separately.
    // Cost factor 12 means 2^12 = 4096 rounds — strong and fast enough.
    console.log('[SIGNUP] Hashing password for:', normalizedEmail);
    const passwordHash = await bcrypt.hash(password, 12);

    // ── STEP 3: Create user in our `users` table ───────────────────────────
    // Email is auto-verified (emailVerified set to current time).
    // All credentials live in our Supabase PostgreSQL `users` table via Prisma.
    const newUser = await db.user.create({
      data: {
        email: normalizedEmail,
        name: username || normalizedEmail.split('@')[0],
        passwordHash,
        emailVerified: new Date(), // Auto-verify — no OTP needed
      },
    });
    console.log('[SIGNUP] User created in users table:', normalizedEmail, '| id:', newUser.id);

    console.log('[SIGNUP] Success — user created and verified:', normalizedEmail);
    return NextResponse.json({
      success: true,
      message: 'Account created successfully! You can now sign in.',
      email: normalizedEmail,
      emailConfirmed: true,
    });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    // Provide more specific error for debugging
    if (error instanceof Error) {
      // Prisma unique constraint violation
      if (error.message.includes('Unique constraint') || error.message.includes('unique')) {
        return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
      }
    }
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
