/**
 * Ensure required Supabase tables exist.
 * This script is used as a fallback when Prisma's `db push` fails
 * (e.g., on HF Spaces where direct PostgreSQL connections are IPv6-only).
 *
 * Uses the Supabase REST API (HTTPS) which works on all networks.
 *
 * Run: node scripts/ensure-tables.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.log('[ENSURE-TABLES] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — skipping table creation.');
  process.exit(0);
}

async function tableExists(tableName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  return res.ok;
}

async function runSQL(sql) {
  // Use Supabase REST API's RPC endpoint if available
  // Otherwise, we rely on the tables already existing from Prisma migration
  console.log(`[ENSURE-TABLES] SQL to run:\n${sql}\n`);
  console.log('[ENSURE-TABLES] Note: Auto-creating tables via REST API is not supported.');
  console.log('[ENSURE-TABLES] Tables should be created by Prisma db push or manually in Supabase SQL Editor.');
}

async function main() {
  console.log('[ENSURE-TABLES] Checking required tables...');

  // Check conversations table
  const convExists = await tableExists('conversations');
  if (convExists) {
    console.log('[ENSURE-TABLES] ✓ conversations table exists');
  } else {
    console.log('[ENSURE-TABLES] ✗ conversations table NOT found');
    console.log('[ENSURE-TABLES] Please run the following SQL in Supabase SQL Editor:');
    console.log(`
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "title" TEXT NOT NULL DEFAULT 'New Chat',
  "chat_mode" TEXT NOT NULL DEFAULT 'code',
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "conversations_userId_idx" ON "conversations"("userId");
    `);
  }

  // Check messages table
  const msgExists = await tableExists('messages');
  if (msgExists) {
    console.log('[ENSURE-TABLES] ✓ messages table exists');
  } else {
    console.log('[ENSURE-TABLES] ✗ messages table NOT found');
    console.log('[ENSURE-TABLES] Please run the following SQL in Supabase SQL Editor:');
    console.log(`
CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "thinking" TEXT,
  "conversationId" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "messages_conversationId_idx" ON "messages"("conversationId");
    `);
  }

  // Check api_usage table
  const usageExists = await tableExists('api_usage');
  if (usageExists) {
    console.log('[ENSURE-TABLES] ✓ api_usage table exists');
  } else {
    console.log('[ENSURE-TABLES] ✗ api_usage table NOT found');
    console.log('[ENSURE-TABLES] Please run the following SQL in Supabase SQL Editor:');
    console.log(`
CREATE TABLE IF NOT EXISTS "api_usage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL,
  "model" TEXT,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "api_usage_userId_createdAt_idx" ON "api_usage"("userId", "createdAt");
    `);
  }

  // Enable RLS on all tables (security)
  console.log('\n[ENSURE-TABLES] IMPORTANT: Enable Row Level Security on all tables:');
  console.log('ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;');
  console.log('ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;');
  console.log('ALTER TABLE "api_usage" ENABLE ROW LEVEL SECURITY;');
  console.log('\n[ENSURE-TABLES] Note: RLS is bypassed by the service key used in server-side code.');
  console.log('[ENSURE-TABLES] The server-side code enforces ownership checks manually.');
}

main().catch((err) => {
  console.error('[ENSURE-TABLES] Error:', err.message);
  process.exit(1);
});
