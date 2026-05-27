import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  getGitChangeSummary,
  getGitSyncLabel,
  getGitSyncPopoverState,
  getPushSuccessMessage,
} from "./gitUi";
import type {
  GitBranch,
  GitCommitChange,
  GitRemoteBranch,
  GitRemoteInfo,
  GitStatus,
} from "./types";
import type { OverlayStack } from "./useOverlayStack";

export type CommitDialogState = {
  message: string;
  branch: string;
  changes: GitCommitChange[];
} | null;

export type BranchSwitcherState = {
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  remoteInfo: GitRemoteInfo;
} | null;

export type RenameBranchDialogState = { branch: string } | null;
export type DeleteBranchDialogState = { branch: string } | null;

interface UseGitUiControllerOptions {
  overlay: OverlayStack;
  gitStatusMap: Map<string, GitStatus>;
  isGitRepo: boolean;
  remoteInfo: GitRemoteInfo;
  workspaceRootPath: string | null;
  parsedTitle?: string;
  selectedFileName?: string;
  showToast: (message: string) => void;
  flushPendingSave: () => Promise<unknown>;
  openWorkspaceAtPath: (path: string) => Promise<void>;
  handleCommit: (message: string, paths: string[], push: boolean) => Promise<void>;
  handlePush: (remoteName?: string) => Promise<void>;
  handlePull: () => Promise<void>;
  handleSwitchBranch: (branch: string) => Promise<void>;
  handleCreateBranch: (branch: string) => Promise<void>;
  handleCheckoutRemoteBranch: (remoteRef: string) => Promise<void>;
  handleRenameBranch: (oldBranch: string, newBranch: string) => Promise<void>;
  handleDeleteBranch: (branch: string) => Promise<void>;
  handleOpenRemote: (remoteName?: string) => Promise<void>;
  getCommitChanges: () => Promise<GitCommitChange[]>;
  getBranch: () => Promise<string>;
  getBranches: () => Promise<GitBranch[]>;
  getRemoteBranches: () => Promise<GitRemoteBranch[]>;
  getRemoteInfo: () => Promise<GitRemoteInfo>;
}

interface LoadBranchSwitcherStateOptions {
  getBranches: () => Promise<GitBranch[]>;
  getRemoteBranches: () => Promise<GitRemoteBranch[]>;
  getRemoteInfo: () => Promise<GitRemoteInfo>;
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatGitActionError(action: "push" | "pull" | "fetch", message: string): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  if (lower.startsWith("push ") || lower.startsWith("pull ") || lower.startsWith("fetch ")) {
    return normalized;
  }
  return `${action} failed: ${normalized}`;
}

export function formatCommitError(message: string): string {
  const normalized = message.trim();
  if (normalized.toLowerCase().startsWith("commit ")) {
    return normalized[0].toUpperCase() + normalized.slice(1);
  }
  return `Commit failed: ${normalized}`;
}

export function buildDefaultCommitMessage(parsedTitle?: string, selectedFileName?: string): string {
  return `Update: ${parsedTitle ?? selectedFileName ?? ""}`;
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

export function useGitUiController({
  overlay,
  gitStatusMap,
  isGitRepo,
  remoteInfo,
  workspaceRootPath,
  parsedTitle,
  selectedFileName,
  showToast,
  flushPendingSave,
  openWorkspaceAtPath,
  handleCommit,
  handlePush,
  handlePull,
  handleSwitchBranch,
  handleCreateBranch,
  handleCheckoutRemoteBranch,
  handleRenameBranch,
  handleDeleteBranch,
  handleOpenRemote,
  getCommitChanges,
  getBranch,
  getBranches,
  getRemoteBranches,
  getRemoteInfo,
}: UseGitUiControllerOptions) {
  // Visibility lives in the shared overlay stack so only one of these can
  // be active at a time. The dialog *data* (commit changes, branch lists,
  // target branch names) still lives in the overlay payload — the
  // controller just constructs and reads those payloads.
  const commitDialog: CommitDialogState =
    overlay.active?.kind === "commit" ? overlay.active.state : null;
  const branchSwitcher: BranchSwitcherState =
    overlay.active?.kind === "branchSwitcher" ? overlay.active.state : null;
  const newBranchDialogOpen = overlay.is("newBranch");
  const renameBranchDialog: RenameBranchDialogState =
    overlay.active?.kind === "renameBranch" ? overlay.active.state : null;
  const deleteBranchDialog: DeleteBranchDialogState =
    overlay.active?.kind === "deleteBranch" ? overlay.active.state : null;
  const gitSyncPopoverOpen = overlay.is("gitSyncPopover");

  const setCommitDialog = useCallback(
    (state: CommitDialogState) => {
      if (state === null) overlay.close("commit");
      else overlay.open({ kind: "commit", state });
    },
    [overlay]
  );
  const setBranchSwitcher = useCallback(
    (state: BranchSwitcherState) => {
      if (state === null) overlay.close("branchSwitcher");
      else overlay.open({ kind: "branchSwitcher", state });
    },
    [overlay]
  );
  const setNewBranchDialogOpen = useCallback(
    (open: boolean) => {
      if (open) overlay.open({ kind: "newBranch" });
      else overlay.close("newBranch");
    },
    [overlay]
  );
  const setRenameBranchDialog = useCallback(
    (state: RenameBranchDialogState) => {
      if (state === null) overlay.close("renameBranch");
      else overlay.open({ kind: "renameBranch", state });
    },
    [overlay]
  );
  const setDeleteBranchDialog = useCallback(
    (state: DeleteBranchDialogState) => {
      if (state === null) overlay.close("deleteBranch");
      else overlay.open({ kind: "deleteBranch", state });
    },
    [overlay]
  );
  const setGitSyncPopoverOpen = useCallback(
    (open: boolean) => {
      if (open) overlay.open({ kind: "gitSyncPopover" });
      else overlay.close("gitSyncPopover");
    },
    [overlay]
  );

  const { t } = useTranslation();

  const pushSuccessMessage = getPushSuccessMessage(remoteInfo, t);
  const gitChangeSummary = isGitRepo ? getGitChangeSummary(gitStatusMap, t) : null;
  const gitSyncLabel = isGitRepo ? getGitSyncLabel(remoteInfo) : null;
  const gitSyncPopover = isGitRepo ? getGitSyncPopoverState(remoteInfo, t) : null;

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

  const reloadWorkspaceAfterGitChange = useCallback(async () => {
    if (!workspaceRootPath) return;
    await openWorkspaceAtPath(workspaceRootPath);
  }, [openWorkspaceAtPath, workspaceRootPath]);

  const openCommitDialog = useCallback(
    async (message: string) => {
      try {
        const [branch, changes] = await Promise.all([getBranch(), getCommitChanges()]);
        if (changes.length === 0) {
          showToast("No git changes to commit");
          return;
        }
        setCommitDialog({ message, branch, changes });
      } catch {
        showToast("Failed to load git changes");
      }
    },
    [getBranch, getCommitChanges, showToast, setCommitDialog]
  );

  const runGitAction = useCallback(
    async (action: "push" | "pull" | "fetch", run: () => Promise<void>, successMessage: string) => {
      try {
        await flushPendingSave();
        await run();
        showToast(successMessage);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(formatGitActionError(action, message));
      }
    },
    [flushPendingSave, showToast]
  );

  const openBranchSwitcher = useCallback(async () => {
    try {
      setGitSyncPopoverOpen(false);
      const nextState = await loadBranchSwitcherData();
      if (!nextState) {
        showToast("No local branches found");
        return;
      }
      setBranchSwitcher(nextState);
    } catch {
      showToast("Failed to load branches");
    }
  }, [loadBranchSwitcherData, showToast, setBranchSwitcher, setGitSyncPopoverOpen]);

  const refreshBranchSwitcher = useCallback(async () => {
    if (!branchSwitcher) return;
    try {
      const nextState = await loadBranchSwitcherData();
      setBranchSwitcher(nextState);
    } catch {
      showToast("Failed to refresh branches");
    }
  }, [branchSwitcher, loadBranchSwitcherData, showToast, setBranchSwitcher]);

  const copyRemoteUrl = useCallback(
    async (remoteName?: string) => {
      const targetRemote =
        remoteName != null
          ? (remoteInfo.remotes.find((remote) => remote.name === remoteName) ?? null)
          : null;
      const remoteUrl = remoteName != null ? (targetRemote?.url ?? null) : remoteInfo.remoteUrl;
      if (!remoteUrl) {
        showToast(
          remoteName ? `No remote URL configured for ${remoteName}` : "No remote URL configured"
        );
        return;
      }
      try {
        await navigator.clipboard.writeText(remoteUrl);
        showToast("Copied remote URL");
      } catch {
        showToast("Failed to copy remote URL");
      }
    },
    [remoteInfo.remoteUrl, remoteInfo.remotes, showToast]
  );

  const openRemote = useCallback(
    async (remoteName?: string) => {
      try {
        await handleOpenRemote(remoteName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Open remote failed: ${message}`);
      }
    },
    [handleOpenRemote, showToast]
  );

  const switchBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleSwitchBranch(branch);
        closeBranchSwitcher();
        setNewBranchDialogOpen(false);
        await reloadWorkspaceAfterGitChange();
        showToast(`Switched to ${branch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Switch branch failed: ${message}`);
      }
    },
    [
      closeBranchSwitcher,
      flushPendingSave,
      handleSwitchBranch,
      reloadWorkspaceAfterGitChange,
      showToast,
      setNewBranchDialogOpen,
    ]
  );

  const createBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleCreateBranch(branch);
        setNewBranchDialogOpen(false);
        closeBranchSwitcher();
        await reloadWorkspaceAfterGitChange();
        showToast(`Created and switched to ${branch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Create branch failed: ${message}`);
      }
    },
    [
      closeBranchSwitcher,
      flushPendingSave,
      handleCreateBranch,
      reloadWorkspaceAfterGitChange,
      showToast,
      setNewBranchDialogOpen,
    ]
  );

  const checkoutRemoteBranch = useCallback(
    async (remoteRef: string) => {
      const branchName = remoteRef.split("/").slice(1).join("/");
      try {
        await flushPendingSave();
        await handleCheckoutRemoteBranch(remoteRef);
        closeBranchSwitcher();
        setNewBranchDialogOpen(false);
        await reloadWorkspaceAfterGitChange();
        showToast(`Checked out ${branchName || remoteRef}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Checkout branch failed: ${message}`);
      }
    },
    [
      closeBranchSwitcher,
      flushPendingSave,
      handleCheckoutRemoteBranch,
      reloadWorkspaceAfterGitChange,
      showToast,
      setNewBranchDialogOpen,
    ]
  );

  const renameBranch = useCallback(
    async (oldBranch: string, newBranch: string) => {
      try {
        await flushPendingSave();
        await handleRenameBranch(oldBranch, newBranch);
        setRenameBranchDialog(null);
        await refreshBranchSwitcher();
        showToast(`Renamed ${oldBranch} to ${newBranch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Rename branch failed: ${message}`);
      }
    },
    [flushPendingSave, handleRenameBranch, refreshBranchSwitcher, showToast, setRenameBranchDialog]
  );

  const deleteBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleDeleteBranch(branch);
        setDeleteBranchDialog(null);
        await refreshBranchSwitcher();
        showToast(`Deleted ${branch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Delete branch failed: ${message}`);
      }
    },
    [flushPendingSave, handleDeleteBranch, refreshBranchSwitcher, showToast, setDeleteBranchDialog]
  );

  const handleGitSyncAction = useCallback(async () => {
    if (!gitSyncPopover?.actionKind) return;
    setGitSyncPopoverOpen(false);
    if (gitSyncPopover.actionKind === "pull") {
      await runGitAction("pull", () => handlePull(), "Pulled latest changes");
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
  }, [gitSyncPopover, handlePull, handlePush, remoteInfo, runGitAction, t, setGitSyncPopoverOpen]);

  const defaultCommitMessage = useMemo(() => {
    return buildDefaultCommitMessage(parsedTitle, selectedFileName);
  }, [parsedTitle, selectedFileName]);

  const handleCommitDialogCommit = useCallback(
    async (message: string, selectedPaths: string[], push: boolean) => {
      try {
        await flushPendingSave();
        await handleCommit(message, selectedPaths, push);
        setCommitDialog(null);
      } catch (err) {
        showToast(formatCommitError(getErrorMessage(err)));
      }
    },
    [flushPendingSave, handleCommit, showToast, setCommitDialog]
  );

  return {
    commitDialog,
    branchSwitcher,
    newBranchDialogOpen,
    renameBranchDialog,
    deleteBranchDialog,
    gitSyncPopoverOpen,
    gitChangeSummary,
    gitSyncLabel,
    gitSyncPopover,
    pushSuccessMessage,
    defaultCommitMessage,
    openCommitDialog,
    setCommitDialog,
    handleCommitDialogCommit,
    runGitAction,
    openBranchSwitcher,
    closeBranchSwitcher,
    refreshBranchSwitcher,
    switchBranch,
    createBranch,
    checkoutRemoteBranch,
    renameBranch,
    deleteBranch,
    openRemote,
    copyRemoteUrl,
    handleGitSyncAction,
    setNewBranchDialogOpen,
    setRenameBranchDialog,
    setDeleteBranchDialog,
    setGitSyncPopoverOpen,
  };
}
