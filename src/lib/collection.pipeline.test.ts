import { describe, expect, it } from "bun:test";
import { parseCollectionItems, resolveCollectionItems } from "./collection";
import { flattenTree } from "./fileSearch";
import { findCollectionEntries, forContentMode } from "./sidebarUtils";
import type { FileNode } from "./types";

// End-to-end test for the runtime flatFiles → resolveCollectionItems pipeline,
// built from FileNode trees shaped like the actual Rust workspace walk emits
// for the my-garden sample. Catches mismatches that the synthetic-FlatFile
// unit tests in collection.test.ts can't see, because here `forContentMode`
// and `flattenTree` actually run on a real-looking tree first.

const ROOT_PATH = "/Users/test/my-garden";
const CONTENT_ROOT = `${ROOT_PATH}/content`;

function file(path: string, opts: { contentType?: string; title?: string } = {}): FileNode {
  const name = path.split("/").pop() ?? path;
  const ext = name.endsWith(".mdx") ? ".mdx" : name.endsWith(".md") ? ".md" : undefined;
  return {
    name,
    path,
    isDirectory: false,
    extension: ext,
    contentType: opts.contentType,
    title: opts.title,
  };
}

function dir(path: string, children: FileNode[]): FileNode {
  const name = path.split("/").pop() ?? path;
  return {
    name,
    path,
    isDirectory: true,
    children,
    childrenLoaded: true,
  };
}

// Mirrors my-garden: content/posts/* has flat posts + folder-backed posts with
// sibling assets; content/series/* has both a `type: collection` entry and a
// regular multi-chapter series.
function buildMyGardenTree(): FileNode[] {
  return [
    dir(`${ROOT_PATH}/content`, [
      dir(`${CONTENT_ROOT}/posts`, [
        file(`${CONTENT_ROOT}/posts/asynchronous-javascript.mdx`, { title: "Async JS" }),
        file(`${CONTENT_ROOT}/posts/understanding-react-hooks.mdx`, {
          title: "Understanding React Hooks",
        }),
        // Folder-backed post with sibling assets (kitchen-sink case).
        dir(`${CONTENT_ROOT}/posts/2026-01-21-kitchen-sink`, [
          dir(`${CONTENT_ROOT}/posts/2026-01-21-kitchen-sink/assets`, [
            file(`${CONTENT_ROOT}/posts/2026-01-21-kitchen-sink/assets/photo.png`),
          ]),
          file(`${CONTENT_ROOT}/posts/2026-01-21-kitchen-sink/index.mdx`, {
            title: "Kitchen Sink",
          }),
        ]),
      ]),
      dir(`${CONTENT_ROOT}/series`, [
        // The collection under test.
        dir(`${CONTENT_ROOT}/series/modern-web-dev`, [
          file(`${CONTENT_ROOT}/series/modern-web-dev/index.mdx`, {
            contentType: "collection",
            title: "Modern Web Development",
          }),
        ]),
        // A regular series with multiple chapters; the collection references
        // its index by `series: nextjs-deep-dive`.
        dir(`${CONTENT_ROOT}/series/nextjs-deep-dive`, [
          file(`${CONTENT_ROOT}/series/nextjs-deep-dive/index.mdx`, {
            title: "Next.js Deep Dive",
          }),
          dir(`${CONTENT_ROOT}/series/nextjs-deep-dive/02-routing-mastery`, [
            file(`${CONTENT_ROOT}/series/nextjs-deep-dive/02-routing-mastery/index.mdx`, {
              title: "Routing Mastery",
            }),
          ]),
        ]),
      ]),
    ]),
  ];
}

describe("collection-link pipeline (real forContentMode → flattenTree → resolveCollectionItems)", () => {
  const tree = buildMyGardenTree();
  // Mirrors useWorkspace.flatFiles wiring: forContentMode receives
  // (workspaceRoot=workspaceRootPath, treeRoot=workspaceRoot) — i.e. the
  // workspace's outer root and the content/ subtree.
  const projected = forContentMode(tree, {
    workspaceRoot: ROOT_PATH,
    treeRoot: CONTENT_ROOT,
    postsBasePath: "posts",
  });
  const flatFiles = flattenTree(projected);
  const opts = { contentRoot: CONTENT_ROOT, postsBasePath: "posts" };

  it("resolves a flat post item under content/posts", () => {
    const [link] = resolveCollectionItems([{ post: "asynchronous-javascript" }], flatFiles, opts);
    expect(link.node?.path).toBe(`${CONTENT_ROOT}/posts/asynchronous-javascript.mdx`);
    expect(link.label).toBe("Async JS");
  });

  it("resolves a second flat post item", () => {
    const [link] = resolveCollectionItems([{ post: "understanding-react-hooks" }], flatFiles, opts);
    expect(link.node?.path).toBe(`${CONTENT_ROOT}/posts/understanding-react-hooks.mdx`);
  });

  it("resolves a series item to its index.mdx", () => {
    const [link] = resolveCollectionItems([{ series: "nextjs-deep-dive" }], flatFiles, opts);
    expect(link.node?.path).toBe(`${CONTENT_ROOT}/series/nextjs-deep-dive/index.mdx`);
  });

  it("resolves a folder-backed post by its slug (date-stripped)", () => {
    const [link] = resolveCollectionItems([{ post: "kitchen-sink" }], flatFiles, opts);
    expect(link.node?.path).toBe(`${CONTENT_ROOT}/posts/2026-01-21-kitchen-sink/index.mdx`);
  });

  it("resolves all three modern-web-dev items in one call", () => {
    const links = resolveCollectionItems(
      [
        { post: "asynchronous-javascript" },
        { post: "understanding-react-hooks" },
        { series: "nextjs-deep-dive" },
      ],
      flatFiles,
      opts
    );
    expect(links.map((l) => l.node?.path)).toEqual([
      `${CONTENT_ROOT}/posts/asynchronous-javascript.mdx`,
      `${CONTENT_ROOT}/posts/understanding-react-hooks.mdx`,
      `${CONTENT_ROOT}/series/nextjs-deep-dive/index.mdx`,
    ]);
  });

  it("leaves a missing-slug item unresolved (sanity check on the negative case)", () => {
    const [link] = resolveCollectionItems([{ post: "ghost-post" }], flatFiles, opts);
    expect(link.node).toBeUndefined();
  });

  it("parses my-garden's verbatim modern-web-dev frontmatter and resolves all 3 items", () => {
    // Verbatim copy of content/series/modern-web-dev/index.mdx — exercises the
    // full pipeline including js-yaml frontmatter parse on the real string.
    const RAW = [
      "---",
      "type: collection",
      'title: "Modern Web Development"',
      'excerpt: "A curated path through modern web development: JavaScript fundamentals, React patterns, and deep Next.js mastery."',
      'date: "2026-03-01"',
      "featured: true",
      "items:",
      "  - post: asynchronous-javascript",
      "  - post: understanding-react-hooks",
      "  - series: nextjs-deep-dive",
      "---",
      "",
      "This collection assembles the essential reading for anyone building modern web applications.",
      "",
    ].join("\n");
    const items = parseCollectionItems(RAW);
    expect(items).toEqual([
      { post: "asynchronous-javascript" },
      { post: "understanding-react-hooks" },
      { series: "nextjs-deep-dive" },
    ]);
    const links = resolveCollectionItems(items, flatFiles, opts);
    // `every` returns true for []; assert the length so a regression that
    // drops links (rather than failing to resolve them) still fails.
    expect(links).toHaveLength(3);
    expect(links.every((l) => l.node !== undefined)).toBe(true);
  });

  it("findCollectionEntries picks up modern-web-dev with the same dirPath the sidebar uses to key into collectionLinks", () => {
    // The sidebar keys collectionLinks.get(node.path); the path it sees is the
    // forContentMode-projected directory path, which must equal the dirPath
    // findCollectionEntries records from the raw tree. Mismatch here would
    // make the sidebar render zero collection items.
    const entries = findCollectionEntries(tree, CONTENT_ROOT);
    expect(entries).toHaveLength(1);
    expect(entries[0].dirPath).toBe(`${CONTENT_ROOT}/series/modern-web-dev`);
    expect(entries[0].indexPath).toBe(`${CONTENT_ROOT}/series/modern-web-dev/index.mdx`);

    // The sidebar tree's modern-web-dev node must carry the same path.
    const series = projected.find((n) => n.name === "series");
    const collectionNode = series?.children?.find((n) => n.name === "modern-web-dev");
    expect(collectionNode?.path).toBe(entries[0].dirPath);
  });
});
