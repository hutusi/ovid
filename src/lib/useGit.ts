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

/** Whether two status maps hold the same paths in the same states. */
export function sameGitStatusMap(a: Map<string, GitStatus>, b: Map<string, GitStatus>): boolean {
  if (a.size !== b.size) return false;
  for (const [path, status] of a) {
    if (b.get(path) !== status) return false;
  }
  return true;
}

function sameRemoteInfo(a: GitRemoteInfo, b: GitRemoteInfo): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

  // A refresh that finds nothing changed keeps the previous objects, so the
  // sidebar rows and everything else keyed on them don't re-render.
  const applyStatuses = useCallback((statuses: Array<{ path: string; status: string }>) => {
    const next = new Map(statuses.map((s) => [s.path, s.status as GitStatus]));
    setGitStatusMap((prev) => (sameGitStatusMap(prev, next) ? prev : next));
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
            applyStatuses(statuses);
            setRemoteInfo((prev) => (sameRemoteInfo(prev, remote) ? prev : remote));
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
  }, [applyStatuses, resetGitDetails, resetGitState]);

  /** Refresh only per-file status — all a save can change — instead of the
   *  full refresh's branch, remotes and upstream queries (about ten git
   *  processes). A full refresh already in flight covers it; one is queued
   *  instead so the save isn't missed by a status read that ran before it. */
  const refreshFileStatus = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    const generation = refreshGenerationRef.current;
    if (!currentWorkspaceRootRef.current) return;
    try {
      const statuses = await measureAsync("git.refreshFileStatus", () => commands.git.status());
      if (generation === refreshGenerationRef.current) applyStatuses(statuses);
    } catch (err) {
      // The next full refresh reconciles; a status hiccup isn't worth a toast.
      console.warn("[useGit] refreshFileStatus failed", err);
    }
  }, [applyStatuses]);

  useEffect(() => {
    currentWorkspaceRootRef.current = workspaceRoot;
    refreshGenerationRef.current += 1;
    resetGitState();
    void refreshGitStatus();
  }, [workspaceRoot, refreshGitStatus, resetGitState]);

  // Every handler is stable (useCallback) — they feed App's action context and
  // the native-menu adapter, where a fresh identity per render meant
  // rebuilding that context and churning listeners on every App render.
  const getCommitChanges = useCallback(async (): Promise<GitCommitChange[]> => {
    return (await commands.git.commitChanges()) as GitCommitChange[];
  }, []);

  const getBranch = useCallback(async (): Promise<string> => {
    return commands.git.branch();
  }, []);

  const getBranches = useCallback(async (): Promise<GitBranch[]> => {
    return commands.git.branches();
  }, []);

  const getRemoteBranches = useCallback(async (): Promise<GitRemoteBranch[]> => {
    return commands.git.remoteBranches();
  }, []);

  const getRemoteInfo = useCallback(async (): Promise<GitRemoteInfo> => {
    return commands.git.remoteInfo();
  }, []);

  const handlePush = useCallback(
    async (remoteName?: string): Promise<void> => {
      try {
        await commands.git.push({ remoteName });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handlePull = useCallback(async (): Promise<void> => {
    try {
      await commands.git.pull();
    } finally {
      void refreshGitStatus();
    }
  }, [refreshGitStatus]);

  const handleFetch = useCallback(async (): Promise<void> => {
    try {
      await commands.git.fetch();
    } finally {
      void refreshGitStatus();
    }
  }, [refreshGitStatus]);

  const handleSwitchBranch = useCallback(
    async (branch: string): Promise<void> => {
      try {
        await commands.git.switchBranch({ branch });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleCreateBranch = useCallback(
    async (branch: string): Promise<void> => {
      try {
        await commands.git.createBranch({ branch });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleCheckoutRemoteBranch = useCallback(
    async (remoteRef: string): Promise<void> => {
      try {
        await commands.git.checkoutRemoteBranch({ remoteRef });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleRenameBranch = useCallback(
    async (oldBranch: string, newBranch: string): Promise<void> => {
      try {
        await commands.git.renameBranch({ oldBranch, newBranch });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleDeleteBranch = useCallback(
    async (branch: string): Promise<void> => {
      try {
        await commands.git.deleteBranch({ branch });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleOpenRemote = useCallback(async (remoteName?: string): Promise<void> => {
    await commands.git.openRemote({ remoteName });
  }, []);

  const handleCommit = useCallback(
    async (message: string, paths: string[], push: boolean): Promise<void> => {
      try {
        await commands.git.commit({ message, push, paths });
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  // Credentialed retry variants — invoked from the credentials dialog after
  // an AUTH_REQUIRED failure on push/pull/fetch. Each one calls the matching
  // *_with_credentials Tauri command and refreshes git state afterwards.

  const handlePushWithCredentials = useCallback(
    async (args: {
      remoteName?: string;
      username: string;
      password: string;
      remember: boolean;
    }): Promise<void> => {
      try {
        await commands.git.pushWithCredentials(args);
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handlePullWithCredentials = useCallback(
    async (args: { username: string; password: string; remember: boolean }): Promise<void> => {
      try {
        await commands.git.pullWithCredentials(args);
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleFetchWithCredentials = useCallback(
    async (args: { username: string; password: string; remember: boolean }): Promise<void> => {
      try {
        await commands.git.fetchWithCredentials(args);
      } finally {
        void refreshGitStatus();
      }
    },
    [refreshGitStatus]
  );

  const handleForgetCredentials = useCallback(async (host: string): Promise<void> => {
    await commands.git.forgetCredentials({ host });
  }, []);

  const hasCredentialsForHost = useCallback(async (host: string): Promise<boolean> => {
    if (!host) return false;
    return commands.git.hasCredentialsForHost({ host });
  }, []);

  return {
    gitStatusMap,
    isGitRepo,
    currentBranch,
    remoteInfo,
    refreshGitStatus,
    refreshFileStatus,
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
