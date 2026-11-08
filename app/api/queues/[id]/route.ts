import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { verifyQueueAccess } from '@/lib/queueAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// DELETE /api/queues/:id — protected, staff-only (ownerId check enforced)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    const { id } = await params;
    const access = await verifyQueueAccess(id, user);
    if (!access.authorized || !access.queueRef) {
      return NextResponse.json({ message: access.message || 'Unauthorized' }, { status: access.status });
    }

    const queueRef = access.queueRef;

    // Cascade delete: delete all documents in entries subcollection
    const entriesSnapshot = await queueRef.collection('entries').get();
    const batch = adminDb.batch();

    entriesSnapshot.docs.forEach((entryDoc: QueryDocumentSnapshot) => {
      batch.delete(entryDoc.ref);
    });
    batch.delete(queueRef);

    await batch.commit();

    // Broadcast socket event to notify connected clients
    const io = (global as any).io;
    if (io) {
      io.to(id.toString()).emit('queue_updated', { queueId: id });
    }

    return NextResponse.json({
      message: 'Queue and all associated entries deleted successfully',
      queueId: id,
    });
  } catch (error: any) {
    console.error('[DELETE /api/queues/[id]] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error deleting queue' }, { status: 500 });
  }
}
