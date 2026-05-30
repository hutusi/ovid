import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { METADATA_TEXT_INPUT_PROPS } from "./shared";

export function LongTextField({
  ariaLabel,
  value,
  onSave,
}: {
  ariaLabel: string;
  value: string;
  onSave: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Re-measure the textarea any time the draft changes so the field grows with
  // its content. Using useLayoutEffect so the resize happens before paint and
  // the user never sees a one-frame mismatch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draft is read indirectly via textareaRef.scrollHeight after React commits the controlled value, so the effect must re-run when draft changes
  useLayoutEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.replace(/\s+$/, "");
    onSave(trimmed || null);
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        className="prop-longtext-input"
        rows={3}
        {...METADATA_TEXT_INPUT_PROPS}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter commits; bare Enter inserts a newline (default).
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            setEditing(false);
            setDraft(value);
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

  const displayValue = value ?? "";
  return (
    <button
      type="button"
      className="prop-longtext-area"
      aria-label={`${ariaLabel}${displayValue ? `: ${displayValue}` : ""}`}
      onClick={startEdit}
      title={t("properties.click_to_edit")}
    >
      <span className="prop-longtext-value">
        {displayValue || t("properties.editable_field_label")}
      </span>
    </button>
  );
}
