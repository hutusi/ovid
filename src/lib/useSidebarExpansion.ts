import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { measureSync } from "./perf";
import {
  buildExpandedStorageKey,
  findAncestorPaths,
  forceExpandAncestors,
  getNodeExpanded,
  parseExpandedPaths,
  shouldDefaultExpand,
} from "./sidebarExpansion";
import type { FileNode } from "./types";

interface UseSidebarExpansionOptions {
  workspaceKey: string | null | undefined;
  tree: FileNode[];
  selectedPath: string | null;
  /** Predicate identifying a "bucket" row (a top-level Content-mode content
   *  bucket like `notes/`, `books/`). Bucket rows are collapsed by default so
   *  the sidebar stays scannable on workspaces with many notes. Files mode and
   *  nested folders never pass this — they keep the old depth-based default. */
  isBucket?: (node: FileNode, depth: number) => boolean;
}

/**
 * Owns sidebar directory-expansion state — the expanded/collapsed map, its
 * per-workspace persistence in `localStorage`, and the rule that auto-expands
 * the ancestors of the currently-selected file. The pure helpers in
 * `sidebarExpansion.ts` are the implementation; this hook is the state layer
 * that wires them up so `Sidebar.tsx` only has to call `isExpanded` /
 * `toggleExpanded`.
 *
 * Selecting a file in a deep directory expands its ancestors automatically;
 * a manual collapse always wins (the persisted-`false` shortcut in
 * `getNodeExpanded`).
 */
export function useSidebarExpansion({
  workspaceKey,
  tree,
  selectedPath,
  isBucket,
}: UseSidebarExpansionOptions) {
  const expandedStorageKey = useMemo(() => buildExpandedStorageKey(workspaceKey), [workspaceKey]);
  const expandedStorageKeyRef = useRef(expandedStorageKey);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const selectedAncestorPaths = useMemo(
    () =>
      measureSync("sidebar.findAncestorPaths", () => findAncestorPaths(tree, selectedPath), {
        treeNodes: tree.length,
        hasSelection: Boolean(selectedPath),
      }),
    [tree, selectedPath]
  );

  // Stable string key derived from the ancestor set so the auto-expand effect
  // only re-fires when the *content* of the set changes — not on every tree
  // re-render that produces an identically-shaped Set.
  const selectedAncestorKey = useMemo(
    () => [...selectedAncestorPaths].sort().join("\0"),
    [selectedAncestorPaths]
  );

  // Load persisted expansion state when the workspace changes.
  useEffect(() => {
    expandedStorageKeyRef.current = expandedStorageKey;
    const stored = localStorage.getItem(expandedStorageKey);
    const next = parseExpandedPaths(stored);
    setExpandedPaths(next.expandedPaths);
    setIsLoaded(true);
  }, [expandedStorageKey]);

  // Persist on every change, but not before the initial load — otherwise we'd
  // overwrite the stored state with `{}` on first mount.
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(expandedStorageKeyRef.current, JSON.stringify(expandedPaths));
  }, [expandedPaths, isLoaded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedPath is intentionally included so sibling-file navigation (same ancestorKey, different path) re-triggers ancestor expansion
  useEffect(() => {
    if (!isLoaded) return;
    if (!selectedAncestorKey) return;
    const ancestors = new Set(selectedAncestorKey.split("\0"));
    setExpandedPaths((current) => forceExpandAncestors(current, ancestors));
  }, [selectedPath, selectedAncestorKey, isLoaded]);

  const isExpanded = useCallback(
    (node: FileNode, depth: number): boolean =>
      getNodeExpanded(node.path, depth, expandedPaths, {
        isBucket: isBucket?.(node, depth),
      }),
    [expandedPaths, isBucket]
  );

  const toggleExpanded = useCallback(
    (path: string, depth: number, opts?: { isBucket?: boolean }) => {
      setExpandedPaths((current) => {
        const next = { ...current };
        next[path] = !(current[path] ?? shouldDefaultExpand(depth, opts));
        return next;
      });
    },
    []
  );

  /** Bulk-set a list of paths to `expanded`. Used by the bucket expand-all /
   *  collapse-all action so the user can switch between focused and overview
   *  modes with one click. */
  const setAllBuckets = useCallback((expanded: boolean, paths: string[]) => {
    if (paths.length === 0) return;
    setExpandedPaths((current) => {
      const next = { ...current };
      for (const path of paths) next[path] = expanded;
      return next;
    });
  }, []);

  return { isExpanded, toggleExpanded, setAllBuckets };
}
