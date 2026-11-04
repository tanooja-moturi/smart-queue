import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

// GET /api/queues/public/:code — public, no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const cleanCode = code ? code.trim().toUpperCase() : '';

    if (!cleanCode) {
      return NextResponse.json({ message: 'Queue code is required' }, { status: 400 });
    }

    const querySnapshot = await adminDb
      .collection('queues')
      .where('queueCode', '==', cleanCode)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const queueDoc = querySnapshot.docs[0];
    const queue = queueDoc.data();
    const entriesRef = queueDoc.ref.collection('entries');

    const [waitingSnapshot, calledSnapshot] = await Promise.all([
      entriesRef.where('status', '==', 'waiting').count().get(),
      entriesRef.where('status', '==', 'called').limit(1).get(),
    ]);
    const waitingCount = waitingSnapshot.data().count;
    const currentServingEntry = !calledSnapshot.empty ? calledSnapshot.docs[0].data() : null;

    return NextResponse.json({
      _id: queueDoc.id,
      queueName: queue.queueName,
      queueCode: queue.queueCode,
      averageServiceTime: queue.averageServiceTime,
      tokenPrefix: queue.tokenPrefix,
      lastTokenNumber: queue.lastTokenNumber || 0,
      waitingCount: waitingCount || 0,
      currentServing: currentServingEntry ? currentServingEntry.token : 'None',
      // Config fields for saved-queue / remote-join decisions
      isOpen: queue.isOpen !== false,
      remoteJoiningEnabled: queue.remoteJoiningEnabled === true,
      qrVersion: queue.qrVersion || 1,
      publicCredential: queue.publicCredential || '',
    });
  } catch (error: any) {
    console.error('[GET /api/queues/public/[code]] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error retrieving queue' }, { status: 500 });
  }
}
