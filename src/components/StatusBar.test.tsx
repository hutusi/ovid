import { describe, expect, it, mock } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) return `${key}(${JSON.stringify(vars)})`;
      return key;
    },
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import type { FontFamily, FontSize } from "../lib/useEditorPreferences";
import { createWritingStats } from "../lib/writingStats";
import { StatusBar } from "./StatusBar";

type StatusBarProps = Parameters<typeof StatusBar>[0];

type TestElementProps = {
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
};

function renderStatusBar(
  gitChangeLabel: string | null,
  onOpenCommit = mock(() => {}),
  onOpenPreferences = mock(() => {}),
  overrides: Partial<StatusBarProps> = {}
) {
  return {
    onOpenCommit,
    onOpenPreferences,
    tree: StatusBar({
      fileLabel: "draft.md",
      writingStats: createWritingStats(),
      filePath: "/ws/draft.md",
      resolvedTheme: "light",
      saveStatus: "saved",
      zenMode: false,
      typewriterMode: false,
      wordCountGoal: null,
      fontFamily: "serif" as FontFamily,
      fontSize: "default" as FontSize,
      spellCheck: true,
      gitBranch: "main",
      gitBranchTitle: "Current branch: main",
      gitSyncLabel: "behind",
      gitSyncTitle: "Your branch is behind origin/main.",
      gitChangeLabel,
      gitChangeTitle: gitChangeLabel ? "1 staged, 2 unstaged" : undefined,
      gitSyncPopoverOpen: false,
      notificationsCount: 0,
      notificationsUnread: 0,
      notificationsOpen: false,
      onOpenBranches: () => {},
      onOpenCommit,
      onOpenGitSync: () => {},
      onOpenNotifications: () => {},
      onToggleTheme: () => {},
      onToggleZen: () => {},
      onToggleTypewriter: () => {},
      onSetFontFamily: () => {},
      onSetFontSize: () => {},
      onToggleSpellCheck: () => {},
      onSetWordCountGoal: () => {},
      onOpenPreferences,
      ...overrides,
    }),
  };
}

function collectElements(
  node: ReactNode,
  predicate: (element: ReactElement<TestElementProps>) => boolean
) {
  const matches: ReactElement<TestElementProps>[] = [];

  function visit(current: ReactNode) {
    if (current == null || typeof current === "boolean") return;
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    if (typeof current === "string" || typeof current === "number") return;

    if (!isValidElement<TestElementProps>(current)) return;
    const element = current;
    if (predicate(element)) {
      matches.push(element);
    }
    visit(element.props.children);
  }

  visit(node);
  return matches;
}

function collectText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (!isValidElement<TestElementProps>(node)) return "";
  return collectText(node.props.children);
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
    expect(collectText(badges[0].props.children)).toBe("3 changes");
  });

  it("wires the git change badge click to the commit flow", () => {
    const { tree, onOpenCommit } = renderStatusBar("2 changes");
    const badges = collectElements(
      tree,
      (element) => element.props.className === "statusbar-git-changes"
    );

    expect(badges).toHaveLength(1);
    badges[0].props.onClick?.();

    expect(onOpenCommit).toHaveBeenCalledTimes(1);
  });

  it("wires the Preferences gear click to onOpenPreferences", () => {
    const { tree, onOpenPreferences } = renderStatusBar(null);
    const gears = collectElements(
      tree,
      (element) => element.props["aria-label"] === "status_bar.preferences"
    );

    expect(gears).toHaveLength(1);
    gears[0].props.onClick?.();

    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it("shows the running git action in place of the sync button", () => {
    const idle = renderStatusBar(null).tree;
    expect(
      collectElements(idle, (element) => element.props.className === "statusbar-git-sync")
    ).toHaveLength(1);

    const busy = renderStatusBar(null, undefined, undefined, { gitActionInFlight: "push" }).tree;
    expect(
      collectElements(busy, (element) => element.props.className === "statusbar-git-sync")
    ).toHaveLength(0);
    const status = collectElements(
      busy,
      (element) => element.props.className === "statusbar-git-sync is-busy"
    );
    expect(status).toHaveLength(1);
    expect(collectText(status[0].props.children)).toBe("status_bar.git_push_running");
  });

  it("puts the file and branch names in truncating spans", () => {
    const { tree } = renderStatusBar(null);
    const names = collectElements(
      tree,
      (element) => element.props.className === "statusbar-truncate"
    ).map((element) => collectText(element.props.children));
    expect(names).toEqual(["draft.md", "main"]);
  });
});
