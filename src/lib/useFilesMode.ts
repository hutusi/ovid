import { useCallback, useEffect, useRef, useState } from "react";
import type { SidebarMode } from "../components/Sidebar";
import { createGenerationGuard } from "./latestOnly";
import type { FileNode } from "./types";

const SIDEBAR_MODE_KEY_PREFIX = "ovid:sidebarMode";

interface UseFilesModeOptions {
  workspaceRootPath: string | null;
}

export function useFilesMode({ workspaceRootPath }: UseFilesModeOptions) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("content");
  const [fileViewerNode, setFileViewerNodeRaw] = useState<FileNode | null>(null);
  // The viewer node and its generation guard live together so that *every*
  // change to the viewer — set, clear, or an internal reset below — bumps the
  // generation. A caller awaiting a slow transition can then check the guard
  // before applying its (possibly stale) result, and there is no way to change
  // the viewer without invalidating that pending work. See App's handleSidebarSelect.
  const viewerGenRef = useRef(createGenerationGuard());
  const setFileViewerNode = useCallback((node: FileNode | null) => {
    viewerGenRef.current.bump();
    setFileViewerNodeRaw(node);
  }, []);

  // Restore sidebarMode from localStorage when the workspace changes
  useEffect(() => {
    const key = workspaceRootPath
      ? `${SIDEBAR_MODE_KEY_PREFIX}:${workspaceRootPath}`
      : SIDEBAR_MODE_KEY_PREFIX;
    const stored = localStorage.getItem(key);
    setSidebarMode(stored === "files" ? "files" : "content");
    setFileViewerNode(null);
  }, [workspaceRootPath, setFileViewerNode]);

  // Persist sidebarMode whenever it changes
  useEffect(() => {
    const key = workspaceRootPath
      ? `${SIDEBAR_MODE_KEY_PREFIX}:${workspaceRootPath}`
      : SIDEBAR_MODE_KEY_PREFIX;
    localStorage.setItem(key, sidebarMode);
    if (sidebarMode === "content") {
      setFileViewerNode(null);
    }
  }, [sidebarMode, workspaceRootPath, setFileViewerNode]);

  function handleToggleSidebarMode() {
    setSidebarMode((prev) => (prev === "content" ? "files" : "content"));
  }

  return {
    sidebarMode,
    fileViewerNode,
    setFileViewerNode,
    viewerGen: viewerGenRef.current,
    handleToggleSidebarMode,
  };
}
