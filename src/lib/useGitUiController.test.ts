import { describe, expect, it } from "bun:test";
import {
  buildDefaultCommitMessage,
  formatCommitError,
  formatGitActionError,
  getErrorMessage,
  loadBranchSwitcherState,
} from "./useGitUiController";

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
