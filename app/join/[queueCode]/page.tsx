'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { useCustomer } from '@/context/CustomerContext';
import { useAuth } from '@/context/AuthContext';
import {
  Users, Clock, ArrowRight, ShieldAlert,
  Bookmark, Check, ArrowLeft, Radio, AlertCircle, Home
} from 'lucide-react';

interface QueueDetails {
  _id: string;
  queueName: string;
  queueCode: string;
  averageServiceTime: number;
  waitingCount: number;
  currentServing: string;
  isOpen?: boolean;
  remoteJoiningEnabled?: boolean;
  qrVersion?: number;
  publicCredential?: string;
}

export default function JoinQueuePage() {
  const { queueCode } = useParams<{ queueCode: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { deviceId, addActiveTicket, saveQueue, isQueueSaved } = useCustomer();

  const [queue, setQueue] = useState<QueueDetails | null>(null);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingQueue, setSavingQueue] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) {
      setCustomerName((prev) => prev || user.name);
    }
  }, [user?.name]);

  useEffect(() => {
    const fetchQueueDetails = async () => {
      try {
        if (!queueCode) return;
        const data = await apiRequest(`/queues/public/${queueCode}`);
        setQueue(data);
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve queue details. Verify the URL or scan again.');
      } finally {
        setLoading(false);
      }
    };

    fetchQueueDetails();
  }, [queueCode]);

  const handleSaveQueue = async () => {
    if (!queue || savingQueue) return;
    setSavingQueue(true);
    try {
      await saveQueue({
        queueId: queue._id,
        queueName: queue.queueName,
        queueCode: queue.queueCode,
        publicCredential: queue.publicCredential || '',
        qrVersion: queue.qrVersion || 1,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save queue:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !queueCode || !queue) return;

    if (queue.isOpen === false) {
      setError('This queue is currently closed and not accepting new entries.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const entry = await apiRequest(`/entries/join/${queueCode}`, 'POST', {
        customerName: customerName.trim(),
        deviceId,
      });

      // Add to CustomerContext active tickets
      addActiveTicket({
        entryId: entry._id,
        token: entry.token,
        queueCode: queue.queueCode,
        queueId: queue._id,
        queueName: queue.queueName,
        customerName: entry.customerName,
        joinedAt: entry.joinedAt,
        status: 'waiting',
      });

      // Save token info to localStorage to auto-track next time if they close the tab
      localStorage.setItem(`last_token_${queueCode}`, entry.token);
      localStorage.setItem(`last_id_${queueCode}`, entry._id);

      // Redirect to track page
      router.push(`/track/${entry.token}?queue=${queueCode}`);
    } catch (err: any) {
      setError(err.message || 'Error joining the queue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070a13] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isClosed = queue?.isOpen === false;
  const isSaved = queue ? isQueueSaved(queue._id) || savedSuccess : false;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#090d16] px-4 py-8">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition text-xs font-semibold flex items-center gap-1.5"
              title="Return to Home Page"
            >
              <Home className="w-3.5 h-3.5" /> Home
            </button>
            <button
              onClick={() => router.push('/customer')}
              className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition text-xs font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Customer Login
            </button>
          </div>

          {queue && (
            <button
              onClick={handleSaveQueue}
              disabled={isSaved || savingQueue}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                isSaved
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white'
              }`}
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Saved Place
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-brand-400" /> Save Place
                </>
              )}
            </button>
          )}
        </div>

        {error && !queue ? (
          <div className="glass p-8 rounded-3xl text-center border border-red-500/20">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Queue Not Found</h3>
            <p className="text-gray-400 text-sm mb-6">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-sm font-semibold rounded-xl transition"
            >
              Back to Home
            </button>
          </div>
        ) : (
          queue && (
            <div className="space-y-6">
              {/* Logo / Header */}
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20 mx-auto mb-3">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h2 className="font-extrabold text-2xl text-white tracking-tight">{queue.queueName}</h2>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="text-gray-400 text-xs uppercase font-mono tracking-wide">
                    CODE: {queue.queueCode}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isClosed
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {isClosed ? 'Closed' : 'Open'}
                  </span>
                </div>
              </div>

              {/* Statistics Panel */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass p-4 rounded-2xl border border-white/5 text-center">
                  <span className="text-gray-500 text-xs block font-semibold uppercase tracking-wider">Waiting in Line</span>
                  <span className="text-2xl font-extrabold text-white mt-1 block">{queue.waitingCount}</span>
                </div>
                <div className="glass p-4 rounded-2xl border border-white/5 text-center">
                  <span className="text-gray-500 text-xs block font-semibold uppercase tracking-wider">Active Serving</span>
                  <span className="text-2xl font-extrabold text-brand-400 font-mono mt-1 block">
                    {queue.currentServing === 'None' ? '---' : queue.currentServing}
                  </span>
                </div>
              </div>

              {/* Closed Warning Banner */}
              {isClosed && (
                <div className="glass p-5 rounded-2xl border border-red-500/30 bg-red-500/10 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-red-400 font-bold text-sm">
                    <AlertCircle className="w-4 h-4" /> This Queue is Currently Closed
                  </div>
                  <p className="text-gray-300 text-xs">
                    The staff have temporarily closed this counter. You can save this queue to join remotely once it re-opens.
                  </p>
                </div>
              )}

              {/* Form Card */}
              <div className="glass p-8 rounded-3xl border border-white/10 backdrop-blur-md">
                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-xl font-semibold mb-6">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    Estimated Wait: <span className="text-white font-bold">{queue.waitingCount * queue.averageServiceTime} mins</span> ({queue.averageServiceTime}m per ticket)
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2" htmlFor="name">
                      Your Full Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      disabled={isClosed}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none text-sm transition disabled:opacity-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || isClosed}
                    className="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
                  >
                    {submitting ? 'Getting Ticket...' : isClosed ? 'Queue Closed' : 'Join Queue'}{' '}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* Footer info */}
              <div className="text-center text-xs text-gray-500">
                By joining, you will receive a digital token number to track your place in line on your phone screen.
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
