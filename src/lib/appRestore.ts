import type { FileNode } from "./types";

export const RECENT_FILES_KEY = "ovid:recentFiles";

export function loadLastRecentFilePath(
  workspaceRoot: string,
  storage: Pick<Storage, "getItem">
): string | null {
  const candidates = [workspaceRoot, `${workspaceRoot}/content`];
  for (const candidate of candidates) {
    try {
      const raw = storage.getItem(`${RECENT_FILES_KEY}:${candidate}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Array<{ path?: string }>;
      const path = parsed[0]?.path ?? null;
      if (path) return path;
    } catch {
      // Ignore malformed or inaccessible storage entries and try the next key.
    }
  }
  return null;
}

export function findNodeByPath(nodes: FileNode[], path: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (!node.isDirectory) continue;
    const found = findNodeByPath(node.children ?? [], path);
    if (found) return found;
  }
}
