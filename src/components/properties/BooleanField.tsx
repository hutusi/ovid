import { useTranslation } from "react-i18next";
import type { FrontmatterValue } from "../../lib/frontmatter";
import { getFrontmatterFieldLabel, readBooleanFrontmatterValue } from "../../lib/frontmatterSchema";
import { RemoveFieldButton } from "./RemoveFieldButton";

export function BooleanField({
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

export function PublishingBooleanField({
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
