/**
 * Race a promise with a timeout. If the timeout wins, reject so the caller can
 * clear loading state and show "Please try again" instead of leaving the user stuck.
 */
const DEFAULT_MS = 20000;

export function requestWithTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_MS
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), ms)
  );
  return Promise.race([promise, timeout]);
}

export const TIMEOUT_MESSAGE =
  'No response from server. Please check your connection and try again.';
