export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  extension?: string;
  title?: string;
  draft?: boolean;
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

export type GitStatus = "modified" | "staged" | "untracked";

export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
}

export interface SearchResult {
  path: string;
  title?: string;
  matches: SearchMatch[];
}
