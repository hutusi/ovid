import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
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
  const { t } = useTranslation();
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
      <span className="prop-value">{formatDate(value)}</span>
    </button>
  );
}
