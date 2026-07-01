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

describe("useGitRemoteActions", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("openRemote toasts a formatted error when handleOpenRemote rejects", async () => {
    const spies = makeSpies();
    spies.handleOpenRemote = mock(() => Promise.reject(new Error("no remote")));
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.openRemote("origin");
    });

    expect(spies.handleOpenRemote).toHaveBeenCalledWith("origin");
    expect(spies.showToast).toHaveBeenCalledWith("Open remote failed: no remote");
  });

  it("copyRemoteUrl toasts when no remote URL is configured", async () => {
    const spies = makeSpies();
    // EMPTY_REMOTE_INFO has remoteUrl: null
    const { result } = renderController({ spies });

    await act(async () => {
      await result.current.controller.copyRemoteUrl();
    });

    expect(spies.showToast).toHaveBeenCalledWith("No remote URL configured");
  });

  it("copyRemoteUrl writes to the clipboard when a URL exists", async () => {
    const spies = makeSpies();
    const writeText = mock((_: string) => Promise.resolve());
    // happy-dom provides navigator; install a stub clipboard.
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const remoteInfo: GitRemoteInfo = {
      remotes: [{ name: "origin", url: "git@github.com:foo/bar.git" }],
      remoteName: "origin",
      remoteUrl: "https://github.com/foo/bar",
      upstream: null,
      aheadBehind: null,
    };
    const { result } = renderController({ spies, remoteInfo });

    await act(async () => {
      await result.current.controller.copyRemoteUrl();
    });

    expect(writeText).toHaveBeenCalledWith("https://github.com/foo/bar");
    expect(spies.showToast).toHaveBeenCalledWith("Copied remote URL");
  });
});
