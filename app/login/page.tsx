'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { LogIn, UserPlus, Users, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login, loginWithGoogle, register } = useAuth();
  const router = useRouter();

  const resetForm = () => {
    setName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    setError(null); setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null); setSuccessMessage(null); setSubmitting(true);
    try {
      if (activeTab === 'login') {
        await login(email, password);
        router.push('/dashboard');
      } else {
        if (password.length < 6) throw new Error('Password must be at least 6 characters long.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await register(name, email, password);
        setSuccessMessage('Account created! Redirecting to dashboard...');
        setTimeout(() => router.push('/dashboard'), 1200);
      }
    } catch (err: any) {
      setError(err.message || (activeTab === 'login' ? 'Login failed.' : 'Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || submitting) return;
    setError(null);
    setSuccessMessage(null);
    setGoogleLoading(true);
    try {
      const loggedUser = await loginWithGoogle();
      if (!loggedUser) {
        // Sign-in dismissed or cancelled by the user
        return;
      }
      if (loggedUser.role === 'customer') {
        router.push('/customer');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      if (err.message) setError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#090d16] px-4">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20 mb-3">
            <Users className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-extrabold text-2xl text-white tracking-tight">Staff Portal</h2>
          <p className="text-gray-400 text-sm mt-1">Access the Smart Queue Management Dashboard</p>
        </div>

        <div className="glass overflow-hidden rounded-3xl border border-white/10 backdrop-blur-md">
          {/* Tabs */}
          <div className="flex border-b border-white/5 bg-black/20">
            {(['login', 'register'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setActiveTab(tab); resetForm(); }}
                className={`flex-1 py-3 text-sm font-semibold transition border-b-2 -mb-[2px] ${
                  activeTab === tab
                    ? 'border-brand-500 text-white bg-white/2'
                    : 'border-transparent text-gray-550 hover:text-gray-300'
                }`}
              >
                {tab === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <div className="p-8 space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-200 text-sm">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm">
                {successMessage}
              </div>
            )}

            {/* Google button */}
            <button
              type="button"
              id="btn-google"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || submitting}
              className="w-full py-3 bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-800 font-semibold text-sm rounded-xl transition flex items-center justify-center gap-3 shadow-md"
            >
              {googleLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  {/* Google "G" SVG */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-gray-600 text-xs font-medium uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Email / Password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === 'register' && (
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2" htmlFor="name">
                    Full Name
                  </label>
                  <input
                    id="name" type="text" required
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none text-sm transition"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email" type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@queue.com"
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none text-sm transition"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2" htmlFor="password">
                  Password
                </label>
                <input
                  id="password" type="password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-gray-650 outline-none text-sm transition"
                />
              </div>

              {activeTab === 'register' && (
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword" type="password" required
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-gray-650 outline-none text-sm transition"
                  />
                </div>
              )}

              <button
                type="submit"
                id={activeTab === 'login' ? 'btn-login' : 'btn-register'}
                disabled={submitting || googleLoading}
                className="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
              >
                {activeTab === 'login' ? (
                  <>{submitting ? 'Authenticating...' : 'Sign In'} <LogIn className="w-4 h-4" /></>
                ) : (
                  <>{submitting ? 'Creating Account...' : 'Create Account'} <UserPlus className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-400 transition">
            ← Back to Home Page
          </button>
        </div>
      </div>
    </div>
  );
}
