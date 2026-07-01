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

describe("useGitSyncActions", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("handleGitSyncAction dispatches pull when the popover actionKind is 'pull'", async () => {
    const spies = makeSpies();
    // upstream + aheadBehind "<" → actionKind: "pull"
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: "origin/main",
      aheadBehind: "<",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.flushPendingSave).toHaveBeenCalled();
    expect(spies.handlePull).toHaveBeenCalledTimes(1);
    expect(spies.handlePush).not.toHaveBeenCalled();
    expect(spies.showToast).toHaveBeenCalledWith("Pulled latest changes");
  });

  it("handleGitSyncAction dispatches push when the popover actionKind is 'push'", async () => {
    const spies = makeSpies();
    // upstream + aheadBehind ">" → actionKind: "push"
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.handlePush).toHaveBeenCalledTimes(1);
    expect(spies.handlePush.mock.calls[0]?.[0]).toBeUndefined();
    expect(spies.handlePull).not.toHaveBeenCalled();
  });

  it("handleGitSyncAction passes the remote name on push-track", async () => {
    const spies = makeSpies();
    // !upstream + remoteName → actionKind: "push-track"
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: null,
      aheadBehind: null,
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.handlePush).toHaveBeenCalledWith("origin");
  });

  it("handleGitSyncAction toasts the formatted error when push rejects", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("auth required")));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "git@github.com:foo/bar.git",
      upstream: "origin/main",
      aheadBehind: ">",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(spies.showToast).toHaveBeenCalledWith("push failed: auth required");
  });

  it("runGitAction opens the credentials dialog when push rejects with AUTH_REQUIRED", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    spies.hasCredentialsForHost = mock((_: string) => Promise.resolve(false));
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

    // Dialog open, no error toast on this branch — the prompt itself is the
    // surfacing mechanism.
    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    expect(spies.hasCredentialsForHost).toHaveBeenCalledWith("github.com");
    expect(spies.showToast).not.toHaveBeenCalled();
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.host).toBe("github.com");
      expect(result.current.overlay.active.state.remoteName).toBe("origin");
      expect(result.current.overlay.active.state.operation).toBe("push");
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(false);
      expect(result.current.overlay.active.state.authErrored).toBe(false);
    }
  });

  it("runGitAction marks hasStoredCredentials when the host already has a saved credential", async () => {
    const spies = makeSpies();
    spies.handlePull = mock(() => Promise.reject(new Error("AUTH_REQUIRED|gitlab.com|origin")));
    spies.hasCredentialsForHost = mock((_: string) => Promise.resolve(true));
    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "https://gitlab.com/foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://gitlab.com/foo/bar.git",
      upstream: "origin/main",
      aheadBehind: "<",
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.handleGitSyncAction();
    });

    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(true);
      expect(result.current.overlay.active.state.operation).toBe("pull");
    }
  });

  it("runGitAction still opens the credentials dialog when hasCredentialsForHost rejects", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("AUTH_REQUIRED|github.com|origin")));
    // Simulate a malformed credentials file or other probe failure. The
    // rejection must not abort the recovery path — the dialog should
    // still open, just with the forget link hidden.
    spies.hasCredentialsForHost = mock((_: string) =>
      Promise.reject(new Error("git credentials file is malformed"))
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

    expect(result.current.overlay.active?.kind).toBe("gitCredentials");
    if (result.current.overlay.active?.kind === "gitCredentials") {
      expect(result.current.overlay.active.state.hasStoredCredentials).toBe(false);
    }
    expect(spies.showToast).not.toHaveBeenCalled();
  });

  it("runGitAction falls back to a toast for non-AUTH_REQUIRED errors", async () => {
    const spies = makeSpies();
    spies.handlePush = mock(() => Promise.reject(new Error("network unreachable")));
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

    expect(result.current.overlay.active).toBeNull();
    expect(spies.showToast).toHaveBeenCalledWith("push failed: network unreachable");
  });
});
