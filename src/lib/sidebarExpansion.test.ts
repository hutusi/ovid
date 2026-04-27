import { describe, expect, it } from "bun:test";
import {
  buildExpandedStorageKey,
  findAncestorPaths,
  findExpandedUnloadedPaths,
  forceExpandAncestors,
  getNodeExpanded,
  parseExpandedPaths,
  shouldDefaultExpand,
} from "./sidebarExpansion";
import type { FileNode } from "./types";

function makeFile(path: string): FileNode {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] ?? path,
    path,
    isDirectory: false,
    extension: ".md",
  };
}

function makeDir(path: string, children: FileNode[]): FileNode {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] ?? path,
    path,
    isDirectory: true,
    children,
  };
}

function makeUnloadedDir(path: string): FileNode {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] ?? path,
    path,
    isDirectory: true,
    childrenLoaded: false,
  };
}

describe("buildExpandedStorageKey", () => {
  it("uses a workspace-specific storage key when available", () => {
    expect(buildExpandedStorageKey("/workspace/site")).toBe("ovid:sidebarExpanded:/workspace/site");
  });

  it("falls back to the base key when no workspace is set", () => {
    expect(buildExpandedStorageKey(null)).toBe("ovid:sidebarExpanded");
  });
});

describe("shouldDefaultExpand", () => {
  it("expands only top-level folders by default", () => {
    expect(shouldDefaultExpand(0)).toBe(true);
    expect(shouldDefaultExpand(1)).toBe(false);
  });

  it("collapses deeper folders by default", () => {
    expect(shouldDefaultExpand(2)).toBe(false);
    expect(shouldDefaultExpand(3)).toBe(false);
  });
});

describe("parseExpandedPaths", () => {
  it("returns empty state when nothing has been saved", () => {
    expect(parseExpandedPaths(null)).toEqual({ expandedPaths: {} });
  });

  it("returns empty state for malformed storage", () => {
    expect(parseExpandedPaths("{not json")).toEqual({ expandedPaths: {} });
  });

  it("restores saved expanded paths", () => {
    expect(parseExpandedPaths('{"/workspace/posts":true,"/workspace/flows":false}')).toEqual({
      expandedPaths: {
        "/workspace/posts": true,
        "/workspace/flows": false,
      },
    });
  });
});

describe("findAncestorPaths", () => {
  it("returns the ancestor chain for the selected file", () => {
    const target = makeFile("/workspace/posts/2024/hello.md");
    const year = makeDir("/workspace/posts/2024", [target]);
    const posts = makeDir("/workspace/posts", [year]);

    expect(findAncestorPaths([posts], target.path)).toEqual(
      new Set(["/workspace/posts", "/workspace/posts/2024"])
    );
  });

  it("returns an empty set when the selected path is missing", () => {
    expect(findAncestorPaths([makeDir("/workspace/posts", [])], "/workspace/missing.md")).toEqual(
      new Set()
    );
  });
});

describe("forceExpandAncestors", () => {
  it("expands missing ancestors and overrides previous manual collapses", () => {
    const current = {
      "/workspace/posts": false,
    };
    const ancestors = new Set(["/workspace/posts", "/workspace/posts/2024"]);

    expect(forceExpandAncestors(current, ancestors)).toEqual({
      "/workspace/posts": true,
      "/workspace/posts/2024": true,
    });
  });

  it("returns the same reference when every ancestor is already expanded", () => {
    const current = {
      "/workspace/posts": true,
      "/workspace/posts/2024": true,
    };
    const ancestors = new Set(["/workspace/posts", "/workspace/posts/2024"]);

    expect(forceExpandAncestors(current, ancestors)).toBe(current);
  });
});

describe("getNodeExpanded", () => {
  it("uses explicit persisted state when present", () => {
    expect(getNodeExpanded("/workspace/posts", 0, { "/workspace/posts": false })).toBe(false);
  });

  it("falls back to default depth-based expansion", () => {
    expect(getNodeExpanded("/workspace/posts", 0, {})).toBe(true);
    expect(getNodeExpanded("/workspace/posts/2024", 1, {})).toBe(false);
  });
});

describe("findExpandedUnloadedPaths", () => {
  it("returns expanded directories whose children have not been fetched", () => {
    const tree = [makeUnloadedDir("/workspace/posts"), makeUnloadedDir("/workspace/books")];
    expect(
      findExpandedUnloadedPaths(tree, {
        "/workspace/posts": true,
        "/workspace/books": false,
      })
    ).toEqual(["/workspace/posts"]);
  });

  it("includes top-level directories by default when no state is persisted", () => {
    const tree = [makeUnloadedDir("/workspace/posts")];
    expect(findExpandedUnloadedPaths(tree, {})).toEqual(["/workspace/posts"]);
  });

  it("descends into already-loaded directories to find nested unloaded ones", () => {
    const nestedUnloaded = makeUnloadedDir("/workspace/posts/2024");
    const posts = makeDir("/workspace/posts", [nestedUnloaded]);
    expect(
      findExpandedUnloadedPaths([posts], {
        "/workspace/posts": true,
        "/workspace/posts/2024": true,
      })
    ).toEqual(["/workspace/posts/2024"]);
  });

  it("skips collapsed directories even when their children are unloaded", () => {
    const tree = [makeUnloadedDir("/workspace/posts")];
    expect(findExpandedUnloadedPaths(tree, { "/workspace/posts": false })).toEqual([]);
  });
});
