import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { verifyQueueAccess } from '@/lib/queueAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// POST /api/entries/queue/:queueId/call-next — protected, staff-only (ownerId check enforced)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ queueId: string }> }
) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    const { queueId } = await params;
    const access = await verifyQueueAccess(queueId, user);
    if (!access.authorized || !access.queueRef) {
      return NextResponse.json({ message: access.message || 'Unauthorized' }, { status: access.status });
    }

    const queueRef = access.queueRef;
    const entriesRef = queueRef.collection('entries');
    const nowIso = new Date().toISOString();
    const batch = adminDb.batch();

    // 1 & 2. Concurrently fetch currently 'called' and 'waiting' customers
    const [calledSnapshot, waitingSnapshot] = await Promise.all([
      entriesRef.where('status', '==', 'called').get(),
      entriesRef.where('status', '==', 'waiting').get(),
    ]);

    calledSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
      batch.update(doc.ref, { status: 'served', servedAt: nowIso });
    });

    const io = (global as any).io;

    if (waitingSnapshot.empty) {
      await batch.commit();
      if (io) {
        io.to(queueId).emit('queue_updated', { queueId });
      }
      return NextResponse.json({ message: 'No customers waiting in queue', entry: null });
    }

    // Sort waiting entries by joinedAt ascending
    const waitingDocs = waitingSnapshot.docs.sort(
      (a: QueryDocumentSnapshot, b: QueryDocumentSnapshot) =>
        new Date(a.data().joinedAt).getTime() - new Date(b.data().joinedAt).getTime()
    );
    const nextEntryDoc = waitingDocs[0];
    const nextEntryRef = nextEntryDoc.ref;
    const nextEntryData = nextEntryDoc.data();

    // 3. Mark next customer as called
    batch.update(nextEntryRef, { status: 'called', calledAt: nowIso });
    await batch.commit();

    const updatedEntry = {
      _id: nextEntryDoc.id,
      customerName: nextEntryData.customerName,
      queueId,
      token: nextEntryData.token,
      status: 'called',
      joinedAt: nextEntryData.joinedAt,
      calledAt: nowIso,
      servedAt: nextEntryData.servedAt || null,
    };

    // 4. Broadcast the update
    if (io) {
      io.to(queueId).emit('queue_updated', { queueId });
      io.emit('customer_called', {
        queueId,
        token: updatedEntry.token,
        customerName: updatedEntry.customerName,
      });
    }

    return NextResponse.json(updatedEntry);
  } catch (error: any) {
    console.error('[POST /api/entries/queue/[queueId]/call-next] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error calling next customer' }, { status: 500 });
  }
}
