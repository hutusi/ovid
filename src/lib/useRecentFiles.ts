import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON, removeItem, setJSON } from "./safeLocalStorage";
import type { FileNode, RecentFile } from "./types";

export type { RecentFile };

const MAX_RECENT = 10;
export const STORAGE_KEY = "ovid:recentFiles";

function loadRecent(workspaceRoot: string): RecentFile[] {
  return getJSON<RecentFile[]>(`${STORAGE_KEY}:${workspaceRoot}`, []);
}

function saveRecent(workspaceRoot: string, files: RecentFile[]): void {
  setJSON(`${STORAGE_KEY}:${workspaceRoot}`, files);
}

export function rewriteRecentPaths(
  files: RecentFile[],
  oldPath: string,
  newPath: string
): RecentFile[] {
  const oldBase = oldPath.split("/").pop();
  const newBase = newPath.split("/").pop();
  return files.map((file) => {
    if (file.path === oldPath) {
      return { ...file, path: newPath, name: newBase ?? file.name };
    }
    if (file.path.startsWith(`${oldPath}/`)) {
      // Folder-backed recents (collapseIndexNodes) carry the parent folder's
      // name as their label. When the folder itself is renamed, rewrite the
      // label too — otherwise the entry shows the old folder name forever.
      // A non-index descendant (file.name === filename, not folder name) is
      // left alone since its label is its own filename, not the folder's.
      const renamedLabel = file.name === oldBase && newBase ? newBase : file.name;
      return {
        ...file,
        path: `${newPath}${file.path.slice(oldPath.length)}`,
        name: renamedLabel,
      };
    }
    return file;
  });
}

export function filterRemovedRecentPaths(files: RecentFile[], removedPath: string): RecentFile[] {
  return files.filter(
    (file) => file.path !== removedPath && !file.path.startsWith(`${removedPath}/`)
  );
}

export function useRecentFiles(workspaceRoot: string | null) {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() =>
    workspaceRoot ? loadRecent(workspaceRoot) : []
  );
  const recentFilesRef = useRef<RecentFile[]>(recentFiles);
  recentFilesRef.current = recentFiles;

  // Reload from storage whenever the workspace changes so the in-memory list
  // matches what's persisted under the new key.
  useEffect(() => {
    const next = workspaceRoot ? loadRecent(workspaceRoot) : [];
    recentFilesRef.current = next;
    setRecentFiles(next);
  }, [workspaceRoot]);

  const persist = useCallback(
    (next: RecentFile[]) => {
      if (workspaceRoot) saveRecent(workspaceRoot, next);
      return next;
    },
    [workspaceRoot]
  );

  const pushRecent = useCallback(
    (node: FileNode) => {
      if (!workspaceRoot) return;
      setRecentFiles((prev) => {
        const entry: RecentFile = { path: node.path, name: node.name, title: node.title };
        const filtered = prev.filter((f) => f.path !== node.path);
        return persist([entry, ...filtered].slice(0, MAX_RECENT));
      });
    },
    [workspaceRoot, persist]
  );

  const renameRecent = useCallback(
    (oldPath: string, newPath: string) => {
      if (!workspaceRoot) return;
      setRecentFiles((prev) => {
        if (!prev.some((f) => f.path === oldPath || f.path.startsWith(`${oldPath}/`))) {
          return prev;
        }
        return persist(rewriteRecentPaths(prev, oldPath, newPath));
      });
    },
    [workspaceRoot, persist]
  );

  const removeRecent = useCallback(
    (removedPath: string) => {
      if (!workspaceRoot) return;
      setRecentFiles((prev) => {
        if (!prev.some((f) => f.path === removedPath || f.path.startsWith(`${removedPath}/`))) {
          return prev;
        }
        return persist(filterRemovedRecentPaths(prev, removedPath));
      });
    },
    [workspaceRoot, persist]
  );

  const clearRecent = useCallback(() => {
    if (!workspaceRoot) return;
    setRecentFiles([]);
    removeItem(`${STORAGE_KEY}:${workspaceRoot}`);
  }, [workspaceRoot]);

  return { recentFiles, pushRecent, renameRecent, removeRecent, clearRecent };
}
