'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Users, Monitor, ArrowRight, Sparkles } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[#090d16] text-white">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-7xl mx-auto w-full px-6 py-8 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 block leading-tight">
              QFlow
            </span>
            <span className="text-[10px] text-gray-500 font-mono tracking-wider uppercase block">
              Smart Queue Management
            </span>
          </div>
        </div>
      </header>

      {/* Main Portal Selection */}
      <main className="max-w-5xl mx-auto w-full px-6 py-12 z-10 my-auto text-center space-y-10">
        <div className="space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold">
            <Sparkles className="w-4 h-4" /> Virtual Queue Management System
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
            Select Your <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 via-indigo-400 to-purple-400">Portal</span>
          </h1>
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
            Please choose how you would like to continue. Each portal is dedicated to its role.
          </p>
        </div>

        {/* Portals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
          {/* 1. Customer Portal Card */}
          <div
            onClick={() => router.push('/customer')}
            className="group glass p-8 sm:p-9 rounded-3xl border border-brand-500/25 bg-gradient-to-b from-brand-500/5 hover:from-brand-500/10 to-transparent hover:border-brand-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:-translate-y-1 shadow-xl hover:shadow-brand-500/10"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/25 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                  <Users className="w-7 h-7" />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 uppercase tracking-wider">
                  Visitors & Customers
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight group-hover:text-brand-300 transition-colors">
                Customer Portal
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Join live queues, scan in-store QR codes, track your line position in real-time on your phone, and manage your digital queue tickets.
              </p>

              <div className="space-y-2 mb-8 text-xs text-gray-300">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <span>Direct instant access — no account or login required</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <span>Join queues by code or scan QR code</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <span>Live tracking with wait times & people ahead</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push('/customer');
              }}
              className="w-full py-4 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 group-hover:shadow-brand-500/40"
            >
              Enter Customer Portal <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* 2. Staff Login Card */}
          <div
            onClick={() => router.push('/login')}
            className="group glass p-8 sm:p-9 rounded-3xl border border-brand-500/25 bg-gradient-to-b from-brand-500/5 hover:from-brand-500/10 to-transparent hover:border-brand-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:-translate-y-1 shadow-xl hover:shadow-brand-500/10"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/25 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                  <Monitor className="w-7 h-7" />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 uppercase tracking-wider">
                  Queue Managers & Staff
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight group-hover:text-brand-300 transition-colors">
                Staff Login
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Sign in to your Staff Workspace to call next customers, manage counters, review waitlist statistics, and rotate QR codes.
              </p>

              <div className="space-y-2 mb-8 text-xs text-gray-300">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <span>One-click "Call Next" with audio chime alerts</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <span>Mark served, skip entries, and track counters</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <span>Full control of queue status & security QR rotation</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push('/login');
              }}
              className="w-full py-4 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 group-hover:shadow-brand-500/40"
            >
              Enter Staff Portal <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-gray-500 text-xs border-t border-white/5 z-10 bg-black/10">
        © 2026 QFlow Smart Queue Management System. All rights reserved.
      </footer>
    </div>
  );
}
