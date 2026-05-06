import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FrontmatterValue } from "../../lib/frontmatter";
import {
  type CustomFrontmatterValueType,
  coerceCustomFrontmatterValue,
  normalizeFrontmatterKey,
  resolveKnownFrontmatterFieldKey,
} from "../../lib/frontmatterSchema";
import { useFocusTrap } from "../../lib/useFocusTrap";
import "../Modal.css";
import { METADATA_TEXT_INPUT_PROPS } from "./shared";

const CUSTOM_METADATA_TYPES: CustomFrontmatterValueType[] = [
  "text",
  "boolean",
  "number",
  "date",
  "tags",
];

export function CustomMetadataDialog({
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
