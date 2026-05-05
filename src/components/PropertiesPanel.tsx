import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { resolveImageExtension, resolveImageSrc, toAssetRootRelative } from "../lib/imageUtils";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./PropertiesPanel.css";

interface PropertiesPanelProps {
  frontmatter: ParsedFrontmatter;
  visible: boolean;
  slug?: string;
  coverImageVisible?: boolean;
  filePath?: string;
  assetRoot?: string;
  cdnBase?: string;
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
const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

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

// ---------------------------------------------------------------------------
// Tag chip input
// ---------------------------------------------------------------------------

function TagInput({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const { t } = useTranslation();
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
            aria-label={t("properties.remove_tag", { tag })}
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
        aria-label={t("properties.add_tag")}
        className="tag-input"
        {...METADATA_TEXT_INPUT_PROPS}
        value={input}
        placeholder={tags.length === 0 ? t("properties.add_tag_placeholder") : ""}
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

function RemoveFieldButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="prop-remove-btn"
      aria-label={t("properties.remove_field", { label })}
      title={t("properties.remove_field", { label })}
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
  const { t } = useTranslation();
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
      setError(t("properties.error_key_required"));
      return;
    }
    if (
      existingKeys.some((existingKey) => normalizeFrontmatterKey(existingKey) === normalizedKey)
    ) {
      setError(t("properties.error_field_exists"));
      return;
    }
    if (resolveKnownFrontmatterFieldKey(k)) {
      setError(t("properties.error_use_dedicated"));
      return;
    }

    const value = coerceCustomFrontmatterValue(valueType, rawValue, booleanValue);
    if (value === null) {
      setError(t("properties.error_value_required"));
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
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("properties.add_custom")}
        className="modal-panel prop-dialog"
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("properties.add_custom")}</p>
        <p className="modal-copy">{t("properties.add_custom_desc")}</p>

        <div className="prop-dialog-grid">
          <label className="prop-dialog-field">
            <span className="prop-label">{t("properties.key")}</span>
            <input
              aria-label={t("properties.key_label")}
              className="modal-input"
              {...METADATA_TEXT_INPUT_PROPS}
              placeholder={t("properties.key_placeholder")}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
            />
          </label>

          <label className="prop-dialog-field">
            <span className="prop-label">{t("properties.type")}</span>
            <select
              aria-label={t("properties.type_label")}
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
            <span className="prop-label">{t("properties.value")}</span>
            <div className="prop-dialog-toggle-row">
              <button
                type="button"
                className={`prop-dialog-choice${booleanValue ? " is-active" : ""}`}
                aria-pressed={booleanValue}
                onClick={() => setBooleanValue(true)}
              >
                {t("properties.bool_true")}
              </button>
              <button
                type="button"
                className={`prop-dialog-choice${!booleanValue ? " is-active" : ""}`}
                aria-pressed={!booleanValue}
                onClick={() => setBooleanValue(false)}
              >
                {t("properties.bool_false")}
              </button>
            </div>
          </div>
        ) : (
          <label className="prop-dialog-field">
            <span className="prop-label">{t("properties.value")}</span>
            <input
              aria-label={t("properties.value_label")}
              type={valueType === "number" ? "number" : valueType === "date" ? "date" : "text"}
              className="modal-input"
              {...(valueType === "text" || valueType === "tags" ? METADATA_TEXT_INPUT_PROPS : {})}
              placeholder={
                valueType === "tags"
                  ? t("properties.tags_placeholder")
                  : t("properties.value_placeholder")
              }
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
            {t("properties.cancel")}
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={submit}>
            {t("properties.add_button")}
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
  const { t } = useTranslation();
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
            onError?.(t("properties.error_must_be_number", { key: fieldKey }));
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
  const { t } = useTranslation();
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  return (
    <div className="prop-add-block">
      <div className="prop-add-known">
        <span className="prop-section-title">{t("properties.add_metadata")}</span>
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
          + {t("properties.custom_metadata")}
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
  const { t } = useTranslation();
  return (
    <div className="prop-boolean-row">
      <div className="prop-boolean-copy">
        <span className="prop-boolean-label">{label}</span>
        <span className="prop-boolean-state">
          {stateLabel ?? (checked ? t("properties.enabled") : t("properties.disabled"))}
        </span>
      </div>
      <div className="prop-boolean-actions">
        <button
          type="button"
          className={`prop-boolean-toggle${checked ? " is-on" : ""}`}
          aria-label={`${label}: ${checked ? t("properties.enabled") : t("properties.disabled")}`}
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
  const { t } = useTranslation();
  const checked = readBooleanFrontmatterValue(value);
  return (
    <BooleanField
      label={getFrontmatterFieldLabel(fieldKey)}
      checked={checked}
      stateLabel={
        fieldKey === "draft"
          ? checked
            ? t("properties.draft")
            : t("properties.published")
          : undefined
      }
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

async function uploadImageBytes(file: File, filePath: string | undefined): Promise<string> {
  const ext = resolveImageExtension(file);
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  return invoke<string>("save_asset_from_bytes", {
    bytes,
    extension: ext,
    activeFilePath: filePath,
  });
}

function CoverImageField({
  value,
  previewVisible,
  filePath,
  assetRoot,
  cdnBase,
  onTogglePreview,
  onSave,
  onRemove,
  onError,
}: {
  value: string;
  previewVisible: boolean;
  filePath?: string;
  assetRoot?: string;
  cdnBase?: string;
  onTogglePreview: () => void;
  onSave: (v: FrontmatterValue) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const dropRef = useRef<HTMLFieldSetElement>(null);

  const trimmed = value.trim();
  const hasValue = trimmed.length > 0;
  const thumbSrc = hasValue ? resolveImageSrc(trimmed, filePath, assetRoot, cdnBase) : "";
  const thumbBroken = brokenSrc !== null && brokenSrc === thumbSrc;

  async function handleFile(file: File) {
    if (!IMAGE_MIME_RE.test(file.type)) {
      onError?.(t("properties.cover_invalid_type"));
      return;
    }
    setBusy(true);
    try {
      const relPath = await uploadImageBytes(file, filePath);
      onSave(relPath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onError?.(t("properties.cover_save_error", { reason }));
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseFile() {
    setBusy(true);
    try {
      const srcPath = await invoke<string | null>("pick_image_file");
      if (!srcPath) return;

      const rootRelative = toAssetRootRelative(srcPath, assetRoot);
      if (rootRelative !== null) {
        onSave(rootRelative);
        return;
      }

      const relPath = await invoke<string>("save_asset", {
        srcPath,
        activeFilePath: filePath,
      });
      onSave(relPath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onError?.(t("properties.cover_save_error", { reason }));
    } finally {
      setBusy(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (Array.from(e.dataTransfer.items).some((item) => IMAGE_MIME_RE.test(item.type))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragActive(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    setDragActive(false);
    const file = Array.from(e.dataTransfer.files).find((f) => IMAGE_MIME_RE.test(f.type));
    if (!file) return;
    e.preventDefault();
    void handleFile(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(
      (i) => i.kind === "file" && IMAGE_MIME_RE.test(i.type)
    );
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void handleFile(file);
  }

  const dropZoneClass = [
    "prop-cover-dropzone",
    hasValue ? "is-populated" : "is-empty",
    dragActive ? "is-drag-active" : "",
    busy ? "is-busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="prop-field">
      <div className="prop-field-head">
        <span className="prop-label">{t("properties.cover_image")}</span>
        <div className="prop-field-actions">
          <button
            type="button"
            className="prop-cover-eye-btn"
            aria-label={previewVisible ? t("properties.cover_hide") : t("properties.cover_show")}
            aria-pressed={previewVisible}
            onClick={onTogglePreview}
          >
            <EyeIcon open={previewVisible} />
          </button>
          <RemoveFieldButton label={t("properties.cover_image")} onRemove={onRemove} />
        </div>
      </div>

      <fieldset
        ref={dropRef}
        className={dropZoneClass}
        aria-label={t("properties.cover_dropzone_label")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: must be focusable so paste events fire here
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {hasValue && !thumbBroken ? (
          <img
            className="prop-cover-thumb"
            src={thumbSrc}
            alt={t("properties.cover_image")}
            onError={() => setBrokenSrc(thumbSrc)}
          />
        ) : (
          <div className="prop-cover-empty">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="prop-cover-empty-msg">
              {hasValue ? t("properties.cover_unavailable") : t("properties.cover_dropzone_hint")}
            </span>
          </div>
        )}

        <div className="prop-cover-actions">
          <button
            type="button"
            className="prop-cover-action-btn"
            disabled={busy}
            onClick={handleChooseFile}
          >
            {busy ? t("properties.cover_saving") : t("properties.cover_choose")}
          </button>
        </div>
      </fieldset>

      <EditableValue label={t("properties.cover_path")} value={value} onSave={onSave} />
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
  filePath,
  assetRoot,
  cdnBase,
  onFieldChange,
  onToggleCoverImage,
  onError,
}: PropertiesPanelProps) {
  const { t } = useTranslation();
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
          <span className="prop-panel-kicker">{t("properties.metadata")}</span>
          <span className="prop-panel-title">{t("properties.frontmatter")}</span>
        </div>
      </div>

      {/* ── Body: standard fields ──────────────────── */}
      <div className="properties-body">
        <section className="prop-section" aria-label={t("properties.document_metadata")}>
          {title !== undefined && (
            <div className="prop-field">
              <span className="prop-label">{t("properties.title")}</span>
              <EditableValue
                label={t("properties.title")}
                value={title}
                onSave={(v) => onFieldChange?.("title", v)}
              />
            </div>
          )}

          {slug && (
            <div className="prop-field">
              <span className="prop-label">{t("properties.slug")}</span>
              <span className="prop-slug">{slug}</span>
            </div>
          )}

          {date !== undefined && (
            <div className="prop-field">
              <span className="prop-label">{t("properties.date")}</span>
              <DateField value={date} onSave={(v) => onFieldChange?.("date", v)} />
            </div>
          )}

          {tags !== undefined && (
            <div className="prop-field">
              <span className="prop-label">{t("properties.tags")}</span>
              <TagInput tags={tags} onSave={(v) => onFieldChange?.("tags", v)} />
            </div>
          )}
        </section>

        {publishingFields.length > 0 && (
          <section className="prop-section" aria-label={t("properties.publishing_metadata")}>
            <span className="prop-section-title">{t("properties.publishing")}</span>
            {publishingFields.map(({ key, value }) => (
              <PublishingBooleanField
                key={key}
                fieldKey={key}
                value={value}
                onSave={(fieldKey, value) => onFieldChange?.(fieldKey, value)}
                onRemove={() => onFieldChange?.(key, null)}
              />
            ))}
          </section>
        )}

        {coverImage !== undefined && (
          <section className="prop-section" aria-label={t("properties.cover_image_metadata")}>
            <CoverImageField
              value={coverImage}
              previewVisible={coverImageVisible}
              filePath={filePath}
              assetRoot={assetRoot}
              cdnBase={cdnBase}
              onTogglePreview={() => onToggleCoverImage?.()}
              onSave={(v) => onFieldChange?.("coverImage", v)}
              onRemove={() => onFieldChange?.("coverImage", null)}
              onError={onError}
            />
          </section>
        )}

        {/* ── Custom fields ─────────────────────────── */}
        {customKeys.length > 0 && (
          <section className="prop-section" aria-label={t("properties.custom_metadata")}>
            <span className="prop-section-title">{t("properties.custom")}</span>
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
            {t("properties.no_frontmatter")}
            <br />
            {t("properties.add_field_hint")}
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
