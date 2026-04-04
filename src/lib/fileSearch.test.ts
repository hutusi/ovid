import { describe, expect, it } from "bun:test";
import type { FlatFile } from "./fileSearch";
import { compareFiles, flattenTree, score } from "./fileSearch";
import type { FileNode } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, opts: { title?: string; draft?: boolean } = {}): FileNode {
  return {
    name,
    path: `/workspace/${name}`,
    isDirectory: false,
    extension: ".md",
    ...opts,
  };
}

function makeDir(name: string, children: FileNode[]): FileNode {
  return {
    name,
    path: `/workspace/${name}`,
    isDirectory: true,
    children,
  };
}

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

describe("flattenTree", () => {
  it("returns empty array for empty tree", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("flattens a single file", () => {
    const node = makeFile("hello.md");
    const result = flattenTree([node]);
    expect(result).toHaveLength(1);
    expect(result[0].node).toBe(node);
    expect(result[0].displayName).toBe("hello");
    expect(result[0].relativePath).toBe("hello.md");
  });

  it("uses frontmatter title as displayName when available", () => {
    const node = makeFile("my-slug.md", { title: "My Great Post" });
    const [flat] = flattenTree([node]);
    expect(flat.displayName).toBe("My Great Post");
  });

  it("falls back to basename when title is absent", () => {
    const node = makeFile("my-slug.md");
    const [flat] = flattenTree([node]);
    expect(flat.displayName).toBe("my-slug");
  });

  it("strips .md and .mdx extensions from baseName", () => {
    expect(flattenTree([makeFile("post.md")])[0].displayName).toBe("post");
    expect(flattenTree([makeFile("component.mdx")])[0].displayName).toBe("component");
  });

  it("recurses into directories and builds relative paths", () => {
    const tree = [makeDir("posts", [makeFile("first.md"), makeFile("second.md")])];
    const result = flattenTree(tree);
    expect(result).toHaveLength(2);
    expect(result[0].relativePath).toBe("posts/first.md");
    expect(result[1].relativePath).toBe("posts/second.md");
  });

  it("handles nested directories", () => {
    const tree = [makeDir("a", [makeDir("b", [makeFile("deep.md")])])];
    const [flat] = flattenTree(tree);
    expect(flat.relativePath).toBe("a/b/deep.md");
  });

  it("collapses dir/index.md into a single search item using the folder name", () => {
    const tree = [
      makeDir("posts", [
        {
          name: "hello",
          path: "/workspace/posts/hello",
          isDirectory: true,
          children: [
            {
              name: "index.md",
              path: "/workspace/posts/hello/index.md",
              isDirectory: false,
              extension: ".md",
              title: "Hello Post",
            },
          ],
        },
      ]),
    ];

    const flattened = flattenTree(tree);
    expect(flattened).toHaveLength(1);
    const [flat] = flattened;
    expect(flat.displayName).toBe("Hello Post");
    expect(flat.relativePath).toBe("posts/hello");
    expect(flat.node.path).toBe("/workspace/posts/hello/index.md");
  });

  it("skips directories with no children", () => {
    const tree = [makeDir("empty", []), makeFile("top.md")];
    const result = flattenTree(tree);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("top");
  });

  it("preserves top-level file relative path without prefix", () => {
    const node = makeFile("readme.md");
    const [flat] = flattenTree([node]);
    expect(flat.relativePath).toBe("readme.md");
  });
});

// ---------------------------------------------------------------------------
// score
// ---------------------------------------------------------------------------

function makeFlat(displayName: string, relativePath?: string): FlatFile {
  return {
    node: makeFile(relativePath ?? `${displayName}.md`),
    displayName,
    relativePath: relativePath ?? `${displayName}.md`,
  };
}

describe("score", () => {
  it("returns a positive score for exact display name match", () => {
    expect(score(makeFlat("hello"), "hello")).toBeGreaterThan(0);
  });

  it("exact match is case-insensitive", () => {
    expect(score(makeFlat("Hello World"), "hello world")).toBeGreaterThan(0);
  });

  it("returns a positive score for prefix match on display name", () => {
    expect(score(makeFlat("hello world"), "hello")).toBeGreaterThan(0);
  });

  it("returns a positive score for substring match in display name", () => {
    expect(score(makeFlat("say hello there"), "hello")).toBeGreaterThan(0);
  });

  it("returns a positive score for match in relative path only", () => {
    const flat = makeFlat("untitled", "posts/2024/hello.md");
    expect(score(flat, "hello")).toBeGreaterThan(0);
  });

  it("returns 0 when no match", () => {
    expect(score(makeFlat("getting-started"), "xyz")).toBe(0);
  });

  it("path match is also case-insensitive", () => {
    const flat = makeFlat("untitled", "Archive/OldPost.md");
    expect(score(flat, "oldpost")).toBeGreaterThan(0);
  });

  it("exact match scores higher than prefix", () => {
    const exact = makeFlat("rust");
    const prefix = makeFlat("rust and tauri");
    expect(score(exact, "rust")).toBeGreaterThan(score(prefix, "rust"));
  });

  it("prefix match scores higher than substring", () => {
    const prefix = makeFlat("rustacean");
    const substring = makeFlat("learning rust");
    expect(score(prefix, "rust")).toBeGreaterThan(score(substring, "rust"));
  });

  it("prefers basename prefix matches over deep path matches", () => {
    const basenamePrefix = makeFlat("untitled", "hello-world.md");
    const pathOnly = makeFlat("notes", "archive/hello/world.md");
    expect(score(basenamePrefix, "hello")).toBeGreaterThan(score(pathOnly, "hello"));
  });

  it("prefers exact path segment matches over broader path substrings", () => {
    const segmentMatch = makeFlat("untitled", "posts/hello/index.md");
    const substringMatch = makeFlat("untitled", "posts/say-hello/index.md");
    expect(score(segmentMatch, "hello")).toBeGreaterThan(score(substringMatch, "hello"));
  });

  it("prefers earlier display name substring matches over later ones", () => {
    const early = makeFlat("hello notes");
    const late = makeFlat("notes hello");
    expect(score(early, "hello")).toBeGreaterThan(score(late, "hello"));
  });

  it("treats exact basename matches as strongest matches", () => {
    const basenameExact = makeFlat("Untitled", "hello.md");
    const titlePrefix = makeFlat("hello world", "notes.md");
    expect(score(basenameExact, "hello")).toBeGreaterThan(score(titlePrefix, "hello"));
  });
});

describe("compareFiles", () => {
  it("uses recent-file order as a tie-breaker for typed matches", () => {
    const recent = makeFlat("meeting notes", "notes/meeting.md");
    const older = makeFlat("meeting notes", "archive/meeting.md");
    const recentRankByPath = new Map([
      [recent.node.path, 0],
      [older.node.path, 3],
    ]);

    const sorted = [older, recent].sort((a, b) => compareFiles(a, b, "meeting", recentRankByPath));
    expect(sorted[0]).toBe(recent);
  });

  it("prefers shorter paths when score and recency are tied", () => {
    const shortPath = makeFlat("release notes", "release.md");
    const longPath = makeFlat("release notes", "archive/2024/release.md");

    const sorted = [longPath, shortPath].sort((a, b) => compareFiles(a, b, "release"));
    expect(sorted[0]).toBe(shortPath);
  });
});
