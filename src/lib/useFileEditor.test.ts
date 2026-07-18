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
    // The editor reads via read_file_versioned (content + version token as one
    // snapshot). Tests still describe the disk with the simpler read_file +
    // get_file_mtime handlers, so synthesize the versioned result from them
    // (the token value is opaque) unless a test overrides read_file_versioned.
    if (name === "read_file_versioned" && !handlers.read_file_versioned) {
      const content = handlers.read_file?.(args);
      // The token is an opaque string (a content hash); tests still describe it
      // with the simpler get_file_mtime handler's value, stringified.
      const version = String(handlers.get_file_mtime?.(args) ?? 0);
      return { content, version };
    }
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
    | { path: string; content: string; expectedVersion: string | null }
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

    // A property edit issues a (debounced) write. If that write bypassed the
    // tracked path (a direct commands.files.write), the blocking flush below
    // would not wait for it — the regression this guards against.
    act(() => {
      void result.current.handleFieldChange("title", "New");
    });
    // The field write sits behind a debounce; a background flush pre-empts the
    // timer and dispatches it without awaiting.
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
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

  it("a hide-flush conflict restores the edit and prompts on the still-selected file", async () => {
    // The window-hide flush is the only fire-and-forget flush left, and it
    // never changes the selection — so it carries the normal mtime token (no
    // force) and a conflict can be resolved against the file on screen.
    invokeImpl = whenInvoke({
      read_file: () => "hello",
      get_file_mtime: () => 1000,
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
      result.current.handleEditorChange("edit");
    });
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(lastWriteArgs()?.expectedVersion).toBe("1000");
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(result.current.conflictActive).toBe(true);
    expect(result.current.pendingMarkdownRef.current).toBe("edit");
    // A conflict is not a save error — no error toast.
    expect(showToast).not.toHaveBeenCalled();
  });

  it("switching files aborts when the outgoing save fails, keeping the edit and selection", async () => {
    const OTHER: FileNode = { name: "other.md", path: "/ws/other.md", isDirectory: false };
    let failWrites = false;
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

    failWrites = true;
    let opened = true;
    await act(async () => {
      opened = await result.current.handleSelectFile(OTHER);
    });

    // The switch aborted: still on the original file, edit intact, failure
    // surfaced — and the other file was never read.
    expect(opened).toBe(false);
    expect(result.current.selectedPathRef.current).toBe(NODE.path);
    expect(result.current.pendingMarkdownRef.current).toBe("precious edit");
    expect(result.current.saveStatus).toBe("unsaved");
    expect(showToast).toHaveBeenCalledTimes(1);
    // Only the initial NODE open read from disk — OTHER was never read.
    expect(invokeCalls.filter((c) => c.name === "read_file_versioned")).toHaveLength(1);
  });

  it("switching files aborts and prompts when the outgoing save conflicts", async () => {
    const OTHER: FileNode = { name: "other.md", path: "/ws/other.md", isDirectory: false };
    let conflict = false;
    invokeImpl = whenInvoke({
      read_file: () => "hello",
      get_file_mtime: () => 1000,
      write_file: () => {
        if (conflict) throw new Error("EXTERNAL_CHANGE_CONFLICT");
        return 2000;
      },
    });
    const onConflict = mock(() => {});
    const { result } = renderHook(() =>
      useFileEditor({ showToast: mock((_: string) => {}), onConflict })
    );

    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    act(() => {
      result.current.handleEditorChange("local edit");
    });

    conflict = true;
    let opened = true;
    await act(async () => {
      opened = await result.current.handleSelectFile(OTHER);
    });

    // The conflict fired while the original file was still selected, so the
    // prompt targets the right file and "overwrite" has its retry payload.
    expect(opened).toBe(false);
    expect(result.current.selectedPathRef.current).toBe(NODE.path);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(result.current.conflictActive).toBe(true);
    expect(result.current.pendingMarkdownRef.current).toBe("local edit");
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
        return "3000";
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
    expect(forced?.expectedVersion).toBeNull();
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
    let resolveFirst: (token: string) => void = () => {};
    let writeCount = 0;
    invokeImpl = whenInvoke({
      read_file: () => "body",
      get_file_mtime: () => 1000,
      write_file: () => {
        writeCount += 1;
        if (writeCount === 1) {
          return new Promise<string>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return "3000";
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
    // behind it, not race it. (The background flush pre-empts the field
    // debounce and dispatches the write.)
    act(() => {
      void result.current.handleFieldChange("title", "New");
    });
    await act(async () => {
      await result.current.flushPendingSave({ mode: "background" });
    });
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(1);

    await act(async () => {
      resolveFirst("2000");
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(2);
    // The queued write composed its payload at start time, so it carries the
    // mtime token returned by the first write — not the stale token from when
    // it was queued (which would trip the conflict check against ourselves) —
    // and the body the first write actually landed, not a stale snapshot.
    expect(lastWriteArgs()?.expectedVersion).toBe("2000");
    expect(lastWriteArgs()?.content).toContain("title: New");
    expect(lastWriteArgs()?.content).toContain("edit one");
  });

  it("field edits are debounced: rapid property changes coalesce into one write", async () => {
    invokeImpl = whenInvoke({
      read_file: () => "---\ntitle: Old\n---\nbody",
      get_file_mtime: () => 1000,
      write_file: () => 2000,
    });
    const { result } = renderHook(() => useFileEditor({ showToast: mock((_: string) => {}) }));
    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      void result.current.handleFieldChange("title", "A");
    });
    act(() => {
      void result.current.handleFieldChange("title", "AB");
    });
    act(() => {
      void result.current.handleFieldChange("title", "ABC");
    });
    // No write yet — each keystroke resets the field debounce — but the panel
    // reflects the edit immediately.
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(0);
    expect(result.current.parsedFrontmatter.title).toBe("ABC");

    await act(async () => {
      await result.current.flushPendingSave();
    });
    const writes = invokeCalls.filter((c) => c.name === "write_file");
    expect(writes).toHaveLength(1);
    const content = (writes[0]?.args as { content: string }).content;
    expect(content).toContain("title: ABC");
    expect(content).toContain("body");
  });

  it("a failed field write reverts the panel to the last saved frontmatter", async () => {
    invokeImpl = whenInvoke({
      read_file: () => "---\ntitle: Old\n---\nbody",
      get_file_mtime: () => 1000,
      write_file: () => {
        throw new Error("disk full");
      },
    });
    const showToast = mock((_: string) => {});
    const { result } = renderHook(() => useFileEditor({ showToast }));
    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      void result.current.handleFieldChange("title", "New");
    });
    expect(result.current.parsedFrontmatter.title).toBe("New");

    await act(async () => {
      await result.current.flushPendingSave().catch(() => {});
    });

    // The failure was surfaced and the panel no longer shows a value that was
    // never persisted.
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(result.current.parsedFrontmatter.title).toBe("Old");
  });

  it("a property edit marks the file unsaved immediately and saved after the write", async () => {
    // Guards the conflict-protection hole: while a property edit is pending,
    // saveStatus must be "unsaved" so the revision poll won't reload (and then
    // silently overwrite an external change with the stale field write).
    invokeImpl = whenInvoke({
      read_file: () => "---\ntitle: Old\n---\nbody",
      get_file_mtime: () => 1000,
      write_file: () => 2000,
    });
    const { result } = renderHook(() => useFileEditor({ showToast: mock((_: string) => {}) }));
    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });
    expect(result.current.saveStatus).toBe("saved");

    act(() => {
      void result.current.handleFieldChange("title", "New");
    });
    // Unsaved the instant the edit lands, before the debounce fires.
    expect(result.current.saveStatus).toBe("unsaved");

    await act(async () => {
      await result.current.flushPendingSave();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("reloading from disk cancels a pending field write so it can't overwrite the reload", async () => {
    let diskTitle = "Old";
    invokeImpl = whenInvoke({
      read_file: () => `---\ntitle: ${diskTitle}\n---\nbody`,
      get_file_mtime: () => 1000,
      write_file: () => 2000,
    });
    const { result } = renderHook(() => useFileEditor({ showToast: mock((_: string) => {}) }));
    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    // A property edit is pending in the debounce window...
    act(() => {
      void result.current.handleFieldChange("title", "Local");
    });
    const writesBefore = invokeCalls.filter((c) => c.name === "write_file").length;

    // ...when an external change triggers a reload of the file.
    diskTitle = "External";
    await act(async () => {
      await result.current.reloadSelectedFileFromDisk(NODE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    // The pending field write was cancelled — no write fired after the reload,
    // so the external frontmatter change survives.
    expect(invokeCalls.filter((c) => c.name === "write_file")).toHaveLength(writesBefore);
    expect(result.current.parsedFrontmatter.title).toBe("External");
  });

  it("opens via a versioned read, seeding a real mtime the next save carries", async () => {
    // read_file_versioned returns content + a consistent mtime as one snapshot;
    // the next save must carry that mtime, not null (which would force-write and
    // bypass conflict detection).
    invokeImpl = whenInvoke({
      read_file_versioned: () => ({ content: "hello", version: "4242" }),
      write_file: () => "5000",
    });
    const { result } = renderHook(() => useFileEditor({ showToast: mock((_: string) => {}) }));
    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    act(() => {
      result.current.handleEditorChange("edited");
    });
    await act(async () => {
      await result.current.flushPendingSave();
    });

    expect(lastWriteArgs()?.expectedVersion).toBe("4242");
  });

  it("a failed field write keeps a newer field edit instead of reverting it", async () => {
    // Field write A is in flight and fails; edit B was made meanwhile. B must
    // survive on screen (and reach disk via its own flush), not be reverted to
    // the last-saved value.
    let failNext = false;
    invokeImpl = whenInvoke({
      read_file: () => "---\ntitle: Old\n---\nbody",
      get_file_mtime: () => 1000,
      write_file: () => {
        if (failNext) throw new Error("disk full");
        return 2000;
      },
    });
    const showToast = mock((_: string) => {});
    const { result } = renderHook(() => useFileEditor({ showToast }));
    await act(async () => {
      await result.current.handleSelectFile(NODE);
    });

    // Edit A, dispatch its write (which will fail), then edit B before A rejects.
    act(() => {
      void result.current.handleFieldChange("title", "A");
    });
    failNext = true;
    const flushA = result.current.flushPendingSave();
    act(() => {
      void result.current.handleFieldChange("title", "B");
    });
    await act(async () => {
      await flushA.catch(() => {});
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    // B is preserved (not reverted to "Old"), and the file stays unsaved so
    // B's own flush still persists it.
    expect(result.current.parsedFrontmatter.title).toBe("B");
    expect(result.current.saveStatus).toBe("unsaved");
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
