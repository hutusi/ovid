import { useCallback, useRef, useState } from "react";
import { getJSON, setJSON } from "./safeLocalStorage";
import type { RecentWorkspace } from "./types";

const MAX_WORKSPACES = 5;
const STORAGE_KEY = "ovid:recentWorkspaces";

function isValidWorkspace(item: unknown): item is RecentWorkspace {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as RecentWorkspace).rootPath === "string" &&
    typeof (item as RecentWorkspace).name === "string"
  );
}

function loadWorkspaces(): RecentWorkspace[] {
  const parsed = getJSON<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidWorkspace).slice(0, MAX_WORKSPACES);
}

function saveWorkspaces(workspaces: RecentWorkspace[]): void {
  setJSON(STORAGE_KEY, workspaces);
}

export function useRecentWorkspaces() {
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(loadWorkspaces);
  const recentRef = useRef(recentWorkspaces);
  recentRef.current = recentWorkspaces;

  const pushRecentWorkspace = useCallback((rootPath: string, name: string) => {
    setRecentWorkspaces((prev) => {
      const entry: RecentWorkspace = { rootPath, name, lastOpenedAt: Date.now() };
      const filtered = prev.filter((w) => w.rootPath !== rootPath);
      const next = [entry, ...filtered].slice(0, MAX_WORKSPACES);
      saveWorkspaces(next);
      return next;
    });
  }, []);

  /** Remove a workspace from the recents list. Returns an undo that puts it
   *  back in its old position (or null when it wasn't in the list). */
  const removeRecentWorkspace = useCallback((rootPath: string): (() => void) | null => {
    const index = recentRef.current.findIndex((w) => w.rootPath === rootPath);
    if (index === -1) return null;
    const removed = recentRef.current[index];
    setRecentWorkspaces((prev) => {
      const next = prev.filter((w) => w.rootPath !== rootPath);
      if (next.length === prev.length) return prev;
      saveWorkspaces(next);
      return next;
    });
    return () => {
      setRecentWorkspaces((prev) => {
        if (prev.some((w) => w.rootPath === removed.rootPath)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, removed);
        const capped = next.slice(0, MAX_WORKSPACES);
        saveWorkspaces(capped);
        return capped;
      });
    };
  }, []);

  return { recentWorkspaces, pushRecentWorkspace, removeRecentWorkspace };
}
