import type { FeatureBucket } from "./commands/generated/FeatureBucket";
import type { FileNode, GitStatus } from "./types";

export const GIT_PRIORITY: GitStatus[] = ["staged", "modified", "untracked"];

function isIndexMarkdownFile(node: FileNode): boolean {
  return !node.isDirectory && /^index\.mdx?$/.test(node.name);
}

export function collapseIndexNodes(nodes: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (!node.isDirectory) return node;

    const children = collapseIndexNodes(node.children ?? []);
    const rawChildren = node.children ?? [];

    if (rawChildren.length === 1 && isIndexMarkdownFile(rawChildren[0]) && children.length === 1) {
      return {
        ...children[0],
        name: node.name,
        containerDirPath: node.path,
      };
    }

    return {
      ...node,
      children,
    };
  });
}

export function rollupGitStatus(
  node: FileNode,
  map: Map<string, GitStatus>
): GitStatus | undefined {
  if (!node.isDirectory) return map.get(node.path);
  let best: GitStatus | undefined;
  for (const child of node.children ?? []) {
    const childStatus = rollupGitStatus(child, map);
    if (!childStatus) continue;
    if (!best || GIT_PRIORITY.indexOf(childStatus) < GIT_PRIORITY.indexOf(best)) {
      best = childStatus;
    }
  }
  return best;
}

export function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const q = query.toLowerCase();
  return nodes.flatMap((node) => {
    if (node.isDirectory) {
      if (node.name.toLowerCase().includes(q)) return [node];
      const filtered = filterTree(node.children ?? [], q);
      return filtered.length > 0 ? [{ ...node, children: filtered }] : [];
    }
    const matches =
      node.name.toLowerCase().includes(q) || node.title?.toLowerCase().includes(q) === true;
    return matches ? [node] : [];
  });
}

// ---------------------------------------------------------------------------
// Content-type ordering
// ---------------------------------------------------------------------------

const CONTENT_TYPE_RANK: Record<string, number> = {
  flow: 0,
  note: 1,
  post: 2,
  series: 3,
  book: 4,
  // unknown types (no contentType) get rank 5
  page: 6,
};

/** Maps a top-level content bucket's folder name to its content type. Amytis
 *  derives a file's type from its folder (frontmatter has no `type:` field), so
 *  the bucket directory directly under `content/` is the source of truth.
 *  These are the Amytis default bucket names. */
const BUCKET_CONTENT_TYPE: Record<string, string> = {
  flows: "flow",
  notes: "note",
  posts: "post",
  series: "series",
  books: "book",
  pages: "page",
};

/** Content type for a top-level content bucket folder, or `undefined` when the
 *  folder isn't a recognised bucket. The posts bucket follows `posts.basePath`
 *  from site.config (default `posts`). Used to label the layer-aware "New X"
 *  context-menu action; the sidebar threads it down so nested folders (e.g. an
 *  individual series) inherit their bucket's type. */
export function getBucketContentType(
  folderName: string,
  postsBasePath = "posts"
): string | undefined {
  if (folderName === postsBasePath) return "post";
  return BUCKET_CONTENT_TYPE[folderName];
}

/** Maps a top-level bucket folder name to its `features:` block id (the keys
 *  Amytis declares: `posts` / `series` / `books` / `flow`). The posts bucket
 *  follows `posts.basePath`; the flow bucket lives in a `flows/` folder but its
 *  feature key is singular `flow`. Returns `undefined` for folders Amytis does
 *  not feature-gate (e.g. `notes`, which has no `features` entry and is always
 *  shown). */
function bucketFeatureId(folderName: string, postsBasePath = "posts"): string | undefined {
  if (folderName === postsBasePath) return "posts";
  if (folderName === "series") return "series";
  if (folderName === "books") return "books";
  if (folderName === "flows") return "flow";
  return undefined;
}

/** A top-level bucket is shown unless its `features:` entry is explicitly
 *  `enabled: false`. Buckets with no feature id (notes) or no matching entry
 *  default to shown — content mode mirrors the published site, and Files mode
 *  remains the escape hatch to a disabled folder. */
function isBucketEnabled(
  folderName: string,
  features: FeatureBucket[] | undefined,
  postsBasePath?: string
): boolean {
  if (!features || features.length === 0) return true;
  const id = bucketFeatureId(folderName, postsBasePath);
  if (!id) return true;
  const feature = features.find((f) => f.id === id);
  return feature ? feature.enabled : true;
}

type Translate = (key: string, vars?: Record<string, unknown>) => string;

/** The display label for a top-level bucket, resolved in order:
 *  1. the localized name from the `features:` block (`features.<id>.name.<locale>`),
 *     trying the exact UI locale then its language prefix (`zh-CN` → `zh`);
 *  2. Ovid's own localized label for the recognized bucket type
 *     (`sidebar.bucket.<type>`) — covers `notes`, which Amytis omits from
 *     `features`, and any bucket whose config name is missing for the active locale;
 *  3. the raw folder name. */
export function bucketLabel(
  folderName: string,
  options: {
    features?: FeatureBucket[];
    postsBasePath?: string;
    locale?: string;
    translate?: Translate;
  }
): string {
  const { features, postsBasePath, locale, translate } = options;
  const id = bucketFeatureId(folderName, postsBasePath);
  if (features && features.length > 0 && id) {
    const names = features.find((f) => f.id === id)?.names;
    if (names) {
      const prefix = locale?.split("-")[0];
      const localized = (locale && names[locale]) || (prefix && names[prefix]);
      if (localized) return localized;
    }
  }
  const type = getBucketContentType(folderName, postsBasePath);
  if (type && translate) {
    const key = `sidebar.bucket.${type}`;
    const label = translate(key);
    if (label && label !== key) return label;
  }
  return folderName;
}

function nodeRank(node: FileNode): number {
  if (node.isDirectory) return -1; // directories always first
  return CONTENT_TYPE_RANK[node.contentType ?? ""] ?? 5;
}

/** Sort nodes: directories first (alphabetical), then files by content-type
 *  priority (flow → note → post → series → book → unknown → page),
 *  alphabetical within each group. */
export function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    const diff = nodeRank(a) - nodeRank(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function sortTree(nodes: FileNode[]): FileNode[] {
  return sortNodes(nodes).map((node) => {
    if (!node.isDirectory) return node;
    return {
      ...node,
      children: sortTree(node.children ?? []),
    };
  });
}

/** Drop dotfiles, non-content files, and directories that have no content
 *  descendants after the filter. Content mode shows markdown (`.md`/`.mdx`) plus
 *  reStructuredText (`.rst`), which Amytis also publishes; `.rst` opens
 *  read-only (see `isReadOnlyContent`). */
function filterContentNodes(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => {
    if (node.name.startsWith(".")) return [];
    if (node.isDirectory) {
      const children = filterContentNodes(node.children ?? []);
      if (children.length === 0) return [];
      return [{ ...node, children }];
    }
    return /\.(mdx?|rst)$/i.test(node.name) ? [node] : [];
  });
}

/** Find a directory node by absolute path within a tree and return its
 *  children (or `undefined` when not found). Used to scope the canonical
 *  workspace tree into the `content/` subtree for Amytis workspaces. */
function findChildrenByPath(nodes: FileNode[], path: string): FileNode[] | undefined {
  for (const node of nodes) {
    if (node.path === path) return node.isDirectory ? (node.children ?? []) : undefined;
    if (node.children) {
      const found = findChildrenByPath(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

/** True when a top-level bucket holds collection entries (series/books). Their
 *  direct child folders are collections, not folder-backed posts, so they must
 *  NOT be collapsed into single file nodes — otherwise a series whose only
 *  markdown child is `index.mdx` would render (and behave) like a post. */
function isCollectionBucket(folderName: string, postsBasePath?: string): boolean {
  const type = getBucketContentType(folderName, postsBasePath);
  return type === "series" || type === "book";
}

/** Parse a localized filename `<base>.<locale>.<ext>` (Amytis translation
 *  convention). Returns the base filename (`<base>.<ext>`) and the locale, but
 *  only when the trailing stem segment is one of the configured `locales` — so
 *  a CJK-titled or dotted filename without a real locale suffix is left alone. */
function parseLocaleVariant(
  name: string,
  locales: string[]
): { base: string; locale: string } | null {
  const extMatch = name.match(/\.(mdx?|rst)$/i);
  if (!extMatch) return null;
  const ext = extMatch[0];
  const stem = name.slice(0, -ext.length);
  const dot = stem.lastIndexOf(".");
  if (dot < 0) return null;
  const locale = stem.slice(dot + 1);
  if (!locales.includes(locale)) return null;
  return { base: stem.slice(0, dot) + ext, locale };
}

/** Group `<slug>.<locale>` translation files under their base `<slug>` file
 *  among a single directory level's siblings. A variant is only folded in when
 *  its locale is non-default and the base file exists; otherwise it stays a
 *  standalone row. The base node gains a `translations` array; each variant is
 *  tagged with its `locale` for the sidebar badge. */
function groupTranslations(
  nodes: FileNode[],
  locales: string[],
  defaultLocale?: string
): FileNode[] {
  if (locales.length === 0) return nodes;
  const baseNames = new Set(nodes.filter((n) => !n.isDirectory).map((n) => n.name));
  const translationsByBase = new Map<string, FileNode[]>();
  const consumed = new Set<string>();

  for (const node of nodes) {
    if (node.isDirectory) continue;
    const variant = parseLocaleVariant(node.name, locales);
    if (!variant || variant.locale === defaultLocale || !baseNames.has(variant.base)) continue;
    const list = translationsByBase.get(variant.base) ?? [];
    list.push({ ...node, locale: variant.locale });
    translationsByBase.set(variant.base, list);
    consumed.add(node.name);
  }
  if (consumed.size === 0) return nodes;

  return nodes
    .filter((node) => !consumed.has(node.name))
    .map((node) => {
      const translations = translationsByBase.get(node.name);
      if (!translations) return node;
      translations.sort((a, b) => (a.locale ?? "").localeCompare(b.locale ?? ""));
      return { ...node, translations };
    });
}

/** Apply `groupTranslations` at every directory level of a projected tree. */
function groupTranslationsDeep(
  nodes: FileNode[],
  locales: string[],
  defaultLocale?: string
): FileNode[] {
  return groupTranslations(nodes, locales, defaultLocale).map((node) =>
    node.isDirectory
      ? { ...node, children: groupTranslationsDeep(node.children ?? [], locales, defaultLocale) }
      : node
  );
}

/** Project the canonical workspace tree into the shape Content mode renders.
 *  For Amytis workspaces (`workspaceRoot !== treeRoot`) the tree is first
 *  scoped into the `content/` subtree; for plain workspaces the canonical tree
 *  is used directly. The result is filtered to markdown only, then collapsed
 *  (folder-backed posts → single node) and sorted by content-type priority.
 *  Series/book entry folders are left as directories so they render as
 *  expandable collections even when they contain only an `index`. */
export function forContentMode(
  tree: FileNode[],
  options: {
    workspaceRoot: string;
    treeRoot: string;
    postsBasePath?: string;
    features?: FeatureBucket[];
    locales?: string[];
    defaultLocale?: string;
  }
): FileNode[] {
  const scoped =
    options.workspaceRoot === options.treeRoot
      ? tree
      : (findChildrenByPath(tree, options.treeRoot) ?? []);
  const projected = filterContentNodes(scoped)
    .filter(
      (node) =>
        !node.isDirectory || isBucketEnabled(node.name, options.features, options.postsBasePath)
    )
    .map((bucket) => {
      if (bucket.isDirectory && isCollectionBucket(bucket.name, options.postsBasePath)) {
        // Keep each collection entry as a directory; only collapse folder-backed
        // posts *within* an entry (e.g. a member post stored as `<slug>/index`).
        return {
          ...bucket,
          children: (bucket.children ?? []).map((entry) =>
            entry.isDirectory
              ? { ...entry, children: collapseIndexNodes(entry.children ?? []) }
              : entry
          ),
        };
      }
      return collapseIndexNodes([bucket])[0];
    });
  const sorted = sortTree(projected);
  return options.locales && options.locales.length > 0
    ? groupTranslationsDeep(sorted, options.locales, options.defaultLocale)
    : sorted;
}

/** Project the canonical workspace tree into the shape Files mode renders.
 *  Noise directories (`node_modules`, `.git`, etc.) are already filtered at
 *  the Rust walk layer, so this selector only needs to apply the Files-mode
 *  sort: directories first (alphabetical), then files (alphabetical). */
export function forFilesMode(tree: FileNode[]): FileNode[] {
  return sortTreeAlpha(tree);
}

/** Sort tree alphabetically: directories first, then all files by name. */
export function sortTreeAlpha(nodes: FileNode[]): FileNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((node) => {
    if (!node.isDirectory) return node;
    return { ...node, children: sortTreeAlpha(node.children ?? []) };
  });
}

/** Returns true when a divider should be rendered before `nodes[index]`:
 *  the node is the first `page`-type file and there are non-page files
 *  earlier in the same list. */
export function needsPageDivider(nodes: FileNode[], index: number): boolean {
  const node = nodes[index];
  if (node.isDirectory || node.contentType !== "page") return false;
  if (index > 0 && nodes[index - 1].contentType === "page") return false;
  return nodes.slice(0, index).some((n) => !n.isDirectory && n.contentType !== "page");
}

/** Sidebar label for a file node. Prefers the frontmatter title; for
 *  `index.md(x)` files without a title, falls back to the parent folder
 *  name so folder-backed posts read as the post itself rather than literal
 *  "index". For all other files, falls back to the filename without its
 *  markdown extension. */
export function getSidebarDisplayName(node: FileNode): string {
  const baseName = node.name.replace(/\.mdx?$/i, "");
  if (node.title) return node.title;
  const isIndexFile = /^index\.mdx?$/i.test(node.name);
  if (!isIndexFile) return baseName;
  const parentFolderName = node.path.split("/").filter(Boolean).slice(-2, -1)[0];
  return parentFolderName ?? baseName;
}

/** The `index.md(x)` child of a directory, if any. A directory carrying one is
 *  an "entry folder" — e.g. a series or folder-backed post that wasn't
 *  collapsed because it also has sibling posts. The sidebar labels such a
 *  folder with the index's title and opens the index on click. */
export function getDirIndexEntry(node: FileNode): FileNode | undefined {
  if (!node.isDirectory) return undefined;
  return (node.children ?? []).find(isIndexMarkdownFile);
}

/** True when a directory is an Amytis "collection" — its index file is typed
 *  `collection`, meaning its members are referenced (via `items:`) rather than
 *  stored inside the folder. */
export function isCollectionEntry(node: FileNode): boolean {
  return getDirIndexEntry(node)?.contentType === "collection";
}

export interface CollectionEntry {
  dirPath: string;
  indexPath: string;
}

/** Walk a tree for directories that are collection entries (index typed
 *  `collection`), scoped to the content root. Returns each collection's
 *  directory path and the path of its index file. */
export function findCollectionEntries(
  nodes: FileNode[],
  contentRoot: string | null
): CollectionEntry[] {
  const out: CollectionEntry[] = [];
  const walk = (list: FileNode[], inScope: boolean) => {
    for (const node of list) {
      if (!node.isDirectory) continue;
      const scoped = inScope || node.path === contentRoot;
      if (scoped && isCollectionEntry(node)) {
        const index = getDirIndexEntry(node);
        if (index) out.push({ dirPath: node.path, indexPath: index.path });
      }
      if (node.children) walk(node.children, scoped);
    }
  };
  walk(nodes, contentRoot === null);
  return out;
}
