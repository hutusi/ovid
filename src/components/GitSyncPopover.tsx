import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitSyncPopoverState } from "../lib/gitUi";
import { Modal } from "./Modal";

interface GitSyncPopoverProps {
  state: GitSyncPopoverState;
  onClose: () => void;
  onAction?: () => void;
}

export function GitSyncPopover({ state, onClose, onAction }: GitSyncPopoverProps) {
  const { t } = useTranslation();

  return (
    <Modal
      ariaLabel={t("git_sync_popover.title")}
      onClose={onClose}
      panelClassName="git-sync-popover-panel"
    >
      <div className="git-sync-popover-header">
        <p className="modal-title">{t("git_sync_popover.sync_status")}</p>
        <button
          type="button"
          className="git-sync-popover-close"
          onClick={onClose}
          aria-label={t("git_sync_popover.close_label")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="modal-branch-row git-sync-popover-status-row">
        <span className="modal-branch-label">{t("git_sync_popover.state")}</span>
        <span className="modal-badge">{state.title}</span>
      </div>
      <div className="modal-branch-row git-sync-popover-tracking-row">
        <span className="modal-branch-label">{t("git_sync_popover.tracking")}</span>
        <span className="modal-selection-count">{state.tracking}</span>
      </div>
      <p className="git-sync-popover-description">{state.description}</p>
      <div className="modal-actions git-sync-popover-actions">
        <div className="modal-spacer" />
        <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
          {t("git_sync_popover.close")}
        </button>
        {state.actionLabel && onAction && (
          <button type="button" className="modal-btn modal-btn-primary" onClick={onAction}>
            {state.actionLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}
