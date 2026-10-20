import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import { AUTO_FETCH_COOLDOWN_MS, runAutoFetchOnFocus } from "./gitAutoFetch";

interface UseGitFocusFetchOptions {
  workspaceRoot: string | null;
  isGitRepo: boolean;
  handleFetch: () => Promise<void>;
}

/** Trigger a background git fetch whenever the app window regains focus. */
export function useGitFocusFetch({
  workspaceRoot,
  isGitRepo,
  handleFetch,
}: UseGitFocusFetchOptions): void {
  const lastAutoFetchAtRef = useRef(0);
  const autoFetchInFlightRef = useRef(false);
  // Read through a ref so a new handleFetch identity doesn't re-register the
  // window focus listener (an IPC round-trip each time).
  const handleFetchRef = useRef(handleFetch);
  handleFetchRef.current = handleFetch;

  useEffect(() => {
    if (!workspaceRoot || !isGitRepo) return;

    let mounted = true;
    let unlisten: (() => void) | undefined;

    async function maybeFetchRemoteStatus() {
      if (autoFetchInFlightRef.current) return;
      autoFetchInFlightRef.current = true;
      const now = Date.now();
      try {
        lastAutoFetchAtRef.current = await runAutoFetchOnFocus(
          {
            focused: true,
            now,
            lastFetchedAt: lastAutoFetchAtRef.current,
            cooldownMs: AUTO_FETCH_COOLDOWN_MS,
          },
          () => handleFetchRef.current()
        );
      } finally {
        autoFetchInFlightRef.current = false;
      }
    }

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!mounted || !focused) return;
        void maybeFetchRemoteStatus();
      })
      .then((dispose) => {
        // The effect may already have been cleaned up while registration was
        // pending; dispose right away instead of leaking the listener.
        if (mounted) unlisten = dispose;
        else dispose();
      })
      .catch(() => {
        // If focus listeners are unavailable, Git status still updates via manual actions.
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [workspaceRoot, isGitRepo]);
}
