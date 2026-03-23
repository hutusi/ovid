import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { GitBranch, GitCommitChange, GitRemoteInfo, GitStatus } from "./types";

interface GitFileStatus {
  path: string;
  status: string;
}

export function useGit(workspaceRoot: string | null) {
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, GitStatus>>(new Map());
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [currentBranch, setCurrentBranch] = useState("");
  const [remoteInfo, setRemoteInfo] = useState<GitRemoteInfo>({
    remoteName: null,
    remoteUrl: null,
    upstream: null,
    aheadBehind: null,
  });

  const refreshGitStatus = useCallback(async () => {
    if (!workspaceRoot) {
      setGitStatusMap(new Map());
      setIsGitRepo(false);
      setCurrentBranch("");
      setRemoteInfo({ remoteName: null, remoteUrl: null, upstream: null, aheadBehind: null });
      return;
    }
    try {
      // get_git_branch returns "" for non-git workspaces (graceful degradation)
      const branch = await invoke<string>("get_git_branch");
      const inRepo = branch.length > 0;
      setIsGitRepo(inRepo);
      setCurrentBranch(branch);
      if (inRepo) {
        const [statuses, remote] = await Promise.all([
          invoke<GitFileStatus[]>("get_git_status"),
          invoke<GitRemoteInfo>("get_git_remote_info"),
        ]);
        setGitStatusMap(new Map(statuses.map((s) => [s.path, s.status as GitStatus])));
        setRemoteInfo(remote);
      } else {
        setGitStatusMap(new Map());
        setRemoteInfo({ remoteName: null, remoteUrl: null, upstream: null, aheadBehind: null });
      }
    } catch {
      setIsGitRepo(false);
      setGitStatusMap(new Map());
      setCurrentBranch("");
      setRemoteInfo({ remoteName: null, remoteUrl: null, upstream: null, aheadBehind: null });
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refreshGitStatus();
  }, [refreshGitStatus]);

  async function getCommitChanges(): Promise<GitCommitChange[]> {
    return invoke<GitCommitChange[]>("get_git_commit_changes");
  }

  async function getBranch(): Promise<string> {
    return invoke<string>("get_git_branch");
  }

  async function getBranches(): Promise<GitBranch[]> {
    return invoke<GitBranch[]>("get_git_branches");
  }

  async function getRemoteInfo(): Promise<GitRemoteInfo> {
    return invoke<GitRemoteInfo>("get_git_remote_info");
  }

  async function handlePush(): Promise<void> {
    try {
      await invoke("git_push");
    } finally {
      void refreshGitStatus();
    }
  }

  async function handlePull(): Promise<void> {
    try {
      await invoke("git_pull");
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleFetch(): Promise<void> {
    try {
      await invoke("git_fetch");
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleSwitchBranch(branch: string): Promise<void> {
    try {
      await invoke("git_switch_branch", { branch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleCreateBranch(branch: string): Promise<void> {
    try {
      await invoke("git_create_branch", { branch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleOpenRemote(): Promise<void> {
    await invoke("open_git_remote");
  }

  async function handleCommit(message: string, paths: string[], push: boolean): Promise<void> {
    try {
      await invoke("git_commit", { message, push, paths });
    } finally {
      void refreshGitStatus();
    }
  }

  return {
    gitStatusMap,
    isGitRepo,
    currentBranch,
    remoteInfo,
    refreshGitStatus,
    handleCommit,
    handlePush,
    handlePull,
    handleFetch,
    handleSwitchBranch,
    handleCreateBranch,
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteInfo,
  };
}
