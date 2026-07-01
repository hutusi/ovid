import { useCallback, useState } from "react";
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

  const pushRecentWorkspace = useCallback((rootPath: string, name: string) => {
    setRecentWorkspaces((prev) => {
      const entry: RecentWorkspace = { rootPath, name, lastOpenedAt: Date.now() };
      const filtered = prev.filter((w) => w.rootPath !== rootPath);
      const next = [entry, ...filtered].slice(0, MAX_WORKSPACES);
      saveWorkspaces(next);
      return next;
    });
  }, []);

  const removeRecentWorkspace = useCallback((rootPath: string) => {
    setRecentWorkspaces((prev) => {
      const next = prev.filter((w) => w.rootPath !== rootPath);
      if (next.length === prev.length) return prev;
      saveWorkspaces(next);
      return next;
    });
  }, []);

  return { recentWorkspaces, pushRecentWorkspace, removeRecentWorkspace };
}
