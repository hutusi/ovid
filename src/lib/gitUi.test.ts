import { describe, expect, it } from "bun:test";
import { getGitBranchTitle, getPushSuccessMessage, getRemoteSummary } from "./gitUi";
import type { GitRemoteInfo } from "./types";

function makeRemoteInfo(overrides: Partial<GitRemoteInfo> = {}): GitRemoteInfo {
  return {
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
});
