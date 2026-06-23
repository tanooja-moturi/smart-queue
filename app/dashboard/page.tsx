'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { apiRequest } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Users, Plus, LogOut, Play, CheckCircle2, 
  XCircle, Clock, Volume2, UserCheck, Copy, Check, Trash2 
} from 'lucide-react';

interface Queue {
  _id: string;
  queueName: string;
  queueCode: string;
  averageServiceTime: number;
  tokenPrefix: string;
  lastTokenNumber: number;
  waitingCount?: number;
  servedCount?: number;
  currentServing?: string;
}

interface QueueEntry {
  _id: string;
  customerName: string;
  queueId: string;
  token: string;
  status: 'waiting' | 'called' | 'served' | 'skipped';
  joinedAt: string;
  calledAt?: string;
  servedAt?: string;
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueueCode, setNewQueueCode] = useState('');
  const [newServiceTime, setNewServiceTime] = useState(5);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // Copy state
  const [copied, setCopied] = useState(false);

  // Delete queue states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [queueToDelete, setQueueToDelete] = useState<Queue | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchQueues = useCallback(async () => {
    try {
      const data = await apiRequest('/queues');
      setQueues(data);
      // Update selected queue stats if it's already selected
      if (selectedQueue) {
        const updated = data.find((q: Queue) => q._id === selectedQueue._id);
        if (updated) setSelectedQueue(updated);
      }
    } catch (err) {
      console.error('Error fetching queues:', err);
    }
  }, [selectedQueue]);

  const fetchEntries = useCallback(async (queueId: string) => {
    try {
      const data = await apiRequest(`/entries/queue/${queueId}`);
      setEntries(data);
    } catch (err) {
      console.error('Error fetching entries:', err);
    }
  }, []);

  // Fetch queues on mount
  useEffect(() => {
    if (user) fetchQueues();
  }, [user]); // Run once when user is available

  // Selected queue watcher: join room and load entries
  useEffect(() => {
    if (!selectedQueue || !socket) return;

    const queueId = selectedQueue._id;
    fetchEntries(queueId);

    // Join room
    socket.emit('join_queue', { queueId });

    // Handle updates
    const handleQueueUpdated = (data: { queueId: string }) => {
      if (data.queueId === queueId) {
        fetchEntries(queueId);
        // Refresh queue stats in list
        apiRequest('/queues').then((qs) => {
          setQueues(qs);
          const updated = qs.find((q: Queue) => q._id === queueId);
          if (updated) setSelectedQueue(updated);
        });
      }
    };

    socket.on('queue_updated', handleQueueUpdated);

    return () => {
      socket.emit('leave_queue', { queueId });
      socket.off('queue_updated', handleQueueUpdated);
    };
  }, [selectedQueue, socket, fetchEntries]);

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    try {
      const created = await apiRequest('/queues', 'POST', {
        queueName: newQueueName,
        queueCode: newQueueCode,
        averageServiceTime: newServiceTime,
      });

      setQueues((prev) => [created, ...prev]);
      setSelectedQueue(created);
      setIsModalOpen(false);
      setNewQueueName('');
      setNewQueueCode('');
      setNewServiceTime(5);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create queue');
    }
  };

  const handleDeleteQueue = async () => {
    if (!queueToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/queues/${queueToDelete._id}`, 'DELETE');
      setQueues((prev) => prev.filter((q) => q._id !== queueToDelete._id));
      if (selectedQueue && selectedQueue._id === queueToDelete._id) {
        setSelectedQueue(null);
      }
      setIsDeleteModalOpen(false);
      setQueueToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete queue');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCallNext = async () => {
    if (!selectedQueue) return;
    try {
      await apiRequest(`/entries/queue/${selectedQueue._id}/call-next`, 'POST');
      // Sockets will trigger refresh
    } catch (err) {
      console.error('Error calling next customer:', err);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'served' | 'skipped') => {
    try {
      await apiRequest(`/entries/${id}/status`, 'PATCH', { status });
      // Sockets will trigger refresh
    } catch (err) {
      console.error(`Error updating entry to ${status}:`, err);
    }
  };

  const playChime = () => {
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        const calledEntry = entries.find(e => e.status === 'called');
        if (calledEntry) {
          const utterance = new SpeechSynthesisUtterance(`Token ${calledEntry.token}, ${calledEntry.customerName}, please proceed.`);
          synth.speak(utterance);
        } else {
          const utterance = new SpeechSynthesisUtterance("No active customer called.");
          synth.speak(utterance);
        }
      }
    } catch (e) {
      console.error("Audio chime failed:", e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getJoinUrl = (code: string) => {
    return `${window.location.origin}/join/${code}`;
  };

  // Separate active vs historical entries
  const activeEntries = entries.filter((e) => ['waiting', 'called'].includes(e.status));
  const historyEntries = entries.filter((e) => ['served', 'skipped'].includes(e.status)).reverse();

  // Find currently serving entry (called status)
  const currentServingEntry = entries.find((e) => e.status === 'called');

  // Show loading spinner while auth is being checked
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#070a13] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070a13] flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-white/5 bg-[#090d16]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-white">QFlow Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-white text-sm font-semibold">{user?.name}</div>
            <div className="text-xs text-gray-500 capitalize">{user?.role} Profile</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 text-gray-400 hover:text-red-400 transition"
            title="Log Out"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </nav>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar: Queue List */}
        <aside className="w-full md:w-80 border-r border-white/5 bg-[#090d16]/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider text-gray-400">Waiting Queues</h3>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition flex items-center justify-center"
              title="Create New Queue"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {queues.length === 0 ? (
              <div className="text-center py-8 text-gray-650 text-xs">
                No queues created yet. Click "+" to create one.
              </div>
            ) : (
              queues.map((q) => {
                const isSelected = selectedQueue?._id === q._id;
                return (
                  <div
                    key={q._id}
                    className="group relative"
                  >
                    <button
                      onClick={() => {
                        setSelectedQueue(q);
                        setActiveTab('active');
                      }}
                      className={`w-full text-left p-4 pr-12 rounded-2xl border transition duration-200 flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-brand-500/10 border-brand-500/40 text-white shadow-lg shadow-brand-500/5'
                          : 'bg-white/5 border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white truncate max-w-[130px]">{q.queueName}</span>
                        <span className="font-mono text-xs bg-white/5 px-2 py-0.5 rounded border border-white/5 text-gray-400 uppercase">{q.queueCode}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>{q.waitingCount ?? 0} waiting</span>
                        </div>
                        <div>
                          Serving: <span className="font-bold font-mono text-brand-400">{q.currentServing || 'None'}</span>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQueueToDelete(q);
                        setIsDeleteModalOpen(true);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-transparent hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition duration-150 opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Delete Queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Dashboard Area */}
        <main className="flex-1 overflow-y-auto bg-[#070a13] p-6">
          {selectedQueue ? (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Header card with details */}
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Stats & Controls */}
                <div className="flex-1 glass p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
                  
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-black text-white">{selectedQueue.queueName}</h2>
                        <p className="text-gray-500 text-xs mt-1 font-mono uppercase">CODE: {selectedQueue.queueCode} | TICKET FORMAT: {selectedQueue.tokenPrefix}XXX</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full font-semibold">
                        <Clock className="w-3.5 h-3.5" /> Est. {selectedQueue.averageServiceTime} min / ticket
                      </div>
                    </div>

                    {/* Prominent Current Serving Banner */}
                    <div className="mt-6 bg-white/5 border border-white/5 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider block">Now Serving</span>
                        <span className="text-4xl font-extrabold text-white font-mono tracking-tight mt-1 block">
                          {currentServingEntry ? currentServingEntry.token : '---'}
                        </span>
                        {currentServingEntry && (
                          <span className="text-gray-400 text-sm mt-0.5 block">
                            Customer: <span className="text-brand-300 font-bold">{currentServingEntry.customerName}</span>
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        {currentServingEntry && (
                          <button
                            onClick={playChime}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition flex items-center justify-center"
                            title="Voice Announcement Call"
                          >
                            <Volume2 className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={handleCallNext}
                          disabled={activeEntries.length === 0 && !currentServingEntry}
                          className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
                        >
                          <Play className="w-4 h-4 fill-white" /> Call Next
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5 text-center">
                    <div>
                      <div className="text-gray-500 text-xs">Waiting</div>
                      <div className="text-xl font-bold text-white mt-1">{selectedQueue.waitingCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Served</div>
                      <div className="text-xl font-bold text-emerald-400 mt-1">{selectedQueue.servedCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Total Tickets</div>
                      <div className="text-xl font-bold text-brand-400 mt-1">{selectedQueue.lastTokenNumber}</div>
                    </div>
                  </div>
                </div>

                {/* QR Section */}
                <div className="w-full lg:w-80 glass p-6 rounded-3xl flex flex-col items-center justify-between gap-4 text-center">
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Queue QR Code</span>
                  <div className="bg-white p-4 rounded-2xl shadow-inner inline-block relative border border-white/10">
                    <QRCodeSVG 
                      value={getJoinUrl(selectedQueue.queueCode)} 
                      size={150}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  <div className="w-full space-y-2">
                    <span className="text-gray-500 text-xs block truncate" title={getJoinUrl(selectedQueue.queueCode)}>
                      {getJoinUrl(selectedQueue.queueCode)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(getJoinUrl(selectedQueue.queueCode))}
                      className="w-full py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl transition text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied link
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Join Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Table section */}
              <div className="glass rounded-3xl overflow-hidden border border-white/10">
                {/* Tabs */}
                <div className="flex border-b border-white/5 bg-[#090d16]/30 px-6 py-2">
                  <button
                    onClick={() => setActiveTab('active')}
                    className={`px-4 py-3 text-sm font-semibold transition border-b-2 -mb-2.5 ${
                      activeTab === 'active'
                        ? 'border-brand-500 text-white'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Active Customers ({activeEntries.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-3 text-sm font-semibold transition border-b-2 -mb-2.5 ${
                      activeTab === 'history'
                        ? 'border-brand-500 text-white'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Serve History ({historyEntries.length})
                  </button>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                  {activeTab === 'active' ? (
                    activeEntries.length === 0 ? (
                      <div className="text-center py-12 text-gray-650 text-sm">
                        No active customers waiting in queue.
                      </div>
                    ) : (
                      <table className="w-full text-left text-sm text-gray-400">
                        <thead className="text-xs uppercase tracking-wider text-gray-500 bg-white/2">
                          <tr>
                            <th className="px-6 py-4">Token</th>
                            <th className="px-6 py-4">Customer Name</th>
                            <th className="px-6 py-4">Joined Time</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {activeEntries.map((entry) => (
                            <tr 
                              key={entry._id} 
                              className={`hover:bg-white/2 transition duration-150 ${
                                entry.status === 'called' ? 'bg-brand-500/5' : ''
                              }`}
                            >
                              <td className="px-6 py-4 font-mono font-bold text-white text-base">
                                {entry.token}
                              </td>
                              <td className="px-6 py-4 font-semibold text-white">
                                {entry.customerName}
                              </td>
                              <td className="px-6 py-4 text-xs">
                                {new Date(entry.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  entry.status === 'called' 
                                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20 animate-pulse' 
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${entry.status === 'called' ? 'bg-brand-400' : 'bg-amber-400'}`}></span>
                                  {entry.status === 'called' ? 'Serving' : 'Waiting'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                {entry.status === 'called' ? (
                                  <>
                                    <button
                                      onClick={() => handleUpdateStatus(entry._id, 'served')}
                                      className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-400 transition"
                                      title="Mark Served"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(entry._id, 'skipped')}
                                      className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 hover:border-red-500/40 text-red-400 transition"
                                      title="Skip Customer"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      // Call this specific customer: first mark current serving served
                                      if (currentServingEntry) {
                                        await handleUpdateStatus(currentServingEntry._id, 'served');
                                      }
                                      await apiRequest(`/entries/${entry._id}/status`, 'PATCH', { status: 'called' });
                                    }}
                                    className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-brand-500/20 border border-white/10 hover:border-brand-500/30 text-xs font-semibold text-gray-300 hover:text-white transition flex items-center gap-1"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" /> Call This
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    historyEntries.length === 0 ? (
                      <div className="text-center py-12 text-gray-650 text-sm">
                        No served or skipped customers in history.
                      </div>
                    ) : (
                      <table className="w-full text-left text-sm text-gray-400">
                        <thead className="text-xs uppercase tracking-wider text-gray-500 bg-white/2">
                          <tr>
                            <th className="px-6 py-4">Token</th>
                            <th className="px-6 py-4">Customer Name</th>
                            <th className="px-6 py-4">Served Time</th>
                            <th className="px-6 py-4">Outcome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {historyEntries.map((entry) => (
                            <tr key={entry._id} className="hover:bg-white/2 transition duration-150">
                              <td className="px-6 py-4 font-mono font-semibold text-gray-300">
                                {entry.token}
                              </td>
                              <td className="px-6 py-4 font-semibold text-gray-300">
                                {entry.customerName}
                              </td>
                              <td className="px-6 py-4 text-xs">
                                {entry.servedAt 
                                  ? new Date(entry.servedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : '---'
                                }
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  entry.status === 'served' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}>
                                  {entry.status === 'served' ? 'Served' : 'Skipped'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 mb-6">
                <Users className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white">Select a Queue</h2>
              <p className="text-gray-550 text-sm mt-2">
                Click on one of the queues in the sidebar to open the live management dashboard, or click the "+" button to add a new service counter.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-6 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-brand-600/25"
              >
                <Plus className="w-4.5 h-4.5" /> Create New Queue
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Create Queue Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass w-full max-w-md p-6 rounded-3xl border border-white/10 relative">
            <h3 className="text-xl font-bold text-white mb-6">Create New Queue</h3>
            
            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Queue Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. General Banking"
                  value={newQueueName}
                  onChange={(e) => {
                    setNewQueueName(e.target.value);
                    // Generate a default code slug
                    setNewQueueCode(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                  }}
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none text-sm transition"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Queue Code (URL slug)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. general-banking"
                  value={newQueueCode}
                  onChange={(e) => setNewQueueCode(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none text-sm transition font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Average Service Time (Minutes)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="120"
                  value={newServiceTime}
                  onChange={(e) => setNewServiceTime(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-650 outline-none text-sm transition"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-white/5 mt-6 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition bg-transparent hover:bg-white/5 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-brand-600/25"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Queue Confirmation Modal */}
      {isDeleteModalOpen && queueToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass w-full max-w-md p-6 rounded-3xl border border-white/10 relative">
            <h3 className="text-xl font-bold text-white mb-2">Delete Queue</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete the queue <span className="text-white font-semibold">"{queueToDelete.queueName}"</span>? This will permanently delete all associated entries and history.
            </p>
            
            {deleteError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-white/5 justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setQueueToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition bg-transparent hover:bg-white/5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteQueue}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-red-600/25"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
