import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { GitRemoteInfo } from "./types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: localT,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

const { buildDefaultCommitMessage, formatCommitError } = await import("./useGitCommitFlow");
const { commitDialogState, makeSpies, renderController, sampleChange } = await import(
  "../../scripts/test-git-ui-helpers"
);

describe("useGitCommitFlow helpers", () => {
  it("buildDefaultCommitMessage prefers title over file name", () => {
    expect(buildDefaultCommitMessage("Draft post", "draft.md")).toBe("Update: Draft post");
  });

  it("buildDefaultCommitMessage falls back to selected file name", () => {
    expect(buildDefaultCommitMessage(undefined, "draft.md")).toBe("Update: draft.md");
  });

  it("formatCommitError preserves commit-specific wording", () => {
    expect(formatCommitError("commit created, but push failed: auth", localT)).toBe(
      "Commit created, but push failed: auth"
    );
  });

  it("formatCommitError prefixes generic failures", () => {
    expect(formatCommitError("fatal: bad path", localT)).toBe("Commit failed: fatal: bad path");
  });
});

describe("useGitCommitFlow — commit dialog", () => {
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
    expect(commitDialogState(result.current.overlay)).toEqual({
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
    expect(commitDialogState(result.current.overlay)).toBeNull();
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
    expect(commitDialogState(result.current.overlay)).not.toBeNull();

    await act(async () => {
      await result.current.controller.handleCommitDialogCommit(
        "My change",
        [sampleChange.path],
        false
      );
    });

    expect(spies.flushPendingSave).toHaveBeenCalled();
    expect(spies.handleCommit).toHaveBeenCalledWith("My change", [sampleChange.path], false);
    expect(commitDialogState(result.current.overlay)).toBeNull();
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
    expect(commitDialogState(result.current.overlay)).not.toBeNull();

    await act(async () => {
      await result.current.controller.handleCommitDialogCommit(
        "My change",
        [sampleChange.path],
        true
      );
    });

    // Commit dialog closed, credentials dialog opened, no flash-by toast.
    expect(commitDialogState(result.current.overlay)).toBeNull();
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.host).toBe("github.com");
      expect(result.current.overlay.active.state.operation).toBe("push");
    }
    const toastCalls = spies.showToast.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(toastCalls.every((m) => !m.startsWith("Commit"))).toBe(true);
  });
});
