import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAuthUser } from '@/lib/authMiddleware';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/active-tickets?deviceId=...
 * Returns active tickets (status: 'waiting' or 'called') for the authenticated user or guest device.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('deviceId');

    const { user } = await getAuthUser(req);
    const uid = user?._id;

    if (!uid && !deviceId) {
      return NextResponse.json({ tickets: [] });
    }

    const tickets: any[] = [];
    const seenEntryIds = new Set<string>();

    const processDocs = async (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const d of docs) {
        if (seenEntryIds.has(d.id)) continue;
        seenEntryIds.add(d.id);

        const data = d.data();
        // Only live statuses
        if (data.status !== 'waiting' && data.status !== 'called') continue;

        let queueName = 'Queue';
        let queueCode = '';
        let queueId = data.queueId;

        // Fetch parent queue info
        try {
          const parentQueueRef = d.ref.parent.parent;
          if (parentQueueRef) {
            queueId = parentQueueRef.id;
            const qSnap = await parentQueueRef.get();
            if (qSnap.exists) {
              const qData = qSnap.data();
              queueName = qData?.queueName || queueName;
              queueCode = qData?.queueCode || queueCode;
            }
          }
        } catch (err) {
          console.warn('[active-tickets] Parent queue lookup warning:', err);
        }

        tickets.push({
          entryId: d.id,
          token: data.token,
          queueId,
          queueCode,
          queueName,
          customerName: data.customerName,
          joinedAt: data.joinedAt,
          status: data.status,
        });
      }
    };

    try {
      if (uid) {
        const uidSnap = await adminDb
          .collectionGroup('entries')
          .where('ownerUid', '==', uid)
          .where('status', 'in', ['waiting', 'called'])
          .get();
        await processDocs(uidSnap.docs);
      }

      if (deviceId) {
        const deviceSnap = await adminDb
          .collectionGroup('entries')
          .where('ownerDeviceId', '==', deviceId)
          .where('status', 'in', ['waiting', 'called'])
          .get();
        await processDocs(deviceSnap.docs);
      }
    } catch (cgError: any) {
      console.warn('[active-tickets] collectionGroup query error (index might be building):', cgError?.message);
    }

    return NextResponse.json({ tickets });
  } catch (error: any) {
    console.error('[GET /api/customer/active-tickets] Error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to fetch active tickets' },
      { status: 500 }
    );
  }
}
