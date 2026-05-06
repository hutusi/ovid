import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FrontmatterValue } from "../../lib/frontmatter";
import { METADATA_TEXT_INPUT_PROPS } from "./shared";

export function EditableValue({
  value,
  label,
  onSave,
}: {
  value: FrontmatterValue;
  label?: string;
  onSave: (v: FrontmatterValue) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value ?? ""));
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(value ?? ""));
  }, [value, editing]);

  function startEdit() {
    setDraft(String(value ?? ""));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    onSave(draft.trim() || null);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={label}
        className="prop-input"
        {...METADATA_TEXT_INPUT_PROPS}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            skipBlurCommitRef.current = true;
            commit();
          } else if (e.key === "Escape") {
            skipBlurCommitRef.current = true;
            setEditing(false);
            setDraft(String(value ?? ""));
          }
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commit();
        }}
        onKeyUp={(e) => e.stopPropagation()}
      />
    );
  }

  const displayValue = String(value ?? "");
  const buttonLabel = label
    ? `${label}${displayValue ? `: ${displayValue}` : ""}`
    : displayValue || "Editable field";

  return (
    <button
      type="button"
      className="prop-editable-area"
      aria-label={buttonLabel}
      onClick={startEdit}
      title={t("properties.click_to_edit")}
    >
      <span className="prop-value">{displayValue}</span>
    </button>
  );
}
