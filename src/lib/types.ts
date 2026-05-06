export type ModalState =
  | { type: "new-file"; dirPath: string; contentType?: string }
  | { type: "duplicate-file"; node: FileNode }
  | { type: "new-from-existing"; node: FileNode }
  | { type: "rename-path"; node: FileNode }
  | null;

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  childrenLoaded?: boolean;
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

export interface GitRemoteBranch {
  name: string;
  remoteName: string;
  remoteRef: string;
}

export interface GitRemote {
  name: string;
  url: string | null;
}

export interface GitRemoteInfo {
  remotes: GitRemote[];
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
  draft: boolean;
  matches: SearchMatch[];
  totalMatches: number;
  hasMoreMatches: boolean;
}
