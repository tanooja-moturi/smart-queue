'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  updateProfile,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { apiRequest } from '@/lib/api';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<User | null>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  /**
   * Ref flag that is set to `true` while register() or loginWithGoogle() is in the
   * middle of its own API calls. When `true`, the concurrent onAuthStateChanged
   * handler skips its own /auth/me fetch so it cannot race-overwrite the
   * authoritative role that the registration flow is about to set.
   */
  const authFlowActiveRef = useRef(false);

  // ── Sync token and user profile on auth state change ──────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // If a registration / google-login flow is actively in progress, let that
        // flow handle setUser() itself with the authoritative role from the server.
        if (authFlowActiveRef.current) return;
        try {
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('token', token);
          // Always fetch authoritative profile (includes role from Firestore)
          const userData = await apiRequest('/auth/me');
          setUser(userData);
        } catch (err) {
          console.error('[AuthContext] Failed to load user profile:', err);
          // Fallback to minimal Firebase user: read role from token claims if available.
          const token = await firebaseUser.getIdToken().catch(() => '');
          if (token) localStorage.setItem('token', token);
          const idTokenResult = await firebaseUser.getIdTokenResult().catch(() => null);
          const fallbackRole = (idTokenResult?.claims?.role as string) || 'customer';
          setUser({
            _id: firebaseUser.uid,
            name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User'),
            email: firebaseUser.email || '',
            role: fallbackRole,
            photoURL: firebaseUser.photoURL || undefined,
          });
        }
      } else {
        localStorage.removeItem('token');
        setUser(null);
      }
      setLoading(false);
    });

    // Auto-refresh token in localStorage when Firebase refreshes the ID token
    const tokenUnsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        localStorage.setItem('token', token);
      }
    });

    return () => {
      unsubscribe();
      tokenUnsubscribe();
    };
  }, []);

  // ── Email / Password login (Staff Portal) ──────────────────────────────────
  const login = React.useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await userCredential.user.getIdToken(true);
      localStorage.setItem('token', token);
      const userData = await apiRequest('/auth/me');
      setUser(userData);
    } catch (err: any) {
      setUser(null);
      let errorMsg = 'Invalid email or password';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        errorMsg = 'Invalid email or password';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed login attempts. Please try again later.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Google login (Customer & Staff) ────────────────────────────────────────
  const loginWithGoogle = React.useCallback(async (): Promise<User | null> => {
    setLoading(true);
    authFlowActiveRef.current = true;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken(true);
      localStorage.setItem('token', token);

      // Authenticate with backend: creates 'customer' for new users,
      // preserves existing 'staff'/'admin'/'customer' roles without overwriting.
      const userData: User = await apiRequest('/auth/google', 'POST', {
        name: result.user.displayName || (result.user.email ? result.user.email.split('@')[0] : 'User'),
        email: result.user.email || '',
        photoURL: result.user.photoURL || '',
      });

      // Force-refresh ID token so client holds custom claims set by backend
      try {
        const refreshedToken = await result.user.getIdToken(true);
        localStorage.setItem('token', refreshedToken);
      } catch {
        // Non-fatal
      }

      setUser(userData);
      return userData;
    } catch (err: any) {
      setUser(null);
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request' ||
        err.message?.includes('popup-closed-by-user')
      ) {
        // User closed or dismissed the popup — handle gracefully
        return null;
      }
      let errorMsg = 'Google sign-in failed. Please try again.';
      if (err.code === 'auth/popup-blocked') {
        errorMsg = 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMsg = 'Network connection failed. Please check your internet connection.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      throw new Error(errorMsg);
    } finally {
      authFlowActiveRef.current = false;
      setLoading(false);
    }
  }, []);

  // ── Email / Password registration (Staff Portal) ───────────────────────────
  const register = React.useCallback(async (name: string, email: string, password: string) => {
    setLoading(true);
    authFlowActiveRef.current = true;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(userCredential.user, { displayName: name.trim() });

      // Fresh ID token for Bearer authentication
      const token = await userCredential.user.getIdToken(true);
      localStorage.setItem('token', token);

      // Create authoritative Firestore profile with role = 'staff'
      const registeredData = await apiRequest('/auth/register', 'POST', { name: name.trim() });

      // Refresh token with new custom claims
      try {
        const refreshedToken = await userCredential.user.getIdToken(true);
        localStorage.setItem('token', refreshedToken);
      } catch {
        // Non-fatal
      }

      setUser(registeredData);
    } catch (err: any) {
      setUser(null);
      let errorMsg = 'Registration failed. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'An account with this email already exists.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'Password must be at least 6 characters long.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please provide a valid email address.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      throw new Error(errorMsg);
    } finally {
      authFlowActiveRef.current = false;
      setLoading(false);
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = React.useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('[AuthContext] Error signing out:', err);
    }
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const contextValue = React.useMemo(
    () => ({ user, loading, login, loginWithGoogle, register, logout }),
    [user, loading, login, loginWithGoogle, register, logout]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
