import { describe, expect, it } from "bun:test";
import { findBacklinks } from "./backlinks";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";
import { EMPTY_NOTE_RESOLVER_INDEX, type NoteResolverIndex } from "./wikiLink";

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

describe("findBacklinks", () => {
  it("returns [] when no source file mentions the target", async () => {
    const flatFiles = [makeFlat("flows/2026/01/02.md", "/a")];
    const result = await findBacklinks("notes/hello.md", {
      flatFiles,
      readFile: async () => "Just prose.",
      resolverIndex: EMPTY_NOTE_RESOLVER_INDEX,
    });
    expect(result).toEqual([]);
  });

  it("finds a backlink and reports its 1-based line number + snippet", async () => {
    const flatFiles = [makeFlat("flows/a.md", "/flows/a.md")];
    const content = "Intro paragraph.\n\nA [[Hello World]] reference here.\nMore text.\n";
    const result = await findBacklinks("notes/hello-world.md", {
      flatFiles,
      readFile: async () => content,
      // Title-only index: `Hello World` → `notes/hello-world.md`.
      resolverIndex: makeIndex({ titles: { "Hello World": "notes/hello-world.md" } }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourcePath: "/flows/a.md",
      sourceRelativePath: "flows/a.md",
      lineNumber: 3,
      snippet: "A [[Hello World]] reference here.",
    });
  });

  it("counts only files that link to the requested target", async () => {
    const flatFiles = [makeFlat("flows/a.md", "/a"), makeFlat("flows/b.md", "/b")];
    const contents: Record<string, string> = {
      "/a": "Has [[Hello World]] here.",
      "/b": "Has [[Other Note]] elsewhere.",
    };
    const result = await findBacklinks("notes/hello-world.md", {
      flatFiles,
      readFile: async (p) => contents[p] ?? "",
      resolverIndex: makeIndex({
        titles: {
          "Hello World": "notes/hello-world.md",
          "Other Note": "notes/other.md",
        },
      }),
    });
    expect(result.map((b) => b.sourceRelativePath)).toEqual(["flows/a.md"]);
  });

  it("treats alias-resolved references as backlinks", async () => {
    const flatFiles = [makeFlat("flows/a.md", "/a")];
    const result = await findBacklinks("notes/hello.md", {
      flatFiles,
      readFile: async () => "See [[HW]] for context.",
      // `HW` is an alias of `notes/hello.md`.
      resolverIndex: makeIndex({ aliases: { HW: "notes/hello.md" } }),
    });
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(1);
  });

  it("emits one row per matching line (multiple matches on same line collapse)", async () => {
    const flatFiles = [makeFlat("flows/a.md", "/a")];
    const result = await findBacklinks("notes/hello.md", {
      flatFiles,
      readFile: async () =>
        "Line one: [[Hello]] and [[Hello]] both here.\nLine two: just [[Hello]].\n",
      resolverIndex: makeIndex({ titles: { Hello: "notes/hello.md" } }),
    });
    expect(result.map((b) => b.lineNumber)).toEqual([1, 2]);
  });

  it("skips the excluded source path (self-references)", async () => {
    const flatFiles = [makeFlat("notes/hello.md", "/h"), makeFlat("flows/a.md", "/a")];
    const contents: Record<string, string> = {
      "/h": "I reference myself: [[Hello]].",
      "/a": "Other file: [[Hello]].",
    };
    const result = await findBacklinks("notes/hello.md", {
      flatFiles,
      readFile: async (p) => contents[p] ?? "",
      resolverIndex: makeIndex({ titles: { Hello: "notes/hello.md" } }),
      excludeRelativePath: "notes/hello.md",
    });
    expect(result.map((b) => b.sourceRelativePath)).toEqual(["flows/a.md"]);
  });

  it("ignores frontmatter so a `title: [[Foo]]` doesn't register as a backlink", async () => {
    const flatFiles = [makeFlat("flows/a.md", "/a")];
    const result = await findBacklinks("notes/foo.md", {
      flatFiles,
      readFile: async () => '---\ntitle: "[[Foo]]"\n---\n\nBody has no link.\n',
      resolverIndex: makeIndex({ titles: { Foo: "notes/foo.md" } }),
    });
    expect(result).toEqual([]);
  });

  it("skips files that fail to read", async () => {
    const flatFiles = [makeFlat("flows/bad.md", "/bad"), makeFlat("flows/ok.md", "/ok")];
    const result = await findBacklinks("notes/hello.md", {
      flatFiles,
      readFile: async (p) => {
        if (p === "/bad") throw new Error("nope");
        return "[[Hello]]";
      },
      resolverIndex: makeIndex({ titles: { Hello: "notes/hello.md" } }),
    });
    expect(result.map((b) => b.sourceRelativePath)).toEqual(["flows/ok.md"]);
  });
});
