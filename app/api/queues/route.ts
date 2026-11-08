import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

// GET /api/queues — list all queues with stats (staff-only)
export async function GET(req: NextRequest) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    // Query only queues owned by the currently authenticated staff member (or assigned)
    let queueDocs: QueryDocumentSnapshot[] = [];

    if (user.role === 'admin') {
      const allQueues = await adminDb.collection('queues').get();
      queueDocs = allQueues.docs;
    } else {
      const [byOwner, byLegacyUser] = await Promise.all([
        adminDb.collection('queues').where('ownerId', '==', user._id).get(),
        adminDb.collection('queues').where('userId', '==', user._id).get(),
      ]);

      const seen = new Map<string, QueryDocumentSnapshot>();
      for (const doc of byOwner.docs) seen.set(doc.id, doc);
      for (const doc of byLegacyUser.docs) seen.set(doc.id, doc);
      queueDocs = Array.from(seen.values());
    }

    const queuesWithStats = await Promise.all(
      queueDocs.map(async (doc: QueryDocumentSnapshot) => {
        const queueData = doc.data();
        const entriesRef = doc.ref.collection('entries');

        const [waitingSnapshot, servedSnapshot, calledSnapshot] = await Promise.all([
          entriesRef.where('status', '==', 'waiting').count().get(),
          entriesRef.where('status', '==', 'served').count().get(),
          entriesRef.where('status', '==', 'called').limit(1).get(),
        ]);
        const waitingCount = waitingSnapshot.data().count;
        const servedCount = servedSnapshot.data().count;
        const activeEntry = !calledSnapshot.empty ? calledSnapshot.docs[0].data() : null;

        return {
          _id: doc.id,
          queueName: queueData.queueName,
          queueCode: queueData.queueCode,
          averageServiceTime: queueData.averageServiceTime,
          tokenPrefix: queueData.tokenPrefix,
          lastTokenNumber: queueData.lastTokenNumber || 0,
          waitingCount: waitingCount || 0,
          servedCount: servedCount || 0,
          currentServing: activeEntry ? activeEntry.token : 'None',
          // Queue config fields
          isOpen: queueData.isOpen !== false, // default true for backwards-compat
          remoteJoiningEnabled: queueData.remoteJoiningEnabled === true,
          qrVersion: queueData.qrVersion || 1,
          publicCredential: queueData.publicCredential || '',
        };
      })
    );

    queuesWithStats.sort((a: any, b: any) => (b._id > a._id ? 1 : -1));
    return NextResponse.json(queuesWithStats);
  } catch (error: any) {
    console.error('[GET /api/queues] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error fetching queues' }, { status: 500 });
  }
}

// POST /api/queues — create a queue (staff-only)
export async function POST(req: NextRequest) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    const body = await req.json();
    const { queueName, averageServiceTime } = body;

    if (!queueName || !averageServiceTime) {
      return NextResponse.json({ message: 'All fields are required' }, { status: 400 });
    }

    // Generate unique queue code
    const cleanPrefix = queueName.trim().toUpperCase().replace(/[^A-Z0-9\s-]/g, '').replace(/[\s-]+/g, '-');
    const codePrefix = cleanPrefix || 'QUEUE';
    const suffixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    let codeNormalized = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 100) {
      attempts++;
      const suffixLen = Math.floor(Math.random() * 3) + 4;
      let suffix = '';
      for (let i = 0; i < suffixLen; i++) {
        suffix += suffixChars.charAt(Math.floor(Math.random() * suffixChars.length));
      }
      codeNormalized = `${codePrefix}-${suffix}`;
      const existing = await adminDb.collection('queues').where('queueCode', '==', codeNormalized).limit(1).get();
      if (existing.empty) isUnique = true;
    }

    if (!isUnique) {
      return NextResponse.json({ message: 'Could not generate a unique queue code.' }, { status: 500 });
    }

    let tokenPrefix = queueName.trim().charAt(0).toUpperCase();
    if (!/^[A-Z]$/.test(tokenPrefix)) tokenPrefix = 'A';

    // Generate initial public credential (UUID for QR encoding)
    const publicCredential = crypto.randomUUID();

    const queueDocRef = adminDb.collection('queues').doc();
    const newQueueData = {
      queueName: queueName.trim(),
      queueCode: codeNormalized,
      averageServiceTime: Number(averageServiceTime),
      tokenPrefix,
      lastTokenNumber: 0,
      ownerId: user._id,
      userId: user._id,
      createdAt: new Date().toISOString(),
      // New config fields
      isOpen: true,
      remoteJoiningEnabled: false,
      qrVersion: 1,
      publicCredential,
    };

    await queueDocRef.set(newQueueData);

    return NextResponse.json(
      {
        _id: queueDocRef.id,
        queueName: newQueueData.queueName,
        queueCode: newQueueData.queueCode,
        averageServiceTime: newQueueData.averageServiceTime,
        tokenPrefix: newQueueData.tokenPrefix,
        lastTokenNumber: newQueueData.lastTokenNumber,
        isOpen: true,
        remoteJoiningEnabled: false,
        qrVersion: 1,
        publicCredential,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/queues] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error creating queue' }, { status: 500 });
  }
}
