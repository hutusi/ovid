import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { parseAuthRequired } from "./commands/git";
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

type GitAction = "push" | "pull" | "fetch";

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

// State for the credentials dialog opened on AUTH_REQUIRED. `host` keys the
// stored credential, `remoteName` is what the user sees in the subtitle.
// `operation` drives the title copy and the retry-on-submit command. The
// remaining flags survive across retries within the same dialog session.
export type GitCredentialsDialogState = {
  host: string;
  remoteName: string;
  operation: "push" | "pull" | "fetch";
  hasStoredCredentials: boolean;
  authErrored: boolean;
  initialUsername?: string;
} | null;

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
  handlePushWithCredentials: (args: {
    remoteName?: string;
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  handlePullWithCredentials: (args: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  handleFetchWithCredentials: (args: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  handleForgetCredentials: (host: string) => Promise<void>;
  hasCredentialsForHost: (host: string) => Promise<boolean>;
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

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatGitActionError(
  action: "push" | "pull" | "fetch",
  message: string,
  t: Translate
): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  if (lower.startsWith("push ") || lower.startsWith("pull ") || lower.startsWith("fetch ")) {
    return normalized;
  }
  return t(`errors.git_${action}_failed`, { message: normalized });
}

export function formatCommitError(message: string, t: Translate): string {
  const normalized = message.trim();
  if (normalized.toLowerCase().startsWith("commit ")) {
    return normalized[0].toUpperCase() + normalized.slice(1);
  }
  return t("errors.git_commit_failed", { message: normalized });
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
  handlePushWithCredentials,
  handlePullWithCredentials,
  handleFetchWithCredentials,
  handleForgetCredentials,
  hasCredentialsForHost,
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
          showToast(t("errors.git_no_changes"));
          return;
        }
        setCommitDialog({ message, branch, changes });
      } catch {
        showToast(t("errors.git_load_changes_failed"));
      }
    },
    [getBranch, getCommitChanges, showToast, t, setCommitDialog]
  );

  // Pending context for a runGitAction call that hit AUTH_REQUIRED — used
  // by the credentials dialog submit handler to replay the success toast
  // and remoteName once the user supplies credentials. A ref (rather than
  // state) because nothing renders off of it.
  const pendingAuthRetryRef = useRef<{
    action: GitAction;
    successMessage: string;
    remoteName: string;
  } | null>(null);

  const openGitCredentialsDialog = useCallback(
    async (
      action: GitAction,
      successMessage: string,
      message: string,
      initialUsername?: string,
      authErrored: boolean = false
    ): Promise<boolean> => {
      const parsed = parseAuthRequired(message);
      if (!parsed) return false;
      pendingAuthRetryRef.current = {
        action,
        successMessage,
        remoteName: parsed.remoteName,
      };
      // The forget link is shown only when a credential is already stored
      // for the host — that's the "wrong PAT, let me reset" path. We
      // probe the store via a small query command rather than waiting for
      // the second failure to flag it.
      //
      // A probe failure (e.g. a malformed credentials file) must not abort
      // the recovery path — letting the rejection bubble out of this
      // function would propagate up through runGitAction's catch arm and
      // leave the user with neither the dialog nor an error toast. Fall
      // back to "no stored credentials" so the dialog still opens; the
      // forget link just won't appear.
      let hasStoredCredentials = false;
      if (parsed.host) {
        try {
          hasStoredCredentials = await hasCredentialsForHost(parsed.host);
        } catch {
          hasStoredCredentials = false;
        }
      }
      overlay.open({
        kind: "gitCredentials",
        state: {
          host: parsed.host,
          remoteName: parsed.remoteName,
          operation: action,
          hasStoredCredentials,
          authErrored,
          initialUsername,
        },
      });
      return true;
    },
    [hasCredentialsForHost, overlay]
  );

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

  const openBranchSwitcher = useCallback(async () => {
    try {
      setGitSyncPopoverOpen(false);
      const nextState = await loadBranchSwitcherData();
      if (!nextState) {
        showToast(t("errors.git_no_local_branches"));
        return;
      }
      setBranchSwitcher(nextState);
    } catch {
      showToast(t("errors.git_load_branches_failed"));
    }
  }, [loadBranchSwitcherData, showToast, t, setBranchSwitcher, setGitSyncPopoverOpen]);

  const refreshBranchSwitcher = useCallback(async () => {
    if (!branchSwitcher) return;
    try {
      const nextState = await loadBranchSwitcherData();
      setBranchSwitcher(nextState);
    } catch {
      showToast(t("errors.git_refresh_branches_failed"));
    }
  }, [branchSwitcher, loadBranchSwitcherData, showToast, t, setBranchSwitcher]);

  const copyRemoteUrl = useCallback(
    async (remoteName?: string) => {
      const targetRemote =
        remoteName != null
          ? (remoteInfo.remotes.find((remote) => remote.name === remoteName) ?? null)
          : null;
      const remoteUrl = remoteName != null ? (targetRemote?.url ?? null) : remoteInfo.remoteUrl;
      if (!remoteUrl) {
        showToast(
          remoteName
            ? t("errors.git_no_remote_url_for", { remote: remoteName })
            : t("errors.git_no_remote_url")
        );
        return;
      }
      try {
        await navigator.clipboard.writeText(remoteUrl);
        showToast(t("toast.copied_remote_url"));
      } catch {
        showToast(t("errors.git_copy_remote_failed"));
      }
    },
    [remoteInfo.remoteUrl, remoteInfo.remotes, showToast, t]
  );

  const openRemote = useCallback(
    async (remoteName?: string) => {
      try {
        await handleOpenRemote(remoteName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(t("errors.git_open_remote_failed", { message }));
      }
    },
    [handleOpenRemote, showToast, t]
  );

  const switchBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleSwitchBranch(branch);
        closeBranchSwitcher();
        setNewBranchDialogOpen(false);
        await reloadWorkspaceAfterGitChange();
        showToast(t("toast.git_switched_to", { branch }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
        showToast(t("toast.git_created_and_switched_to", { branch }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
        showToast(t("toast.git_checked_out", { ref: branchName || remoteRef }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
        showToast(t("toast.git_renamed", { from: oldBranch, to: newBranch }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(t("errors.git_rename_branch_failed", { message }));
      }
    },
    [
      flushPendingSave,
      handleRenameBranch,
      refreshBranchSwitcher,
      showToast,
      t,
      setRenameBranchDialog,
    ]
  );

  const deleteBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleDeleteBranch(branch);
        setDeleteBranchDialog(null);
        await refreshBranchSwitcher();
        showToast(t("toast.git_deleted", { branch }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(t("errors.git_delete_branch_failed", { message }));
      }
    },
    [
      flushPendingSave,
      handleDeleteBranch,
      refreshBranchSwitcher,
      showToast,
      t,
      setDeleteBranchDialog,
    ]
  );

  const handleGitSyncAction = useCallback(async () => {
    if (!gitSyncPopover?.actionKind) return;
    setGitSyncPopoverOpen(false);
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
        const errMessage = getErrorMessage(err);
        // If the commit succeeded but the push leg hit AUTH_REQUIRED, the
        // Rust side passes the marker through unwrapped. Close the commit
        // dialog (commit is done) and open the credentials dialog so the
        // user can retry just the push. handleGitCredentialsSubmit then
        // dispatches to handlePushWithCredentials.
        const opened = await openGitCredentialsDialog("push", pushSuccessMessage, errMessage);
        if (opened) {
          setCommitDialog(null);
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
      setCommitDialog,
    ]
  );

  // Submit handler for the credentials dialog. Dispatches to the matching
  // *WithCredentials command for the operation. On success: close the
  // dialog and replay the original success toast (carried over via
  // pendingAuthRetryRef). On another AUTH_REQUIRED (wrong PAT): keep the
  // dialog open and flip authErrored so the inline error renders. On
  // unrelated errors: close the dialog and fall through to the usual
  // error toast formatting.
  const handleGitCredentialsSubmit = useCallback(
    async (args: {
      operation: GitAction;
      remoteName: string;
      username: string;
      password: string;
      remember: boolean;
    }) => {
      const pending = pendingAuthRetryRef.current;
      try {
        if (args.operation === "push") {
          await handlePushWithCredentials({
            remoteName: args.remoteName || undefined,
            username: args.username,
            password: args.password,
            remember: args.remember,
          });
        } else if (args.operation === "pull") {
          await handlePullWithCredentials({
            username: args.username,
            password: args.password,
            remember: args.remember,
          });
        } else {
          await handleFetchWithCredentials({
            username: args.username,
            password: args.password,
            remember: args.remember,
          });
        }
        overlay.close("gitCredentials");
        pendingAuthRetryRef.current = null;
        showToast(pending?.successMessage ?? t(`toast.git_${args.operation}ed`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const reopened = await openGitCredentialsDialog(
          args.operation,
          pending?.successMessage ?? t(`toast.git_${args.operation}ed`),
          message,
          args.username,
          true
        );
        if (reopened) return;
        overlay.close("gitCredentials");
        pendingAuthRetryRef.current = null;
        showToast(formatGitActionError(args.operation, message, t));
      }
    },
    [
      handlePushWithCredentials,
      handlePullWithCredentials,
      handleFetchWithCredentials,
      openGitCredentialsDialog,
      overlay,
      showToast,
      t,
    ]
  );

  // Forget handler — wired to the "Forget saved credentials for {host}" link
  // shown inside the dialog when a credential is already stored. Removes
  // the entry, then refreshes the dialog state so the link disappears and
  // the user can type fresh credentials. We don't close the dialog: the
  // user still wants to authenticate.
  const handleForgetGitCredentials = useCallback(
    async (host: string) => {
      try {
        await handleForgetCredentials(host);
        const active = overlay.active;
        if (active?.kind === "gitCredentials") {
          overlay.open({
            kind: "gitCredentials",
            state: {
              ...active.state,
              hasStoredCredentials: false,
            },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(message);
      }
    },
    [handleForgetCredentials, overlay, showToast]
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
    handleGitCredentialsSubmit,
    handleForgetGitCredentials,
  };
}
