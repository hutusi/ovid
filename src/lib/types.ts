export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  extension?: string;
}

export interface WorkspaceState {
  rootPath: string | null;
  tree: FileNode[];
}

export type SaveStatus = "saved" | "unsaved";
