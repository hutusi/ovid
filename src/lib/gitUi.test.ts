import { describe, expect, it } from "bun:test";
import {
  getGitBranchTitle,
  getGitSyncDescription,
  getGitSyncLabel,
  getGitSyncPopoverState,
  getPushSuccessMessage,
  getRemoteSummary,
} from "./gitUi";
import type { GitRemote, GitRemoteInfo } from "./types";

function makeRemote(name: string, url: string | null = null): GitRemote {
  return { name, url };
}

function makeRemoteInfo(overrides: Partial<GitRemoteInfo> = {}): GitRemoteInfo {
  return {
    remotes: [],
    remoteName: null,
    remoteUrl: null,
    upstream: null,
    aheadBehind: null,
    ...overrides,
  };
}

describe("getPushSuccessMessage", () => {
  it("uses upstream setup wording when a remote exists but no upstream is configured", () => {
    expect(getPushSuccessMessage(makeRemoteInfo({ remoteName: "origin" }))).toBe(
      "Pushed and set upstream"
    );
  });

  it("uses normal push wording when upstream already exists", () => {
    expect(
      getPushSuccessMessage(makeRemoteInfo({ remoteName: "origin", upstream: "origin/main" }))
    ).toBe("Pushed to remote");
  });
});

describe("getRemoteSummary", () => {
  it("prefers upstream when available", () => {
    expect(
      getRemoteSummary(makeRemoteInfo({ remoteName: "origin", upstream: "origin/main" }))
    ).toBe("origin/main");
  });

  it("falls back to remote name and ahead/behind state", () => {
    expect(getRemoteSummary(makeRemoteInfo({ remoteName: "origin", aheadBehind: "<>" }))).toBe(
      "origin <>"
    );
  });

  it("returns no upstream when nothing is configured", () => {
    expect(getRemoteSummary(makeRemoteInfo())).toBe("No upstream");
  });

  it("describes multiple remotes when no preferred remote exists", () => {
    expect(
      getRemoteSummary(makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] }))
    ).toBe("2 remotes configured");
  });
});

describe("getGitSyncLabel", () => {
  it("labels ahead and behind states", () => {
    expect(getGitSyncLabel(makeRemoteInfo({ upstream: "origin/main", aheadBehind: ">" }))).toBe(
      "Ahead"
    );
    expect(getGitSyncLabel(makeRemoteInfo({ upstream: "origin/main", aheadBehind: "<" }))).toBe(
      "Behind"
    );
  });

  it("flags missing upstream when a push remote exists", () => {
    expect(getGitSyncLabel(makeRemoteInfo({ remoteName: "origin" }))).toBe("No upstream");
  });

  it("flags ambiguous remotes when none is preferred", () => {
    expect(
      getGitSyncLabel(makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] }))
    ).toBe("Choose remote");
  });
});

describe("getGitSyncDescription", () => {
  it("explains diverged state", () => {
    expect(
      getGitSyncDescription(makeRemoteInfo({ upstream: "origin/main", aheadBehind: "<>" }))
    ).toBe("Local and remote branches have diverged.");
  });

  it("explains in-sync state", () => {
    expect(getGitSyncDescription(makeRemoteInfo({ upstream: "origin/main" }))).toBe(
      "Branch is in sync with its configured tracking branch."
    );
  });
});

describe("getGitBranchTitle", () => {
  it("includes branch and upstream details", () => {
    expect(
      getGitBranchTitle("main", makeRemoteInfo({ upstream: "origin/main", aheadBehind: "<>" }))
    ).toBe("Current branch: main\nUpstream: origin/main\nTracking: <>");
  });

  it("explains when no upstream is configured", () => {
    expect(getGitBranchTitle("feature/test", makeRemoteInfo())).toBe(
      "Current branch: feature/test\nNo upstream configured"
    );
  });

  it("lists remotes when no single push remote can be inferred", () => {
    expect(
      getGitBranchTitle(
        "feature/test",
        makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] })
      )
    ).toBe("Current branch: feature/test\nNo upstream configured\nRemotes: origin, publish");
  });
});

describe("getGitSyncPopoverState", () => {
  it("builds a push action for ahead branches", () => {
    expect(
      getGitSyncPopoverState(makeRemoteInfo({ upstream: "origin/main", aheadBehind: ">" }))
    ).toEqual({
      label: "Ahead",
      title: "Ahead",
      tracking: "origin/main",
      description: "Your branch is ahead of origin/main.",
      actionKind: "push",
      actionLabel: "Push",
    });
  });

  it("builds a push-track action when no upstream is configured", () => {
    expect(getGitSyncPopoverState(makeRemoteInfo({ remoteName: "origin" }))).toEqual({
      label: "No upstream",
      title: "No upstream",
      tracking: "origin",
      description:
        "This branch is not tracking a remote branch yet. Push once to start tracking origin.",
      actionKind: "push-track",
      actionLabel: "Push + Track",
    });
  });

  it("returns explanation-only state for ambiguous remotes", () => {
    expect(
      getGitSyncPopoverState(
        makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] })
      )
    ).toEqual({
      label: "Choose remote",
      title: "Choose remote",
      tracking: "origin, publish",
      description: "Multiple remotes are configured and no push target is selected yet.",
      actionKind: null,
      actionLabel: null,
    });
  });
});
