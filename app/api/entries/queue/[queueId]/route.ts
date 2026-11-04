import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// GET /api/entries/queue/:queueId — protected, staff-only
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ queueId: string }> }
) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    const { queueId } = await params;
    const queueRef = adminDb.collection('queues').doc(queueId);
    const queueDoc = await queueRef.get();

    if (!queueDoc.exists) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const queueData = queueDoc.data();
    if (queueData?.userId !== user._id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const entriesSnapshot = await queueRef.collection('entries').get();

    const mappedEntries = entriesSnapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const entry = doc.data();
      return {
        _id: doc.id,
        customerName: entry.customerName,
        queueId: queueId,
        token: entry.token,
        status: entry.status,
        joinedAt: entry.joinedAt,
        calledAt: entry.calledAt || null,
        servedAt: entry.servedAt || null,
      };
    });

    // Sort by joinedAt ascending
    mappedEntries.sort((a: any, b: any) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

    return NextResponse.json(mappedEntries);
  } catch (error: any) {
    console.error('[GET /api/entries/queue/[queueId]] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error fetching entries' }, { status: 500 });
  }
}
