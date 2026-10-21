import { describe, expect, it } from "bun:test";
import { makeFileNodeFromPath, sameTree } from "./fileNode";
import type { FileNode } from "./types";

describe("makeFileNodeFromPath", () => {
  it("extracts the filename as name", () => {
    const node = makeFileNodeFromPath("/workspace/posts/hello.md");
    expect(node.name).toBe("hello.md");
    expect(node.path).toBe("/workspace/posts/hello.md");
    expect(node.isDirectory).toBe(false);
  });

  it("assigns .md extension", () => {
    expect(makeFileNodeFromPath("notes/todo.md").extension).toBe(".md");
  });

  it("assigns .mdx extension", () => {
    expect(makeFileNodeFromPath("pages/about.mdx").extension).toBe(".mdx");
  });

  it("leaves extension undefined for non-markdown files", () => {
    expect(makeFileNodeFromPath("assets/image.png").extension).toBeUndefined();
  });

  it("normalises Windows backslash separators", () => {
    const node = makeFileNodeFromPath("C:\\workspace\\post.md");
    expect(node.name).toBe("post.md");
    expect(node.extension).toBe(".md");
  });

  it("falls back to the full path as name when there is no separator", () => {
    const node = makeFileNodeFromPath("README.md");
    expect(node.name).toBe("README.md");
  });
});

describe("sameTree", () => {
  const tree = (): FileNode[] => [
    {
      name: "posts",
      path: "/ws/posts",
      isDirectory: true,
      children: [{ name: "a.md", path: "/ws/posts/a.md", isDirectory: false, title: "A" }],
    },
    { name: "about.md", path: "/ws/about.md", isDirectory: false, draft: true },
  ];

  it("treats structurally identical trees as the same", () => {
    expect(sameTree(tree(), tree())).toBe(true);
  });

  it("notices a changed title, draft flag, added file or reordering", () => {
    const retitled = tree();
    retitled[0].children = [
      { name: "a.md", path: "/ws/posts/a.md", isDirectory: false, title: "B" },
    ];
    expect(sameTree(tree(), retitled)).toBe(false);

    const published = tree();
    published[1] = { ...published[1], draft: false };
    expect(sameTree(tree(), published)).toBe(false);

    const added = tree();
    added.push({ name: "new.md", path: "/ws/new.md", isDirectory: false });
    expect(sameTree(tree(), added)).toBe(false);

    expect(sameTree(tree(), [...tree()].reverse())).toBe(false);
  });

  it("distinguishes an empty folder from an unloaded one", () => {
    const empty: FileNode[] = [{ name: "d", path: "/ws/d", isDirectory: true, children: [] }];
    const unloaded: FileNode[] = [{ name: "d", path: "/ws/d", isDirectory: true }];
    expect(sameTree(empty, unloaded)).toBe(false);
  });
});
