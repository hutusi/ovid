import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "./gitActionError";
import type { GitBranch, GitRemoteBranch, GitRemoteInfo } from "./types";
import type { OverlayStack } from "./useOverlayStack";

export type BranchSwitcherState = {
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  remoteInfo: GitRemoteInfo;
} | null;

export type RenameBranchDialogState = { branch: string } | null;
export type DeleteBranchDialogState = { branch: string } | null;

interface LoadBranchSwitcherStateOptions {
  getBranches: () => Promise<GitBranch[]>;
  getRemoteBranches: () => Promise<GitRemoteBranch[]>;
  getRemoteInfo: () => Promise<GitRemoteInfo>;
}

export async function loadBranchSwitcherState({
  getBranches,
  getRemoteBranches,
  getRemoteInfo,
}: LoadBranchSwitcherStateOptions): Promise<BranchSwitcherState> {
  const [branches, remoteBranches, remote] = await Promise.all([
    getBranches(),
    getRemoteBranches(),
    getRemoteInfo(),
  ]);
  if (branches.length === 0) {
    return null;
  }
  return { branches, remoteBranches, remoteInfo: remote };
}

interface UseGitBranchActionsOptions {
  overlay: OverlayStack;
  workspaceRootPath: string | null;
  showToast: (message: string) => void;
  flushPendingSave: () => Promise<unknown>;
  openWorkspaceAtPath: (path: string) => Promise<void>;
  handleSwitchBranch: (branch: string) => Promise<void>;
  handleCreateBranch: (branch: string) => Promise<void>;
  handleCheckoutRemoteBranch: (remoteRef: string) => Promise<void>;
  handleRenameBranch: (oldBranch: string, newBranch: string) => Promise<void>;
  handleDeleteBranch: (branch: string) => Promise<void>;
  getBranches: () => Promise<GitBranch[]>;
  getRemoteBranches: () => Promise<GitRemoteBranch[]>;
  getRemoteInfo: () => Promise<GitRemoteInfo>;
}

/** Owns the branch switcher dialog and every branch-mutating action it
 *  launches (switch/create/checkout-remote/rename/delete) plus reloading
 *  the workspace tree afterward so Git-derived UI (status, branch title)
 *  reflects the change immediately. */
export function useGitBranchActions({
  overlay,
  workspaceRootPath,
  showToast,
  flushPendingSave,
  openWorkspaceAtPath,
  handleSwitchBranch,
  handleCreateBranch,
  handleCheckoutRemoteBranch,
  handleRenameBranch,
  handleDeleteBranch,
  getBranches,
  getRemoteBranches,
  getRemoteInfo,
}: UseGitBranchActionsOptions) {
  const { t } = useTranslation();

  const closeBranchSwitcher = useCallback(() => {
    // The overlay stack only holds one overlay at a time, so closing any
    // one of these three is sufficient — but be explicit so the intent
    // (close all branch-related dialogs) survives if the rule changes.
    overlay.close("branchSwitcher");
    overlay.close("renameBranch");
    overlay.close("deleteBranch");
  }, [overlay]);

  const loadBranchSwitcherData = useCallback(
    () => loadBranchSwitcherState({ getBranches, getRemoteBranches, getRemoteInfo }),
    [getBranches, getRemoteBranches, getRemoteInfo]
  );

  // Errors here must not propagate: switchBranch/createBranch/
  // checkoutRemoteBranch call this after their own git mutation has already
  // succeeded, inside the same try block as that mutation — an uncaught
  // reload failure would surface as e.g. "Switch failed: <reload error>"
  // even though the switch itself worked. openWorkspaceAtPath already shows
  // its own toast for the common failure modes; this only guards the rarer
  // case (e.g. flushPendingSave throwing before that function's own try).
  const reloadWorkspaceAfterGitChange = useCallback(async () => {
    if (!workspaceRootPath) return;
    try {
      await openWorkspaceAtPath(workspaceRootPath);
    } catch (err) {
      console.error("Failed to reload workspace after git change:", err);
    }
  }, [openWorkspaceAtPath, workspaceRootPath]);

  const openBranchSwitcher = useCallback(async () => {
    try {
      overlay.close("gitSyncPopover");
      const nextState = await loadBranchSwitcherData();
      if (!nextState) {
        showToast(t("errors.git_no_local_branches"));
        return;
      }
      overlay.open({ kind: "branchSwitcher", state: nextState });
    } catch {
      showToast(t("errors.git_load_branches_failed"));
    }
  }, [loadBranchSwitcherData, showToast, t, overlay]);

  // Reload branch data and (re)open the switcher. Used after rename/delete:
  // those dialogs *replaced* the switcher overlay (one overlay at a time), so
  // a refresh guarded on "switcher currently open" would always no-op — the
  // user launched from the switcher and should land back in it, refreshed.
  const reopenBranchSwitcher = useCallback(async () => {
    try {
      const nextState = await loadBranchSwitcherData();
      if (nextState) overlay.open({ kind: "branchSwitcher", state: nextState });
      else overlay.close("branchSwitcher");
    } catch {
      showToast(t("errors.git_refresh_branches_failed"));
    }
  }, [loadBranchSwitcherData, showToast, t, overlay]);

  const switchBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleSwitchBranch(branch);
        closeBranchSwitcher();
        overlay.close("newBranch");
        await reloadWorkspaceAfterGitChange();
        showToast(t("toast.git_switched_to", { branch }));
      } catch (err) {
        const message = getErrorMessage(err);
        showToast(t("errors.git_switch_branch_failed", { message }));
      }
    },
    [
      closeBranchSwitcher,
      flushPendingSave,
      handleSwitchBranch,
      reloadWorkspaceAfterGitChange,
      showToast,
      t,
      overlay,
    ]
  );

  const createBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleCreateBranch(branch);
        overlay.close("newBranch");
        closeBranchSwitcher();
        await reloadWorkspaceAfterGitChange();
        showToast(t("toast.git_created_and_switched_to", { branch }));
      } catch (err) {
        const message = getErrorMessage(err);
        showToast(t("errors.git_create_branch_failed", { message }));
      }
    },
    [
      closeBranchSwitcher,
      flushPendingSave,
      handleCreateBranch,
      reloadWorkspaceAfterGitChange,
      showToast,
      t,
      overlay,
    ]
  );

  const checkoutRemoteBranch = useCallback(
    async (remoteRef: string) => {
      const branchName = remoteRef.split("/").slice(1).join("/");
      try {
        await flushPendingSave();
        await handleCheckoutRemoteBranch(remoteRef);
        closeBranchSwitcher();
        overlay.close("newBranch");
        await reloadWorkspaceAfterGitChange();
        showToast(t("toast.git_checked_out", { ref: branchName || remoteRef }));
      } catch (err) {
        const message = getErrorMessage(err);
        showToast(t("errors.git_checkout_failed", { message }));
      }
    },
    [
      closeBranchSwitcher,
      flushPendingSave,
      handleCheckoutRemoteBranch,
      reloadWorkspaceAfterGitChange,
      showToast,
      t,
      overlay,
    ]
  );

  const renameBranch = useCallback(
    async (oldBranch: string, newBranch: string) => {
      try {
        await flushPendingSave();
        await handleRenameBranch(oldBranch, newBranch);
        overlay.close("renameBranch");
        await reopenBranchSwitcher();
        showToast(t("toast.git_renamed", { from: oldBranch, to: newBranch }));
      } catch (err) {
        const message = getErrorMessage(err);
        showToast(t("errors.git_rename_branch_failed", { message }));
      }
    },
    [flushPendingSave, handleRenameBranch, reopenBranchSwitcher, showToast, t, overlay]
  );

  const deleteBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleDeleteBranch(branch);
        overlay.close("deleteBranch");
        await reopenBranchSwitcher();
        showToast(t("toast.git_deleted", { branch }));
      } catch (err) {
        const message = getErrorMessage(err);
        showToast(t("errors.git_delete_branch_failed", { message }));
      }
    },
    [flushPendingSave, handleDeleteBranch, reopenBranchSwitcher, showToast, t, overlay]
  );

  return {
    openBranchSwitcher,
    closeBranchSwitcher,
    reopenBranchSwitcher,
    switchBranch,
    createBranch,
    checkoutRemoteBranch,
    renameBranch,
    deleteBranch,
  };
}
