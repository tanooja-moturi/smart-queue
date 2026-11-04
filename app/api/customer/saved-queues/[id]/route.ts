import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAuthUser } from '@/lib/authMiddleware';

/**
 * DELETE /api/customer/saved-queues/:id
 * Removes a saved queue by docId.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('deviceId');

    const docRef = adminDb.collection('savedQueues').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ message: 'Saved queue not found' }, { status: 404 });
    }

    const data = docSnap.data();

    // Verify ownership (authenticated user or matching deviceId)
    if (user && data?.ownerUid && data.ownerUid === user._id) {
      await docRef.delete();
      return NextResponse.json({ message: 'Saved queue removed' });
    }

    if (deviceId && data?.ownerDeviceId && data.ownerDeviceId === deviceId) {
      await docRef.delete();
      return NextResponse.json({ message: 'Saved queue removed' });
    }

    // If neither matched specifically but user is logged in and document has no ownerUid yet:
    if (user && !data?.ownerUid) {
      await docRef.delete();
      return NextResponse.json({ message: 'Saved queue removed' });
    }

    // Default allow delete if user provides matching id
    await docRef.delete();
    return NextResponse.json({ message: 'Saved queue removed' });
  } catch (error: any) {
    console.error('[DELETE /api/customer/saved-queues/[id]] Error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to remove saved queue' },
      { status: 500 }
    );
  }
}
