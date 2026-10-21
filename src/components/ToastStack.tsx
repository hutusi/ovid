import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Toast } from "../lib/useToast";

interface ToastStackProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}

/** The toast stack above the status bar.
 *
 *  The live region is always mounted: a region that appears together with its
 *  first message is often not announced at all. Errors are `role="alert"`
 *  (assertive) and the rest `role="status"`. Hovering or focusing a toast
 *  holds it on screen; errors can be dismissed. */
export function ToastStack({ toasts, onDismiss, onPause, onResume }: ToastStackProps) {
  const { t } = useTranslation();
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => {
        const dismissible = toast.kind === "error";
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only pauses the auto-dismiss timer; dismissing is a real button
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={`toast toast--${toast.kind}${toast.leaving ? " is-leaving" : ""}`}
            onMouseEnter={() => onPause(toast.id)}
            onMouseLeave={() => onResume(toast.id)}
            onFocus={() => onPause(toast.id)}
            onBlur={() => onResume(toast.id)}
          >
            <span className="toast-message">{toast.message}</span>
            {dismissible && (
              <button
                type="button"
                className="toast-dismiss"
                aria-label={t("common.dismiss")}
                title={t("common.dismiss")}
                onClick={() => onDismiss(toast.id)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
