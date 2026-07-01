import type {
  GitBranch,
  GitCommitChange,
  GitRemoteBranch,
  GitRemoteInfo,
  GitStatus,
} from "./types";
import { useGitBranchActions } from "./useGitBranchActions";
import { useGitCommitFlow } from "./useGitCommitFlow";
import { useGitCredentialsRetry } from "./useGitCredentialsRetry";
import { useGitRemoteActions } from "./useGitRemoteActions";
import { useGitSyncActions } from "./useGitSyncActions";
import type { OverlayStack } from "./useOverlayStack";

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

/** The full controller surface — dialog groups take this as one object
 * instead of two dozen individual props. */
export type GitUiController = ReturnType<typeof useGitUiController>;

/** Composes the git-domain hooks (sync status/actions, commit flow, branch
 *  actions, remote actions, AUTH_REQUIRED credentials retry) into the one
 *  object `App.tsx` threads through to the status bar and git dialogs.
 *  Each concern is a separate hook — see useGit{SyncActions,CommitFlow,
 *  BranchActions,RemoteActions,CredentialsRetry}.ts — this file only wires
 *  the cross-cutting dependency (every operation that can hit AUTH_REQUIRED
 *  shares the one credentials-retry flow) and flattens the results. */
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
  const credentials = useGitCredentialsRetry({
    overlay,
    showToast,
    handlePushWithCredentials,
    handlePullWithCredentials,
    handleFetchWithCredentials,
    handleForgetCredentials,
    hasCredentialsForHost,
  });

  const sync = useGitSyncActions({
    overlay,
    gitStatusMap,
    isGitRepo,
    remoteInfo,
    showToast,
    flushPendingSave,
    handlePush,
    handlePull,
    openGitCredentialsDialog: credentials.openGitCredentialsDialog,
  });

  const commit = useGitCommitFlow({
    overlay,
    parsedTitle,
    selectedFileName,
    showToast,
    flushPendingSave,
    handleCommit,
    getCommitChanges,
    getBranch,
    pushSuccessMessage: sync.pushSuccessMessage,
    openGitCredentialsDialog: credentials.openGitCredentialsDialog,
  });

  const branches = useGitBranchActions({
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
  });

  const remotes = useGitRemoteActions({
    remoteInfo,
    showToast,
    handleOpenRemote,
  });

  return {
    ...sync,
    ...commit,
    ...branches,
    ...remotes,
    ...credentials,
  };
}
