'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useCustomer } from '@/context/CustomerContext';
import { apiRequest } from '@/lib/api';
import { 
  Users, Clock, Volume2, ShieldAlert, 
  ArrowLeft, CheckCircle2, AlertCircle, Sparkles,
  Bookmark, Check, XCircle, Home
} from 'lucide-react';

interface EntryDetails {
  entry: {
    _id: string;
    customerName: string;
    queueId: {
      _id: string;
      queueName: string;
      queueCode: string;
      averageServiceTime: number;
      publicCredential?: string;
      qrVersion?: number;
    };
    token: string;
    status: 'waiting' | 'called' | 'served' | 'skipped';
    joinedAt: string;
    calledAt?: string;
  };
  peopleAhead: number;
  currentServing: string;
  averageServiceTime: number;
}

export default function TrackQueuePage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const queueParam = searchParams.get('queue');
  const router = useRouter();

  const { socket } = useSocket();
  const { saveQueue, isQueueSaved, updateTicketStatus, leaveQueue } = useCustomer();

  const [data, setData] = useState<EntryDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingQueue, setSavingQueue] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Audio state
  const prevStatusRef = useRef<'waiting' | 'called' | 'served' | 'skipped' | null>(null);

  const fetchTrackingDetails = React.useCallback(async () => {
    try {
      if (!token) return;
      const url = `/entries/track/${token}${queueParam ? `?queue=${queueParam}` : ''}`;
      const trackingData = await apiRequest(url);
      setData(trackingData);

      const newStatus = trackingData.entry.status;

      // Update customer context only if status actually changed
      if (trackingData.entry._id && prevStatusRef.current !== newStatus) {
        updateTicketStatus(trackingData.entry._id, newStatus);
      }

      // Trigger notification/voice if state changes to 'called'
      if (prevStatusRef.current === 'waiting' && newStatus === 'called') {
        triggerCallAlert(trackingData.entry.token, trackingData.entry.customerName);
      }

      prevStatusRef.current = newStatus;
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error loading ticket details.');
    } finally {
      setLoading(false);
    }
  }, [token, queueParam, updateTicketStatus]);

  useEffect(() => {
    fetchTrackingDetails();

    // Ask for notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [fetchTrackingDetails]);

  // Handle live socket updates
  const activeQueueId = data?.entry?.queueId?._id;

  useEffect(() => {
    if (!activeQueueId || !socket) return;

    // Join queue room
    socket.emit('join_queue', { queueId: activeQueueId });

    const handleQueueUpdated = (payload: { queueId: string }) => {
      if (payload.queueId === activeQueueId) {
        fetchTrackingDetails();
      }
    };

    socket.on('queue_updated', handleQueueUpdated);

    return () => {
      socket.emit('leave_queue', { queueId: activeQueueId });
      socket.off('queue_updated', handleQueueUpdated);
    };
  }, [activeQueueId, socket, fetchTrackingDetails]);

  const handleSaveQueue = async () => {
    if (!data || savingQueue) return;
    setSavingQueue(true);
    try {
      const q = data.entry.queueId;
      await saveQueue({
        queueId: q._id,
        queueName: q.queueName,
        queueCode: q.queueCode,
        publicCredential: q.publicCredential || '',
        qrVersion: q.qrVersion || 1,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.warn('Failed to save queue:', e);
    } finally {
      setSavingQueue(false);
    }
  };

  const triggerCallAlert = (tokenNum: string, name: string) => {
    // 1. Play Audio chime / synthesis
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        const utterance = new SpeechSynthesisUtterance(`Token ${tokenNum}, ${name}, your turn is called. Please proceed.`);
        synth.speak(utterance);
      }
    } catch (e) {
      console.error('TTS Alert failed:', e);
    }

    // 2. Show Desktop Notification
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification("Your Turn is Called!", {
          body: `Token ${tokenNum} (${name}) has been called. Please head to the counter immediately.`,
          icon: '/favicon.ico',
        });
      }
    } catch (e) {
      console.error('Browser notification failed:', e);
    }
  };

  const playTTSAnnounce = () => {
    if (data) {
      const utterance = new SpeechSynthesisUtterance(`Token ${data.entry.token}, ${data.entry.customerName}, please proceed.`);
      window.speechSynthesis.speak(utterance);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070a13] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center px-4">
        <div className="glass w-full max-w-md p-8 rounded-3xl text-center border border-red-500/20">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Error Loading Ticket</h3>
          <p className="text-gray-400 text-sm mb-6">{error || 'Ticket could not be retrieved.'}</p>
          <button
            onClick={() => router.push('/customer')}
            className="px-6 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-sm font-semibold rounded-xl transition flex items-center justify-center gap-1.5 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> Go to Customer Hub
          </button>
        </div>
      </div>
    );
  }

  const { entry, peopleAhead, currentServing } = data;
  const status = entry.status;
  const queueName = entry.queueId.queueName;
  const avgTime = entry.queueId.averageServiceTime;
  const isSaved = isQueueSaved(entry.queueId._id) || savedSuccess;

  // Calculate progress percent
  const getProgressWidth = () => {
    if (status === 'waiting') return '33%';
    if (status === 'called') return '66%';
    return '100%';
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#090d16] px-4 py-8">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-brand-500/10 rounded-full blur-[130px] pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-6">
        {/* Header Navigation */}
        <div className="flex items-center justify-between gap-2">
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

          <div className="flex items-center gap-2">
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
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Saved
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-brand-400" /> Save Place
                </>
              )}
            </button>

            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live
            </span>
          </div>
        </div>

        {/* Proximity notice if close */}
        {status === 'waiting' && peopleAhead <= 3 && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-bold flex items-center gap-2.5 animate-pulse">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              {peopleAhead === 0
                ? "You're next in line! Please head towards the counter now."
                : `Almost your turn (${peopleAhead} customer ahead)! Please be ready.`}
            </span>
          </div>
        )}

        {/* Ticket Card */}
        <div
          className={`glass border rounded-3xl p-8 text-center relative overflow-hidden transition-all duration-500 ${
            status === 'called'
              ? 'border-brand-500/50 shadow-2xl shadow-brand-500/10'
              : 'border-white/10'
          }`}
        >
          {status === 'called' && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-brand-600 to-indigo-600 border border-brand-400/30 rounded-full text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
              <Sparkles className="w-3 h-3 fill-white" /> Proceed to Counter
            </div>
          )}

          <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
            {queueName} Ticket
          </div>
          <h1 className="text-5xl font-black font-mono text-white tracking-tight mt-2">
            {entry.token}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            For: <span className="text-white font-bold">{entry.customerName}</span>
          </p>

          {/* Status Display Area */}
          <div className="my-8 py-6 border-y border-white/5 space-y-4">
            {status === 'waiting' && (
              <>
                <div className="grid grid-cols-2 gap-4 text-left">
                  <div className="bg-white/2 p-4 rounded-2xl border border-white/5">
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider block">
                      People Ahead
                    </span>
                    <span className="text-2xl font-black text-white mt-1 block">
                      {peopleAhead}
                    </span>
                  </div>
                  <div className="bg-white/2 p-4 rounded-2xl border border-white/5">
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider block">
                      Est. Wait Time
                    </span>
                    <span className="text-2xl font-black text-brand-400 mt-1 block flex items-baseline gap-0.5">
                      {peopleAhead * avgTime}{' '}
                      <span className="text-xs font-medium text-gray-400">min</span>
                    </span>
                  </div>
                </div>
                <div className="text-gray-400 text-xs flex items-center justify-center gap-1 bg-white/2 py-2.5 rounded-xl border border-white/5">
                  <Users className="w-4 h-4 text-brand-400" />
                  <span>
                    Currently Serving Token:{' '}
                    <span className="text-white font-mono font-bold">
                      {currentServing === 'None' ? '---' : currentServing}
                    </span>
                  </span>
                </div>
              </>
            )}

            {status === 'called' && (
              <div className="bg-brand-500/10 border border-brand-500/25 p-5 rounded-2xl space-y-3">
                <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 mx-auto">
                  <Volume2 className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg">Your Turn is Called!</h3>
                  <p className="text-gray-400 text-xs mt-1">
                    Please head to the service counter immediately.
                  </p>
                </div>
                <button
                  onClick={playTTSAnnounce}
                  className="px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-400 rounded-xl transition text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Re-announce Ticket
                </button>
              </div>
            )}

            {status === 'served' && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 p-5 rounded-2xl space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg">Ticket Served</h3>
                  <p className="text-gray-400 text-xs mt-1">
                    Thank you for waiting. We hope you had a pleasant experience!
                  </p>
                </div>
              </div>
            )}

            {status === 'skipped' && (
              <div className="bg-red-500/10 border border-red-500/25 p-5 rounded-2xl space-y-2">
                <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg">Ticket Skipped</h3>
                  <p className="text-gray-400 text-xs mt-1">
                    Your ticket was skipped. Please see staff members if you are still here.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Progress Timeline */}
          <div className="space-y-4">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500">
              <span className={status === 'waiting' ? 'text-amber-400' : 'text-emerald-400'}>
                Waiting
              </span>
              <span
                className={
                  status === 'called'
                    ? 'text-brand-400 font-extrabold animate-pulse'
                    : status === 'served'
                    ? 'text-emerald-400'
                    : 'text-gray-500'
                }
              >
                Called
              </span>
              <span
                className={
                  status === 'served'
                    ? 'text-emerald-400'
                    : status === 'skipped'
                    ? 'text-red-400'
                    : 'text-gray-500'
                }
              >
                Served
              </span>
            </div>

            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  status === 'skipped'
                    ? 'bg-red-500'
                    : 'bg-gradient-to-r from-amber-500 via-brand-500 to-emerald-500'
                }`}
                style={{ width: getProgressWidth() }}
              />
            </div>
          </div>
          {/* Leave Queue Option for Waiting Customers */}
          {status === 'waiting' && (
            <div className="pt-2 border-t border-white/5">
              {showLeaveConfirm ? (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-3">
                  <p className="text-red-200 text-xs font-semibold">
                    Are you sure you want to leave this queue? Your ticket will be cancelled.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={leaving}
                      onClick={async () => {
                        setLeaving(true);
                        try {
                          await leaveQueue({
                            entryId: data.entry._id,
                            queueId: data.entry.queueId._id,
                            token: data.entry.token,
                            queueCode: data.entry.queueId.queueCode,
                          });
                          router.push('/customer');
                        } finally {
                          setLeaving(false);
                          setShowLeaveConfirm(false);
                        }
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
                    >
                      {leaving ? 'Leaving...' : 'Yes, Leave Queue'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLeaveConfirm(false)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/15 text-gray-300 text-xs rounded-xl transition font-semibold"
                    >
                      Keep My Spot
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowLeaveConfirm(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-red-400/80 hover:text-red-300 hover:underline transition py-1"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Leave this queue
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="text-center">
          <button
            onClick={() => router.push('/customer')}
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold hover:underline"
          >
            ← View All My Active Tickets & Saved Queues
          </button>
        </div>
      </div>
    </div>
  );
}
