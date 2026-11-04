'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useCustomer, ActiveTicket } from '@/context/CustomerContext';
import { apiRequest } from '@/lib/api';
import { Clock, Users, ArrowRight, Volume2, Sparkles, CheckCircle2, AlertCircle, LogOut, XCircle } from 'lucide-react';

interface ActiveQueueCardProps {
  ticket: ActiveTicket;
}

export const ActiveQueueCard = React.memo(({ ticket }: ActiveQueueCardProps) => {
  const router = useRouter();
  const { socket } = useSocket();
  const { updateTicketStatus, leaveQueue } = useCustomer();

  const [status, setStatus] = useState<ActiveTicket['status']>(ticket.status);
  const [peopleAhead, setPeopleAhead] = useState<number | null>(null);
  const [currentServing, setCurrentServing] = useState<string>('---');
  const [avgServiceTime, setAvgServiceTime] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmLeave, setConfirmLeave] = useState<boolean>(false);
  const [leaving, setLeaving] = useState<boolean>(false);

  const prevStatusRef = useRef<ActiveTicket['status']>(ticket.status);

  const fetchLiveStatus = React.useCallback(async () => {
    try {
      const data = await apiRequest(`/entries/track/${ticket.token}?queue=${ticket.queueCode}`);
      if (data && data.entry) {
        const newStatus = data.entry.status;
        setStatus(newStatus);
        if (prevStatusRef.current !== newStatus) {
          updateTicketStatus(ticket.entryId, newStatus);
        }
        setPeopleAhead(data.peopleAhead ?? 0);
        setCurrentServing(data.currentServing ?? '---');
        if (data.averageServiceTime) {
          setAvgServiceTime(data.averageServiceTime);
        }

        // Trigger TTS alert if called
        if (prevStatusRef.current === 'waiting' && newStatus === 'called') {
          playAlertSound(ticket.token, ticket.customerName);
        }
        prevStatusRef.current = newStatus;
      }
    } catch (err) {
      console.warn('[ActiveQueueCard] Status check failed:', err);
    } finally {
      setLoading(false);
    }
  }, [ticket.token, ticket.queueCode, ticket.entryId, ticket.customerName, updateTicketStatus]);

  const playAlertSound = (token: string, name: string) => {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(`Token ${token}, ${name}, your turn is called!`);
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  };

  useEffect(() => {
    fetchLiveStatus();
  }, [fetchLiveStatus]);

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket || !ticket.queueId) return;

    socket.emit('join_queue', { queueId: ticket.queueId });

    const handleQueueUpdated = (payload: { queueId: string }) => {
      if (payload.queueId === ticket.queueId) {
        fetchLiveStatus();
      }
    };

    socket.on('queue_updated', handleQueueUpdated);

    return () => {
      socket.emit('leave_queue', { queueId: ticket.queueId });
      socket.off('queue_updated', handleQueueUpdated);
    };
  }, [socket, ticket.queueId, fetchLiveStatus]);

  const isCalled = status === 'called';
  const isTerminal = status === 'served' || status === 'skipped';

  return (
    <div
      className={`glass rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
        isCalled
          ? 'border-brand-500/60 shadow-xl shadow-brand-500/10 bg-brand-500/5'
          : 'border-white/10 hover:border-white/20'
      }`}
    >
      {isCalled && (
        <div className="absolute top-0 right-0 left-0 bg-gradient-to-r from-brand-600 to-indigo-600 text-white text-[11px] font-black uppercase tracking-wider py-1.5 px-4 text-center flex items-center justify-center gap-1.5 animate-pulse">
          <Sparkles className="w-3.5 h-3.5 fill-white" /> Your Turn is Called! Proceed to Counter
        </div>
      )}

      <div className={isCalled ? 'pt-4' : ''}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-extrabold text-white text-lg tracking-tight truncate max-w-[220px]">
              {ticket.queueName}
            </h3>
            <span className="text-gray-400 text-xs font-mono uppercase">
              CODE: {ticket.queueCode}
            </span>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isCalled
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 animate-pulse'
                : status === 'waiting'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCalled
                  ? 'bg-brand-400 animate-ping'
                  : status === 'waiting'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            {isCalled ? 'Serving' : status === 'waiting' ? 'Waiting' : status}
          </span>
        </div>

        {/* Token Number Display */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 my-4 flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">
              Your Token
            </span>
            <span className="text-3xl font-black font-mono text-white tracking-tight mt-0.5 block">
              {ticket.token}
            </span>
            <span className="text-gray-400 text-xs mt-0.5 block">
              For: <span className="text-gray-200 font-semibold">{ticket.customerName}</span>
            </span>
          </div>

          {status === 'waiting' && peopleAhead !== null && (
            <div className="text-right">
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">
                Ahead of You
              </span>
              <span className="text-2xl font-black text-brand-400 mt-0.5 block">
                {peopleAhead}
              </span>
              <span className="text-gray-500 text-[10px] block">
                ~{peopleAhead * avgServiceTime} min wait
              </span>
            </div>
          )}

          {isCalled && (
            <button
              onClick={() => playAlertSound(ticket.token, ticket.customerName)}
              className="p-3 rounded-2xl bg-brand-500/20 border border-brand-500/30 text-brand-300 hover:bg-brand-500/30 transition flex items-center justify-center"
              title="Repeat sound announcement"
            >
              <Volume2 className="w-5 h-5 animate-bounce" />
            </button>
          )}
        </div>

        {/* Proximity notice if close */}
        {status === 'waiting' && peopleAhead !== null && peopleAhead <= 3 && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              {peopleAhead === 0
                ? "You're next in line! Please stay near the service desk."
                : `Almost your turn (${peopleAhead} ahead). Please be ready nearby!`}
            </span>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
        {confirmLeave ? (
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs">
            <span className="text-red-300 font-medium">Leave this queue?</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={leaving}
                onClick={async () => {
                  setLeaving(true);
                  try {
                    await leaveQueue({
                      entryId: ticket.entryId,
                      queueId: ticket.queueId,
                      token: ticket.token,
                      queueCode: ticket.queueCode,
                    });
                  } finally {
                    setLeaving(false);
                    setConfirmLeave(false);
                  }
                }}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition"
              >
                {leaving ? 'Leaving...' : 'Yes, Leave'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="px-2 py-1 bg-white/10 hover:bg-white/15 text-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-550 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {new Date(ticket.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {!confirmLeave && status === 'waiting' && (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="text-[11px] text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 ml-1"
                title="Leave this queue"
              >
                <XCircle className="w-3 h-3" /> Leave Queue
              </button>
            )}
          </div>

          <button
            onClick={() => router.push(`/track/${ticket.token}?queue=${ticket.queueCode}`)}
            className="px-4 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md shadow-brand-600/20"
          >
            View Full Ticket <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

ActiveQueueCard.displayName = 'ActiveQueueCard';
