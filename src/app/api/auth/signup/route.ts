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

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
//
// Standard Supabase signUp() flow:
//
//   1. Validate input + rate limit
//   2. Call signUp({ email, password }) with the anon key client
//      → Supabase creates the user AND sends a verification email
//      → If "Confirm signup" template uses {{ .Token }}, the email contains a 6-digit code
//      → If "Confirm signup" template uses {{ .ConfirmationURL }}, the email contains a link
//   3. Create Prisma DB record with bcrypt hash as backup
//
// This is the simplest, most reliable approach. One call does everything.

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

    // ── Get Supabase anon key client ────────────────────────────────────────
    let signupClient;
    try {
      signupClient = createSignupClient();
    } catch (envError) {
      console.error('[SIGNUP] Missing Supabase env vars:', envError);
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
    }

    // ── STEP 1: Call signUp() — creates user AND sends verification email ──
    // This is the standard Supabase flow. One call does everything.
    // The Supabase Dashboard "Confirm signup" email template determines whether
    // the email contains a code ({{ .Token }}) or a link ({{ .ConfirmationURL }}).
    console.log('[SIGNUP] Calling signUp for:', normalizedEmail);
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

    if (signUpError) {
      console.error('[SIGNUP] signUp error:', signUpError.message, '| status:', signUpError.status);

      const msg = signUpError.message.toLowerCase();

      // User already exists
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in instead.' },
          { status: 409 }
        );
      }

      // Rate limit
      if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('request rate limit')) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a minute and try again.' },
          { status: 429 }
        );
      }

      // Email sending failure
      if (msg.includes('email') && (msg.includes('send') || msg.includes('smtp'))) {
        return NextResponse.json(
          { error: 'Could not send verification email. Please try again in a few minutes.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: 'Could not create your account. Please try again.' },
        { status: 500 }
      );
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      console.error('[SIGNUP] signUp returned no user ID');
      return NextResponse.json(
        { error: 'Account creation returned an unexpected result. Please try again.' },
        { status: 500 }
      );
    }

    // ── STEP 2: Create Prisma DB record ───────────────────────────────────
    // Save the bcrypt hash as a backup for the login fallback in auth.ts.
    try {
      const { db } = await import('@/lib/db');
      const passwordHash = await bcrypt.hash(password, 12);

      await db.user.upsert({
        where: { email: normalizedEmail },
        create: {
          id: userId,
          email: normalizedEmail,
          name: username || normalizedEmail.split('@')[0],
          emailVerified: null,
          passwordHash,
        },
        update: {
          passwordHash,
        },
      });
      console.log('[SIGNUP] DB record created for:', normalizedEmail);
    } catch (dbError) {
      console.error('[SIGNUP] DB user creation failed (non-fatal):', dbError instanceof Error ? dbError.message : dbError);
    }

    // ── Check if email was auto-confirmed (shouldn't happen with proper config) ──
    const emailConfirmed = !!signUpData.user?.email_confirmed_at;
    if (emailConfirmed) {
      console.log('[SIGNUP] Email auto-confirmed (unexpected):', normalizedEmail);
    }

    console.log('[SIGNUP] Success — verification email sent to:', normalizedEmail);
    return NextResponse.json({
      success: true,
      message: 'A verification code has been sent to your email.',
      email: normalizedEmail,
      emailConfirmed,
    });

  } catch (error) {
    console.error('[SIGNUP] Unexpected error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
