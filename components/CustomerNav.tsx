'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCustomer } from '@/context/CustomerContext';
import { Users, QrCode, Home, LogOut, LogIn } from 'lucide-react';

interface CustomerNavProps {
  onOpenScanner?: () => void;
}

export const CustomerNav: React.FC<CustomerNavProps> = ({ onOpenScanner }) => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { clearCustomerSession } = useCustomer();

  const handleExitSession = async () => {
    if (user) {
      await logout();
    }
    clearCustomerSession();
    router.push('/');
  };

  return (
    <nav className="border-b border-white/5 bg-[#090d16]/80 backdrop-blur-md px-6 py-4 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-white block leading-tight">
              QFlow
            </span>
            <span className="text-[10px] text-gray-500 font-mono tracking-wider uppercase block">
              Customer Login
            </span>
          </div>
        </Link>

        {/* Action Links & Return to Home / Exit */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Return to Home Page button */}
          <Link
            href="/"
            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-xl transition text-xs font-semibold flex items-center gap-1.5"
            title="Return to Home Page"
          >
            <Home className="w-4 h-4 text-brand-400" />
            <span className="hidden sm:inline">Return to Home</span>
          </Link>

          {onOpenScanner && (
            <button
              onClick={onOpenScanner}
              className="px-3.5 py-2 bg-brand-600/10 hover:bg-brand-600/20 border border-brand-500/30 text-brand-400 rounded-xl transition text-xs font-bold flex items-center gap-1.5 shadow-sm"
              title="Scan a QR code to join a queue"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Scan QR</span>
            </button>
          )}

          {/* User profile indicator if signed in */}
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.name}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
                <span className="text-gray-200 font-medium truncate max-w-[120px]">
                  {user.name}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300">
                  {user.role}
                </span>
              </div>

              {/* Logout button */}
              <button
                onClick={handleExitSession}
                className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 hover:text-red-200 transition text-xs font-semibold flex items-center gap-1.5"
                title="Log Out and return to home page"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </>
          ) : (
            /* Sign In link */
            <Link
              href="/login"
              className="px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-brand-600/20"
              title="Sign in with Google or account"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};
