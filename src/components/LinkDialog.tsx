import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ModalActions } from "./Modal";

interface LinkDialogProps {
  initialHref: string;
  onApply: (url: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

export function LinkDialog({ initialHref, onApply, onRemove, onCancel }: LinkDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialHref);
  const inputRef = useRef<HTMLInputElement>(null);

  // useFocusTrap focuses the first focusable element; also select the text.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.target === inputRef.current && url.trim()) {
      e.stopPropagation();
      onApply(url.trim());
    }
  }

  return (
    <Modal
      ariaLabel={t("link_dialog.title")}
      onClose={onCancel}
      width={360}
      onKeyDown={handleDialogKeyDown}
    >
      <p className="modal-title">{t("link_dialog.title")}</p>

      <input
        ref={inputRef}
        className="modal-input"
        type="url"
        aria-label={t("link_dialog.url_label")}
        value={url}
        placeholder={t("link_dialog.url_placeholder")}
        onChange={(e) => setUrl(e.target.value)}
      />

      <ModalActions
        cancelLabel={t("link_dialog.cancel")}
        confirmLabel={t("link_dialog.apply")}
        onCancel={onCancel}
        onConfirm={() => url.trim() && onApply(url.trim())}
        confirmDisabled={!url.trim()}
        extraLeft={
          initialHref ? (
            <button type="button" className="modal-btn modal-btn-danger" onClick={onRemove}>
              {t("link_dialog.remove")}
            </button>
          ) : undefined
        }
      />
    </Modal>
  );
}
