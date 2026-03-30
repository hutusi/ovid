import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GitBranch, GitRemoteBranch, GitRemoteInfo } from "../lib/types";
import { BranchSwitcher } from "./BranchSwitcher";

function renderBranchSwitcher({
  branches,
  remoteBranches,
  remoteInfo,
}: {
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  remoteInfo: GitRemoteInfo;
}) {
  return renderToStaticMarkup(
    <BranchSwitcher
      branches={branches}
      remoteBranches={remoteBranches}
      remoteInfo={remoteInfo}
      onSelect={mock(() => {})}
      onSelectRemoteBranch={mock(() => {})}
      onCreateBranch={mock(() => {})}
      onRenameBranch={mock(() => {})}
      onDeleteBranch={mock(() => {})}
      onOpenRemote={mock(() => {})}
      onCopyRemoteUrl={mock(() => {})}
      onClose={mock(() => {})}
    />
  );
}

describe("BranchSwitcher", () => {
  it("hides remote refs that already have a local tracking branch", () => {
    const markup = renderBranchSwitcher({
      branches: [
        {
          name: "main",
          upstream: "origin/main",
          aheadBehind: null,
          isCurrent: true,
        },
        {
          name: "feature/tracked",
          upstream: "origin/feature/tracked",
          aheadBehind: null,
          isCurrent: false,
        },
      ],
      remoteBranches: [
        {
          name: "main",
          remoteName: "origin",
          remoteRef: "origin/main",
        },
        {
          name: "feature/tracked",
          remoteName: "origin",
          remoteRef: "origin/feature/tracked",
        },
        {
          name: "feature/new-remote",
          remoteName: "origin",
          remoteRef: "origin/feature/new-remote",
        },
      ],
      remoteInfo: {
        remotes: [{ name: "origin", url: "https://example.com/repo.git" }],
        remoteName: "origin",
        remoteUrl: "https://example.com/repo.git",
        upstream: "origin/main",
        aheadBehind: null,
      },
    });

    expect(markup).not.toContain("origin/feature/tracked · creates or switches tracking branch");
    expect(markup).toContain("origin/feature/new-remote");
  });

  it("renders a quiet overflow trigger for local branch maintenance actions", () => {
    const markup = renderBranchSwitcher({
      branches: [
        {
          name: "main",
          upstream: "origin/main",
          aheadBehind: null,
          isCurrent: true,
        },
        {
          name: "feature/test",
          upstream: null,
          aheadBehind: null,
          isCurrent: false,
        },
      ],
      remoteBranches: [],
      remoteInfo: {
        remotes: [{ name: "origin", url: "https://example.com/repo.git" }],
        remoteName: "origin",
        remoteUrl: "https://example.com/repo.git",
        upstream: "origin/main",
        aheadBehind: null,
      },
    });

    expect(markup).toContain('aria-label="Branch actions for main"');
    expect(markup).toContain('aria-label="Branch actions for feature/test"');
    expect(markup).toContain("ws-overflow-btn");
  });
});
