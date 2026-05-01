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

// ─── Helper: Find user by email across all pages ─────────────────────────────
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

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// BULLETPROOF signup flow:
//
//   1. Validate input
//   2. Rate limit
//   3. Try signUp() with anon key — this is the primary path
//      - If it works → user created, OTP sent, done!
//      - If "already registered" → go to step 4
//   4. User already exists — check with admin API:
//      - If confirmed → "please log in"
//      - If unconfirmed → DELETE the broken user, then signUp() again
//   5. Create Prisma DB record (best-effort)
//
// Why delete + recreate instead of signInWithOtp()?
//   - signInWithOtp({ shouldCreateUser: false }) fails unpredictably
//     for admin-created or previously-failed unconfirmed users
//   - admin.updateUserById + signUp() also fails if user exists
//   - Deleting the unconfirmed user + calling signUp() fresh is the ONLY
//     approach that guarantees both user creation AND OTP delivery
//   - Unconfirmed users have no real data to lose

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

    // ── PRIMARY PATH: Try signUp() directly ────────────────────────────────
    // signUp() with the anon key creates the user AND sends the OTP email.
    // This works when the user doesn't exist yet — the common case.
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

    // ── signUp() succeeded ──────────────────────────────────────────────────
    if (!signUpError && signUpData?.user) {
      // Check if auto-confirmed (shouldn't happen with "Confirm email" enabled)
      if (signUpData.user.email_confirmed_at) {
        console.log('[SIGNUP] User auto-confirmed (unexpected):', normalizedEmail);
        try {
          const { db } = await import('@/lib/db');
          await db.user.upsert({
            where: { email: normalizedEmail },
            create: { id: signUpData.user.id, email: normalizedEmail, name: normalizedEmail.split('@')[0], emailVerified: new Date() },
            update: { emailVerified: new Date() },
          });
        } catch {}
        return NextResponse.json({ success: true, message: 'Account created and email confirmed.', email: normalizedEmail, emailConfirmed: true });
      }

      // Normal path: user created, OTP sent
      console.log('[SIGNUP] Success: user created + OTP sent for:', normalizedEmail);
      try {
        const { db } = await import('@/lib/db');
        await db.user.upsert({
          where: { email: normalizedEmail },
          create: { id: signUpData.user.id, email: normalizedEmail, name: normalizedEmail.split('@')[0], emailVerified: null },
          update: {},
        });
      } catch (dbError) {
        console.error('[SIGNUP] DB user creation failed (non-fatal):', dbError instanceof Error ? dbError.message : dbError);
      }

      return NextResponse.json({
        success: true,
        message: 'Account created. A verification code has been sent to your email.',
        email: normalizedEmail,
        emailConfirmed: false,
      });
    }

    // ── signUp() failed — check if it's "already registered" ────────────────
    if (signUpError) {
      const isAlreadyRegistered =
        signUpError.message.includes('already registered') ||
        signUpError.message.includes('already been registered') ||
        signUpError.message.includes('User already registered');

      if (!isAlreadyRegistered) {
        // Some other error — not "already registered"
        console.error('[SIGNUP] signUp error (not already-registered):', signUpError.message);
        return NextResponse.json({ error: 'Unable to create account. Please try again.' }, { status: 500 });
      }

      // ── "ALREADY REGISTERED" PATH ─────────────────────────────────────────
      // The user exists from a previous attempt. Check if confirmed or not.
      console.log('[SIGNUP] User already registered, checking status:', normalizedEmail);

      const { user: existingUser } = await findUserByEmail(adminClient, normalizedEmail);

      if (existingUser && existingUser.email_confirmed_at) {
        // User is confirmed — they should log in, not sign up
        console.log('[SIGNUP] User exists and is confirmed:', normalizedEmail);
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      // ── UNCONFIRMED USER: Delete + Recreate ───────────────────────────────
      // This user was created in a previous attempt but never verified.
      // Their account is broken — no data to lose.
      // Delete it and create fresh so signUp() can send a new OTP.
      if (existingUser) {
        console.log('[SIGNUP] Deleting unconfirmed user to recreate:', normalizedEmail, '(id:', existingUser.id, ')');

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
        if (deleteError) {
          console.error('[SIGNUP] Failed to delete unconfirmed user:', deleteError.message);
          return NextResponse.json(
            { error: 'Could not reset your previous signup attempt. Please try again.' },
            { status: 500 }
          );
        }

        // Clean up Prisma DB record too
        try {
          const { db } = await import('@/lib/db');
          await db.user.deleteMany({ where: { email: normalizedEmail } });
        } catch {}

        console.log('[SIGNUP] Deleted unconfirmed user, now creating fresh:', normalizedEmail);
      } else {
        // User not found by admin API but signUp says "already registered"
        // This can happen due to listUsers pagination or timing.
        // Try to find the user with a different approach.
        console.log('[SIGNUP] User not found in admin listUsers but signUp says already registered.');
        console.log('[SIGNUP] This may be a Supabase race condition. Retrying signUp...');
      }

      // ── RETRY signUp() after cleanup ──────────────────────────────────────
      // Wait a moment for Supabase to fully process the deletion
      await new Promise(resolve => setTimeout(resolve, 500));

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
        console.error('[SIGNUP] Retry signUp error:', retryError.message);

        // If STILL "already registered", the delete might not have propagated yet
        if (retryError.message.includes('already registered') || retryError.message.includes('already been registered')) {
          console.log('[SIGNUP] Still "already registered" after delete. Trying admin createUser + admin update...');
          // Last resort: create with admin (auto-confirms but we'll unconfirm),
          // then try sending OTP
          try {
            const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
              email: normalizedEmail,
              password,
              email_confirm: false,
              user_metadata: {
                agreed_to_policy: true,
                agreed_at: new Date().toISOString(),
              },
            });

            if (createError && !createError.message.includes('already registered')) {
              console.error('[SIGNUP] Admin create error:', createError.message);
              return NextResponse.json({ error: 'Unable to create account. Please try again later.' }, { status: 500 });
            }

            // If user already exists even via admin, try to send OTP via signInWithOtp
            const { error: otpError } = await signupClient.auth.signInWithOtp({
              email: normalizedEmail,
              options: { shouldCreateUser: false },
            });

            if (otpError) {
              console.error('[SIGNUP] signInWithOtp after admin create error:', otpError.message);
              return NextResponse.json(
                { error: 'Account exists but we could not send a verification code. Please try again in a few minutes.' },
                { status: 500 }
              );
            }

            // OTP was sent
            const userId = createData?.user?.id || existingUser?.id;
            if (userId) {
              try {
                const { db } = await import('@/lib/db');
                await db.user.upsert({
                  where: { email: normalizedEmail },
                  create: { id: userId, email: normalizedEmail, name: normalizedEmail.split('@')[0], emailVerified: null },
                  update: {},
                });
              } catch {}
            }

            console.log('[SIGNUP] OTP sent via fallback for:', normalizedEmail);
            return NextResponse.json({
              success: true,
              message: 'A verification code has been sent to your email.',
              email: normalizedEmail,
              emailConfirmed: false,
            });
          } catch (adminErr) {
            console.error('[SIGNUP] Admin fallback error:', adminErr);
            return NextResponse.json({ error: 'Unable to create account. Please try again later.' }, { status: 500 });
          }
        }

        return NextResponse.json({ error: 'Unable to create account. Please try again.' }, { status: 500 });
      }

      if (!retryData?.user) {
        console.error('[SIGNUP] Retry signUp returned no user');
        return NextResponse.json({ error: 'Unable to create account. Please try again.' }, { status: 500 });
      }

      // Retry succeeded!
      console.log('[SIGNUP] Retry signUp succeeded for:', normalizedEmail);

      try {
        const { db } = await import('@/lib/db');
        await db.user.upsert({
          where: { email: normalizedEmail },
          create: { id: retryData.user.id, email: normalizedEmail, name: normalizedEmail.split('@')[0], emailVerified: null },
          update: {},
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: 'A verification code has been sent to your email.',
        email: normalizedEmail,
        emailConfirmed: false,
      });
    }

    // ── signUp returned no error but also no user (shouldn't happen) ────────
    console.error('[SIGNUP] signUp returned no error and no user');
    return NextResponse.json({ error: 'Unable to create account. Please try again.' }, { status: 500 });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    console.error('[SIGNUP] Stack:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
