import { describe, expect, it } from "bun:test";
import en from "../locales/en.json";
import {
  getGitBranchTitle,
  getGitChangeSummary,
  getGitSyncDescription,
  getGitSyncLabel,
  getGitSyncPopoverState,
  getPushSuccessMessage,
  getRemoteSummary,
} from "./gitUi";
import type { GitRemote, GitRemoteInfo, GitStatus } from "./types";

// Minimal t() implementation that resolves keys against the English locale,
// handles {{interpolation}}, and supports i18next count-based pluralisation
// (_one / _other suffixes).
function mockT(key: string, vars?: Record<string, unknown> | undefined): string {
  function resolve(k: string): string | undefined {
    const parts = k.split(".");
    let node: unknown = en;
    for (const part of parts) {
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" ? node : undefined;
  }

  let template: string | undefined;

  if (vars && typeof vars.count === "number") {
    template = resolve(vars.count === 1 ? `${key}_one` : `${key}_other`) ?? resolve(key);
  } else {
    template = resolve(key);
  }

  if (template === undefined) return key;

  if (vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? k));
  }
  return template;
}

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

function makeGitStatusMap(statuses: GitStatus[]): Map<string, GitStatus> {
  return new Map(statuses.map((status, index) => [`file-${index}.md`, status]));
}

describe("getPushSuccessMessage", () => {
  it("uses upstream setup wording when a remote exists but no upstream is configured", () => {
    expect(getPushSuccessMessage(makeRemoteInfo({ remoteName: "origin" }), mockT)).toBe(
      "Pushed and set upstream"
    );
  });

  it("uses normal push wording when upstream already exists", () => {
    expect(
      getPushSuccessMessage(
        makeRemoteInfo({ remoteName: "origin", upstream: "origin/main" }),
        mockT
      )
    ).toBe("Pushed to remote");
  });
});

describe("getRemoteSummary", () => {
  it("prefers upstream when available", () => {
    expect(
      getRemoteSummary(makeRemoteInfo({ remoteName: "origin", upstream: "origin/main" }), mockT)
    ).toBe("origin/main");
  });

  it("falls back to remote name and ahead/behind state", () => {
    expect(
      getRemoteSummary(makeRemoteInfo({ remoteName: "origin", aheadBehind: "<>" }), mockT)
    ).toBe("origin <>");
  });

  it("returns no upstream when nothing is configured", () => {
    expect(getRemoteSummary(makeRemoteInfo(), mockT)).toBe("No upstream");
  });

  it("describes multiple remotes when no preferred remote exists", () => {
    expect(
      getRemoteSummary(
        makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] }),
        mockT
      )
    ).toBe("2 remotes configured");
  });
});

describe("getGitSyncLabel", () => {
  it("labels ahead and behind states", () => {
    expect(getGitSyncLabel(makeRemoteInfo({ upstream: "origin/main", aheadBehind: ">" }))).toBe(
      "ahead"
    );
    expect(getGitSyncLabel(makeRemoteInfo({ upstream: "origin/main", aheadBehind: "<" }))).toBe(
      "behind"
    );
  });

  it("flags missing upstream when a push remote exists", () => {
    expect(getGitSyncLabel(makeRemoteInfo({ remoteName: "origin" }))).toBe("no upstream");
  });

  it("flags ambiguous remotes when none is preferred", () => {
    expect(
      getGitSyncLabel(makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] }))
    ).toBe("choose remote");
  });
});

describe("getGitSyncDescription", () => {
  it("explains diverged state", () => {
    expect(
      getGitSyncDescription(makeRemoteInfo({ upstream: "origin/main", aheadBehind: "<>" }), mockT)
    ).toBe("Your branch and origin/main both have new commits.");
  });

  it("explains in-sync state", () => {
    expect(getGitSyncDescription(makeRemoteInfo({ upstream: "origin/main" }), mockT)).toBe(
      "Branch is in sync with its configured tracking branch."
    );
  });
});

describe("getGitBranchTitle", () => {
  it("includes branch and upstream details", () => {
    expect(
      getGitBranchTitle(
        "main",
        makeRemoteInfo({ upstream: "origin/main", aheadBehind: "<>" }),
        mockT
      )
    ).toBe("Current branch: main\nUpstream: origin/main\nTracking: <>");
  });

  it("explains when no upstream is configured", () => {
    expect(getGitBranchTitle("feature/test", makeRemoteInfo(), mockT)).toBe(
      "Current branch: feature/test\nNo upstream configured"
    );
  });

  it("lists remotes when no single push remote can be inferred", () => {
    expect(
      getGitBranchTitle(
        "feature/test",
        makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] }),
        mockT
      )
    ).toBe("Current branch: feature/test\nNo upstream configured\nRemotes: origin, publish");
  });
});

describe("getGitSyncPopoverState", () => {
  it("builds a push action for ahead branches", () => {
    expect(
      getGitSyncPopoverState(makeRemoteInfo({ upstream: "origin/main", aheadBehind: ">" }), mockT)
    ).toEqual({
      label: "ahead",
      title: "ahead",
      tracking: "origin/main",
      description: "Your branch is ahead of origin/main.",
      actionKind: "push",
      actionLabel: "Push",
    });
  });

  it("builds a push-track action when no upstream is configured", () => {
    expect(getGitSyncPopoverState(makeRemoteInfo({ remoteName: "origin" }), mockT)).toEqual({
      label: "no upstream",
      title: "no upstream",
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
        makeRemoteInfo({ remotes: [makeRemote("origin"), makeRemote("publish")] }),
        mockT
      )
    ).toEqual({
      label: "choose remote",
      title: "choose remote",
      tracking: "origin, publish",
      description: "Multiple remotes are configured and no push target is selected yet.",
      actionKind: null,
      actionLabel: null,
    });
  });
});

describe("getGitChangeSummary", () => {
  it("returns null when there are no git changes", () => {
    expect(getGitChangeSummary(new Map(), mockT)).toBeNull();
  });

  it("summarizes staged and unstaged changes for the status bar tooltip", () => {
    expect(
      getGitChangeSummary(makeGitStatusMap(["staged", "modified", "untracked"]), mockT)
    ).toEqual({
      label: "3 changes",
      title: "1 staged, 2 unstaged",
    });
  });

  it("uses singular wording for one changed file", () => {
    expect(getGitChangeSummary(makeGitStatusMap(["modified"]), mockT)).toEqual({
      label: "1 change",
      title: "1 unstaged",
    });
  });
});
