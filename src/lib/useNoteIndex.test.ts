import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FlatFile } from "./fileSearch";

const readBulkCalls: string[][] = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args: { paths: string[] }) => {
    if (name !== "read_files_bulk") throw new Error(`unmocked ${name}`);
    readBulkCalls.push(args.paths);
    return args.paths.map((path) => ({
      path,
      content: `---\ntitle: Note ${path.split("/").pop()}\n---\nbody`,
    }));
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

const { useNoteIndex } = await import("./useNoteIndex");

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function note(name: string): FlatFile {
  return {
    node: { name, path: `/ws/notes/${name}`, isDirectory: false, contentType: "note" },
    displayName: name,
    relativePath: `notes/${name}`,
  };
}

describe("useNoteIndex", () => {
  it("builds the index after the initial render, not during it", async () => {
    const flatFiles = [note("a.md")];
    const { result } = renderHook(() => useNoteIndex(flatFiles, "/ws"));
    // Deferred: nothing read yet on the first render.
    expect(readBulkCalls).toHaveLength(0);
    expect(result.current.resolveWikiTarget("Note a.md").exists).toBe(false);

    await waitFor(() => expect(result.current.noteResolverIndex.byTitle.size).toBe(1));
    expect(result.current.resolveWikiTarget("Note a.md")).toEqual({
      relativePath: "notes/a.md",
      exists: true,
    });
  });

  it("keeps a stable resolver that always uses the latest index", async () => {
    const { result, rerender } = renderHook(({ files }) => useNoteIndex(files, "/ws"), {
      initialProps: { files: [note("x.md")] },
    });
    const resolve = result.current.resolveWikiTarget;
    await waitFor(() => expect(result.current.noteResolverIndex.byTitle.size).toBe(1));
    act(() => rerender({ files: [note("x.md"), note("y.md")] }));
    await waitFor(() => expect(result.current.noteResolverIndex.byTitle.size).toBe(2));
    expect(result.current.resolveWikiTarget).toBe(resolve);
    expect(resolve("Note y.md").exists).toBe(true);
  });

  it("never resolves against the previous workspace's index", async () => {
    const { result, rerender } = renderHook(({ files, ws }) => useNoteIndex(files, ws), {
      initialProps: { files: [note("old.md")], ws: "/ws-a" },
    });
    await waitFor(() => expect(result.current.resolveWikiTarget("Note old.md").exists).toBe(true));

    act(() => rerender({ files: [note("new.md")], ws: "/ws-b" }));
    // Until the new workspace's index lands, the old one is not used: its
    // paths would be joined to the new workspace's root.
    expect(result.current.resolveWikiTarget("Note old.md").exists).toBe(false);
    expect(result.current.noteResolverIndex.byTitle.size).toBe(0);
    await waitFor(() => expect(result.current.resolveWikiTarget("Note new.md").exists).toBe(true));
  });

  it("following a link builds the index now rather than reading the link as missing", async () => {
    const { result } = renderHook(() => useNoteIndex([note("a.md")], "/ws"));
    // The idle build hasn't run: a link would read as missing, and following
    // it would create a duplicate note.
    expect(result.current.resolveWikiTarget("Note a.md").exists).toBe(false);

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.resolveWikiTargetForNavigation("Note a.md");
    });
    expect(resolved).toEqual({ relativePath: "notes/a.md", exists: true });
  });
});
