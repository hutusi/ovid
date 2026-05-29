import { useCallback, useState } from "react";

const STORAGE_KEY = "ovid:wordCountGoal";

/** Parse a stored goal string into a positive integer, or null if absent/invalid.
 *  Rejects partial parses ("12abc", "1.5", "1e2") that `Number.parseInt` would
 *  silently truncate, so a corrupted localStorage entry clears the goal rather
 *  than producing a nonsense value. */
export function parseGoal(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n > 0 ? n : null;
}

/** Truncate to a positive integer; non-positive or non-finite values clear the goal. */
export function normalizeGoal(n: number | null): number | null {
  const truncated = n !== null && Number.isFinite(n) ? Math.trunc(n) : null;
  return truncated !== null && truncated > 0 ? truncated : null;
}

function loadGoal(): number | null {
  try {
    return parseGoal(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function useWordCountGoal() {
  const [goal, setGoalState] = useState<number | null>(loadGoal);

  const setGoal = useCallback((n: number | null) => {
    const normalized = normalizeGoal(n);
    setGoalState(normalized);
    try {
      if (normalized === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(normalized));
      }
    } catch {
      // ignore
    }
  }, []);

  return { goal, setGoal };
}
