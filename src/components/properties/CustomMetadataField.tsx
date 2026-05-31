import { useTranslation } from "react-i18next";
import type { FrontmatterValue } from "../../lib/frontmatter";
import {
  getFrontmatterFieldLabel,
  inferCustomFrontmatterValueType,
  readBooleanFrontmatterValue,
} from "../../lib/frontmatterSchema";
import { BooleanField } from "./BooleanField";
import { DateField } from "./DateField";
import { EditableValue } from "./EditableValue";
import { RemoveFieldButton } from "./RemoveFieldButton";
import { TagInput } from "./TagInput";

export function CustomMetadataField({
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
  const displayLabel = getFrontmatterFieldLabel(fieldKey, t);
  const removeButton = <RemoveFieldButton label={displayLabel} onRemove={onRemove} />;

  if (inferredType === "boolean") {
    return (
      <BooleanField
        label={displayLabel}
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
        label={displayLabel}
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
            onError?.(t("properties.error_must_be_number", { key: displayLabel }));
          }
        }}
      />
    );
  } else {
    editor = (
      <EditableValue label={displayLabel} value={value} onSave={(nextValue) => onSave(nextValue)} />
    );
  }

  return (
    <div className="prop-field">
      <div className="prop-field-head">
        <span className="prop-label">{displayLabel}</span>
        <div className="prop-field-actions">{removeButton}</div>
      </div>
      {editor}
    </div>
  );
}
