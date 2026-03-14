import { useEffect, useRef, useState } from "react";
import "./PropertiesPanel.css";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";

interface PropertiesPanelProps {
  frontmatter: ParsedFrontmatter;
  isOpen: boolean;
  onToggle: () => void;
  onFieldChange?: (key: string, value: FrontmatterValue) => void;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`)
    );
  } catch {
    return value;
  }
}

const FIELD_ORDER = ["title", "date", "tags", "draft"];

function toInputString(v: FrontmatterValue): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined) return "";
  return String(v);
}

function sortedKeys(frontmatter: ParsedFrontmatter): string[] {
  const known = FIELD_ORDER.filter((k) => k in frontmatter);
  const rest = Object.keys(frontmatter)
    .filter((k) => !FIELD_ORDER.includes(k))
    .sort();
  return [...known, ...rest];
}

interface EditableValueProps {
  fieldKey: string;
  value: FrontmatterValue;
  onSave: (newValue: FrontmatterValue) => void;
}

function EditableValue({ fieldKey, value, onSave }: EditableValueProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(toInputString(value));

  // Sync draft when value is updated externally (e.g. frontmatter written from disk)
  useEffect(() => {
    if (!editing) {
      setDraft(toInputString(value));
    }
  }, [value, editing]);

  function startEdit() {
    setDraft(toInputString(value));
    setEditing(true);
    // Focus on next tick after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (Array.isArray(value)) {
      // Parse comma-separated back to array
      const arr = trimmed
        ? trimmed
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      onSave(arr);
    } else if (typeof value === "number") {
      const num = Number(trimmed);
      onSave(Number.isNaN(num) ? value : num);
    } else {
      onSave(trimmed || null);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(toInputString(value));
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="prop-edit-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        onBlur={commit}
        // Prevent sidebar keyboard shortcuts from firing while editing
        onKeyUp={(e) => e.stopPropagation()}
      />
    );
  }

  // For tags: show tag chips, click any to edit
  if (fieldKey === "tags" && Array.isArray(value)) {
    return (
      <button
        type="button"
        className="prop-editable-area"
        onClick={startEdit}
        title="Click to edit"
      >
        {value.map((tag) => (
          <span key={tag} className="prop-tag">
            {tag}
          </span>
        ))}
        {value.length === 0 && <span className="prop-value prop-empty">add tags…</span>}
      </button>
    );
  }

  if (fieldKey === "date" && typeof value === "string") {
    return (
      <button
        type="button"
        className="prop-editable-area"
        onClick={startEdit}
        title="Click to edit"
      >
        <span className="prop-value">{formatDate(value)}</span>
      </button>
    );
  }

  if (fieldKey === "title") {
    return (
      <button
        type="button"
        className="prop-editable-area"
        onClick={startEdit}
        title="Click to edit"
      >
        <span className="prop-value prop-title">{String(value)}</span>
      </button>
    );
  }

  return (
    <button type="button" className="prop-editable-area" onClick={startEdit} title="Click to edit">
      <span className="prop-value">{String(value ?? "")}</span>
    </button>
  );
}

export function PropertiesPanel({
  frontmatter,
  isOpen,
  onToggle,
  onFieldChange,
}: PropertiesPanelProps) {
  const keys = sortedKeys(frontmatter);

  return (
    <div className={`properties-wrapper ${isOpen ? "" : "panel-closed"}`}>
      <div className={`properties-panel ${isOpen ? "open" : "closed"}`}>
        <div className="properties-inner">
          {keys.map((key) => {
            const val = frontmatter[key];
            if (val === null || val === undefined) return null;

            // Draft: toggle button, not a text field
            if (key === "draft") {
              return (
                <div key={key} className="prop-field">
                  <button
                    type="button"
                    className={`prop-draft ${val ? "" : "prop-draft-published"}`}
                    title={val ? "Click to publish" : "Click to mark as draft"}
                    onClick={() => onFieldChange?.(key, !val)}
                  >
                    {val ? "Draft" : "Published"}
                  </button>
                </div>
              );
            }

            if (key === "tags" && Array.isArray(val)) {
              return (
                <div key={key} className="prop-field">
                  <EditableValue
                    fieldKey={key}
                    value={val}
                    onSave={(v) => onFieldChange?.(key, v)}
                  />
                </div>
              );
            }

            if (key === "title") {
              return (
                <div key={key} className="prop-field">
                  <EditableValue
                    fieldKey={key}
                    value={val}
                    onSave={(v) => onFieldChange?.(key, v)}
                  />
                </div>
              );
            }

            if (key === "date" && typeof val === "string") {
              return (
                <div key={key} className="prop-field">
                  <span className="prop-label">date</span>
                  <EditableValue
                    fieldKey={key}
                    value={val}
                    onSave={(v) => onFieldChange?.(key, v)}
                  />
                </div>
              );
            }

            return (
              <div key={key} className="prop-field">
                <span className="prop-label">{key}</span>
                <EditableValue fieldKey={key} value={val} onSave={(v) => onFieldChange?.(key, v)} />
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="properties-toggle"
        onClick={onToggle}
        title={isOpen ? "Hide properties" : "Show properties"}
        aria-label="Toggle properties panel"
      >
        {isOpen ? "›" : "‹"}
      </button>
    </div>
  );
}
