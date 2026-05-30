import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";
import {
  selectionAfterRename,
  selectionShouldCloseAfterRemove,
  useEditorSession,
} from "./useEditorSession";

function makeFile(path: string): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    isDirectory: false,
    extension: ".md",
  };
}

describe("selectionAfterRename", () => {
  it("returns null when nothing is selected", () => {
    expect(selectionAfterRename(null, "/a/b.md", "/a/c.md")).toBeNull();
  });

  it("returns null when the rename doesn't touch the selected path", () => {
    const sel = makeFile("/workspace/posts/keep.md");
    expect(
      selectionAfterRename(sel, "/workspace/posts/other.md", "/workspace/posts/renamed.md")
    ).toBeNull();
  });

  it("rewrites to the new path when the selected file itself is renamed", () => {
    const sel = makeFile("/workspace/posts/hello.md");
    expect(
      selectionAfterRename(sel, "/workspace/posts/hello.md", "/workspace/posts/renamed.md")
    ).toBe("/workspace/posts/renamed.md");
  });

  it("rewrites the suffix when the selected file lives under a renamed folder", () => {
    const sel = makeFile("/workspace/posts/hello/index.md");
    expect(selectionAfterRename(sel, "/workspace/posts/hello", "/workspace/posts/renamed")).toBe(
      "/workspace/posts/renamed/index.md"
    );
  });

  it("does not match a sibling whose name is a prefix (no trailing slash)", () => {
    const sel = makeFile("/workspace/posts/hello-world.md");
    // Renaming "/workspace/posts/hello" must not affect "/workspace/posts/hello-world.md"
    expect(
      selectionAfterRename(sel, "/workspace/posts/hello", "/workspace/posts/renamed")
    ).toBeNull();
  });
});

describe("selectionShouldCloseAfterRemove", () => {
  it("returns false when nothing is selected", () => {
    expect(selectionShouldCloseAfterRemove(null, "/a/b.md")).toBe(false);
  });

  it("returns true when the selected file itself is removed", () => {
    const sel = makeFile("/workspace/posts/hello.md");
    expect(selectionShouldCloseAfterRemove(sel, "/workspace/posts/hello.md")).toBe(true);
  });

  it("returns true when the selected file lives under a removed folder", () => {
    const sel = makeFile("/workspace/posts/hello/index.md");
    expect(selectionShouldCloseAfterRemove(sel, "/workspace/posts/hello")).toBe(true);
  });

  it("returns false when an unrelated file is removed", () => {
    const sel = makeFile("/workspace/posts/keep.md");
    expect(selectionShouldCloseAfterRemove(sel, "/workspace/posts/other.md")).toBe(false);
  });

  it("does not match a sibling whose name is a prefix of the removed path", () => {
    const sel = makeFile("/workspace/posts/hello-world.md");
    expect(selectionShouldCloseAfterRemove(sel, "/workspace/posts/hello")).toBe(false);
  });
});

// ── Hook orchestration ─────────────────────────────────────────────────────
//
// The five integration actions on useEditorSession aren't pure — they
// dispatch into composed hooks (useOpenTabs, useRecentFiles) and into a
// caller-supplied FileEditorHandle. We render the hook via
// @testing-library/react (see ADR 0012), pass a spy FileEditorHandle, and
// assert on the spy + on the hook's returned state.

function makeFlatFile(node: FileNode): FlatFile {
  return { node, displayName: node.name, relativePath: node.path };
}

interface FakeFileEditor {
  selectedFile: FileNode | null;
  selectedPathRef: { current: string | null };
  setSelectedFile: ReturnType<typeof mock>;
  handleSelectFile: ReturnType<typeof mock>;
  handleCloseFile: ReturnType<typeof mock>;
}

function makeFakeFileEditor(selected: FileNode | null = null): FakeFileEditor {
  return {
    selectedFile: selected,
    selectedPathRef: { current: selected?.path ?? null },
    setSelectedFile: mock((_: FileNode | null) => {}),
    handleSelectFile: mock((_: FileNode) => Promise.resolve()),
    handleCloseFile: mock(() => Promise.resolve()),
  };
}

describe("useEditorSession orchestration", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);
  beforeEach(() => {
    localStorage.clear();
  });

  it("openFile selects, pushes to recents, and opens a tab", async () => {
    const node = makeFile("/ws/posts/hello.md");
    const fileEditor = makeFakeFileEditor();
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [makeFlatFile(node)],
      })
    );

    await act(async () => {
      await result.current.openFile(node);
    });

    expect(fileEditor.handleSelectFile).toHaveBeenCalledWith(node);
    expect(result.current.tabs).toContain(node.path);
    expect(result.current.recentFiles[0]?.path).toBe(node.path);
  });

  it("openByPath routes a known path through openFile", async () => {
    const node = makeFile("/ws/posts/hello.md");
    const fileEditor = makeFakeFileEditor();
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [makeFlatFile(node)],
      })
    );

    await act(async () => {
      await result.current.openByPath(node.path);
    });

    expect(fileEditor.handleSelectFile).toHaveBeenCalledTimes(1);
    expect(fileEditor.handleSelectFile.mock.calls[0]?.[0]).toMatchObject({ path: node.path });
    expect(result.current.tabs).toContain(node.path);
  });

  it("openByPath synthesises a node when the path is not in flatFiles", async () => {
    // Recents/tabs can outlive the workspace state during fast renames or
    // delete-undo — the fallback synth node keeps the editor pointable.
    const fileEditor = makeFakeFileEditor();
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [],
      })
    );

    await act(async () => {
      await result.current.openByPath("/ws/posts/missing.md");
    });

    expect(fileEditor.handleSelectFile).toHaveBeenCalledTimes(1);
    expect(fileEditor.handleSelectFile.mock.calls[0]?.[0]).toMatchObject({
      path: "/ws/posts/missing.md",
    });
    expect(result.current.tabs).toContain("/ws/posts/missing.md");
  });

  it("closeActive advances to a neighbour tab when one exists", async () => {
    const a = makeFile("/ws/posts/a.md");
    const b = makeFile("/ws/posts/b.md");
    const fileEditor = makeFakeFileEditor(b);
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [makeFlatFile(a), makeFlatFile(b)],
      })
    );

    // Open both tabs; b is the active one.
    await act(async () => {
      await result.current.openFile(a);
      await result.current.openFile(b);
    });

    act(() => {
      result.current.closeActive();
    });

    expect(result.current.tabs).not.toContain(b.path);
    // The hook routes to the neighbour via openByPath -> handleSelectFile,
    // which means handleCloseFile is NOT called (neighbour takeover).
    expect(fileEditor.handleCloseFile).not.toHaveBeenCalled();
  });

  it("closeActive falls back to handleCloseFile when no tab neighbour exists", async () => {
    const sel = makeFile("/ws/posts/only.md");
    const fileEditor = makeFakeFileEditor(sel);
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [makeFlatFile(sel)],
      })
    );

    // Don't open any tab; selectedFile.path is not in tabs.
    act(() => {
      result.current.closeActive();
    });

    expect(fileEditor.handleCloseFile).toHaveBeenCalledTimes(1);
  });

  it("notifyPathRenamed updates tabs, recents, and the active selection", async () => {
    const node = makeFile("/ws/posts/old.md");
    const fileEditor = makeFakeFileEditor(node);
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [makeFlatFile(node)],
      })
    );

    await act(async () => {
      await result.current.openFile(node);
    });

    act(() => {
      result.current.notifyPathRenamed("/ws/posts/old.md", "/ws/posts/new.md");
    });

    expect(result.current.tabs).toContain("/ws/posts/new.md");
    expect(result.current.tabs).not.toContain("/ws/posts/old.md");
    expect(result.current.recentFiles[0]?.path).toBe("/ws/posts/new.md");
    expect(fileEditor.setSelectedFile).toHaveBeenCalled();
    expect(fileEditor.selectedPathRef.current).toBe("/ws/posts/new.md");
  });

  it("notifyPathRemoved drops tab + recent and closes the editor when active", async () => {
    const node = makeFile("/ws/posts/hello.md");
    const fileEditor = makeFakeFileEditor(node);
    const { result } = renderHook(() =>
      useEditorSession({
        fileEditor,
        workspaceRoot: "ws",
        workspaceRootPath: "/ws",
        flatFiles: [makeFlatFile(node)],
      })
    );

    await act(async () => {
      await result.current.openFile(node);
    });

    await act(async () => {
      await result.current.notifyPathRemoved("/ws/posts/hello.md");
    });

    expect(result.current.tabs).not.toContain("/ws/posts/hello.md");
    expect(result.current.recentFiles.find((r) => r.path === "/ws/posts/hello.md")).toBeUndefined();
    expect(fileEditor.handleCloseFile).toHaveBeenCalledTimes(1);
  });
});
