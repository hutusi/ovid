import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { SIDEBAR_EXPANDED_KEY } from "./sidebarExpansion";
import type { FileNode } from "./types";
import { useSidebarExpansion } from "./useSidebarExpansion";

function makeDir(path: string, children: FileNode[] = []): FileNode {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] ?? path,
    path,
    isDirectory: true,
    children,
  };
}

function makeFile(path: string): FileNode {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] ?? path,
    path,
    isDirectory: false,
    extension: ".md",
  };
}

describe("useSidebarExpansion — bucket-aware defaults", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  afterEach(() => {
    localStorage.clear();
  });

  it("collapses top-level buckets by default when isBucket marks them", () => {
    const notes = makeDir("/ws/content/notes", [makeFile("/ws/content/notes/a.md")]);
    const { result } = renderHook(() =>
      useSidebarExpansion({
        workspaceKey: "/ws",
        tree: [notes],
        selectedPath: null,
        isBucket: (_node, depth) => depth === 0,
      })
    );

    expect(result.current.isExpanded(notes, 0)).toBe(false);
  });

  it("leaves top-level rows expanded when no bucket predicate is supplied", () => {
    const root = makeDir("/ws/posts", [makeFile("/ws/posts/hello.md")]);
    const { result } = renderHook(() =>
      useSidebarExpansion({ workspaceKey: "/ws", tree: [root], selectedPath: null })
    );

    expect(result.current.isExpanded(root, 0)).toBe(true);
  });

  it("auto-expands a bucket when a file inside it becomes selected", () => {
    const child = makeFile("/ws/content/notes/a.md");
    const notes = makeDir("/ws/content/notes", [child]);
    const { result } = renderHook(() =>
      useSidebarExpansion({
        workspaceKey: "/ws",
        tree: [notes],
        selectedPath: child.path,
        isBucket: (_node, depth) => depth === 0,
      })
    );

    expect(result.current.isExpanded(notes, 0)).toBe(true);
  });

  it("setAllBuckets opens or closes every supplied bucket path", () => {
    const notes = makeDir("/ws/content/notes");
    const books = makeDir("/ws/content/books");
    const { result } = renderHook(() =>
      useSidebarExpansion({
        workspaceKey: "/ws",
        tree: [notes, books],
        selectedPath: null,
        isBucket: (_node, depth) => depth === 0,
      })
    );

    act(() => {
      result.current.setAllBuckets(true, [notes.path, books.path]);
    });
    expect(result.current.isExpanded(notes, 0)).toBe(true);
    expect(result.current.isExpanded(books, 0)).toBe(true);

    act(() => {
      result.current.setAllBuckets(false, [notes.path, books.path]);
    });
    expect(result.current.isExpanded(notes, 0)).toBe(false);
    expect(result.current.isExpanded(books, 0)).toBe(false);
  });

  it("supports the mixed-state contract the Sidebar's toggle relies on", () => {
    // The header expand-all/collapse-all toggle in Sidebar.tsx derives its
    // state by asking "are *every* bucket expanded?" — anything less (including
    // a mixed state where one bucket is open and others are closed) must read
    // as "not all expanded" so the toggle still offers to expand the rest
    // instead of collapsing the ones the user has just opened.
    const notes = makeDir("/ws/content/notes");
    const books = makeDir("/ws/content/books");
    const { result } = renderHook(() =>
      useSidebarExpansion({
        workspaceKey: "/ws",
        tree: [notes, books],
        selectedPath: null,
        isBucket: (_node, depth) => depth === 0,
      })
    );

    act(() => {
      result.current.setAllBuckets(true, [notes.path]);
    });

    expect([notes, books].every((n) => result.current.isExpanded(n, 0))).toBe(false);
  });

  it("persists bucket expansion under the per-workspace storage key", () => {
    const notes = makeDir("/ws/content/notes");
    const { result } = renderHook(() =>
      useSidebarExpansion({
        workspaceKey: "/ws",
        tree: [notes],
        selectedPath: null,
        isBucket: (_node, depth) => depth === 0,
      })
    );

    act(() => {
      result.current.setAllBuckets(true, [notes.path]);
    });
    const raw = localStorage.getItem(`${SIDEBAR_EXPANDED_KEY}:/ws`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? "{}")).toEqual({ [notes.path]: true });
  });
});
