import { invoke } from "@tauri-apps/api/core";
import type { MutableRefObject } from "react";
import { useCallback, useState } from "react";
import { createAmytisFrontmatter, createTypedFrontmatter } from "./frontmatter";
import type { FileNode } from "./types";

export interface WorkspaceResult {
  name: string;
  rootPath: string;
  treeRoot: string;
  tree: FileNode[];
  isAmytisWorkspace: boolean;
}

interface UseWorkspaceOptions {
  showToast: (msg: string) => void;
  flushPendingSave: () => Promise<void>;
  handleCloseFile: () => Promise<void>;
  handleSelectFile: (node: FileNode) => Promise<void>;
  selectedFile: FileNode | null;
  selectedPathRef: MutableRefObject<string | null>;
  setSelectedFile: (node: FileNode | null) => void;
  resetFileState: () => void;
}

function findNode(nodes: FileNode[], path: string): FileNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const found = findNode(n.children, path);
      if (found) return found;
    }
  }
}

export function useWorkspace({
  showToast,
  flushPendingSave,
  handleCloseFile,
  handleSelectFile,
  selectedFile,
  selectedPathRef,
  setSelectedFile,
  resetFileState,
}: UseWorkspaceOptions) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isAmytisWorkspace, setIsAmytisWorkspace] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  const refreshTree = useCallback(async (): Promise<FileNode[]> => {
    try {
      const updated = await invoke<FileNode[]>("list_workspace");
      setTree(updated);
      return updated;
    } catch (err) {
      console.error("Failed to refresh tree:", err);
      return [];
    }
  }, []);

  const handleOpenWorkspace = useCallback(async () => {
    await flushPendingSave();
    try {
      const result = await invoke<WorkspaceResult | null>("open_workspace");
      if (result) {
        setTree(result.tree);
        setWorkspaceName(result.name);
        setWorkspaceRoot(result.treeRoot);
        setIsAmytisWorkspace(result.isAmytisWorkspace);
        resetFileState();
        if (!result.isAmytisWorkspace) {
          showToast("This folder doesn't look like an Amytis workspace.");
        }
      }
    } catch (err) {
      console.error("Failed to open workspace:", err);
      showToast(`Failed to open workspace: ${err}`);
    }
  }, [flushPendingSave, resetFileState, showToast]);

  async function handleNewFile(dirPath: string, filename: string, contentType?: string) {
    const slug = filename.replace(/\.md$/, "");
    const filePath = `${dirPath}/${slug}.md`;
    const content = contentType
      ? createTypedFrontmatter(slug, contentType)
      : createAmytisFrontmatter(slug);
    try {
      await invoke("create_file", { path: filePath, content });
      const updated = await refreshTree();
      const newNode = findNode(updated, filePath);
      if (newNode) await handleSelectFile(newNode);
    } catch (err) {
      console.error("Failed to create file:", err);
      showToast(`Failed to create file: ${err}`);
    }
  }

  async function handleRename(node: FileNode, newName: string) {
    setRenamingPath(null);
    await flushPendingSave();
    const dir = node.path.substring(0, node.path.lastIndexOf("/"));
    const ext = node.extension ?? ".md";
    const newPath = `${dir}/${newName}${newName.endsWith(ext) ? "" : ext}`;
    try {
      await invoke("rename_file", { oldPath: node.path, newPath });
      const updated = await refreshTree();
      if (selectedFile?.path === node.path) {
        const renamed = findNode(updated, newPath);
        if (renamed) {
          selectedPathRef.current = newPath;
          setSelectedFile(renamed);
        }
      }
    } catch (err) {
      console.error("Failed to rename file:", err);
      showToast(`Failed to rename: ${err}`);
    }
  }

  async function handleDelete(node: FileNode) {
    const confirmed = window.confirm(`Move "${node.name}" to Trash?`);
    if (!confirmed) return;
    if (selectedFile?.path === node.path) {
      await flushPendingSave();
    }
    try {
      await invoke("trash_file", { path: node.path });
      if (selectedFile?.path === node.path) await handleCloseFile();
      await refreshTree();
    } catch (err) {
      console.error("Failed to delete file:", err);
      showToast(`Failed to delete: ${err}`);
    }
  }

  return {
    tree,
    workspaceName,
    workspaceRoot,
    isAmytisWorkspace,
    renamingPath,
    setRenamingPath,
    handleOpenWorkspace,
    handleNewFile,
    handleRename,
    handleDelete,
  };
}
