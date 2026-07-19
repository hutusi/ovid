import type { NewContentKind } from "./amytisScaffold";

/** An entry in an Amytis collection's `items:` list (mirrors the Amytis schema). */
export type CollectionItem =
  | { post: string; label?: string }
  | { series: string; exclude?: string[]; label?: string };

export type ModalState =
  | { type: "new-file"; dirPath: string; kind: NewContentKind }
  | { type: "duplicate-file"; node: FileNode }
  | { type: "new-from-existing"; node: FileNode }
  | { type: "rename-path"; node: FileNode }
  | { type: "add-to-collection"; indexPath: string; existing: CollectionItem[] }
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
  /** Sidebar projection only: non-default-locale `<slug>.<locale>` variants
   *  grouped under this base file by `groupTranslations`. */
  translations?: FileNode[];
  /** Sidebar projection only: the locale code of a translation variant row. */
  locale?: string;
  /** Sidebar projection only: a top-level bucket whose `features.<id>.enabled`
   *  is `false` — shown but marked "hidden from the published site". */
  disabledForSite?: boolean;
}

export interface WorkspaceState {
  rootPath: string | null;
  tree: FileNode[];
}

export type SaveStatus = "saving" | "saved" | "unsaved";

export interface RecentFile {
  path: string;
  name: string;
  title?: string;
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

/** One-shot "jump to this search match" request, forwarded from the search
 *  panel to the editor once the target file is open. `gen` makes each click
 *  distinct so repeated jumps to the same match re-fire. */
export interface SearchJumpTarget {
  path: string;
  /** Trimmed raw markdown line the match sits on (primary locator). */
  lineContent: string;
  /** 1-based line number of the match in the whole file (frontmatter
   *  included) — used to disambiguate repeated lines. */
  lineNumber: number;
  /** The search query (fallback locator — inline marks split styled lines
   *  across text nodes, where the raw line can't match the rendered doc). */
  query: string;
  gen: number;
}
