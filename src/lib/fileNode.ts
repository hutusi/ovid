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
