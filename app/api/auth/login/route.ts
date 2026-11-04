import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const body = await req.json().catch(() => ({}));
    const { email, password, idToken } = body;

    // Case 1: Client already has an ID token (from Client SDK or Bearer header)
    const tokenToVerify = idToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    if (tokenToVerify) {
      const decoded = await adminAuth.verifyIdToken(tokenToVerify);
      const uid = decoded.uid;
      const userDoc = await adminDb.collection('users').doc(uid).get();
      const userData = userDoc.data();
      const firestoreRole = userData?.role || null;

      // Check Firebase Auth custom claims
      let authRole = (decoded.role as string) || '';
      let authUserRecord: any = null;
      try {
        authUserRecord = await adminAuth.getUser(uid);
        if (authUserRecord.customClaims?.role) {
          authRole = authUserRecord.customClaims.role;
        }
      } catch (authErr) {
        console.warn('[login] Failed to fetch Firebase Auth user record:', authErr);
      }

      // Preserve existing role: admin is preserved, staff is preserved, customer is preserved.
      let role: string;
      if (authRole === 'admin' || firestoreRole === 'admin') {
        role = 'admin';
      } else if (firestoreRole) {
        role = firestoreRole;
      } else if (authRole) {
        role = authRole;
      } else {
        role = 'staff';
      }

      // Keep both stores in sync
      if (!userDoc.exists) {
        await adminDb.collection('users').doc(uid).set({
          name: userData?.name || decoded.name || decoded.email?.split('@')[0] || 'User',
          email: decoded.email || '',
          role,
          createdAt: new Date().toISOString(),
        });
      } else if (userData?.role !== role) {
        await adminDb.collection('users').doc(uid).update({ role });
      }

      if (authUserRecord && authUserRecord.customClaims?.role !== role) {
        try {
          await adminAuth.setCustomUserClaims(uid, {
            ...(authUserRecord.customClaims || {}),
            role,
          });
        } catch (claimErr) {
          console.warn('[login] Failed to sync custom claims:', claimErr);
        }
      }

      return NextResponse.json({
        _id: uid,
        name: userData?.name || decoded.name || decoded.email?.split('@')[0] || 'User',
        email: decoded.email || userData?.email || '',
        role,
        token: tokenToVerify,
      });
    }

    // Case 2: Direct email/password submission via API
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ message: 'Password is required' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { message: 'Firebase API key configuration is missing on server' },
        { status: 500 }
      );
    }

    // Call Firebase Auth REST API to verify password
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorCode = data?.error?.message;
      if (
        errorCode === 'EMAIL_NOT_FOUND' ||
        errorCode === 'INVALID_PASSWORD' ||
        errorCode === 'INVALID_LOGIN_CREDENTIALS'
      ) {
        return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
      }
      return NextResponse.json({ message: data?.error?.message || 'Authentication failed' }, { status: 401 });
    }

    const uid = data.localId;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const firestoreRole = userData?.role || null;

    let authRole = '';
    let authUserRecord: any = null;
    try {
      authUserRecord = await adminAuth.getUser(uid);
      if (authUserRecord.customClaims?.role) {
        authRole = authUserRecord.customClaims.role;
      }
    } catch (authErr) {
      console.warn('[login] Failed to fetch Firebase Auth user record:', authErr);
    }

    // Preserve existing role: admin is preserved, staff is preserved, customer is preserved.
    let role: string;
    if (authRole === 'admin' || firestoreRole === 'admin') {
      role = 'admin';
    } else if (firestoreRole) {
      role = firestoreRole;
    } else if (authRole) {
      role = authRole;
    } else {
      role = 'staff';
    }

    // Keep both stores in sync
    if (!userDoc.exists) {
      await adminDb.collection('users').doc(uid).set({
        name: userData?.name || data.displayName || email.split('@')[0],
        email: data.email || email,
        role,
        createdAt: new Date().toISOString(),
      });
    } else if (userData?.role !== role) {
      await adminDb.collection('users').doc(uid).update({ role });
    }

    if (authUserRecord && authUserRecord.customClaims?.role !== role) {
      try {
        await adminAuth.setCustomUserClaims(uid, {
          ...(authUserRecord.customClaims || {}),
          role,
        });
      } catch (claimErr) {
        console.warn('[login] Failed to sync custom claims:', claimErr);
      }
    }

    return NextResponse.json({
      _id: uid,
      name: userData?.name || data.displayName || email.split('@')[0],
      email: data.email,
      role,
      token: data.idToken,
    });
  } catch (error: any) {
    console.error('[login] Unexpected error:', error?.message);
    return NextResponse.json({ message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
