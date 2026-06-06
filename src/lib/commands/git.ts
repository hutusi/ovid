import type { GitBranch } from "./generated/GitBranch";
import type { GitCommitChange } from "./generated/GitCommitChange";
import type { GitFileStatus } from "./generated/GitFileStatus";
import type { GitRemoteBranch } from "./generated/GitRemoteBranch";
import type { GitRemoteInfo } from "./generated/GitRemoteInfo";
import { invokeCmd } from "./internal";

export interface GitCommitArgs {
  message: string;
  push: boolean;
  paths: string[];
}

export interface GitPushArgs {
  remoteName?: string;
}

export interface GitSwitchBranchArgs {
  branch: string;
}

export interface GitCreateBranchArgs {
  branch: string;
}

export interface GitRenameBranchArgs {
  oldBranch: string;
  newBranch: string;
}

export interface GitDeleteBranchArgs {
  branch: string;
}

export interface GitCheckoutRemoteBranchArgs {
  remoteRef: string;
}

export interface GitOpenRemoteArgs {
  remoteName?: string;
}

/**
 * Structured marker emitted by Rust when push/pull/fetch fail with an
 * auth-shaped stderr. Format: `AUTH_REQUIRED|<host>|<remoteName>`. The
 * controller layer detects this prefix and opens the credentials dialog
 * instead of surfacing a generic error toast.
 */
export const AUTH_REQUIRED_PREFIX = "AUTH_REQUIRED|";

export interface GitAuthRequired {
  host: string;
  remoteName: string;
}

/**
 * Parse an `AUTH_REQUIRED|host|remoteName` marker into its parts. Returns
 * `null` for non-matching messages. Empty `host`/`remoteName` fields are
 * preserved as empty strings — the caller still treats this as an auth
 * failure and can fall back to "the configured remote" copy.
 */
export function parseAuthRequired(message: string): GitAuthRequired | null {
  if (!message.startsWith(AUTH_REQUIRED_PREFIX)) return null;
  const [host = "", remoteName = ""] = message.slice(AUTH_REQUIRED_PREFIX.length).split("|", 2);
  return { host, remoteName };
}

export interface GitPushWithCredentialsArgs {
  remoteName?: string;
  username: string;
  password: string;
  remember: boolean;
}

export interface GitPullWithCredentialsArgs {
  username: string;
  password: string;
  remember: boolean;
}

export interface GitFetchWithCredentialsArgs {
  username: string;
  password: string;
  remember: boolean;
}

export interface GitForgetCredentialsArgs {
  host: string;
}

export const git = {
  status: () => invokeCmd<GitFileStatus[]>("get_git_status"),
  commitChanges: () => invokeCmd<GitCommitChange[]>("get_git_commit_changes"),
  branch: () => invokeCmd<string>("get_git_branch"),
  branches: () => invokeCmd<GitBranch[]>("get_git_branches"),
  remoteBranches: () => invokeCmd<GitRemoteBranch[]>("get_git_remote_branches"),
  remoteInfo: () => invokeCmd<GitRemoteInfo>("get_git_remote_info"),
  commit: (args: GitCommitArgs) => invokeCmd<void>("git_commit", args),
  push: (args?: GitPushArgs) => invokeCmd<void>("git_push", args),
  pushWithCredentials: (args: GitPushWithCredentialsArgs) =>
    invokeCmd<void>("git_push_with_credentials", args),
  pull: () => invokeCmd<void>("git_pull"),
  pullWithCredentials: (args: GitPullWithCredentialsArgs) =>
    invokeCmd<void>("git_pull_with_credentials", args),
  fetch: () => invokeCmd<void>("git_fetch"),
  fetchWithCredentials: (args: GitFetchWithCredentialsArgs) =>
    invokeCmd<void>("git_fetch_with_credentials", args),
  forgetCredentials: (args: GitForgetCredentialsArgs) =>
    invokeCmd<void>("git_forget_credentials", args),
  hasCredentialsForHost: (args: GitForgetCredentialsArgs) =>
    invokeCmd<boolean>("git_has_credentials_for_host", args),
  switchBranch: (args: GitSwitchBranchArgs) => invokeCmd<void>("git_switch_branch", args),
  createBranch: (args: GitCreateBranchArgs) => invokeCmd<void>("git_create_branch", args),
  renameBranch: (args: GitRenameBranchArgs) => invokeCmd<void>("git_rename_branch", args),
  deleteBranch: (args: GitDeleteBranchArgs) => invokeCmd<void>("git_delete_branch", args),
  checkoutRemoteBranch: (args: GitCheckoutRemoteBranchArgs) =>
    invokeCmd<void>("git_checkout_remote_branch", args),
  openRemote: (args?: GitOpenRemoteArgs) => invokeCmd<void>("open_git_remote", args),
};
