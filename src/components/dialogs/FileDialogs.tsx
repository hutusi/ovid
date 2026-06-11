import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { NewContentKind } from "../../lib/amytisScaffold";
import type { CollectionCandidate } from "../../lib/collection";
import type { FlatFile } from "../../lib/fileSearch";
import {
  getDuplicateNameSuggestion,
  getNewFromExistingNameSuggestion,
  getRenamePathDialogState,
} from "../../lib/postPath";
import type { CollectionItem, FileNode, RecentFile } from "../../lib/types";
import type { OverlayStack } from "../../lib/useOverlayStack";

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

const FileSwitcher = lazy(async () => ({
  default: (await import("../FileSwitcher")).FileSwitcher,
}));
const NewFileDialog = lazy(async () => ({
  default: (await import("../NewFileDialog")).NewFileDialog,
}));
const AddToCollectionDialog = lazy(async () => ({
  default: (await import("../AddToCollectionDialog")).AddToCollectionDialog,
}));
const RenamePathDialog = lazy(async () => ({
  default: (await import("../RenamePathDialog")).RenamePathDialog,
}));

export interface FileDialogsProps {
  overlay: OverlayStack;
  // modal-kind dialogs (new-file, rename, duplicate, new-from-existing,
  // add-to-collection)
  handleNewFile: (dirPath: string, title: string, kind: NewContentKind) => void;
  handleDuplicate: (node: FileNode, name: string) => void;
  handleNewFromExisting: (node: FileNode, name: string) => void;
  handleRename: (node: FileNode, name: string) => void;
  collectionCandidatesFor: (
    existing: CollectionItem[],
    selfIndexPath: string
  ) => CollectionCandidate[];
  onAddCollectionItem: (indexPath: string, item: CollectionItem) => void;
  // FileSwitcher (Cmd+P)
  flatFiles: FlatFile[];
  recentFiles: RecentFile[];
  openFileByPath: (path: string) => void;
}

/** File-lifecycle overlays: the Cmd+P switcher plus every `modal`-kind
 * dialog (new file, rename, duplicate, new-from-existing,
 * add-to-collection). */
export function FileDialogs({
  overlay,
  handleNewFile,
  handleDuplicate,
  handleNewFromExisting,
  handleRename,
  collectionCandidatesFor,
  onAddCollectionItem,
  flatFiles,
  recentFiles,
  openFileByPath,
}: FileDialogsProps) {
  const { t } = useTranslation();
  // Pull the modal state out of the overlay union once per render so the
  // modal? === "..." checks below stay readable.
  const modal = overlay.active?.kind === "modal" ? overlay.active.state : null;
  const closeModal = () => overlay.close("modal");

  return (
    <>
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
    </>
  );
}
