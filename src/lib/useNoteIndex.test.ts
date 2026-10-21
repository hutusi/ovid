import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FlatFile } from "./fileSearch";

const readBulkCalls: string[][] = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args: { paths: string[] }) => {
    if (name === "write_file") return "version";
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
const { commands } = await import("./commands");

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

// Unmount each test's hook when it ends: a mounted hook's idle build can
// otherwise land during a later test and read another set of files.
const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => {
  for (const hook of mounted.splice(0)) act(() => hook.unmount());
});
function tracked<T extends { unmount: () => void }>(rendered: T): T {
  mounted.push(rendered);
  return rendered;
}

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
    const { result } = tracked(renderHook(() => useNoteIndex(flatFiles, "/ws")));
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
    const { result, rerender } = tracked(
      renderHook(({ files }) => useNoteIndex(files, "/ws"), {
        initialProps: { files: [note("x.md")] },
      })
    );
    const resolve = result.current.resolveWikiTarget;
    await waitFor(() => expect(result.current.noteResolverIndex.byTitle.size).toBe(1));
    act(() => rerender({ files: [note("x.md"), note("y.md")] }));
    await waitFor(() => expect(result.current.noteResolverIndex.byTitle.size).toBe(2));
    expect(result.current.resolveWikiTarget).toBe(resolve);
    expect(resolve("Note y.md").exists).toBe(true);
  });

  it("never resolves against the previous workspace's index", async () => {
    const { result, rerender } = tracked(
      renderHook(({ files, ws }) => useNoteIndex(files, ws), {
        initialProps: { files: [note("old.md")], ws: "/ws-a" },
      })
    );
    await waitFor(() => expect(result.current.resolveWikiTarget("Note old.md").exists).toBe(true));

    act(() => rerender({ files: [note("new.md")], ws: "/ws-b" }));
    // Until the new workspace's index lands, the old one is not used: its
    // paths would be joined to the new workspace's root.
    expect(result.current.resolveWikiTarget("Note old.md").exists).toBe(false);
    expect(result.current.noteResolverIndex.byTitle.size).toBe(0);
    await waitFor(() => expect(result.current.resolveWikiTarget("Note new.md").exists).toBe(true));
  });

  it("following a link builds the index now rather than reading the link as missing", async () => {
    const { result } = tracked(renderHook(() => useNoteIndex([note("a.md")], "/ws")));
    // The idle build hasn't run: a link would read as missing, and following
    // it would create a duplicate note.
    expect(result.current.resolveWikiTarget("Note a.md").exists).toBe(false);

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.resolveWikiTargetForNavigation("Note a.md");
    });
    expect(resolved).toEqual({ relativePath: "notes/a.md", exists: true });
  });

  it("follows a title or alias changed by Ovid's own save, without re-reading every note", async () => {
    const flatFiles = [note("c.md")];
    const { result } = tracked(renderHook(() => useNoteIndex(flatFiles, "/ws")));
    await waitFor(() => expect(result.current.resolveWikiTarget("Note c.md").exists).toBe(true));
    const reads = readBulkCalls.length;
    const save = (content: string) =>
      act(async () => {
        await commands.files.write({ path: "/ws/notes/c.md", content, expectedVersion: null });
      });

    // Typing in the body can't move a title or alias: no rebuild.
    const before = result.current.noteResolverIndex;
    await save("---\ntitle: Note c.md\n---\nnew body");
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(result.current.noteResolverIndex).toBe(before);

    await save("---\ntitle: Note c.md\naliases: [Gamma]\n---\nnew body");
    // The rebuild waits for idle, which may take its full 1.5 s timeout on a
    // busy run.
    await waitFor(() => expect(result.current.resolveWikiTarget("Gamma").exists).toBe(true), {
      timeout: 3000,
    });
    expect(readBulkCalls.length).toBe(reads);
  });
});
