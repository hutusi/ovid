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
