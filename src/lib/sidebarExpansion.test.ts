import { describe, expect, it } from "bun:test";
import {
  buildExpandedStorageKey,
  findAncestorPaths,
  forceExpandAncestors,
  getNodeExpanded,
  parseExpandedPaths,
  resolveEntryLabelClick,
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

  it("collapses top-level Content-mode buckets by default", () => {
    expect(shouldDefaultExpand(0, { isBucket: true })).toBe(false);
  });
});

describe("parseExpandedPaths", () => {
  it("returns empty state when nothing has been saved", () => {
    expect(parseExpandedPaths(null)).toEqual({ expandedPaths: {} });
  });

  it("returns empty state for malformed storage", () => {
    expect(parseExpandedPaths("{not json")).toEqual({ expandedPaths: {} });
  });

  it("rejects arrays and non-boolean values", () => {
    expect(parseExpandedPaths("[]")).toEqual({ expandedPaths: {} });
    expect(parseExpandedPaths('{"a":1,"b":"yes"}')).toEqual({ expandedPaths: {} });
  });

  it("restores saved expanded paths, filtering non-boolean values", () => {
    expect(
      parseExpandedPaths('{"/workspace/posts":true,"/workspace/flows":false,"bad":1}')
    ).toEqual({
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

  it("returns an empty set when the selected path is above the tree root", () => {
    expect(findAncestorPaths([makeDir("/workspace/posts", [])], "/workspace/missing.md")).toEqual(
      new Set()
    );
  });

  it("returns the ancestor chain even when tree branches have unloaded children", () => {
    const unloadedYear = makeUnloadedDir("/workspace/posts/2024");
    const posts = makeDir("/workspace/posts", [unloadedYear]);

    expect(findAncestorPaths([posts], "/workspace/posts/2024/hello.md")).toEqual(
      new Set(["/workspace/posts", "/workspace/posts/2024"])
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

  it("treats unset bucket rows as collapsed", () => {
    expect(getNodeExpanded("/workspace/content/notes", 0, {}, { isBucket: true })).toBe(false);
  });

  it("respects persisted expansion even when the row is a bucket", () => {
    expect(
      getNodeExpanded(
        "/workspace/content/notes",
        0,
        { "/workspace/content/notes": true },
        { isBucket: true }
      )
    ).toBe(true);
  });
});

describe("resolveEntryLabelClick", () => {
  it("collapses when the entry index is already selected and visible", () => {
    expect(resolveEntryLabelClick({ entrySelected: true, expanded: true })).toBe("collapse");
  });

  it("expands and selects when the row is closed", () => {
    expect(resolveEntryLabelClick({ entrySelected: false, expanded: false })).toBe(
      "expand-and-select"
    );
    expect(resolveEntryLabelClick({ entrySelected: true, expanded: false })).toBe(
      "expand-and-select"
    );
  });

  it("just selects when the row is already open but another file is active", () => {
    expect(resolveEntryLabelClick({ entrySelected: false, expanded: true })).toBe("select");
  });
});
