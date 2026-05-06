import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SidebarMode } from "../components/Sidebar";
import type { FileNode } from "./types";

const SIDEBAR_MODE_KEY_PREFIX = "ovid:sidebarMode";

function mergeFilesTreeChildren(
  nodes: FileNode[],
  dirPath: string,
  children: FileNode[]
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === dirPath && node.isDirectory)
      return { ...node, children, childrenLoaded: true };
    if (!node.children) return node;
    return { ...node, children: mergeFilesTreeChildren(node.children, dirPath, children) };
  });
}

interface UseFilesModeOptions {
  workspaceRootPath: string | null;
  showToast: (message: string) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}

export function useFilesMode({ workspaceRootPath, showToast, t }: UseFilesModeOptions) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("content");
  const [fileViewerNode, setFileViewerNode] = useState<FileNode | null>(null);
  const [filesTree, setFilesTree] = useState<FileNode[]>([]);
  const loadGenRef = useRef(0);

  const loadFilesTree = useCallback(async () => {
    if (!workspaceRootPath) return;
    loadGenRef.current += 1;
    const thisGen = loadGenRef.current;
    try {
      const nodes = await invoke<FileNode[]>("list_workspace_children", {
        path: workspaceRootPath,
        allFiles: true,
      });
      if (loadGenRef.current !== thisGen) return;
      setFilesTree(nodes);
    } catch (err) {
      if (loadGenRef.current !== thisGen) return;
      showToast(
        t("workspace.load_files_error", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }, [workspaceRootPath, showToast, t]);

  const handleLoadDirectoryChildrenFiles = useCallback(
    async (dirPath: string) => {
      const thisGen = loadGenRef.current;
      try {
        const children = await invoke<FileNode[]>("list_workspace_children", {
          path: dirPath,
          allFiles: true,
        });
        if (loadGenRef.current !== thisGen) return;
        setFilesTree((current) => mergeFilesTreeChildren(current, dirPath, children));
      } catch (err) {
        if (loadGenRef.current !== thisGen) return;
        showToast(
          t("workspace.load_files_error", {
            message: err instanceof Error ? err.message : String(err),
          })
        );
      }
    },
    [showToast, t]
  );

  // Restore sidebarMode from localStorage when the workspace changes
  useEffect(() => {
    const key = workspaceRootPath
      ? `${SIDEBAR_MODE_KEY_PREFIX}:${workspaceRootPath}`
      : SIDEBAR_MODE_KEY_PREFIX;
    const stored = localStorage.getItem(key);
    setSidebarMode(stored === "files" ? "files" : "content");
    setFileViewerNode(null);
    setFilesTree([]);
    loadGenRef.current += 1;
  }, [workspaceRootPath]);

  // Persist sidebarMode and load / clear the files tree accordingly
  useEffect(() => {
    const key = workspaceRootPath
      ? `${SIDEBAR_MODE_KEY_PREFIX}:${workspaceRootPath}`
      : SIDEBAR_MODE_KEY_PREFIX;
    localStorage.setItem(key, sidebarMode);
    if (sidebarMode === "content") {
      loadGenRef.current += 1;
      setFileViewerNode(null);
      setFilesTree([]);
    } else {
      void loadFilesTree();
    }
  }, [sidebarMode, workspaceRootPath, loadFilesTree]);

  function handleToggleSidebarMode() {
    setSidebarMode((prev) => (prev === "content" ? "files" : "content"));
  }

  return {
    sidebarMode,
    fileViewerNode,
    setFileViewerNode,
    filesTree,
    handleToggleSidebarMode,
    handleLoadDirectoryChildrenFiles,
  };
}
