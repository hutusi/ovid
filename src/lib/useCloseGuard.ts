import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

type FlushPendingSave = (opts?: { mode?: "blocking" | "background" }) => Promise<void>;

/**
 * Guard against losing the last edits when the app quits. The autosave debounce
 * (~750ms) plus the editor's serialize debounce mean the final keystrokes live
 * only in memory for a moment, and React unmount cleanup is not reliably run
 * when the WebView is torn down — so those edits can silently vanish.
 *
 * Two quit paths funnel into one `requestQuit`: the OS close request (window
 * close button) and the app's Quit menu item / Cmd+Q, which menu.rs routes to
 * the frontend as a `quit` app action instead of using the predefined
 * terminate item (which would bypass this guard entirely). `requestQuit`
 * blocks on a save, then destroys the window (destroy, not close, so it
 * doesn't re-emit close-requested and loop); destroying the last window exits
 * the app. If the save fails, the window stays open so the user can retry
 * rather than lose work. A window blur / tab-hide also triggers a best-effort
 * background flush — the only safety net for Dock "Quit" and system logout,
 * which macOS delivers as `terminate:` and tao gives no way to intercept.
 *
 * Requires `core:window:allow-destroy` in the Tauri capabilities.
 */
export function useCloseGuard(
  flushPendingSave: FlushPendingSave,
  showToast: (msg: string) => void
): () => Promise<void> {
  const { t } = useTranslation();
  // Keep the latest closures in refs so the window listener registers once and
  // never needs re-registering when flush/toast/t identities change.
  const flushRef = useRef(flushPendingSave);
  flushRef.current = flushPendingSave;
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  const tRef = useRef(t);
  tRef.current = t;
  // Guard against a second quit request (close button + Cmd+Q, or a repeated
  // Cmd+Q) arriving while the first flush is still in flight: a concurrent
  // blocking flush could hit a self-inflicted version conflict, and a second
  // destroy() could throw on the already-closing window.
  const closingRef = useRef(false);

  const requestQuit = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      await flushRef.current({ mode: "blocking" });
      await getCurrentWindow().destroy();
    } catch {
      // Save failed — allow a future quit attempt. flushPendingSave already
      // toasts the failure; add a distinct signal that the quit was cancelled
      // so the open window isn't a mystery.
      closingRef.current = false;
      toastRef.current(tRef.current("errors.close_save_failed"));
    }
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let mounted = true;
    let unlisten: (() => void) | undefined;

    void appWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await requestQuit();
      })
      .then((dispose) => {
        if (mounted) unlisten = dispose;
        else dispose();
      })
      .catch(() => {
        // If the close listener can't be registered, fall back to Tauri's
        // default close (worst case, the same unmount flush as before).
      });

    const backgroundFlush = () => {
      // background flushPendingSave handles its own save errors and resolves,
      // but guard the call site so nothing can escape as an unhandled rejection
      // (which would otherwise trip the global error handler on every blur).
      void flushRef.current({ mode: "background" }).catch(() => {});
    };
    const handleVisibility = () => {
      if (document.hidden) backgroundFlush();
    };
    window.addEventListener("blur", backgroundFlush);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      unlisten?.();
      window.removeEventListener("blur", backgroundFlush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [requestQuit]);

  return requestQuit;
}
