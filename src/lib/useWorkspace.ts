import { invoke } from "@tauri-apps/api/core";
import type { MutableRefObject } from "react";
import { useCallback, useState } from "react";
import {
  createAmytisFrontmatter,
  createTodayFlowFrontmatter,
  createTypedFrontmatter,
} from "./frontmatter";
import type { FileNode } from "./types";

export interface WorkspaceResult {
  name: string;
  rootPath: string;
  treeRoot: string;
  assetRoot: string;
  tree: FileNode[];
  isAmytisWorkspace: boolean;
  cdnBase?: string;
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
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(null);
  const [isAmytisWorkspace, setIsAmytisWorkspace] = useState(false);
  const [assetRoot, setAssetRoot] = useState<string | undefined>(undefined);
  const [cdnBase, setCdnBase] = useState<string | undefined>(undefined);
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

  const applyWorkspaceResult = useCallback(
    (result: WorkspaceResult) => {
      setTree(result.tree);
      setWorkspaceName(result.name);
      setWorkspaceRoot(result.treeRoot);
      setWorkspaceRootPath(result.rootPath);
      setIsAmytisWorkspace(result.isAmytisWorkspace);
      setAssetRoot(result.assetRoot);
      setCdnBase(result.cdnBase ?? undefined);
      resetFileState();
      if (!result.isAmytisWorkspace) {
        showToast("This folder doesn't look like an Amytis workspace.");
      }
    },
    [resetFileState, showToast]
  );

  const openWorkspaceAtPath = useCallback(
    async (path: string) => {
      await flushPendingSave();
      try {
        const result = await invoke<WorkspaceResult | null>("open_workspace_at_path", { path });
        if (result) applyWorkspaceResult(result);
        else showToast("Could not open workspace — path may no longer be valid.");
      } catch (err) {
        console.error("Failed to open workspace:", err);
        showToast(`Failed to open workspace: ${err}`);
      }
    },
    [flushPendingSave, showToast, applyWorkspaceResult]
  );

  const handleOpenWorkspace = useCallback(async () => {
    await flushPendingSave();
    try {
      const result = await invoke<WorkspaceResult | null>("open_workspace");
      if (result) applyWorkspaceResult(result);
    } catch (err) {
      console.error("Failed to open workspace:", err);
      showToast(`Failed to open workspace: ${err}`);
    }
  }, [flushPendingSave, showToast, applyWorkspaceResult]);

  const handleNewTodayFlow = useCallback(async () => {
    if (!workspaceRoot) return;
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dirPath = `${workspaceRoot}/flows/${year}/${month}`;
    const filePath = `${dirPath}/${day}.md`;
    try {
      await invoke("ensure_dir", { path: dirPath });
      try {
        await invoke("create_file", { path: filePath, content: createTodayFlowFrontmatter() });
      } catch (err) {
        if (!String(err).includes("already exists")) throw err;
      }
      const updated = await refreshTree();
      const node = findNode(updated, filePath);
      if (node) await handleSelectFile(node);
    } catch (err) {
      console.error("Failed to open today's flow:", err);
      showToast(`Failed to open today's flow: ${err}`);
    }
  }, [workspaceRoot, refreshTree, handleSelectFile, showToast]);

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
    workspaceRootPath,
    isAmytisWorkspace,
    assetRoot,
    cdnBase,
    renamingPath,
    setRenamingPath,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDelete,
  };
}
