import { describe, expect, it } from "bun:test";
import { buildNewContent, type ScaffoldInput, slugify } from "./amytisScaffold";

const base = {
  date: "2026-05-28",
  contentRoot: "/ws/content",
  basePath: "posts",
  dirPath: "/ws/content/series/my-series",
} satisfies Omit<ScaffoldInput, "kind" | "title">;

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("My Great Post")).toBe("my-great-post");
  });
  it("trims leading/trailing separators and collapses runs", () => {
    expect(slugify("  Hello --- World!  ")).toBe("hello-world");
  });
  it("keeps CJK characters", () => {
    expect(slugify("你好 世界")).toBe("你好-世界");
  });
  it("falls back to 'untitled' when the title has no slug characters", () => {
    expect(slugify("!!!")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
  });
});

describe("buildNewContent", () => {
  it("post: date-prefixed flat .mdx in the basePath bucket", () => {
    const out = buildNewContent({ ...base, kind: "post", title: "My Great Post" });
    expect(out.filePath).toBe("/ws/content/posts/2026-05-28-my-great-post.mdx");
    expect(out.dirsToCreate).toEqual(["/ws/content/posts"]);
    expect(out.content).toContain('title: "My Great Post"');
    expect(out.content).toContain('layout: "post"');
    expect(out.content).not.toContain("type:");
  });

  it("post: honors a custom basePath and the workspace template", () => {
    const out = buildNewContent({
      ...base,
      basePath: "articles",
      kind: "post",
      title: "Hello",
      postTemplate: '---\ntitle: "{{title}}"\ndate: "{{date}}"\nlayout: "custom"\n---\n\nbody\n',
    });
    expect(out.filePath).toBe("/ws/content/articles/2026-05-28-hello.mdx");
    expect(out.content).toContain('layout: "custom"');
    expect(out.content).toContain('title: "Hello"');
    expect(out.content).toContain('date: "2026-05-28"');
  });

  it("series: folder-backed index.mdx with an images dir", () => {
    const out = buildNewContent({ ...base, kind: "series", title: "Next.js Deep Dive" });
    expect(out.filePath).toBe("/ws/content/series/next-js-deep-dive/index.mdx");
    expect(out.dirsToCreate).toEqual([
      "/ws/content/series/next-js-deep-dive",
      "/ws/content/series/next-js-deep-dive/images",
    ]);
    expect(out.content).toContain('title: "Next.js Deep Dive"');
    expect(out.content).toContain("coverImage:");
  });

  it("seriesPost: flat .mdx inside the series folder, no date prefix", () => {
    const out = buildNewContent({ ...base, kind: "seriesPost", title: "Part 3" });
    expect(out.filePath).toBe("/ws/content/series/my-series/part-3.mdx");
    expect(out.dirsToCreate).toEqual(["/ws/content/series/my-series"]);
    expect(out.content).toContain('layout: "post"');
  });

  it("note: flat .mdx with tags and aliases", () => {
    const out = buildNewContent({ ...base, kind: "note", title: "Tailwind v4" });
    expect(out.filePath).toBe("/ws/content/notes/tailwind-v4.mdx");
    expect(out.dirsToCreate).toEqual(["/ws/content/notes"]);
    expect(out.content).toContain("aliases: []");
  });

  it("book: folder-backed index.mdx with chapters and author", () => {
    const out = buildNewContent({
      ...base,
      kind: "book",
      title: "The Handbook",
      defaultAuthor: "John Hu",
    });
    expect(out.filePath).toBe("/ws/content/books/the-handbook/index.mdx");
    expect(out.dirsToCreate).toEqual([
      "/ws/content/books/the-handbook",
      "/ws/content/books/the-handbook/images",
    ]);
    expect(out.content).toContain("chapters: []");
    expect(out.content).toContain("- John Hu");
  });

  it("chapter: flat .mdx with title/excerpt inside the book folder", () => {
    const out = buildNewContent({
      ...base,
      dirPath: "/ws/content/books/the-handbook",
      kind: "chapter",
      title: "Introduction",
    });
    expect(out.filePath).toBe("/ws/content/books/the-handbook/introduction.mdx");
    expect(out.content).toContain('title: "Introduction"');
    expect(out.content).toContain('excerpt: ""');
  });

  it("escapes double quotes in titles to keep YAML valid", () => {
    const out = buildNewContent({ ...base, kind: "note", title: 'A "quoted" title' });
    expect(out.content).toContain('title: "A \\"quoted\\" title"');
  });

  it("post: folder layout nests index under a date-prefixed folder with images", () => {
    const out = buildNewContent({
      ...base,
      kind: "post",
      title: "My Great Post",
      layout: "folder",
    });
    expect(out.filePath).toBe("/ws/content/posts/2026-05-28-my-great-post/index.mdx");
    expect(out.dirsToCreate).toEqual([
      "/ws/content/posts/2026-05-28-my-great-post",
      "/ws/content/posts/2026-05-28-my-great-post/images",
    ]);
  });

  it("note: md format produces a flat .md file", () => {
    const out = buildNewContent({ ...base, kind: "note", title: "Tailwind v4", format: "md" });
    expect(out.filePath).toBe("/ws/content/notes/tailwind-v4.md");
    expect(out.dirsToCreate).toEqual(["/ws/content/notes"]);
  });

  it("page: folder layout with md format nests index.md", () => {
    const out = buildNewContent({
      ...base,
      kind: "page",
      title: "About",
      format: "md",
      layout: "folder",
    });
    expect(out.filePath).toBe("/ws/content/about/index.md");
    expect(out.dirsToCreate).toEqual(["/ws/content/about", "/ws/content/about/images"]);
  });

  it("generic: stays a flat .md file regardless of format/layout", () => {
    const out = buildNewContent({
      ...base,
      dirPath: "/ws/content/misc",
      kind: "generic",
      title: "Scratch",
      format: "mdx",
      layout: "folder",
    });
    expect(out.filePath).toBe("/ws/content/misc/scratch.md");
    expect(out.dirsToCreate).toEqual(["/ws/content/misc"]);
  });

  it("series: folder layout is unchanged but format sets the index extension", () => {
    const out = buildNewContent({
      ...base,
      kind: "series",
      title: "Deep Dive",
      format: "md",
      layout: "file",
    });
    expect(out.filePath).toBe("/ws/content/series/deep-dive/index.md");
    expect(out.dirsToCreate).toEqual([
      "/ws/content/series/deep-dive",
      "/ws/content/series/deep-dive/images",
    ]);
  });
});
