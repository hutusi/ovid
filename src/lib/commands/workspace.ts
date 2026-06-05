import type { FileNode } from "./generated/FileNode";
import type { WorkspaceResult } from "./generated/WorkspaceResult";
import { invokeCmd } from "./internal";

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
  clone: (args: CloneWorkspaceArgs) => invokeCmd<WorkspaceResult>("clone_workspace", args),
  tree: () => invokeCmd<FileNode[]>("list_workspace_tree"),
  getRevision: () => invokeCmd<string>("get_workspace_revision"),
};
