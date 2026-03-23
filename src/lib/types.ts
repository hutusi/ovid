export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  extension?: string;
  title?: string;
  draft?: boolean;
  contentType?: string;
  containerDirPath?: string;
}

export interface WorkspaceState {
  rootPath: string | null;
  tree: FileNode[];
}

export type SaveStatus = "saved" | "unsaved";

export interface RecentFile {
  path: string;
  name: string;
  title?: string;
}

export interface ContentType {
  name: string;
}

export interface RecentWorkspace {
  rootPath: string;
  name: string;
  lastOpenedAt: number;
}

export type GitStatus = "modified" | "staged" | "untracked";

export interface GitCommitChange {
  path: string;
  displayPath: string;
  status: "modified" | "staged" | "untracked" | "added" | "deleted" | "renamed";
  staged: boolean;
}

export interface GitBranch {
  name: string;
  upstream: string | null;
  aheadBehind: string | null;
  isCurrent: boolean;
}

export interface GitRemoteInfo {
  remoteName: string | null;
  remoteUrl: string | null;
  upstream: string | null;
  aheadBehind: string | null;
}

export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
}

export interface SearchResult {
  path: string;
  title?: string;
  matches: SearchMatch[];
}
