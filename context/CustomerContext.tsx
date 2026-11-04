'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getDeviceId } from '@/lib/deviceId';
import { apiRequest } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActiveTicket {
  /** Firestore entry document ID */
  entryId: string;
  token: string;
  /** queueCode used to reach the track page */
  queueCode: string;
  /** queueId (Firestore document ID of the parent queue) */
  queueId: string;
  queueName: string;
  customerName: string;
  joinedAt: string;
  /** live status — updated via socket events */
  status: 'waiting' | 'called' | 'served' | 'skipped';
}

export interface SavedQueue {
  /** Firestore savedQueues doc ID */
  docId: string;
  queueId: string;
  queueName: string;
  queueCode: string;
  /** The publicCredential at the time of saving — used to detect QR rotations */
  publicCredential: string;
  qrVersion: number;
  savedAt: string;
  /** Set to false by the server when the QR credential no longer matches */
  isValid: boolean;
}

interface CustomerContextType {
  deviceId: string;
  activeTickets: ActiveTicket[];
  savedQueues: SavedQueue[];
  addActiveTicket: (ticket: ActiveTicket) => void;
  removeActiveTicket: (entryId: string) => void;
  updateTicketStatus: (entryId: string, status: ActiveTicket['status']) => void;
  saveQueue: (queue: Omit<SavedQueue, 'docId' | 'savedAt' | 'isValid'>) => Promise<void>;
  removeSavedQueue: (docId: string) => Promise<void>;
  isQueueSaved: (queueId: string) => boolean;
  refreshSavedQueues: () => Promise<void>;
  loadingQueues: boolean;
  leaveQueue: (params: { entryId?: string; queueId?: string; token?: string; queueCode?: string }) => Promise<void>;
  clearCustomerSession: () => void;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

const ACTIVE_TICKETS_KEY = 'qflow_active_tickets';
const TERMINAL_STATUSES = new Set(['served', 'skipped']);

// ── Provider ─────────────────────────────────────────────────────────────────

export const CustomerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceId, setDeviceId] = useState<string>('');
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);
  const [savedQueues, setSavedQueues] = useState<SavedQueue[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);

  // Initialise device ID and restore active tickets from localStorage
  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);

    try {
      const raw = localStorage.getItem(ACTIVE_TICKETS_KEY);
      if (raw) {
        const parsed: ActiveTicket[] = JSON.parse(raw);
        // Filter out any tickets that were already terminal before reload
        const live = parsed.filter((t) => !TERMINAL_STATUSES.has(t.status));
        setActiveTickets(live);
      }
    } catch {
      // Corrupted storage — start fresh
      localStorage.removeItem(ACTIVE_TICKETS_KEY);
    }
  }, []);

  // Persist active tickets to localStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ACTIVE_TICKETS_KEY, JSON.stringify(activeTickets));
    } catch {
      // Storage full — non-fatal
    }
  }, [activeTickets]);

  // ── Active ticket helpers ────────────────────────────────────────────────

  const addActiveTicket = useCallback((ticket: ActiveTicket) => {
    setActiveTickets((prev) => {
      // Prevent duplicates
      if (prev.some((t) => t.entryId === ticket.entryId)) return prev;
      return [ticket, ...prev];
    });
  }, []);

  const removeActiveTicket = useCallback((entryId: string) => {
    setActiveTickets((prev) => prev.filter((t) => t.entryId !== entryId));
  }, []);

  const updateTicketStatus = useCallback(
    (entryId: string, status: ActiveTicket['status']) => {
      setActiveTickets((prev) => {
        const target = prev.find((t) => t.entryId === entryId);
        if (!target || target.status === status) return prev;
        return prev
          .map((t) => (t.entryId === entryId ? { ...t, status } : t))
          .filter((t) => !TERMINAL_STATUSES.has(t.status));
      });
    },
    []
  );

  // ── Saved queue helpers ─────────────────────────────────────────────────

  const refreshSavedQueues = useCallback(async () => {
    setLoadingQueues(true);
    try {
      const id = getDeviceId();
      const data = await apiRequest(`/customer/saved-queues?deviceId=${id}`);
      setSavedQueues(data);
    } catch (err) {
      console.error('[CustomerContext] Failed to refresh saved queues:', err);
    } finally {
      setLoadingQueues(false);
    }
  }, []);

  // Load saved queues on mount
  useEffect(() => {
    refreshSavedQueues();
  }, [refreshSavedQueues]);

  const saveQueue = useCallback(
    async (queue: Omit<SavedQueue, 'docId' | 'savedAt' | 'isValid'>) => {
      const id = getDeviceId();
      const saved = await apiRequest('/customer/saved-queues', 'POST', {
        ...queue,
        deviceId: id,
      });
      setSavedQueues((prev) => {
        if (prev.some((q) => q.queueId === queue.queueId)) return prev;
        return [saved, ...prev];
      });
    },
    []
  );

  const removeSavedQueue = useCallback(async (docId: string) => {
    await apiRequest(`/customer/saved-queues/${docId}`, 'DELETE');
    setSavedQueues((prev) => prev.filter((q) => q.docId !== docId));
  }, []);

  const isQueueSaved = useCallback(
    (queueId: string) => savedQueues.some((q) => q.queueId === queueId),
    [savedQueues]
  );

  const leaveQueue = useCallback(
    async (params: { entryId?: string; queueId?: string; token?: string; queueCode?: string }) => {
      try {
        await apiRequest('/entries/leave', 'POST', params);
      } catch (err) {
        console.warn('[CustomerContext] Server error leaving queue (proceeding locally):', err);
      }

      // Remove ticket from active list locally
      if (params.entryId) {
        removeActiveTicket(params.entryId);
      } else if (params.token) {
        setActiveTickets((prev) => prev.filter((t) => t.token !== params.token));
      }

      // Clean up localStorage keys for this queue if present
      if (params.queueCode && typeof window !== 'undefined') {
        try {
          localStorage.removeItem(`last_token_${params.queueCode}`);
          localStorage.removeItem(`last_id_${params.queueCode}`);
        } catch {}
      }
    },
    [removeActiveTicket]
  );

  const clearCustomerSession = useCallback(() => {
    setActiveTickets([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(ACTIVE_TICKETS_KEY);
        // Clean up last token entries
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('last_token_') || key.startsWith('last_id_'))) {
            localStorage.removeItem(key);
          }
        }
      } catch {}
    }
  }, []);

  const contextValue = React.useMemo(
    () => ({
      deviceId,
      activeTickets,
      savedQueues,
      addActiveTicket,
      removeActiveTicket,
      updateTicketStatus,
      saveQueue,
      removeSavedQueue,
      isQueueSaved,
      refreshSavedQueues,
      loadingQueues,
      leaveQueue,
      clearCustomerSession,
    }),
    [
      deviceId,
      activeTickets,
      savedQueues,
      addActiveTicket,
      removeActiveTicket,
      updateTicketStatus,
      saveQueue,
      removeSavedQueue,
      isQueueSaved,
      refreshSavedQueues,
      loadingQueues,
      leaveQueue,
      clearCustomerSession,
    ]
  );

  return (
    <CustomerContext.Provider value={contextValue}>
      {children}
    </CustomerContext.Provider>
  );
};

export const useCustomer = () => {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return context;
};
