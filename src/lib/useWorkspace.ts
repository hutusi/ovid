import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { MutableRefObject } from "react";
import { useCallback, useState } from "react";
import {
  createAmytisFrontmatter,
  createTodayFlowFrontmatter,
  createTypedFrontmatter,
} from "./frontmatter";
import { measureAsync } from "./perf";
import { buildPostTargetPath } from "./postPath";
import { createPostFromExistingContent } from "./postTemplate";
import type { FileNode } from "./types";
import { syncRecentDelete, syncRecentRename } from "./useRecentFiles";

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
  onPathRenamed?: (oldPath: string, newPath: string) => void;
  onPathRemoved?: (path: string) => void;
}

function mergeDirectoryChildren(
  nodes: FileNode[],
  dirPath: string,
  children: FileNode[]
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === dirPath && node.isDirectory) {
      return {
        ...node,
        children,
        childrenLoaded: true,
      };
    }
    if (!node.children) return node;
    return {
      ...node,
      children: mergeDirectoryChildren(node.children, dirPath, children),
    };
  });
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
  onPathRenamed,
  onPathRemoved,
}: UseWorkspaceOptions) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(null);
  const [isAmytisWorkspace, setIsAmytisWorkspace] = useState(false);
  const [assetRoot, setAssetRoot] = useState<string | undefined>(undefined);
  const [cdnBase, setCdnBase] = useState<string | undefined>(undefined);
  const loadingDirectoryRequestsRef = useState(() => new Map<string, Promise<FileNode[]>>())[0];

  const refreshTree = useCallback(async (): Promise<FileNode[]> => {
    try {
      const updated = await measureAsync("list_workspace.invoke", () =>
        invoke<FileNode[]>("list_workspace")
      );
      setTree(updated);
      return updated;
    } catch (err) {
      console.error("Failed to refresh tree:", err);
      return [];
    }
  }, []);

  const loadDirectoryChildren = useCallback(
    async (dirPath: string): Promise<FileNode[]> => {
      const inFlight = loadingDirectoryRequestsRef.get(dirPath);
      if (inFlight) return inFlight;

      const request = (async () => {
        try {
          const children = await measureAsync("list_workspace_children.invoke", () =>
            invoke<FileNode[]>("list_workspace_children", { path: dirPath })
          );
          setTree((current) => mergeDirectoryChildren(current, dirPath, children));
          return children;
        } catch (err) {
          console.error("Failed to load directory children:", err);
          showToast(`Failed to load directory children: ${err}`);
          return [];
        } finally {
          loadingDirectoryRequestsRef.delete(dirPath);
        }
      })();

      loadingDirectoryRequestsRef.set(dirPath, request);

      return request;
    },
    [loadingDirectoryRequestsRef, showToast]
  );

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
        const result = await measureAsync(
          "open_workspace_at_path.invoke",
          () => invoke<WorkspaceResult | null>("open_workspace_at_path", { path }),
          { path }
        );
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
      const result = await measureAsync("open_workspace.invoke", () =>
        invoke<WorkspaceResult | null>("open_workspace")
      );
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
    await flushPendingSave();
    const { oldPath, newPath, folderBacked, entryFileName } = buildPostTargetPath(node, newName);
    try {
      await invoke("rename_file", { oldPath, newPath });
      if (workspaceRoot) syncRecentRename(workspaceRoot, oldPath, newPath);
      onPathRenamed?.(oldPath, newPath);
      const updated = await refreshTree();
      if (selectedFile?.path === node.path) {
        const selectedPath = folderBacked ? `${newPath}/${entryFileName}` : newPath;
        const renamed = findNode(updated, selectedPath);
        if (renamed) {
          selectedPathRef.current = selectedPath;
          setSelectedFile(renamed);
        }
      }
    } catch (err) {
      console.error("Failed to rename file:", err);
      showToast(`Failed to rename: ${err}`);
    }
  }

  async function handleDuplicate(node: FileNode, newName: string) {
    await flushPendingSave();
    const { oldPath, newPath, folderBacked, entryFileName } = buildPostTargetPath(node, newName);

    try {
      await invoke("duplicate_entry", { srcPath: oldPath, destPath: newPath });
      const updated = await refreshTree();
      const duplicatedPath = folderBacked ? `${newPath}/${entryFileName}` : newPath;
      const duplicated = findNode(updated, duplicatedPath);
      if (duplicated) {
        await handleSelectFile(duplicated);
      }
    } catch (err) {
      console.error("Failed to duplicate file:", err);
      showToast(`Failed to duplicate: ${err}`);
    }
  }

  async function handleNewFromExisting(node: FileNode, newName: string) {
    await flushPendingSave();
    const { newPath, folderBacked, entryFileName } = buildPostTargetPath(node, newName);
    const targetPath = folderBacked ? `${newPath}/${entryFileName}` : newPath;

    if (findNode(tree, newPath)) {
      showToast(`Failed to create post from existing: "${newName}" already exists`);
      return;
    }

    try {
      const raw = await invoke<string>("read_file", { path: node.path });
      const content = createPostFromExistingContent(raw);

      if (folderBacked) {
        await invoke("ensure_dir", { path: newPath });
      }

      await invoke("create_file", { path: targetPath, content });
      const updated = await refreshTree();
      const created = findNode(updated, targetPath);
      if (created) {
        await handleSelectFile(created);
      }
    } catch (err) {
      console.error("Failed to create post from existing:", err);
      showToast(`Failed to create post from existing: ${err}`);
    }
  }

  async function handleDelete(node: FileNode) {
    const confirmed = await confirm(`Move "${node.name}" to Trash?`, {
      title: "Delete",
      kind: "warning",
    });
    if (!confirmed) return;
    if (selectedFile?.path === node.path) {
      await flushPendingSave();
    }
    try {
      const targetPath = node.containerDirPath ?? node.path;
      await invoke("trash_file", { path: targetPath });
      if (workspaceRoot) syncRecentDelete(workspaceRoot, targetPath);
      onPathRemoved?.(targetPath);
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
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDuplicate,
    handleNewFromExisting,
    handleDelete,
    loadDirectoryChildren,
  };
}
