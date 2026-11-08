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
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { apiRequest } from '@/lib/api';

export interface User {
  _id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role: string;
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, portal?: 'staff' | 'customer') => Promise<User>;
  loginWithGoogle: (portal?: 'staff' | 'customer') => Promise<User | null>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
        // If an active auth flow is in progress, let that flow handle setUser()
        if (authFlowActiveRef.current) return;
        try {
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('token', token);
          // Always fetch authoritative profile (includes role from Firestore)
          const userData = await apiRequest('/auth/me');
          setUser(userData);
        } catch (err) {
          console.error('[AuthContext] Failed to load user profile:', err);
          const token = await firebaseUser.getIdToken().catch(() => '');
          if (token) localStorage.setItem('token', token);
          const idTokenResult = await firebaseUser.getIdTokenResult().catch(() => null);
          const fallbackRole = (idTokenResult?.claims?.role as string) || 'customer';
          const phone = firebaseUser.phoneNumber || undefined;
          const name =
            firebaseUser.displayName ||
            (phone ? `Customer (${phone.slice(-4)})` : (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Customer'));
          setUser({
            _id: firebaseUser.uid,
            name,
            email: firebaseUser.email || '',
            phoneNumber: phone,
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

  // ── Email / Password login (Customer & Staff) ─────────────────────────────
  const login = React.useCallback(async (email: string, password: string, portal: 'staff' | 'customer' = 'staff'): Promise<User> => {
    setLoading(true);
    authFlowActiveRef.current = true;
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await userCredential.user.getIdToken(true);
      localStorage.setItem('token', token);

      // Authenticate with backend: assigns role based on selected portal
      const userData: User = await apiRequest('/auth/login', 'POST', { portal });

      try {
        const refreshedToken = await userCredential.user.getIdToken(true);
        localStorage.setItem('token', refreshedToken);
      } catch {
        // Non-fatal
      }

      setUser(userData);
      return userData;
    } catch (err: any) {
      setUser(null);
      let errorMsg = 'Invalid email or password';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-email'
      ) {
        errorMsg = 'Invalid email or password';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed login attempts. Please try again later.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      throw new Error(errorMsg);
    } finally {
      authFlowActiveRef.current = false;
      setLoading(false);
    }
  }, []);

  // ── Google login (Customer & Staff) ────────────────────────────────────────
  const loginWithGoogle = React.useCallback(async (portal: 'staff' | 'customer' = 'customer'): Promise<User | null> => {
    setLoading(true);
    authFlowActiveRef.current = true;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken(true);
      localStorage.setItem('token', token);

      // Authenticate with backend: assigns role based on selected portal
      // - Staff Login portal -> role: "staff"
      // - Customer Login portal -> role: "customer"
      const userData: User = await apiRequest('/auth/google', 'POST', {
        portal,
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

  // ── Forgot Password (Send Reset Email) ─────────────────────────────────────
  const sendPasswordReset = React.useCallback(async (email: string): Promise<void> => {
    if (!email || !email.trim()) {
      throw new Error('Please enter your email address.');
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      let errorMsg = 'Failed to send password reset email.';
      if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please provide a valid email address.';
      } else if (err.code === 'auth/user-not-found') {
        errorMsg = 'No account found with this email address.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Too many requests. Please wait a few moments and try again.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      throw new Error(errorMsg);
    }
  }, []);

  // ── Change Password (Authenticated User) ───────────────────────────────────
  const changePassword = React.useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be signed in to change your password.');
    }

    const isPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');
    if (!isPasswordProvider) {
      throw new Error('Your account is signed in with Google. Password change is not applicable for Google sign-in accounts.');
    }

    if (!currentPassword) {
      throw new Error('Current password is required.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    try {
      const email = currentUser.email;
      if (!email) throw new Error('Email address not found on user profile.');

      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
    } catch (err: any) {
      let errorMsg = 'Failed to update password.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = 'Current password is incorrect.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'New password must be at least 6 characters long.';
      } else if (err.code === 'auth/requires-recent-login') {
        errorMsg = 'For security, please sign out and sign back in before changing your password.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      throw new Error(errorMsg);
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
    () => ({
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      sendPasswordReset,
      changePassword,
    }),
    [user, loading, login, loginWithGoogle, register, logout, sendPasswordReset, changePassword]
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
