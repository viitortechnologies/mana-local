/**
 * Build WhatsApp URL for a phone number with optional pre-filled message.
 * Strips non-digits; if 10 digits, prepends 91 for India.
 */
export function getWhatsAppUrl(phone: string | null | undefined, message?: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.length === 10 ? `91${digits}` : digits;
  const base = `https://wa.me/${number}`;
  if (message && message.trim()) {
    return `${base}?text=${encodeURIComponent(message.trim())}`;
  }
  return base;
}
