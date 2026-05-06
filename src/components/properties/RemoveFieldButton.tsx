import { useTranslation } from "react-i18next";

export function RemoveFieldButton({ label, onRemove }: { label: string; onRemove: () => void }) {
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
