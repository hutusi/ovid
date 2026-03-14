import type { FileNode } from "./types";

export interface FlatFile {
  node: FileNode;
  displayName: string;
  relativePath: string;
}

export function flattenTree(nodes: FileNode[], prefix = ""): FlatFile[] {
  const result: FlatFile[] = [];
  for (const node of nodes) {
    if (node.isDirectory) {
      const dir = prefix ? `${prefix}/${node.name}` : node.name;
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
  const q = query.toLowerCase();
  const name = file.displayName.toLowerCase();
  const path = file.relativePath.toLowerCase();
  if (name === q) return 3;
  if (name.startsWith(q)) return 2;
  if (name.includes(q) || path.includes(q)) return 1;
  return 0;
}
