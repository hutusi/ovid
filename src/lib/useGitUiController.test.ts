import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { GitBranch, GitCommitChange, GitRemoteBranch, GitRemoteInfo } from "./types";
import {
  buildDefaultCommitMessage,
  formatCommitError,
  formatGitActionError,
  getErrorMessage,
  loadBranchSwitcherState,
  useGitUiController,
} from "./useGitUiController";
import { useOverlayStack } from "./useOverlayStack";

describe("useGitUiController helpers", () => {
  it("buildDefaultCommitMessage prefers title over file name", () => {
    expect(buildDefaultCommitMessage("Draft post", "draft.md")).toBe("Update: Draft post");
  });

  it("buildDefaultCommitMessage falls back to selected file name", () => {
    expect(buildDefaultCommitMessage(undefined, "draft.md")).toBe("Update: draft.md");
  });

  it("formatGitActionError preserves already classified backend messages", () => {
    expect(formatGitActionError("push", "Push rejected. Remote has new commits.")).toBe(
      "Push rejected. Remote has new commits."
    );
  });

  it("formatGitActionError prefixes unclassified messages", () => {
    expect(formatGitActionError("pull", "fatal: test failure")).toBe(
      "pull failed: fatal: test failure"
    );
  });

  it("formatCommitError preserves commit-specific wording", () => {
    expect(formatCommitError("commit created, but push failed: auth")).toBe(
      "Commit created, but push failed: auth"
    );
  });

  it("formatCommitError prefixes generic failures", () => {
    expect(formatCommitError("fatal: bad path")).toBe("Commit failed: fatal: bad path");
  });

  it("getErrorMessage normalizes Error instances for commit error formatting", () => {
    expect(formatCommitError(getErrorMessage(new Error("fatal: bad path")))).toBe(
      "Commit failed: fatal: bad path"
    );
  });

  it("loadBranchSwitcherState returns null when there are no local branches", async () => {
    const state = await loadBranchSwitcherState({
      getBranches: async () => [],
      getRemoteBranches: async () => [
        { name: "feature-x", remoteName: "origin", remoteRef: "origin/feature-x" },
      ],
      getRemoteInfo: async () => ({
        remotes: [{ name: "origin", url: "https://example.com/repo.git" }],
        remoteName: "origin",
        remoteUrl: "https://example.com/repo.git",
        upstream: null,
        aheadBehind: null,
      }),
    });

    expect(state).toBeNull();
  });

  it("loadBranchSwitcherState returns local branches, remote branches, and remote info together", async () => {
    const state = await loadBranchSwitcherState({
      getBranches: async () => [
        {
          name: "main",
          upstream: "origin/main",
          aheadBehind: null,
          isCurrent: true,
        },
      ],
      getRemoteBranches: async () => [
        { name: "feature-x", remoteName: "origin", remoteRef: "origin/feature-x" },
      ],
      getRemoteInfo: async () => ({
        remotes: [{ name: "origin", url: "https://example.com/repo.git" }],
        remoteName: "origin",
        remoteUrl: "https://example.com/repo.git",
        upstream: "origin/main",
        aheadBehind: ">",
      }),
    });

    expect(state).toEqual({
      branches: [
        {
          name: "main",
          upstream: "origin/main",
          aheadBehind: null,
          isCurrent: true,
        },
      ],
      remoteBranches: [{ name: "feature-x", remoteName: "origin", remoteRef: "origin/feature-x" }],
      remoteInfo: {
        remotes: [{ name: "origin", url: "https://example.com/repo.git" }],
        remoteName: "origin",
        remoteUrl: "https://example.com/repo.git",
        upstream: "origin/main",
        aheadBehind: ">",
      },
    });
  });
});

// ── Hook orchestration ─────────────────────────────────────────────────────
//
// useGitUiController takes every action handler and data fetcher as an
// option, so there's no Tauri seam to mock — we pass spy callbacks directly.
// The real useOverlayStack is composed inside a wrapper hook so we can read
// the resulting `commitDialog`, `branchSwitcher`, etc. fields off the
// controller. Pattern follows useEditorSession.test.ts from PR #97.

const EMPTY_REMOTE_INFO: GitRemoteInfo = {
  remotes: [],
  remoteName: null,
  remoteUrl: null,
  upstream: null,
  aheadBehind: null,
};

interface ControllerSpies {
  showToast: ReturnType<typeof mock>;
  flushPendingSave: ReturnType<typeof mock>;
  openWorkspaceAtPath: ReturnType<typeof mock>;
  handleCommit: ReturnType<typeof mock>;
  handlePush: ReturnType<typeof mock>;
  handlePull: ReturnType<typeof mock>;
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

function makeSpies(): ControllerSpies {
  return {
    showToast: mock((_: string) => {}),
    flushPendingSave: mock(() => Promise.resolve()),
    openWorkspaceAtPath: mock((_: string) => Promise.resolve()),
    handleCommit: mock(() => Promise.resolve()),
    handlePush: mock(() => Promise.resolve()),
    handlePull: mock(() => Promise.resolve()),
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

interface RenderOptions {
  spies: ControllerSpies;
  remoteInfo?: GitRemoteInfo;
  workspaceRootPath?: string | null;
}

function renderController(options: RenderOptions) {
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

const sampleChange: GitCommitChange = {
  path: "/ws/content/posts/hello.md",
  displayPath: "content/posts/hello.md",
  status: "modified",
  staged: false,
};

const sampleBranch: GitBranch = {
  name: "main",
  upstream: "origin/main",
  aheadBehind: null,
  isCurrent: true,
};

describe("useGitUiController — dialogs + branch actions", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("openCommitDialog populates branch + changes and opens the commit overlay", async () => {
    const spies = makeSpies();
    spies.getBranch = mock(() => Promise.resolve("feature/x"));
    spies.getCommitChanges = mock(() => Promise.resolve([sampleChange]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openCommitDialog("My commit");
    });

    expect(spies.getBranch).toHaveBeenCalledTimes(1);
    expect(spies.getCommitChanges).toHaveBeenCalledTimes(1);
    expect(result.current.controller.commitDialog).toEqual({
      message: "My commit",
      branch: "feature/x",
      changes: [sampleChange],
    });
  });

  it("openCommitDialog toasts and stays closed when there are no changes", async () => {
    const spies = makeSpies();
    spies.getCommitChanges = mock(() => Promise.resolve([]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openCommitDialog("noop");
    });

    expect(spies.showToast).toHaveBeenCalledWith("No git changes to commit");
    expect(result.current.controller.commitDialog).toBeNull();
  });

  it("openBranchSwitcher loads parallel data and opens the dialog", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    spies.getRemoteBranches = mock(() =>
      Promise.resolve<GitRemoteBranch[]>([
        { name: "origin/feature/x", remoteName: "origin", remoteRef: "origin/feature/x" },
      ])
    );
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });

    expect(spies.getBranches).toHaveBeenCalledTimes(1);
    expect(spies.getRemoteBranches).toHaveBeenCalledTimes(1);
    expect(spies.getRemoteInfo).toHaveBeenCalledTimes(1);
    expect(result.current.controller.branchSwitcher).not.toBeNull();
    expect(result.current.controller.branchSwitcher?.branches).toEqual([sampleBranch]);
  });

  it("openBranchSwitcher toasts when the repo has no local branches", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve<GitBranch[]>([]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });

    expect(spies.showToast).toHaveBeenCalledWith("No local branches found");
    expect(result.current.controller.branchSwitcher).toBeNull();
  });

  it("refreshBranchSwitcher is a no-op when the dialog isn't open", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.refreshBranchSwitcher();
    });

    expect(spies.getBranches).not.toHaveBeenCalled();
  });

  it("switchBranch flushes, switches, reloads, closes dialog, toasts", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });
    expect(result.current.controller.branchSwitcher).not.toBeNull();

    await act(async () => {
      await result.current.controller.switchBranch("feature/x");
    });

    expect(spies.flushPendingSave).toHaveBeenCalled();
    expect(spies.handleSwitchBranch).toHaveBeenCalledWith("feature/x");
    expect(spies.openWorkspaceAtPath).toHaveBeenCalledWith("/ws");
    expect(spies.showToast).toHaveBeenCalledWith("Switched to feature/x");
    expect(result.current.controller.branchSwitcher).toBeNull();
  });

  it("createBranch mirrors switchBranch but uses handleCreateBranch", async () => {
    const spies = makeSpies();
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.createBranch("feature/new");
    });

    expect(spies.handleCreateBranch).toHaveBeenCalledWith("feature/new");
    expect(spies.openWorkspaceAtPath).toHaveBeenCalledWith("/ws");
    expect(spies.showToast).toHaveBeenCalledWith("Created and switched to feature/new");
  });

  it("renameBranch refreshes the branch switcher after the rename", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    // Open the switcher so refreshBranchSwitcher actually fires.
    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });
    spies.getBranches.mockClear();

    await act(async () => {
      await result.current.controller.renameBranch("old", "new");
    });

    expect(spies.handleRenameBranch).toHaveBeenCalledWith("old", "new");
    expect(spies.showToast).toHaveBeenCalledWith("Renamed old to new");
    expect(spies.getBranches).toHaveBeenCalledTimes(1);
  });

  it("deleteBranch deletes, closes its dialog, refreshes the switcher", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });
    spies.getBranches.mockClear();

    await act(async () => {
      await result.current.controller.deleteBranch("feature/x");
    });

    expect(spies.handleDeleteBranch).toHaveBeenCalledWith("feature/x");
    expect(spies.showToast).toHaveBeenCalledWith("Deleted feature/x");
    expect(spies.getBranches).toHaveBeenCalledTimes(1);
  });

  it("checkoutRemoteBranch trims the remote prefix and reloads the workspace", async () => {
    const spies = makeSpies();
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.checkoutRemoteBranch("origin/feature/x");
    });

    expect(spies.handleCheckoutRemoteBranch).toHaveBeenCalledWith("origin/feature/x");
    expect(spies.openWorkspaceAtPath).toHaveBeenCalledWith("/ws");
    // Toast strips the leading "origin/" — the user sees the local branch name.
    expect(spies.showToast).toHaveBeenCalledWith("Checked out feature/x");
  });
});
