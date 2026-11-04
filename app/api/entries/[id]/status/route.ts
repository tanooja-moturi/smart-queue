import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { DocumentReference } from 'firebase-admin/firestore';

// PATCH /api/entries/:id/status — protected, staff-only
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error, status: authStatus } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: authStatus || 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status, queueId: requestedQueueId } = body;

    if (!['waiting', 'called', 'served', 'skipped'].includes(status)) {
      return NextResponse.json({ message: 'Invalid status value' }, { status: 400 });
    }

    let targetEntryRef: DocumentReference | null = null;
    let targetEntryData: any = null;
    let targetQueueId: string | null = null;

    if (requestedQueueId) {
      const qRef = adminDb.collection('queues').doc(requestedQueueId);
      const eRef = qRef.collection('entries').doc(id);
      const [qDoc, eSnap] = await Promise.all([qRef.get(), eRef.get()]);
      if (qDoc.exists && qDoc.data()?.userId === user._id && eSnap.exists) {
        targetEntryRef = eRef;
        targetEntryData = eSnap.data();
        targetQueueId = requestedQueueId;
      }
    }

    // If not found via requestedQueueId, search across the staff user's owned queues
    if (!targetEntryRef) {
      const userQueues = await adminDb
        .collection('queues')
        .where('userId', '==', user._id)
        .get();

      for (const qDoc of userQueues.docs) {
        const eRef = qDoc.ref.collection('entries').doc(id);
        const eSnap = await eRef.get();
        if (eSnap.exists) {
          targetEntryRef = eRef;
          targetEntryData = eSnap.data();
          targetQueueId = qDoc.id;
          break;
        }
      }
    }

    if (!targetEntryRef || !targetEntryData || !targetQueueId) {
      return NextResponse.json({ message: 'Queue entry not found or unauthorized' }, { status: 404 });
    }

    const updateFields: any = { status };
    const nowIso = new Date().toISOString();
    if (status === 'called') {
      updateFields.calledAt = nowIso;
    } else if (status === 'served') {
      updateFields.servedAt = nowIso;
    }

    await targetEntryRef.update(updateFields);

    const io = (global as any).io;
    if (io) {
      io.to(targetQueueId).emit('queue_updated', { queueId: targetQueueId });

      if (status === 'called') {
        io.emit('customer_called', {
          queueId: targetQueueId,
          token: targetEntryData.token,
          customerName: targetEntryData.customerName,
        });
      }
    }

    return NextResponse.json({
      _id: id,
      customerName: targetEntryData.customerName,
      queueId: targetQueueId,
      token: targetEntryData.token,
      status,
      joinedAt: targetEntryData.joinedAt,
      calledAt: updateFields.calledAt || targetEntryData.calledAt || null,
      servedAt: updateFields.servedAt || targetEntryData.servedAt || null,
    });
  } catch (error: any) {
    console.error('[PATCH /api/entries/[id]/status] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error updating status' }, { status: 500 });
  }
}
