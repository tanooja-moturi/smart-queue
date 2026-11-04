import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * PATCH /api/queues/:id/settings
 * Toggle isOpen and/or remoteJoiningEnabled for a queue.
 * Staff-only — only the queue owner may update settings.
 *
 * Body: { isOpen?: boolean, remoteJoiningEnabled?: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { isOpen, remoteJoiningEnabled } = body;

    if (isOpen === undefined && remoteJoiningEnabled === undefined) {
      return NextResponse.json({ message: 'At least one setting (isOpen, remoteJoiningEnabled) must be provided' }, { status: 400 });
    }

    const queueRef = adminDb.collection('queues').doc(id);
    const queueDoc = await queueRef.get();

    if (!queueDoc.exists) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }
    if (queueDoc.data()?.userId !== user._id) {
      return NextResponse.json({ message: 'Unauthorized — you do not own this queue' }, { status: 403 });
    }

    const updates: Record<string, boolean> = {};
    if (typeof isOpen === 'boolean') updates.isOpen = isOpen;
    if (typeof remoteJoiningEnabled === 'boolean') updates.remoteJoiningEnabled = remoteJoiningEnabled;

    await queueRef.update(updates);

    return NextResponse.json({ _id: id, ...updates, message: 'Queue settings updated' });
  } catch (error: any) {
    console.error('[PATCH /api/queues/[id]/settings] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error updating settings' }, { status: 500 });
  }
}
