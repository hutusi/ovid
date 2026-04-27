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
    if (typeof parsed !== "object" || !parsed) return { expandedPaths: {} };
    return { expandedPaths: parsed as Record<string, boolean> };
  } catch {
    return { expandedPaths: {} };
  }
}

export function findAncestorPaths(nodes: FileNode[], selectedPath: string | null): Set<string> {
  const ancestors = new Set<string>();
  if (!selectedPath) return ancestors;

  function visit(node: FileNode, lineage: string[]): boolean {
    if (node.path === selectedPath) {
      for (const path of lineage) ancestors.add(path);
      return true;
    }
    if (!node.isDirectory) return false;
    const nextLineage = [...lineage, node.path];
    return (node.children ?? []).some((child) => visit(child, nextLineage));
  }

  for (const node of nodes) {
    if (visit(node, [])) break;
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
