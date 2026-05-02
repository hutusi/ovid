import { describe, expect, test } from "bun:test";
import type { FileNode } from "./types";
import { getExternalWorkspaceChangeAction } from "./workspaceRefresh";

function makeFile(path: string): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    isDirectory: false,
    extension: ".md",
  };
}

function makeDir(path: string, children: FileNode[]): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    isDirectory: true,
    children,
  };
}

describe("getExternalWorkspaceChangeAction", () => {
  test("does nothing when there is no active file", () => {
    expect(
      getExternalWorkspaceChangeAction({
        activeFile: null,
        revision: "1",
        tree: [makeFile("/workspace/post.md")],
        saveStatus: "saved",
        lastWarnedRevision: null,
      })
    ).toEqual({ type: "none" });
  });

  test("reloads the matching node for a saved active file", () => {
    const activeFile = makeFile("/workspace/posts/hello.md");
    const refreshedNode = { ...activeFile, title: "Updated" };

    expect(
      getExternalWorkspaceChangeAction({
        activeFile,
        revision: "2",
        tree: [makeDir("/workspace/posts", [refreshedNode])],
        saveStatus: "saved",
        lastWarnedRevision: null,
      })
    ).toEqual({ type: "reload-active-file", node: refreshedNode });
  });

  test("reloads by the active path when the refreshed tree is still shallow", () => {
    const activeFile = makeFile("/workspace/posts/2026/hello.md");

    expect(
      getExternalWorkspaceChangeAction({
        activeFile,
        revision: "3",
        tree: [makeDir("/workspace/posts", [])],
        saveStatus: "saved",
        lastWarnedRevision: null,
      })
    ).toEqual({ type: "reload-active-file", node: activeFile });
  });

  test("warns without reloading when the active file has unsaved edits", () => {
    const activeFile = makeFile("/workspace/posts/hello.md");

    expect(
      getExternalWorkspaceChangeAction({
        activeFile,
        revision: "4",
        tree: [activeFile],
        saveStatus: "unsaved",
        lastWarnedRevision: null,
      })
    ).toEqual({ type: "warn-unsaved", revision: "4" });
  });

  test("does not repeat the unsaved warning for the same revision", () => {
    const activeFile = makeFile("/workspace/posts/hello.md");

    expect(
      getExternalWorkspaceChangeAction({
        activeFile,
        revision: "4",
        tree: [activeFile],
        saveStatus: "unsaved",
        lastWarnedRevision: "4",
      })
    ).toEqual({ type: "none" });
  });

  test("closes the active file when disk reload fails", () => {
    const activeFile = makeFile("/workspace/posts/hello.md");

    expect(
      getExternalWorkspaceChangeAction({
        activeFile,
        revision: "5",
        tree: [],
        saveStatus: "saved",
        reloadSucceeded: false,
        lastWarnedRevision: null,
      })
    ).toEqual({ type: "close-active-file" });
  });

  test("keeps the active file open when disk reload fails but the file still exists", () => {
    const activeFile = makeFile("/workspace/posts/hello.md");

    expect(
      getExternalWorkspaceChangeAction({
        activeFile,
        revision: "6",
        tree: [makeDir("/workspace/posts", [activeFile])],
        saveStatus: "saved",
        reloadSucceeded: false,
        lastWarnedRevision: null,
      })
    ).toEqual({ type: "none" });
  });
});
