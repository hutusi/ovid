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
