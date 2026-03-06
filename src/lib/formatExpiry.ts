/**
 * Format expires_at for display: date string and days left/ago.
 */

export function formatExpiry(expiresAt: string | null | undefined): {
  dateStr: string;
  daysLeft: number;
  isExpired: boolean;
} | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const ms = d.getTime() - now;
  const daysLeft = Math.ceil(ms / (24 * 60 * 60 * 1000));
  const dateStr = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return {
    dateStr,
    daysLeft,
    isExpired: daysLeft < 0,
  };
}

/** e.g. "Expires 15 Jan 2026 · 12 days left" or "Expired 2 days ago" */
export function formatExpiryShort(expiresAt: string | null | undefined): string | null {
  const info = formatExpiry(expiresAt);
  if (!info) return null;
  if (info.isExpired) return `Expired ${Math.abs(info.daysLeft)} day${Math.abs(info.daysLeft) === 1 ? '' : 's'} ago`;
  if (info.daysLeft === 0) return `Expires today (${info.dateStr})`;
  if (info.daysLeft === 1) return `Expires tomorrow · 1 day left`;
  return `Expires ${info.dateStr} · ${info.daysLeft} days left`;
}

/** e.g. "Expires on 15 Jan 2026 (12 days left)" */
export function formatExpiryLong(expiresAt: string | null | undefined): string | null {
  const info = formatExpiry(expiresAt);
  if (!info) return null;
  if (info.isExpired) return `Expired on ${info.dateStr} (${Math.abs(info.daysLeft)} days ago)`;
  if (info.daysLeft === 0) return `Expires today (${info.dateStr})`;
  if (info.daysLeft === 1) return `Expires on ${info.dateStr} (1 day left)`;
  return `Expires on ${info.dateStr} (${info.daysLeft} days left)`;
}
