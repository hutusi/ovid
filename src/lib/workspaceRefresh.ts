import { findNodeByPath } from "./appRestore";
import type { FileNode, SaveStatus } from "./types";

export type ExternalWorkspaceChangeAction =
  | { type: "none" }
  | { type: "warn-unsaved"; revision: string }
  | { type: "reload-active-file"; node: FileNode }
  | { type: "close-active-file" };

export function getExternalWorkspaceChangeAction({
  activeFile,
  revision,
  tree,
  saveStatus,
  reloadSucceeded,
  lastWarnedRevision,
}: {
  activeFile: FileNode | null;
  revision: string;
  tree: FileNode[];
  saveStatus: SaveStatus;
  reloadSucceeded?: boolean;
  lastWarnedRevision: string | null;
}): ExternalWorkspaceChangeAction {
  if (!activeFile) return { type: "none" };

  // "saving" means a write is in flight, so there are still local edits that a
  // blind reload would clobber — treat it like "unsaved" here.
  if (saveStatus !== "saved") {
    if (lastWarnedRevision === revision) return { type: "none" };
    return { type: "warn-unsaved", revision };
  }

  if (reloadSucceeded === false) {
    return findNodeByPath(tree, activeFile.path) ? { type: "none" } : { type: "close-active-file" };
  }

  return {
    type: "reload-active-file",
    node: findNodeByPath(tree, activeFile.path) ?? activeFile,
  };
}
