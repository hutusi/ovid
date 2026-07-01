import { useCallback, useState } from "react";
import { getItem, setJSON } from "./safeLocalStorage";

export interface AppPreferences {
  /** Reopen the last workspace and its tabs on launch. */
  restoreLastSession: boolean;
}

const STORAGE_KEY = "ovid:appPreferences";

const DEFAULT_PREFS: AppPreferences = {
  restoreLastSession: true,
};

/** Parse stored app preferences, falling back to defaults for missing or
 *  invalid fields. Exported for unit testing. */
export function parseAppPreferences(raw: string | null): AppPreferences {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      restoreLastSession:
        typeof parsed.restoreLastSession === "boolean"
          ? parsed.restoreLastSession
          : DEFAULT_PREFS.restoreLastSession,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function load(): AppPreferences {
  return parseAppPreferences(getItem(STORAGE_KEY));
}

export function useAppPreferences() {
  const [prefs, setPrefs] = useState<AppPreferences>(load);

  const updatePrefs = useCallback((updates: Partial<AppPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updates };
      setJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { prefs, updatePrefs };
}
