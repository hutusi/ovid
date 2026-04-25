import { describe, expect, test } from "bun:test";
import {
  getDuplicateNameSuggestion,
  getPathDisplayLabel,
  getPostEntrySourcePath,
  getRenamePathDialogState,
  isFolderBackedPostNode,
} from "./postPath";
import type { FileNode } from "./types";

function makeNode(path: string, overrides: Partial<FileNode> = {}): FileNode {
  const name = path.split("/").pop() ?? path;
  return {
    name,
    path,
    isDirectory: false,
    extension: name.endsWith(".mdx") ? ".mdx" : ".md",
    ...overrides,
  };
}

describe("postPath", () => {
  test("detects file-backed and folder-backed posts", () => {
    expect(isFolderBackedPostNode(makeNode("/workspace/posts/hello.md"))).toBe(false);
    expect(
      isFolderBackedPostNode(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe(true);
    expect(isFolderBackedPostNode(makeNode("/workspace/posts/hello/index.mdx"))).toBe(true);
  });

  test("resolves post entry source path for duplicate and rename actions", () => {
    expect(getPostEntrySourcePath(makeNode("/workspace/posts/hello.md"))).toBe(
      "/workspace/posts/hello.md"
    );
    expect(
      getPostEntrySourcePath(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe("/workspace/posts/hello");
    expect(getPostEntrySourcePath(makeNode("/workspace/posts/hello/index.mdx"))).toBe(
      "/workspace/posts/hello"
    );
  });

  test("builds duplicate name suggestions from the post identity", () => {
    expect(getDuplicateNameSuggestion(makeNode("/workspace/posts/hello.md"))).toBe("hello-copy");
    expect(
      getDuplicateNameSuggestion(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe("hello-copy");
    expect(getDuplicateNameSuggestion(makeNode("/workspace/posts/hello/index.mdx"))).toBe(
      "hello-copy"
    );
  });

  test("builds path display labels for file-backed and folder-backed posts", () => {
    expect(getPathDisplayLabel(makeNode("/workspace/posts/hello.md"))).toBe("hello.md");
    expect(
      getPathDisplayLabel(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe("hello/index.md");
    expect(getPathDisplayLabel(makeNode("/workspace/posts/hello/index.mdx"))).toBe(
      "hello/index.mdx"
    );
  });

  test("builds rename dialog state with fixed suffixes", () => {
    expect(getRenamePathDialogState(makeNode("/workspace/posts/hello.md"))).toEqual({
      currentPath: "hello.md",
      currentName: "hello",
      suffix: ".md",
    });
    expect(
      getRenamePathDialogState(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toEqual({
      currentPath: "hello/index.md",
      currentName: "hello",
      suffix: "/index.md",
    });
    expect(getRenamePathDialogState(makeNode("/workspace/posts/hello/index.mdx"))).toEqual({
      currentPath: "hello/index.mdx",
      currentName: "hello",
      suffix: "/index.mdx",
    });
  });
});
