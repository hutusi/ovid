import { useCallback, useState } from "react";
import type { FileNode, RecentFile } from "./types";

export type { RecentFile };

const MAX_RECENT = 10;
export const STORAGE_KEY = "ovid:recentFiles";

function loadRecent(workspaceRoot: string): RecentFile[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${workspaceRoot}`);
    return raw ? (JSON.parse(raw) as RecentFile[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(workspaceRoot: string, files: RecentFile[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${workspaceRoot}`, JSON.stringify(files));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

function rewriteRecentPaths(files: RecentFile[], oldPath: string, newPath: string): RecentFile[] {
  const newName = newPath.split("/").pop();
  return files.map((file) => {
    if (file.path === oldPath) {
      return { ...file, path: newPath, name: newName ?? file.name };
    }
    if (file.path.startsWith(`${oldPath}/`)) {
      return { ...file, path: `${newPath}${file.path.slice(oldPath.length)}` };
    }
    return file;
  });
}

function filterRemovedRecentPaths(files: RecentFile[], removedPath: string): RecentFile[] {
  return files.filter(
    (file) => file.path !== removedPath && !file.path.startsWith(`${removedPath}/`)
  );
}

export function syncRecentRename(workspaceRoot: string, oldPath: string, newPath: string): void {
  const next = rewriteRecentPaths(loadRecent(workspaceRoot), oldPath, newPath);
  saveRecent(workspaceRoot, next);
}

export function syncRecentDelete(workspaceRoot: string, removedPath: string): void {
  const next = filterRemovedRecentPaths(loadRecent(workspaceRoot), removedPath);
  saveRecent(workspaceRoot, next);
}

export function useRecentFiles(workspaceRoot: string | null) {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() =>
    workspaceRoot ? loadRecent(workspaceRoot) : []
  );

  const pushRecent = useCallback(
    (node: FileNode) => {
      if (!workspaceRoot) return;
      setRecentFiles((prev) => {
        const entry: RecentFile = { path: node.path, name: node.name, title: node.title };
        const filtered = prev.filter((f) => f.path !== node.path);
        const next = [entry, ...filtered].slice(0, MAX_RECENT);
        saveRecent(workspaceRoot, next);
        return next;
      });
    },
    [workspaceRoot]
  );

  const clearRecent = useCallback(() => {
    if (!workspaceRoot) return;
    setRecentFiles([]);
    try {
      localStorage.removeItem(`${STORAGE_KEY}:${workspaceRoot}`);
    } catch {
      // storage-restricted environments — silently ignore
    }
  }, [workspaceRoot]);

  const resetRecent = useCallback((root: string) => {
    const loaded = loadRecent(root);
    setRecentFiles(loaded);
  }, []);

  return { recentFiles, pushRecent, clearRecent, resetRecent };
}
