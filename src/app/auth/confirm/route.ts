import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * GET /auth/confirm
 *
 * Handles the email verification callback from Supabase.
 * When a user clicks the verification link in their email,
 * Supabase redirects them here with token_hash and type params.
 *
 * Flow:
 *   1. Extract token_hash and type from URL params
 *   2. Verify the OTP with Supabase (server-side)
 *   3. Update our Prisma DB to mark email as verified
 *   4. Redirect to the homepage with a success indicator
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // If no token, redirect to homepage with error
  if (!tokenHash || !type) {
    console.error('[AUTH-CONFIRM] Missing token_hash or type params');
    return NextResponse.redirect(
      new URL('/?verification=error&reason=missing_token', request.url)
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    // Verify the OTP token server-side
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'email_change' | 'recovery',
    });

    if (error) {
      console.error('[AUTH-CONFIRM] OTP verification error:', error.message);

      // Token expired
      if (error.message.includes('expired') || error.message.includes('Token has expired')) {
        return NextResponse.redirect(
          new URL('/?verification=expired', request.url)
        );
      }

      // Invalid token
      return NextResponse.redirect(
        new URL('/?verification=error&reason=invalid_token', request.url)
      );
    }

    // ── Update our Prisma DB to mark email as verified ──────────────────
    if (data.user) {
      try {
        const { db } = await import('@/lib/db');
        await db.user.update({
          where: { id: data.user.id },
          data: { emailVerified: new Date() },
        });
        console.log('[AUTH-CONFIRM] Email verified for:', data.user.email);
      } catch (dbError) {
        console.error('[AUTH-CONFIRM] DB update failed (non-fatal):', dbError);
        // Non-fatal — Supabase Auth is the source of truth
      }
    }

    // ── Redirect to homepage with success indicator ─────────────────────
    return NextResponse.redirect(
      new URL('/?verification=success', request.url)
    );

  } catch (error) {
    console.error('[AUTH-CONFIRM] Unexpected error:', error);
    return NextResponse.redirect(
      new URL('/?verification=error&reason=server_error', request.url)
    );
  }
}
