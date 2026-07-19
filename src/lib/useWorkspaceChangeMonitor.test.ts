import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { WorkspaceFsChange } from "./commands/generated/WorkspaceFsChange";
import type { FileNode } from "./types";

type InvokeImpl = (name: string, args: unknown) => Promise<unknown>;
type TauriEvent = { payload: WorkspaceFsChange };

let invokeImpl: InvokeImpl = () => Promise.reject(new Error("unmocked invoke"));
const invokeCalls: string[] = [];
let fsChangeHandler: ((event: TauriEvent) => void) | null = null;
let unlistenCalls = 0;
let unmountHook: (() => void) | null = null;

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args?: unknown) => {
    invokeCalls.push(name);
    return invokeImpl(name, args);
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: (event: TauriEvent) => void) => {
    if (name === "workspace-fs-change") fsChangeHandler = handler;
    return Promise.resolve(() => {
      unlistenCalls += 1;
      fsChangeHandler = null;
    });
  },
}));

const { useWorkspaceChangeMonitor, WORKSPACE_EVENT_DEBOUNCE_MS, WORKSPACE_REVISION_FALLBACK_MS } =
  await import("./useWorkspaceChangeMonitor");

const activeFile: FileNode = {
  name: "note.md",
  path: "/workspace/note.md",
  isDirectory: false,
};

function fireChange(root = "/workspace") {
  fsChangeHandler?.({
    payload: {
      workspaceRoot: root,
      paths: [`${root}/note.md`],
      needsRescan: false,
    },
  });
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    workspaceRootPath: "/workspace",
    refreshTree: mock(() => Promise.resolve([activeFile])),
    reloadSelectedFileFromDisk: mock(() => Promise.resolve(true)),
    handleCloseFile: mock(() => Promise.resolve(true)),
    refreshGitStatus: mock(() => {}),
    showToast: mock(() => {}),
    t: (key: string) => key,
    lastSavedContentRef: { current: null },
    selectedFileRef: { current: activeFile },
    saveStatusRef: { current: "saved" as const },
    isGitRepoRef: { current: false },
    ...overrides,
  };
}

describe("useWorkspaceChangeMonitor", () => {
  beforeAll(registerHappyDom);
  afterEach(() => {
    unmountHook?.();
    unmountHook = null;
  });
  afterAll(unregisterHappyDom);

  beforeEach(() => {
    invokeCalls.length = 0;
    fsChangeHandler = null;
    unlistenCalls = 0;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  function renderMonitor(opts: ReturnType<typeof options>) {
    const rendered = renderHook(() => useWorkspaceChangeMonitor(opts));
    unmountHook = rendered.unmount;
    return rendered;
  }

  it("coalesces a native event burst into one revision and refresh cycle", async () => {
    const revisions = ["r1", "r2"];
    invokeImpl = async (name) => {
      if (name !== "get_workspace_revision") throw new Error(`unexpected command: ${name}`);
      return revisions.shift() ?? "r2";
    };
    const opts = options();
    renderMonitor(opts);

    await waitFor(() => expect(fsChangeHandler).not.toBeNull());
    await waitFor(() =>
      expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(1)
    );
    fireChange();
    fireChange();
    fireChange();

    await waitFor(
      () => expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(2),
      { timeout: WORKSPACE_EVENT_DEBOUNCE_MS + 1_000 }
    );
    expect(opts.refreshTree).toHaveBeenCalledTimes(1);
    expect(opts.reloadSelectedFileFromDisk).toHaveBeenCalledTimes(1);
  });

  it("acknowledges Ovid's own active-file save without scanning the workspace", async () => {
    invokeImpl = async (name) => {
      if (name === "get_workspace_revision") return "r1";
      if (name === "read_file") return "saved by Ovid";
      throw new Error(`unexpected command: ${name}`);
    };
    const opts = options({
      lastSavedContentRef: { current: "saved by Ovid" },
    });
    renderMonitor(opts);
    await waitFor(() => expect(fsChangeHandler).not.toBeNull());
    await waitFor(() =>
      expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(1)
    );

    fireChange();
    await waitFor(
      () => expect(invokeCalls.filter((name) => name === "read_file")).toHaveLength(1),
      { timeout: WORKSPACE_EVENT_DEBOUNCE_MS + 1_000 }
    );
    expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(1);
    expect(opts.refreshTree).not.toHaveBeenCalled();
    expect(opts.reloadSelectedFileFromDisk).not.toHaveBeenCalled();
  });

  it("refreshes the tree for a native structural event even when the revision is unchanged", async () => {
    // A non-Markdown asset (or dotfile) create/remove doesn't move the
    // Markdown-only revision, but the native event must still refresh Files mode.
    invokeImpl = async (name) => {
      if (name === "get_workspace_revision") return "r1";
      throw new Error(`unexpected command: ${name}`);
    };
    const opts = options();
    renderMonitor(opts);
    await waitFor(() => expect(fsChangeHandler).not.toBeNull());
    await waitFor(() =>
      expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(1)
    );

    fsChangeHandler?.({
      payload: {
        workspaceRoot: "/workspace",
        paths: ["/workspace/assets/photo.png"],
        needsRescan: false,
      },
    });

    await waitFor(() => expect(opts.refreshTree).toHaveBeenCalledTimes(1), {
      timeout: WORKSPACE_EVENT_DEBOUNCE_MS + 1_000,
    });
    // Active Markdown file can't have changed (its content is in the revision).
    expect(opts.reloadSelectedFileFromDisk).not.toHaveBeenCalled();
  });

  it("does not refresh on a fallback poll when the revision is unchanged", async () => {
    // Without a native event hint, an unchanged revision must stay a no-op.
    invokeImpl = async () => "r1";
    const opts = options();
    renderMonitor(opts);
    await waitFor(() => expect(fsChangeHandler).not.toBeNull());
    await waitFor(() =>
      expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(1)
    );

    document.dispatchEvent(new window.Event("visibilitychange"));
    await waitFor(() =>
      expect(invokeCalls.filter((name) => name === "get_workspace_revision")).toHaveLength(2)
    );
    expect(opts.refreshTree).not.toHaveBeenCalled();
  });

  it("ignores stale-workspace events and catches up when visibility returns", async () => {
    const revisions = ["r1", "r2"];
    invokeImpl = async () => revisions.shift() ?? "r2";
    const opts = options();
    renderMonitor(opts);
    await waitFor(() => expect(fsChangeHandler).not.toBeNull());
    await waitFor(() => expect(invokeCalls).toHaveLength(1));

    fireChange("/other");
    await new Promise((resolve) => setTimeout(resolve, WORKSPACE_EVENT_DEBOUNCE_MS + 30));
    expect(invokeCalls).toHaveLength(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireChange();
    await new Promise((resolve) => setTimeout(resolve, WORKSPACE_EVENT_DEBOUNCE_MS + 30));
    expect(invokeCalls).toHaveLength(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new window.Event("visibilitychange"));
    await waitFor(() => expect(invokeCalls).toHaveLength(2));
    expect(opts.refreshTree).toHaveBeenCalledTimes(1);
  });

  it("installs the slow fallback interval and cleans up the native listener", async () => {
    invokeImpl = async () => "r1";
    const realSetInterval = window.setInterval.bind(window);
    const realClearInterval = window.clearInterval.bind(window);
    let fallback: (() => void) | null = null;
    let intervalDelay = 0;
    const clearIntervalMock = mock(() => {});
    window.setInterval = ((handler: TimerHandler, timeout?: number) => {
      if (timeout === WORKSPACE_REVISION_FALLBACK_MS) {
        fallback = handler as () => void;
        intervalDelay = timeout;
        return 99;
      }
      return realSetInterval(handler, timeout);
    }) as typeof window.setInterval;
    window.clearInterval = clearIntervalMock as typeof window.clearInterval;

    try {
      const { unmount } = renderMonitor(options());
      await waitFor(() => expect(fsChangeHandler).not.toBeNull());
      await waitFor(() => expect(invokeCalls).toHaveLength(1));
      expect(intervalDelay).toBe(WORKSPACE_REVISION_FALLBACK_MS);

      const triggerFallback = fallback as (() => void) | null;
      triggerFallback?.();
      await waitFor(() => expect(invokeCalls).toHaveLength(2));

      unmount();
      unmountHook = null;
      await waitFor(() => expect(unlistenCalls).toBe(1));
      expect(clearIntervalMock).toHaveBeenCalledWith(99);
    } finally {
      window.setInterval = realSetInterval;
      window.clearInterval = realClearInterval;
    }
  });
});
