import { useEffect, useRef, useState } from "react";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import { ContentTypeIcon } from "./ContentTypeIcon";
import "./PropertiesPanel.css";

interface PropertiesPanelProps {
  frontmatter: ParsedFrontmatter;
  visible: boolean;
  slug?: string;
  onFieldChange?: (key: string, value: FrontmatterValue) => void;
}

const STANDARD_FIELDS = new Set(["title", "type", "draft", "date", "tags"]);
const STANDARD_TYPES = ["post", "flow", "note", "series", "book", "page"];

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`)
    );
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Type selector in header
// ---------------------------------------------------------------------------

function TypeSelector({
  type,
  onChange,
}: {
  type: string | undefined;
  onChange: (t: string) => void;
}) {
  return (
    <div className="prop-type-row">
      <ContentTypeIcon type={type} size={14} />
      <select
        className="prop-type-select"
        value={type ?? ""}
        aria-label="Content type"
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          unknown
        </option>
        {STANDARD_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date field with native date picker
// ---------------------------------------------------------------------------

function DateField({ value, onSave }: { value: string; onSave: (v: string | null) => void }) {
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
        aria-label="Date"
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
      title="Click to edit"
    >
      <span className="prop-value">{formatDate(value)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tag chip input
// ---------------------------------------------------------------------------

function TagInput({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.replace(/,$/, "").trim();
    if (tag && !tags.includes(tag)) {
      onSave([...tags, tag]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onSave(tags.filter((t) => t !== tag));
  }

  return (
    <div className="tag-input-area" role="none" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag) => (
        <span key={tag} className="prop-tag">
          {tag}
          <button
            type="button"
            className="prop-tag-remove"
            aria-label={`Remove tag ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="tag-input"
        value={input}
        placeholder={tags.length === 0 ? "add tag…" : ""}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(input);
          } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic editable text field
// ---------------------------------------------------------------------------

function EditableValue({
  value,
  label,
  onSave,
}: {
  value: FrontmatterValue;
  label?: string;
  onSave: (v: FrontmatterValue) => void;
}) {
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

  return (
    <button type="button" className="prop-editable-area" onClick={startEdit} title="Click to edit">
      <span className="prop-value">{String(value ?? "")}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Add field row
// ---------------------------------------------------------------------------

function AddFieldRow({ onAdd }: { onAdd: (key: string, value: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) keyRef.current?.focus();
  }, [adding]);

  function submit() {
    const k = key.trim();
    if (!k) return;
    onAdd(k, val.trim());
    setKey("");
    setVal("");
    setAdding(false);
  }

  function cancel() {
    setKey("");
    setVal("");
    setAdding(false);
  }

  if (!adding) {
    return (
      <button type="button" className="prop-add-field-btn" onClick={() => setAdding(true)}>
        + Add field
      </button>
    );
  }

  return (
    <div className="prop-add-row">
      <input
        ref={keyRef}
        aria-label="Field name"
        className="prop-input prop-input--sm"
        placeholder="field name"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          else if (e.key === "Enter") submit();
        }}
      />
      <input
        aria-label="Field value"
        className="prop-input prop-input--sm"
        placeholder="value"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          else if (e.key === "Enter") submit();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PropertiesPanel
// ---------------------------------------------------------------------------

export function PropertiesPanel({
  frontmatter,
  visible,
  slug,
  onFieldChange,
}: PropertiesPanelProps) {
  const type = frontmatter.type as string | undefined;
  const draft = frontmatter.draft as boolean | undefined;
  const title = frontmatter.title;
  const date = frontmatter.date as string | undefined;
  const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : undefined;
  const customKeys = Object.keys(frontmatter)
    .filter((k) => !STANDARD_FIELDS.has(k))
    .sort();

  return (
    <div className={`properties-panel${visible ? "" : " hidden"}`}>
      {/* ── Header: type + status ──────────────────── */}
      <div className="prop-header">
        <TypeSelector type={type} onChange={(t) => onFieldChange?.("type", t)} />
        <button
          type="button"
          className={`prop-status-badge${draft ? "" : " published"}`}
          title={draft ? "Click to publish" : "Click to mark as draft"}
          onClick={() => onFieldChange?.("draft", !draft)}
        >
          {draft ? "Draft" : "Published"}
        </button>
      </div>

      {/* ── Body: standard fields ──────────────────── */}
      <div className="properties-body">
        {title !== undefined && (
          <div className="prop-field">
            <span className="prop-label">Title</span>
            <EditableValue
              label="Title"
              value={title}
              onSave={(v) => onFieldChange?.("title", v)}
            />
          </div>
        )}

        {slug && (
          <div className="prop-field">
            <span className="prop-label">Slug</span>
            <span className="prop-slug">{slug}</span>
          </div>
        )}

        {date !== undefined && (
          <div className="prop-field">
            <span className="prop-label">Date</span>
            <DateField value={date} onSave={(v) => onFieldChange?.("date", v ?? "")} />
          </div>
        )}

        {tags !== undefined && (
          <div className="prop-field">
            <span className="prop-label">Tags</span>
            <TagInput tags={tags} onSave={(v) => onFieldChange?.("tags", v)} />
          </div>
        )}

        {/* ── Custom fields ─────────────────────────── */}
        {customKeys.length > 0 && (
          <>
            <div className="prop-divider" />
            {customKeys.map((key) => (
              <div key={key} className="prop-field">
                <span className="prop-label">{key}</span>
                <EditableValue
                  label={key}
                  value={frontmatter[key]}
                  onSave={(v) => onFieldChange?.(key, v)}
                />
              </div>
            ))}
          </>
        )}

        <AddFieldRow onAdd={(k, v) => onFieldChange?.(k, v)} />
      </div>
    </div>
  );
}
