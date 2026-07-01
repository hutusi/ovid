import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON, setJSON } from "./safeLocalStorage";

export const MAX_OPEN_TABS = 8;
export const STORAGE_KEY = "ovid:openTabs";

export function addTabPath(tabs: string[], path: string): string[] {
  if (tabs.includes(path)) return tabs;
  return [...tabs, path].slice(-MAX_OPEN_TABS);
}

export function removeTabPath(
  tabs: string[],
  path: string
): { tabs: string[]; neighbor: string | null } {
  const idx = tabs.indexOf(path);
  if (idx === -1) return { tabs, neighbor: null };
  const next = [...tabs.slice(0, idx), ...tabs.slice(idx + 1)];
  const neighbor = next[idx] ?? next[idx - 1] ?? null;
  return { tabs: next, neighbor };
}

export function reorderTabsArray(tabs: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    fromIndex >= tabs.length ||
    toIndex < 0 ||
    toIndex >= tabs.length ||
    fromIndex === toIndex
  ) {
    return tabs;
  }
  const next = [...tabs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function rewriteTabPaths(tabs: string[], oldPath: string, newPath: string): string[] {
  return tabs.map((path) => {
    if (path === oldPath) return newPath;
    if (path.startsWith(`${oldPath}/`)) return `${newPath}${path.slice(oldPath.length)}`;
    return path;
  });
}

export function filterRemovedTabPaths(tabs: string[], removedPath: string): string[] {
  return tabs.filter((path) => path !== removedPath && !path.startsWith(`${removedPath}/`));
}

function loadTabs(workspaceRoot: string): string[] {
  const parsed = getJSON<unknown>(`${STORAGE_KEY}:${workspaceRoot}`, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((p): p is string => typeof p === "string").slice(0, MAX_OPEN_TABS);
}

function saveTabs(workspaceRoot: string, tabs: string[]): void {
  setJSON(`${STORAGE_KEY}:${workspaceRoot}`, tabs);
}

export function useOpenTabs(workspaceRoot: string | null) {
  const [tabs, setTabs] = useState<string[]>(() => (workspaceRoot ? loadTabs(workspaceRoot) : []));
  const tabsRef = useRef<string[]>(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const loaded = workspaceRoot ? loadTabs(workspaceRoot) : [];
    tabsRef.current = loaded;
    setTabs(loaded);
  }, [workspaceRoot]);

  const persist = useCallback(
    (next: string[]) => {
      if (workspaceRoot) saveTabs(workspaceRoot, next);
      return next;
    },
    [workspaceRoot]
  );

  const openTab = useCallback(
    (path: string) => {
      setTabs((prev) => persist(addTabPath(prev, path)));
    },
    [persist]
  );

  const closeTab = useCallback(
    (path: string): { neighbor: string | null } => {
      const result = removeTabPath(tabsRef.current, path);
      if (result.tabs !== tabsRef.current) {
        tabsRef.current = result.tabs;
        setTabs(persist(result.tabs));
      }
      return { neighbor: result.neighbor };
    },
    [persist]
  );

  const reorderTabs = useCallback(
    (fromIndex: number, toIndex: number) => {
      setTabs((prev) => {
        const next = reorderTabsArray(prev, fromIndex, toIndex);
        return next === prev ? prev : persist(next);
      });
    },
    [persist]
  );

  const renameTab = useCallback(
    (oldPath: string, newPath: string) => {
      setTabs((prev) => {
        if (!prev.some((p) => p === oldPath || p.startsWith(`${oldPath}/`))) return prev;
        return persist(rewriteTabPaths(prev, oldPath, newPath));
      });
    },
    [persist]
  );

  const removeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        if (!prev.some((p) => p === path || p.startsWith(`${path}/`))) return prev;
        return persist(filterRemovedTabPaths(prev, path));
      });
    },
    [persist]
  );

  return { tabs, openTab, closeTab, reorderTabs, renameTab, removeTab };
}
