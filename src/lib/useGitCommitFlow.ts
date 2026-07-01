import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type GitAction, getErrorMessage } from "./gitActionError";
import type { GitCommitChange } from "./types";
import type { OverlayStack } from "./useOverlayStack";

export type CommitDialogState = {
  message: string;
  branch: string;
  changes: GitCommitChange[];
} | null;

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export function formatCommitError(message: string, t: Translate): string {
  const normalized = message.trim();
  if (normalized.toLowerCase().startsWith("commit ")) {
    return normalized[0].toUpperCase() + normalized.slice(1);
  }
  return t("errors.git_commit_failed", { message: normalized });
}

export function buildDefaultCommitMessage(parsedTitle?: string, selectedFileName?: string) {
  return `Update: ${parsedTitle ?? selectedFileName ?? ""}`;
}

interface UseGitCommitFlowOptions {
  overlay: OverlayStack;
  parsedTitle?: string;
  selectedFileName?: string;
  showToast: (message: string) => void;
  flushPendingSave: () => Promise<unknown>;
  handleCommit: (message: string, paths: string[], push: boolean) => Promise<void>;
  getCommitChanges: () => Promise<GitCommitChange[]>;
  getBranch: () => Promise<string>;
  pushSuccessMessage: string;
  openGitCredentialsDialog: (
    action: GitAction,
    successMessage: string,
    message: string,
    initialUsername?: string,
    authErrored?: boolean
  ) => Promise<boolean>;
}

/** Owns the commit dialog: opening it with the current branch + staged/
 *  unstaged changes, and submitting it. A commit-then-push can hit
 *  AUTH_REQUIRED on the push leg after the commit itself already
 *  succeeded — that's handled via the injected `openGitCredentialsDialog`
 *  rather than duplicating the retry flow here. */
export function useGitCommitFlow({
  overlay,
  parsedTitle,
  selectedFileName,
  showToast,
  flushPendingSave,
  handleCommit,
  getCommitChanges,
  getBranch,
  pushSuccessMessage,
  openGitCredentialsDialog,
}: UseGitCommitFlowOptions) {
  const { t } = useTranslation();

  const openCommitDialog = useCallback(
    async (message: string) => {
      try {
        const [branch, changes] = await Promise.all([getBranch(), getCommitChanges()]);
        if (changes.length === 0) {
          showToast(t("errors.git_no_changes"));
          return;
        }
        overlay.open({ kind: "commit", state: { message, branch, changes } });
      } catch {
        showToast(t("errors.git_load_changes_failed"));
      }
    },
    [getBranch, getCommitChanges, showToast, t, overlay]
  );

  const defaultCommitMessage = useMemo(() => {
    return buildDefaultCommitMessage(parsedTitle, selectedFileName);
  }, [parsedTitle, selectedFileName]);

  const handleCommitDialogCommit = useCallback(
    async (message: string, selectedPaths: string[], push: boolean) => {
      try {
        await flushPendingSave();
        await handleCommit(message, selectedPaths, push);
        overlay.close("commit");
      } catch (err) {
        const errMessage = getErrorMessage(err);
        // If the commit succeeded but the push leg hit AUTH_REQUIRED, the
        // Rust side passes the marker through unwrapped. Close the commit
        // dialog (commit is done) and open the credentials dialog so the
        // user can retry just the push. handleGitCredentialsSubmit then
        // dispatches to handlePushWithCredentials.
        const opened = await openGitCredentialsDialog("push", pushSuccessMessage, errMessage);
        if (opened) {
          // Opening the credentials overlay already replaced the commit
          // dialog (one overlay at a time) — this close documents intent.
          overlay.close("commit");
          return;
        }
        showToast(formatCommitError(errMessage, t));
      }
    },
    [
      flushPendingSave,
      handleCommit,
      openGitCredentialsDialog,
      pushSuccessMessage,
      showToast,
      t,
      overlay,
    ]
  );

  return {
    defaultCommitMessage,
    openCommitDialog,
    handleCommitDialogCommit,
  };
}
