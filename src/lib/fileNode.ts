import type { FileNode } from "./types";

/** Construct a minimal FileNode from a plain path string (no tree walk required). */
export function makeFileNodeFromPath(path: string): FileNode {
  const normalizedPath = path.replace(/\\/g, "/");
  const name = normalizedPath.split("/").pop() ?? path;
  const extension = name.endsWith(".mdx") ? ".mdx" : name.endsWith(".md") ? ".md" : undefined;
  return {
    name,
    path,
    isDirectory: false,
    extension,
  };
}

/** Whether two workspace trees (as `list_workspace_tree` returns them) are
 *  the same. A refresh that finds no change keeps the previous tree object, so
 *  everything derived from it — sidebar projection, flat file index, the
 *  wiki-link corpus read — doesn't redo its work. */
export function sameTree(a: readonly FileNode[], b: readonly FileNode[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.path !== y.path ||
      x.name !== y.name ||
      x.isDirectory !== y.isDirectory ||
      x.title !== y.title ||
      x.draft !== y.draft ||
      x.contentType !== y.contentType ||
      x.extension !== y.extension ||
      x.childrenLoaded !== y.childrenLoaded
    ) {
      return false;
    }
    const xc = x.children ?? null;
    const yc = y.children ?? null;
    if (xc === null || yc === null ? xc !== yc : !sameTree(xc, yc)) return false;
  }
  return true;
}
