import { useEffect, useRef } from "react";
import type { SaveStatus } from "./types";

const SAVE_GIT_REFRESH_DELAY_MS = 400;

interface UseGitRefreshOnSaveOptions {
  saveStatus: SaveStatus;
  isGitRepo: boolean;
  refreshGitStatus: () => void;
}

/** Debounce a git status refresh whenever a save settles into "saved" (from
 *  "unsaved" or the intermediate "saving" state). */
export function useGitRefreshOnSave({
  saveStatus,
  isGitRepo,
  refreshGitStatus,
}: UseGitRefreshOnSaveOptions): void {
  const previousSaveStatusRef = useRef<SaveStatus>("saved");
  const saveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previousSaveStatus = previousSaveStatusRef.current;
    previousSaveStatusRef.current = saveStatus;

    if (!isGitRepo || saveStatus !== "saved" || previousSaveStatus === "saved") return;

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
