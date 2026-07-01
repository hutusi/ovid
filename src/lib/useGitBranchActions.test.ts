import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { GitBranch, GitRemoteBranch } from "./types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: localT,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

const { loadBranchSwitcherState } = await import("./useGitBranchActions");
const { branchSwitcherState, makeSpies, renderController, sampleBranch } = await import(
  "../../scripts/test-git-ui-helpers"
);

describe("loadBranchSwitcherState", () => {
  it("returns null when there are no local branches", async () => {
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

  it("returns local branches, remote branches, and remote info together", async () => {
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

describe("useGitBranchActions", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

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
    expect(branchSwitcherState(result.current.overlay)).not.toBeNull();
    expect(branchSwitcherState(result.current.overlay)?.branches).toEqual([sampleBranch]);
  });

  it("openBranchSwitcher toasts when the repo has no local branches", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve<GitBranch[]>([]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });

    expect(spies.showToast).toHaveBeenCalledWith("No local branches found");
    expect(branchSwitcherState(result.current.overlay)).toBeNull();
  });

  it("reopenBranchSwitcher loads fresh data and opens the switcher", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.reopenBranchSwitcher();
    });

    expect(spies.getBranches).toHaveBeenCalledTimes(1);
    expect(branchSwitcherState(result.current.overlay)).not.toBeNull();
  });

  it("switchBranch flushes, switches, reloads, closes dialog, toasts", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
    });
    expect(branchSwitcherState(result.current.overlay)).not.toBeNull();

    await act(async () => {
      await result.current.controller.switchBranch("feature/x");
    });

    expect(spies.flushPendingSave).toHaveBeenCalled();
    expect(spies.handleSwitchBranch).toHaveBeenCalledWith("feature/x");
    expect(spies.openWorkspaceAtPath).toHaveBeenCalledWith("/ws");
    expect(spies.showToast).toHaveBeenCalledWith("Switched to feature/x");
    expect(branchSwitcherState(result.current.overlay)).toBeNull();
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

  it("switchBranch still toasts success when the post-switch workspace reload fails", async () => {
    // The reload (openWorkspaceAtPath) runs after handleSwitchBranch has
    // already succeeded — its failure must not be misreported as the
    // switch itself failing.
    const spies = makeSpies();
    spies.openWorkspaceAtPath = mock(() => Promise.reject(new Error("disk error")));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.switchBranch("feature/x");
    });

    expect(spies.showToast).toHaveBeenCalledWith("Switched to feature/x");
    const toastCalls = spies.showToast.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(toastCalls.some((m) => m.toLowerCase().includes("failed"))).toBe(false);
  });

  it("renameBranch reopens a refreshed switcher even though its dialog replaced it", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    // Real flow: the switcher is open, then the rename dialog REPLACES it
    // (one overlay at a time) before renameBranch runs.
    await act(async () => {
      await result.current.controller.openBranchSwitcher();
      result.current.overlay.open({ kind: "renameBranch", state: { branch: "old" } });
    });
    spies.getBranches.mockClear();

    await act(async () => {
      await result.current.controller.renameBranch("old", "new");
    });

    expect(spies.handleRenameBranch).toHaveBeenCalledWith("old", "new");
    expect(spies.showToast).toHaveBeenCalledWith("Renamed old to new");
    expect(spies.getBranches).toHaveBeenCalledTimes(1);
    expect(branchSwitcherState(result.current.overlay)).not.toBeNull();
  });

  it("deleteBranch deletes, then reopens a refreshed switcher", async () => {
    const spies = makeSpies();
    spies.getBranches = mock(() => Promise.resolve([sampleBranch]));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openBranchSwitcher();
      result.current.overlay.open({ kind: "deleteBranch", state: { branch: "feature/x" } });
    });
    spies.getBranches.mockClear();

    await act(async () => {
      await result.current.controller.deleteBranch("feature/x");
    });

    expect(spies.handleDeleteBranch).toHaveBeenCalledWith("feature/x");
    expect(spies.showToast).toHaveBeenCalledWith("Deleted feature/x");
    expect(spies.getBranches).toHaveBeenCalledTimes(1);
    expect(branchSwitcherState(result.current.overlay)).not.toBeNull();
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
