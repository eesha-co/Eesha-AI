-- Add mode column to conversations table
-- This allows categorizing conversations by chat mode (code, iluma, health, chat)

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'code';

-- Add index for filtering conversations by mode
CREATE INDEX IF NOT EXISTS "conversations_mode_idx" ON "conversations"("mode");
