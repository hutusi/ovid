import { useEffect, useRef, useState } from "react";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import {
  type CustomFrontmatterValueType,
  coerceCustomFrontmatterValue,
  getFrontmatterFieldDefaultValue,
  getFrontmatterFieldLabel,
  getFrontmatterFieldValue,
  getMissingAddableFrontmatterFields,
  inferCustomFrontmatterValueType,
  isKnownFrontmatterField,
  normalizeFrontmatterKey,
  readBooleanFrontmatterValue,
  resolveKnownFrontmatterFieldKey,
} from "../lib/frontmatterSchema";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./PropertiesPanel.css";

interface PropertiesPanelProps {
  frontmatter: ParsedFrontmatter;
  visible: boolean;
  slug?: string;
  coverImageVisible?: boolean;
  onFieldChange?: (key: string, value: FrontmatterValue) => void;
  onToggleCoverImage?: () => void;
  onError?: (message: string) => void;
}

const PUBLISHING_BOOLEAN_FIELDS = ["draft", "featured", "pinned"];
const CUSTOM_METADATA_TYPES: CustomFrontmatterValueType[] = [
  "text",
  "boolean",
  "number",
  "date",
  "tags",
];
const METADATA_TEXT_INPUT_PROPS = {
  autoCapitalize: "off" as const,
  autoCorrect: "off" as const,
  spellCheck: false,
};

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`)
    );
  } catch {
    return value;
  }
}

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
        aria-label="Add tag"
        className="tag-input"
        {...METADATA_TEXT_INPUT_PROPS}
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
      title="Click to edit"
    >
      <span className="prop-value">{displayValue}</span>
    </button>
  );
}

function RemoveFieldButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className="prop-remove-btn"
      aria-label={`Remove ${label} metadata`}
      title={`Remove ${label}`}
      onClick={(event) => {
        onRemove();
        event.currentTarget.blur();
      }}
    >
      ×
    </button>
  );
}

// ---------------------------------------------------------------------------
// Add field row
// ---------------------------------------------------------------------------

function CustomMetadataDialog({
  existingKeys,
  onConfirm,
  onCancel,
}: {
  existingKeys: string[];
  onConfirm: (key: string, value: FrontmatterValue) => void;
  onCancel: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const [key, setKey] = useState("");
  const [valueType, setValueType] = useState<CustomFrontmatterValueType>("text");
  const [rawValue, setRawValue] = useState("");
  const [booleanValue, setBooleanValue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const k = key.trim();
    const normalizedKey = normalizeFrontmatterKey(k);
    if (!k) {
      setError("Key is required.");
      return;
    }
    if (
      existingKeys.some((existingKey) => normalizeFrontmatterKey(existingKey) === normalizedKey)
    ) {
      setError("This field already exists.");
      return;
    }
    if (resolveKnownFrontmatterFieldKey(k)) {
      setError("Use the dedicated editor for this field.");
      return;
    }

    const value = coerceCustomFrontmatterValue(valueType, rawValue, booleanValue);
    if (value === null) {
      setError("Value is required for this metadata type.");
      return;
    }

    onConfirm(k, value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add custom metadata"
        className="modal-panel prop-dialog"
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">Add Custom Metadata</p>
        <p className="modal-copy">Add a custom frontmatter field with an explicit value type.</p>

        <div className="prop-dialog-grid">
          <label className="prop-dialog-field">
            <span className="prop-label">Key</span>
            <input
              aria-label="Metadata key"
              className="modal-input"
              {...METADATA_TEXT_INPUT_PROPS}
              placeholder="readingTime"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
            />
          </label>

          <label className="prop-dialog-field">
            <span className="prop-label">Type</span>
            <select
              aria-label="Metadata type"
              className="modal-input prop-dialog-select"
              value={valueType}
              onChange={(e) => {
                setValueType(e.target.value as CustomFrontmatterValueType);
                setError(null);
              }}
            >
              {CUSTOM_METADATA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>

        {valueType === "boolean" ? (
          <div className="prop-dialog-field">
            <span className="prop-label">Value</span>
            <div className="prop-dialog-toggle-row">
              <button
                type="button"
                className={`prop-dialog-choice${booleanValue ? " is-active" : ""}`}
                aria-pressed={booleanValue}
                onClick={() => setBooleanValue(true)}
              >
                True
              </button>
              <button
                type="button"
                className={`prop-dialog-choice${!booleanValue ? " is-active" : ""}`}
                aria-pressed={!booleanValue}
                onClick={() => setBooleanValue(false)}
              >
                False
              </button>
            </div>
          </div>
        ) : (
          <label className="prop-dialog-field">
            <span className="prop-label">Value</span>
            <input
              aria-label="Metadata value"
              type={valueType === "number" ? "number" : valueType === "date" ? "date" : "text"}
              className="modal-input"
              {...(valueType === "text" || valueType === "tags" ? METADATA_TEXT_INPUT_PROPS : {})}
              placeholder={valueType === "tags" ? "tag-one, tag-two" : "Value"}
              value={rawValue}
              onChange={(e) => {
                setRawValue(e.target.value);
                setError(null);
              }}
            />
          </label>
        )}

        {error && <p className="prop-dialog-error">{error}</p>}

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={submit}>
            Add metadata
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomMetadataField({
  fieldKey,
  value,
  onSave,
  onRemove,
  onError,
}: {
  fieldKey: string;
  value: FrontmatterValue;
  onSave: (value: FrontmatterValue) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
}) {
  const inferredType = inferCustomFrontmatterValueType(value);
  const removeButton = <RemoveFieldButton label={fieldKey} onRemove={onRemove} />;

  if (inferredType === "boolean") {
    return (
      <BooleanField
        label={fieldKey}
        checked={readBooleanFrontmatterValue(value)}
        onSave={(nextValue) => onSave(nextValue)}
        action={removeButton}
      />
    );
  }

  let editor: React.ReactNode;
  if (inferredType === "tags") {
    editor = (
      <TagInput
        tags={Array.isArray(value) ? value : []}
        onSave={(nextValue) => onSave(nextValue)}
      />
    );
  } else if (inferredType === "date" && typeof value === "string") {
    editor = <DateField value={value} onSave={(nextValue) => onSave(nextValue)} />;
  } else if (inferredType === "number") {
    editor = (
      <EditableValue
        label={fieldKey}
        value={value}
        onSave={(nextValue) => {
          if (nextValue === null) {
            onSave(null);
            return;
          }
          const parsed = Number(String(nextValue).trim());
          if (Number.isFinite(parsed)) {
            onSave(parsed);
          } else {
            onError?.(`"${fieldKey}" must be a number.`);
          }
        }}
      />
    );
  } else {
    editor = (
      <EditableValue label={fieldKey} value={value} onSave={(nextValue) => onSave(nextValue)} />
    );
  }

  return (
    <div className="prop-field">
      <div className="prop-field-head">
        <span className="prop-label">{fieldKey}</span>
        <div className="prop-field-actions">{removeButton}</div>
      </div>
      {editor}
    </div>
  );
}

function AddFieldRow({
  addableKeys,
  onAddKnownField,
  onAdd,
  existingKeys,
}: {
  addableKeys: string[];
  onAddKnownField: (key: string) => void;
  onAdd: (key: string, value: FrontmatterValue) => void;
  existingKeys: string[];
}) {
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  return (
    <div className="prop-add-block">
      <div className="prop-add-known">
        <span className="prop-section-title">Add Metadata</span>
        {addableKeys.length > 0 && (
          <div className="prop-add-known-list">
            {addableKeys.map((fieldKey) => (
              <button
                key={fieldKey}
                type="button"
                className="prop-add-known-btn"
                onClick={() => onAddKnownField(fieldKey)}
              >
                + {getFrontmatterFieldLabel(fieldKey)}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="prop-add-field-btn"
          onClick={() => setCustomDialogOpen(true)}
        >
          + Custom metadata
        </button>
      </div>

      {customDialogOpen && (
        <CustomMetadataDialog
          existingKeys={existingKeys}
          onConfirm={(key, value) => {
            onAdd(key, value);
            setCustomDialogOpen(false);
          }}
          onCancel={() => setCustomDialogOpen(false)}
        />
      )}
    </div>
  );
}

function BooleanField({
  label,
  checked,
  stateLabel,
  onSave,
  action,
}: {
  label: string;
  checked: boolean;
  stateLabel?: string;
  onSave: (v: boolean) => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="prop-boolean-row">
      <div className="prop-boolean-copy">
        <span className="prop-boolean-label">{label}</span>
        <span className="prop-boolean-state">
          {stateLabel ?? (checked ? "Enabled" : "Disabled")}
        </span>
      </div>
      <div className="prop-boolean-actions">
        <button
          type="button"
          className={`prop-boolean-toggle${checked ? " is-on" : ""}`}
          aria-label={`${label}: ${checked ? "enabled" : "disabled"}`}
          aria-pressed={checked}
          onClick={() => onSave(!checked)}
        >
          <span className="prop-boolean-knob" />
        </button>
        {action}
      </div>
    </div>
  );
}

function PublishingBooleanField({
  fieldKey,
  value,
  onSave,
  onRemove,
}: {
  fieldKey: string;
  value: FrontmatterValue;
  onSave: (fieldKey: string, value: boolean) => void;
  onRemove?: () => void;
}) {
  const checked = readBooleanFrontmatterValue(value);
  return (
    <BooleanField
      label={getFrontmatterFieldLabel(fieldKey)}
      checked={checked}
      stateLabel={fieldKey === "draft" ? (checked ? "Draft" : "Published") : undefined}
      onSave={(nextValue) => onSave(fieldKey, nextValue)}
      action={
        onRemove ? (
          <RemoveFieldButton label={getFrontmatterFieldLabel(fieldKey)} onRemove={onRemove} />
        ) : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Cover image field with preview toggle
// ---------------------------------------------------------------------------

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CoverImageField({
  value,
  previewVisible,
  onTogglePreview,
  onSave,
  onRemove,
}: {
  value: string;
  previewVisible: boolean;
  onTogglePreview: () => void;
  onSave: (v: FrontmatterValue) => void;
  onRemove: () => void;
}) {
  return (
    <div className="prop-field">
      <div className="prop-field-head">
        <span className="prop-label">Cover Image</span>
        <div className="prop-field-actions">
          <button
            type="button"
            className="prop-cover-eye-btn"
            aria-label={previewVisible ? "Hide cover image preview" : "Show cover image preview"}
            aria-pressed={previewVisible}
            onClick={onTogglePreview}
          >
            <EyeIcon open={previewVisible} />
          </button>
          <RemoveFieldButton label="cover image" onRemove={onRemove} />
        </div>
      </div>
      <EditableValue label="Cover image path" value={value} onSave={onSave} />
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
  coverImageVisible = false,
  onFieldChange,
  onToggleCoverImage,
  onError,
}: PropertiesPanelProps) {
  const titleValue = getFrontmatterFieldValue(frontmatter, "title");
  const dateValue = getFrontmatterFieldValue(frontmatter, "date");
  const tagsValue = getFrontmatterFieldValue(frontmatter, "tags");
  const coverImageValue = getFrontmatterFieldValue(frontmatter, "coverImage");
  const title = typeof titleValue === "string" ? titleValue : undefined;
  const date = typeof dateValue === "string" ? dateValue : undefined;
  const tags = Array.isArray(tagsValue) ? tagsValue : undefined;
  const coverImage = typeof coverImageValue === "string" ? coverImageValue : undefined;
  const publishingFields = PUBLISHING_BOOLEAN_FIELDS.map((key) => ({
    key,
    value: getFrontmatterFieldValue(frontmatter, key),
  })).filter((field): field is { key: string; value: FrontmatterValue } => field.value != null);
  const isEmpty = Object.values(frontmatter).every((v) => v == null);
  const addableKeys = getMissingAddableFrontmatterFields(frontmatter);
  const customKeys = Object.keys(frontmatter)
    .filter((k) => frontmatter[k] != null && !isKnownFrontmatterField(k))
    .sort();

  return (
    <div className={`properties-panel${visible ? "" : " hidden"}`}>
      {/* ── Header ─────────────────────────────────── */}
      <div className="prop-header">
        <div className="prop-header-main">
          <span className="prop-panel-kicker">Metadata</span>
          <span className="prop-panel-title">Frontmatter</span>
        </div>
      </div>

      {/* ── Body: standard fields ──────────────────── */}
      <div className="properties-body">
        <section className="prop-section" aria-label="Document metadata">
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
              <DateField value={date} onSave={(v) => onFieldChange?.("date", v)} />
            </div>
          )}

          {tags !== undefined && (
            <div className="prop-field">
              <span className="prop-label">Tags</span>
              <TagInput tags={tags} onSave={(v) => onFieldChange?.("tags", v)} />
            </div>
          )}
        </section>

        {publishingFields.length > 0 && (
          <section className="prop-section" aria-label="Publishing metadata">
            <span className="prop-section-title">Publishing</span>
            {publishingFields.map(({ key, value }) => (
              <PublishingBooleanField
                key={key}
                fieldKey={key}
                value={value}
                onSave={(fieldKey, value) => onFieldChange?.(fieldKey, value)}
                onRemove={key === "draft" ? undefined : () => onFieldChange?.(key, null)}
              />
            ))}
          </section>
        )}

        {coverImage !== undefined && (
          <section className="prop-section" aria-label="Cover image metadata">
            <CoverImageField
              value={coverImage}
              previewVisible={coverImageVisible}
              onTogglePreview={() => onToggleCoverImage?.()}
              onSave={(v) => onFieldChange?.("coverImage", v)}
              onRemove={() => onFieldChange?.("coverImage", null)}
            />
          </section>
        )}

        {/* ── Custom fields ─────────────────────────── */}
        {customKeys.length > 0 && (
          <section className="prop-section" aria-label="Custom metadata">
            <span className="prop-section-title">Custom</span>
            {customKeys.map((key) => (
              <div key={key}>
                <CustomMetadataField
                  fieldKey={key}
                  value={frontmatter[key]}
                  onSave={(v) => onFieldChange?.(key, v)}
                  onRemove={() => onFieldChange?.(key, null)}
                  onError={onError}
                />
              </div>
            ))}
          </section>
        )}

        {isEmpty && (
          <p className="prop-empty-notice">
            No frontmatter in this file.
            <br />
            Add a field below to get started.
          </p>
        )}
        <AddFieldRow
          existingKeys={Object.keys(frontmatter).filter((k) => frontmatter[k] != null)}
          addableKeys={addableKeys}
          onAddKnownField={(key) => onFieldChange?.(key, getFrontmatterFieldDefaultValue(key))}
          onAdd={(k, v) => onFieldChange?.(k, v)}
        />
      </div>
    </div>
  );
}
