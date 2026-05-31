import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function formatDate(value: string, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`)
    );
  } catch {
    return value;
  }
}

export function DateField({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        // `lang` is the only standard hint a browser exposes for native form
        // controls' localization (month/day names in the date picker dropdown).
        // WebKit (Tauri on macOS) often ignores it and follows OS locale, so
        // treat this as best-effort — the formatted display below is the
        // user-facing string we fully control.
        lang={i18n.language}
        aria-label={t("properties.date")}
        className="prop-input prop-input--date"
        value={value}
        onChange={(e) => {
          onSave(e.target.value || null);
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      type="button"
      className="prop-editable-area"
      onClick={() => setEditing(true)}
      title={t("properties.click_to_edit")}
    >
      <span className="prop-value">{formatDate(value, i18n.language)}</span>
    </button>
  );
}
