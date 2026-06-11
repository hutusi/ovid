import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

// The one place that owns the modal shell every dialog used to copy-paste:
// overlay + backdrop + focus-trapped panel, dialog ARIA, dialog-level Escape.
// No portals — Tauri's WebView breaks CSS variable chains outside the app's
// CSS tree (see ADR 0017 / CLAUDE.md "Dialogs and Popovers").
interface ModalProps {
  /** Accessible name for the dialog (role="dialog" aria-label). */
  ariaLabel: string;
  /** Called on Escape and backdrop click. */
  onClose: () => void;
  children: ReactNode;
  /** Fixed panel width; max-width stays viewport-bounded. */
  width?: number;
  /** Extra class on the panel ("modal-panel gitcred-panel"), or the full
   * panel class when `bare` is set. */
  panelClassName?: string;
  /** Skip the .modal-panel base class — for palette-style dialogs that
   * bring their own panel styling (FileSwitcher's fs-panel). */
  bare?: boolean;
  placement?: "center" | "top";
  /** Runs before the Escape handler — Enter-submit and list navigation
   * stay in the dialog. Call e.preventDefault() to intercept Escape. */
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function Modal({
  ariaLabel,
  onClose,
  children,
  width,
  panelClassName,
  bare = false,
  placement = "center",
  onKeyDown,
}: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();

  function handleKeyDown(e: React.KeyboardEvent) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      // Stop here so a closing dialog can't also exit zen mode or reach
      // editor-level Escape handlers.
      e.stopPropagation();
      onClose();
    }
  }

  const overlayClass = placement === "top" ? "modal-overlay modal-overlay--top" : "modal-overlay";
  const panelClass = bare
    ? (panelClassName ?? "modal-panel")
    : panelClassName
      ? `modal-panel ${panelClassName}`
      : "modal-panel";

  return (
    <div className={overlayClass} role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={panelClass}
        style={width !== undefined ? { width, maxWidth: "calc(100vw - 48px)" } : undefined}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

// The shared Cancel/Confirm footer. `extraLeft` renders before the spacer
// (LinkDialog's "Remove link" lives there).
interface ModalActionsProps {
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  extraLeft?: ReactNode;
}

export function ModalActions({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled = false,
  extraLeft,
}: ModalActionsProps) {
  return (
    <div className="modal-actions">
      {extraLeft}
      <div className="modal-spacer" />
      <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button
        type="button"
        className="modal-btn modal-btn-primary"
        disabled={confirmDisabled}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
