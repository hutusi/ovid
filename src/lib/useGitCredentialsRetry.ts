import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { parseAuthRequired } from "./commands/git";
import { formatGitActionError, type GitAction } from "./gitActionError";
import type { OverlayStack } from "./useOverlayStack";

// State for the credentials dialog opened on AUTH_REQUIRED. `host` keys the
// stored credential, `remoteName` is what the user sees in the subtitle.
// `operation` drives the title copy and the retry-on-submit command. The
// remaining flags survive across retries within the same dialog session.
export type GitCredentialsDialogState = {
  host: string;
  remoteName: string;
  operation: GitAction;
  hasStoredCredentials: boolean;
  authErrored: boolean;
  initialUsername?: string;
} | null;

interface UseGitCredentialsRetryOptions {
  overlay: OverlayStack;
  showToast: (message: string) => void;
  handlePushWithCredentials: (args: {
    remoteName?: string;
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  handlePullWithCredentials: (args: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  handleFetchWithCredentials: (args: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  handleForgetCredentials: (host: string) => Promise<void>;
  hasCredentialsForHost: (host: string) => Promise<boolean>;
}

/** Owns the AUTH_REQUIRED retry flow shared by push/pull/fetch and the
 *  commit-then-push combo: opening the credentials dialog, resubmitting the
 *  failed operation with the entered credentials, and forgetting a stored
 *  credential. `openGitCredentialsDialog` is the seam other git hooks call
 *  into when their own operation hits an AUTH_REQUIRED marker. */
export function useGitCredentialsRetry({
  overlay,
  showToast,
  handlePushWithCredentials,
  handlePullWithCredentials,
  handleFetchWithCredentials,
  handleForgetCredentials,
  hasCredentialsForHost,
}: UseGitCredentialsRetryOptions) {
  const { t } = useTranslation();

  // Pending context for a runGitAction call that hit AUTH_REQUIRED — used
  // by the credentials dialog submit handler to replay the success toast
  // and remoteName once the user supplies credentials. A ref (rather than
  // state) because nothing renders off of it.
  const pendingAuthRetryRef = useRef<{
    action: GitAction;
    successMessage: string;
    remoteName: string;
  } | null>(null);

  const openGitCredentialsDialog = useCallback(
    async (
      action: GitAction,
      successMessage: string,
      message: string,
      initialUsername?: string,
      authErrored: boolean = false
    ): Promise<boolean> => {
      const parsed = parseAuthRequired(message);
      if (!parsed) return false;
      pendingAuthRetryRef.current = {
        action,
        successMessage,
        remoteName: parsed.remoteName,
      };
      // The forget link is shown only when a credential is already stored
      // for the host — that's the "wrong PAT, let me reset" path. We
      // probe the store via a small query command rather than waiting for
      // the second failure to flag it.
      //
      // A probe failure (e.g. a malformed credentials file) must not abort
      // the recovery path — letting the rejection bubble out of this
      // function would propagate up through runGitAction's catch arm and
      // leave the user with neither the dialog nor an error toast. Fall
      // back to "no stored credentials" so the dialog still opens; the
      // forget link just won't appear.
      let hasStoredCredentials = false;
      if (parsed.host) {
        try {
          hasStoredCredentials = await hasCredentialsForHost(parsed.host);
        } catch {
          hasStoredCredentials = false;
        }
      }
      overlay.open({
        kind: "gitCredentials",
        state: {
          host: parsed.host,
          remoteName: parsed.remoteName,
          operation: action,
          hasStoredCredentials,
          authErrored,
          initialUsername,
        },
      });
      return true;
    },
    [hasCredentialsForHost, overlay]
  );

  // Submit handler for the credentials dialog. Dispatches to the matching
  // *WithCredentials command for the operation. On success: close the
  // dialog and replay the original success toast (carried over via
  // pendingAuthRetryRef). On another AUTH_REQUIRED (wrong PAT): keep the
  // dialog open and flip authErrored so the inline error renders. On
  // unrelated errors: close the dialog and fall through to the usual
  // error toast formatting.
  const handleGitCredentialsSubmit = useCallback(
    async (args: {
      operation: GitAction;
      remoteName: string;
      username: string;
      password: string;
      remember: boolean;
    }) => {
      const pending = pendingAuthRetryRef.current;
      try {
        if (args.operation === "push") {
          await handlePushWithCredentials({
            remoteName: args.remoteName || undefined,
            username: args.username,
            password: args.password,
            remember: args.remember,
          });
        } else if (args.operation === "pull") {
          await handlePullWithCredentials({
            username: args.username,
            password: args.password,
            remember: args.remember,
          });
        } else {
          await handleFetchWithCredentials({
            username: args.username,
            password: args.password,
            remember: args.remember,
          });
        }
        overlay.close("gitCredentials");
        pendingAuthRetryRef.current = null;
        showToast(pending?.successMessage ?? t(`toast.git_${args.operation}ed`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const reopened = await openGitCredentialsDialog(
          args.operation,
          pending?.successMessage ?? t(`toast.git_${args.operation}ed`),
          message,
          args.username,
          true
        );
        if (reopened) return;
        overlay.close("gitCredentials");
        pendingAuthRetryRef.current = null;
        showToast(formatGitActionError(args.operation, message, t));
      }
    },
    [
      handlePushWithCredentials,
      handlePullWithCredentials,
      handleFetchWithCredentials,
      openGitCredentialsDialog,
      overlay,
      showToast,
      t,
    ]
  );

  // Forget handler — wired to the "Forget saved credentials for {host}" link
  // shown inside the dialog when a credential is already stored. Removes
  // the entry, then refreshes the dialog state so the link disappears and
  // the user can type fresh credentials. We don't close the dialog: the
  // user still wants to authenticate.
  const handleForgetGitCredentials = useCallback(
    async (host: string) => {
      try {
        await handleForgetCredentials(host);
        const active = overlay.active;
        if (active?.kind === "gitCredentials") {
          overlay.open({
            kind: "gitCredentials",
            state: {
              ...active.state,
              hasStoredCredentials: false,
            },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(t("errors.git_forget_credentials_failed", { message }));
      }
    },
    [handleForgetCredentials, overlay, showToast, t]
  );

  return {
    openGitCredentialsDialog,
    handleGitCredentialsSubmit,
    handleForgetGitCredentials,
  };
}
