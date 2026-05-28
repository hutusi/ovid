import { describe, expect, test } from "bun:test";
import {
  buildNewEntryPaths,
  buildPostTargetPath,
  getDuplicateNameSuggestion,
  getNewFromExistingNameSuggestion,
  getPathDisplayLabel,
  getPostEntryFileName,
  getPostEntrySourcePath,
  getRenamePathDialogState,
  isFolderBackedPostNode,
  isFolderBackedType,
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
    // collapsed node: name is overwritten to folder name by collapseIndexNodes
    expect(
      getPathDisplayLabel(
        makeNode("/workspace/posts/hello/index.md", {
          name: "hello",
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toBe("hello/index.md");
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
    // collapsed node: name is overwritten to folder name by collapseIndexNodes
    expect(
      getRenamePathDialogState(
        makeNode("/workspace/posts/hello/index.md", {
          name: "hello",
          containerDirPath: "/workspace/posts/hello",
        })
      )
    ).toEqual({
      currentPath: "hello/index.md",
      currentName: "hello",
      suffix: "/index.md",
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

  test("isFolderBackedType covers post/series/book only", () => {
    expect(isFolderBackedType("post")).toBe(true);
    expect(isFolderBackedType("series")).toBe(true);
    expect(isFolderBackedType("book")).toBe(true);
    expect(isFolderBackedType("note")).toBe(false);
    expect(isFolderBackedType("page")).toBe(false);
    expect(isFolderBackedType("flow")).toBe(false);
    expect(isFolderBackedType(undefined)).toBe(false);
  });

  test("buildNewEntryPaths creates a folder-backed index for folder-backed types", () => {
    expect(buildNewEntryPaths("/ws/content/series", "my-series", "series")).toEqual({
      containerDir: "/ws/content/series/my-series",
      filePath: "/ws/content/series/my-series/index.md",
    });
    expect(buildNewEntryPaths("/ws/content/books", "my-book", "book")).toEqual({
      containerDir: "/ws/content/books/my-book",
      filePath: "/ws/content/books/my-book/index.md",
    });
  });

  test("buildNewEntryPaths creates a flat file for flat or untyped content", () => {
    expect(buildNewEntryPaths("/ws/content/notes", "a-note", "note")).toEqual({
      filePath: "/ws/content/notes/a-note.md",
    });
    expect(buildNewEntryPaths("/ws/content", "untitled")).toEqual({
      filePath: "/ws/content/untitled.md",
    });
  });
});
