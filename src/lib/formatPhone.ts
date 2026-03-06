/**
 * Mask phone for display: first 6 digits as *, last 4 visible.
 * e.g. +919876543210 -> ******3210, 9876543210 -> ******3210
 */
export function maskPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '—';
  const last4 = digits.slice(-4);
  return `******${last4}`;
}
