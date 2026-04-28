import { useTranslation } from "react-i18next";
import type { RecentWorkspace } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./WorkspaceSwitcher.css";

interface WorkspaceSwitcherProps {
  recentWorkspaces: RecentWorkspace[];
  currentRootPath: string | null;
  onSelect: (rootPath: string) => void;
  onOpenOther: () => void;
  onClose: () => void;
}

export function WorkspaceSwitcher({
  recentWorkspaces,
  currentRootPath,
  onSelect,
  onOpenOther,
  onClose,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("workspace_switcher.title")}
        className="modal-panel"
        style={{ width: 380, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("workspace_switcher.title")}</p>

        <div className="ws-list">
          {recentWorkspaces.map((w) => (
            <button
              key={w.rootPath}
              type="button"
              className={`ws-item${w.rootPath === currentRootPath ? " ws-item--active" : ""}`}
              onClick={() => {
                if (w.rootPath !== currentRootPath) onSelect(w.rootPath);
                onClose();
              }}
            >
              <span className="ws-item-name">{w.name}</span>
              <span className="ws-item-path">{w.rootPath}</span>
              {w.rootPath === currentRootPath && (
                <span className="ws-item-badge">{t("workspace_switcher.current")}</span>
              )}
            </button>
          ))}
          {recentWorkspaces.length === 0 && (
            <p className="ws-empty">{t("workspace_switcher.no_recent")}</p>
          )}
        </div>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
            {t("workspace_switcher.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={() => {
              onOpenOther();
              onClose();
            }}
          >
            {t("workspace_switcher.open_folder")}
          </button>
        </div>
      </div>
    </div>
  );
}
