import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { GitStatus } from "./types";

interface GitFileStatus {
  path: string;
  status: string;
}

export function useGit(workspaceRoot: string | null) {
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, GitStatus>>(new Map());
  const [isGitRepo, setIsGitRepo] = useState(false);

  const refreshGitStatus = useCallback(async () => {
    if (!workspaceRoot) {
      setGitStatusMap(new Map());
      setIsGitRepo(false);
      return;
    }
    try {
      const statuses = await invoke<GitFileStatus[]>("get_git_status");
      setIsGitRepo(true);
      setGitStatusMap(new Map(statuses.map((s) => [s.path, s.status as GitStatus])));
    } catch {
      setIsGitRepo(false);
      setGitStatusMap(new Map());
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refreshGitStatus();
  }, [refreshGitStatus]);

  async function handleCommit(message: string, push: boolean): Promise<void> {
    await invoke("git_commit", { message, push });
    void refreshGitStatus();
  }

  async function getBranch(): Promise<string> {
    return invoke<string>("get_git_branch");
  }

  return { gitStatusMap, isGitRepo, refreshGitStatus, handleCommit, getBranch };
}
