import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseAvailable } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/api-auth';

export async function GET() {
  // ━━━ SECURITY: Authenticate user ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json([]);
  }
  try {
    // ━━━ SECURITY: Only fetch conversations belonging to this user ━━━━━━━━
    const conversations = await db.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  // ━━━ SECURITY: Authenticate user ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json({ id: 'temp-' + Date.now(), title: 'New Chat', createdAt: new Date(), updatedAt: new Date(), messages: [] });
  }
  try {
    const { title } = await req.json();
    // ━━━ SECURITY: Associate conversation with authenticated user ━━━━━━━━
    const conversation = await db.conversation.create({
      data: { title: title || 'New Chat', userId },
    });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json({ id: 'temp-' + Date.now(), title: 'New Chat', createdAt: new Date(), updatedAt: new Date(), messages: [] });
  }
}

export async function PUT(req: NextRequest) {
  // ━━━ SECURITY: Authenticate user ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json({ success: true });
  }
  try {
    const { id, title } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    // ━━━ SECURITY: Verify ownership before updating ━━━━━━━━━━━━━━━━━━━━━
    const conversation = await db.conversation.findUnique({ where: { id }, select: { userId: true } });
    if (!conversation || conversation.userId !== userId) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const updated = await db.conversation.update({
      where: { id },
      data: { title },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update conversation:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // ━━━ SECURITY: Authenticate user ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json({ success: true });
  }
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    // ━━━ SECURITY: Verify ownership before deleting ━━━━━━━━━━━━━━━━━━━━━
    const conversation = await db.conversation.findUnique({ where: { id }, select: { userId: true } });
    if (!conversation || conversation.userId !== userId) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
