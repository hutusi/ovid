import { describe, expect, it } from "bun:test";
import { filterTree, rollupGitStatus } from "./sidebarUtils";
import type { FileNode, GitStatus } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, opts: { title?: string; path?: string } = {}): FileNode {
  return {
    name,
    path: opts.path ?? `/workspace/${name}`,
    isDirectory: false,
    extension: ".md",
    title: opts.title,
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

function makeStatusMap(entries: [FileNode, GitStatus][]): Map<string, GitStatus> {
  return new Map(entries.map(([node, status]) => [node.path, status]));
}

// ---------------------------------------------------------------------------
// filterTree
// ---------------------------------------------------------------------------

describe("filterTree", () => {
  it("returns empty array for empty input", () => {
    expect(filterTree([], "post")).toEqual([]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterTree([makeFile("about.md")], "xyz")).toEqual([]);
  });

  it("matches file by filename (case-insensitive)", () => {
    const file = makeFile("Hello.md");
    expect(filterTree([file], "hello")).toEqual([file]);
    expect(filterTree([file], "HELLO")).toEqual([file]);
  });

  it("matches file by frontmatter title", () => {
    const file = makeFile("my-slug.md", { title: "Getting Started" });
    expect(filterTree([file], "started")).toEqual([file]);
  });

  it("matches by title when title exists", () => {
    const file = makeFile("xyz.md", { title: "Rust Tutorial" });
    expect(filterTree([file], "rust")).toEqual([file]);
  });

  it("also matches by filename when title exists", () => {
    const file = makeFile("xyz.md", { title: "Rust Tutorial" });
    expect(filterTree([file], "xyz")).toEqual([file]);
  });

  it("includes directory only when a child matches", () => {
    const match = makeFile("post.md");
    const noMatch = makeFile("about.md");
    const dir = makeDir("posts", [match, noMatch]);
    const result = filterTree([dir], "post");
    expect(result).toHaveLength(1);
    expect(result[0].isDirectory).toBe(true);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0]).toBe(match);
  });

  it("prunes empty directories", () => {
    const dir = makeDir("empty", [makeFile("nope.md")]);
    expect(filterTree([dir], "xyz")).toEqual([]);
  });

  it("handles nested directories", () => {
    const deep = makeFile("deep-post.md");
    const tree = [makeDir("a", [makeDir("b", [deep])])];
    const result = filterTree(tree, "deep");
    expect(result).toHaveLength(1);
    expect(result[0].children![0].children![0]).toBe(deep);
  });

  it("returns multiple matches", () => {
    const files = [makeFile("alpha.md"), makeFile("beta.md"), makeFile("alpha-two.md")];
    const result = filterTree(files, "alpha");
    expect(result).toHaveLength(2);
  });

  it("is a substring match, not prefix-only", () => {
    const file = makeFile("my-awesome-post.md");
    expect(filterTree([file], "awesome")).toEqual([file]);
  });
});

// ---------------------------------------------------------------------------
// rollupGitStatus
// ---------------------------------------------------------------------------

describe("rollupGitStatus", () => {
  it("returns undefined for a file not in the map", () => {
    const file = makeFile("clean.md");
    expect(rollupGitStatus(file, makeStatusMap([]))).toBeUndefined();
  });

  it("returns the file's own status for a leaf node", () => {
    const file = makeFile("changed.md");
    expect(rollupGitStatus(file, makeStatusMap([[file, "modified"]]))).toBe("modified");
  });

  it("returns undefined for a directory with no changed children", () => {
    const dir = makeDir("posts", [makeFile("clean.md")]);
    expect(rollupGitStatus(dir, makeStatusMap([]))).toBeUndefined();
  });

  it("returns undefined for an empty directory", () => {
    const dir = makeDir("empty", []);
    expect(rollupGitStatus(dir, makeStatusMap([]))).toBeUndefined();
  });

  it("bubbles up a single child's status", () => {
    const file = makeFile("changed.md");
    const dir = makeDir("posts", [file]);
    expect(rollupGitStatus(dir, makeStatusMap([[file, "untracked"]]))).toBe("untracked");
  });

  it("staged beats modified", () => {
    const staged = makeFile("staged.md");
    const modified = makeFile("modified.md");
    const dir = makeDir("posts", [staged, modified]);
    const map = makeStatusMap([
      [staged, "staged"],
      [modified, "modified"],
    ]);
    expect(rollupGitStatus(dir, map)).toBe("staged");
  });

  it("modified beats untracked", () => {
    const modified = makeFile("modified.md");
    const untracked = makeFile("new.md");
    const dir = makeDir("posts", [modified, untracked]);
    const map = makeStatusMap([
      [modified, "modified"],
      [untracked, "untracked"],
    ]);
    expect(rollupGitStatus(dir, map)).toBe("modified");
  });

  it("staged beats both modified and untracked", () => {
    const staged = makeFile("staged.md");
    const modified = makeFile("modified.md");
    const untracked = makeFile("new.md");
    const dir = makeDir("posts", [staged, modified, untracked]);
    const map = makeStatusMap([
      [staged, "staged"],
      [modified, "modified"],
      [untracked, "untracked"],
    ]);
    expect(rollupGitStatus(dir, map)).toBe("staged");
  });

  it("recurses into nested directories", () => {
    const file = makeFile("deep.md");
    const inner = makeDir("inner", [file]);
    const outer = makeDir("outer", [inner]);
    expect(rollupGitStatus(outer, makeStatusMap([[file, "staged"]]))).toBe("staged");
  });
});
