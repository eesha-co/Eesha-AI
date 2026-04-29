import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ─── Rate Limiting Configuration ─────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Rate limit configurations per endpoint type
const RATE_LIMITS: Record<string, { windowMs: number; maxRequests: number }> = {
  // AI chat: 20 requests per minute (expensive API calls)
  chat: { windowMs: 60_000, maxRequests: 20 },
  // Conversations: 60 requests per minute
  conversations: { windowMs: 60_000, maxRequests: 60 },
  // Workspace: 30 requests per minute (file operations)
  workspace: { windowMs: 60_000, maxRequests: 30 },
  // Terminal: 10 requests per minute (dangerous — shell commands)
  terminal: { windowMs: 60_000, maxRequests: 10 },
  // Default for any other route
  default: { windowMs: 60_000, maxRequests: 60 },
};

function getEndpointType(pathname: string): string {
  if (pathname.startsWith("/api/chat")) return "chat";
  if (pathname.startsWith("/api/conversations")) return "conversations";
  if (pathname.startsWith("/api/workspace")) return "workspace";
  if (pathname.startsWith("/api/terminal")) return "terminal";
  return "default";
}

function checkRateLimit(userId: string, endpointType: string): { allowed: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.default;
  const key = `${userId}:${endpointType}`;
  const now = Date.now();

  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limited
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime + 300_000) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000);

// ─── Security Headers ────────────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");
  // Prevent MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");
  // XSS protection (legacy browsers)
  response.headers.set("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Content Security Policy
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
  // Strict Transport Security (production only)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  // Permissions policy
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return response;
}

// ─── Main Middleware ──────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip auth for static files and NextAuth routes ──────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") // Static files
  ) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── Allow login page without auth ───────────────────────────────────────
  if (pathname === "/login" || pathname === "/api/health") {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ── Check authentication for all other routes ───────────────────────────
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Page routes redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Rate limiting for API routes ────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const userId = token.id as string;
    const endpointType = getEndpointType(pathname);
    const { allowed, retryAfter } = checkRateLimit(userId, endpointType);

    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please slow down." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter || 60),
            "X-RateLimit-Limit": String(RATE_LIMITS[endpointType]?.maxRequests || 60),
          },
        }
      );
    }

    // Add user ID to request headers for API routes to use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", userId);
    requestHeaders.set("x-user-email", (token.email as string) || "");

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    // Add rate limit info headers
    response.headers.set("X-RateLimit-Remaining", "check");
    return addSecurityHeaders(response);
  }

  // ── Page routes — just add security headers ─────────────────────────────
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - public folder files
     */
    "/((?!_next/static|_next/image|logo|favicon).*)",
  ],
};
