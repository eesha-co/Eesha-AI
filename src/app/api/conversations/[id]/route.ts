import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(req: NextRequest) {
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
