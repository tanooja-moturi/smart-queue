import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

// GET /api/entries/track/:token — public, no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(req.url);
    const queueParam = searchParams.get('queue');
    const upperToken = token ? token.trim().toUpperCase() : '';

    if (!upperToken) {
      return NextResponse.json({ message: 'Token is required' }, { status: 400 });
    }

    let targetQueueDoc: DocumentSnapshot | null = null;
    let targetEntryDoc: DocumentSnapshot | null = null;

    // 1. If queue param is provided, locate queue directly first
    if (queueParam) {
      const cleanQueueParam = queueParam.trim();
      // Try by document ID
      const byId = await adminDb.collection('queues').doc(cleanQueueParam).get();
      if (byId.exists) {
        targetQueueDoc = byId;
      } else {
        // Try by queueCode
        const byCode = await adminDb
          .collection('queues')
          .where('queueCode', '==', cleanQueueParam.toUpperCase())
          .limit(1)
          .get();
        if (!byCode.empty) {
          targetQueueDoc = byCode.docs[0];
        }
      }

      if (targetQueueDoc) {
        const entrySnap = await targetQueueDoc.ref
          .collection('entries')
          .where('token', '==', upperToken)
          .limit(1)
          .get();

        if (!entrySnap.empty) {
          targetEntryDoc = entrySnap.docs[0];
        }
      }
    }

    // 2. If not found via queue param, query across entries collection group
    if (!targetEntryDoc) {
      const groupSnap = await adminDb
        .collectionGroup('entries')
        .where('token', '==', upperToken)
        .limit(1)
        .get();

      if (!groupSnap.empty) {
        targetEntryDoc = groupSnap.docs[0];
        const parentQueueRef = targetEntryDoc.ref.parent.parent;
        if (parentQueueRef) {
          targetQueueDoc = await parentQueueRef.get();
        }
      }
    }

    if (!targetEntryDoc || !targetQueueDoc || !targetQueueDoc.exists) {
      return NextResponse.json({ message: 'Queue entry not found' }, { status: 404 });
    }

    const entryData = targetEntryDoc.data()!;
    const queueData = targetQueueDoc.data()!;
    const entriesRef = targetQueueDoc.ref.collection('entries');

    // 3. Concurrently fetch waiting entries and currently serving entry
    const [waitingSnap, calledSnap] = await Promise.all([
      entriesRef.where('status', '==', 'waiting').get(),
      entriesRef.where('status', '==', 'called').limit(1).get(),
    ]);

    const entryJoinedTime = new Date(entryData.joinedAt).getTime();
    let peopleAhead = 0;

    waitingSnap.docs.forEach((doc: QueryDocumentSnapshot) => {
      const d = doc.data();
      if (new Date(d.joinedAt).getTime() < entryJoinedTime) {
        peopleAhead++;
      }
    });

    const currentServingEntry = !calledSnap.empty ? calledSnap.docs[0].data() : null;

    const mappedEntry = {
      _id: targetEntryDoc.id,
      customerName: entryData.customerName,
      token: entryData.token,
      status: entryData.status,
      joinedAt: entryData.joinedAt,
      calledAt: entryData.calledAt || null,
      queueId: {
        _id: targetQueueDoc.id,
        queueName: queueData.queueName,
        queueCode: queueData.queueCode,
        averageServiceTime: queueData.averageServiceTime,
      },
    };

    return NextResponse.json({
      entry: mappedEntry,
      peopleAhead,
      currentServing: currentServingEntry ? currentServingEntry.token : 'None',
      averageServiceTime: queueData.averageServiceTime,
    });
  } catch (error: any) {
    console.error('[GET /api/entries/track/[token]] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error tracking entry' }, { status: 500 });
  }
}
