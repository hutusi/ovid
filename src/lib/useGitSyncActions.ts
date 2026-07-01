import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatGitActionError, type GitAction } from "./gitActionError";
import {
  getGitChangeSummary,
  getGitSyncLabel,
  getGitSyncPopoverState,
  getPushSuccessMessage,
} from "./gitUi";
import type { GitRemoteInfo, GitStatus } from "./types";
import type { OverlayStack } from "./useOverlayStack";

interface UseGitSyncActionsOptions {
  overlay: OverlayStack;
  gitStatusMap: Map<string, GitStatus>;
  isGitRepo: boolean;
  remoteInfo: GitRemoteInfo;
  showToast: (message: string) => void;
  flushPendingSave: () => Promise<unknown>;
  handlePush: (remoteName?: string) => Promise<void>;
  handlePull: () => Promise<void>;
  openGitCredentialsDialog: (
    action: GitAction,
    successMessage: string,
    message: string,
    initialUsername?: string,
    authErrored?: boolean
  ) => Promise<boolean>;
}

/** Owns the status-bar sync summary/popover display and the push/pull
 *  dispatch that opens the credentials dialog (via the injected
 *  `openGitCredentialsDialog`) on AUTH_REQUIRED instead of erroring out. */
export function useGitSyncActions({
  overlay,
  gitStatusMap,
  isGitRepo,
  remoteInfo,
  showToast,
  flushPendingSave,
  handlePush,
  handlePull,
  openGitCredentialsDialog,
}: UseGitSyncActionsOptions) {
  const { t } = useTranslation();

  const toggleGitSyncPopover = useCallback(() => {
    if (overlay.is("gitSyncPopover")) overlay.close("gitSyncPopover");
    else overlay.open({ kind: "gitSyncPopover" });
  }, [overlay]);

  const closeGitSyncPopover = useCallback(() => {
    overlay.close("gitSyncPopover");
  }, [overlay]);

  const pushSuccessMessage = getPushSuccessMessage(remoteInfo, t);
  const gitChangeSummary = isGitRepo ? getGitChangeSummary(gitStatusMap, t) : null;
  const gitSyncLabel = isGitRepo ? getGitSyncLabel(remoteInfo) : null;
  const gitSyncPopover = isGitRepo ? getGitSyncPopoverState(remoteInfo, t) : null;

  const runGitAction = useCallback(
    async (action: GitAction, run: () => Promise<void>, successMessage: string) => {
      try {
        await flushPendingSave();
        await run();
        showToast(successMessage);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (await openGitCredentialsDialog(action, successMessage, message)) return;
        showToast(formatGitActionError(action, message, t));
      }
    },
    [flushPendingSave, openGitCredentialsDialog, showToast, t]
  );

  const handleGitSyncAction = useCallback(async () => {
    if (!gitSyncPopover?.actionKind) return;
    overlay.close("gitSyncPopover");
    if (gitSyncPopover.actionKind === "pull") {
      await runGitAction("pull", () => handlePull(), t("toast.git_pulled"));
      return;
    }
    await runGitAction(
      "push",
      () =>
        gitSyncPopover.actionKind === "push-track" && remoteInfo.remoteName
          ? handlePush(remoteInfo.remoteName)
          : handlePush(),
      getPushSuccessMessage(remoteInfo, t)
    );
  }, [gitSyncPopover, handlePull, handlePush, remoteInfo, runGitAction, t, overlay]);

  return {
    gitChangeSummary,
    gitSyncLabel,
    gitSyncPopover,
    pushSuccessMessage,
    runGitAction,
    handleGitSyncAction,
    toggleGitSyncPopover,
    closeGitSyncPopover,
  };
}
