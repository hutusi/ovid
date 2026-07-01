import { useCallback, useState } from "react";
import type { ContentFormat, ContentLayout } from "./amytisScaffold";
import { getItem, setJSON } from "./safeLocalStorage";

export interface ContentPreferences {
  /** Extension for new content (`generic`/`flow` always stay `.md`). */
  format: ContentFormat;
  /** File vs folder layout for new flat post-like content. */
  layout: ContentLayout;
}

const STORAGE_KEY = "ovid:contentPreferences";

const DEFAULT_PREFS: ContentPreferences = {
  format: "mdx",
  layout: "file",
};

/** Parse stored content preferences, falling back to the Amytis defaults for
 *  missing or invalid fields. Exported for unit testing. */
export function parseContentPreferences(raw: string | null): ContentPreferences {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<ContentPreferences>;
    return {
      format:
        parsed.format === "md" || parsed.format === "mdx" ? parsed.format : DEFAULT_PREFS.format,
      layout:
        parsed.layout === "file" || parsed.layout === "folder"
          ? parsed.layout
          : DEFAULT_PREFS.layout,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function load(): ContentPreferences {
  return parseContentPreferences(getItem(STORAGE_KEY));
}

export function useContentPreferences() {
  const [prefs, setPrefs] = useState<ContentPreferences>(load);

  const updatePrefs = useCallback((updates: Partial<ContentPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updates };
      setJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { prefs, updatePrefs };
}
