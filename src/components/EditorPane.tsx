import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { FlatFile } from "../lib/fileSearch";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import { parseCoverImage, resolveImageSrc } from "../lib/imageUtils";
import { loadKatexRuntime } from "../lib/loadKatexRuntime";
import { isMac } from "../lib/platform";
import type { FileNode, RecentFile, SaveStatus, SearchJumpTarget } from "../lib/types";
import { useNonModalDialogFocus } from "../lib/useNonModalDialogFocus";
import type { NoteResolverIndex, ResolvedWikiTarget } from "../lib/wikiLink";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { FileViewer, isReadOnlyContent } from "./FileViewer";
import { PropertiesPanel } from "./PropertiesPanel";
import { TabBar } from "./TabBar";
import { TextCover } from "./TextCover";

export type EditorViewState = { selection: number; scrollTop: number };

const loadEditor = async () => {
  await loadKatexRuntime();
  return import("./Editor");
};
const Editor = lazy(async () => ({
  default: (await loadEditor()).Editor,
}));

export interface EditorPaneProps {
  // Workspace context
  workspaceRoot: string | null;

  // Tab bar
  tabs: string[];
  tree: FileNode[];
  saveStatus: SaveStatus;
  selectedFile: FileNode | null;
  onSelectFromTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;

  // Sidebar / properties expand state (for editor-top-bar expand buttons)
  sidebarVisible: boolean;
  onExpandSidebar: () => void;

  // Cover image banner
  coverImageVisible: boolean;
  coverImagePath: string | undefined;
  assetRoot: string | undefined;
  cdnBase: string | undefined;

  // File viewer
  fileViewerNode: FileNode | null;
  onCloseFileViewer: () => void;

  // Editor
  fileContent: string;
  typewriterMode: boolean;
  spellCheck: boolean;
  parsedFrontmatter: ParsedFrontmatter;
  onFieldChange: (key: string, value: FrontmatterValue) => void | Promise<void>;
  onWordCount: (count: number, filePath?: string) => void;
  onDirty: () => void;
  onChange: (markdown: string) => void;
  onError: (message: string) => void;
  currentEditorViewState: EditorViewState | undefined;
  onEditorViewStateChange: (state: EditorViewState) => void;
  registerPendingFlush: (flush: (() => void) | null) => void;

  // Wiki links
  resolveWikiTarget: (target: string) => ResolvedWikiTarget;
  onOpenWikiTarget: (target: string, displayText: string | null) => void;

  // Backlinks panel — same flatFiles/resolverIndex the editor uses, plus the
  // workspace-relative path of the current file (null when nothing is open).
  flatFiles: FlatFile[];
  noteResolverIndex: NoteResolverIndex;
  currentRelativePath: string | null;
  onOpenSource: (sourcePath: string) => void;

  // Search-match navigation — one-shot jump request from the search panel.
  searchJump: SearchJumpTarget | null;
  /** Lines the current file's frontmatter occupies (maps full-file search
   *  line numbers to body lines). */
  frontmatterLineOffset: number;
  onSearchJumpHandled: () => void;

  // Empty state
  recentFiles: RecentFile[];
  onOpenWorkspace: () => void;
  onOpenRecent: (path: string) => void;

  // Properties panel
  propertiesOpen: boolean;
  propertiesDrawer: boolean;
  onToggleProperties: () => void;
  onDismissPropertiesDrawer: () => void;
  onToggleCoverImage: () => void;
}

export function EditorPane({
  workspaceRoot,
  tabs,
  tree,
  saveStatus,
  selectedFile,
  onSelectFromTab,
  onCloseTab,
  onReorderTabs,
  sidebarVisible,
  onExpandSidebar,
  coverImageVisible,
  coverImagePath,
  assetRoot,
  cdnBase,
  fileViewerNode,
  onCloseFileViewer,
  fileContent,
  typewriterMode,
  spellCheck,
  parsedFrontmatter,
  onFieldChange,
  onWordCount,
  onDirty,
  onChange,
  onError,
  currentEditorViewState,
  onEditorViewStateChange,
  registerPendingFlush,
  resolveWikiTarget,
  onOpenWikiTarget,
  flatFiles,
  noteResolverIndex,
  currentRelativePath,
  onOpenSource,
  searchJump,
  frontmatterLineOffset,
  onSearchJumpHandled,
  recentFiles,
  onOpenWorkspace,
  onOpenRecent,
  propertiesOpen,
  propertiesDrawer,
  onToggleProperties,
  onDismissPropertiesDrawer,
  onToggleCoverImage,
}: EditorPaneProps) {
  const { t } = useTranslation();
  // Properties-panel focus management. The compact drawer (a non-modal dialog)
  // grabs focus when it opens so it's announced; the inline panel does not. In
  // both modes, when the panel hides (drawer dismissed, or inline collapsed, or
  // the breakpoint crossed) focus is returned to the top-bar expand button if it
  // was stranded — otherwise it would fall to <body> as the focused collapse
  // button becomes non-focusable.
  const { dialogRef: propertiesDrawerRef, triggerRef: expandPropertiesRef } =
    useNonModalDialogFocus<HTMLDivElement, HTMLButtonElement>(propertiesOpen, propertiesDrawer);

  const editorTitle = parsedFrontmatter.title != null ? String(parsedFrontmatter.title) : "";

  return (
    <>
      <div className="editor-column">
        <div className="editor-top-bar" data-tauri-drag-region="deep">
          {!sidebarVisible && (
            <>
              {isMac && <div className="editor-top-bar-mac-gutter" />}
              <button
                type="button"
                className="editor-expand-btn"
                onClick={onExpandSidebar}
                title={t("sidebar.expand")}
                aria-label={t("sidebar.expand")}
              >
                <PanelLeftOpen size={13} aria-hidden="true" />
              </button>
            </>
          )}
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              tree={tree}
              activePath={selectedFile?.path ?? null}
              saveStatus={saveStatus}
              onSelect={onSelectFromTab}
              onClose={onCloseTab}
              onReorder={onReorderTabs}
            />
          )}
          {selectedFile && !isReadOnlyContent(selectedFile) && !propertiesOpen && (
            <button
              ref={expandPropertiesRef}
              type="button"
              className="editor-expand-btn editor-expand-btn-trailing"
              onClick={onToggleProperties}
              title={t("properties.expand")}
              aria-label={t("properties.expand")}
            >
              <PanelRightOpen size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        {selectedFile &&
          coverImageVisible &&
          coverImagePath &&
          (() => {
            const cover = parseCoverImage(coverImagePath);
            if (cover.kind === "empty") return null;
            if (cover.kind === "text") {
              const coverSlug = selectedFile.name.replace(/\.mdx?$/, "");
              return (
                <div className="cover-image-banner cover-image-banner-text">
                  <TextCover text={cover.text} fallbackText={editorTitle} slug={coverSlug} />
                </div>
              );
            }
            return (
              <div className="cover-image-banner">
                <img
                  src={resolveImageSrc(cover.src, selectedFile.path, assetRoot, cdnBase)}
                  alt={editorTitle}
                />
              </div>
            );
          })()}
        {fileViewerNode ? (
          <FileViewer node={fileViewerNode} onClose={onCloseFileViewer} />
        ) : selectedFile && isReadOnlyContent(selectedFile) ? (
          <FileViewer node={selectedFile} onClose={() => onCloseTab(selectedFile.path)} />
        ) : selectedFile ? (
          <ErrorBoundary key={selectedFile.path}>
            <Suspense fallback={<div className="editor-loading">{t("editor.loading")}</div>}>
              <Editor
                key={selectedFile.path}
                content={fileContent}
                filePath={selectedFile.path}
                assetRoot={assetRoot}
                cdnBase={cdnBase}
                resolveWikiTarget={resolveWikiTarget}
                onOpenWikiTarget={onOpenWikiTarget}
                backlinks={{
                  currentRelativePath,
                  flatFiles,
                  resolverIndex: noteResolverIndex,
                  onOpenSource,
                }}
                typewriterMode={typewriterMode}
                spellCheck={spellCheck}
                showH1Warning={editorTitle.trim() !== ""}
                title={editorTitle}
                onTitleChange={(value) => void onFieldChange("title", value)}
                onWordCount={onWordCount}
                onDirty={onDirty}
                onChange={onChange}
                onError={onError}
                initialSelection={currentEditorViewState?.selection}
                initialScrollTop={currentEditorViewState?.scrollTop}
                onViewStateChange={onEditorViewStateChange}
                registerPendingFlush={registerPendingFlush}
                searchJump={searchJump}
                frontmatterLineOffset={frontmatterLineOffset}
                onSearchJumpHandled={onSearchJumpHandled}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <EmptyState
            workspaceOpen={workspaceRoot !== null}
            recentFiles={recentFiles}
            onOpenWorkspace={onOpenWorkspace}
            onOpenRecent={onOpenRecent}
          />
        )}
      </div>
      {propertiesDrawer && (
        <button
          type="button"
          className="panel-drawer-backdrop"
          onClick={onDismissPropertiesDrawer}
          aria-label={t("properties.collapse")}
          data-tauri-drag-region="false"
        />
      )}
      {selectedFile && !isReadOnlyContent(selectedFile) && (
        <PropertiesPanel
          frontmatter={parsedFrontmatter}
          visible={propertiesOpen}
          drawer={propertiesDrawer}
          rootRef={propertiesDrawerRef}
          slug={selectedFile.name.replace(/\.mdx?$/, "")}
          contentType={selectedFile.contentType}
          coverImageVisible={coverImageVisible}
          filePath={selectedFile.path}
          assetRoot={assetRoot}
          cdnBase={cdnBase}
          onFieldChange={onFieldChange}
          onToggleCoverImage={onToggleCoverImage}
          onToggle={onToggleProperties}
          onError={onError}
        />
      )}
    </>
  );
}
