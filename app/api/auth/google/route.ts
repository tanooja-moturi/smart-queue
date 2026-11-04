import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

/**
 * POST /api/auth/google
 *
 * Secure Google Sign-In backend handler.
 *
 * Requirements:
 * 1. Verifies the Firebase ID token from the Bearer header or body.
 * 2. Extracts authenticated UID, email, displayName, and profile photo.
 * 3. Checks Firestore 'users' collection by UID (preventing duplicate documents).
 * 4. If user exists:
 *    - Retrieves and preserves existing role ('staff', 'admin', 'customer') without overwriting.
 *    - Preserves existing profile information.
 *    - Updates lastLoginAt and non-destructively updates photoURL if missing.
 *    - Synchronizes Firebase Auth custom claims to match authoritative role.
 * 5. If user does not exist:
 *    - Creates a new user profile document in Firestore with default role 'customer'.
 *    - Assigns Firebase Auth custom claims { role: 'customer' }.
 * 6. Returns the authoritative profile to the client.
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
    const email = decoded.email || body.email || '';
    const name =
      decoded.name ||
      body.name ||
      (email ? email.split('@')[0] : 'User');
    const photoURL = decoded.picture || body.photoURL || '';

    // 2. Check Firestore users collection by UID
    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    // 3. If user exists -> Preserve existing role & profile
    if (userDoc.exists) {
      const existingData = userDoc.data() || {};
      const existingRole = existingData.role || (decoded.role as string) || 'customer';

      // Update non-sensitive tracking info without modifying role or existing profile
      const updatePayload: Record<string, any> = {
        lastLoginAt: new Date().toISOString(),
      };
      if (!existingData.photoURL && photoURL) {
        updatePayload.photoURL = photoURL;
      }
      await userRef.update(updatePayload);

      // Ensure Firebase Auth custom claims match the authoritative Firestore role
      try {
        const authUser = await adminAuth.getUser(uid);
        if (authUser.customClaims?.role !== existingRole) {
          await adminAuth.setCustomUserClaims(uid, {
            ...(authUser.customClaims || {}),
            role: existingRole,
          });
        }
      } catch (claimErr) {
        console.warn('[auth/google] Failed to sync custom claims for existing user:', claimErr);
      }

      return NextResponse.json({
        _id: uid,
        name: existingData.name || name,
        email: existingData.email || email,
        photoURL: existingData.photoURL || photoURL,
        role: existingRole,
        isNewUser: false,
      });
    }

    // 4. If user does not exist -> Create with default role 'customer'
    // Check if auth record already carries a pre-assigned claim (e.g., admin pre-provisioning)
    let assignedRole = 'customer';
    try {
      const authUser = await adminAuth.getUser(uid);
      if (authUser.customClaims?.role) {
        assignedRole = authUser.customClaims.role;
      }
    } catch (authErr) {
      console.warn('[auth/google] Could not check existing user record:', authErr);
    }

    const newProfile = {
      name,
      email,
      photoURL,
      role: assignedRole,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    await userRef.set(newProfile);

    // Set custom claim in Firebase Authentication
    try {
      await adminAuth.setCustomUserClaims(uid, {
        role: assignedRole,
      });
    } catch (claimErr) {
      console.warn('[auth/google] Failed to set custom claims for new user:', claimErr);
    }

    return NextResponse.json(
      {
        _id: uid,
        name,
        email,
        photoURL,
        role: assignedRole,
        isNewUser: true,
      },
      { status: 201 }
    );
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
