import { NextRequest, NextResponse } from 'next/server';
import { requireStaffUser } from '@/lib/authMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { WriteBatch } from 'firebase-admin/firestore';

/**
 * POST /api/queues/:id/regenerate-qr
 *
 * Rotates the queue's publicCredential and increments qrVersion.
 * Existing active entries remain valid — only saved-queue references using the
 * OLD credential are invalidated (marked isValid=false in savedQueues collection).
 *
 * Staff-only. Only the queue owner may regenerate.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error, status } = await requireStaffUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: status || 401 });
    }

    const { id } = await params;
    const queueRef = adminDb.collection('queues').doc(id);
    const queueDoc = await queueRef.get();

    if (!queueDoc.exists) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }
    if (queueDoc.data()?.userId !== user._id) {
      return NextResponse.json({ message: 'Unauthorized — you do not own this queue' }, { status: 403 });
    }

    const oldCredential = queueDoc.data()?.publicCredential || '';
    const oldVersion = queueDoc.data()?.qrVersion || 1;
    const newCredential = crypto.randomUUID();
    const newVersion = oldVersion + 1;

    // Update queue with new credential
    await queueRef.update({ publicCredential: newCredential, qrVersion: newVersion });

    // Mark all saved queues that used the old credential as invalid
    if (oldCredential) {
      const savedSnap = await adminDb
        .collection('savedQueues')
        .where('queueId', '==', id)
        .where('publicCredential', '==', oldCredential)
        .get();

      if (!savedSnap.empty) {
        const batch: WriteBatch = adminDb.batch();
        savedSnap.docs.forEach((doc) => {
          batch.update(doc.ref, { isValid: false });
        });
        await batch.commit();
        console.log(`[regenerate-qr] Invalidated ${savedSnap.size} saved queue reference(s) for queue ${id}`);
      }
    }

    return NextResponse.json({
      _id: id,
      publicCredential: newCredential,
      qrVersion: newVersion,
      message: `QR code regenerated. Version is now ${newVersion}.`,
    });
  } catch (error: any) {
    console.error('[POST /api/queues/[id]/regenerate-qr] Error:', error);
    return NextResponse.json({ message: error?.message || 'Error regenerating QR code' }, { status: 500 });
  }
}
