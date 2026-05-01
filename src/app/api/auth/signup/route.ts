import { NextRequest, NextResponse } from 'next/server';
import { createSignupClient, createServerSupabaseClient } from '@/lib/supabase-server';

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
async function ensureDbUser(userId: string, email: string, emailVerified: Date | null) {
  try {
    const { db } = await import('@/lib/db');
    await db.user.upsert({
      where: { email },
      create: { id: userId, email, name: email.split('@')[0], emailVerified },
      update: emailVerified ? { emailVerified } : {},
    });
  } catch (dbError) {
    console.error('[SIGNUP] DB user creation failed (non-fatal):', dbError instanceof Error ? dbError.message : dbError);
  }
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
//
// ROBUST signup flow:
//
//   1. Validate input + rate limit
//   2. Check if user already exists via admin API FIRST
//      - If confirmed → "please log in"
//      - If unconfirmed → DELETE the stale user so signUp() will work
//   3. Call signUp() with anon key — creates user AND sends OTP
//   4. Handle all edge cases:
//      - signUp() success with identities → brand new user, OTP sent
//      - signUp() success with empty identities → user existed, OTP NOT sent
//      - signUp() error "already registered" → missed in step 2, retry after cleanup
//      - signUp() other error → return meaningful error
//   5. Create Prisma DB record (best-effort)
//
// Why check admin API first before signUp()?
//   - signUp() for an existing unconfirmed user silently returns the user
//     with empty `identities` and does NOT send an OTP
//   - By checking and cleaning up first, we ensure signUp() always hits
//     the "new user" path which reliably sends the OTP email

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, agreedToPolicy } = body;

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
    // Doing this BEFORE signUp() is critical because:
    // - signUp() for an existing unconfirmed user returns the user with
    //   empty identities[] and does NOT send an OTP
    // - We need to detect and clean up stale users before calling signUp()
    console.log('[SIGNUP] Checking if user exists:', normalizedEmail);

    const { user: existingUser } = await findUserByEmail(adminClient, normalizedEmail);

    if (existingUser) {
      if (existingUser.email_confirmed_at) {
        // User is confirmed — they should log in, not sign up
        console.log('[SIGNUP] User exists and is confirmed:', normalizedEmail);
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      // ── UNCONFIRMED USER: Delete so signUp() can create fresh ────────────
      // This user was created in a previous attempt but never verified.
      // Unconfirmed users have no real data to lose.
      console.log('[SIGNUP] Found unconfirmed user, deleting to allow fresh signup:', normalizedEmail, '(id:', existingUser.id, ')');

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
      if (deleteError) {
        console.error('[SIGNUP] Failed to delete unconfirmed user:', deleteError.message);
        // Don't fail — try signUp() anyway, it might work
      } else {
        // Clean up Prisma DB record too
        try {
          const { db } = await import('@/lib/db');
          await db.user.deleteMany({ where: { email: normalizedEmail } });
        } catch {}

        // Wait for Supabase to process the deletion
        console.log('[SIGNUP] Deleted unconfirmed user, waiting for propagation...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // ── STEP 2: Call signUp() with anon key ────────────────────────────────
    // Now that any stale unconfirmed user is cleaned up, this should work.
    console.log('[SIGNUP] Attempting signUp for:', normalizedEmail);

    const { data: signUpData, error: signUpError } = await signupClient.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      },
    });

    // ── Handle signUp() errors ─────────────────────────────────────────────
    if (signUpError) {
      console.error('[SIGNUP] signUp error:', signUpError.message, '| status:', signUpError.status);

      // Check if it's an "already registered" error
      if (isAlreadyRegisteredError(signUpError.message)) {
        // We already tried to clean up in Step 1, but it might have failed
        // or the deletion hasn't propagated yet.
        // Try one more time: find + delete + retry signUp
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

        // Retry signUp after second cleanup
        const { data: retryData, error: retryError } = await signupClient.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              agreed_to_policy: true,
              agreed_at: new Date().toISOString(),
            },
          },
        });

        if (retryError) {
          console.error('[SIGNUP] Retry signUp also failed:', retryError.message);

          // Last resort: use admin to create + send OTP via signInWithOtp
          console.log('[SIGNUP] Trying admin fallback: update existing user + send OTP');
          return await adminFallbackSignup(adminClient, signupClient, normalizedEmail, password, retryUser);
        }

        // Retry succeeded
        return handleSuccessfulSignup(retryData, normalizedEmail);
      }

      // Rate limit error
      if (signUpError.message.toLowerCase().includes('rate limit') || signUpError.message.toLowerCase().includes('too many')) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a minute and try again.' },
          { status: 429 }
        );
      }

      // Other error — return the actual message so we can debug
      console.error('[SIGNUP] Unrecognized signUp error:', signUpError.message);
      return NextResponse.json(
        { error: `Could not create your account: ${signUpError.message}` },
        { status: 500 }
      );
    }

    // ── signUp() returned without error ────────────────────────────────────
    return handleSuccessfulSignup(signUpData, normalizedEmail);

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    console.error('[SIGNUP] Stack:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}

// ─── Handle a successful signUp() response ──────────────────────────────────
// Supabase signUp() can return different things:
// 1. { user: { id, ... }, session: null } — new unconfirmed user, OTP sent
// 2. { user: { id, ... }, session: { ... } } — auto-confirmed (shouldn't happen with "Confirm email" on)
// 3. { user: { id, identities: [] }, session: null } — user ALREADY EXISTS, OTP NOT sent
//    This is the tricky case: Supabase returns the user but with empty identities
//    to avoid revealing whether the email is registered. No OTP is sent.
function handleSuccessfulSignup(
  signUpData: { user?: { id?: string; email_confirmed_at?: string; identities?: unknown[] } | null; session?: unknown },
  email: string
) {
  if (!signUpData?.user) {
    // This shouldn't happen but handle it
    console.error('[SIGNUP] signUp returned no error but no user object');
    return NextResponse.json({ error: 'Account creation returned an unexpected result. Please try again.' }, { status: 500 });
  }

  // Check for the "empty identities" case — user already existed
  // Supabase returns { user: { id, identities: [] }, session: null } when the
  // user already exists but is unconfirmed. No OTP was sent.
  const identities = signUpData.user.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    console.log('[SIGNUP] signUp returned user with empty identities — user already exists, OTP NOT sent');
    // We need to handle this: the user exists but no OTP was sent
    // Return a specific error so the frontend knows to try a different approach
    return NextResponse.json({
      error: 'An account with this email already exists but is not verified. We will send you a new verification code.',
      requiresOtpResend: true,
      email,
    }, { status: 409 });
  }

  // Check if auto-confirmed (shouldn't happen with "Confirm email" enabled)
  if (signUpData.user.email_confirmed_at) {
    console.log('[SIGNUP] User auto-confirmed (unexpected):', email);
    if (signUpData.user.id) {
      ensureDbUser(signUpData.user.id, email, new Date());
    }
    return NextResponse.json({
      success: true,
      message: 'Account created and email confirmed.',
      email,
      emailConfirmed: true,
    });
  }

  // Normal success: new user created, OTP sent
  console.log('[SIGNUP] Success: user created + OTP sent for:', email);
  if (signUpData.user.id) {
    ensureDbUser(signUpData.user.id, email, null);
  }

  return NextResponse.json({
    success: true,
    message: 'Account created. A verification code has been sent to your email.',
    email,
    emailConfirmed: false,
  });
}

// ─── Admin fallback: when signUp() keeps failing ───────────────────────────
// This handles the edge case where the user exists in Supabase but we can't
// delete them (e.g., they're stuck in some weird state).
// Strategy: Update the user's password with admin API, then send OTP.
async function adminFallbackSignup(
  adminClient: ReturnType<typeof createServerSupabaseClient>,
  signupClient: ReturnType<typeof createSignupClient>,
  email: string,
  password: string,
  existingUser: { id?: string } | null
) {
  try {
    let userId = existingUser?.id;

    // If no existing user found, try to find them again
    if (!userId) {
      const { user } = await findUserByEmail(adminClient, email);
      userId = user?.id;
    }

    if (!userId) {
      // User truly doesn't exist — create with admin
      console.log('[SIGNUP] Admin fallback: creating user:', email);
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
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
          agreed_to_policy: true,
          agreed_at: new Date().toISOString(),
        },
      });
      if (updateError) {
        console.error('[SIGNUP] Admin update error:', updateError.message);
        // Continue anyway — we just need to send OTP
      }
    }

    // Now send OTP via signInWithOtp
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

    // OTP was sent!
    if (userId) {
      ensureDbUser(userId, email, null);
    }

    console.log('[SIGNUP] Admin fallback: OTP sent for:', email);
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
