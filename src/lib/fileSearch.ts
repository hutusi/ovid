import { collapseIndexNodes } from "./sidebarUtils";
import type { FileNode } from "./types";

export interface FlatFile {
  node: FileNode;
  displayName: string;
  relativePath: string;
}

const PATH_SEGMENT_SEPARATOR_RE = /[\\/._\-\s]+/;
const NO_RECENT_RANK = Number.MAX_SAFE_INTEGER;

export function flattenTree(nodes: FileNode[], prefix = ""): FlatFile[] {
  const result: FlatFile[] = [];
  for (const node of collapseIndexNodes(nodes)) {
    if (node.isDirectory) {
      const dir = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.childrenLoaded === false) {
        continue;
      }
      if (node.children) result.push(...flattenTree(node.children, dir));
    } else {
      const baseName = node.name.replace(/\.mdx?$/, "");
      const displayName = node.title || baseName;
      const relativePath = prefix ? `${prefix}/${node.name}` : node.name;
      result.push({ node, displayName, relativePath });
    }
  }
  return result;
}

export function score(file: FlatFile, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const name = file.displayName.toLowerCase();
  const path = file.relativePath.toLowerCase();
  const baseName = file.node.name.replace(/\.mdx?$/i, "").toLowerCase();
  const pathSegments = path.split(PATH_SEGMENT_SEPARATOR_RE).filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  if (name === q || baseName === q || path === q) return 1200;
  if (name.startsWith(q)) return 900 - (name.length - q.length);
  if (baseName.startsWith(q)) return 850 - (baseName.length - q.length);
  if (pathParts.some((part) => part === q || part === `${q}.md` || part === `${q}.mdx`)) return 825;
  if (pathSegments.some((segment) => segment === q)) return 800;
  if (pathSegments.some((segment) => segment.startsWith(q))) return 700;

  const nameIndex = name.indexOf(q);
  if (nameIndex >= 0) return 600 - nameIndex;

  const baseNameIndex = baseName.indexOf(q);
  if (baseNameIndex >= 0) return 500 - baseNameIndex;

  const pathIndex = path.indexOf(q);
  if (pathIndex >= 0) return 300 - Math.min(pathIndex, 250);

  return 0;
}

export function compareFiles(
  a: FlatFile,
  b: FlatFile,
  query: string,
  recentRankByPath: ReadonlyMap<string, number> = new Map()
): number {
  const scoreDiff = score(b, query) - score(a, query);
  if (scoreDiff !== 0) return scoreDiff;

  const recentRankA = recentRankByPath.get(a.node.path) ?? NO_RECENT_RANK;
  const recentRankB = recentRankByPath.get(b.node.path) ?? NO_RECENT_RANK;
  if (recentRankA !== recentRankB) return recentRankA - recentRankB;

  const pathLengthDiff = a.relativePath.length - b.relativePath.length;
  if (pathLengthDiff !== 0) return pathLengthDiff;

  return a.relativePath.localeCompare(b.relativePath);
}
