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

const { makeSpies, renderController } = await import("../../scripts/test-git-ui-helpers");

describe("useGitCredentialsRetry", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("handleGitCredentialsSubmit calls handlePushWithCredentials on push and toasts success on resolve", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    // First trigger AUTH_REQUIRED so the pending retry context is set up.
    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");

    // Submit credentials.
    await act(async () => {
      await result.current.controller.handleGitCredentialsSubmit({
        operation: "push",
        remoteName: "origin",
        username: "alice",
        password: "ghp_token",
        remember: true,
      });
    });

    expect(spies.handlePushWithCredentials).toHaveBeenCalledWith({
      remoteName: "origin",
      username: "alice",
      password: "ghp_token",
      remember: true,
    });
    // Overlay closed and the original success toast replayed.
    expect(result.current.overlay.active).toBeNull();
    const toastCalls = spies.showToast.mock.calls.map((c: unknown[]) => c[0]);
    expect(toastCalls).toContain("Pushed to remote");
  });

  it("handleGitCredentialsSubmit re-opens with authErrored when the retry hits AUTH_REQUIRED again", async () => {
    const spies = makeSpies();
    // First push (no creds): AUTH_REQUIRED. Second push (with creds): AUTH_REQUIRED again.
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.handlePushWithCredentials = mock(() =>
      Promise.reject(new Error("AUTH_REQUIRED|github.com|origin"))
    );
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });
    await act(async () => {
      await result.current.controller.handleGitCredentialsSubmit({
        operation: "push",
        remoteName: "origin",
        username: "alice",
        password: "wrong-pat",
        remember: false,
      });
    });

    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.authErrored).toBe(true);
      expect(result.current.overlay.active.state.initialUsername).toBe("alice");
    }
    // No success toast — the dialog is still open.
    expect(
      spies.showToast.mock.calls.every((call: unknown[]) => call[0] !== "Pushed to remote")
    ).toBe(true);
  });

  it("handleForgetGitCredentials clears storage and refreshes the dialog state", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.hasCredentialsForHost = mock((_: string) => Promise.resolve(true));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://github.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(true);
    }

    await act(async () => {
      await result.current.controller.handleForgetGitCredentials("github.com");
    });

    expect(spies.handleForgetCredentials).toHaveBeenCalledWith("github.com");
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(false);
    }
  });
});
