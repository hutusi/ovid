import type { FileNode } from "./types";

function getNodeParentPath(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function getPathBaseName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function isFolderBackedPostNode(node: FileNode): boolean {
  return Boolean(node.containerDirPath) || /^index\.mdx?$/i.test(node.name);
}

export function getPostEntrySourcePath(node: FileNode): string {
  if (node.containerDirPath) return node.containerDirPath;
  if (/^index\.mdx?$/i.test(node.name)) {
    return getNodeParentPath(node.path);
  }
  return node.path;
}

export function getDuplicateNameSuggestion(node: FileNode): string {
  const sourcePath = getPostEntrySourcePath(node);
  const sourceName = getPathBaseName(sourcePath);
  const baseName = /^index\.mdx?$/i.test(sourceName)
    ? node.name.replace(/\.(md|mdx)$/i, "")
    : sourceName.replace(/\.(md|mdx)$/i, "");
  return `${baseName}-copy`;
}

export function getPathDisplayLabel(node: FileNode): string {
  if (!isFolderBackedPostNode(node)) {
    return node.name;
  }
  const folderPath = node.containerDirPath ?? getNodeParentPath(node.path);
  return `${getPathBaseName(folderPath)}/${node.name}`;
}

export function getRenamePathDialogState(node: FileNode): {
  currentPath: string;
  currentName: string;
  suffix: string;
} {
  const ext = node.extension ?? ".md";
  if (!isFolderBackedPostNode(node)) {
    return {
      currentPath: node.name,
      currentName: node.name.replace(/\.(md|mdx)$/i, ""),
      suffix: ext,
    };
  }

  const folderPath = node.containerDirPath ?? getNodeParentPath(node.path);
  const folderName = getPathBaseName(folderPath);
  return {
    currentPath: `${folderName}/${node.name}`,
    currentName: folderName,
    suffix: `/${node.name}`,
  };
}
