import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FrontmatterValue } from "../../lib/frontmatter";
import { getFrontmatterFieldLabel } from "../../lib/frontmatterSchema";
import { CustomMetadataDialog } from "./CustomMetadataDialog";

export function AddFieldRow({
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
