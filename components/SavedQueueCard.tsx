'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomer, SavedQueue } from '@/context/CustomerContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import {
  Building2, ArrowRight, Trash2, ShieldAlert,
  CheckCircle2, XCircle, Sparkles, QrCode, Radio
} from 'lucide-react';

interface SavedQueueCardProps {
  queue: SavedQueue & {
    isOpen?: boolean;
    remoteJoiningEnabled?: boolean;
  };
  onScanToRefresh?: () => void;
}

export const SavedQueueCard = React.memo(({ queue, onScanToRefresh }: SavedQueueCardProps) => {
  const router = useRouter();
  const { user } = useAuth();
  const { removeSavedQueue, addActiveTicket, deviceId } = useCustomer();

  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [joinError, setJoinError] = useState<string | null>(null);

  const isOpen = queue.isOpen !== false;
  const remoteAllowed = queue.remoteJoiningEnabled === true;
  const isCredentialValid = queue.isValid !== false;

  const handleRemoteJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || joining) return;

    setJoining(true);
    setJoinError(null);

    try {
      const result = await apiRequest('/entries/remote-join', 'POST', {
        queueId: queue.queueId,
        queueCode: queue.queueCode,
        customerName: customerName.trim(),
        publicCredential: queue.publicCredential,
        qrVersion: queue.qrVersion,
        deviceId,
      });

      // Add to CustomerContext active tickets
      addActiveTicket({
        entryId: result._id,
        token: result.token,
        queueId: result.queueId,
        queueCode: result.queueCode || queue.queueCode,
        queueName: result.queueName || queue.queueName,
        customerName: result.customerName,
        joinedAt: result.joinedAt,
        status: 'waiting',
      });

      // Save token to localStorage for tracking convenience
      localStorage.setItem(`last_token_${queue.queueCode}`, result.token);

      setShowJoinModal(false);
      // Navigate to tracking page
      router.push(`/track/${result.token}?queue=${queue.queueCode}`);
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join queue remotely.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      <div className="glass rounded-3xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600/30 to-indigo-500/30 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base tracking-tight truncate max-w-[200px]">
                  {queue.queueName}
                </h3>
                <span className="text-gray-400 text-xs font-mono uppercase">
                  CODE: {queue.queueCode}
                </span>
              </div>
            </div>

            <button
              onClick={() => removeSavedQueue(queue.docId)}
              className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-gray-500 hover:text-red-400 transition"
              title="Remove from saved queues"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2 my-3">
            {/* Open / Closed */}
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                isOpen
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOpen ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              {isOpen ? 'Open Now' : 'Closed'}
            </span>

            {/* Remote Joining Status */}
            {remoteAllowed ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                <Radio className="w-3 h-3" /> Remote Join Active
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/5 text-gray-400 border border-white/10">
                In-Person Only
              </span>
            )}

            {/* QR Validity */}
            {!isCredentialValid && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> QR Expired
              </span>
            )}
          </div>

          {/* Description / Notice */}
          {!isCredentialValid ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 my-3 text-amber-200 text-xs">
              <p className="font-semibold mb-1">QR Code Rotated</p>
              <p className="text-gray-400 text-[11px]">
                The location refreshed their QR code. Re-scan their in-store QR code to restore remote joining.
              </p>
            </div>
          ) : !isOpen ? (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 my-3 text-gray-400 text-xs">
              This counter is currently not accepting new queue tickets. Check back later during business hours.
            </div>
          ) : !remoteAllowed ? (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 my-3 text-gray-400 text-xs">
              This queue requires an in-person physical scan at the entrance to take a ticket.
            </div>
          ) : (
            <div className="bg-brand-500/5 border border-brand-500/15 rounded-2xl p-3 my-3 text-brand-200 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-400 shrink-0" />
              <span>You have valid credentials to join this queue remotely anytime!</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-white/5 mt-2 flex items-center justify-between">
          <span className="text-[10px] text-gray-500">
            Saved on {new Date(queue.savedAt).toLocaleDateString()}
          </span>

          {!isCredentialValid ? (
            <button
              onClick={onScanToRefresh}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" /> Re-scan QR
            </button>
          ) : isOpen && remoteAllowed ? (
            <button
              onClick={() => {
                setJoinError(null);
                setShowJoinModal(true);
              }}
              className="px-5 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md shadow-brand-600/25"
            >
              Join Remotely <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => router.push(`/join/${queue.queueCode}`)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              View Queue Info
            </button>
          )}
        </div>
      </div>

      {/* Remote Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass w-full max-w-md p-6 rounded-3xl border border-white/10 relative">
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <Radio className="w-5 h-5 text-brand-400" /> Join Queue Remotely
            </h3>
            <p className="text-gray-400 text-xs mb-6">
              You are taking a digital ticket for <span className="text-white font-semibold">{queue.queueName}</span>.
            </p>

            {joinError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                {joinError}
              </div>
            )}

            <form onSubmit={handleRemoteJoin} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none text-sm transition"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining}
                  className="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-brand-600/30"
                >
                  {joining ? 'Taking Ticket...' : 'Confirm & Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
});

SavedQueueCard.displayName = 'SavedQueueCard';
