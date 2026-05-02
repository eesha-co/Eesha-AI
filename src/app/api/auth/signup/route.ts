import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';
import bcrypt from 'bcryptjs';

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

// ─── Helper: Find user by email via admin API ───────────────────────────────
async function findUserByEmail(adminClient: ReturnType<typeof createServerSupabaseClient>, email: string) {
  let page = 1;
  const perPage = 50;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('[SIGNUP] listUsers page', page, 'error:', error.message);
      return { user: null, error };
    }

    const found = data?.users?.find(u => u.email?.toLowerCase() === email);
    if (found) return { user: found, error: null };

    hasMore = (data?.users?.length ?? 0) >= perPage;
    page++;
  }

  return { user: null, error: null };
}

// ─── Helper: Create Prisma DB record (best-effort) ──────────────────────────
async function ensureDbUser(userId: string, email: string, emailVerified: Date | null, plainPassword?: string, username?: string) {
  try {
    const { db } = await import('@/lib/db');

    let passwordHash: string | undefined;
    if (plainPassword) {
      passwordHash = await bcrypt.hash(plainPassword, 12);
    }

    await db.user.upsert({
      where: { email },
      create: {
        id: userId,
        email,
        name: username || email.split('@')[0],
        emailVerified,
        passwordHash,
      },
      update: {
        ...(emailVerified ? { emailVerified } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
  } catch (dbError) {
    console.error('[SIGNUP] DB user creation failed (non-fatal):', dbError instanceof Error ? dbError.message : dbError);
  }
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
//
// Simple, correct Supabase OTP flow:
//
//   1. Validate input + rate limit
//   2. Check if user already exists via admin API
//      - If confirmed → "please log in"
//      - If unconfirmed → delete the stale user
//   3. Create user via admin.createUser() (does NOT send email)
//   4. Send 6-digit OTP via signInWithOtp({ shouldCreateUser: false })
//      → Supabase generates, stores, and emails a 6-digit code
//      → Token type is 'email' (used by verifyOtp)
//   5. Create Prisma DB record
//
// This ensures exactly ONE email with ONE code. No double emails,
// no conflicting token types, no auto-resend failures.

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

    // ── Get Supabase clients ────────────────────────────────────────────────
    let adminClient;
    let anonClient;
    try {
      adminClient = createServerSupabaseClient();
      anonClient = createSignupClient();
    } catch (envError) {
      console.error('[SIGNUP] Missing Supabase env vars:', envError);
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
    }

    // ── STEP 1: Check if user already exists ───────────────────────────────
    console.log('[SIGNUP] Checking if user exists:', normalizedEmail);
    const { user: existingUser } = await findUserByEmail(adminClient, normalizedEmail);

    if (existingUser) {
      if (existingUser.email_confirmed_at) {
        console.log('[SIGNUP] User already confirmed:', normalizedEmail);
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      // Unconfirmed user — delete so we can create fresh
      console.log('[SIGNUP] Deleting unconfirmed user:', normalizedEmail);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
      if (deleteError) {
        console.error('[SIGNUP] Failed to delete unconfirmed user:', deleteError.message);
      } else {
        try {
          const { db } = await import('@/lib/db');
          await db.user.deleteMany({ where: { email: normalizedEmail } });
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // ── STEP 2: Create user via admin API (does NOT send email) ────────────
    console.log('[SIGNUP] Creating user via admin API:', normalizedEmail);
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false,
      user_metadata: {
        username: username || undefined,
        agreed_to_policy: true,
        agreed_at: new Date().toISOString(),
      },
    });

    if (createError) {
      console.error('[SIGNUP] admin.createUser error:', createError.message);

      if (createError.message.toLowerCase().includes('rate limit') || createError.message.toLowerCase().includes('too many')) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a minute and try again.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: 'Could not create your account. Please try again.' },
        { status: 500 }
      );
    }

    const userId = createData.user?.id;
    if (!userId) {
      console.error('[SIGNUP] admin.createUser returned no user ID');
      return NextResponse.json(
        { error: 'Account creation returned an unexpected result. Please try again.' },
        { status: 500 }
      );
    }

    // ── STEP 3: Send 6-digit OTP via signInWithOtp ─────────────────────────
    // This is the ONLY email sent. Supabase generates the code, stores it,
    // and emails it. The token type will be 'email'.
    console.log('[SIGNUP] Sending OTP via signInWithOtp:', normalizedEmail);
    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false, // User already exists — just send code
      },
    });

    if (otpError) {
      console.error('[SIGNUP] signInWithOtp error:', otpError.message);

      // If signInWithOtp fails, the user was created but no code was sent.
      // Try once more without shouldCreateUser flag.
      console.log('[SIGNUP] Retrying signInWithOtp without shouldCreateUser flag...');
      const { error: otpRetryError } = await anonClient.auth.signInWithOtp({
        email: normalizedEmail,
      });

      if (otpRetryError) {
        console.error('[SIGNUP] OTP retry also failed:', otpRetryError.message);
        // User is created but no email — they can use resend-otp later
        return NextResponse.json({
          success: true,
          message: 'Account created. Click "Resend" on the next page to get your verification code.',
          email: normalizedEmail,
          emailConfirmed: false,
        });
      }
    }

    // ── STEP 4: Create Prisma DB record ───────────────────────────────────
    // Await to prevent race condition — the DB record must exist before
    // the user tries to log in after OTP verification.
    await ensureDbUser(userId, normalizedEmail, null, password, username);

    console.log('[SIGNUP] Success — OTP sent to:', normalizedEmail);
    return NextResponse.json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email.',
      email: normalizedEmail,
      emailConfirmed: false,
    });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
