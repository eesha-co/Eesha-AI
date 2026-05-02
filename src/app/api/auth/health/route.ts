import { NextResponse } from 'next/server';

/**
 * Health check for auth configuration.
 * Returns which env vars are set (without revealing values).
 * Useful for debugging signup/login failures.
 */
export async function GET() {
  const config = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    GITHUB_ID: !!process.env.GITHUB_ID,
    GITHUB_SECRET: !!process.env.GITHUB_SECRET,
    AGENT1_API_KEY: !!process.env.AGENT1_API_KEY,
    AGENT2_API_KEY: !!process.env.AGENT2_API_KEY,
    AGENT3_API_KEY: !!process.env.AGENT3_API_KEY,
  };

  const allRequired = config.DATABASE_URL && config.NEXTAUTH_SECRET;

  // Test database connection via Prisma
  let dbStatus = 'unknown';
  try {
    const { db } = await import('@/lib/db');
    // Simple query to test DB connection
    await db.user.count();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = `connection_failed: ${e instanceof Error ? e.message : 'unknown'}`;
  }

  return NextResponse.json({
    status: allRequired ? 'ok' : 'misconfigured',
    config,
    database: dbStatus,
    authType: 'custom-bcrypt',
    timestamp: new Date().toISOString(),
  });
}
