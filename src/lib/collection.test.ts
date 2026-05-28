import { describe, expect, it } from "bun:test";
import {
  addItem,
  type CollectionItem,
  itemKey,
  parseCollectionItems,
  postSlugOf,
  removeItem,
  resolveCollectionItems,
  setCollectionItems,
} from "./collection";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";

function flat(path: string, title?: string, containerDirPath?: string): FlatFile {
  const name = path.split("/").pop() ?? path;
  const node: FileNode = {
    name: containerDirPath ? (containerDirPath.split("/").pop() ?? name) : name,
    path,
    isDirectory: false,
    extension: name.endsWith(".mdx") ? ".mdx" : ".md",
    title,
    containerDirPath,
  };
  return { node, displayName: title ?? name, relativePath: name };
}

const COLLECTION_FILE = `---
type: collection
title: "Modern Web Development"
excerpt: "A curated path."
items:
  - post: asynchronous-javascript
  - series: nextjs-deep-dive
    label: "Deep dive"
---

Body text stays.
`;

describe("parseCollectionItems", () => {
  it("parses post and series items", () => {
    expect(parseCollectionItems(COLLECTION_FILE)).toEqual([
      { post: "asynchronous-javascript" },
      { series: "nextjs-deep-dive", label: "Deep dive" },
    ]);
  });

  it("returns [] when there is no items field", () => {
    expect(parseCollectionItems(`---\ntitle: "x"\n---\n`)).toEqual([]);
  });

  it("drops malformed entries", () => {
    const raw = `---\nitems:\n  - post: ok\n  - nope: bad\n  - 42\n---\n`;
    expect(parseCollectionItems(raw)).toEqual([{ post: "ok" }]);
  });
});

describe("postSlugOf", () => {
  it("strips extension", () => {
    expect(postSlugOf(flat("/ws/content/posts/asynchronous-javascript.mdx").node)).toBe(
      "asynchronous-javascript"
    );
  });
  it("strips a leading date prefix", () => {
    expect(postSlugOf(flat("/ws/content/posts/2026-02-11-syntax-showcase.mdx").node)).toBe(
      "syntax-showcase"
    );
  });
  it("uses the container folder name for folder-backed posts", () => {
    const node = flat(
      "/ws/content/posts/2026-01-15-nested-image-test/index.mdx",
      undefined,
      "/ws/content/posts/2026-01-15-nested-image-test"
    );
    expect(postSlugOf(node.node)).toBe("nested-image-test");
  });
});

describe("resolveCollectionItems", () => {
  const flatFiles = [
    flat("/ws/content/posts/asynchronous-javascript.mdx", "Async JS"),
    flat("/ws/content/posts/2026-02-11-react-hooks.mdx", "React Hooks"),
    flat("/ws/content/series/nextjs-deep-dive/index.mdx", "Next.js Deep Dive"),
  ];
  const opts = { contentRoot: "/ws/content", postsBasePath: "posts" };

  it("resolves a post item to its file node and title", () => {
    const [link] = resolveCollectionItems([{ post: "asynchronous-javascript" }], flatFiles, opts);
    expect(link.kind).toBe("post");
    expect(link.key).toBe("post:asynchronous-javascript");
    expect(link.node?.path).toBe("/ws/content/posts/asynchronous-javascript.mdx");
    expect(link.label).toBe("Async JS");
  });

  it("resolves a date-prefixed post by slug", () => {
    const [link] = resolveCollectionItems([{ post: "react-hooks" }], flatFiles, opts);
    expect(link.node?.path).toBe("/ws/content/posts/2026-02-11-react-hooks.mdx");
  });

  it("resolves a series item to its index, preferring an explicit label", () => {
    const [link] = resolveCollectionItems(
      [{ series: "nextjs-deep-dive", label: "Deep dive" }],
      flatFiles,
      opts
    );
    expect(link.kind).toBe("series");
    expect(link.node?.path).toBe("/ws/content/series/nextjs-deep-dive/index.mdx");
    expect(link.label).toBe("Deep dive");
  });

  it("leaves an unresolved item with no node and the slug as label", () => {
    const [link] = resolveCollectionItems([{ post: "ghost" }], flatFiles, opts);
    expect(link.node).toBeUndefined();
    expect(link.label).toBe("ghost");
  });
});

describe("addItem / removeItem / itemKey", () => {
  const items: CollectionItem[] = [{ post: "a" }, { series: "s" }];

  it("appends a new item", () => {
    expect(addItem(items, { post: "b" })).toHaveLength(3);
  });
  it("is a no-op for a duplicate key", () => {
    expect(addItem(items, { post: "a" })).toBe(items);
  });
  it("removes by key", () => {
    expect(removeItem(items, "series:s")).toEqual([{ post: "a" }]);
  });
  it("computes stable keys", () => {
    expect(itemKey({ post: "a" })).toBe("post:a");
    expect(itemKey({ series: "s" })).toBe("series:s");
  });
});

describe("setCollectionItems", () => {
  it("writes items while preserving other fields and the body", () => {
    const out = setCollectionItems(COLLECTION_FILE, [{ post: "x" }]);
    expect(out).toContain("type: collection");
    expect(out).toContain("Modern Web Development");
    expect(out).toContain("Body text stays.");
    const reparsed = parseCollectionItems(out);
    expect(reparsed).toEqual([{ post: "x" }]);
  });

  it("drops the items field entirely when empty", () => {
    const out = setCollectionItems(COLLECTION_FILE, []);
    expect(out).not.toContain("items:");
    expect(out).toContain("type: collection");
  });
});
