import { describe, expect, test } from "bun:test";
import {
  buildPostTargetPath,
  getDuplicateNameSuggestion,
  getNewFromExistingNameSuggestion,
  getPathDisplayLabel,
  getPostEntryFileName,
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

  test("returns the actual entry filename for folder-backed and file-backed posts", () => {
    expect(getPostEntryFileName(makeNode("/workspace/posts/hello.md"))).toBe("hello.md");
    expect(
      getPostEntryFileName(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe("index.md");
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

  test("builds new-from-existing name suggestions from the post identity", () => {
    expect(getNewFromExistingNameSuggestion(makeNode("/workspace/posts/hello.md"))).toBe(
      "hello-new"
    );
    expect(
      getNewFromExistingNameSuggestion(
        makeNode("/workspace/posts/hello/index.md", {
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe("hello-new");
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

  test("builds post target paths for rename and duplicate flows", () => {
    expect(buildPostTargetPath(makeNode("/workspace/posts/hello.md"), "draft-copy")).toEqual({
      oldPath: "/workspace/posts/hello.md",
      newPath: "/workspace/posts/draft-copy.md",
      folderBacked: false,
      ext: ".md",
      entryFileName: "hello.md",
    });

    expect(
      buildPostTargetPath(
        makeNode("/workspace/posts/hello/index.mdx", {
          containerDirPath: "/workspace/posts/hello",
        }),
        "hello-copy"
      )
    ).toEqual({
      oldPath: "/workspace/posts/hello",
      newPath: "/workspace/posts/hello-copy",
      folderBacked: true,
      ext: ".mdx",
      entryFileName: "index.mdx",
    });
  });
});
