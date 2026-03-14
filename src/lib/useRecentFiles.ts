import { useCallback, useState } from "react";
import type { FileNode } from "./types";

const MAX_RECENT = 10;
const STORAGE_KEY = "ovid:recentFiles";

interface RecentFile {
  path: string;
  name: string;
  title?: string;
}

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
    localStorage.removeItem(`${STORAGE_KEY}:${workspaceRoot}`);
  }, [workspaceRoot]);

  const resetRecent = useCallback((root: string) => {
    const loaded = loadRecent(root);
    setRecentFiles(loaded);
  }, []);

  return { recentFiles, pushRecent, clearRecent, resetRecent };
}
