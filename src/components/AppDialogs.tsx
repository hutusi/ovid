import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { FlatFile } from "../lib/fileSearch";
import type { GitSyncPopoverState } from "../lib/gitUi";
import { isPerfLoggingEnabled } from "../lib/perf";
import {
  getDuplicateNameSuggestion,
  getNewFromExistingNameSuggestion,
  getRenamePathDialogState,
} from "../lib/postPath";
import type { ContentType, FileNode, ModalState, RecentFile, RecentWorkspace } from "../lib/types";
import type {
  BranchSwitcherState,
  CommitDialogState,
  DeleteBranchDialogState,
  RenameBranchDialogState,
} from "../lib/useGitUiController";
import type { Toast } from "../lib/useToast";

const WorkspaceSwitcher = lazy(async () => ({
  default: (await import("./WorkspaceSwitcher")).WorkspaceSwitcher,
}));
const FileSwitcher = lazy(async () => ({
  default: (await import("./FileSwitcher")).FileSwitcher,
}));
const NewFileDialog = lazy(async () => ({
  default: (await import("./NewFileDialog")).NewFileDialog,
}));
const CommitDialog = lazy(async () => ({
  default: (await import("./CommitDialog")).CommitDialog,
}));
const BranchSwitcher = lazy(async () => ({
  default: (await import("./BranchSwitcher")).BranchSwitcher,
}));
const NewBranchDialog = lazy(async () => ({
  default: (await import("./NewBranchDialog")).NewBranchDialog,
}));
const RenameBranchDialog = lazy(async () => ({
  default: (await import("./RenameBranchDialog")).RenameBranchDialog,
}));
const DeleteBranchDialog = lazy(async () => ({
  default: (await import("./DeleteBranchDialog")).DeleteBranchDialog,
}));
const GitSyncPopover = lazy(async () => ({
  default: (await import("./GitSyncPopover")).GitSyncPopover,
}));
const PerfPanel = lazy(async () => ({
  default: (await import("./PerfPanel")).PerfPanel,
}));
const UpdateDialog = lazy(async () => ({
  default: (await import("./UpdateDialog")).UpdateDialog,
}));
const RenamePathDialog = lazy(async () => ({
  default: (await import("./RenamePathDialog")).RenamePathDialog,
}));
const WechatPublishDialog = lazy(async () => ({
  default: (await import("./WechatPublishDialog")).WechatPublishDialog,
}));

export interface AppDialogsProps {
  // Toasts
  toasts: Toast[];

  // GitSyncPopover
  gitSyncPopoverOpen: boolean;
  gitSyncPopover: GitSyncPopoverState | null;
  setGitSyncPopoverOpen: (open: boolean) => void;
  handleGitSyncAction: () => Promise<void>;

  // WorkspaceSwitcher
  workspaceSwitcherOpen: boolean;
  recentWorkspaces: RecentWorkspace[];
  workspaceRootPath: string | null;
  openWorkspaceAtPath: (path: string) => Promise<void>;
  handleOpenWorkspace: () => void;
  setWorkspaceSwitcherOpen: (open: boolean) => void;

  // UpdateDialog
  updateDialogOpen: boolean;
  flushPendingSave: () => Promise<void>;
  setUpdateDialogOpen: (open: boolean) => void;

  // WechatPublishDialog
  wechatPublishDialogOpen: boolean;
  selectedFile: FileNode | null;
  wechatTitle: string;
  wechatAuthor: string;
  wechatDigest: string;
  wechatHasMath: boolean;
  wechatImageCount: number;
  wechatMarkdown: string;
  wechatBaseDir: string;
  assetRoot: string | undefined;
  wechatCoverImagePath: string | null;
  wechatMediaId: string | null;
  setWechatPublishDialogOpen: (open: boolean) => void;
  onWechatSuccess: (mediaId: string, updated: boolean) => void;

  // Modal dialogs (new-file, rename, duplicate, new-from-existing)
  modal: ModalState;
  setModal: (state: ModalState) => void;
  contentTypes: ContentType[];
  handleNewFile: (dirPath: string, name: string, contentType?: string) => void;
  handleDuplicate: (node: FileNode, name: string) => void;
  handleNewFromExisting: (node: FileNode, name: string) => void;
  handleRename: (node: FileNode, name: string) => void;

  // FileSwitcher
  switcherOpen: boolean;
  flatFiles: FlatFile[];
  recentFiles: RecentFile[];
  openFileByPath: (path: string) => void;
  setSwitcherOpen: (open: boolean) => void;

  // CommitDialog
  commitDialog: CommitDialogState;
  setCommitDialog: (state: null) => void;
  handleCommitDialogCommit: (
    message: string,
    selectedPaths: string[],
    push: boolean
  ) => Promise<void>;

  // BranchSwitcher
  branchSwitcher: BranchSwitcherState;
  currentBranch: string;
  switchBranch: (branch: string) => Promise<void>;
  checkoutRemoteBranch: (remoteRef: string) => Promise<void>;
  closeBranchSwitcher: () => void;
  setNewBranchDialogOpen: (open: boolean) => void;
  setRenameBranchDialog: (state: RenameBranchDialogState) => void;
  setDeleteBranchDialog: (state: DeleteBranchDialogState) => void;
  runGitAction: (type: "push" | "pull" | "fetch", fn: () => Promise<void>, msg: string) => void;
  handlePush: (remoteName?: string) => Promise<void>;
  openRemote: (remoteName?: string) => void;
  copyRemoteUrl: (remoteName?: string) => void;

  // NewBranchDialog
  newBranchDialogOpen: boolean;
  createBranch: (branch: string) => Promise<void>;

  // RenameBranchDialog
  renameBranchDialog: RenameBranchDialogState;
  renameBranch: (oldBranch: string, newBranch: string) => Promise<void>;

  // DeleteBranchDialog
  deleteBranchDialog: DeleteBranchDialogState;
  deleteBranch: (branch: string) => Promise<void>;
}

export function AppDialogs({
  toasts,
  gitSyncPopoverOpen,
  gitSyncPopover,
  setGitSyncPopoverOpen,
  handleGitSyncAction,
  workspaceSwitcherOpen,
  recentWorkspaces,
  workspaceRootPath,
  openWorkspaceAtPath,
  handleOpenWorkspace,
  setWorkspaceSwitcherOpen,
  updateDialogOpen,
  flushPendingSave,
  setUpdateDialogOpen,
  wechatPublishDialogOpen,
  selectedFile,
  wechatTitle,
  wechatAuthor,
  wechatDigest,
  wechatHasMath,
  wechatImageCount,
  wechatMarkdown,
  wechatBaseDir,
  assetRoot,
  wechatCoverImagePath,
  wechatMediaId,
  setWechatPublishDialogOpen,
  onWechatSuccess,
  modal,
  setModal,
  contentTypes,
  handleNewFile,
  handleDuplicate,
  handleNewFromExisting,
  handleRename,
  switcherOpen,
  flatFiles,
  recentFiles,
  openFileByPath,
  setSwitcherOpen,
  commitDialog,
  setCommitDialog,
  handleCommitDialogCommit,
  branchSwitcher,
  currentBranch,
  switchBranch,
  checkoutRemoteBranch,
  closeBranchSwitcher,
  setNewBranchDialogOpen,
  setRenameBranchDialog,
  setDeleteBranchDialog,
  runGitAction,
  handlePush,
  openRemote,
  copyRemoteUrl,
  newBranchDialogOpen,
  createBranch,
  renameBranchDialog,
  renameBranch,
  deleteBranchDialog,
  deleteBranch,
}: AppDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      {gitSyncPopoverOpen && gitSyncPopover && (
        <Suspense fallback={null}>
          <GitSyncPopover
            state={gitSyncPopover}
            onClose={() => setGitSyncPopoverOpen(false)}
            onAction={gitSyncPopover.actionLabel ? () => void handleGitSyncAction() : undefined}
          />
        </Suspense>
      )}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              {toast.message}
            </div>
          ))}
        </div>
      )}
      {workspaceSwitcherOpen && (
        <Suspense fallback={null}>
          <WorkspaceSwitcher
            recentWorkspaces={recentWorkspaces}
            currentRootPath={workspaceRootPath}
            onSelect={(rootPath) => void openWorkspaceAtPath(rootPath)}
            onOpenOther={handleOpenWorkspace}
            onClose={() => setWorkspaceSwitcherOpen(false)}
          />
        </Suspense>
      )}
      {updateDialogOpen && (
        <Suspense fallback={null}>
          <UpdateDialog
            onBeforeRestart={flushPendingSave}
            onClose={() => setUpdateDialogOpen(false)}
          />
        </Suspense>
      )}
      {wechatPublishDialogOpen && selectedFile && (
        <Suspense fallback={null}>
          <WechatPublishDialog
            title={wechatTitle}
            author={wechatAuthor}
            excerpt={wechatDigest}
            hasMath={wechatHasMath}
            imageCount={wechatImageCount}
            markdown={wechatMarkdown}
            baseDir={wechatBaseDir}
            assetRoot={assetRoot}
            coverImagePath={wechatCoverImagePath}
            existingMediaId={wechatMediaId}
            onClose={() => setWechatPublishDialogOpen(false)}
            onSuccess={onWechatSuccess}
          />
        </Suspense>
      )}
      {modal?.type === "rename-path" && (
        <Suspense fallback={null}>
          <RenamePathDialog
            {...getRenamePathDialogState(modal.node)}
            onConfirm={(name) => {
              void handleRename(modal.node, name);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {switcherOpen && (
        <Suspense fallback={null}>
          <FileSwitcher
            files={flatFiles}
            recentFiles={recentFiles}
            onSelect={(node) => {
              openFileByPath(node.path);
              setSwitcherOpen(false);
            }}
            onClose={() => setSwitcherOpen(false)}
          />
        </Suspense>
      )}
      {modal?.type === "new-file" && (
        <Suspense fallback={null}>
          <NewFileDialog
            contentTypes={contentTypes}
            preselectedType={modal.contentType}
            onConfirm={(name, contentType) => {
              void handleNewFile(modal.dirPath, name, contentType);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal?.type === "duplicate-file" && (
        <Suspense fallback={null}>
          <NewFileDialog
            contentTypes={[]}
            initialFilename={getDuplicateNameSuggestion(modal.node)}
            title={t("new_file_dialog.title_make_copy")}
            confirmLabel={t("new_file_dialog.copy")}
            showTypeSelector={false}
            onConfirm={(name) => {
              void handleDuplicate(modal.node, name);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal?.type === "new-from-existing" && (
        <Suspense fallback={null}>
          <NewFileDialog
            contentTypes={[]}
            initialFilename={getNewFromExistingNameSuggestion(modal.node)}
            title={t("new_file_dialog.title_new_from_existing")}
            confirmLabel={t("new_file_dialog.create")}
            showTypeSelector={false}
            onConfirm={(name) => {
              void handleNewFromExisting(modal.node, name);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
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
              void handleCommitDialogCommit(message, selectedPaths, push)
            }
            onCancel={() => setCommitDialog(null)}
          />
        </Suspense>
      )}
      {branchSwitcher && (
        <Suspense fallback={null}>
          <BranchSwitcher
            branches={branchSwitcher.branches}
            remoteBranches={branchSwitcher.remoteBranches}
            remoteInfo={branchSwitcher.remoteInfo}
            onSelect={(branch) => void switchBranch(branch)}
            onSelectRemoteBranch={(remoteRef) => void checkoutRemoteBranch(remoteRef)}
            onCreateBranch={() => {
              closeBranchSwitcher();
              setNewBranchDialogOpen(true);
            }}
            onRenameBranch={(branch) => setRenameBranchDialog({ branch })}
            onDeleteBranch={(branch) => setDeleteBranchDialog({ branch })}
            onPushAndTrack={(remoteName) =>
              void runGitAction(
                "push",
                () => handlePush(remoteName),
                t("git.push_success_upstream")
              )
            }
            onOpenRemote={(remoteName) => void openRemote(remoteName)}
            onCopyRemoteUrl={(remoteName) => void copyRemoteUrl(remoteName)}
            onClose={closeBranchSwitcher}
          />
        </Suspense>
      )}
      {newBranchDialogOpen && (
        <Suspense fallback={null}>
          <NewBranchDialog
            currentBranch={currentBranch}
            onConfirm={(branch) => void createBranch(branch)}
            onCancel={() => setNewBranchDialogOpen(false)}
          />
        </Suspense>
      )}
      {renameBranchDialog && (
        <Suspense fallback={null}>
          <RenameBranchDialog
            branch={renameBranchDialog.branch}
            onConfirm={(branch) => void renameBranch(renameBranchDialog.branch, branch)}
            onCancel={() => setRenameBranchDialog(null)}
          />
        </Suspense>
      )}
      {deleteBranchDialog && (
        <Suspense fallback={null}>
          <DeleteBranchDialog
            branch={deleteBranchDialog.branch}
            onConfirm={() => void deleteBranch(deleteBranchDialog.branch)}
            onCancel={() => setDeleteBranchDialog(null)}
          />
        </Suspense>
      )}
      {isPerfLoggingEnabled() && (
        <Suspense fallback={null}>
          <PerfPanel />
        </Suspense>
      )}
    </>
  );
}
