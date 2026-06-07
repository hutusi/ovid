import { describe, expect, it } from "bun:test";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";
import {
  buildNoteResolverIndex,
  createWikiNote,
  EMPTY_NOTE_RESOLVER_INDEX,
  filterNotes,
  isNoteFlatFile,
  type NoteResolverIndex,
  parseWikiLink,
  resolveWikiTarget,
} from "./wikiLink";

const noopT = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlat(relativePath: string, path = `/ws/${relativePath}`): FlatFile {
  const name = relativePath.split("/").pop() || relativePath;
  const node: FileNode = { name, path, isDirectory: false };
  return { node, displayName: name.replace(/\.mdx?$/, ""), relativePath };
}

function makeIndex(args: {
  titles?: Record<string, string>;
  aliases?: Record<string, string>;
}): NoteResolverIndex {
  return {
    byPath: new Map(),
    byTitle: new Map(Object.entries(args.titles ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    byAlias: new Map(Object.entries(args.aliases ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  };
}

// ---------------------------------------------------------------------------
// parseWikiLink
// ---------------------------------------------------------------------------

describe("parseWikiLink", () => {
  it("parses a bare target", () => {
    expect(parseWikiLink("Hello World")).toEqual({ target: "Hello World", displayText: null });
  });

  it("parses piped form `Target|Display`", () => {
    expect(parseWikiLink("Hello World|hi there")).toEqual({
      target: "Hello World",
      displayText: "hi there",
    });
  });

  it("trims whitespace around target and display", () => {
    expect(parseWikiLink("  Foo  |  Bar  ")).toEqual({ target: "Foo", displayText: "Bar" });
  });

  it("treats an empty display segment as no display", () => {
    expect(parseWikiLink("Foo|")).toEqual({ target: "Foo", displayText: null });
  });
});

// ---------------------------------------------------------------------------
// isNoteFlatFile / filterNotes
// ---------------------------------------------------------------------------

describe("filterNotes", () => {
  it("keeps files inside notes/ and rejects others", () => {
    const files = [
      makeFlat("notes/hello.md"),
      makeFlat("flows/2026/01/02.md"),
      makeFlat("posts/foo.md"),
      makeFlat("notes/sub/deep.md"),
    ];
    const filtered = filterNotes(files);
    expect(filtered.map((f) => f.relativePath)).toEqual(["notes/hello.md", "notes/sub/deep.md"]);
  });

  it("rejects a file whose path merely starts with `notes` but isn't the bucket", () => {
    // E.g. a top-level `notes-archive/` directory shouldn't match.
    expect(isNoteFlatFile(makeFlat("notes-archive/foo.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveWikiTarget
// ---------------------------------------------------------------------------

describe("resolveWikiTarget", () => {
  it("hits aliases before titles", () => {
    const index = makeIndex({
      titles: { "Hello World": "notes/h.md" },
      aliases: { "Hello World": "notes/alias-target.md" },
    });
    expect(resolveWikiTarget("Hello World", index)).toEqual({
      relativePath: "notes/alias-target.md",
      exists: true,
    });
  });

  it("hits titles when no alias matches", () => {
    const index = makeIndex({ titles: { "Hello World": "notes/h.md" } });
    expect(resolveWikiTarget("Hello World", index)).toEqual({
      relativePath: "notes/h.md",
      exists: true,
    });
  });

  it("is case-insensitive on titles", () => {
    const index = makeIndex({ titles: { "HELLO WORLD": "notes/h.md" } });
    expect(resolveWikiTarget("hello world", index)).toEqual({
      relativePath: "notes/h.md",
      exists: true,
    });
  });

  it("is case-insensitive on aliases", () => {
    const index = makeIndex({ aliases: { HW: "notes/hw.md" } });
    expect(resolveWikiTarget("hw", index)).toEqual({
      relativePath: "notes/hw.md",
      exists: true,
    });
  });

  it("falls back to notes/<slug>.md when nothing matches", () => {
    expect(resolveWikiTarget("Hello World", EMPTY_NOTE_RESOLVER_INDEX)).toEqual({
      relativePath: "notes/hello-world.md",
      exists: false,
    });
  });

  it("preserves CJK characters in the fallback slug", () => {
    const r = resolveWikiTarget("你好 世界", EMPTY_NOTE_RESOLVER_INDEX);
    expect(r.exists).toBe(false);
    expect(r.relativePath).toBe("notes/你好-世界.md");
  });

  it("returns notes/untitled.md for an empty target", () => {
    expect(resolveWikiTarget("", EMPTY_NOTE_RESOLVER_INDEX)).toEqual({
      relativePath: "notes/untitled.md",
      exists: false,
    });
  });

  it("does not resolve by filename slug (intentional)", () => {
    const index = makeIndex({ titles: { "Other Title": "notes/hello-world.md" } });
    // `[[hello-world]]` (filename-style) should NOT match `notes/hello-world.md`
    // because the title there is "Other Title". User-decided scope: title+aliases only.
    expect(resolveWikiTarget("hello-world", index)).toEqual({
      relativePath: "notes/hello-world.md",
      exists: false,
    });
  });
});

// ---------------------------------------------------------------------------
// buildNoteResolverIndex
// ---------------------------------------------------------------------------

describe("buildNoteResolverIndex", () => {
  it("reads only notes-bucket files and indexes their title/aliases", async () => {
    const flat: FlatFile[] = [
      makeFlat("notes/h.md", "/ws/notes/h.md"),
      makeFlat("notes/sub/g.md", "/ws/notes/sub/g.md"),
      makeFlat("flows/2026/01/02.md", "/ws/flows/2026/01/02.md"),
    ];
    const readsByPath: Record<string, string> = {
      "/ws/notes/h.md": `---\ntitle: "Hello World"\naliases: ["hw", "Hi"]\n---\n\nbody`,
      "/ws/notes/sub/g.md": `---\ntitle: Greeting\n---\n\nbody`,
    };
    const read = async (p: string) => readsByPath[p] ?? "";
    const calls: string[] = [];
    const readSpy = async (p: string) => {
      calls.push(p);
      return read(p);
    };

    const index = await buildNoteResolverIndex(flat, readSpy);

    expect(calls).toEqual(["/ws/notes/h.md", "/ws/notes/sub/g.md"]);
    expect(index.byTitle.get("hello world")).toBe("notes/h.md");
    expect(index.byTitle.get("greeting")).toBe("notes/sub/g.md");
    expect(index.byAlias.get("hw")).toBe("notes/h.md");
    expect(index.byAlias.get("hi")).toBe("notes/h.md");
    expect(index.byPath.get("notes/h.md")).toEqual({
      title: "Hello World",
      aliases: ["hw", "Hi"],
    });
  });

  it("first-write-wins on duplicate titles", async () => {
    const flat: FlatFile[] = [makeFlat("notes/a.md", "/a"), makeFlat("notes/b.md", "/b")];
    const read = async (p: string) =>
      p === "/a" ? `---\ntitle: "Foo"\n---\n` : p === "/b" ? `---\ntitle: "Foo"\n---\n` : "";
    const index = await buildNoteResolverIndex(flat, read);
    expect(index.byTitle.get("foo")).toBe("notes/a.md");
  });

  it("skips files that fail to read", async () => {
    const flat: FlatFile[] = [makeFlat("notes/bad.md", "/bad"), makeFlat("notes/ok.md", "/ok")];
    const read = async (p: string) => {
      if (p === "/bad") throw new Error("nope");
      return `---\ntitle: "OK"\n---\n`;
    };
    const index = await buildNoteResolverIndex(flat, read);
    expect(index.byPath.has("notes/bad.md")).toBe(false);
    expect(index.byTitle.get("ok")).toBe("notes/ok.md");
  });

  it("ignores notes with no frontmatter", async () => {
    const flat: FlatFile[] = [makeFlat("notes/bare.md", "/bare")];
    const read = async () => "no frontmatter here\njust prose";
    const index = await buildNoteResolverIndex(flat, read);
    expect(index.byPath.get("notes/bare.md")).toEqual({});
    expect(index.byTitle.size).toBe(0);
    expect(index.byAlias.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createWikiNote
// ---------------------------------------------------------------------------

interface RecordedCall {
  kind: "ensureDir" | "createFile";
  path: string;
  content?: string;
}

function makeSpyCtx(opts: { failCreate?: Error } = {}) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    ctx: {
      workspaceRoot: "/ws/content",
      today: "2026-06-07",
      postsBasePath: "posts",
      ensureDir: async (path: string) => {
        calls.push({ kind: "ensureDir", path });
      },
      createFile: async (path: string, content: string) => {
        calls.push({ kind: "createFile", path, content });
        if (opts.failCreate) throw opts.failCreate;
      },
      t: noopT,
    },
  };
}

describe("createWikiNote", () => {
  it("creates `notes/<slug>.md` for a fresh target", async () => {
    const { calls, ctx } = makeSpyCtx();
    const result = await createWikiNote("Hello World", ctx);
    expect(result.filePath).toBe("/ws/content/notes/hello-world.md");
    const create = calls.find((c) => c.kind === "createFile");
    expect(create?.path).toBe("/ws/content/notes/hello-world.md");
    // The seed frontmatter carries the user-typed title verbatim, so the
    // resolver's `byTitle` index hits on the next `[[Hello World]]`.
    expect(create?.content).toContain('title: "Hello World"');
    // `aliases:` is part of the Amytis note template, so the new file is
    // immediately usable as a cross-naming target.
    expect(create?.content).toContain("aliases: []");
  });

  it("ensures parent directories before creating the file", async () => {
    const { calls, ctx } = makeSpyCtx();
    await createWikiNote("Foo Bar", ctx);
    const ensureIndex = calls.findIndex((c) => c.kind === "ensureDir");
    const createIndex = calls.findIndex((c) => c.kind === "createFile");
    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(ensureIndex);
    expect(calls[ensureIndex].path).toBe("/ws/content/notes");
  });

  it("slugifies CJK targets without ASCII-mangling", async () => {
    const { ctx } = makeSpyCtx();
    const result = await createWikiNote("你好 世界", ctx);
    expect(result.filePath).toBe("/ws/content/notes/你好-世界.md");
  });

  it("swallows `already exists` so a double-click resolves idempotently", async () => {
    const { ctx } = makeSpyCtx({ failCreate: new Error("path already exists") });
    const result = await createWikiNote("Hello", ctx);
    expect(result.filePath).toBe("/ws/content/notes/hello.md");
  });

  it("re-throws non-collision errors so the App can toast them", async () => {
    const { ctx } = makeSpyCtx({ failCreate: new Error("permission denied") });
    await expect(createWikiNote("Hello", ctx)).rejects.toThrow("permission denied");
  });

  it("falls back to `notes/untitled.md` for an empty target", async () => {
    const { ctx } = makeSpyCtx();
    const result = await createWikiNote("", ctx);
    expect(result.filePath).toBe("/ws/content/notes/untitled.md");
  });
});
