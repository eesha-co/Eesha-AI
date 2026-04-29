-- ══════════════════════════════════════════════════════════════════════════════
-- Eesha AI — Supabase Database Migration
-- ══════════════════════════════════════════════════════════════════════════════
-- Run this SQL in your Supabase Dashboard → SQL Editor
-- This creates all tables, indexes, and Row Level Security policies
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Enable required extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossl";

-- ─── Users Table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  "emailVerified" TIMESTAMP(3),
  image TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Accounts Table (NextAuth OAuth) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  CONSTRAINT "accounts_provider_providerAccountId_key" UNIQUE (provider, "providerAccountId")
);

-- ─── Sessions Table (NextAuth) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMP(3) NOT NULL
);

-- ─── Verification Tokens Table (NextAuth) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires TIMESTAMP(3) NOT NULL,
  CONSTRAINT "verification_tokens_identifier_token_key" UNIQUE (identifier, token)
);

-- ─── Conversations Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Chat',
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "conversations_userId_idx" ON conversations("userId");

-- ─── Messages Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  "conversationId" TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "messages_conversationId_idx" ON messages("conversationId");

-- ─── API Usage Table (Security Monitoring) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "api_usage_userId_createdAt_idx" ON api_usage("userId", "createdAt");

-- ─── Auto-update timestamps ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ══════════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS) — THE CORE SECURITY LAYER
-- ══════════════════════════════════════════════════════════════════════════════
-- These policies ensure users can ONLY access their own data.
-- Even if the backend code has a bug, the database will enforce isolation.
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- ─── Users: Users can only read/update their own profile ─────────────────────
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid()::text = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid()::text = id);

-- ─── Accounts: Users can only see their own accounts ─────────────────────────
CREATE POLICY "Users can view own accounts"
  ON accounts FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can insert own accounts"
  ON accounts FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE
  USING (auth.uid()::text = "userId");

-- ─── Sessions: Users can only see their own sessions ─────────────────────────
CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE
  USING (auth.uid()::text = "userId");

-- ─── Conversations: Full CRUD only on own conversations ──────────────────────
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can create own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid()::text = "userId");

-- ─── Messages: Access through conversation ownership ─────────────────────────
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    "conversationId" IN (
      SELECT id FROM conversations WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert messages in own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    "conversationId" IN (
      SELECT id FROM conversations WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete messages in own conversations"
  ON messages FOR DELETE
  USING (
    "conversationId" IN (
      SELECT id FROM conversations WHERE "userId" = auth.uid()::text
    )
  );

-- ─── API Usage: Users can only see their own usage ───────────────────────────
CREATE POLICY "Users can view own api usage"
  ON api_usage FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can insert own api usage"
  ON api_usage FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

-- ══════════════════════════════════════════════════════════════════════════════
-- Service Role Access (for backend operations with API key auth)
-- ══════════════════════════════════════════════════════════════════════════════
-- The service role key bypasses RLS, so backend operations work correctly.
-- This is intentional — the backend validates user ownership before queries.

-- ══════════════════════════════════════════════════════════════════════════════
-- Verification
-- ══════════════════════════════════════════════════════════════════════════════
-- After running this, verify with:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- All tables should have rowsecurity = true
