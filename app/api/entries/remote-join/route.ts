import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAuthUser } from '@/lib/authMiddleware';
import { Transaction } from 'firebase-admin/firestore';

/**
 * POST /api/entries/remote-join
 *
 * Allows a customer with a valid saved queue credential to join remotely.
 *
 * Requirements:
 * - Queue must exist.
 * - Queue must be open (isOpen !== false).
 * - Remote joining must be enabled (remoteJoiningEnabled === true).
 * - publicCredential and qrVersion must match the current queue values.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    const body = await req.json();
    const {
      queueId,
      queueCode,
      customerName,
      publicCredential,
      qrVersion,
      deviceId,
    } = body;

    if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') {
      return NextResponse.json({ message: 'Customer name is required' }, { status: 400 });
    }

    if (!queueId && !queueCode) {
      return NextResponse.json({ message: 'Queue identifier (queueId or queueCode) is required' }, { status: 400 });
    }

    if (!publicCredential) {
      return NextResponse.json({ message: 'Queue credential is required for remote joining' }, { status: 400 });
    }

    const trimmedName = customerName.trim();

    // 1. Fetch Queue document
    let queueDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (queueId) {
      const snap = await adminDb.collection('queues').doc(queueId).get();
      if (snap.exists) queueDoc = snap;
    }
    if (!queueDoc && queueCode) {
      const querySnap = await adminDb
        .collection('queues')
        .where('queueCode', '==', queueCode.trim().toUpperCase())
        .limit(1)
        .get();
      if (!querySnap.empty) queueDoc = querySnap.docs[0];
    }

    if (!queueDoc || !queueDoc.exists) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const qData = queueDoc.data()!;
    const actualQueueId = queueDoc.id;

    // 2. Validate Queue Open status
    if (qData.isOpen === false) {
      return NextResponse.json(
        { message: 'This queue is currently closed and not accepting new entries.' },
        { status: 400 }
      );
    }

    // 3. Validate Remote Joining is enabled
    if (!qData.remoteJoiningEnabled) {
      return NextResponse.json(
        { message: 'Remote joining is currently disabled for this queue. Please join in person by scanning the QR code.' },
        { status: 403 }
      );
    }

    // 4. Validate publicCredential and qrVersion
    if (qData.publicCredential && qData.publicCredential !== publicCredential) {
      return NextResponse.json(
        {
          message: 'The QR code for this queue has been regenerated. Please scan the current in-store QR code to renew your access.',
          expired: true,
        },
        { status: 400 }
      );
    }

    if (qrVersion && qData.qrVersion && Number(qData.qrVersion) !== Number(qrVersion)) {
      return NextResponse.json(
        {
          message: 'The QR version for this queue has expired. Please scan the current in-store QR code to renew your access.',
          expired: true,
        },
        { status: 400 }
      );
    }

    const queueRef = queueDoc.ref;
    const entriesRef = queueRef.collection('entries');

    // 5. Check if customer already has an active entry in this queue
    const existingWaiting = await entriesRef
      .where('customerName', '==', trimmedName)
      .where('status', 'in', ['waiting', 'called'])
      .limit(1)
      .get();

    if (!existingWaiting.empty) {
      const existingDoc = existingWaiting.docs[0];
      const data = existingDoc.data();
      return NextResponse.json({
        _id: existingDoc.id,
        customerName: data.customerName,
        queueId: actualQueueId,
        queueCode: qData.queueCode,
        queueName: qData.queueName,
        token: data.token,
        status: data.status,
        joinedAt: data.joinedAt,
        isRemote: true,
        message: 'You already have an active ticket in this queue.',
      });
    }

    // 6. Transactionally assign next token and create entry
    const newEntry = await adminDb.runTransaction(async (transaction: Transaction) => {
      const freshQueueSnap = await transaction.get(queueRef);
      if (!freshQueueSnap.exists) {
        throw new Error('Queue not found during transaction');
      }

      const freshQueue = freshQueueSnap.data()!;
      if (freshQueue.isOpen === false) {
        throw new Error('This queue is currently closed.');
      }
      if (!freshQueue.remoteJoiningEnabled) {
        throw new Error('Remote joining is not enabled for this queue.');
      }

      const currentLastToken = freshQueue.lastTokenNumber || 0;
      const nextTokenNumber = currentLastToken + 1;
      const tokenPrefix = freshQueue.tokenPrefix || 'A';
      const paddedNum = String(nextTokenNumber).padStart(3, '0');
      const token = `${tokenPrefix}${paddedNum}`;

      const entryDocRef = entriesRef.doc();
      const joinedAt = new Date().toISOString();

      const entryPayload = {
        customerName: trimmedName,
        queueId: actualQueueId,
        token,
        status: 'waiting',
        joinedAt,
        calledAt: null,
        servedAt: null,
        isRemote: true,
        ownerUid: user?._id || null,
        ownerDeviceId: deviceId || null,
      };

      transaction.update(queueRef, { lastTokenNumber: nextTokenNumber });
      transaction.set(entryDocRef, entryPayload);

      return {
        _id: entryDocRef.id,
        ...entryPayload,
      };
    });

    // 7. Emit real-time socket event
    const io = (global as any).io;
    if (io) {
      io.to(actualQueueId.toString()).emit('queue_updated', { queueId: actualQueueId });
    }

    return NextResponse.json(
      {
        _id: newEntry._id,
        customerName: newEntry.customerName,
        queueId: actualQueueId,
        queueCode: qData.queueCode,
        queueName: qData.queueName,
        token: newEntry.token,
        status: newEntry.status,
        joinedAt: newEntry.joinedAt,
        isRemote: true,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/entries/remote-join] Error:', error);
    return NextResponse.json(
      { message: error?.message || 'Error joining queue remotely' },
      { status: 500 }
    );
  }
}
