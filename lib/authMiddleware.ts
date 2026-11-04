import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  photoURL?: string;
}

interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}

const tokenCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const cleanExpiredCache = () => {
  const now = Date.now();
  if (tokenCache.size > 200) {
    for (const [k, v] of tokenCache.entries()) {
      if (v.expiresAt <= now) tokenCache.delete(k);
    }
  }
};

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Uses in-memory caching and role validation against Firestore and custom claims.
 */
export const getAuthUser = async (
  req: NextRequest
): Promise<{ user: AuthUser | null; error: string | null; status?: number }> => {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Not authorized, no token', status: 401 };
  }

  const token = authHeader.split(' ')[1];

  // 1. Check in-memory token cache (0ms return for active sessions)
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) {
    return { user: cached.user, error: null, status: 200 };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    let name = decodedToken.name || (decodedToken.email ? decodedToken.email.split('@')[0] : 'User');
    const email = decodedToken.email || '';
    let photoURL = decodedToken.picture || undefined;
    let role = (decodedToken.role as string) || '';

    // If role claim is missing from the token, fetch authoritative role from Firestore
    if (!role) {
      const [userDoc, authUserRecord] = await Promise.all([
        adminDb.collection('users').doc(uid).get().catch((err) => {
          console.warn('[authMiddleware] Firestore lookup warning:', err);
          return null;
        }),
        adminAuth.getUser(uid).catch((err) => {
          console.warn('[authMiddleware] Auth lookup warning:', err);
          return null;
        }),
      ]);

      const firestoreData = userDoc?.exists ? userDoc.data() : null;
      const firestoreRole = firestoreData?.role || null;
      const claimRole = authUserRecord?.customClaims?.role || null;

      // Authoritative role resolution:
      // 1. Firestore document role
      // 2. Auth custom claim
      // 3. Fallback default to 'customer'
      if (firestoreRole) {
        role = firestoreRole;
      } else if (claimRole) {
        role = claimRole;
      } else {
        role = 'customer';
      }

      if (firestoreData?.name) {
        name = firestoreData.name;
      }
      if (firestoreData?.photoURL) {
        photoURL = firestoreData.photoURL;
      }

      // Sync custom claims if needed
      if (claimRole !== role) {
        adminAuth.setCustomUserClaims(uid, {
          ...(authUserRecord?.customClaims || {}),
          role,
        }).catch(() => {});
      }
    }

    const user: AuthUser = {
      _id: uid,
      name,
      email,
      role,
      photoURL,
    };

    // Cache the verified user session
    tokenCache.set(token, { user, expiresAt: now + CACHE_TTL_MS });
    cleanExpiredCache();

    return { user, error: null, status: 200 };
  } catch (error: any) {
    console.error('[authMiddleware] Token verification error:', error?.message);
    if (error?.code === 'auth/id-token-expired') {
      return { user: null, error: 'Session expired. Please log in again.', status: 401 };
    }
    return { user: null, error: 'Not authorized, token failed', status: 401 };
  }
};

/**
 * Requires the authenticated user to hold 'staff' or 'admin' role.
 * Strictly blocks customers from accessing staff API routes (returns 403 Forbidden).
 */
export const requireStaffUser = async (
  req: NextRequest
): Promise<{ user: AuthUser | null; error: string | null; status: number }> => {
  const { user, error, status } = await getAuthUser(req);

  if (error || !user) {
    return { user: null, error: error || 'Not authorized', status: status || 401 };
  }

  if (user.role !== 'staff' && user.role !== 'admin') {
    return {
      user: null,
      error: 'Staff access required. Customers are not permitted to perform this action.',
      status: 403,
    };
  }

  return { user, error: null, status: 200 };
};
