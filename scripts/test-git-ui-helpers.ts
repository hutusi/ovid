// Shared render harness for the git-domain hook test files (useGitCommitFlow,
// useGitBranchActions, useGitSyncActions, useGitCredentialsRetry,
// useGitRemoteActions). useGitUiController composes all of them into one
// object — rendering the composed hook (rather than each sub-hook in
// isolation) matches how the app actually uses it and lets AUTH_REQUIRED
// retry tests exercise the real cross-hook wiring (e.g. a sync action
// opening the shared credentials dialog).
import { mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import type { GitBranch, GitCommitChange, GitRemoteBranch, GitRemoteInfo } from "../src/lib/types";
import { useGitUiController } from "../src/lib/useGitUiController";
import { useOverlayStack } from "../src/lib/useOverlayStack";

export const EMPTY_REMOTE_INFO: GitRemoteInfo = {
  remotes: [],
  remoteName: null,
  remoteUrl: null,
  upstream: null,
  aheadBehind: null,
};

export interface ControllerSpies {
  showToast: ReturnType<typeof mock>;
  flushPendingSave: ReturnType<typeof mock>;
  openWorkspaceAtPath: ReturnType<typeof mock>;
  handleCommit: ReturnType<typeof mock>;
  handlePush: ReturnType<typeof mock>;
  handlePull: ReturnType<typeof mock>;
  handlePushWithCredentials: ReturnType<typeof mock>;
  handlePullWithCredentials: ReturnType<typeof mock>;
  handleFetchWithCredentials: ReturnType<typeof mock>;
  handleForgetCredentials: ReturnType<typeof mock>;
  hasCredentialsForHost: ReturnType<typeof mock>;
  handleSwitchBranch: ReturnType<typeof mock>;
  handleCreateBranch: ReturnType<typeof mock>;
  handleCheckoutRemoteBranch: ReturnType<typeof mock>;
  handleRenameBranch: ReturnType<typeof mock>;
  handleDeleteBranch: ReturnType<typeof mock>;
  handleOpenRemote: ReturnType<typeof mock>;
  getCommitChanges: ReturnType<typeof mock>;
  getBranch: ReturnType<typeof mock>;
  getBranches: ReturnType<typeof mock>;
  getRemoteBranches: ReturnType<typeof mock>;
  getRemoteInfo: ReturnType<typeof mock>;
}

export function makeSpies(): ControllerSpies {
  return {
    showToast: mock((_: string) => {}),
    flushPendingSave: mock(() => Promise.resolve()),
    openWorkspaceAtPath: mock((_: string) => Promise.resolve()),
    handleCommit: mock(() => Promise.resolve()),
    handlePush: mock(() => Promise.resolve()),
    handlePull: mock(() => Promise.resolve()),
    handlePushWithCredentials: mock(() => Promise.resolve()),
    handlePullWithCredentials: mock(() => Promise.resolve()),
    handleFetchWithCredentials: mock(() => Promise.resolve()),
    handleForgetCredentials: mock(() => Promise.resolve()),
    hasCredentialsForHost: mock((_: string) => Promise.resolve(false)),
    handleSwitchBranch: mock(() => Promise.resolve()),
    handleCreateBranch: mock(() => Promise.resolve()),
    handleCheckoutRemoteBranch: mock(() => Promise.resolve()),
    handleRenameBranch: mock(() => Promise.resolve()),
    handleDeleteBranch: mock(() => Promise.resolve()),
    handleOpenRemote: mock(() => Promise.resolve()),
    getCommitChanges: mock(() => Promise.resolve<GitCommitChange[]>([])),
    getBranch: mock(() => Promise.resolve("main")),
    getBranches: mock(() => Promise.resolve<GitBranch[]>([])),
    getRemoteBranches: mock(() => Promise.resolve<GitRemoteBranch[]>([])),
    getRemoteInfo: mock(() => Promise.resolve<GitRemoteInfo>(EMPTY_REMOTE_INFO)),
  };
}

export interface RenderOptions {
  spies: ControllerSpies;
  remoteInfo?: GitRemoteInfo;
  workspaceRootPath?: string | null;
}

export function renderController(options: RenderOptions) {
  return renderHook(() => {
    const overlay = useOverlayStack();
    const controller = useGitUiController({
      overlay,
      gitStatusMap: new Map(),
      isGitRepo: true,
      remoteInfo: options.remoteInfo ?? EMPTY_REMOTE_INFO,
      workspaceRootPath: options.workspaceRootPath ?? "/ws",
      ...options.spies,
    });
    return { overlay, controller };
  });
}

// The controller doesn't re-expose dialog state derived from the overlay —
// GitDialogs.tsx reads overlay.active directly, and tests do the same.
export function commitDialogState(overlay: ReturnType<typeof useOverlayStack>) {
  return overlay.active?.kind === "commit" ? overlay.active.state : null;
}
export function branchSwitcherState(overlay: ReturnType<typeof useOverlayStack>) {
  return overlay.active?.kind === "branchSwitcher" ? overlay.active.state : null;
}

export const sampleChange: GitCommitChange = {
  path: "/ws/content/posts/hello.md",
  displayPath: "content/posts/hello.md",
  status: "modified",
  staged: false,
};

export const sampleBranch: GitBranch = {
  name: "main",
  upstream: "origin/main",
  aheadBehind: null,
  isCurrent: true,
};
