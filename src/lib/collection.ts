import type { FlatFile } from "./fileSearch";
import {
  joinFrontmatter,
  loadFrontmatterBlock,
  parseFrontmatter,
  setFrontmatterKey,
} from "./frontmatter";
import type { CollectionItem, FileNode } from "./types";

// An Amytis "collection" (a series whose index.mdx has `type: collection`)
// references posts/series that live elsewhere via an `items:` frontmatter list.
export type { CollectionItem };

export interface CollectionLink {
  /** Stable identity: `post:<slug>` or `series:<slug>`. */
  key: string;
  kind: "post" | "series";
  slug: string;
  label: string;
  /** Resolved target file node, or `undefined` for a broken reference. */
  node?: FileNode;
}

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/;

function isValidItem(value: unknown): value is CollectionItem {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.post === "string" || typeof obj.series === "string";
}

/** The `items:` list from a collection index file, or `[]` when absent/invalid. */
export function parseCollectionItems(rawFileText: string): CollectionItem[] {
  const loaded = loadFrontmatterBlock(rawFileText);
  const items = loaded.ok ? loaded.data.items : undefined;
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

export interface CollectionCandidate {
  key: string;
  kind: "post" | "series";
  label: string;
  item: CollectionItem;
}

/** Posts and series that can be added to a collection: every post under the
 *  posts bucket and every series index, minus items already present and the
 *  collection's own index. */
export function collectionCandidates(
  flatFiles: FlatFile[],
  options: { contentRoot: string; postsBasePath?: string },
  existing: CollectionItem[],
  selfIndexPath?: string
): CollectionCandidate[] {
  const existingKeys = new Set(existing.map(itemKey));
  const postsDir = `${options.contentRoot}/${options.postsBasePath || "posts"}/`;
  const seriesDir = `${options.contentRoot}/series/`;
  const seen = new Set<string>();
  const out: CollectionCandidate[] = [];
  for (const f of flatFiles) {
    const path = f.node.path;
    if (path === selfIndexPath) continue;
    let candidate: CollectionCandidate | undefined;
    if (path.startsWith(postsDir)) {
      const slug = postSlugOf(f.node);
      candidate = {
        key: `post:${slug}`,
        kind: "post",
        label: f.node.title || slug,
        item: { post: slug },
      };
    } else if (path.startsWith(seriesDir)) {
      const rest = path.slice(seriesDir.length);
      const slug = rest.split("/")[0];
      if (slug && (rest === `${slug}/index.mdx` || rest === `${slug}/index.md`)) {
        candidate = {
          key: `series:${slug}`,
          kind: "series",
          label: f.node.title || slug,
          item: { series: slug },
        };
      }
    }
    if (!candidate || existingKeys.has(candidate.key) || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    out.push(candidate);
  }
  return out;
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

/** Write `items` back into a collection index file, leaving its other
 *  frontmatter (dates, comments, nested values) and body as they were. Null
 *  when the frontmatter YAML can't be parsed — rewriting it then would destroy
 *  every field we couldn't read. */
export function setCollectionItems(rawFileText: string, items: CollectionItem[]): string | null {
  const { frontmatter, body } = parseFrontmatter(rawFileText);
  const edit = setFrontmatterKey(frontmatter, "items", items.length > 0 ? items : undefined);
  return edit.ok ? joinFrontmatter(edit.block, body) : null;
}
