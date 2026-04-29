import type { GitRemoteInfo, GitStatus } from "./types";

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export type GitSyncActionKind = "push" | "pull" | "push-track";

export interface GitSyncPopoverState {
  label: string;
  title: string;
  tracking: string;
  description: string;
  actionKind: GitSyncActionKind | null;
  actionLabel: string | null;
}

export interface GitChangeSummary {
  label: string;
  title: string;
}

export function getPushSuccessMessage(remoteInfo: GitRemoteInfo, t: Translate): string {
  return !remoteInfo.upstream && remoteInfo.remoteName
    ? t("git_sync_popover.push_success_upstream")
    : t("git_sync_popover.push_success");
}

export function getGitSyncLabel(remoteInfo: GitRemoteInfo): string | null {
  if (remoteInfo.aheadBehind === ">") return "ahead";
  if (remoteInfo.aheadBehind === "<") return "behind";
  if (remoteInfo.aheadBehind === "<>") return "diverged";
  if (!remoteInfo.upstream && remoteInfo.remoteName) return "no upstream";
  if (!remoteInfo.upstream && !remoteInfo.remoteName && remoteInfo.remotes.length > 1) {
    return "choose remote";
  }
  return null;
}

export function getGitSyncDisplayLabel(label: string, t: Translate): string {
  switch (label) {
    case "ahead":
      return t("git_sync_popover.label_ahead");
    case "behind":
      return t("git_sync_popover.label_behind");
    case "diverged":
      return t("git_sync_popover.label_diverged");
    case "no upstream":
      return t("git_sync_popover.label_no_upstream");
    case "choose remote":
      return t("git_sync_popover.label_choose_remote");
    default:
      return label;
  }
}

export function getGitSyncDescription(remoteInfo: GitRemoteInfo, t: Translate): string {
  if (remoteInfo.aheadBehind === ">")
    return t("git_sync_popover.desc_ahead", { upstream: remoteInfo.upstream });
  if (remoteInfo.aheadBehind === "<")
    return t("git_sync_popover.desc_behind", { upstream: remoteInfo.upstream });
  if (remoteInfo.aheadBehind === "<>")
    return t("git_sync_popover.desc_diverged", { upstream: remoteInfo.upstream });
  if (!remoteInfo.upstream && remoteInfo.remoteName)
    return t("git_sync_popover.desc_no_upstream", { remote: remoteInfo.remoteName });
  if (!remoteInfo.upstream && !remoteInfo.remoteName && remoteInfo.remotes.length > 1)
    return t("git_sync_popover.desc_choose_remote");
  return t("git_sync_popover.desc_synced");
}

export function getRemoteSummary(remoteInfo: GitRemoteInfo, t: Translate): string {
  if (remoteInfo.upstream) return remoteInfo.upstream;
  if (remoteInfo.remoteName) {
    return `${remoteInfo.remoteName}${remoteInfo.aheadBehind ? ` ${remoteInfo.aheadBehind}` : ""}`;
  }
  if (remoteInfo.remotes.length > 1) {
    return t("git_sync_popover.remotes_configured", { count: remoteInfo.remotes.length });
  }
  if (remoteInfo.remotes.length === 1) {
    return remoteInfo.remotes[0].name;
  }
  return t("git_sync_popover.no_upstream_summary");
}

export function getGitBranchTitle(branch: string, remoteInfo: GitRemoteInfo, t: Translate): string {
  return [
    t("git_branch.current", { branch }),
    remoteInfo.upstream
      ? t("git_branch.upstream", { upstream: remoteInfo.upstream })
      : t("git_branch.no_upstream"),
    !remoteInfo.upstream && remoteInfo.remoteName
      ? t("git_branch.push_remote", { remote: remoteInfo.remoteName })
      : null,
    !remoteInfo.upstream && !remoteInfo.remoteName && remoteInfo.remotes.length > 1
      ? t("git_branch.remotes", { remotes: remoteInfo.remotes.map((r) => r.name).join(", ") })
      : null,
    remoteInfo.aheadBehind ? t("git_branch.tracking", { tracking: remoteInfo.aheadBehind }) : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getGitSyncPopoverState(
  remoteInfo: GitRemoteInfo,
  t: Translate
): GitSyncPopoverState | null {
  const label = getGitSyncLabel(remoteInfo);
  if (!label) return null;

  if (remoteInfo.upstream && remoteInfo.aheadBehind === ">") {
    return {
      label,
      title: t("git_sync_popover.label_ahead"),
      tracking: remoteInfo.upstream,
      description: t("git_sync_popover.desc_ahead", { upstream: remoteInfo.upstream }),
      actionKind: "push",
      actionLabel: t("git_sync_popover.action_push"),
    };
  }

  if (remoteInfo.upstream && remoteInfo.aheadBehind === "<") {
    return {
      label,
      title: t("git_sync_popover.label_behind"),
      tracking: remoteInfo.upstream,
      description: t("git_sync_popover.desc_behind", { upstream: remoteInfo.upstream }),
      actionKind: "pull",
      actionLabel: t("git_sync_popover.action_pull"),
    };
  }

  if (remoteInfo.upstream && remoteInfo.aheadBehind === "<>") {
    return {
      label,
      title: t("git_sync_popover.label_diverged"),
      tracking: remoteInfo.upstream,
      description: t("git_sync_popover.desc_diverged", { upstream: remoteInfo.upstream }),
      actionKind: null,
      actionLabel: null,
    };
  }

  if (!remoteInfo.upstream && remoteInfo.remoteName) {
    return {
      label,
      title: t("git_sync_popover.label_no_upstream"),
      tracking: remoteInfo.remoteName,
      description: t("git_sync_popover.desc_no_upstream", { remote: remoteInfo.remoteName }),
      actionKind: "push-track",
      actionLabel: t("git_sync_popover.action_push_track"),
    };
  }

  if (!remoteInfo.upstream && !remoteInfo.remoteName && remoteInfo.remotes.length > 1) {
    return {
      label,
      title: t("git_sync_popover.label_choose_remote"),
      tracking: remoteInfo.remotes.map((remote) => remote.name).join(", "),
      description: t("git_sync_popover.desc_choose_remote"),
      actionKind: null,
      actionLabel: null,
    };
  }

  return {
    label,
    title: label,
    tracking: getRemoteSummary(remoteInfo, t),
    description: getGitSyncDescription(remoteInfo, t),
    actionKind: null,
    actionLabel: null,
  };
}

export function getGitChangeSummary(
  gitStatusMap: Map<string, GitStatus>,
  t: Translate
): GitChangeSummary | null {
  const statuses = Array.from(gitStatusMap.values());
  const total = statuses.length;
  if (total === 0) return null;

  const staged = statuses.filter((status) => status === "staged").length;
  const unstaged = total - staged;
  const label = t("git_changes.label", { count: total });
  const titleParts = [];

  if (staged > 0) titleParts.push(t("git_changes.staged", { count: staged }));
  if (unstaged > 0) titleParts.push(t("git_changes.unstaged", { count: unstaged }));

  return {
    label,
    title: titleParts.length > 0 ? titleParts.join(", ") : label,
  };
}
