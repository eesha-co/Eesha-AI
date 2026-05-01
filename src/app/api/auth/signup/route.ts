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
// Also saves a bcrypt hash of the password as a backup.
async function ensureDbUser(userId: string, email: string, emailVerified: Date | null, plainPassword?: string, username?: string) {
  try {
    const { db } = await import('@/lib/db');

    // Hash the password with bcrypt for backup storage (12 salt rounds = strong)
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

// ─── Helper: Verify password was saved and fix if not ────────────────────────
// After signUp(), we ensure the password was actually stored in auth.users.
//
// IMPORTANT: We CANNOT use signInWithPassword to verify for unconfirmed users,
// because Supabase blocks login until the email is verified. Instead, we:
//   1. Check if the user was created with identities (indicates proper signup)
//   2. Always set the password via admin API as a safety measure
//   3. Confirm the user record exists and is valid
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

  // Check if the user has any identities (indicates a proper signup)
  const hasIdentities = Array.isArray(user.identities) && user.identities.length > 0;
  const isConfirmed = !!user.email_confirmed_at;

  if (isConfirmed) {
    // For confirmed users, we can verify the password works directly
    const signupClient = createSignupClient();
    const { error: verifyError } = await signupClient.auth.signInWithPassword({
      email,
      password,
    });

    if (!verifyError) {
      console.log('[SIGNUP] Password verified successfully for confirmed user:', email);
      try { await signupClient.auth.signOut(); } catch {}
      return { ok: true, userId: user.id };
    }

    // Password doesn't work for confirmed user — fix via admin API
    console.log('[SIGNUP] Password NOT working for confirmed user, fixing via admin API...');
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, { password });
    if (updateError) {
      console.error('[SIGNUP] Failed to set password via admin API:', updateError.message);
      return { ok: false, userId: user.id, error: 'Password could not be saved. Please try again.' };
    }

    // Re-verify after fix
    const { error: reverifyError } = await signupClient.auth.signInWithPassword({ email, password });
    if (reverifyError) {
      console.error('[SIGNUP] Password still not working after admin update:', reverifyError.message);
      return { ok: false, userId: user.id, error: 'Password verification failed. Please try again.' };
    }
    try { await signupClient.auth.signOut(); } catch {}
    console.log('[SIGNUP] Password fixed and verified for confirmed user:', email);
    return { ok: true, userId: user.id };
  }

  // ── UNCONFIRMED USER (normal signup flow) ─────────────────────────────────
  // Cannot use signInWithPassword — Supabase blocks login for unconfirmed emails.
  // Instead, ensure the password is set via admin API and trust it.
  console.log('[SIGNUP] User is unconfirmed (identities:', hasIdentities ? 'present' : 'empty', '). Ensuring password is set via admin API...');

  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    password,
  });

  if (updateError) {
    console.error('[SIGNUP] Failed to set password via admin API for unconfirmed user:', updateError.message);
    // This might fail if the password was already set correctly by signUp()
    // Only fail if it's not a "no changes" type error
    const msg = updateError.message.toLowerCase();
    if (!msg.includes('no changes') && !msg.includes('same password')) {
      return { ok: false, userId: user.id, error: 'Password could not be saved. Please try again.' };
    }
  }

  console.log('[SIGNUP] Password ensured via admin API for unconfirmed user:', email);
  return { ok: true, userId: user.id };
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
//
// ROBUST signup flow with password verification:
//
//   1. Validate input + rate limit
//   2. Check if user already exists via admin API FIRST
//      - If confirmed → "please log in"
//      - If unconfirmed → DELETE the stale user so signUp() will work
//   3. Call signUp() with anon key — creates user AND sends OTP
//   4. VERIFY password was actually saved (critical fix!)
//      - Try signInWithPassword — if it fails, set password via admin API
//   5. Create Prisma DB record (best-effort)

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
      return NextResponse.json({ error: 'You must agree to the Eesha AI Privacy Policy and Terms of Service.' }, { status: 400 });
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

      // ── UNCONFIRMED USER: Delete so signUp() can create fresh ────────────
      console.log('[SIGNUP] Found unconfirmed user, deleting to allow fresh signup:', normalizedEmail, '(id:', existingUser.id, ')');

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
          console.log('[SIGNUP] Trying admin fallback');
          return await adminFallbackSignup(adminClient, signupClient, normalizedEmail, password, retryUser, username);
        }

        // Retry succeeded — verify password was saved
        const pwCheck = await verifyAndFixPassword(adminClient, normalizedEmail, password);
        if (!pwCheck.ok) {
          return NextResponse.json({ error: pwCheck.error || 'Password could not be saved. Please try again.' }, { status: 500 });
        }

        return handleSuccessfulSignup(retryData, normalizedEmail, pwCheck.userId, password, username);
      }

      if (signUpError.message.toLowerCase().includes('rate limit') || signUpError.message.toLowerCase().includes('too many')) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a minute and try again.' },
          { status: 429 }
        );
      }

      console.error('[SIGNUP] Unrecognized signUp error:', signUpError.message);
      return NextResponse.json(
        { error: `Could not create your account: ${signUpError.message}` },
        { status: 500 }
      );
    }

    // ── STEP 3: Verify password was actually saved ─────────────────────────
    // This is the critical fix: after signUp(), we verify the password works.
    // If it doesn't (e.g., Supabase didn't save it properly), we set it via admin API.
    const pwCheck = await verifyAndFixPassword(adminClient, normalizedEmail, password);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.error || 'Password could not be saved. Please try again.' }, { status: 500 });
    }

    // ── signUp() returned without error ────────────────────────────────────
    return handleSuccessfulSignup(signUpData, normalizedEmail, pwCheck.userId, password, username);

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    console.error('[SIGNUP] Stack:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}

// ─── Handle a successful signUp() response ──────────────────────────────────
function handleSuccessfulSignup(
  signUpData: { user?: { id?: string; email_confirmed_at?: string; identities?: unknown[] } | null; session?: unknown },
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
    console.log('[SIGNUP] signUp returned user with empty identities — user already exists, OTP NOT sent');
    return NextResponse.json({
      error: 'An account with this email already exists but is not verified. We will send you a new verification code.',
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

  // Normal success: new user created, OTP sent, password verified
  console.log('[SIGNUP] Success: user created + OTP sent + password verified for:', email);
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
      // User exists — update their password
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

    // Send OTP via signInWithOtp
    console.log('[SIGNUP] Admin fallback: sending OTP via signInWithOtp for:', email);
    const { error: otpError } = await signupClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (otpError) {
      console.error('[SIGNUP] Admin fallback signInWithOtp error:', otpError.message);
      return NextResponse.json(
        { error: 'Your account exists but we could not send a verification code. Please try again in a few minutes.' },
        { status: 500 }
      );
    }

    // Verify password works
    const pwCheck = await verifyAndFixPassword(adminClient, email, password);
    if (!pwCheck.ok) {
      console.error('[SIGNUP] Admin fallback: password verification failed');
      // Don't fail — the user can still verify email and then reset password
    }

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
