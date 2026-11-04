import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

/**
 * POST /api/auth/register
 *
 * Two modes:
 *   Case 1 – Client already authenticated with Firebase (client SDK flow).
 *            Receives Bearer token. Creates or updates the Firestore user doc.
 *            Role is read from the existing Firestore doc if it already exists.
 *            Brand-new users (no doc, no custom claims) are assigned 'staff' —
 *            because this endpoint is called exclusively from the Staff Portal.
 *
 *   Case 2 – Server-side registration (email + password supplied in body).
 *            Creates the Firebase Auth account, then writes the Firestore doc
 *            with role = 'staff'.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const body = await req.json().catch(() => ({}));
    const { name, email, password } = body;

    // ── Case 1: Client has already authenticated (standard client SDK flow) ──
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = await adminAuth.verifyIdToken(token);
      const uid = decoded.uid;
      const userEmail = decoded.email || '';
      const userName =
        name?.trim() ||
        decoded.name ||
        (userEmail ? userEmail.split('@')[0] : 'User');

      const userRef = adminDb.collection('users').doc(uid);
      const existingDoc = await userRef.get();
      const firestoreRole = existingDoc.exists ? existingDoc.data()?.role : null;

      // Check Firebase Authentication custom claims
      let authRole = (decoded.role as string) || '';
      let authUserRecord: any = null;
      try {
        authUserRecord = await adminAuth.getUser(uid);
        if (authUserRecord.customClaims?.role) {
          authRole = authUserRecord.customClaims.role;
        }
      } catch (authErr) {
        console.warn('[register] Failed to fetch Firebase Auth user record:', authErr);
      }

      // Role assignment for the Staff Portal:
      // - 'admin' is always preserved.
      // - 'staff' is preserved.
      // - No role (new user) → 'staff'.
      // - 'customer' (written by the old registration bug) → corrected to 'staff'.
      //   Firebase Auth accounts belong exclusively to staff members; customers
      //   use anonymous device sessions and never hold Firebase Auth accounts.
      let role: string;
      if (authRole === 'admin' || firestoreRole === 'admin') {
        role = 'admin';
      } else if (firestoreRole) {
        role = firestoreRole;
      } else {
        role = 'staff';
      }

      if (existingDoc.exists) {
        await userRef.update({
          name: userName,
          role,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await userRef.set({
          name: userName,
          email: userEmail,
          role,
          createdAt: new Date().toISOString(),
        });
      }

      // Ensure Firebase Auth custom claims match authoritative role
      try {
        if (authUserRecord && authUserRecord.customClaims?.role !== role) {
          await adminAuth.setCustomUserClaims(uid, {
            ...(authUserRecord.customClaims || {}),
            role,
          });
        }
      } catch (claimsErr) {
        console.warn('[register] Could not update custom claims:', claimsErr);
      }

      return NextResponse.json(
        { _id: uid, name: userName, email: userEmail, role, token },
        { status: 201 }
      );
    }

    // ── Case 2: Server-side email/password registration ──
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: 'A valid email address is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ message: 'Password must be at least 6 characters' }, { status: 400 });
    }

    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: email.toLowerCase().trim(),
        password,
        displayName: name.trim(),
      });
    } catch (authError: any) {
      if (authError.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { message: 'An account with this email already exists' },
          { status: 400 }
        );
      }
      return NextResponse.json({ message: authError.message || 'Error creating user' }, { status: 400 });
    }

    // New registration via registration flow receives the intended 'staff' role.
    // Set role in both Firestore and Firebase Auth custom claims.
    const role = 'staff';
    await adminDb.collection('users').doc(userRecord.uid).set({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      createdAt: new Date().toISOString(),
    });

    try {
      await adminAuth.setCustomUserClaims(userRecord.uid, { role });
    } catch (claimErr) {
      console.warn('[register] Non-fatal custom claims set error:', claimErr);
    }

    const customToken = await adminAuth.createCustomToken(userRecord.uid);

    return NextResponse.json(
      {
        _id: userRecord.uid,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        token: customToken,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[register] Unexpected error:', error?.message);
    return NextResponse.json(
      { message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
