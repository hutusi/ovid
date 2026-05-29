import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { NewContentKind } from "../lib/amytisScaffold";
import type { CollectionCandidate } from "../lib/collection";
import type { Author } from "../lib/commands/generated/Author";
import type { FlatFile } from "../lib/fileSearch";
import type { GitSyncPopoverState } from "../lib/gitUi";
import { isPerfLoggingEnabled } from "../lib/perf";
import {
  getDuplicateNameSuggestion,
  getNewFromExistingNameSuggestion,
  getRenamePathDialogState,
} from "../lib/postPath";
import type { CollectionItem, FileNode, RecentFile, RecentWorkspace } from "../lib/types";
import type { AppPreferences } from "../lib/useAppPreferences";
import type { ContentPreferences } from "../lib/useContentPreferences";
import type { EditorPreferences } from "../lib/useEditorPreferences";
import type {
  BranchSwitcherState,
  CommitDialogState,
  DeleteBranchDialogState,
  RenameBranchDialogState,
} from "../lib/useGitUiController";
import type { OverlayStack } from "../lib/useOverlayStack";
import type { ThemePreference } from "../lib/useTheme";
import type { Toast } from "../lib/useToast";

// i18n key for the New dialog heading, per layer-aware content kind.
const NEW_FILE_TITLE_KEY: Record<NewContentKind, string> = {
  post: "menu.file_new_post",
  seriesPost: "menu.file_new_post",
  series: "menu.file_new_series",
  note: "menu.file_new_note",
  book: "menu.file_new_book",
  chapter: "sidebar.new_chapter",
  page: "menu.file_new_page",
  flow: "menu.file_new_flow",
  generic: "new_file_dialog.title_new_file",
};

const WorkspaceSwitcher = lazy(async () => ({
  default: (await import("./WorkspaceSwitcher")).WorkspaceSwitcher,
}));
const FileSwitcher = lazy(async () => ({
  default: (await import("./FileSwitcher")).FileSwitcher,
}));
const NewFileDialog = lazy(async () => ({
  default: (await import("./NewFileDialog")).NewFileDialog,
}));
const AddToCollectionDialog = lazy(async () => ({
  default: (await import("./AddToCollectionDialog")).AddToCollectionDialog,
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
const ShortcutsHelpDialog = lazy(async () => ({
  default: (await import("./ShortcutsHelpDialog")).ShortcutsHelpDialog,
}));
const PreferencesDialog = lazy(async () => ({
  default: (await import("./PreferencesDialog")).PreferencesDialog,
}));

export interface AppDialogsProps {
  // Overlay stack — owns modal, switcher, workspaceSwitcher, update,
  // wechatPublish visibility. Replaces the six prop-per-dialog booleans
  // + setters that lived here before commit 4.
  overlay: OverlayStack;

  // Toasts
  toasts: Toast[];

  // GitSyncPopover
  gitSyncPopoverOpen: boolean;
  gitSyncPopover: GitSyncPopoverState | null;
  setGitSyncPopoverOpen: (open: boolean) => void;
  handleGitSyncAction: () => Promise<void>;

  // WorkspaceSwitcher
  recentWorkspaces: RecentWorkspace[];
  workspaceRootPath: string | null;
  openWorkspaceAtPath: (path: string) => Promise<void>;
  handleOpenWorkspace: () => void;

  // UpdateDialog
  flushPendingSave: () => Promise<void>;

  // WechatPublishDialog
  selectedFile: FileNode | null;
  wechatTitle: string;
  wechatAuthor: string;
  authors: Author[];
  wechatDigest: string;
  wechatHasMath: boolean;
  wechatImageCount: number;
  wechatMarkdown: string;
  wechatBaseDir: string;
  assetRoot: string | undefined;
  wechatCoverImagePath: string | null;
  wechatMediaId: string | null;
  onWechatSuccess: (mediaId: string, updated: boolean) => void;

  // Modal dialogs (new-file, rename, duplicate, new-from-existing)
  handleNewFile: (dirPath: string, title: string, kind: NewContentKind) => void;
  handleDuplicate: (node: FileNode, name: string) => void;
  handleNewFromExisting: (node: FileNode, name: string) => void;
  handleRename: (node: FileNode, name: string) => void;
  collectionCandidatesFor: (
    existing: CollectionItem[],
    selfIndexPath: string
  ) => CollectionCandidate[];
  onAddCollectionItem: (indexPath: string, item: CollectionItem) => void;

  // FileSwitcher
  flatFiles: FlatFile[];
  recentFiles: RecentFile[];
  openFileByPath: (path: string) => void;

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

  // PreferencesDialog
  themePreference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
  editorPrefs: EditorPreferences;
  updateEditorPrefs: (updates: Partial<EditorPreferences>) => void;
  wordCountGoal: number | null;
  setWordCountGoal: (n: number | null) => void;
  contentPrefs: ContentPreferences;
  updateContentPrefs: (updates: Partial<ContentPreferences>) => void;
  appPrefs: AppPreferences;
  updateAppPrefs: (updates: Partial<AppPreferences>) => void;
}

export function AppDialogs({
  overlay,
  toasts,
  gitSyncPopoverOpen,
  gitSyncPopover,
  setGitSyncPopoverOpen,
  handleGitSyncAction,
  recentWorkspaces,
  workspaceRootPath,
  openWorkspaceAtPath,
  handleOpenWorkspace,
  flushPendingSave,
  selectedFile,
  wechatTitle,
  wechatAuthor,
  authors,
  wechatDigest,
  wechatHasMath,
  wechatImageCount,
  wechatMarkdown,
  wechatBaseDir,
  assetRoot,
  wechatCoverImagePath,
  wechatMediaId,
  onWechatSuccess,
  handleNewFile,
  handleDuplicate,
  handleNewFromExisting,
  handleRename,
  collectionCandidatesFor,
  onAddCollectionItem,
  flatFiles,
  recentFiles,
  openFileByPath,
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
  themePreference,
  setThemePreference,
  editorPrefs,
  updateEditorPrefs,
  wordCountGoal,
  setWordCountGoal,
  contentPrefs,
  updateContentPrefs,
  appPrefs,
  updateAppPrefs,
}: AppDialogsProps) {
  const { t } = useTranslation();
  // Pull the modal state out of the overlay union once per render so the
  // four modal? === "..." checks below stay readable.
  const modal = overlay.active?.kind === "modal" ? overlay.active.state : null;
  const closeModal = () => overlay.close("modal");

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
      {overlay.is("workspaceSwitcher") && (
        <Suspense fallback={null}>
          <WorkspaceSwitcher
            recentWorkspaces={recentWorkspaces}
            currentRootPath={workspaceRootPath}
            onSelect={(rootPath) => void openWorkspaceAtPath(rootPath)}
            onOpenOther={handleOpenWorkspace}
            onClose={() => overlay.close("workspaceSwitcher")}
          />
        </Suspense>
      )}
      {overlay.is("update") && (
        <Suspense fallback={null}>
          <UpdateDialog
            onBeforeRestart={flushPendingSave}
            onClose={() => overlay.close("update")}
          />
        </Suspense>
      )}
      {overlay.is("shortcutsHelp") && (
        <Suspense fallback={null}>
          <ShortcutsHelpDialog onClose={() => overlay.close("shortcutsHelp")} />
        </Suspense>
      )}
      {overlay.is("preferences") && (
        <Suspense fallback={null}>
          <PreferencesDialog
            themePreference={themePreference}
            onSetThemePreference={setThemePreference}
            editorPrefs={editorPrefs}
            onUpdateEditorPrefs={updateEditorPrefs}
            wordCountGoal={wordCountGoal}
            onSetWordCountGoal={setWordCountGoal}
            contentPrefs={contentPrefs}
            onUpdateContentPrefs={updateContentPrefs}
            appPrefs={appPrefs}
            onUpdateAppPrefs={updateAppPrefs}
            onClose={() => overlay.close("preferences")}
          />
        </Suspense>
      )}
      {overlay.is("wechatPublish") && selectedFile && (
        <Suspense fallback={null}>
          <WechatPublishDialog
            title={wechatTitle}
            author={wechatAuthor}
            authors={authors}
            excerpt={wechatDigest}
            hasMath={wechatHasMath}
            imageCount={wechatImageCount}
            markdown={wechatMarkdown}
            baseDir={wechatBaseDir}
            filePath={selectedFile.path}
            assetRoot={assetRoot}
            coverImagePath={wechatCoverImagePath}
            existingMediaId={wechatMediaId}
            onClose={() => overlay.close("wechatPublish")}
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
              closeModal();
            }}
            onCancel={closeModal}
          />
        </Suspense>
      )}
      {overlay.is("switcher") && (
        <Suspense fallback={null}>
          <FileSwitcher
            files={flatFiles}
            recentFiles={recentFiles}
            onSelect={(node) => {
              openFileByPath(node.path);
              overlay.close("switcher");
            }}
            onClose={() => overlay.close("switcher")}
          />
        </Suspense>
      )}
      {modal?.type === "new-file" && (
        <Suspense fallback={null}>
          <NewFileDialog
            title={t(NEW_FILE_TITLE_KEY[modal.kind])}
            onConfirm={(name) => {
              void handleNewFile(modal.dirPath, name, modal.kind);
              closeModal();
            }}
            onCancel={closeModal}
          />
        </Suspense>
      )}
      {modal?.type === "duplicate-file" && (
        <Suspense fallback={null}>
          <NewFileDialog
            initialFilename={getDuplicateNameSuggestion(modal.node)}
            title={t("new_file_dialog.title_make_copy")}
            confirmLabel={t("new_file_dialog.copy")}
            onConfirm={(name) => {
              void handleDuplicate(modal.node, name);
              closeModal();
            }}
            onCancel={closeModal}
          />
        </Suspense>
      )}
      {modal?.type === "new-from-existing" && (
        <Suspense fallback={null}>
          <NewFileDialog
            initialFilename={getNewFromExistingNameSuggestion(modal.node)}
            title={t("new_file_dialog.title_new_from_existing")}
            confirmLabel={t("new_file_dialog.create")}
            onConfirm={(name) => {
              void handleNewFromExisting(modal.node, name);
              closeModal();
            }}
            onCancel={closeModal}
          />
        </Suspense>
      )}
      {modal?.type === "add-to-collection" && (
        <Suspense fallback={null}>
          <AddToCollectionDialog
            candidates={collectionCandidatesFor(modal.existing, modal.indexPath)}
            onConfirm={(item) => {
              onAddCollectionItem(modal.indexPath, item);
              closeModal();
            }}
            onCancel={closeModal}
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
