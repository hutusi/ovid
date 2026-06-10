import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, render, waitFor } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import type { GitUiController } from "../../lib/useGitUiController";
import type { Overlay, OverlayStack } from "../../lib/useOverlayStack";
import { GitDialogs } from "./GitDialogs";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

// Every git overlay kind must map to a rendered dialog — the switch in
// GitDialogs is on a runtime string, so a kind added to the Overlay union
// without a render arm would fail silently. This test is the missing
// compiler check.

function makeOverlay(active: Overlay): OverlayStack {
  return {
    active,
    is: (kind) => active.kind === kind,
    open: () => {},
    close: () => {},
    isBlocking: true,
  };
}

function makeGitUi(): GitUiController {
  return {
    gitSyncPopover: {
      label: "↑1",
      title: "1 to push",
      tracking: "origin/main",
      description: "1 commit ahead",
      actionKind: "push",
      actionLabel: "Push",
    },
    handleGitSyncAction: async () => {},
    handleCommitDialogCommit: async () => {},
    switchBranch: async () => {},
    checkoutRemoteBranch: async () => {},
    closeBranchSwitcher: () => {},
    runGitAction: () => {},
    openRemote: async () => {},
    copyRemoteUrl: async () => {},
    createBranch: async () => {},
    renameBranch: async () => {},
    deleteBranch: async () => {},
    handleGitCredentialsSubmit: async () => {},
    handleForgetGitCredentials: async () => {},
  } as unknown as GitUiController;
}

const remoteInfo = {
  remoteName: "origin",
  remoteUrl: "https://github.com/x/y.git",
  upstream: "origin/main",
  aheadBehind: null,
  remotes: [],
};

// One representative overlay payload per git kind.
const GIT_OVERLAYS: Overlay[] = [
  {
    kind: "commit",
    state: {
      message: "Update: x",
      branch: "main",
      changes: [{ path: "a.md", displayPath: "a.md", status: "modified", staged: false }],
    },
  },
  {
    kind: "branchSwitcher",
    state: {
      branches: [{ name: "main", current: true, upstream: "origin/main" }],
      remoteBranches: [],
      remoteInfo,
    },
  },
  { kind: "newBranch" },
  { kind: "renameBranch", state: { branch: "old" } },
  { kind: "deleteBranch", state: { branch: "gone" } },
  {
    kind: "gitCredentials",
    state: {
      host: "github.com",
      remoteName: "origin",
      operation: "push",
      hasStoredCredentials: false,
      authErrored: false,
    },
  },
] as Overlay[];

describe("GitDialogs", () => {
  for (const overlay of GIT_OVERLAYS) {
    it(`renders a dialog for the "${overlay.kind}" overlay kind`, async () => {
      const view = render(
        <GitDialogs
          overlay={makeOverlay(overlay)}
          gitUi={makeGitUi()}
          currentBranch="main"
          handlePush={async () => {}}
        />
      );
      // Dialogs are lazy() components behind Suspense — wait for hydration.
      await waitFor(() => {
        expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
      });
      act(() => view.unmount());
    });
  }

  it("renders the sync popover for the gitSyncPopover kind", async () => {
    const view = render(
      <GitDialogs
        overlay={makeOverlay({ kind: "gitSyncPopover" })}
        gitUi={makeGitUi()}
        currentBranch="main"
        handlePush={async () => {}}
      />
    );
    await waitFor(() => {
      expect(view.container.textContent).toContain("1 commit ahead");
    });
    act(() => view.unmount());
  });

  it("renders nothing for a non-git overlay kind", () => {
    const view = render(
      <GitDialogs
        overlay={makeOverlay({ kind: "preferences" })}
        gitUi={makeGitUi()}
        currentBranch="main"
        handlePush={async () => {}}
      />
    );
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    act(() => view.unmount());
  });
});
