import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseAvailable } from '@/lib/db';

export async function GET() {
  if (!isDatabaseAvailable()) {
    return NextResponse.json([]);
  }
  try {
    const conversations = await db.conversation.findMany({
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
  if (!isDatabaseAvailable()) {
    return NextResponse.json({ id: 'temp-' + Date.now(), title: 'New Chat', createdAt: new Date(), updatedAt: new Date(), messages: [] });
  }
  try {
    const { title } = await req.json();
    const conversation = await db.conversation.create({
      data: { title: title || 'New Chat' },
    });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json({ id: 'temp-' + Date.now(), title: 'New Chat', createdAt: new Date(), updatedAt: new Date(), messages: [] });
  }
}

export async function PUT(req: NextRequest) {
  if (!isDatabaseAvailable()) {
    return NextResponse.json({ success: true });
  }
  try {
    const { id, title } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    const conversation = await db.conversation.update({
      where: { id },
      data: { title },
    });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Failed to update conversation:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isDatabaseAvailable()) {
    return NextResponse.json({ success: true });
  }
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
