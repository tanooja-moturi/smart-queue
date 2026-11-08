'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomer } from '@/context/CustomerContext';
import { CustomerNav } from '@/components/CustomerNav';
import { ActiveQueueCard } from '@/components/ActiveQueueCard';
import { SavedQueueCard } from '@/components/SavedQueueCard';
import { QrScannerModal } from '@/components/QrScannerModal';
import { apiRequest } from '@/lib/api';
import {
  Ticket, Bookmark, QrCode, ArrowRight,
  RotateCw, Sparkles, Search, Users, X, AlertCircle, Home, LogOut
} from 'lucide-react';

export default function CustomerDashboardPage() {
  const router = useRouter();
  const {
    activeTickets,
    savedQueues,
    loadingQueues,
    refreshSavedQueues,
    clearCustomerSession
  } = useCustomer();

  const [activeTab, setActiveTab] = useState<'tickets' | 'saved'>('tickets');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCodeError, setManualCodeError] = useState<string | null>(null);
  const [resolvingCode, setResolvingCode] = useState(false);

  // Tracking inputs inside modal
  const [trackingToken, setTrackingToken] = useState('');
  const [trackingQueueCode, setTrackingQueueCode] = useState('');
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [recentTickets, setRecentTickets] = useState<{ queueCode: string; token: string }[]>([]);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Load recent tickets when tracking modal opens
  useEffect(() => {
    if (!isTrackingModalOpen) return;
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
    } catch {}
    setRecentTickets(tickets);
  }, [isTrackingModalOpen]);

  const handleScanSuccess = async (decodedText: string) => {
    setIsScannerOpen(false);
    let codeToJoin = decodedText;
    try {
      const url = new URL(decodedText);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const joinIndex = pathParts.indexOf('join');
      if (joinIndex !== -1 && pathParts[joinIndex + 1]) {
        codeToJoin = pathParts[joinIndex + 1];
      } else if (pathParts.length > 0) {
        codeToJoin = pathParts[pathParts.length - 1];
      }
    } catch {}

    const clean = codeToJoin.trim().toUpperCase();
    if (clean) {
      router.push(`/join/${clean.toLowerCase()}`);
    }
  };

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setResolvingCode(true);
    setManualCodeError(null);

    const clean = manualCode.trim().toUpperCase();
    try {
      const qData = await apiRequest(`/queues/public/${clean}`);
      if (qData && qData._id) {
        router.push(`/join/${clean.toLowerCase()}`);
      } else {
        setManualCodeError('Queue not found. Please verify the code.');
      }
    } catch (err: any) {
      setManualCodeError(err.message || 'Queue code not recognized.');
    } finally {
      setResolvingCode(false);
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
    <div className="relative min-h-screen bg-[#070a13] flex flex-col text-white">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Nav (No staff links) */}
      <CustomerNav onOpenScanner={() => setIsScannerOpen(true)} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 z-10 space-y-12">
        {/* Customer Dashboard Hero: Layout matching the requested design */}
        <section className="flex flex-col lg:flex-row items-center justify-between gap-10">
          {/* Left Column: Heading, description, and Join Queue form */}
          <div className="flex-1 text-left max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold">
              <Sparkles className="w-4 h-4" /> Virtual Queue Management System
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight font-sans">
              No more waiting in <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400">physical lines.</span>
            </h1>
            <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
              Allow your customers to join waiting queues dynamically by scanning a QR code or entering a queue ID. Keep them notified and update status in real-time.
            </p>

            {/* Join Queue Form */}
            <div className="space-y-2">
              <form onSubmit={handleManualCodeSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md w-full bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-md">
                <input
                  type="text"
                  placeholder="Enter Queue Code (e.g. general-banking)"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="flex-1 bg-transparent px-4 py-3 text-white text-sm outline-none placeholder-gray-500 border border-transparent focus:border-brand-500/30 rounded-xl font-mono uppercase"
                  required
                />
                <button
                  type="submit"
                  disabled={resolvingCode}
                  className="px-6 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
                >
                  {resolvingCode ? 'Checking...' : 'Join Queue'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              {manualCodeError && (
                <p className="text-red-400 text-xs px-2">{manualCodeError}</p>
              )}
            </div>
          </div>

          {/* Right Column: Customer Feature Cards Grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl w-full">
            {/* 1. Scan & Join */}
            <div
              onClick={() => setIsScannerOpen(true)}
              className="glass p-6 rounded-2xl flex flex-col justify-between hover:border-brand-500/60 cursor-pointer hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-6">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-2">Scan & Join</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Scan custom queue QR codes to instantly sign up with your name and retrieve your ticket token.
                </p>
              </div>
            </div>

            {/* 2. Live Tracking */}
            <div
              onClick={() => setIsTrackingModalOpen(true)}
              className="glass p-6 rounded-2xl flex flex-col justify-between hover:border-brand-500/60 cursor-pointer hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-2">Live Tracking</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  See exactly how many people are ahead of you and watch the active serving token update in real-time.
                </p>
              </div>
            </div>

            {/* 3. Customer Passes & Tickets (replaces Staff Dashboard Control) */}
            <div
              onClick={() => {
                setActiveTab('tickets');
                const el = document.getElementById('customer-tickets-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="glass p-6 rounded-2xl flex flex-col justify-between hover:border-brand-500/60 cursor-pointer hover:-translate-y-0.5 transition-all duration-300 sm:col-span-2"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Ticket className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-bold">
                    {activeTickets.length} Active {activeTickets.length === 1 ? 'Pass' : 'Passes'}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold">
                    {savedQueues.length} Saved
                  </span>
                </div>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">My Queue Passes & Active Tickets</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  View your current waiting tickets, hear voice announcements when called, and leave the queue whenever you need to.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Tickets & Saved Queues Section */}
        <section id="customer-tickets-section" className="space-y-6 pt-4 border-t border-white/5">
          {/* Tabs bar */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('tickets')}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                  activeTab === 'tickets'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Ticket className="w-4 h-4" />
                <span>Active Passes</span>
                {activeTickets.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                    {activeTickets.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('saved')}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                  activeTab === 'saved'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span>Saved Places</span>
                {savedQueues.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                    {savedQueues.length}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={() => refreshSavedQueues()}
              disabled={loadingQueues}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition flex items-center justify-center"
              title="Refresh status"
            >
              <RotateCw className={`w-4 h-4 ${loadingQueues ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>

          {/* Active Tickets List */}
          {activeTab === 'tickets' && (
            <div>
              {activeTickets.length === 0 ? (
                <div className="glass rounded-3xl p-12 text-center border border-white/10 max-w-lg mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mx-auto">
                    <Ticket className="w-8 h-8" />
                  </div>
                  <h3 className="font-extrabold text-white text-xl">No Active Passes</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    You are not currently in any waiting lines. Enter a queue code above or scan an in-store QR code to take a ticket.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl transition inline-flex items-center gap-2 shadow-lg shadow-brand-600/20"
                    >
                      <QrCode className="w-4 h-4" /> Scan In-Store QR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeTickets.map((ticket) => (
                    <ActiveQueueCard key={ticket.entryId} ticket={ticket} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Saved Queues List */}
          {activeTab === 'saved' && (
            <div>
              {savedQueues.length === 0 ? (
                <div className="glass rounded-3xl p-12 text-center border border-white/10 max-w-lg mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
                    <Bookmark className="w-8 h-8" />
                  </div>
                  <h3 className="font-extrabold text-white text-xl">No Saved Places</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    You haven't saved any queues yet. When you visit a place, click the bookmark button if you want to save it for quick re-joining.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {savedQueues.map((sq) => (
                    <SavedQueueCard
                      key={sq.docId}
                      queue={sq}
                      onScanToRefresh={() => setIsScannerOpen(true)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* QR Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Live Tracking Modal */}
      {isTrackingModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass w-full max-w-md p-8 rounded-3xl border border-white/10 relative text-left">
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
                  className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-650 outline-none text-sm transition font-mono uppercase"
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
          </div>
        </div>
      )}
    </div>
  );
}
