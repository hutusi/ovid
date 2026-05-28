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

/** Drop dotfiles, non-markdown files, and directories that have no markdown
 *  descendants after the filter. Used by content mode, which has stricter
 *  visibility rules than files mode. */
function filterContentNodes(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => {
    if (node.name.startsWith(".")) return [];
    if (node.isDirectory) {
      const children = filterContentNodes(node.children ?? []);
      if (children.length === 0) return [];
      return [{ ...node, children }];
    }
    return /\.mdx?$/i.test(node.name) ? [node] : [];
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

/** Project the canonical workspace tree into the shape Content mode renders.
 *  For Amytis workspaces (`workspaceRoot !== treeRoot`) the tree is first
 *  scoped into the `content/` subtree; for plain workspaces the canonical tree
 *  is used directly. The result is filtered to markdown only, then collapsed
 *  (folder-backed posts → single node) and sorted by content-type priority. */
export function forContentMode(
  tree: FileNode[],
  options: { workspaceRoot: string; treeRoot: string }
): FileNode[] {
  const scoped =
    options.workspaceRoot === options.treeRoot
      ? tree
      : (findChildrenByPath(tree, options.treeRoot) ?? []);
  return sortTree(collapseIndexNodes(filterContentNodes(scoped)));
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
