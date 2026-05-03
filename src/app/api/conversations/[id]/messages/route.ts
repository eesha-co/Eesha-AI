import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAuthUserId, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

// ─── Input Validation Constants ───────────────────────────────────────────────
const VALID_ROLES = ['user', 'assistant'] as const;
const MAX_CONTENT_LENGTH = 50_000;
const MAX_THINKING_LENGTH = 50_000;

interface SaveMessageBody {
  role: string;
  content: string;
  thinking?: string;
}

function validateMessageInput(body: unknown): { valid: boolean; error?: string; data?: SaveMessageBody } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const { role, content, thinking } = body as Record<string, unknown>;

  // Validate role
  if (typeof role !== 'string' || !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return { valid: false, error: `Role must be one of: ${VALID_ROLES.join(', ')}.` };
  }

  // Validate content
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, error: 'Content must be a non-empty string.' };
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return { valid: false, error: `Content must be at most ${MAX_CONTENT_LENGTH} characters.` };
  }

  // Validate thinking (optional)
  if (thinking !== undefined && thinking !== null) {
    if (typeof thinking !== 'string') {
      return { valid: false, error: 'Thinking must be a string if provided.' };
    }
    if (thinking.length > MAX_THINKING_LENGTH) {
      return { valid: false, error: `Thinking must be at most ${MAX_THINKING_LENGTH} characters.` };
    }
  }

  // Sanitize: strip script injection (basic)
  const sanitizedContent = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  const sanitizedThinking = thinking
    ? String(thinking).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    : undefined;

  return {
    valid: true,
    data: {
      role,
      content: sanitizedContent,
      thinking: sanitizedThinking,
    },
  };
}

// ─── POST: Save a message to a conversation ───────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Authenticate
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  // 2. Get conversation ID from params
  const { id: conversationId } = await params;
  if (!conversationId || typeof conversationId !== 'string') {
    return NextResponse.json(
      { error: 'Conversation ID is required.' },
      { status: 400 }
    );
  }

  // 3. Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body.' },
      { status: 400 }
    );
  }

  const validation = validateMessageInput(body);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const { role, content, thinking } = validation.data!;

  try {
    const supabase = createServerSupabaseClient();

    // 4. Verify conversation exists AND belongs to authenticated user
    const { data: conv, error: findError } = await supabase
      .from('conversations')
      .select('userId')
      .eq('id', conversationId)
      .maybeSingle();

    if (findError || !conv) {
      return NextResponse.json(
        { error: 'Conversation not found.' },
        { status: 404 }
      );
    }

    if (conv.userId !== userId) {
      return forbiddenResponse('You do not have permission to add messages to this conversation.');
    }

    // 5. Save the message
    const messageId = `cl${nanoid(22)}`;
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        id: messageId,
        role,
        content,
        thinking: thinking || null,
        conversationId,
        createdAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[MESSAGES] POST error:', insertError.message);
      return NextResponse.json(
        { error: 'Failed to save message.' },
        { status: 500 }
      );
    }

    // 6. Update conversation's updatedAt timestamp
    await supabase
      .from('conversations')
      .update({ updatedAt: new Date().toISOString() })
      .eq('id', conversationId);

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('[MESSAGES] POST unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to save message.' },
      { status: 500 }
    );
  }
}

// ─── GET: List messages for a conversation ─────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { id: conversationId } = await params;
  if (!conversationId || typeof conversationId !== 'string') {
    return NextResponse.json(
      { error: 'Conversation ID is required.' },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: conv, error: findError } = await supabase
      .from('conversations')
      .select('userId')
      .eq('id', conversationId)
      .maybeSingle();

    if (findError || !conv) {
      return NextResponse.json(
        { error: 'Conversation not found.' },
        { status: 404 }
      );
    }

    if (conv.userId !== userId) {
      return forbiddenResponse('You do not have permission to view this conversation.');
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true });

    if (msgError) {
      console.error('[MESSAGES] GET error:', msgError.message);
      return NextResponse.json(
        { error: 'Failed to fetch messages.' },
        { status: 500 }
      );
    }

    return NextResponse.json(messages || []);
  } catch (error) {
    console.error('[MESSAGES] GET unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages.' },
      { status: 500 }
    );
  }
}
