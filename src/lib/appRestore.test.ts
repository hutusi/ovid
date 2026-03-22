import { describe, expect, it } from "bun:test";
import { findNodeByPath, loadLastRecentFilePath, RECENT_FILES_KEY } from "./appRestore";
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

function makeStorage(entries: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem(key: string) {
      return entries[key] ?? null;
    },
  };
}

describe("loadLastRecentFilePath", () => {
  it("reads the first recent file from the workspace root key", () => {
    const workspace = "/workspace/site";
    const storage = makeStorage({
      [`${RECENT_FILES_KEY}:${workspace}`]: JSON.stringify([{ path: "/workspace/site/readme.md" }]),
    });

    expect(loadLastRecentFilePath(workspace, storage)).toBe("/workspace/site/readme.md");
  });

  it("falls back to the content tree key for Amytis workspaces", () => {
    const workspace = "/workspace/site";
    const storage = makeStorage({
      [`${RECENT_FILES_KEY}:${workspace}/content`]: JSON.stringify([
        { path: "/workspace/site/content/posts/hello.md" },
      ]),
    });

    expect(loadLastRecentFilePath(workspace, storage)).toBe(
      "/workspace/site/content/posts/hello.md"
    );
  });

  it("ignores malformed storage and returns null when nothing valid exists", () => {
    const workspace = "/workspace/site";
    const storage = makeStorage({
      [`${RECENT_FILES_KEY}:${workspace}`]: "{bad json",
    });

    expect(loadLastRecentFilePath(workspace, storage)).toBeNull();
  });
});

describe("findNodeByPath", () => {
  it("finds nested file nodes by path", () => {
    const deep = makeFile("/workspace/posts/2024/hello.md");
    const tree = [makeDir("/workspace/posts", [makeDir("/workspace/posts/2024", [deep])])];

    expect(findNodeByPath(tree, deep.path)).toBe(deep);
  });

  it("returns undefined when the path does not exist", () => {
    expect(findNodeByPath([makeFile("/workspace/a.md")], "/workspace/missing.md")).toBeUndefined();
  });
});
