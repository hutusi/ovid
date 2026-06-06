import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { GitBranch, GitCommitChange, GitRemoteBranch, GitRemoteInfo } from "./types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: localT,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

const {
  buildDefaultCommitMessage,
  formatCommitError,
  formatGitActionError,
  getErrorMessage,
  loadBranchSwitcherState,
  useGitUiController,
} = await import("./useGitUiController");
const { useOverlayStack } = await import("./useOverlayStack");

describe("useGitUiController helpers", () => {
  it("buildDefaultCommitMessage prefers title over file name", () => {
    expect(buildDefaultCommitMessage("Draft post", "draft.md")).toBe("Update: Draft post");
  });

  it("buildDefaultCommitMessage falls back to selected file name", () => {
    expect(buildDefaultCommitMessage(undefined, "draft.md")).toBe("Update: draft.md");
  });

  it("formatGitActionError preserves already classified backend messages", () => {
    expect(formatGitActionError("push", "Push rejected. Remote has new commits.", localT)).toBe(
      "Push rejected. Remote has new commits."
    );
  });

  it("formatGitActionError prefixes unclassified messages", () => {
    expect(formatGitActionError("pull", "fatal: test failure", localT)).toBe(
      "pull failed: fatal: test failure"
    );
  });

  it("formatCommitError preserves commit-specific wording", () => {
    expect(formatCommitError("commit created, but push failed: auth", localT)).toBe(
      "Commit created, but push failed: auth"
    );
  });

  it("formatCommitError prefixes generic failures", () => {
    expect(formatCommitError("fatal: bad path", localT)).toBe("Commit failed: fatal: bad path");
  });

  it("getErrorMessage normalizes Error instances for commit error formatting", () => {
    expect(formatCommitError(getErrorMessage(new Error("fatal: bad path")), localT)).toBe(
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

function makeSpies(): ControllerSpies {
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

describe("useGitUiController — sync popover + commit flow", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("handleGitSyncAction dispatches pull when the popover actionKind is 'pull'", async () => {
    const spies = makeSpies();
    // upstream + aheadBehind "<" → actionKind: "pull"
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: "origin/main",
      aheadBehind: "<",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.flushPendingSave).toHaveBeenCalled();
    expect(spies.handlePull).toHaveBeenCalledTimes(1);
    expect(spies.handlePush).not.toHaveBeenCalled();
    expect(spies.showToast).toHaveBeenCalledWith("Pulled latest changes");
  });

  it("handleGitSyncAction dispatches push when the popover actionKind is 'push'", async () => {
    const spies = makeSpies();
    // upstream + aheadBehind ">" → actionKind: "push"
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.handlePush).toHaveBeenCalledTimes(1);
    expect(spies.handlePush.mock.calls[0]?.[0]).toBeUndefined();
    expect(spies.handlePull).not.toHaveBeenCalled();
  });

  it("handleGitSyncAction passes the remote name on push-track", async () => {
    const spies = makeSpies();
    // !upstream + remoteName → actionKind: "push-track"
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: null,
      aheadBehind: null,
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.handlePush).toHaveBeenCalledWith("origin");
  });

  it("handleGitSyncAction toasts the formatted error when push rejects", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("auth required")));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.showToast).toHaveBeenCalledWith("push failed: auth required");
  });

  it("handleCommitDialogCommit calls handleCommit and closes the commit dialog", async () => {
    const spies = makeSpies();
    spies.getBranch = mock(() => Promise.resolve("main"));
    spies.getCommitChanges = mock(() => Promise.resolve([sampleChange]));
    const { result } = renderController({ spies });

    // Open the commit dialog first so we can verify it closes.
    await act(async () => {
      await result.current.controller.openCommitDialog("My change");
    });
    expect(result.current.controller.commitDialog).not.toBeNull();

    await act(async () => {
      await result.current.controller.handleCommitDialogCommit(
        "My change",
        [sampleChange.path],
        false
      );
    });

    expect(spies.flushPendingSave).toHaveBeenCalled();
    expect(spies.handleCommit).toHaveBeenCalledWith("My change", [sampleChange.path], false);
    expect(result.current.controller.commitDialog).toBeNull();
  });

  it("handleCommitDialogCommit toasts a formatted error when handleCommit rejects", async () => {
    const spies = makeSpies();
    spies.handleCommit = mock(() => Promise.reject(new Error("nothing to commit")));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.handleCommitDialogCommit("msg", [], false);
    });

    expect(spies.showToast).toHaveBeenCalledWith("Commit failed: nothing to commit");
  });

  it("handleCommitDialogCommit opens the credentials dialog when commit+push hits AUTH_REQUIRED", async () => {
    const spies = makeSpies();
    // The Rust side passes the AUTH_REQUIRED marker through unwrapped when
    // the commit succeeded but the push leg failed authentication.
    spies.handleCommit = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.getBranch = mock(() => Promise.resolve("main"));
    spies.getCommitChanges = mock(() => Promise.resolve([sampleChange]));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    // Open the commit dialog so the close-on-auth path has something to close.
    await act(async () => {
      await result.current.controller.openCommitDialog("My change");
    });
    expect(result.current.controller.commitDialog).not.toBeNull();

    await act(async () => {
      await result.current.controller.handleCommitDialogCommit(
        "My change",
        [sampleChange.path],
        true
      );
    });

    // Commit dialog closed, credentials dialog opened, no flash-by toast.
    expect(result.current.controller.commitDialog).toBeNull();
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.host).toBe("github.com");
      expect(result.current.overlay.active.state.operation).toBe("push");
    }
    const toastCalls = spies.showToast.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(toastCalls.every((m) => !m.startsWith("Commit"))).toBe(true);
  });

  it("openRemote toasts a formatted error when handleOpenRemote rejects", async () => {
    const spies = makeSpies();
    spies.handleOpenRemote = mock(() => Promise.reject(new Error("no remote")));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openRemote("origin");
    });

    expect(spies.handleOpenRemote).toHaveBeenCalledWith("origin");
    expect(spies.showToast).toHaveBeenCalledWith("Open remote failed: no remote");
  });

  it("copyRemoteUrl toasts when no remote URL is configured", async () => {
    const spies = makeSpies();
    // EMPTY_REMOTE_INFO has remoteUrl: null
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.copyRemoteUrl();
    });

    expect(spies.showToast).toHaveBeenCalledWith("No remote URL configured");
  });

  it("runGitAction opens the credentials dialog when push rejects with AUTH_REQUIRED", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.hasCredentialsForHost = mock((_: string) => Promise.resolve(false));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    // Dialog open, no error toast on this branch — the prompt itself is the
    // surfacing mechanism.
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    expect(spies.hasCredentialsForHost).toHaveBeenCalledWith("github.com");
    expect(spies.showToast).not.toHaveBeenCalled();
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.host).toBe("github.com");
      expect(result.current.overlay.active.state.remoteName).toBe("origin");
      expect(result.current.overlay.active.state.operation).toBe("push");
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(false);
      expect(result.current.overlay.active.state.authErrored).toBe(false);
    }
  });

  it("runGitAction marks hasStoredCredentials when the host already has a saved credential", async () => {
    const spies = makeSpies();
    spies.handlePull = mock(() => Promise.reject(new Error("AUTH_REQUIRED|gitlab.com|origin")));
    spies.hasCredentialsForHost = mock((_: string) => Promise.resolve(true));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://gitlab.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://gitlab.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: "<",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(true);
      expect(result.current.overlay.active.state.operation).toBe("pull");
    }
  });

  it("runGitAction still opens the credentials dialog when hasCredentialsForHost rejects", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    // Simulate a malformed credentials file or other probe failure. The
    // rejection must not abort the recovery path — the dialog should
    // still open, just with the forget link hidden.
    spies.hasCredentialsForHost = mock((_: string) =>
      Promise.reject(new Error("git credentials file is malformed"))
    );
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(false);
    }
    expect(spies.showToast).not.toHaveBeenCalled();
  });

  it("runGitAction falls back to a toast for non-AUTH_REQUIRED errors", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("network unreachable")));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(result.current.overlay.active).toBeNull();
    expect(spies.showToast).toHaveBeenCalledWith("push failed: network unreachable");
  });

  it("handleGitCredentialsSubmit calls handlePushWithCredentials on push and toasts success on resolve", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    // First trigger AUTH_REQUIRED so the pending retry context is set up.
    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");

    // Submit credentials.
    await act(async () => {
      await result.current.controller.handleGitCredentialsSubmit({
        operation: "push",
        remoteName: "origin",
        username: "alice",
        password: "ghp_token",
        remember: true,
      });
    });

    expect(spies.handlePushWithCredentials).toHaveBeenCalledWith({
      remoteName: "origin",
      username: "alice",
      password: "ghp_token",
      remember: true,
    });
    // Overlay closed and the original success toast replayed.
    expect(result.current.overlay.active).toBeNull();
    const toastCalls = spies.showToast.mock.calls.map((c: unknown[]) => c[0]);
    expect(toastCalls).toContain("Pushed to remote");
  });

  it("handleGitCredentialsSubmit re-opens with authErrored when the retry hits AUTH_REQUIRED again", async () => {
    const spies = makeSpies();
    // First push (no creds): AUTH_REQUIRED. Second push (with creds): AUTH_REQUIRED again.
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.handlePushWithCredentials = mock(() =>
      Promise.reject(new Error("AUTH_REQUIRED|github.com|origin"))
    );
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });
    await act(async () => {
      await result.current.controller.handleGitCredentialsSubmit({
        operation: "push",
        remoteName: "origin",
        username: "alice",
        password: "wrong-pat",
        remember: false,
      });
    });

    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.authErrored).toBe(true);
      expect(result.current.overlay.active.state.initialUsername).toBe("alice");
    }
    // No success toast — the dialog is still open.
    expect(
      spies.showToast.mock.calls.every((call: unknown[]) => call[0] !== "Pushed to remote")
    ).toBe(true);
  });

  it("handleForgetGitCredentials clears storage and refreshes the dialog state", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.hasCredentialsForHost = mock((_: string) => Promise.resolve(true));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(true);
    }

    await act(async () => {
      await result.current.controller.handleForgetGitCredentials("github.com");
    });

    expect(spies.handleForgetCredentials).toHaveBeenCalledWith("github.com");
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(false);
    }
  });

  it("copyRemoteUrl writes to the clipboard when a URL exists", async () => {
    const spies = makeSpies();
    const writeText = mock((_: string) => Promise.resolve());
    // happy-dom provides navigator; install a stub clipboard.
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar",
      upstream: null,
      aheadBehind: null,
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.copyRemoteUrl();
    });

    expect(writeText).toHaveBeenCalledWith("https://github.com/foo/bar");
    expect(spies.showToast).toHaveBeenCalledWith("Copied remote URL");
  });
});
