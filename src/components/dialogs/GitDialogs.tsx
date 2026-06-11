import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { GitUiController } from "../../lib/useGitUiController";
import type { OverlayStack } from "../../lib/useOverlayStack";

const CommitDialog = lazy(async () => ({
  default: (await import("../CommitDialog")).CommitDialog,
}));
const BranchSwitcher = lazy(async () => ({
  default: (await import("../BranchSwitcher")).BranchSwitcher,
}));
const NewBranchDialog = lazy(async () => ({
  default: (await import("../NewBranchDialog")).NewBranchDialog,
}));
const RenameBranchDialog = lazy(async () => ({
  default: (await import("../RenameBranchDialog")).RenameBranchDialog,
}));
const DeleteBranchDialog = lazy(async () => ({
  default: (await import("../DeleteBranchDialog")).DeleteBranchDialog,
}));
const GitCredentialsDialog = lazy(async () => ({
  default: (await import("../GitCredentialsDialog")).GitCredentialsDialog,
}));
const GitSyncPopover = lazy(async () => ({
  default: (await import("../GitSyncPopover")).GitSyncPopover,
}));

export interface GitDialogsProps {
  overlay: OverlayStack;
  gitUi: GitUiController;
  currentBranch: string;
  handlePush: (remoteName?: string) => Promise<void>;
}

/** Every git-related overlay: commit, branch switcher + the three branch
 * dialogs, the AUTH_REQUIRED credentials dialog, and the status-bar sync
 * popover. Payloads are read straight off the overlay state; actions come
 * from the git UI controller. */
export function GitDialogs({ overlay, gitUi, currentBranch, handlePush }: GitDialogsProps) {
  const { t } = useTranslation();
  const commitDialog = overlay.active?.kind === "commit" ? overlay.active.state : null;
  const branchSwitcher = overlay.active?.kind === "branchSwitcher" ? overlay.active.state : null;
  const renameBranchDialog = overlay.active?.kind === "renameBranch" ? overlay.active.state : null;
  const deleteBranchDialog = overlay.active?.kind === "deleteBranch" ? overlay.active.state : null;

  return (
    <>
      {overlay.is("gitSyncPopover") && gitUi.gitSyncPopover && (
        <Suspense fallback={null}>
          <GitSyncPopover
            state={gitUi.gitSyncPopover}
            onClose={() => overlay.close("gitSyncPopover")}
            onAction={
              gitUi.gitSyncPopover.actionLabel ? () => void gitUi.handleGitSyncAction() : undefined
            }
          />
        </Suspense>
      )}
      {commitDialog && (
        <Suspense fallback={null}>
          <CommitDialog
            defaultMessage={commitDialog.message}
            branch={commitDialog.branch}
            changes={commitDialog.changes}
            onCommit={(message, selectedPaths, push) =>
              void gitUi.handleCommitDialogCommit(message, selectedPaths, push)
            }
            onCancel={() => overlay.close("commit")}
          />
        </Suspense>
      )}
      {branchSwitcher && (
        <Suspense fallback={null}>
          <BranchSwitcher
            branches={branchSwitcher.branches}
            remoteBranches={branchSwitcher.remoteBranches}
            remoteInfo={branchSwitcher.remoteInfo}
            onSelect={(branch) => void gitUi.switchBranch(branch)}
            onSelectRemoteBranch={(remoteRef) => void gitUi.checkoutRemoteBranch(remoteRef)}
            onCreateBranch={() => overlay.open({ kind: "newBranch" })}
            onRenameBranch={(branch) => overlay.open({ kind: "renameBranch", state: { branch } })}
            onDeleteBranch={(branch) => overlay.open({ kind: "deleteBranch", state: { branch } })}
            onPushAndTrack={(remoteName) =>
              void gitUi.runGitAction(
                "push",
                () => handlePush(remoteName),
                t("git.push_success_upstream")
              )
            }
            onOpenRemote={(remoteName) => void gitUi.openRemote(remoteName)}
            onCopyRemoteUrl={(remoteName) => void gitUi.copyRemoteUrl(remoteName)}
            onClose={gitUi.closeBranchSwitcher}
          />
        </Suspense>
      )}
      {overlay.is("newBranch") && (
        <Suspense fallback={null}>
          <NewBranchDialog
            currentBranch={currentBranch}
            onConfirm={(branch) => void gitUi.createBranch(branch)}
            onCancel={() => overlay.close("newBranch")}
          />
        </Suspense>
      )}
      {renameBranchDialog && (
        <Suspense fallback={null}>
          <RenameBranchDialog
            branch={renameBranchDialog.branch}
            onConfirm={(branch) => void gitUi.renameBranch(renameBranchDialog.branch, branch)}
            onCancel={() => overlay.close("renameBranch")}
          />
        </Suspense>
      )}
      {deleteBranchDialog && (
        <Suspense fallback={null}>
          <DeleteBranchDialog
            branch={deleteBranchDialog.branch}
            onConfirm={() => void gitUi.deleteBranch(deleteBranchDialog.branch)}
            onCancel={() => overlay.close("deleteBranch")}
          />
        </Suspense>
      )}
      {overlay.active?.kind === "gitCredentials" && (
        <Suspense fallback={null}>
          <GitCredentialsDialog
            host={overlay.active.state.host}
            remoteName={overlay.active.state.remoteName}
            operation={overlay.active.state.operation}
            hasStoredCredentials={overlay.active.state.hasStoredCredentials}
            authErrored={overlay.active.state.authErrored}
            initialUsername={overlay.active.state.initialUsername}
            onSubmit={({ username, password, remember }) => {
              const active = overlay.active;
              if (active?.kind !== "gitCredentials") return;
              void gitUi.handleGitCredentialsSubmit({
                operation: active.state.operation,
                remoteName: active.state.remoteName,
                username,
                password,
                remember,
              });
            }}
            onForget={() => {
              const active = overlay.active;
              if (active?.kind !== "gitCredentials") return;
              void gitUi.handleForgetGitCredentials(active.state.host);
            }}
            onCancel={() => overlay.close("gitCredentials")}
          />
        </Suspense>
      )}
    </>
  );
}
