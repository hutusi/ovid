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

const FONT_FAMILIES = Object.keys(FONT_FAMILY_VALUES) as FontFamily[];
const FONT_SIZES = Object.keys(FONT_SIZE_VALUES) as FontSize[];

/** Stored editor preferences, field by field: an unknown or mistyped value
 *  falls back to its default instead of reaching the CSS variables. */
export function parseEditorPreferences(stored: unknown): EditorPreferences {
  const prefs = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const fontFamily = prefs.fontFamily;
  const fontSize = prefs.fontSize;
  return {
    fontFamily: FONT_FAMILIES.find((value) => value === fontFamily) ?? DEFAULT_PREFS.fontFamily,
    fontSize: FONT_SIZES.find((value) => value === fontSize) ?? DEFAULT_PREFS.fontSize,
    spellCheck: typeof prefs.spellCheck === "boolean" ? prefs.spellCheck : DEFAULT_PREFS.spellCheck,
  };
}

function load(): EditorPreferences {
  return parseEditorPreferences(getJSON<unknown>(STORAGE_KEY, {}));
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
