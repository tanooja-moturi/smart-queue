import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

/**
 * POST /api/auth/google
 *
 * Secure Google Sign-In backend handler.
 *
 * Requirements:
 * 1. Verifies the Firebase ID token from Bearer header or body.
 * 2. Automatic Role Assignment:
 *    - Signing in via Staff Login (portal: 'staff') -> assigns role: "staff" (or "admin").
 *    - Signing in via Customer Login (portal: 'customer') -> assigns role: "customer".
 *    - No hardcoded email allowlist or STAFF_EMAILS required.
 *    - Preserves "admin" role if user is an existing admin.
 * 3. Prevents duplicate user documents by keying on UID.
 * 4. Synchronizes Firebase Auth custom claims to match authoritative role.
 * 5. Returns profile { _id, name, email, photoURL, role, isNewUser }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const body = await req.json().catch(() => ({}));
    const token =
      (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null) ||
      body.idToken;

    if (!token) {
      return NextResponse.json({ message: 'Authentication token is required' }, { status: 401 });
    }

    // 1. Verify Firebase ID token
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = (decoded.email || body.email || '').trim().toLowerCase();
    const name =
      decoded.name ||
      body.name ||
      (email ? email.split('@')[0] : 'User');
    const photoURL = decoded.picture || body.photoURL || '';

    // Determine target portal (staff vs customer)
    const portal = body.portal === 'staff' ? 'staff' : 'customer';

    // 2. Check Firestore users collection by UID
    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    let authUserRecord: any = null;
    try {
      authUserRecord = await adminAuth.getUser(uid);
    } catch (err) {
      console.warn('[auth/google] Warning fetching user record:', err);
    }

    const existingData = userDoc.exists ? (userDoc.data() || {}) : null;
    const existingRole = existingData?.role || authUserRecord?.customClaims?.role || null;

    // Determine authoritative role:
    // - If existing user is 'admin' or token is 'admin' -> 'admin'
    // - If signing in through Staff portal -> 'staff'
    // - If signing in through Customer portal -> 'customer'
    let resolvedRole: string;
    if (existingRole === 'admin' || decoded.role === 'admin') {
      resolvedRole = 'admin';
    } else if (portal === 'staff') {
      resolvedRole = 'staff';
    } else {
      resolvedRole = 'customer';
    }

    const now = new Date().toISOString();

    if (userDoc.exists) {
      const updatePayload: Record<string, any> = {
        lastLoginAt: now,
      };
      if (existingData?.role !== resolvedRole) {
        updatePayload.role = resolvedRole;
        updatePayload.updatedAt = now;
      }
      if (!existingData?.photoURL && photoURL) {
        updatePayload.photoURL = photoURL;
      }
      await userRef.update(updatePayload);
    } else {
      const newProfile = {
        name,
        email,
        photoURL,
        role: resolvedRole,
        createdAt: now,
        lastLoginAt: now,
      };
      await userRef.set(newProfile);
    }

    // Ensure Firebase Auth custom claims match the authoritative role
    try {
      if (!authUserRecord || authUserRecord.customClaims?.role !== resolvedRole) {
        await adminAuth.setCustomUserClaims(uid, {
          ...(authUserRecord?.customClaims || {}),
          role: resolvedRole,
        });
      }
    } catch (claimErr) {
      console.warn('[auth/google] Failed to sync custom claims:', claimErr);
    }

    return NextResponse.json({
      _id: uid,
      name: existingData?.name || name,
      email: existingData?.email || email,
      photoURL: existingData?.photoURL || photoURL,
      role: resolvedRole,
      isNewUser: !userDoc.exists,
    });
  } catch (error: any) {
    console.error('[auth/google] Error in Google authentication handler:', error);
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ message: 'Session expired. Please sign in again.' }, { status: 401 });
    }
    return NextResponse.json(
      { message: error?.message || 'Failed to authenticate with Google' },
      { status: 500 }
    );
  }
}
