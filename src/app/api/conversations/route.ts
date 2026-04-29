import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseAvailable } from '@/lib/db';
import { getAuthUserId } from '@/lib/api-auth';

export async function GET() {
  const userId = await getAuthUserId();

  // Anonymous users get empty conversation list (stored in memory only)
  if (!userId) {
    return NextResponse.json([]);
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json([]);
  }
  try {
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
  const userId = await getAuthUserId();

  // Anonymous users get a temporary local-only conversation (no DB save)
  if (!userId) {
    return NextResponse.json({
      id: 'anon-' + Date.now(),
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      _anonymous: true,
    });
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json({ id: 'temp-' + Date.now(), title: 'New Chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] });
  }
  try {
    const { title } = await req.json();
    const conversation = await db.conversation.create({
      data: { title: title || 'New Chat', userId },
    });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json({ id: 'temp-' + Date.now(), title: 'New Chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] });
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ success: true });
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json({ success: true });
  }
  try {
    const { id, title } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

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
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ success: true });
  }

  if (!isDatabaseAvailable()) {
    return NextResponse.json({ success: true });
  }
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

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
