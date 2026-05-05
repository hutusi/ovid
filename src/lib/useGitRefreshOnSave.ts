import { useEffect, useRef } from "react";

const SAVE_GIT_REFRESH_DELAY_MS = 400;

interface UseGitRefreshOnSaveOptions {
  saveStatus: "saved" | "unsaved";
  isGitRepo: boolean;
  refreshGitStatus: () => void;
}

/** Debounce a git status refresh whenever a save transitions from unsaved → saved. */
export function useGitRefreshOnSave({
  saveStatus,
  isGitRepo,
  refreshGitStatus,
}: UseGitRefreshOnSaveOptions): void {
  const previousSaveStatusRef = useRef<"saved" | "unsaved">("saved");
  const saveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previousSaveStatus = previousSaveStatusRef.current;
    previousSaveStatusRef.current = saveStatus;

    if (!isGitRepo || saveStatus !== "saved" || previousSaveStatus !== "unsaved") return;

    if (saveRefreshTimerRef.current) clearTimeout(saveRefreshTimerRef.current);
    saveRefreshTimerRef.current = setTimeout(() => {
      saveRefreshTimerRef.current = null;
      void refreshGitStatus();
    }, SAVE_GIT_REFRESH_DELAY_MS);

    return () => {
      if (saveRefreshTimerRef.current) {
        clearTimeout(saveRefreshTimerRef.current);
        saveRefreshTimerRef.current = null;
      }
    };
  }, [saveStatus, isGitRepo, refreshGitStatus]);
}
