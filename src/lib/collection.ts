import { dump, load } from "js-yaml";
import type { FlatFile } from "./fileSearch";
import { joinFrontmatter, parseFrontmatter } from "./frontmatter";
import type { FileNode } from "./types";

// An Amytis "collection" (a series whose index.mdx has `type: collection`)
// references posts/series that live elsewhere via an `items:` frontmatter list.
// The item schema mirrors Amytis: `{ post }` or `{ series, exclude?, label? }`.
export type CollectionItem =
  | { post: string; label?: string }
  | { series: string; exclude?: string[]; label?: string };

export interface CollectionLink {
  /** Stable identity: `post:<slug>` or `series:<slug>`. */
  key: string;
  kind: "post" | "series";
  slug: string;
  label: string;
  /** Resolved target file node, or `undefined` for a broken reference. */
  node?: FileNode;
}

const FRONTMATTER_INNER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/;

function loadFrontmatterObject(rawFileText: string): Record<string, unknown> {
  const match = FRONTMATTER_INNER_RE.exec(rawFileText);
  if (!match) return {};
  try {
    const parsed = load(match[1]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isValidItem(value: unknown): value is CollectionItem {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.post === "string" || typeof obj.series === "string";
}

/** The `items:` list from a collection index file, or `[]` when absent/invalid. */
export function parseCollectionItems(rawFileText: string): CollectionItem[] {
  const items = loadFrontmatterObject(rawFileText).items;
  return Array.isArray(items) ? items.filter(isValidItem) : [];
}

/** Stable key for a collection item, matching `CollectionLink.key`. */
export function itemKey(item: CollectionItem): string {
  return "series" in item ? `series:${item.series}` : `post:${item.post}`;
}

/** The Amytis slug of a post node: filename (or folder name for folder-backed
 *  posts) without extension and without a leading `YYYY-MM-DD-` date prefix. */
export function postSlugOf(node: FileNode): string {
  const base = node.containerDirPath
    ? (node.containerDirPath.split("/").pop() ?? node.name)
    : node.name.replace(/\.mdx?$/i, "");
  return base.replace(DATE_PREFIX_RE, "");
}

/** Resolve each collection item to a navigable link, matching `{post}` slugs
 *  against files under the posts bucket and `{series}` slugs against the
 *  series' index file. Unresolved items keep `node: undefined`. */
export function resolveCollectionItems(
  items: CollectionItem[],
  flatFiles: FlatFile[],
  options: { contentRoot: string; postsBasePath?: string }
): CollectionLink[] {
  const postsDir = `${options.contentRoot}/${options.postsBasePath || "posts"}/`;
  return items.map((item) => {
    if ("series" in item) {
      const indexBase = `${options.contentRoot}/series/${item.series}/index.`;
      const match = flatFiles.find(
        (f) => f.node.path === `${indexBase}mdx` || f.node.path === `${indexBase}md`
      );
      return {
        key: `series:${item.series}`,
        kind: "series" as const,
        slug: item.series,
        label: item.label || match?.node.title || item.series,
        node: match?.node,
      };
    }
    const match = flatFiles.find(
      (f) => f.node.path.startsWith(postsDir) && postSlugOf(f.node) === item.post
    );
    return {
      key: `post:${item.post}`,
      kind: "post" as const,
      slug: item.post,
      label: item.label || match?.node.title || item.post,
      node: match?.node,
    };
  });
}

/** Append `item` unless an item with the same key already exists. */
export function addItem(items: CollectionItem[], item: CollectionItem): CollectionItem[] {
  const key = itemKey(item);
  return items.some((existing) => itemKey(existing) === key) ? items : [...items, item];
}

/** Remove the item whose key matches `key`. */
export function removeItem(items: CollectionItem[], key: string): CollectionItem[] {
  return items.filter((item) => itemKey(item) !== key);
}

/** Write `items` back into a collection index file, preserving its other
 *  frontmatter fields and body. Re-serialises the frontmatter block (comments
 *  are not preserved — same trade-off as the properties panel). */
export function setCollectionItems(rawFileText: string, items: CollectionItem[]): string {
  const obj = loadFrontmatterObject(rawFileText);
  if (items.length > 0) obj.items = items;
  else delete obj.items;
  const yaml = dump(obj, { lineWidth: -1 }).trimEnd();
  const { body } = parseFrontmatter(rawFileText);
  return joinFrontmatter(`---\n${yaml}\n---\n`, body);
}
