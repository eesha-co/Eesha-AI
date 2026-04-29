import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/api-auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // ━━━ SECURITY: Authenticate user ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const { title } = await req.json();
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
