'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Users, QrCode, Monitor, Sparkles, X, AlertCircle } from 'lucide-react';
import { QrScannerModal } from '@/components/QrScannerModal';

export default function HomePage() {
  const [code, setCode] = useState('');
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  // Tracking inputs
  const [trackingToken, setTrackingToken] = useState('');
  const [trackingQueueCode, setTrackingQueueCode] = useState('');
  const [trackingError, setTrackingError] = useState<string | null>(null);
  
  // Recent tickets state
  const [recentTickets, setRecentTickets] = useState<{ queueCode: string; token: string }[]>([]);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const router = useRouter();
  const joinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isTrackingModalOpen) return;
    
    // Load recent tickets from localStorage
    const tickets: { queueCode: string; token: string }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('last_token_')) {
          const queueCode = key.replace('last_token_', '');
          const token = localStorage.getItem(key);
          if (token) {
            tickets.push({ queueCode, token });
          }
        }
      }
    } catch (e) {
      console.error('Error reading localStorage keys:', e);
    }
    setRecentTickets(tickets);
  }, [isTrackingModalOpen]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      router.push(`/join/${code.trim().toLowerCase()}`);
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    setIsScannerOpen(false);
    let codeToJoin = decodedText;
    try {
      // If it's a full URL, extract the queueCode (e.g. from http://.../join/general-banking)
      const url = new URL(decodedText);
      const pathParts = url.pathname.split('/').filter(Boolean);
      // Expected pathname: join/:queueCode
      const joinIndex = pathParts.indexOf('join');
      if (joinIndex !== -1 && pathParts[joinIndex + 1]) {
        codeToJoin = pathParts[joinIndex + 1];
      } else if (pathParts.length > 0) {
        codeToJoin = pathParts[pathParts.length - 1];
      }
    } catch (e) {
      // Not a valid URL, use raw string
    }

    if (codeToJoin.trim()) {
      router.push(`/join/${codeToJoin.trim().toLowerCase()}`);
    }
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTrackingError(null);

    if (!trackingToken.trim()) {
      setTrackingError('Token Number is required.');
      return;
    }
    if (!trackingQueueCode.trim()) {
      setTrackingError('Queue Code is required.');
      return;
    }

    router.push(`/track/${trackingToken.trim().toUpperCase()}?queue=${trackingQueueCode.trim().toLowerCase()}`);
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[#090d16]">
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-[#3b82f6]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Users className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            QFlow<span className="text-brand-500 font-medium text-sm ml-1 px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20">MVP</span>
          </span>
        </div>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white transition bg-white/5 rounded-xl border border-white/10 hover:bg-white/10"
        >
          Staff Dashboard Login
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full px-6 py-12 flex flex-col lg:flex-row items-center justify-between gap-12 z-10 my-auto">
        <div className="flex-1 text-left max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Virtual Queue Management System
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight font-sans">
            No more waiting in <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400">physical lines.</span>
          </h1>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed">
            Allow your customers to join waiting queues dynamically by scanning a QR code or entering a queue ID. Keep them notified and update status in real-time.
          </p>

          <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-3 max-w-md w-full bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-md">
            <input
              ref={joinInputRef}
              type="text"
              placeholder="Enter Queue Code (e.g. general-banking)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 bg-transparent px-4 py-3 text-white text-sm outline-none placeholder-gray-500 border border-transparent focus:border-brand-500/30 rounded-xl"
              required
            />
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
            >
              Join Queue <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Feature Cards Grid */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl w-full">
          <div 
            onClick={() => setIsScannerOpen(true)}
            className="glass p-6 rounded-2xl flex flex-col justify-between hover:border-brand-500/60 cursor-pointer hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-6">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">Scan & Join</h3>
              <p className="text-gray-400 text-sm">Scan custom queue QR codes to instantly sign up with your name and retrieve your ticket token.</p>
            </div>
          </div>

          <div 
            onClick={() => setIsTrackingModalOpen(true)}
            className="glass p-6 rounded-2xl flex flex-col justify-between hover:border-brand-500/60 cursor-pointer hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">Live Tracking</h3>
              <p className="text-gray-400 text-sm">See exactly how many people are ahead of you and watch the active serving token update in real-time.</p>
            </div>
          </div>

          <div 
            onClick={() => router.push('/login')}
            className="glass p-6 rounded-2xl flex flex-col justify-between hover:border-brand-500/60 cursor-pointer hover:-translate-y-0.5 transition-all duration-300 sm:col-span-2"
          >
            <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6] mb-6">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">Staff Dashboard Control</h3>
              <p className="text-gray-400 text-sm">Let staff members view statistics, trigger "Call Next", skip waitlist entries, and mark tasks served in a unified responsive workspace.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-gray-500 text-xs border-t border-white/5 z-10 bg-black/10">
        © 2026 QFlow Smart Queue Management System. MVP Version. Built with Next.js & Socket.IO.
      </footer>

      {/* QR Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Interactive Modal for Live Tracking */}
      {isTrackingModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass w-full max-w-md p-8 rounded-3xl border border-white/10 relative text-left">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsTrackingModalOpen(false);
                setTrackingToken('');
                setTrackingQueueCode('');
                setTrackingError(null);
                setShowHowItWorks(false);
              }}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition"
              title="Close tracking"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" /> Live Status Tracking
            </h3>
            <p className="text-gray-400 text-xs mb-6">
              Enter your ticket details below to track your place in the queue in real-time.
            </p>

            {trackingError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{trackingError}</span>
              </div>
            )}
            
            <form onSubmit={handleTrackSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Queue Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. general-banking"
                  value={trackingQueueCode}
                  onChange={(e) => setTrackingQueueCode(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-650 outline-none text-sm transition font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Token Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. G001"
                  value={trackingToken}
                  onChange={(e) => setTrackingToken(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-650 outline-none text-sm transition font-mono uppercase"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
              >
                Track Live Status <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Recent Tickets Section */}
            {recentTickets.length > 0 && (
              <div className="mt-6 pt-5 border-t border-white/5">
                <h4 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">Your Recent Tickets</h4>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {recentTickets.map((ticket, idx) => (
                    <button
                      key={idx}
                      onClick={() => router.push(`/track/${ticket.token}?queue=${ticket.queueCode}`)}
                      className="w-full text-left p-3 rounded-xl bg-white/2 hover:bg-white/5 border border-white/5 hover:border-white/10 transition flex items-center justify-between text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="text-white font-mono font-bold uppercase">{ticket.token}</span>
                        <span className="text-gray-500 text-[10px]">{ticket.queueCode}</span>
                      </div>
                      <span className="text-indigo-400 font-bold hover:underline flex items-center gap-1">
                        Track <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle Educational Steps */}
            <div className="mt-6 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowHowItWorks(!showHowItWorks)}
                className="text-gray-450 hover:text-white transition text-xs font-semibold flex items-center gap-1.5 mx-auto"
              >
                {showHowItWorks ? 'Hide' : 'Show'} How Live Tracking Works
              </button>

              {showHowItWorks && (
                <div className="space-y-3.5 mt-4 p-4 bg-white/2 border border-white/5 rounded-2xl">
                  <div className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-400 shrink-0">1</div>
                    <div>
                      <h5 className="text-white font-semibold text-xs">Join the Queue</h5>
                      <p className="text-gray-550 text-[10px] mt-0.5">Scan a location's QR code or enter their code to register.</p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-400 shrink-0">2</div>
                    <div>
                      <h5 className="text-white font-semibold text-xs">Get Your Digital Ticket</h5>
                      <p className="text-gray-550 text-[10px] mt-0.5">Retrieve a unique token (e.g. G001) showing your line position.</p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-400 shrink-0">3</div>
                    <div>
                      <h5 className="text-white font-semibold text-xs">Watch Progress</h5>
                      <p className="text-gray-550 text-[10px] mt-0.5">See count of people ahead and real-time active counter updates.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
