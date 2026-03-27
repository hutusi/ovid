import { describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { StatusBar } from "./StatusBar";

function renderStatusBar(gitChangeLabel: string | null, onOpenCommit = mock(() => {})) {
  return {
    onOpenCommit,
    tree: StatusBar({
      fileName: "draft.md",
      wordCount: 120,
      resolvedTheme: "light",
      saveStatus: "saved",
      zenMode: false,
      typewriterMode: false,
      sessionWordsAdded: 0,
      wordCountGoal: null,
      fontFamily: "iowan",
      fontSize: "md",
      spellCheck: true,
      gitBranch: "main",
      gitBranchTitle: "Current branch: main",
      gitSyncLabel: "behind",
      gitSyncTitle: "Your branch is behind origin/main.",
      gitChangeLabel,
      gitChangeTitle: gitChangeLabel ? "1 staged, 2 unstaged" : undefined,
      gitSyncPopoverOpen: false,
      onOpenBranches: () => {},
      onOpenCommit,
      onOpenGitSync: () => {},
      onToggleTheme: () => {},
      onToggleZen: () => {},
      onToggleTypewriter: () => {},
      onSetFontFamily: () => {},
      onSetFontSize: () => {},
      onToggleSpellCheck: () => {},
      onSetWordCountGoal: () => {},
    }),
  };
}

function collectElements(node: ReactNode, predicate: (element: ReactElement) => boolean) {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (current == null || typeof current === "boolean") return;
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    if (typeof current === "string" || typeof current === "number") return;

    const element = current as ReactElement<{ children?: ReactNode }>;
    if (predicate(element)) {
      matches.push(element);
    }
    visit(element.props.children);
  }

  visit(node);
  return matches;
}

describe("StatusBar git change summary", () => {
  it("renders the git change badge only when the repository is dirty", () => {
    const clean = renderStatusBar(null).tree;
    expect(
      collectElements(clean, (element) => element.props.className === "statusbar-git-changes")
        .length
    ).toBe(0);

    const dirty = renderStatusBar("3 changes").tree;
    const badges = collectElements(
      dirty,
      (element) => element.props.className === "statusbar-git-changes"
    );

    expect(badges).toHaveLength(1);
    expect(badges[0].props.children).toBe("3 changes");
  });

  it("wires the git change badge click to the commit flow", () => {
    const { tree, onOpenCommit } = renderStatusBar("2 changes");
    const badges = collectElements(
      tree,
      (element) => element.props.className === "statusbar-git-changes"
    );

    expect(badges).toHaveLength(1);
    badges[0].props.onClick();

    expect(onOpenCommit).toHaveBeenCalledTimes(1);
  });
});
