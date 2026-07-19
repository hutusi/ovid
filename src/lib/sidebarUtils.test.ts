import { describe, expect, it } from "bun:test";
import type { FeatureBucket } from "./commands/generated/FeatureBucket";
import {
  bucketLabel,
  clampSidebarWidth,
  collapseIndexNodes,
  filterTree,
  findCollectionEntries,
  forContentMode,
  forFilesMode,
  getBucketContentType,
  getDirIndexEntry,
  getSidebarDisplayName,
  isCollectionEntry,
  needsPageDivider,
  nextSidebarWidth,
  rollupGitStatus,
  sortNodes,
  sortTree,
  sortTreeAlpha,
} from "./sidebarUtils";
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
    const dir = makeDir("blog", [match, noMatch]);
    const result = filterTree([dir], "post");
    expect(result).toHaveLength(1);
    expect(result[0].isDirectory).toBe(true);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children?.[0]).toBe(match);
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
    expect(result[0].children?.[0].children?.[0]).toBe(deep);
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

  it("matches a directory by name and keeps all its children", () => {
    const indexFile = makeFile("index.md", { path: "/workspace/posts/hello/index.md" });
    const cover = makeFile("cover.md", { path: "/workspace/posts/hello/cover.md" });
    const dir = makeDir("hello", [indexFile, cover]);
    const result = filterTree([dir], "hello");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(dir);
    expect(result[0].children).toHaveLength(2);
  });

  it("matches a directory by name even when no descendants match", () => {
    const file = makeFile("nope.md", { path: "/workspace/posts/hello/nope.md" });
    const dir = makeDir("hello-world", [file]);
    const result = filterTree([dir], "hello");
    expect(result).toHaveLength(1);
    expect(result[0].children).toEqual([file]);
  });
});

// ---------------------------------------------------------------------------
// collapseIndexNodes
// ---------------------------------------------------------------------------

describe("collapseIndexNodes", () => {
  it("collapses a directory with only index.md into a single file-like node", () => {
    const index = makeFile("index.md", {
      title: "Hello",
      path: "/workspace/posts/hello/index.md",
    });
    const dir = makeDir("hello", [index]);
    dir.path = "/workspace/posts/hello";

    const [collapsed] = collapseIndexNodes([dir]);

    expect(collapsed.isDirectory).toBe(false);
    expect(collapsed.name).toBe("hello");
    expect(collapsed.path).toBe(index.path);
    expect(collapsed.title).toBe("Hello");
    expect(collapsed.containerDirPath).toBe("/workspace/posts/hello");
  });

  it("does not collapse directories with additional children", () => {
    const dir = makeDir("hello", [
      makeFile("index.md", { path: "/workspace/hello/index.md" }),
      makeFile("child.md", { path: "/workspace/hello/child.md" }),
    ]);

    const [result] = collapseIndexNodes([dir]);

    expect(result.isDirectory).toBe(true);
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

// ---------------------------------------------------------------------------
// sortNodes
// ---------------------------------------------------------------------------

function makeTypedFile(name: string, contentType?: string): FileNode {
  return {
    name,
    path: `/workspace/${name}`,
    isDirectory: false,
    extension: ".md",
    contentType,
  };
}

describe("sortNodes", () => {
  it("returns empty array for empty input", () => {
    expect(sortNodes([])).toEqual([]);
  });

  it("orders by content-type priority: flow → note → post → series → book → page", () => {
    const page = makeTypedFile("page.md", "page");
    const post = makeTypedFile("post.md", "post");
    const flow = makeTypedFile("flow.md", "flow");
    const book = makeTypedFile("book.md", "book");
    const note = makeTypedFile("note.md", "note");
    const series = makeTypedFile("series.md", "series");
    const result = sortNodes([page, post, flow, book, note, series]);
    expect(result.map((n) => n.contentType)).toEqual([
      "flow",
      "note",
      "post",
      "series",
      "book",
      "page",
    ]);
  });

  it("sorts alphabetically within the same content type", () => {
    const b = makeTypedFile("b-post.md", "post");
    const a = makeTypedFile("a-post.md", "post");
    const c = makeTypedFile("c-post.md", "post");
    expect(sortNodes([b, a, c]).map((n) => n.name)).toEqual([
      "a-post.md",
      "b-post.md",
      "c-post.md",
    ]);
  });

  it("places unknown content types between book and page", () => {
    const page = makeTypedFile("page.md", "page");
    const unknown = makeTypedFile("unknown.md", undefined);
    const book = makeTypedFile("book.md", "book");
    const result = sortNodes([page, unknown, book]);
    expect(result.map((n) => n.contentType)).toEqual(["book", undefined, "page"]);
  });

  it("places directories before files", () => {
    const file = makeTypedFile("a-post.md", "post");
    const dir = makeDir("z-folder", []);
    const result = sortNodes([file, dir]);
    expect(result[0].isDirectory).toBe(true);
    expect(result[1].isDirectory).toBe(false);
  });

  it("does not mutate the input array", () => {
    const nodes = [makeTypedFile("page.md", "page"), makeTypedFile("post.md", "post")];
    const original = [...nodes];
    sortNodes(nodes);
    expect(nodes).toEqual(original);
  });
});

describe("sortTree", () => {
  it("sorts nested directory children recursively", () => {
    const nested = makeDir("nested", [
      makeTypedFile("z-page.md", "page"),
      makeTypedFile("a-flow.md", "flow"),
    ]);
    const root = makeDir("root", [
      makeTypedFile("b-note.md", "note"),
      nested,
      makeTypedFile("a-post.md", "post"),
    ]);

    const result = sortTree([root]);

    expect(result[0].children?.map((node) => node.name)).toEqual([
      "nested",
      "b-note.md",
      "a-post.md",
    ]);
    expect(result[0].children?.[0].children?.map((node) => node.name)).toEqual([
      "a-flow.md",
      "z-page.md",
    ]);
  });

  it("does not mutate nested input arrays", () => {
    const childA = makeTypedFile("b-post.md", "post");
    const childB = makeTypedFile("a-post.md", "post");
    const dir = makeDir("posts", [childA, childB]);
    const originalChildren = dir.children;

    const result = sortTree([dir]);

    expect(dir.children).toBe(originalChildren);
    expect(dir.children?.map((node) => node.name)).toEqual(["b-post.md", "a-post.md"]);
    expect(result[0].children?.map((node) => node.name)).toEqual(["a-post.md", "b-post.md"]);
  });
});

// ---------------------------------------------------------------------------
// needsPageDivider
// ---------------------------------------------------------------------------

describe("needsPageDivider", () => {
  it("returns false for a non-page file", () => {
    const nodes = [makeTypedFile("post.md", "post"), makeTypedFile("page.md", "page")];
    expect(needsPageDivider(nodes, 0)).toBe(false);
  });

  it("returns false when there are only pages (no mixed list)", () => {
    const nodes = [makeTypedFile("about.md", "page"), makeTypedFile("links.md", "page")];
    expect(needsPageDivider(nodes, 0)).toBe(false);
  });

  it("returns true for the first page in a mixed list", () => {
    const nodes = [makeTypedFile("post.md", "post"), makeTypedFile("about.md", "page")];
    expect(needsPageDivider(nodes, 1)).toBe(true);
  });

  it("returns false for subsequent pages after the first", () => {
    const nodes = [
      makeTypedFile("post.md", "post"),
      makeTypedFile("about.md", "page"),
      makeTypedFile("links.md", "page"),
    ];
    expect(needsPageDivider(nodes, 2)).toBe(false);
  });

  it("returns false for a directory node", () => {
    const dir = makeDir("pages", []);
    const post = makeTypedFile("post.md", "post");
    const nodes = [post, dir];
    expect(needsPageDivider(nodes, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSidebarDisplayName
// ---------------------------------------------------------------------------

describe("getSidebarDisplayName", () => {
  it("prefers frontmatter title when present", () => {
    const file = makeFile("my-slug.md", { title: "Hello World" });
    expect(getSidebarDisplayName(file)).toBe("Hello World");
  });

  it("strips the .md extension when there is no title", () => {
    const file = makeFile("my-slug.md");
    expect(getSidebarDisplayName(file)).toBe("my-slug");
  });

  it("strips the .mdx extension when there is no title", () => {
    const file: FileNode = {
      name: "my-slug.mdx",
      path: "/workspace/my-slug.mdx",
      isDirectory: false,
      extension: ".mdx",
    };
    expect(getSidebarDisplayName(file)).toBe("my-slug");
  });

  it("uses the parent folder name for index.md without a title", () => {
    const indexFile = makeFile("index.md", { path: "/workspace/posts/hello/index.md" });
    expect(getSidebarDisplayName(indexFile)).toBe("hello");
  });

  it("uses the parent folder name for index.mdx without a title", () => {
    const indexFile: FileNode = {
      name: "index.mdx",
      path: "/workspace/posts/hello/index.mdx",
      isDirectory: false,
      extension: ".mdx",
    };
    expect(getSidebarDisplayName(indexFile)).toBe("hello");
  });

  it("still prefers the title for index.md when set", () => {
    const indexFile = makeFile("index.md", {
      path: "/workspace/posts/hello/index.md",
      title: "Hello, World",
    });
    expect(getSidebarDisplayName(indexFile)).toBe("Hello, World");
  });

  it("falls back to the bare name when index has no parent folder", () => {
    const indexFile = makeFile("index.md", { path: "index.md" });
    expect(getSidebarDisplayName(indexFile)).toBe("index");
  });
});

// ---------------------------------------------------------------------------
// getDirIndexEntry
// ---------------------------------------------------------------------------

describe("getDirIndexEntry", () => {
  it("returns undefined for a file node", () => {
    expect(getDirIndexEntry(makeFile("post.md"))).toBeUndefined();
  });

  it("returns the index.md child of a directory", () => {
    const index = makeFile("index.md", { path: "/workspace/series/s/index.md" });
    const part = makeFile("part-1.md", { path: "/workspace/series/s/part-1.md" });
    const dir = makeDir("s", [part, index]);
    expect(getDirIndexEntry(dir)).toBe(index);
  });

  it("matches index.mdx too", () => {
    const index: FileNode = {
      name: "index.mdx",
      path: "/workspace/series/s/index.mdx",
      isDirectory: false,
      extension: ".mdx",
    };
    const dir = makeDir("s", [index]);
    expect(getDirIndexEntry(dir)).toBe(index);
  });

  it("returns undefined for a directory with no index child", () => {
    const dir = makeDir("flows", [makeFile("2026.md")]);
    expect(getDirIndexEntry(dir)).toBeUndefined();
  });

  it("ignores a nested index.md (direct children only)", () => {
    const nestedIndex = makeFile("index.md", { path: "/workspace/a/b/index.md" });
    const inner = makeDir("b", [nestedIndex]);
    const outer = makeDir("a", [inner]);
    expect(getDirIndexEntry(outer)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isCollectionEntry
// ---------------------------------------------------------------------------

describe("isCollectionEntry", () => {
  function indexChild(contentType?: string): FileNode {
    return {
      name: "index.mdx",
      path: "/ws/content/series/x/index.mdx",
      isDirectory: false,
      extension: ".mdx",
      contentType,
    };
  }

  it("is true when the index child is typed collection", () => {
    const dir = makeDir("x", [indexChild("collection")]);
    expect(isCollectionEntry(dir)).toBe(true);
  });

  it("is false for a plain series (index has no collection type)", () => {
    const dir = makeDir("x", [indexChild(undefined), makeFile("part-1.md")]);
    expect(isCollectionEntry(dir)).toBe(false);
  });

  it("is false for a file node", () => {
    expect(isCollectionEntry(makeFile("post.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findCollectionEntries
// ---------------------------------------------------------------------------

describe("findCollectionEntries", () => {
  function indexChild(path: string, contentType?: string): FileNode {
    return { name: "index.mdx", path, isDirectory: false, extension: ".mdx", contentType };
  }

  it("finds collection entries scoped under the content root", () => {
    const collection: FileNode = {
      name: "modern-web-dev",
      path: "/ws/content/series/modern-web-dev",
      isDirectory: true,
      children: [indexChild("/ws/content/series/modern-web-dev/index.mdx", "collection")],
    };
    const plainSeries: FileNode = {
      name: "digital-garden",
      path: "/ws/content/series/digital-garden",
      isDirectory: true,
      children: [
        indexChild("/ws/content/series/digital-garden/index.mdx", undefined),
        makeFile("01.md"),
      ],
    };
    const seriesBucket: FileNode = {
      name: "series",
      path: "/ws/content/series",
      isDirectory: true,
      children: [collection, plainSeries],
    };
    const content: FileNode = {
      name: "content",
      path: "/ws/content",
      isDirectory: true,
      children: [seriesBucket],
    };

    const result = findCollectionEntries([content], "/ws/content");
    expect(result).toEqual([
      {
        dirPath: "/ws/content/series/modern-web-dev",
        indexPath: "/ws/content/series/modern-web-dev/index.mdx",
      },
    ]);
  });

  it("returns [] when there are no collections", () => {
    const dir = makeDir("series", [makeDir("plain", [makeFile("index.md")])]);
    expect(findCollectionEntries([dir], null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getBucketContentType
// ---------------------------------------------------------------------------

describe("getBucketContentType", () => {
  it("maps Amytis default bucket folders to content types", () => {
    expect(getBucketContentType("flows")).toBe("flow");
    expect(getBucketContentType("notes")).toBe("note");
    expect(getBucketContentType("posts")).toBe("post");
    expect(getBucketContentType("series")).toBe("series");
    expect(getBucketContentType("books")).toBe("book");
    expect(getBucketContentType("pages")).toBe("page");
  });

  it("returns undefined for non-bucket folder names", () => {
    // an individual series/post folder is not itself a bucket
    expect(getBucketContentType("nextjs-deep-dive")).toBeUndefined();
    expect(getBucketContentType("assets")).toBeUndefined();
    expect(getBucketContentType("")).toBeUndefined();
  });

  it("maps the configured posts basePath to post", () => {
    expect(getBucketContentType("articles", "articles")).toBe("post");
    // the conventional `posts` folder still maps even with a custom basePath
    expect(getBucketContentType("posts", "articles")).toBe("post");
    // a renamed posts folder is not recognised without the config
    expect(getBucketContentType("articles")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// forContentMode / forFilesMode
// ---------------------------------------------------------------------------

describe("forContentMode", () => {
  it("scopes into the content/ subtree for Amytis workspaces", () => {
    const post = makeFile("post.md", { path: "/ws/content/post.md" });
    const config = makeFile("site.config.ts", { path: "/ws/site.config.ts" });
    const contentDir: FileNode = {
      name: "content",
      path: "/ws/content",
      isDirectory: true,
      children: [post],
    };
    const tree = [contentDir, config];
    const result = forContentMode(tree, { workspaceRoot: "/ws", treeRoot: "/ws/content" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("post.md");
  });

  it("uses the canonical tree directly when treeRoot equals workspaceRoot", () => {
    const post = makeFile("post.md", { path: "/ws/post.md" });
    const result = forContentMode([post], { workspaceRoot: "/ws", treeRoot: "/ws" });
    expect(result).toEqual([post]);
  });

  it("filters out non-markdown files and dotfiles", () => {
    const config = makeFile("site.config.ts", { path: "/ws/site.config.ts" });
    const env = makeFile(".env", { path: "/ws/.env" });
    const post = makeFile("post.md", { path: "/ws/post.md" });
    const result = forContentMode([config, env, post], {
      workspaceRoot: "/ws",
      treeRoot: "/ws",
    });
    expect(result.map((n) => n.name)).toEqual(["post.md"]);
  });

  it("keeps .rst files (read-only content) but drops other non-markdown", () => {
    const rst = makeFile("legacy.rst", { path: "/ws/legacy.rst" });
    rst.extension = ".rst";
    const txt = makeFile("notes.txt", { path: "/ws/notes.txt" });
    txt.extension = ".txt";
    const post = makeFile("post.md", { path: "/ws/post.md" });
    const result = forContentMode([rst, txt, post], {
      workspaceRoot: "/ws",
      treeRoot: "/ws",
    });
    expect(result.map((n) => n.name).sort()).toEqual(["legacy.rst", "post.md"]);
  });

  it("drops directories that have no markdown descendants", () => {
    const png = makeFile("photo.png", { path: "/ws/images/photo.png" });
    const imagesDir: FileNode = {
      name: "images",
      path: "/ws/images",
      isDirectory: true,
      children: [png],
    };
    const post = makeFile("post.md", { path: "/ws/post.md" });
    const result = forContentMode([imagesDir, post], {
      workspaceRoot: "/ws",
      treeRoot: "/ws",
    });
    expect(result.map((n) => n.name)).toEqual(["post.md"]);
  });

  it("keeps a single-index series entry as a directory (not collapsed into a post)", () => {
    const seriesIndex = makeFile("index.mdx", {
      path: "/ws/content/series/modern-web-dev/index.mdx",
    });
    seriesIndex.extension = ".mdx";
    const seriesEntry: FileNode = {
      name: "modern-web-dev",
      path: "/ws/content/series/modern-web-dev",
      isDirectory: true,
      children: [seriesIndex],
    };
    const seriesBucket: FileNode = {
      name: "series",
      path: "/ws/content/series",
      isDirectory: true,
      children: [seriesEntry],
    };
    const content: FileNode = {
      name: "content",
      path: "/ws/content",
      isDirectory: true,
      children: [seriesBucket],
    };
    const result = forContentMode([content], {
      workspaceRoot: "/ws",
      treeRoot: "/ws/content",
    });
    const bucket = result[0];
    expect(bucket.name).toBe("series");
    const entry = bucket.children?.[0];
    // The series entry must remain a directory so it renders as a collection.
    expect(entry?.isDirectory).toBe(true);
    expect(entry?.name).toBe("modern-web-dev");
  });

  it("still collapses a single-index folder-backed post under the posts bucket", () => {
    const postIndex = makeFile("index.mdx", {
      path: "/ws/content/posts/my-post/index.mdx",
    });
    postIndex.extension = ".mdx";
    const postEntry: FileNode = {
      name: "my-post",
      path: "/ws/content/posts/my-post",
      isDirectory: true,
      children: [postIndex],
    };
    const postsBucket: FileNode = {
      name: "posts",
      path: "/ws/content/posts",
      isDirectory: true,
      children: [postEntry],
    };
    const content: FileNode = {
      name: "content",
      path: "/ws/content",
      isDirectory: true,
      children: [postsBucket],
    };
    const result = forContentMode([content], {
      workspaceRoot: "/ws",
      treeRoot: "/ws/content",
    });
    const collapsed = result[0].children?.[0];
    expect(collapsed?.isDirectory).toBe(false);
    expect(collapsed?.containerDirPath).toBe("/ws/content/posts/my-post");
  });

  it("returns empty when treeRoot points to a non-existent subtree", () => {
    const post = makeFile("post.md", { path: "/ws/post.md" });
    const result = forContentMode([post], {
      workspaceRoot: "/ws",
      treeRoot: "/ws/missing",
    });
    expect(result).toEqual([]);
  });
});

describe("forFilesMode", () => {
  it("returns the tree sorted with directories first", () => {
    const file = makeFile("readme.md", { path: "/ws/readme.md" });
    const dir: FileNode = {
      name: "src",
      path: "/ws/src",
      isDirectory: true,
      children: [],
    };
    const result = forFilesMode([file, dir]);
    expect(result.map((n) => n.name)).toEqual(["src", "readme.md"]);
  });

  it("preserves non-markdown files and dotfiles (Rust handled noise dirs)", () => {
    const config = makeFile("site.config.ts", { path: "/ws/site.config.ts" });
    const env = makeFile(".env", { path: "/ws/.env" });
    const result = forFilesMode([config, env]);
    expect(result.map((n) => n.name).sort()).toEqual([".env", "site.config.ts"]);
  });
});

// ---------------------------------------------------------------------------
// sortTreeAlpha
// ---------------------------------------------------------------------------

describe("sortTreeAlpha", () => {
  it("returns empty array for empty input", () => {
    expect(sortTreeAlpha([])).toEqual([]);
  });

  it("sorts directories before files", () => {
    const file = makeFile("alpha.md");
    const dir: FileNode = { name: "zzz", path: "/ws/zzz", isDirectory: true, children: [] };
    const result = sortTreeAlpha([file, dir]);
    expect(result[0].isDirectory).toBe(true);
    expect(result[1].isDirectory).toBe(false);
  });

  it("sorts files alphabetically after directories", () => {
    const c = makeFile("c.md");
    const a = makeFile("a.md");
    const b = makeFile("b.md");
    const result = sortTreeAlpha([c, a, b]);
    expect(result.map((n) => n.name)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("sorts directories alphabetically among themselves", () => {
    const z: FileNode = { name: "z-dir", path: "/ws/z-dir", isDirectory: true, children: [] };
    const a: FileNode = { name: "a-dir", path: "/ws/a-dir", isDirectory: true, children: [] };
    const result = sortTreeAlpha([z, a]);
    expect(result.map((n) => n.name)).toEqual(["a-dir", "z-dir"]);
  });

  it("sorts children recursively", () => {
    const c = makeFile("c.md");
    const a = makeFile("a.md");
    const dir: FileNode = { name: "posts", path: "/ws/posts", isDirectory: true, children: [c, a] };
    const [result] = sortTreeAlpha([dir]);
    expect(result.children?.map((n) => n.name)).toEqual(["a.md", "c.md"]);
  });

  it("does not mutate the input array", () => {
    const b = makeFile("b.md");
    const a = makeFile("a.md");
    const nodes = [b, a];
    sortTreeAlpha(nodes);
    expect(nodes.map((n) => n.name)).toEqual(["b.md", "a.md"]);
  });
});

// ---------------------------------------------------------------------------
// features: bucket visibility & labels
// ---------------------------------------------------------------------------

function feature(id: string, enabled: boolean, names: Record<string, string> = {}): FeatureBucket {
  return { id, enabled, names };
}

function contentTreeWithBuckets(bucketNames: string[]): FileNode[] {
  const buckets: FileNode[] = bucketNames.map((name) => ({
    name,
    path: `/ws/content/${name}`,
    isDirectory: true,
    children: [makeFile("a.md", { path: `/ws/content/${name}/a.md` })],
  }));
  return [{ name: "content", path: "/ws/content", isDirectory: true, children: buckets }];
}

describe("forContentMode disabled-bucket marking (features)", () => {
  const opts = { workspaceRoot: "/ws", treeRoot: "/ws/content" };
  const find = (nodes: FileNode[], name: string) => nodes.find((n) => n.name === name);

  it("keeps a disabled bucket but tags it disabledForSite", () => {
    const result = forContentMode(contentTreeWithBuckets(["posts", "books"]), {
      ...opts,
      features: [feature("posts", true), feature("books", false)],
    });
    expect(result.map((n) => n.name).sort()).toEqual(["books", "posts"]);
    expect(find(result, "books")?.disabledForSite).toBe(true);
    expect(find(result, "posts")?.disabledForSite).toBeUndefined();
  });

  it("does not tag notes (no features entry)", () => {
    const result = forContentMode(contentTreeWithBuckets(["notes", "books"]), {
      ...opts,
      features: [feature("books", false)],
    });
    expect(find(result, "notes")?.disabledForSite).toBeUndefined();
    expect(find(result, "books")?.disabledForSite).toBe(true);
  });

  it("maps the flows folder to the singular flow feature id", () => {
    const result = forContentMode(contentTreeWithBuckets(["flows"]), {
      ...opts,
      features: [feature("flow", false)],
    });
    expect(find(result, "flows")?.disabledForSite).toBe(true);
  });

  it("follows posts.basePath when resolving the posts feature", () => {
    const result = forContentMode(contentTreeWithBuckets(["articles"]), {
      ...opts,
      postsBasePath: "articles",
      features: [feature("posts", false)],
    });
    expect(find(result, "articles")?.disabledForSite).toBe(true);
  });

  it("tags nothing when features is empty", () => {
    const result = forContentMode(contentTreeWithBuckets(["posts", "books"]), {
      ...opts,
      features: [],
    });
    expect(result.every((n) => !n.disabledForSite)).toBe(true);
  });
});

describe("bucketLabel", () => {
  const features = [
    feature("posts", true, { en: "Articles", zh: "文章" }),
    feature("series", true, { en: "Series", zh: "系列" }),
  ];

  it("returns the localized name for the exact UI locale", () => {
    expect(bucketLabel("posts", { features, locale: "en" })).toBe("Articles");
  });

  it("falls back to the language prefix (zh-CN -> zh)", () => {
    expect(bucketLabel("posts", { features, locale: "zh-CN" })).toBe("文章");
  });

  it("follows posts.basePath to find the posts feature", () => {
    expect(bucketLabel("articles", { features, postsBasePath: "articles", locale: "en" })).toBe(
      "Articles"
    );
  });

  it("falls back to the folder name when no feature or names configured", () => {
    expect(bucketLabel("notes", { features, locale: "en" })).toBe("notes");
    expect(bucketLabel("posts", { features: [], locale: "en" })).toBe("posts");
  });

  it("falls back to the folder name when the locale has no matching name", () => {
    expect(bucketLabel("posts", { features, locale: "fr" })).toBe("posts");
  });

  it("uses Ovid's localized label for notes (which has no features entry)", () => {
    const translate = (key: string) => (key === "sidebar.bucket.note" ? "笔记" : key);
    expect(bucketLabel("notes", { features, locale: "zh-CN", translate })).toBe("笔记");
  });

  it("prefers the features config name over the Ovid fallback", () => {
    const translate = (key: string) => (key === "sidebar.bucket.post" ? "Posts" : key);
    expect(bucketLabel("posts", { features, locale: "en", translate })).toBe("Articles");
  });

  it("falls back to the folder name when translate has no matching key", () => {
    const translate = (key: string) => key; // i18next returns the key when missing
    expect(bucketLabel("notes", { features, locale: "en", translate })).toBe("notes");
  });
});

// ---------------------------------------------------------------------------
// i18n translation grouping (forContentMode with locales)
// ---------------------------------------------------------------------------

describe("forContentMode translation grouping", () => {
  const opts = {
    workspaceRoot: "/ws",
    treeRoot: "/ws",
    locales: ["en", "zh"],
    defaultLocale: "en",
  };

  function page(name: string): FileNode {
    const node = makeFile(name, { path: `/ws/${name}` });
    node.extension = name.endsWith(".mdx") ? ".mdx" : ".md";
    return node;
  }

  it("groups a <slug>.<locale> variant under its base file", () => {
    const result = forContentMode([page("about.mdx"), page("about.zh.mdx")], opts);
    expect(result.map((n) => n.name)).toEqual(["about.mdx"]);
    expect(result[0].translations?.map((t) => t.name)).toEqual(["about.zh.mdx"]);
    expect(result[0].translations?.[0].locale).toBe("zh");
  });

  it("leaves a variant standalone when its base file is absent", () => {
    const result = forContentMode([page("solo.zh.mdx")], opts);
    expect(result.map((n) => n.name)).toEqual(["solo.zh.mdx"]);
    expect(result[0].translations).toBeUndefined();
  });

  it("does not group a dotless/CJK-titled file without a locale suffix", () => {
    const result = forContentMode([page("中文长标题.mdx"), page("post.mdx")], opts);
    expect(result.map((n) => n.name).sort()).toEqual(["post.mdx", "中文长标题.mdx"]);
  });

  it("does not group the default-locale variant", () => {
    const result = forContentMode([page("about.mdx"), page("about.en.mdx")], opts);
    expect(result.map((n) => n.name).sort()).toEqual(["about.en.mdx", "about.mdx"]);
    expect(result.find((n) => n.name === "about.mdx")?.translations).toBeUndefined();
  });

  it("does not group when no locales are configured", () => {
    const result = forContentMode([page("about.mdx"), page("about.zh.mdx")], {
      workspaceRoot: "/ws",
      treeRoot: "/ws",
    });
    expect(result.map((n) => n.name).sort()).toEqual(["about.mdx", "about.zh.mdx"]);
  });
});

describe("clampSidebarWidth", () => {
  const MIN = 180;
  const MAX = 480;

  it("returns the value unchanged when within range", () => {
    expect(clampSidebarWidth(240, MIN, MAX)).toBe(240);
  });

  it("clamps to the min and max bounds", () => {
    expect(clampSidebarWidth(120, MIN, MAX)).toBe(MIN);
    expect(clampSidebarWidth(999, MIN, MAX)).toBe(MAX);
  });

  it("respects a dynamic max below the static ceiling (keyboard/mouse parity)", () => {
    // With a compressed viewport the effective max is 300; growing from the
    // rendered width must stop there, not at the 480 static ceiling.
    expect(clampSidebarWidth(300 + 12, MIN, 300)).toBe(300);
    expect(clampSidebarWidth(288 + 12, MIN, 300)).toBe(300);
    expect(clampSidebarWidth(276 + 12, MIN, 300)).toBe(288);
  });
});

describe("nextSidebarWidth", () => {
  const MIN = 180;

  it("returns the nudged width when it changes the rendered width", () => {
    expect(nextSidebarWidth(240, 12, MIN, 480)).toBe(252);
    expect(nextSidebarWidth(240, -12, MIN, 480)).toBe(228);
  });

  it("returns null at the dynamic cap so a grow nudge keeps the stored preference", () => {
    // Rendered width is pinned at the dynamic max (300) while the stored
    // preference is larger (e.g. 480): a grow nudge must not overwrite it.
    expect(nextSidebarWidth(300, 12, MIN, 300)).toBeNull();
  });

  it("returns null for a zero-delta no-op (a plain resize-handle click)", () => {
    expect(nextSidebarWidth(300, 0, MIN, 300)).toBeNull();
  });

  it("still allows a visible shrink away from the cap", () => {
    expect(nextSidebarWidth(300, -12, MIN, 300)).toBe(288);
  });

  it("returns null at the min bound for a shrink nudge", () => {
    expect(nextSidebarWidth(MIN, -12, MIN, 480)).toBeNull();
  });
});
