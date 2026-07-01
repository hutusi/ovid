/** Thin wrapper around `localStorage` that never throws — every read/write
 *  is defensive against storage-restricted environments (private browsing,
 *  disabled storage) and quota-exceeded errors, which every call site used
 *  to hand-roll its own try/catch for. */

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota exceeded / storage-restricted environments — silently ignore
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage-restricted environments — silently ignore
  }
}

/** Parse JSON stored at `key`, returning `fallback` if the key is absent or
 *  the stored value isn't valid JSON. Callers needing shape validation
 *  beyond "is it JSON" should validate the result themselves. */
export function getJSON<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON(key: string, value: unknown): void {
  setItem(key, JSON.stringify(value));
}
