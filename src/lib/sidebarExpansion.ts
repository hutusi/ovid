import type { FileNode } from "./types";

export const SIDEBAR_EXPANDED_KEY = "ovid:sidebarExpanded";

export function buildExpandedStorageKey(workspaceKey: string | null | undefined): string {
  return workspaceKey ? `${SIDEBAR_EXPANDED_KEY}:${workspaceKey}` : SIDEBAR_EXPANDED_KEY;
}

export function shouldDefaultExpand(depth: number): boolean {
  return depth < 1;
}

export function parseExpandedPaths(stored: string | null): {
  expandedPaths: Record<string, boolean>;
} {
  if (!stored) return { expandedPaths: {} };

  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { expandedPaths: {} };
    }
    const expandedPaths: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") expandedPaths[k] = v;
    }
    return { expandedPaths };
  } catch {
    return { expandedPaths: {} };
  }
}

export function findAncestorPaths(nodes: FileNode[], selectedPath: string | null): Set<string> {
  const ancestors = new Set<string>();
  if (!selectedPath) return ancestors;

  // Derive ancestors from path segments rather than tree traversal so that
  // branches with children: null (lazy-loaded dirs) don't break sidebar reveal.
  // Bound by the depth of the shallowest top-level node to avoid adding paths
  // that are above the visible tree root.
  const minDepth =
    nodes.length > 0 ? Math.min(...nodes.map((n) => n.path.split("/").filter(Boolean).length)) : 0;

  let dir = selectedPath.substring(0, selectedPath.lastIndexOf("/"));
  while (dir.length > 0) {
    const depth = dir.split("/").filter(Boolean).length;
    if (depth < minDepth) break;
    ancestors.add(dir);
    const parent = dir.substring(0, dir.lastIndexOf("/"));
    if (parent === dir || parent.length <= 1) break;
    dir = parent;
  }
  return ancestors;
}

export function forceExpandAncestors(
  expandedPaths: Record<string, boolean>,
  ancestorPaths: Set<string>
): Record<string, boolean> {
  let changed = false;
  const next = { ...expandedPaths };
  for (const path of ancestorPaths) {
    if (next[path] !== true) {
      next[path] = true;
      changed = true;
    }
  }
  return changed ? next : expandedPaths;
}

export function getNodeExpanded(
  path: string,
  depth: number,
  expandedPaths: Record<string, boolean>
): boolean {
  const persisted = expandedPaths[path];
  if (persisted !== undefined) return persisted;
  return shouldDefaultExpand(depth);
}

export function findExpandedUnloadedPaths(
  nodes: FileNode[],
  expandedPaths: Record<string, boolean>
): string[] {
  const paths: string[] = [];
  function visit(items: FileNode[], depth: number) {
    for (const node of items) {
      if (!node.isDirectory) continue;
      if (!getNodeExpanded(node.path, depth, expandedPaths)) continue;
      if (node.childrenLoaded === false) {
        paths.push(node.path);
      } else if (node.children) {
        visit(node.children, depth + 1);
      }
    }
  }
  visit(nodes, 0);
  return paths;
}
