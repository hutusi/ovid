import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";

// ── Tauri seam mock ────────────────────────────────────────────────────────
// corpusCache goes through commands.files.readBulk → invokeCmd → invoke.

const invokeCalls: Array<{ name: string; args: unknown }> = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args?: { paths?: string[] }) => {
    invokeCalls.push({ name, args });
    return (args?.paths ?? []).map((p) => ({ path: p, content: `content of ${p}` }));
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

const { readCorpus, corpusReadFile } = await import("./corpusCache");

function makeFlatFile(path: string): FlatFile {
  const node: FileNode = {
    name: path.split("/").pop() ?? path,
    path,
    isDirectory: false,
    extension: ".md",
  };
  return { node, displayName: node.name, relativePath: path };
}

describe("readCorpus", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
  });

  it("issues one bulk read per flatFiles identity and caches it", async () => {
    const flatFiles = [makeFlatFile("/ws/a.md"), makeFlatFile("/ws/b.md")];

    const first = await readCorpus(flatFiles);
    const second = await readCorpus(flatFiles);

    // Same tree generation → one IPC call, shared result.
    expect(invokeCalls.filter((c) => c.name === "read_files_bulk")).toHaveLength(1);
    expect(second).toBe(first);
    expect(first.get("/ws/a.md")).toBe("content of /ws/a.md");
    expect(first.get("/ws/b.md")).toBe("content of /ws/b.md");
  });

  it("re-reads when the flatFiles identity changes (new tree generation)", async () => {
    await readCorpus([makeFlatFile("/ws/a.md")]);
    await readCorpus([makeFlatFile("/ws/a.md")]);

    expect(invokeCalls.filter((c) => c.name === "read_files_bulk")).toHaveLength(2);
  });
});

describe("corpusReadFile", () => {
  it("resolves cached content and rejects for absent entries like a failed read", async () => {
    const readFile = corpusReadFile(new Map([["/ws/a.md", "hello"]]));

    await expect(readFile("/ws/a.md")).resolves.toBe("hello");
    await expect(readFile("/ws/missing.md")).rejects.toThrow("not in corpus");
  });
});
