import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// ─── Database Migration Route ──────────────────────────────────────────────────
// Adds the 'mode' column to the conversations table if it doesn't exist.
// This is idempotent — safe to run multiple times.

export async function POST(req: NextRequest) {
  const SETUP_SECRET = process.env.SETUP_SECRET;
  const providedSecret = req.headers.get('x-setup-secret');

  if (SETUP_SECRET && providedSecret !== SETUP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();

    // Run the migration using Supabase RPC or raw SQL
    // Since we can't run raw ALTER TABLE via PostgREST, we use the Supabase SQL API
    // via the management API. For simplicity, we check if the column exists.

    // First, try to select a conversation with the mode column
    const { error: testError } = await supabase
      .from('conversations')
      .select('id, mode')
      .limit(1);

    if (testError && testError.message.includes('column') && testError.message.includes('mode')) {
      // Column doesn't exist — need migration
      return NextResponse.json({
        status: 'migration_needed',
        message: 'The "mode" column does not exist in the conversations table. Please run the following SQL in your Supabase SQL Editor:',
        sql: 'ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT \'code\';',
        hint: 'Go to Supabase Dashboard → SQL Editor → paste the SQL above → click Run',
      });
    }

    if (testError) {
      return NextResponse.json({
        status: 'error',
        message: testError.message,
      }, { status: 500 });
    }

    // Column exists
    return NextResponse.json({
      status: 'ok',
      message: 'The "mode" column already exists in the conversations table.',
    });
  } catch (error) {
    console.error('Migration check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
