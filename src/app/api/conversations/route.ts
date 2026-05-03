import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAuthUserId, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

// ─── Input Validation ──────────────────────────────────────────────────────────
const MAX_TITLE_LENGTH = 200;
const VALID_CHAT_MODES = ['code', 'iluma', 'health', 'chat'] as const;

function validateCreateBody(body: unknown): { valid: boolean; error?: string; data?: { title: string; chatMode: string } } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const { title, chatMode } = body as Record<string, unknown>;

  const safeTitle = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE_LENGTH) : 'New Chat';
  const safeMode = VALID_CHAT_MODES.includes(chatMode as (typeof VALID_CHAT_MODES)[number]) ? chatMode : 'code';

  return { valid: true, data: { title: safeTitle || 'New Chat', chatMode: safeMode as string } };
}

function validateUpdateBody(body: unknown): { valid: boolean; error?: string; data?: { id: string; title: string } } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const { id, title } = body as Record<string, unknown>;

  if (typeof id !== 'string' || !id.trim()) {
    return { valid: false, error: 'Conversation ID is required.' };
  }
  if (typeof title !== 'string' || !title.trim()) {
    return { valid: false, error: 'Title must be a non-empty string.' };
  }

  return { valid: true, data: { id: id.trim(), title: title.trim().slice(0, MAX_TITLE_LENGTH) } };
}

// ─── GET: List conversations for authenticated user ─────────────────────────────
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const supabase = createServerSupabaseClient();

    // Fetch conversations with their messages
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*, messages(*)')
      .eq('userId', userId)
      .order('updatedAt', { ascending: false });

    if (error) {
      console.error('[CONVERSATIONS] GET error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch conversations.' }, { status: 500 });
    }

    // Normalize: map chat_mode → mode for the frontend
    const normalized = (conversations || []).map((c: Record<string, unknown>) => ({
      ...c,
      mode: c.chat_mode || c.chatMode || 'code',
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('[CONVERSATIONS] GET unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations.' }, { status: 500 });
  }
}

// ─── POST: Create a new conversation (requires authentication) ──────────────────
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }

  const validation = validateCreateBody(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { title, chatMode } = validation.data!;

  try {
    const supabase = createServerSupabaseClient();
    const id = `cl${nanoid(22)}`;
    const now = new Date().toISOString();

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        id,
        title,
        chat_mode: chatMode,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single();

    if (error) {
      console.error('[CONVERSATIONS] POST error:', error.message, error.details);
      return NextResponse.json({ error: 'Failed to create conversation.' }, { status: 500 });
    }

    // Normalize for frontend: add mode field
    const normalized = {
      ...conversation,
      mode: conversation.chat_mode || chatMode,
    };

    return NextResponse.json(normalized, { status: 201 });
  } catch (error) {
    console.error('[CONVERSATIONS] POST unexpected error:', error);
    return NextResponse.json({ error: 'Failed to create conversation.' }, { status: 500 });
  }
}

// ─── PUT: Update conversation title (requires auth + ownership) ─────────────────
export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }

  const validation = validateUpdateBody(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { id, title } = validation.data!;

  try {
    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: conv, error: findError } = await supabase
      .from('conversations')
      .select('userId')
      .eq('id', id)
      .maybeSingle();

    if (findError || !conv) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    if (conv.userId !== userId) {
      return forbiddenResponse('You do not have permission to update this conversation.');
    }

    // Update
    const { data: updated, error: updateError } = await supabase
      .from('conversations')
      .update({ title, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[CONVERSATIONS] PUT error:', updateError.message);
      return NextResponse.json({ error: 'Failed to update conversation.' }, { status: 500 });
    }

    return NextResponse.json({ ...updated, mode: updated.chat_mode });
  } catch (error) {
    console.error('[CONVERSATIONS] PUT unexpected error:', error);
    return NextResponse.json({ error: 'Failed to update conversation.' }, { status: 500 });
  }
}

// ─── DELETE: Delete a conversation (requires auth + ownership) ──────────────────
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }

  const { id } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !id.trim()) {
    return NextResponse.json({ error: 'Conversation ID is required.' }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: conv, error: findError } = await supabase
      .from('conversations')
      .select('userId')
      .eq('id', id)
      .maybeSingle();

    if (findError || !conv) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    if (conv.userId !== userId) {
      return forbiddenResponse('You do not have permission to delete this conversation.');
    }

    // Delete (messages are cascade-deleted by FK constraint)
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[CONVERSATIONS] DELETE error:', deleteError.message);
      return NextResponse.json({ error: 'Failed to delete conversation.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CONVERSATIONS] DELETE unexpected error:', error);
    return NextResponse.json({ error: 'Failed to delete conversation.' }, { status: 500 });
  }
}
