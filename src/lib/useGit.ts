import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "./commands";
import { measureAsync } from "./perf";
import type {
  GitBranch,
  GitCommitChange,
  GitRemoteBranch,
  GitRemoteInfo,
  GitStatus,
} from "./types";

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
          // commands.git.branch() returns "" for non-git workspaces (graceful degradation)
          detectedBranch = await commands.git.branch();
          if (refreshGeneration !== refreshGenerationRef.current) return;
          detectedInRepo = detectedBranch.length > 0;
          setIsGitRepo(detectedInRepo);
          setCurrentBranch(detectedBranch);
          if (detectedInRepo) {
            const [statuses, remote] = await Promise.all([
              commands.git.status(),
              commands.git.remoteInfo(),
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
    return (await commands.git.commitChanges()) as GitCommitChange[];
  }

  async function getBranch(): Promise<string> {
    return commands.git.branch();
  }

  async function getBranches(): Promise<GitBranch[]> {
    return commands.git.branches();
  }

  async function getRemoteBranches(): Promise<GitRemoteBranch[]> {
    return commands.git.remoteBranches();
  }

  async function getRemoteInfo(): Promise<GitRemoteInfo> {
    return commands.git.remoteInfo();
  }

  async function handlePush(remoteName?: string): Promise<void> {
    try {
      await commands.git.push({ remoteName });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handlePull(): Promise<void> {
    try {
      await commands.git.pull();
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleFetch(): Promise<void> {
    try {
      await commands.git.fetch();
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleSwitchBranch(branch: string): Promise<void> {
    try {
      await commands.git.switchBranch({ branch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleCreateBranch(branch: string): Promise<void> {
    try {
      await commands.git.createBranch({ branch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleCheckoutRemoteBranch(remoteRef: string): Promise<void> {
    try {
      await commands.git.checkoutRemoteBranch({ remoteRef });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleRenameBranch(oldBranch: string, newBranch: string): Promise<void> {
    try {
      await commands.git.renameBranch({ oldBranch, newBranch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleDeleteBranch(branch: string): Promise<void> {
    try {
      await commands.git.deleteBranch({ branch });
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleOpenRemote(remoteName?: string): Promise<void> {
    await commands.git.openRemote({ remoteName });
  }

  async function handleCommit(message: string, paths: string[], push: boolean): Promise<void> {
    try {
      await commands.git.commit({ message, push, paths });
    } finally {
      void refreshGitStatus();
    }
  }

  // Credentialed retry variants — invoked from the credentials dialog after
  // an AUTH_REQUIRED failure on push/pull/fetch. Each one calls the matching
  // *_with_credentials Tauri command and refreshes git state afterwards.

  async function handlePushWithCredentials(args: {
    remoteName?: string;
    username: string;
    password: string;
    remember: boolean;
  }): Promise<void> {
    try {
      await commands.git.pushWithCredentials(args);
    } finally {
      void refreshGitStatus();
    }
  }

  async function handlePullWithCredentials(args: {
    username: string;
    password: string;
    remember: boolean;
  }): Promise<void> {
    try {
      await commands.git.pullWithCredentials(args);
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleFetchWithCredentials(args: {
    username: string;
    password: string;
    remember: boolean;
  }): Promise<void> {
    try {
      await commands.git.fetchWithCredentials(args);
    } finally {
      void refreshGitStatus();
    }
  }

  async function handleForgetCredentials(host: string): Promise<void> {
    await commands.git.forgetCredentials({ host });
  }

  async function hasCredentialsForHost(host: string): Promise<boolean> {
    if (!host) return false;
    return commands.git.hasCredentialsForHost({ host });
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
    handlePushWithCredentials,
    handlePullWithCredentials,
    handleFetchWithCredentials,
    handleForgetCredentials,
    hasCredentialsForHost,
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
