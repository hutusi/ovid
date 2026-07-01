import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { GitRemoteInfo } from "./types";

interface UseGitRemoteActionsOptions {
  remoteInfo: GitRemoteInfo;
  showToast: (message: string) => void;
  handleOpenRemote: (remoteName?: string) => Promise<void>;
}

/** Owns the two remote-URL actions that don't touch branch state: opening a
 *  remote in the browser and copying its URL to the clipboard. */
export function useGitRemoteActions({
  remoteInfo,
  showToast,
  handleOpenRemote,
}: UseGitRemoteActionsOptions) {
  const { t } = useTranslation();

  const copyRemoteUrl = useCallback(
    async (remoteName?: string) => {
      const targetRemote =
        remoteName != null
          ? (remoteInfo.remotes.find((remote) => remote.name === remoteName) ?? null)
          : null;
      const remoteUrl = remoteName != null ? (targetRemote?.url ?? null) : remoteInfo.remoteUrl;
      if (!remoteUrl) {
        showToast(
          remoteName
            ? t("errors.git_no_remote_url_for", { remote: remoteName })
            : t("errors.git_no_remote_url")
        );
        return;
      }
      try {
        await navigator.clipboard.writeText(remoteUrl);
        showToast(t("toast.copied_remote_url"));
      } catch {
        showToast(t("errors.git_copy_remote_failed"));
      }
    },
    [remoteInfo.remoteUrl, remoteInfo.remotes, showToast, t]
  );

  const openRemote = useCallback(
    async (remoteName?: string) => {
      try {
        await handleOpenRemote(remoteName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(t("errors.git_open_remote_failed", { message }));
      }
    },
    [handleOpenRemote, showToast, t]
  );

  return {
    openRemote,
    copyRemoteUrl,
  };
}
