import { useEffect, useRef, useState } from "react";
import "./PropertiesPanel.css";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";

interface PropertiesPanelProps {
  frontmatter: ParsedFrontmatter;
  visible: boolean;
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

  useEffect(() => {
    if (!editing) {
      setDraft(toInputString(value));
    }
  }, [value, editing]);

  function startEdit() {
    setDraft(toInputString(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    const trimmed = draft.trim();
    if (Array.isArray(value)) {
      setEditing(false);
      const arr = trimmed
        ? trimmed
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      onSave(arr);
    } else if (typeof value === "boolean") {
      const normalized = trimmed.toLowerCase();
      if (normalized !== "true" && normalized !== "false") {
        setDraft(toInputString(value));
        return;
      }
      setEditing(false);
      onSave(normalized === "true");
    } else if (typeof value === "number") {
      setEditing(false);
      const num = Number(trimmed);
      onSave(Number.isNaN(num) ? value : num);
    } else {
      setEditing(false);
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
        onKeyUp={(e) => e.stopPropagation()}
      />
    );
  }

  if (fieldKey === "tags" && Array.isArray(value)) {
    return (
      <button
        type="button"
        className="prop-editable-area"
        onClick={startEdit}
        title="Click to edit"
      >
        {value.length > 0 ? (
          <span className="prop-tags">
            {value.map((tag) => (
              <span key={tag} className="prop-tag">
                {tag}
              </span>
            ))}
          </span>
        ) : (
          <span className="prop-empty">add tags…</span>
        )}
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

export function PropertiesPanel({ frontmatter, visible, onFieldChange }: PropertiesPanelProps) {
  const keys = sortedKeys(frontmatter);

  return (
    <div className={`properties-panel${visible ? "" : " hidden"}`}>
      <div className="properties-body">
        {keys.map((key) => {
          const val = frontmatter[key];
          if (val === null || val === undefined) return null;

          if (key === "draft") {
            return (
              <div key={key} className="prop-field">
                <span className="prop-label">Draft</span>
                <button
                  type="button"
                  className={`prop-draft${val ? "" : " prop-draft-published"}`}
                  title={val ? "Click to publish" : "Click to mark as draft"}
                  onClick={() => onFieldChange?.(key, !val)}
                >
                  {val ? "Draft" : "Published"}
                </button>
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
  );
}
