import { describe, expect, it } from "bun:test";
import {
  buildExpandedStorageKey,
  findAncestorPaths,
  getNodeExpanded,
  seedExpandedPaths,
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

describe("buildExpandedStorageKey", () => {
  it("uses a workspace-specific storage key when available", () => {
    expect(buildExpandedStorageKey("/workspace/site")).toBe("ovid:sidebarExpanded:/workspace/site");
  });

  it("falls back to the base key when no workspace is set", () => {
    expect(buildExpandedStorageKey(null)).toBe("ovid:sidebarExpanded");
  });
});

describe("shouldDefaultExpand", () => {
  it("expands shallow folders by default", () => {
    expect(shouldDefaultExpand(0)).toBe(true);
    expect(shouldDefaultExpand(1)).toBe(true);
  });

  it("collapses deeper folders by default", () => {
    expect(shouldDefaultExpand(2)).toBe(false);
    expect(shouldDefaultExpand(3)).toBe(false);
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

describe("seedExpandedPaths", () => {
  it("seeds unopened ancestors without overriding explicit collapse", () => {
    const current = {
      "/workspace/posts": false,
    };
    const ancestors = new Set(["/workspace/posts", "/workspace/posts/2024"]);

    expect(seedExpandedPaths(current, ancestors)).toEqual({
      "/workspace/posts": false,
      "/workspace/posts/2024": true,
    });
  });
});

describe("getNodeExpanded", () => {
  it("uses explicit persisted state when present", () => {
    expect(getNodeExpanded("/workspace/posts", 0, { "/workspace/posts": false })).toBe(false);
  });

  it("falls back to default depth-based expansion", () => {
    expect(getNodeExpanded("/workspace/posts", 0, {})).toBe(true);
    expect(getNodeExpanded("/workspace/posts/2024", 2, {})).toBe(false);
  });
});
