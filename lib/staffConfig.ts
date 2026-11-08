/**
 * Helper to check whether an email is in the authorized staff email list.
 * Reads the comma-separated STAFF_EMAILS environment variable.
 * Case-insensitive, trimmed.
 *
 * Example:
 *   STAFF_EMAILS=staff@example.com,admin@company.com
 */
export function isStaffEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const rawList = process.env.STAFF_EMAILS;
  if (!rawList || !rawList.trim()) return false;

  const clean = email.trim().toLowerCase();
  const allowed = rawList
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(clean);
}

