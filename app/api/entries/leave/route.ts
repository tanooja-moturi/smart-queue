
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { DocumentReference } from 'firebase-admin/firestore';

/**
 * POST /api/entries/leave
 * Allows a customer to voluntarily leave/cancel their place in a queue.
 * Body: { entryId?: string, queueId?: string, token?: string, queueCode?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { entryId, queueId, token, queueCode } = body;

    if (!entryId && !token) {
      return NextResponse.json(
        { message: 'Either entryId or token is required to leave the queue' },
        { status: 400 }
      );
    }

    let targetEntryRef: DocumentReference | null = null;
    let targetEntryData: any = null;
    let targetQueueId: string | null = queueId || null;

    // 1. Direct lookup if queueId & entryId are provided
    if (queueId && entryId) {
      const qRef = adminDb.collection('queues').doc(queueId);
      const eRef = qRef.collection('entries').doc(entryId);
      const eSnap = await eRef.get();
      if (eSnap.exists) {
        targetEntryRef = eRef;
        targetEntryData = eSnap.data();
        targetQueueId = queueId;
      }
    }

    // 2. Direct lookup by queueCode & token
    if (!targetEntryRef && queueCode && token) {
      const qQuery = await adminDb
        .collection('queues')
        .where('queueCode', '==', queueCode.trim().toUpperCase())
        .limit(1)
        .get();

      if (!qQuery.empty) {
        const qDoc = qQuery.docs[0];
        targetQueueId = qDoc.id;
        const eSnap = await qDoc.ref
          .collection('entries')
          .where('token', '==', token.trim().toUpperCase())
          .limit(1)
          .get();

        if (!eSnap.empty) {
          targetEntryRef = eSnap.docs[0].ref;
          targetEntryData = eSnap.docs[0].data();
        }
      }
    }

    // 3. Fallback: Search across queues (avoiding collectionGroup index requirement)
    if (!targetEntryRef) {
      const allQueues = await adminDb.collection('queues').get();
      for (const qDoc of allQueues.docs) {
        if (entryId) {
          const eRef = qDoc.ref.collection('entries').doc(entryId);
          const eSnap = await eRef.get();
          if (eSnap.exists) {
            targetEntryRef = eRef;
            targetEntryData = eSnap.data();
            targetQueueId = qDoc.id;
            break;
          }
        } else if (token) {
          const eQuery = await qDoc.ref
            .collection('entries')
            .where('token', '==', token.trim().toUpperCase())
            .limit(1)
            .get();
          if (!eQuery.empty) {
            targetEntryRef = eQuery.docs[0].ref;
            targetEntryData = eQuery.docs[0].data();
            targetQueueId = qDoc.id;
            break;
          }
        }
      }
    }

    if (!targetEntryRef || !targetEntryData) {
      return NextResponse.json(
        { message: 'Queue ticket not found or already closed' },
        { status: 404 }
      );
    }

    // Mark as skipped (customer left)
    const nowIso = new Date().toISOString();
    await targetEntryRef.update({
      status: 'skipped',
      leftAt: nowIso,
      leftByCustomer: true,
    });

    // Notify staff and waiting customers in real-time via Socket.IO
    const io = (global as any).io;
    if (io && targetQueueId) {
      io.to(targetQueueId).emit('queue_updated', { queueId: targetQueueId });
    }

    return NextResponse.json({
      success: true,
      message: 'You have left the queue.',
      entryId: targetEntryRef.id,
      token: targetEntryData.token,
      queueId: targetQueueId,
    });
  } catch (error: any) {
    console.error('[POST /api/entries/leave] Error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to leave queue' },
      { status: 500 }
    );
  }
}
