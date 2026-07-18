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

function lastWriteArgs() {
  const calls = invokeCalls.filter((c) => c.name === "write_file");
  return calls[calls.length - 1]?.args as
    | { path: string; content: string; expectedMtime: number | null }
    | undefined;
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
      get_file_mtime: () => 1000,
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
      get_file_mtime: () => 1000,
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
      get_file_mtime: () => 1000,
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

  it("frontmatter writes are tracked so a blocking flush waits for them", async () => {
    let resolveWrite: () => void = () => {};
    const writeStarted = mock(() => {});
    invokeImpl = whenInvoke({
      read_file: () => "---\ntitle: Old\n---\nbody",
      get_file_mtime: () => 1000,
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

    // A property edit reads the body then issues a write. If that write bypassed
    // trackWrite (a direct commands.files.write), the blocking flush below would
    // not wait for it — the regression this guards against.
    act(() => {
      void result.current.handleFieldChange("title", "New");
    });
    await act(async () => {
      for (let i = 0; i < 10 && writeStarted.mock.calls.length === 0; i++) {
        await Promise.resolve();
      }
    });
    expect(writeStarted).toHaveBeenCalledTimes(1);

    // The blocking flush has no new pending markdown but must still wait for the
    // in-flight frontmatter write.
    let blockingResolved = false;
    const blocking = result.current.flushPendingSave().then(() => {
      blockingResolved = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(blockingResolved).toBe(false);

    await act(async () => {
      resolveWrite();
      await blocking;
    });
    expect(blockingResolved).toBe(true);
  });

  it("prompts (does not clobber) when the file changed on disk", async () => {
    invokeImpl = whenInvoke({
      read_file: () => "hello",
      get_file_mtime: () => 1000,
      // Simulate the Rust optimistic-concurrency guard rejecting the write.
      write_file: () => {
        throw new Error("EXTERNAL_CHANGE_CONFLICT");
      },
    });
    const showToast = mock((_: string) => {});
    const onConflict = mock(() => {});
    const { result } = renderHook(() => useFileEditor({ showToast, onConflict }));

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      result.current.handleEditorChange("my local edit");
    });

    // A forced flush attempts the write, which conflicts. The hook must surface
    // the prompt rather than treating it as a generic save failure.
    await act(async () => {
      await result.current.flushPendingSave().catch(() => {});
    });

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(result.current.conflictActive).toBe(true);
    // A conflict is not a save error — no error toast.
    expect(showToast).not.toHaveBeenCalled();
  });

  it("background flushes force-write and never open a conflict prompt", async () => {
    // Background flushes (switch/close/blur) clear pending state optimistically,
    // so they must bypass the mtime check rather than open a stale prompt.
    invokeImpl = whenInvoke({
      read_file: () => "hello",
      get_file_mtime: () => 1000,
      write_file: () => 2000,
    });
    const onConflict = mock(() => {});
    const { result } = renderHook(() =>
      useFileEditor({ showToast: mock((_: string) => {}), onConflict })
    );

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("edit");
    });
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
    });

    expect(lastWriteArgs()?.expectedMtime).toBeNull();
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("resolveConflict('reload') discards the local edit and re-reads disk", async () => {
    let diskContent = "original";
    invokeImpl = whenInvoke({
      read_file: () => diskContent,
      get_file_mtime: () => 1000,
      write_file: () => {
        throw new Error("EXTERNAL_CHANGE_CONFLICT");
      },
    });
    const { result } = renderHook(() =>
      useFileEditor({ showToast: mock((_: string) => {}), onConflict: mock(() => {}) })
    );

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("my local edit");
    });
    await act(async () => {
      await result.current.flushPendingSave().catch(() => {});
    });
    expect(result.current.conflictActive).toBe(true);

    diskContent = "external version";
    await act(async () => {
      await result.current.resolveConflict("reload");
    });

    expect(result.current.conflictActive).toBe(false);
    expect(result.current.fileContent).toBe("external version");
    expect(result.current.saveStatus).toBe("saved");
  });

  it("resolveConflict('overwrite') force-writes the pending edit", async () => {
    let conflict = true;
    invokeImpl = whenInvoke({
      read_file: () => "original",
      get_file_mtime: () => 1000,
      write_file: () => {
        if (conflict) throw new Error("EXTERNAL_CHANGE_CONFLICT");
        return 3000;
      },
    });
    const { result } = renderHook(() =>
      useFileEditor({ showToast: mock((_: string) => {}), onConflict: mock(() => {}) })
    );

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("my local edit");
    });
    await act(async () => {
      await result.current.flushPendingSave().catch(() => {});
    });
    expect(result.current.conflictActive).toBe(true);

    conflict = false;
    await act(async () => {
      await result.current.resolveConflict("overwrite");
    });

    const forced = lastWriteArgs();
    expect(forced?.expectedMtime).toBeNull();
    expect(forced?.content).toContain("my local edit");
    expect(result.current.conflictActive).toBe(false);
    expect(result.current.saveStatus).toBe("saved");
  });

  it("resolveConflict('dismiss') clears the prompt but keeps the edit unsaved", async () => {
    invokeImpl = whenInvoke({
      read_file: () => "original",
      get_file_mtime: () => 1000,
      write_file: () => {
        throw new Error("EXTERNAL_CHANGE_CONFLICT");
      },
    });
    const { result } = renderHook(() =>
      useFileEditor({ showToast: mock((_: string) => {}), onConflict: mock(() => {}) })
    );

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("my local edit");
    });
    await act(async () => {
      await result.current.flushPendingSave().catch(() => {});
    });
    expect(result.current.conflictActive).toBe(true);

    await act(async () => {
      await result.current.resolveConflict("dismiss");
    });

    expect(result.current.conflictActive).toBe(false);
    expect(result.current.saveStatus).toBe("unsaved");
    expect(result.current.pendingMarkdownRef.current).toBe("my local edit");
  });

  it("serializes writes per file: a queued write starts only after the previous settles", async () => {
    let resolveFirst: (mtime: number) => void = () => {};
    let writeCount = 0;
    invokeImpl = whenInvoke({
      read_file: () => "body",
      get_file_mtime: () => 1000,
      write_file: () => {
        writeCount += 1;
        if (writeCount === 1) {
          return new Promise<number>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return 3000;
      },
    });
    const { result } = renderHook(() => useFileEditor({ showToast: mock((_: string) => {}) }));

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("edit one");
    });
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
    });
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(1);

    // A frontmatter edit while the first write is still in flight must queue
    // behind it, not race it.
    act(() => {
      void result.current.handleFieldChange("title", "New");
    });
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(1);

    await act(async () => {
      resolveFirst(2000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(2);
    // The queued write composed its payload at start time, so it carries the
    // mtime token returned by the first write — not the stale token from when
    // it was queued (which would trip the conflict check against ourselves).
    expect(lastWriteArgs()?.expectedMtime).toBe(2000);
  });

  it("a failed background flush restores the pending edit for a later retry", async () => {
    let failWrites = true;
    invokeImpl = whenInvoke({
      read_file: () => "hello",
      get_file_mtime: () => 1000,
      write_file: () => {
        if (failWrites) throw new Error("disk full");
        return 2000;
      },
    });
    const showToast = mock((_: string) => {});
    const { result } = renderHook(() => useFileEditor({ showToast }));

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("precious edit");
    });
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    // The failure was surfaced and the edit restored — not silently dropped
    // while the status dot claims "saved".
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(result.current.pendingMarkdownRef.current).toBe("precious edit");
    expect(result.current.saveStatus).toBe("unsaved");

    failWrites = false;
    await act(async () => {
      await result.current.flushPendingSave();
    });
    const writes = invokeCalls.filter((c) => c.name === "write_file");
    expect(writes).toHaveLength(2);
    expect((writes[1]?.args as { content: string }).content).toBe("precious edit");
    expect(result.current.saveStatus).toBe("saved");
  });
});
