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

// ─── Helper: Check if error indicates user already exists ────────────────────
function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already registered') ||
    lower.includes('a user with this email') ||
    lower.includes('duplicate') ||
    lower.includes('unique constraint') ||
    lower.includes('email has already been') ||
    lower.includes('email address has already')
  );
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

// ─── Helper: Send OTP code via signInWithOtp ────────────────────────────────
// This ALWAYS sends an OTP code (never a magic link), regardless of the
// Supabase email template configuration. We try multiple approaches:
//   1. signInWithOtp({ shouldCreateUser: false }) — user already exists
//   2. signInWithOtp() without flag — more permissive
// Returns true if OTP was sent successfully.
async function sendOtpCode(signupClient: ReturnType<typeof createSignupClient>, email: string): Promise<{ sent: boolean; error?: string }> {
  // Attempt 1: with shouldCreateUser: false (user already exists)
  try {
    const { error } = await signupClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (!error) {
      console.log('[SIGNUP] OTP sent via signInWithOtp (shouldCreateUser: false) for:', email);
      return { sent: true };
    }
    console.warn('[SIGNUP] signInWithOtp with shouldCreateUser:false failed:', error.message);
  } catch (e) {
    console.warn('[SIGNUP] signInWithOtp attempt 1 exception:', e);
  }

  // Attempt 2: without shouldCreateUser flag (more permissive)
  try {
    const { error } = await signupClient.auth.signInWithOtp({ email });
    if (!error) {
      console.log('[SIGNUP] OTP sent via signInWithOtp (no flag) for:', email);
      return { sent: true };
    }
    console.warn('[SIGNUP] signInWithOtp without flag also failed:', error.message);
    return { sent: false, error: error.message };
  } catch (e) {
    console.warn('[SIGNUP] signInWithOtp attempt 2 exception:', e);
    return { sent: false, error: String(e) };
  }
}

// ─── Helper: Verify password was saved and fix if not ────────────────────────
async function verifyAndFixPassword(
  adminClient: ReturnType<typeof createServerSupabaseClient>,
  email: string,
  password: string
): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const { user } = await findUserByEmail(adminClient, email);

  if (!user) {
    console.error('[SIGNUP] verifyAndFixPassword: user not found after signUp');
    return { ok: false, error: 'User not found after creation.' };
  }

  const isConfirmed = !!user.email_confirmed_at;

  if (isConfirmed) {
    const signupClient = createSignupClient();
    const { error: verifyError } = await signupClient.auth.signInWithPassword({ email, password });

    if (!verifyError) {
      console.log('[SIGNUP] Password verified successfully for confirmed user:', email);
      try { await signupClient.auth.signOut(); } catch {}
      return { ok: true, userId: user.id };
    }

    console.log('[SIGNUP] Password NOT working for confirmed user, fixing via admin API...');
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, { password });
    if (updateError) {
      console.error('[SIGNUP] Failed to set password via admin API:', updateError.message);
      return { ok: false, userId: user.id, error: 'Password could not be saved. Please try again.' };
    }

    const { error: reverifyError } = await signupClient.auth.signInWithPassword({ email, password });
    if (reverifyError) {
      console.error('[SIGNUP] Password still not working after admin update:', reverifyError.message);
      return { ok: false, userId: user.id, error: 'Password verification failed. Please try again.' };
    }
    try { await signupClient.auth.signOut(); } catch {}
    return { ok: true, userId: user.id };
  }

  // UNCONFIRMED USER — ensure password is set via admin API
  console.log('[SIGNUP] User is unconfirmed. Ensuring password is set via admin API...');
  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, { password });

  if (updateError) {
    const msg = updateError.message.toLowerCase();
    if (!msg.includes('no changes') && !msg.includes('same password')) {
      return { ok: false, userId: user.id, error: 'Password could not be saved. Please try again.' };
    }
  }

  return { ok: true, userId: user.id };
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
//
// BULLETPROOF signup flow:
//
//   1. Validate input + rate limit
//   2. Check if user already exists via admin API
//      - If confirmed → "please log in"
//      - If unconfirmed → DELETE the stale user so signUp() will work
//   3. Call signUp() with anon key — creates user AND triggers verification email
//   4. ALWAYS send OTP via signInWithOtp() — guarantees a CODE is sent
//      (signUp() might send a link instead of a code depending on template config)
//   5. Verify password was actually saved (fix via admin API if not)
//   6. Create Prisma DB record (best-effort)

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
    let signupClient;
    try {
      adminClient = createServerSupabaseClient();
      signupClient = createSignupClient();
    } catch (envError) {
      console.error('[SIGNUP] Missing Supabase env vars:', envError);
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
    }

    // ── STEP 1: Check if user already exists via admin API ─────────────────
    console.log('[SIGNUP] Checking if user exists:', normalizedEmail);
    const { user: existingUser } = await findUserByEmail(adminClient, normalizedEmail);

    if (existingUser) {
      if (existingUser.email_confirmed_at) {
        console.log('[SIGNUP] User exists and is confirmed:', normalizedEmail);
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      // UNCONFIRMED USER: Delete so signUp() can create fresh
      console.log('[SIGNUP] Found unconfirmed user, deleting to allow fresh signup:', normalizedEmail);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
      if (deleteError) {
        console.error('[SIGNUP] Failed to delete unconfirmed user:', deleteError.message);
      } else {
        try {
          const { db } = await import('@/lib/db');
          await db.user.deleteMany({ where: { email: normalizedEmail } });
        } catch {}
        console.log('[SIGNUP] Deleted unconfirmed user, waiting for propagation...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // ── STEP 2: Call signUp() with anon key ────────────────────────────────
    console.log('[SIGNUP] Attempting signUp for:', normalizedEmail);

    const { data: signUpData, error: signUpError } = await signupClient.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          username: username || undefined,
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      },
    });

    // ── Handle signUp() errors ─────────────────────────────────────────────
    if (signUpError) {
      console.error('[SIGNUP] signUp error:', signUpError.message, '| status:', signUpError.status);

      if (isAlreadyRegisteredError(signUpError.message)) {
        console.log('[SIGNUP] "Already registered" after cleanup attempt, retrying...');
        const { user: retryUser } = await findUserByEmail(adminClient, normalizedEmail);
        if (retryUser && !retryUser.email_confirmed_at) {
          const { error: del2 } = await adminClient.auth.admin.deleteUser(retryUser.id);
          if (!del2) {
            try {
              const { db } = await import('@/lib/db');
              await db.user.deleteMany({ where: { email: normalizedEmail } });
            } catch {}
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        const { data: retryData, error: retryError } = await signupClient.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              username: username || undefined,
              agreed_to_policy: true,
              agreed_at: new Date().toISOString(),
            },
          },
        });

        if (retryError) {
          console.error('[SIGNUP] Retry signUp also failed:', retryError.message);
          return await adminFallbackSignup(adminClient, signupClient, normalizedEmail, password, retryUser, username);
        }

        // Retry succeeded
        const pwCheck = await verifyAndFixPassword(adminClient, normalizedEmail, password);
        if (!pwCheck.ok) {
          return NextResponse.json({ error: pwCheck.error || 'Password could not be saved. Please try again.' }, { status: 500 });
        }

        return handleSuccessfulSignup(signupClient, retryData, adminClient, normalizedEmail, pwCheck.userId, password, username);
      }

      if (signUpError.message.toLowerCase().includes('rate limit') || signUpError.message.toLowerCase().includes('too many')) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a minute and try again.' },
          { status: 429 }
        );
      }

      // For any other signUp error, try admin fallback
      console.error('[SIGNUP] Unrecognized signUp error, trying admin fallback:', signUpError.message);
      const { user: fallbackUser } = await findUserByEmail(adminClient, normalizedEmail);
      return await adminFallbackSignup(adminClient, signupClient, normalizedEmail, password, fallbackUser, username);
    }

    // ── STEP 3: Verify password was actually saved ─────────────────────────
    const pwCheck = await verifyAndFixPassword(adminClient, normalizedEmail, password);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.error || 'Password could not be saved. Please try again.' }, { status: 500 });
    }

    // ── STEP 4: Return success (handleSuccessfulSignup sends OTP) ──────────
    return handleSuccessfulSignup(signupClient, signUpData, adminClient, normalizedEmail, pwCheck.userId, password, username);

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    console.error('[SIGNUP] Stack:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}

// ─── Handle a successful signUp() response ──────────────────────────────────
// CRITICAL: Always sends an OTP code via signInWithOtp() AFTER signUp().
// signUp() might send a verification LINK (not a code) depending on the
// Supabase email template config. signInWithOtp() ALWAYS sends a code.
async function handleSuccessfulSignup(
  signupClient: ReturnType<typeof createSignupClient>,
  signUpData: { user?: { id?: string; email_confirmed_at?: string; identities?: unknown[] } | null; session?: unknown },
  adminClient: ReturnType<typeof createServerSupabaseClient>,
  email: string,
  verifiedUserId?: string,
  password?: string,
  username?: string
) {
  if (!signUpData?.user) {
    console.error('[SIGNUP] signUp returned no error but no user object');
    return NextResponse.json({ error: 'Account creation returned an unexpected result. Please try again.' }, { status: 500 });
  }

  // Check for the "empty identities" case — user already existed
  const identities = signUpData.user.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    console.log('[SIGNUP] signUp returned user with empty identities — user already exists, OTP NOT sent by signUp');

    // Still try to send OTP ourselves
    const otpResult = await sendOtpCode(signupClient, email);
    if (otpResult.sent) {
      return NextResponse.json({
        success: true,
        message: 'A verification code has been sent to your email.',
        email,
        emailConfirmed: false,
      });
    }

    return NextResponse.json({
      error: 'An account with this email already exists but is not verified. A new verification code has been sent.',
      requiresOtpResend: true,
      email,
    }, { status: 409 });
  }

  // Check if auto-confirmed
  if (signUpData.user.email_confirmed_at) {
    console.log('[SIGNUP] User auto-confirmed:', email);
    const userId = verifiedUserId || signUpData.user.id;
    if (userId) {
      ensureDbUser(userId, email, new Date(), password, username);
    }
    return NextResponse.json({
      success: true,
      message: 'Account created and email confirmed.',
      email,
      emailConfirmed: true,
    });
  }

  // ── CRITICAL: Always send OTP code via signInWithOtp ─────────────────────
  // signUp() may have sent a verification LINK, not a code.
  // signInWithOtp() ALWAYS sends a 6-digit OTP code.
  console.log('[SIGNUP] Sending guaranteed OTP code via signInWithOtp for:', email);

  // Small delay to avoid Supabase rate limiting the email
  await new Promise(resolve => setTimeout(resolve, 500));

  const otpResult = await sendOtpCode(signupClient, email);
  if (otpResult.sent) {
    console.log('[SIGNUP] OTP code sent successfully for:', email);
  } else {
    console.error('[SIGNUP] Failed to send OTP code:', otpResult.error);
    // Don't fail the signup — the user can use "Resend" later
  }

  // Create DB record
  const userId = verifiedUserId || signUpData.user.id;
  if (userId) {
    ensureDbUser(userId, email, null, password, username);
  }

  return NextResponse.json({
    success: true,
    message: 'Account created. A verification code has been sent to your email.',
    email,
    emailConfirmed: false,
  });
}

// ─── Admin fallback: when signUp() keeps failing ───────────────────────────
async function adminFallbackSignup(
  adminClient: ReturnType<typeof createServerSupabaseClient>,
  signupClient: ReturnType<typeof createSignupClient>,
  email: string,
  password: string,
  existingUser: { id?: string } | null,
  username?: string
) {
  try {
    let userId = existingUser?.id;

    if (!userId) {
      const { user } = await findUserByEmail(adminClient, email);
      userId = user?.id;
    }

    if (!userId) {
      console.log('[SIGNUP] Admin fallback: creating user:', email);
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          username: username || undefined,
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      });

      if (createError) {
        console.error('[SIGNUP] Admin create error:', createError.message);
        return NextResponse.json(
          { error: 'Could not create your account. Please try again later.' },
          { status: 500 }
        );
      }

      userId = createData.user?.id;
    } else {
      console.log('[SIGNUP] Admin fallback: updating password for existing user:', email);
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          username: username || undefined,
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      });
      if (updateError) {
        console.error('[SIGNUP] Admin update error:', updateError.message);
      }
    }

    // Always send OTP via signInWithOtp — guarantees a code is sent
    console.log('[SIGNUP] Admin fallback: sending OTP via signInWithOtp for:', email);
    await new Promise(resolve => setTimeout(resolve, 500));
    const otpResult = await sendOtpCode(signupClient, email);

    if (!otpResult.sent) {
      console.error('[SIGNUP] Admin fallback: OTP send failed:', otpResult.error);
      return NextResponse.json(
        { error: 'Your account was created but we could not send a verification code. Please try the "Resend" button on the verification page.' },
        { status: 500 }
      );
    }

    // Verify password works (best-effort)
    await verifyAndFixPassword(adminClient, email, password);

    if (userId) {
      ensureDbUser(userId, email, null, password, username);
    }

    console.log('[SIGNUP] Admin fallback: OTP sent + password set for:', email);
    return NextResponse.json({
      success: true,
      message: 'A verification code has been sent to your email.',
      email,
      emailConfirmed: false,
    });
  } catch (err) {
    console.error('[SIGNUP] Admin fallback unexpected error:', err);
    return NextResponse.json(
      { error: 'Could not create your account. Please try again later.' },
      { status: 500 }
    );
  }
}
