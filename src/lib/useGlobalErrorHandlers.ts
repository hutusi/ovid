import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/** Minimum gap between toasts for uncaught async failures, so a storm of
 *  rejections can't spam the toast stack. Every occurrence is still logged. */
const TOAST_THROTTLE_MS = 3000;

/**
 * Registers window-level handlers for otherwise-unhandled errors and promise
 * rejections. Many promises in the app are intentionally fire-and-forget
 * (`void refreshGitStatus()`, menu-check syncs, `void openByPath(...)`, …);
 * without this, a rejection there dies silently with no user feedback and no
 * log. We always log (dev pass-through) and surface a throttled generic toast
 * so the user knows something went wrong.
 */
export function useGlobalErrorHandlers(showToast: (msg: string) => void): void {
  const { t } = useTranslation();

  useEffect(() => {
    let lastToastAt = 0;
    const notify = () => {
      const now = Date.now();
      if (now - lastToastAt < TOAST_THROTTLE_MS) return;
      lastToastAt = now;
      showToast(t("errors.unexpected"));
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      console.error("[unhandledrejection]", event.reason);
      notify();
    };
    const onError = (event: ErrorEvent) => {
      // Resource-load failures (img/script) also fire `error` on window but
      // carry no `.error`; ignore those to avoid noise from e.g. broken images.
      if (!event.error) return;
      console.error("[window.onerror]", event.error);
      notify();
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, [showToast, t]);
}
