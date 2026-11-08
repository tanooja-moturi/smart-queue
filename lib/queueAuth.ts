import { adminDb } from '@/lib/firebaseAdmin';
import { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';

export interface QueueAuthCheckResult {
  authorized: boolean;
  status: number;
  message?: string;
  queueDoc?: DocumentSnapshot;
  queueData?: any;
  queueRef?: DocumentReference;
}

/**
 * Enforces individual queue ownership and staff authorization.
 *
 * Rules:
 * - A staff member is authorized if they are the queue's owner (ownerId or legacy userId).
 * - A staff member is authorized if their UID is present in assignedStaff array.
 * - An admin user is authorized across all queues.
 * - Otherwise, access is denied with HTTP 403 Forbidden.
 */
export async function verifyQueueAccess(
  queueId: string,
  user: { _id: string; role: string }
): Promise<QueueAuthCheckResult> {
  if (!queueId) {
    return { authorized: false, status: 400, message: 'Queue ID is required' };
  }

  const queueRef = adminDb.collection('queues').doc(queueId);
  const queueDoc = await queueRef.get();

  if (!queueDoc.exists) {
    return { authorized: false, status: 404, message: 'Queue not found' };
  }

  const queueData = queueDoc.data() || {};
  const ownerId = queueData.ownerId || queueData.userId;
  const isOwner = ownerId === user._id;
  const isAssigned = Array.isArray(queueData.assignedStaff) && queueData.assignedStaff.includes(user._id);
  const isAdmin = user.role === 'admin';

  if (!isOwner && !isAssigned && !isAdmin) {
    return {
      authorized: false,
      status: 403,
      message: 'Forbidden: You do not have permission to manage this queue.',
    };
  }

  return {
    authorized: true,
    status: 200,
    queueDoc,
    queueData,
    queueRef,
  };
}

