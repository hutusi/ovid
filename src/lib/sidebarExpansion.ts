import type { FileNode } from "./types";

export const SIDEBAR_EXPANDED_KEY = "ovid:sidebarExpanded";

export function buildExpandedStorageKey(workspaceKey: string | null | undefined): string {
  return workspaceKey ? `${SIDEBAR_EXPANDED_KEY}:${workspaceKey}` : SIDEBAR_EXPANDED_KEY;
}

/** Default expansion rule for a directory row. Top-level folders are open by
 *  default; deeper folders are closed. The `isBucket` flag overrides this to
 *  `false` for top-level Content-mode buckets so a workspace with many notes
 *  doesn't push books/series/pages off-screen — the user opens the bucket
 *  they want, and the choice persists per workspace. Files mode and nested
 *  folders are unaffected. */
export function shouldDefaultExpand(depth: number, opts?: { isBucket?: boolean }): boolean {
  if (opts?.isBucket) return false;
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
  expandedPaths: Record<string, boolean>,
  opts?: { isBucket?: boolean }
): boolean {
  const persisted = expandedPaths[path];
  if (persisted !== undefined) return persisted;
  return shouldDefaultExpand(depth, opts);
}

export type EntryLabelClickAction = "collapse" | "expand-and-select" | "select";

// A directory row whose index is already selected and visible should collapse
// on a second label click. Otherwise the click expands (if needed) and selects
// the index. The "collapse" branch must skip selectedPath updates so the
// auto-expand-ancestors effect doesn't immediately re-open the row.
export function resolveEntryLabelClick(args: {
  entrySelected: boolean;
  expanded: boolean;
}): EntryLabelClickAction {
  if (args.entrySelected && args.expanded) return "collapse";
  if (!args.expanded) return "expand-and-select";
  return "select";
}
