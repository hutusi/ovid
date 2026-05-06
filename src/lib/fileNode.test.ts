import { describe, expect, it } from "bun:test";
import { makeFileNodeFromPath } from "./fileNode";

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
