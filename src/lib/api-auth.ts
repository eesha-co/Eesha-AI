import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Get the authenticated user's ID from the server session.
 * Returns null if not authenticated.
 * Use this in API routes to enforce authentication.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return session.user.id;
  } catch {
    return null;
  }
}

/**
 * Require authentication — returns userId or throws a 401 response.
 * Use this at the start of API route handlers.
 */
export async function requireAuth(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

/**
 * Create a standardized unauthorized response
 */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Authentication required. Please sign in." }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Create a standardized forbidden response
 */
export function forbiddenResponse(message?: string): Response {
  return new Response(
    JSON.stringify({ error: message || "You do not have permission to perform this action." }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Create a standardized rate limit response
 */
export function rateLimitResponse(retryAfter?: number): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter || 60),
      },
    }
  );
}

/**
 * Validate that a resource belongs to the authenticated user.
 * Throws a 403 response if ownership check fails.
 */
export function validateOwnership(resourceUserId: string, authenticatedUserId: string): boolean {
  return resourceUserId === authenticatedUserId;
}
