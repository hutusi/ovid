import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FileNode } from "./types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: localT,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

// ── Tauri seam mock ────────────────────────────────────────────────────────
//
// useFileEditor goes through commands.files.* -> invokeCmd -> @tauri-apps/
// api/core's invoke. Pattern follows useWorkspace.test.ts. See ADR 0012.

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
      throw new Error(`useFileEditor test issued unmocked invoke: ${name}`);
    }
    return handler(args);
  };
}

const { useFileEditor } = await import("./useFileEditor");

const NODE: FileNode = { name: "draft.md", path: "/ws/draft.md", isDirectory: false };

function writeArgs(index: number) {
  const call = invokeCalls.filter((c) => c.name === "write_file")[index];
  return call?.args as { path: string; content: string } | undefined;
}

describe("useFileEditor — save flush semantics", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  beforeEach(() => {
    invokeCalls.length = 0;
  });

  it("debounce coalescing: rapid edits before a flush produce one write with the latest content", async () => {
    invokeImpl = whenInvoke({
      read_file: () => "",
      write_file: () => undefined,
    });
    const showToast = mock((_: string) => {});
    const { result } = renderHook(() => useFileEditor({ showToast }));

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      result.current.handleEditorChange("draft 1");
      result.current.handleEditorChange("draft 2");
      result.current.handleEditorChange("draft 3");
    });

    // None of the three edits should have written yet — each call resets the
    // same debounce timer rather than scheduling its own write.
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(0);

    await act(async () => {
      await result.current.flushPendingSave();
    });

    const writes = invokeCalls.filter((c) => c.name === "write_file");
    expect(writes).toHaveLength(1);
    expect(writeArgs(0)?.content).toBe("draft 3");
  });

  it("forced flush pre-empts the debounce: content is written immediately, not after the delay", async () => {
    invokeImpl = whenInvoke({
      read_file: () => "",
      write_file: () => undefined,
    });
    const showToast = mock((_: string) => {});
    const { result } = renderHook(() => useFileEditor({ showToast }));

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      result.current.handleEditorChange("urgent edit");
    });
    expect(result.current.saveStatus).toBe("unsaved");
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(0);

    await act(async () => {
      await result.current.flushPendingSave();
    });

    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(1);
    expect(writeArgs(0)?.content).toBe("urgent edit");
    expect(result.current.saveStatus).toBe("saved");
  });

  it("blocking flush waits for a write already in flight from a prior background flush", async () => {
    let resolveWrite: () => void = () => {};
    const writeStarted = mock(() => {});
    invokeImpl = whenInvoke({
      read_file: () => "",
      write_file: () => {
        writeStarted();
        return new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
      },
    });
    const showToast = mock((_: string) => {});
    const { result } = renderHook(() => useFileEditor({ showToast }));

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      result.current.handleEditorChange("in flight content");
    });

    // Background flush kicks off the write but doesn't await it — it clears
    // the pending-markdown ref optimistically and returns immediately.
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
    });
    expect(writeStarted).toHaveBeenCalledTimes(1);
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(1);

    // A second, blocking flush has no new content to write, but must still
    // wait for the still-in-flight write from the background flush above
    // rather than resolving immediately.
    let blockingFlushResolved = false;
    const blockingFlush = result.current.flushPendingSave().then(() => {
      blockingFlushResolved = true;
    });

    // Give pending microtasks a chance to run; the blocking flush must still
    // be waiting on the unresolved write.
    await act(async () => {
      await Promise.resolve();
    });
    expect(blockingFlushResolved).toBe(false);

    await act(async () => {
      resolveWrite();
      await blockingFlush;
    });

    expect(blockingFlushResolved).toBe(true);
    // No second write was issued — the blocking flush only awaited the
    // existing in-flight one.
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(1);
  });
});
