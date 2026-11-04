import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// DELETE /api/queues/:id — protected, staff-only
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
    const queueRef = adminDb.collection('queues').doc(id);
    const queueDoc = await queueRef.get();

    if (!queueDoc.exists) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const queueData = queueDoc.data();
    if (queueData?.userId !== user._id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

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
