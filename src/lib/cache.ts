/**
 * Simple TTL cache using in-memory store.
 * Optionally persist to AsyncStorage for surviving app restarts (call persist/restore).
 */

const memory = new Map<string, { value: unknown; expiresAt: number }>();

export const CACHE_TTL = {
  WEATHER_MS: 30 * 60 * 1000,       // 30 minutes
  FUEL_MS: 6 * 60 * 60 * 1000,     // 6 hours
  GOLD_MS: 24 * 60 * 60 * 1000,    // 24 hours
  CRICKET_MS: 60 * 1000,           // 1 minute when live
} as const;

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function getCache<T>(key: string): T | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return null;
  }
  return entry.value as T;
}

export function invalidateCache(key: string): void {
  memory.delete(key);
}
