import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createHmac } from "crypto";
import { rateLimiter } from "@/lib/rate-limiter";

// SECURITY: This middleware requires the Node.js runtime because it uses:
// - Node.js 'crypto' module for HMAC cookie signing and anonymous ID generation
// - In-memory Map for rate limiting (with periodic cleanup via setInterval)
// The Edge Runtime does not support these Node.js APIs.
export const runtime = 'nodejs';

// ─── Rate Limiting Configuration ─────────────────────────────────────────────
// Uses the RateLimiter abstraction from @/lib/rate-limiter.
// Currently in-memory (single-instance). Set REDIS_URL to enable Redis store
// when deploying multiple instances (see src/lib/rate-limiter.ts).

// Rate limit configurations per endpoint type
// Anonymous users get LOWER limits; authenticated users get FULL limits
const RATE_LIMITS: Record<string, { windowMs: number; maxRequests: number; anonMaxRequests: number }> = {
  // AI chat: authenticated 20/min, anonymous 5/min (free tier)
  chat: { windowMs: 60_000, maxRequests: 20, anonMaxRequests: 5 },
  // Conversations: authenticated 60/min, anonymous 30/min
  conversations: { windowMs: 60_000, maxRequests: 60, anonMaxRequests: 30 },
  // Workspace: authenticated 30/min, anonymous 10/min
  workspace: { windowMs: 60_000, maxRequests: 30, anonMaxRequests: 10 },
  // Terminal: authenticated only — anonymous CANNOT access
  terminal: { windowMs: 60_000, maxRequests: 10, anonMaxRequests: 0 },
  // Auth signup: strict rate limit to prevent abuse
  signup: { windowMs: 15 * 60_000, maxRequests: 5, anonMaxRequests: 5 },
  // Auth OTP: moderate rate limit
  otp: { windowMs: 15 * 60_000, maxRequests: 10, anonMaxRequests: 10 },
  // Check-status: very strict to prevent email enumeration
  checkStatus: { windowMs: 15 * 60_000, maxRequests: 3, anonMaxRequests: 3 },
  // Default
  default: { windowMs: 60_000, maxRequests: 60, anonMaxRequests: 30 },
};

// ─── Free Tier Credits ───────────────────────────────────────────────────────
// Anonymous users get 5 free messages per session (stored in signed cookie)
const FREE_TIER_MAX = 5;
const FREE_TIER_COOKIE = "eesha-free-credits";

function getEndpointType(pathname: string): string {
  if (pathname.startsWith("/api/chat")) return "chat";
  if (pathname.startsWith("/api/conversations")) return "conversations";
  if (pathname.startsWith("/api/workspace")) return "workspace";
  if (pathname.startsWith("/api/terminal")) return "terminal";
  if (pathname.startsWith("/api/auth/signup")) return "signup";
  if (pathname.startsWith("/api/auth/verify-otp") || pathname.startsWith("/api/auth/resend-otp")) return "otp";
  if (pathname.startsWith("/api/auth/check-status")) return "checkStatus";
  return "default";
}

async function checkRateLimit(identifier: string, endpointType: string, isAnonymous: boolean): Promise<{ allowed: boolean; retryAfter?: number }> {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.default;
  const maxRequests = isAnonymous ? config.anonMaxRequests : config.maxRequests;

  // Terminal: anonymous users have 0 access
  if (isAnonymous && maxRequests === 0) {
    return { allowed: false, retryAfter: 60 };
  }

  const key = identifier + ":" + endpointType;
  const result = await rateLimiter.check(key, {
    windowMs: config.windowMs,
    maxRequests,
  });

  return {
    allowed: result.allowed,
    retryAfter: result.retryAfter,
  };
}

// ─── Signed Free Tier Cookie ─────────────────────────────────────────────────

function signCookieValue(value: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return value; // Fallback for dev
  const hmac = createHmac('sha256', secret);
  hmac.update(value);
  return `${value}.${hmac.digest('hex').slice(0, 16)}`;
}

function verifyCookieSignature(signed: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return signed; // Fallback for dev
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const hmac = createHmac('sha256', secret);
  hmac.update(value);
  const expected = hmac.digest('hex').slice(0, 16);
  if (sig !== expected) return null; // Signature mismatch — tampered cookie
  return value;
}

function getFreeCreditsUsed(request: NextRequest): number {
  const cookie = request.cookies.get(FREE_TIER_COOKIE)?.value;
  if (!cookie) return 0;
  try {
    const verifiedValue = verifyCookieSignature(cookie);
    if (!verifiedValue) return FREE_TIER_MAX; // Tampered cookie = max used
    const parsed = JSON.parse(verifiedValue);
    return Math.min(parsed.used || 0, FREE_TIER_MAX); // Cap at max
  } catch {
    return FREE_TIER_MAX; // Invalid cookie = treat as used up
  }
}

// ─── Security Headers ────────────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Note: 'unsafe-inline' and 'unsafe-eval' are needed for Next.js runtime.
      // TODO: Migrate to nonce-based CSP for production hardening.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://integrate.api.nvidia.com https://*.googleapis.com https://*.github.com",
      "frame-ancestors 'none'",
      // Block form submissions to external origins
      "form-action 'self'",
      // Block embedding of external resources
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ")
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return response;
}

// ─── Allowed Hosts ───────────────────────────────────────────────────────────
// SECURITY: Use env var for site URL, with fallback
const ALLOWED_HOSTS = [
  'localhost:3000',
  process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : 'fuhaddesmond-eesha-ai.hf.space',
].filter(Boolean);

// ─── Main Middleware ──────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip middleware for static files ──
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── CSRF Protection: Validate origin for ALL state-changing API requests ──
  const method = request.method;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // Block requests with a mismatched origin
    // Allow requests with no origin (same-origin, mobile apps, curl) for compatibility
    if (origin) {
      try {
        const originUrl = new URL(origin);
        // Build allowed hosts list dynamically: current host + configured hosts
        const dynamicAllowedHosts = [host, ...ALLOWED_HOSTS].filter(Boolean);

        if (!dynamicAllowedHosts.includes(originUrl.host)) {
          return NextResponse.json(
            { error: 'Invalid origin. Possible CSRF attack blocked.' },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid origin header.' },
          { status: 403 }
        );
      }
    }
  }

  // ── Always allow the home page ──
  if (pathname === "/") {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── NextAuth routes: pass through with security headers ──
  if (pathname.startsWith("/api/auth/[...nextauth]")) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── Auth routes (signup, verify-otp, resend-otp, check-status): apply rate limits ──
  if (pathname.startsWith("/api/auth/")) {
    const endpointType = getEndpointType(pathname);
    const ip = request.headers.get("x-forwarded-for") ||
               request.headers.get("x-real-ip") ||
               "unknown";

    // Apply rate limiting to auth routes
    const { allowed, retryAfter } = await checkRateLimit(ip, endpointType, true);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter || 60) } }
      );
    }

    // SECURITY: For check-status, return same response regardless of email existence
    // to prevent email enumeration. The route itself handles this.
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── Health endpoint: allow but minimal ──
  if (pathname === "/api/health" || pathname === "/api/auth/health") {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── Debug endpoint: block in production ──
  if (pathname === "/api/auth/debug-db" && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Setup endpoint: block in production ──
  if (pathname.startsWith("/api/setup/") && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Auth confirm route: allow ──
  if (pathname.startsWith("/auth/confirm")) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── Check if user is authenticated ──────────────────────────────────────
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!token;
  const isEmailVerified = isAuthenticated ? !!token.emailVerified : false;
  const userId = isAuthenticated ? (token.id as string) : getAnonymousId(request);

  // ── API Routes: apply auth checks and rate limits ──
  if (pathname.startsWith("/api/")) {
    const endpointType = getEndpointType(pathname);

    // Terminal: AUTHENTICATED + VERIFIED ONLY — never allow anonymous or unverified
    if (endpointType === "terminal" && !isAuthenticated) {
      return NextResponse.json(
        { error: "SIGN_IN_REQUIRED", message: "Terminal access requires sign-in. Please create a free account to continue." },
        { status: 401 }
      );
    }

    // Workspace: AUTHENTICATED + VERIFIED ONLY — block unverified email users
    if (endpointType === "workspace" && isAuthenticated && !isEmailVerified) {
      return NextResponse.json(
        { error: "EMAIL_NOT_VERIFIED", message: "Please verify your email to access this feature. Check your inbox for the verification code." },
        { status: 403 }
      );
    }

    // Terminal: Also block unverified email users
    if (endpointType === "terminal" && isAuthenticated && !isEmailVerified) {
      return NextResponse.json(
        { error: "EMAIL_NOT_VERIFIED", message: "Please verify your email to access the terminal. Check your inbox for the verification code." },
        { status: 403 }
      );
    }

    // Chat: check free tier credits for anonymous users
    if (endpointType === "chat" && !isAuthenticated) {
      const creditsUsed = getFreeCreditsUsed(request);
      if (creditsUsed >= FREE_TIER_MAX) {
        return NextResponse.json(
          {
            error: "FREE_LIMIT_REACHED",
            message: "You've used all " + FREE_TIER_MAX + " free messages. Sign in for unlimited access!",
            creditsUsed,
            creditsMax: FREE_TIER_MAX,
          },
          { status: 403 }
        );
      }
    }

    // Rate limiting
    const { allowed, retryAfter } = await checkRateLimit(userId, endpointType, !isAuthenticated);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please slow down." + (!isAuthenticated ? " Sign in for higher limits." : "") },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter || 60),
          },
        }
      );
    }

    // Add auth context to request headers for API routes
    const requestHeaders = new Headers(request.headers);
    if (isAuthenticated) {
      requestHeaders.set("x-user-id", userId);
      requestHeaders.set("x-user-email", (token.email as string) || "");
      requestHeaders.set("x-authenticated", "true");
    } else {
      requestHeaders.set("x-user-id", userId);
      requestHeaders.set("x-authenticated", "false");
    }

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    // For anonymous chat requests, update the signed free credits cookie
    if (endpointType === "chat" && !isAuthenticated) {
      const creditsUsed = getFreeCreditsUsed(request);
      const newCreditsUsed = creditsUsed + 1;
      const cookieValue = JSON.stringify({ used: newCreditsUsed });
      const signedValue = signCookieValue(cookieValue);
      response.cookies.set(FREE_TIER_COOKIE, signedValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
      });
    }

    return addSecurityHeaders(response);
  }

  // ── Page routes — always allow, add security headers ────────────────────
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

// ─── Generate anonymous ID from IP + User-Agent ──────────────────────────────
function getAnonymousId(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for") ||
             request.headers.get("x-real-ip") ||
             "unknown";
  const ua = request.headers.get("user-agent") || "unknown";

  // Use HMAC for a more secure fingerprint (harder to spoof)
  const secret = process.env.NEXTAUTH_SECRET || 'fallback-anon-secret';
  const hmac = createHmac('sha256', secret);
  hmac.update("anon:" + ip + ":" + ua);
  return "anon_" + hmac.digest('hex').slice(0, 16);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|logo|favicon).*)",
  ],
};
