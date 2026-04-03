import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { measureAsync } from "./perf";
import type {
  GitBranch,
  GitCommitChange,
  GitRemoteBranch,
  GitRemoteInfo,
  GitStatus,
} from "./types";

interface GitFileStatus {
  path: string;
  status: string;
}

export function useGit(workspaceRoot: string | null) {
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, GitStatus>>(new Map());
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [currentBranch, setCurrentBranch] = useState("");
  const [remoteInfo, setRemoteInfo] = useState<GitRemoteInfo>({
    remotes: [],
    remoteName: null,
    remoteUrl: null,
    upstream: null,
    aheadBehind: null,
  });
  const currentWorkspaceRootRef = useRef(workspaceRoot);
  const refreshGenerationRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);

  const resetGitState = useCallback(() => {
    setGitStatusMap(new Map());
    setIsGitRepo(false);
    setCurrentBranch("");
    setRemoteInfo({
      remotes: [],
      remoteName: null,
      remoteUrl: null,
      upstream: null,
      aheadBehind: null,
    });
  }, []);

  const resetGitDetails = useCallback(() => {
    setGitStatusMap(new Map());
    setRemoteInfo({
      remotes: [],
      remoteName: null,
      remoteUrl: null,
      upstream: null,
      aheadBehind: null,
    });
  }, []);

  const refreshGitStatus = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }

    const refreshGeneration = refreshGenerationRef.current;
    const refreshWorkspaceRoot = currentWorkspaceRootRef.current;
    let detectedBranch = "";
    let detectedInRepo = false;

    const runRefresh = async () => {
      if (!refreshWorkspaceRoot) {
        if (refreshGeneration === refreshGenerationRef.current) {
          resetGitState();
        }
        return;
      }
      try {
        await measureAsync("git.refreshStatus", async () => {
          // get_git_branch returns "" for non-git workspaces (graceful degradation)
          detectedBranch = await invoke<string>("get_git_branch");
          if (refreshGeneration !== refreshGenerationRef.current) return;
          detectedInRepo = detectedBranch.length > 0;
          setIsGitRepo(detectedInRepo);
          setCurrentBranch(detectedBranch);
          if (detectedInRepo) {
            const [statuses, remote] = await Promise.all([
              invoke<GitFileStatus[]>("get_git_status"),
              invoke<GitRemoteInfo>("get_git_remote_info"),
            ]);
            if (refreshGeneration !== refreshGenerationRef.current) return;
            setGitStatusMap(new Map(statuses.map((s) => [s.path, s.status as GitStatus])));
            setRemoteInfo(remote);
          } else {
            resetGitState();
          }
        });
      } catch (err) {
        console.warn("[useGit] refreshGitStatus failed", {
          err,
          refreshGeneration,
        });
        if (refreshGeneration === refreshGenerationRef.current) {
          if (detectedInRepo) {
            setIsGitRepo(true);
            setCurrentBranch(detectedBranch);
            resetGitDetails();
          } else {
            resetGitState();
          }
        }
      }
    };

    const refreshPromise = runRefresh().finally(() => {
      refreshInFlightRef.current = null;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refreshGitStatus();
      }
    });
    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [resetGitDetails, resetGitState]);

  useEffect(() => {
    currentWorkspaceRootRef.current = workspaceRoot;
    refreshGenerationRef.current += 1;
    resetGitState();
    void refreshGitStatus();
  }, [workspaceRoot, refreshGitStatus, resetGitState]);

  async function getCommitChanges(): Promise<GitCommitChange[]> {
    return invoke<GitCommitChange[]>("get_git_commit_changes");
  }

  async function getBranch(): Promise<string> {
    return invoke<string>("get_git_branch");
  }

  async function getBranches(): Promise<GitBranch[]> {
    return invoke<GitBranch[]>("get_git_branches");
  }

  async function getRemoteBranches(): Promise<GitRemoteBranch[]> {
    return invoke<GitRemoteBranch[]>("get_git_remote_branches");
  }

  async function getRemoteInfo(): Promise<GitRemoteInfo> {
    return invoke<GitRemoteInfo>("get_git_remote_info");
  }

  async function handlePush(remoteName?: string): Promise<void> {
    try {
      await invoke("git_push", remoteName ? { remoteName } : undefined);
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

  async function handleCheckoutRemoteBranch(remoteRef: string): Promise<void> {
    try {
      await invoke("git_checkout_remote_branch", { remoteRef });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleRenameBranch(oldBranch: string, newBranch: string): Promise<void> {
    try {
      await invoke("git_rename_branch", { oldBranch, newBranch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleDeleteBranch(branch: string): Promise<void> {
    try {
      await invoke("git_delete_branch", { branch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleOpenRemote(remoteName?: string): Promise<void> {
    await invoke("open_git_remote", remoteName ? { remoteName } : undefined);
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
    handleCheckoutRemoteBranch,
    handleRenameBranch,
    handleDeleteBranch,
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteBranches,
    getRemoteInfo,
  };
}
