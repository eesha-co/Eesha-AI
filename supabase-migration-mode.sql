-- Add chat_mode column to conversations table
-- This allows categorizing conversations by chat mode (code, iluma, health, chat)
-- NOTE: Using "chat_mode" instead of "mode" because "mode" is a reserved SQL aggregate function

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "chat_mode" TEXT NOT NULL DEFAULT 'code';

-- Add index for filtering conversations by chat_mode
CREATE INDEX IF NOT EXISTS "conversations_chat_mode_idx" ON "conversations"("chat_mode");
