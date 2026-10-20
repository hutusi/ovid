import type { FileNode } from "./generated/FileNode";
import type { WorkspaceFsChange } from "./generated/WorkspaceFsChange";
import type { WorkspaceResult } from "./generated/WorkspaceResult";
import { invokeCmd, listenEvent } from "./internal";

/** Rejection marker for a clone the user cancelled. Mirrors `CLONE_CANCELLED`
 *  in `src-tauri/src/workspace/clone.rs`. */
export const CLONE_CANCELLED = "CLONE_CANCELLED";

export interface OpenWorkspaceAtPathArgs {
  path: string;
}

export interface CreateAmytisWorkspaceArgs {
  parentDir: string;
  name: string;
}

export interface CloneWorkspaceArgs {
  url: string;
  parentDir: string;
  name: string | null;
}

export const workspace = {
  open: () => invokeCmd<WorkspaceResult | null>("open_workspace"),
  openAtPath: (args: OpenWorkspaceAtPathArgs) =>
    invokeCmd<WorkspaceResult | null>("open_workspace_at_path", args),
  createAmytis: (args: CreateAmytisWorkspaceArgs) =>
    invokeCmd<WorkspaceResult>("create_amytis_workspace", args),
  /** Rejects with CLONE_CANCELLED when stopped via `cancelClone`. */
  clone: (args: CloneWorkspaceArgs) => invokeCmd<WorkspaceResult>("clone_workspace", args),
  /** Stop the clone in progress (git is killed, the partial folder removed). */
  cancelClone: () => invokeCmd<void>("cancel_clone"),
  tree: () => invokeCmd<FileNode[]>("list_workspace_tree"),
  getRevision: () => invokeCmd<string>("get_workspace_revision"),
  onFsChange: (handler: (change: WorkspaceFsChange) => void) =>
    listenEvent<WorkspaceFsChange>("workspace-fs-change", handler),
};
