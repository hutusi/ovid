import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";

// ── Tauri seam mock ────────────────────────────────────────────────────────
// corpusCache goes through commands.files.readBulk → invokeCmd → invoke.

const invokeCalls: Array<{ name: string; args: unknown }> = [];
/** Set to hold bulk reads open until it resolves. */
let bulkGate: Promise<void> | null = null;
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args?: { paths?: string[] }) => {
    invokeCalls.push({ name, args });
    if (name === "write_file" || name === "create_file") return "version";
    const paths = args?.paths ?? [];
    if (bulkGate) await bulkGate;
    return paths.map((p) => ({ path: p, content: `content of ${p}` }));
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

const { readCorpus, corpusReadFile, onCorpusEdit } = await import("./corpusCache");
const { commands } = await import("./commands");

/** Let the corpus patch, queued behind the read it applies to, run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const bulkReads = () => invokeCalls.filter((c) => c.name === "read_files_bulk").length;

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

describe("the app's own writes", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
    bulkGate = null;
  });

  it("are applied to the current corpus in memory, without reading it again", async () => {
    const flatFiles = [makeFlatFile("/ws/a.md")];
    await readCorpus(flatFiles);
    const edits: string[][] = [];
    const stop = onCorpusEdit((path, before, after) => edits.push([path, before, after]));

    await commands.files.write({ path: "/ws/a.md", content: "saved", expectedVersion: null });
    await settle();
    stop();

    expect((await readCorpus(flatFiles)).get("/ws/a.md")).toBe("saved");
    expect(bulkReads()).toBe(1);
    expect(edits).toEqual([["/ws/a.md", "content of /ws/a.md", "saved"]]);
  });

  it("win over a bulk read that was still in flight", async () => {
    let release: () => void = () => {};
    bulkGate = new Promise((resolve) => {
      release = resolve;
    });
    const flatFiles = [makeFlatFile("/ws/a.md")];
    const pending = readCorpus(flatFiles);
    // The save lands while the read (which may have seen the old text) is
    // still out.
    await commands.files.write({ path: "/ws/a.md", content: "saved", expectedVersion: null });
    release();
    await pending;
    await settle();

    expect((await readCorpus(flatFiles)).get("/ws/a.md")).toBe("saved");
  });

  it("leave a file the corpus doesn't hold to the walk its creation causes", async () => {
    const flatFiles = [makeFlatFile("/ws/a.md")];
    await readCorpus(flatFiles);
    const edits: string[] = [];
    const stop = onCorpusEdit((path) => edits.push(path));

    await commands.files.create({ path: "/ws/new.md", content: "new" });
    await commands.files.write({
      path: "/ws/a.md",
      content: "content of /ws/a.md",
      expectedVersion: null,
    });
    await settle();
    stop();

    const corpus = await readCorpus(flatFiles);
    expect(corpus.has("/ws/new.md")).toBe(false);
    // Writing back the same text isn't an edit.
    expect(edits).toEqual([]);
  });
});
