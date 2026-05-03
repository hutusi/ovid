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

export function getPostEntryFileName(node: FileNode): string {
  return getPathBaseName(node.path);
}

export function buildPostTargetPath(
  node: FileNode,
  newName: string
): {
  oldPath: string;
  newPath: string;
  folderBacked: boolean;
  ext: string;
  entryFileName: string;
} {
  if (node.isDirectory) {
    const dir = getNodeParentPath(node.path);
    return {
      oldPath: node.path,
      newPath: `${dir}/${newName}`,
      folderBacked: false,
      ext: "",
      entryFileName: getPathBaseName(node.path),
    };
  }

  const oldPath = getPostEntrySourcePath(node);
  const ext = node.extension ?? ".md";
  const folderBacked = isFolderBackedPostNode(node);
  const dir = getNodeParentPath(oldPath);
  const newPath = folderBacked
    ? `${dir}/${newName}`
    : `${dir}/${newName}${newName.endsWith(ext) ? "" : ext}`;

  return {
    oldPath,
    newPath,
    folderBacked,
    ext,
    entryFileName: getPostEntryFileName(node),
  };
}

function getPostBaseName(node: FileNode): string {
  const sourceName = getPathBaseName(getPostEntrySourcePath(node));
  return sourceName.replace(/\.(md|mdx)$/i, "");
}

export function getDuplicateNameSuggestion(node: FileNode): string {
  return `${getPostBaseName(node)}-copy`;
}

export function getNewFromExistingNameSuggestion(node: FileNode): string {
  return `${getPostBaseName(node)}-new`;
}

export function getPathDisplayLabel(node: FileNode): string {
  if (!isFolderBackedPostNode(node)) {
    return node.name;
  }
  const folderPath = node.containerDirPath ?? getNodeParentPath(node.path);
  return `${getPathBaseName(folderPath)}/${getPathBaseName(node.path)}`;
}

export function getRenamePathDialogState(node: FileNode): {
  currentPath: string;
  currentName: string;
  suffix: string;
} {
  if (node.isDirectory) {
    return {
      currentPath: node.name,
      currentName: node.name,
      suffix: "",
    };
  }

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
  const fileName = getPathBaseName(node.path);
  return {
    currentPath: `${folderName}/${fileName}`,
    currentName: folderName,
    suffix: `/${fileName}`,
  };
}
