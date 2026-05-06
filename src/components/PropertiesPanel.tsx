import { useTranslation } from "react-i18next";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import {
  getFrontmatterFieldDefaultValue,
  getFrontmatterFieldValue,
  getMissingAddableFrontmatterFields,
  isKnownFrontmatterField,
} from "../lib/frontmatterSchema";
import "./PropertiesPanel.css";
import { AddFieldRow } from "./properties/AddFieldRow";
import { PublishingBooleanField } from "./properties/BooleanField";
import { CoverImageField } from "./properties/CoverImageField";
import { CustomMetadataField } from "./properties/CustomMetadataField";
import { DateField } from "./properties/DateField";
import { EditableValue } from "./properties/EditableValue";
import { TagInput } from "./properties/TagInput";

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
      <div className="prop-header">
        <div className="prop-header-main">
          <span className="prop-panel-kicker">{t("properties.metadata")}</span>
          <span className="prop-panel-title">{t("properties.frontmatter")}</span>
        </div>
      </div>

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
