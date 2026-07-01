import { useCallback, useState } from "react";
import { getJSON, setJSON } from "./safeLocalStorage";

export type FontFamily = "serif" | "sans" | "mono";
export type FontSize = "small" | "default" | "large";

export interface EditorPreferences {
  fontFamily: FontFamily;
  fontSize: FontSize;
  spellCheck: boolean;
}

const STORAGE_KEY = "ovid:editorPreferences";

const DEFAULT_PREFS: EditorPreferences = {
  fontFamily: "serif",
  fontSize: "default",
  spellCheck: true,
};

const FONT_FAMILY_VALUES: Record<FontFamily, string> = {
  serif: '"Georgia", "Times New Roman", serif',
  sans: "system-ui, -apple-system, sans-serif",
  mono: '"Fira Code", "JetBrains Mono", monospace',
};

const FONT_SIZE_VALUES: Record<FontSize, string> = {
  small: "15px",
  default: "17px",
  large: "19px",
};

function load(): EditorPreferences {
  return { ...DEFAULT_PREFS, ...getJSON<Partial<EditorPreferences>>(STORAGE_KEY, {}) };
}

function applyPrefs(prefs: EditorPreferences): void {
  document.documentElement.style.setProperty("--font-editor", FONT_FAMILY_VALUES[prefs.fontFamily]);
  document.documentElement.style.setProperty(
    "--font-editor-size",
    FONT_SIZE_VALUES[prefs.fontSize]
  );
}

export function useEditorPreferences() {
  const [prefs, setPrefs] = useState<EditorPreferences>(() => {
    const p = load();
    applyPrefs(p);
    return p;
  });

  const updatePrefs = useCallback((updates: Partial<EditorPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updates };
      applyPrefs(next);
      setJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { prefs, updatePrefs };
}
