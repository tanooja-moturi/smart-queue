/**
 * Persistent device identifier for guest customers.
 *
 * Generates a cryptographically random UUID on first access and stores it in
 * localStorage under the key `qflow_device_id`.  Subsequent calls return the
 * same ID, surviving page refreshes and browser restarts.
 *
 * NEVER store sensitive personal data here.  This ID is only used to associate
 * anonymous queue tickets and saved-queue preferences with a device so that
 * guests can continue tracking their tickets without signing in.
 *
 * For signed-in users, Firebase UID is the primary identity; the device ID
 * is kept as a fallback to recover any tickets that were joined before sign-in.
 */

const STORAGE_KEY = 'qflow_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';

  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    // crypto.randomUUID() is available in all modern browsers and Node ≥ 14.17
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/** Retrieve the device ID without creating one (returns null for new devices). */
export function peekDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}
