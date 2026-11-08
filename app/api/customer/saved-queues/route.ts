import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAuthUser } from '@/lib/authMiddleware';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/saved-queues?deviceId=...
 * Returns all saved queues for the authenticated user or guest device.
 * Validates each against the parent queue's current credential & version.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('deviceId');

    // Attempt to get authenticated user (optional for customers)
    const { user } = await getAuthUser(req);
    const uid = user?._id;

    if (!uid && !deviceId) {
      return NextResponse.json(
        { message: 'Either deviceId query parameter or auth token is required' },
        { status: 400 }
      );
    }

    // Query savedQueues collection in parallel
    const [uidSnap, deviceSnap] = await Promise.all([
      uid ? adminDb.collection('savedQueues').where('ownerUid', '==', uid).get() : null,
      deviceId ? adminDb.collection('savedQueues').where('ownerDeviceId', '==', deviceId).get() : null,
    ]);

    let docs: any[] = [];
    if (uidSnap) docs = uidSnap.docs;

    if (deviceSnap) {
      const existingQueueIds = new Set(docs.map((d) => d.data().queueId));
      for (const d of deviceSnap.docs) {
        if (!existingQueueIds.has(d.data().queueId)) {
          docs.push(d);
          existingQueueIds.add(d.data().queueId);
        }
      }
    }

    // Batch fetch parent queues in a single RPC instead of N separate roundtrips
    const uniqueQueueIds = Array.from(new Set(docs.map((d) => d.data().queueId).filter(Boolean))) as string[];
    const queueMap = new Map<string, FirebaseFirestore.DocumentData>();
    if (uniqueQueueIds.length > 0) {
      try {
        const queueRefs = uniqueQueueIds.map((id) => adminDb.collection('queues').doc(id));
        const queueDocs = await adminDb.getAll(...queueRefs);
        for (const qDoc of queueDocs) {
          if (qDoc.exists) {
            queueMap.set(qDoc.id, qDoc.data()!);
          }
        }
      } catch (err) {
        console.warn('[saved-queues GET] Batch queue lookup failed:', err);
      }
    }

    const results = docs.map((docSnap) => {
      const data = docSnap.data();
      const queueId = data.queueId;
      let isValid = data.isValid !== false;
      let isOpen = true;
      let remoteJoiningEnabled = false;
      let queueName = data.queueName;
      let queueCode = data.queueCode;

      if (queueId) {
        const qData = queueMap.get(queueId);
        if (qData) {
          queueName = qData.queueName || queueName;
          queueCode = qData.queueCode || queueCode;
          isOpen = qData.isOpen !== false;
          remoteJoiningEnabled = !!qData.remoteJoiningEnabled;

          // Check if QR credential or version has been rotated
          const currentCred = qData.publicCredential;
          const currentVer = qData.qrVersion || 1;

          if (currentCred && data.publicCredential && currentCred !== data.publicCredential) {
            isValid = false;
            docSnap.ref.update({ isValid: false }).catch(() => {});
          } else if (currentVer !== (data.qrVersion || 1)) {
            isValid = false;
            docSnap.ref.update({ isValid: false }).catch(() => {});
          }
        } else {
          // Parent queue was deleted or not found
          isValid = false;
          docSnap.ref.update({ isValid: false }).catch(() => {});
        }
      }

      return {
        docId: docSnap.id,
        queueId: data.queueId,
        queueName,
        queueCode,
        publicCredential: data.publicCredential,
        qrVersion: data.qrVersion || 1,
        savedAt: data.savedAt,
        isValid,
        isOpen,
        remoteJoiningEnabled,
      };
    });

    // Sort by savedAt descending
    results.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());

    return NextResponse.json(results);
  } catch (error: any) {
    console.error('[GET /api/customer/saved-queues] Error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to fetch saved queues' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customer/saved-queues
 * Saves a queue reference to the customer's account or guest device.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    const uid = user?._id || null;

    const body = await req.json();
    const { queueId, queueCode, queueName, publicCredential, qrVersion, deviceId } = body;

    if (!queueId) {
      return NextResponse.json({ message: 'queueId is required' }, { status: 400 });
    }

    if (!uid && !deviceId) {
      return NextResponse.json(
        { message: 'Either authenticated user or deviceId is required' },
        { status: 400 }
      );
    }

    // Verify parent queue exists
    const queueDoc = await adminDb.collection('queues').doc(queueId).get();
    if (!queueDoc.exists) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const qData = queueDoc.data()!;
    const actualCredential = publicCredential || qData.publicCredential || '';
    const actualVersion = qrVersion || qData.qrVersion || 1;
    const finalQueueName = queueName || qData.queueName || 'Queue';
    const finalQueueCode = queueCode || qData.queueCode || '';

    // Check for existing saved entry for this user or device
    let existingDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (uid) {
      const snap = await adminDb
        .collection('savedQueues')
        .where('ownerUid', '==', uid)
        .where('queueId', '==', queueId)
        .limit(1)
        .get();
      if (!snap.empty) existingDoc = snap.docs[0];
    }

    if (!existingDoc && deviceId) {
      const snap = await adminDb
        .collection('savedQueues')
        .where('ownerDeviceId', '==', deviceId)
        .where('queueId', '==', queueId)
        .limit(1)
        .get();
      if (!snap.empty) existingDoc = snap.docs[0];
    }

    const now = new Date().toISOString();

    if (existingDoc) {
      // Update existing record
      await existingDoc.ref.update({
        publicCredential: actualCredential,
        qrVersion: actualVersion,
        queueName: finalQueueName,
        queueCode: finalQueueCode,
        isValid: true,
        savedAt: now,
        ...(uid ? { ownerUid: uid } : {}),
      });

      return NextResponse.json({
        docId: existingDoc.id,
        queueId,
        queueName: finalQueueName,
        queueCode: finalQueueCode,
        publicCredential: actualCredential,
        qrVersion: actualVersion,
        savedAt: now,
        isValid: true,
        isOpen: qData.isOpen !== false,
        remoteJoiningEnabled: !!qData.remoteJoiningEnabled,
      });
    }

    // Create new savedQueues document
    const newRef = adminDb.collection('savedQueues').doc();
    const payload = {
      ownerUid: uid,
      ownerDeviceId: deviceId || null,
      queueId,
      queueName: finalQueueName,
      queueCode: finalQueueCode,
      publicCredential: actualCredential,
      qrVersion: actualVersion,
      savedAt: now,
      isValid: true,
    };

    await newRef.set(payload);

    return NextResponse.json(
      {
        docId: newRef.id,
        ...payload,
        isOpen: qData.isOpen !== false,
        remoteJoiningEnabled: !!qData.remoteJoiningEnabled,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/customer/saved-queues] Error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to save queue' },
      { status: 500 }
    );
  }
}
