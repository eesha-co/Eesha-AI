import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ─── Rate Limiting Configuration ─────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX_ENTRIES = 10000; // Prevent unbounded memory growth

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
  // Default
  default: { windowMs: 60_000, maxRequests: 60, anonMaxRequests: 30 },
};

// ─── Free Tier Credits ───────────────────────────────────────────────────────
// Anonymous users get 5 free messages per session (stored in cookie)
const FREE_TIER_MAX = 5;
const FREE_TIER_COOKIE = "eesha-free-credits";

function getEndpointType(pathname: string): string {
  if (pathname.startsWith("/api/chat")) return "chat";
  if (pathname.startsWith("/api/conversations")) return "conversations";
  if (pathname.startsWith("/api/workspace")) return "workspace";
  if (pathname.startsWith("/api/terminal")) return "terminal";
  return "default";
}

function checkRateLimit(identifier: string, endpointType: string, isAnonymous: boolean): { allowed: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.default;
  const maxRequests = isAnonymous ? config.anonMaxRequests : config.maxRequests;

  // Terminal: anonymous users have 0 access
  if (isAnonymous && maxRequests === 0) {
    return { allowed: false, retryAfter: 60 };
  }

  const key = identifier + ":" + endpointType;
  const now = Date.now();

  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    // Prevent memory leak: evict oldest entries if map is too large
    if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = rateLimitMap.keys().next().value;
      if (oldestKey) rateLimitMap.delete(oldestKey);
    }
    rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

function getFreeCreditsUsed(request: NextRequest): number {
  const cookie = request.cookies.get(FREE_TIER_COOKIE)?.value;
  if (!cookie) return 0;
  try {
    const parsed = JSON.parse(cookie);
    return parsed.used || 0;
  } catch {
    return 0;
  }
}

// Clean up old rate limit entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime + 300_000) {
        rateLimitMap.delete(key);
      }
    }
  }, 300_000);
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://integrate.api.nvidia.com https://*.googleapis.com https://*.github.com",
      "frame-ancestors 'none'",
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

// ─── Main Middleware ──────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip middleware for static files, NextAuth routes, and auth confirm ─
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── CSRF Protection: Validate origin for state-changing requests ────
  const method = request.method;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // Allow requests with no origin (same-origin, mobile apps, curl)
    // But block requests with a mismatched origin
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const allowedHosts = [
          host, // Current host
          'localhost:3000',
          'fuhaddesmond-eesha-ai.hf.space',
        ].filter(Boolean);

        if (!allowedHosts.includes(originUrl.host)) {
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

  // ── Always allow the home page and auth routes ────────────────────────
  // This is the "free chat first" model — anyone can visit the site
  // Auth is handled via MODAL, not a separate login page
  if (pathname === "/" || pathname.startsWith("/api/auth") || pathname === "/api/health") {
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

  // ── API Routes: allow anonymous access with stricter limits ─────────────
  if (pathname.startsWith("/api/")) {
    // Skip auth checks for auth-related routes (signup, verify, resend)
    if (pathname.startsWith("/api/auth/signup") ||
        pathname.startsWith("/api/auth/verify-otp") ||
        pathname.startsWith("/api/auth/resend-otp")) {
      const response = NextResponse.next();
      return addSecurityHeaders(response);
    }

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
    const { allowed, retryAfter } = checkRateLimit(userId, endpointType, !isAuthenticated);
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

    // For anonymous chat requests, update the free credits cookie
    if (endpointType === "chat" && !isAuthenticated) {
      const creditsUsed = getFreeCreditsUsed(request);
      const newCreditsUsed = creditsUsed + 1;
      response.cookies.set(FREE_TIER_COOKIE, JSON.stringify({ used: newCreditsUsed }), {
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

// ─── Generate anonymous ID from IP + User-Agent fingerprint ──────────────────
function getAnonymousId(request: NextRequest): string {
  // Use a combination of IP and user agent as anonymous identifier
  // This prevents simple abuse while not requiring login
  const ip = request.headers.get("x-forwarded-for") ||
             request.headers.get("x-real-ip") ||
             "unknown";
  const ua = request.headers.get("user-agent") || "unknown";

  // Simple hash for consistent ID (not cryptographically secure, just for rate limiting)
  let hash = 0;
  const str = "anon:" + ip + ":" + ua;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return "anon_" + Math.abs(hash).toString(36);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|logo|favicon).*)",
  ],
};
