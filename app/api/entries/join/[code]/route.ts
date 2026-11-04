import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAuthUser } from '@/lib/authMiddleware';
import { Transaction } from 'firebase-admin/firestore';

// POST /api/entries/join/:code — public, no auth required
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const cleanCode = code ? code.trim().toUpperCase() : '';
    const body = await req.json();
    const { customerName, deviceId } = body;

    const { user } = await getAuthUser(req).catch(() => ({ user: null }));

    if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') {
      return NextResponse.json({ message: 'Customer name is required' }, { status: 400 });
    }

    const trimmedName = customerName.trim();

    // 1. Find Queue by code
    const queueQuery = await adminDb
      .collection('queues')
      .where('queueCode', '==', cleanCode)
      .limit(1)
      .get();

    if (queueQuery.empty) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const queueDoc = queueQuery.docs[0];
    const qData = queueDoc.data();

    // Check if queue is open
    if (qData.isOpen === false) {
      return NextResponse.json(
        { message: 'This queue is currently closed and not accepting new entries.' },
        { status: 400 }
      );
    }

    const queueRef = queueDoc.ref;
    const entriesRef = queueRef.collection('entries');

    // 2. Check if customer is already active in this queue (waiting or called)
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
        queueId: queueDoc.id,
        queueCode: cleanCode,
        queueName: qData.queueName || 'Queue',
        token: data.token,
        status: data.status,
        joinedAt: data.joinedAt,
      });
    }

    // 3. Atomically increment lastTokenNumber and create entry within a Firestore Transaction
    const newEntry = await adminDb.runTransaction(async (transaction: Transaction) => {
      const freshQueueSnap = await transaction.get(queueRef);
      if (!freshQueueSnap.exists) {
        throw new Error('Queue not found during transaction');
      }

      const freshQueue = freshQueueSnap.data()!;
      if (freshQueue.isOpen === false) {
        throw new Error('This queue is currently closed.');
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
        queueId: queueDoc.id,
        token,
        status: 'waiting',
        joinedAt,
        calledAt: null,
        servedAt: null,
        isRemote: false,
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

    // 4. Broadcast real-time update via Socket.IO
    const io = (global as any).io;
    if (io) {
      io.to(queueDoc.id.toString()).emit('queue_updated', { queueId: queueDoc.id });
    }

    return NextResponse.json(
      {
        _id: newEntry._id,
        customerName: newEntry.customerName,
        queueId: newEntry.queueId,
        queueCode: cleanCode,
        queueName: qData.queueName || 'Queue',
        token: newEntry.token,
        status: newEntry.status,
        joinedAt: newEntry.joinedAt,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/entries/join/[code]] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error joining queue' }, { status: 500 });
  }
}
