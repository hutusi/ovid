import { describe, expect, it } from "bun:test";
import type { FlatFile } from "./fileSearch";
import { flattenTree, score } from "./fileSearch";
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
  it("returns 3 for exact display name match", () => {
    expect(score(makeFlat("hello"), "hello")).toBe(3);
  });

  it("exact match is case-insensitive", () => {
    expect(score(makeFlat("Hello World"), "hello world")).toBe(3);
  });

  it("returns 2 for prefix match on display name", () => {
    expect(score(makeFlat("hello world"), "hello")).toBe(2);
  });

  it("returns 1 for substring match in display name", () => {
    expect(score(makeFlat("say hello there"), "hello")).toBe(1);
  });

  it("returns 1 for match in relative path only", () => {
    const flat = makeFlat("untitled", "posts/2024/hello.md");
    expect(score(flat, "hello")).toBe(1);
  });

  it("returns 0 when no match", () => {
    expect(score(makeFlat("getting-started"), "xyz")).toBe(0);
  });

  it("path match is also case-insensitive", () => {
    const flat = makeFlat("untitled", "Archive/OldPost.md");
    expect(score(flat, "oldpost")).toBe(1);
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
});
