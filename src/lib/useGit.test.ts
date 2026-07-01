import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { GitRemoteInfo } from "./types";

// ── Tauri seam mock ────────────────────────────────────────────────────────
//
// useGit goes through commands.git.* -> invokeCmd -> @tauri-apps/api/core's
// invoke. Pattern follows useWorkspace.test.ts. See ADR 0012.

type InvokeImpl = (name: string, args: unknown) => Promise<unknown>;
type InvokeHandlers = Partial<Record<string, (args: unknown) => unknown>>;

let invokeImpl: InvokeImpl = () =>
  Promise.reject(new Error("unmocked invoke — register a handler in the test"));
const invokeCalls: Array<{ name: string; args: unknown }> = [];

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args?: unknown) => {
    invokeCalls.push({ name, args });
    return invokeImpl(name, args);
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

function whenInvoke(handlers: InvokeHandlers): InvokeImpl {
  return async (name, args) => {
    const handler = handlers[name];
    if (!handler) {
      throw new Error(`useGit test issued unmocked invoke: ${name}`);
    }
    return handler(args);
  };
}

const { useGit } = await import("./useGit");

const EMPTY_REMOTE_INFO: GitRemoteInfo = {
  remotes: [],
  remoteName: null,
  remoteUrl: null,
  upstream: null,
  aheadBehind: null,
};

function branchCallCount() {
  return invokeCalls.filter((c) => c.name === "get_git_branch").length;
}

describe("useGit — refresh concurrency", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  beforeEach(() => {
    invokeCalls.length = 0;
  });

  it("de-dupes a concurrent refreshGitStatus call and runs one trailing queued refresh after", async () => {
    let resolveFirstBranch: (branch: string) => void = () => {};
    invokeImpl = whenInvoke({
      get_git_branch: () => {
        if (branchCallCount() === 1) {
          return new Promise<string>((resolve) => {
            resolveFirstBranch = resolve;
          });
        }
        return Promise.resolve("main");
      },
      get_git_status: () => [],
      get_git_remote_info: () => EMPTY_REMOTE_INFO,
    });

    const { result } = renderHook(() => useGit("/ws"));

    // The mount effect already kicked off one refresh, in flight on the
    // first (unresolved) branch() call.
    expect(branchCallCount()).toBe(1);

    // A second, concurrent call must not start its own branch() request —
    // it should de-dupe onto the in-flight one and just mark "queued".
    let second: Promise<void> = Promise.resolve();
    act(() => {
      second = result.current.refreshGitStatus();
    });
    expect(branchCallCount()).toBe(1);

    // Resolve the first refresh. Its `.finally()` sees the queued flag and
    // immediately fires a second, real refresh — synchronously, within the
    // same microtask turn that settles `second`.
    await act(async () => {
      resolveFirstBranch("main");
      await second;
    });

    expect(branchCallCount()).toBe(2);
  });

  it("discards a stale in-flight refresh's results when the workspace changes mid-flight", async () => {
    let resolveStaleBranch: (branch: string) => void = () => {};
    let resolveFreshBranch: (branch: string) => void = () => {};
    invokeImpl = whenInvoke({
      get_git_branch: () => {
        if (branchCallCount() === 1) {
          // The workspace-a refresh: held open until we explicitly resolve it,
          // after the workspace has already switched to b.
          return new Promise<string>((resolve) => {
            resolveStaleBranch = resolve;
          });
        }
        // The workspace-b refresh: also held open, so we can observe the
        // state right after the stale result is discarded but before this
        // one lands — proving the guard itself (not just a later overwrite)
        // is what kept "main-a" from showing up.
        return new Promise<string>((resolve) => {
          resolveFreshBranch = resolve;
        });
      },
      get_git_status: () => [],
      get_git_remote_info: () => EMPTY_REMOTE_INFO,
    });

    const { result, rerender } = renderHook(({ root }) => useGit(root), {
      initialProps: { root: "/ws-a" },
    });

    // Mount effect's refresh for workspace a is in flight, holding on branch().
    expect(branchCallCount()).toBe(1);

    // Switch workspaces before workspace a's refresh resolves. This bumps
    // the generation counter and resets visible state; its own effect-driven
    // refreshGitStatus() call de-dupes onto the still-in-flight workspace-a
    // refresh (queuing) rather than issuing a second concurrent branch()
    // call yet.
    rerender({ root: "/ws-b" });
    expect(branchCallCount()).toBe(1);
    expect(result.current.currentBranch).toBe("");

    // Resolve workspace a's stale branch() call. The generation guard must
    // discard this result instead of setting currentBranch to "main-a" —
    // checked here, before workspace b's own refresh has resolved, so a
    // later legitimate overwrite can't mask a broken guard.
    await act(async () => {
      resolveStaleBranch("main-a");
      // Give the finally-triggered queued refresh (workspace b) a turn to
      // start and issue its own branch() call.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.currentBranch).toBe("");
    expect(branchCallCount()).toBe(2);

    // Now let workspace b's refresh land for real.
    await act(async () => {
      resolveFreshBranch("main-b");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.currentBranch).toBe("main-b");
  });
});
