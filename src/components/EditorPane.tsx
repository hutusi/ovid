import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { FlatFile } from "../lib/fileSearch";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import { parseCoverImage, resolveImageSrc } from "../lib/imageUtils";
import { loadKatexRuntime } from "../lib/loadKatexRuntime";
import { isMac } from "../lib/platform";
import type {
  FileNode,
  RecentFile,
  SaveStatus,
  SearchJumpTarget,
  WordCountKind,
} from "../lib/types";
import type { EditorDocument } from "../lib/useFileEditor";
import { useNonModalDialogFocus } from "../lib/useNonModalDialogFocus";
import type { NoteResolverIndex, ResolvedWikiTarget } from "../lib/wikiLink";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { FileViewer, isReadOnlyContent } from "./FileViewer";
import { PropertiesPanel } from "./PropertiesPanel";
import { TabBar } from "./TabBar";
import { TextCover } from "./TextCover";

export type EditorViewState = { selection: number; scrollTop: number };

// KaTeX (a script-injected asset) and the Editor chunk load in parallel —
// evaluating the Editor module before KaTeX exists is safe because the math
// extension resolves the KaTeX global lazily (src/lib/katexGlobal.ts). The
// Editor only renders once both are in. Memoized so a preload and the lazy
// component share one load.
let editorLoad: Promise<typeof import("./Editor")> | null = null;
function loadEditor(): Promise<typeof import("./Editor")> {
  if (!editorLoad) {
    editorLoad = Promise.all([loadKatexRuntime(), import("./Editor")]).then(([, mod]) => mod);
    // A failed load (e.g. KaTeX script error) may be retried on next use.
    editorLoad.catch(() => {
      editorLoad = null;
    });
  }
  return editorLoad;
}

/** Start loading the editor ahead of the first file open — called while a
 *  restored session's workspace is opening, so the file it reopens doesn't
 *  wait on the editor's chunks afterwards. */
export function preloadEditor(): void {
  void loadEditor().catch(() => {});
}

const Editor = lazy(async () => ({
  default: (await loadEditor()).Editor,
}));

export interface EditorPaneProps {
  // Workspace context
  workspaceRoot: string | null;
  /** A workspace is opening (see Sidebar's `loading`). */
  workspaceLoading: boolean;

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
  editorDocument: EditorDocument;
  /** Error-boundary retry: remount the editor with the current body. */
  onEditorRetry: () => void;
  typewriterMode: boolean;
  spellCheck: boolean;
  parsedFrontmatter: ParsedFrontmatter;
  /** YAML parse error of the open file's frontmatter (properties read-only). */
  frontmatterError: string | null;
  /** Set a frontmatter field of the file at `path`. EditorPane binds the open
   *  file's path at render time, so an edit that completes after a file switch
   *  (a cover upload) still targets the file it was made on. */
  onFieldChange: (path: string, key: string, value: FrontmatterValue) => void | Promise<void>;
  onWordCount: (count: number, filePath?: string, kind?: WordCountKind) => void;
  onDirty: () => void;
  /** Serialized markdown from the editor showing session `docId`. */
  onChange: (markdown: string, docId: number) => void;
  onError: (message: string) => void;
  currentEditorViewState: EditorViewState | undefined;
  onEditorViewStateChange: (state: EditorViewState) => void;
  registerPendingFlush: (flush: () => void) => () => void;

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
  /** One-shot: focus this just-created file's body once it is on screen. */
  focusBodyPath: string | null;
  onFocusBodyHandled: () => void;

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
  workspaceLoading,
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
  editorDocument,
  onEditorRetry,
  typewriterMode,
  spellCheck,
  parsedFrontmatter,
  frontmatterError,
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
  focusBodyPath,
  onFocusBodyHandled,
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

  // Stable props for the memoized Editor — it re-renders only when what it
  // shows changes, not on every App render.
  const selectedPath = selectedFile?.path ?? null;
  const docId = editorDocument.docId;
  const onFieldChangeRef = useRef(onFieldChange);
  onFieldChangeRef.current = onFieldChange;
  const handleEditorChange = useCallback(
    (markdown: string) => onChange(markdown, docId),
    [onChange, docId]
  );
  // Bound to the path at render time: an edit always names the file it was
  // made on (see useFileEditor.handleFieldChange).
  const handleTitleChange = useCallback(
    (value: string) => {
      if (selectedPath) void onFieldChangeRef.current(selectedPath, "title", value);
    },
    [selectedPath]
  );
  const backlinks = useMemo(
    () => ({ currentRelativePath, flatFiles, resolverIndex: noteResolverIndex, onOpenSource }),
    [currentRelativePath, flatFiles, noteResolverIndex, onOpenSource]
  );

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
          // Keyed by the open-file session, not the path: a rename keeps the
          // mounted editor (and its live content) instead of remounting it
          // with the body from when the file was opened.
          <ErrorBoundary
            key={`${editorDocument.docId}:${editorDocument.mountGen}`}
            onReset={onEditorRetry}
          >
            <Suspense fallback={<div className="editor-loading">{t("editor.loading")}</div>}>
              <Editor
                content={editorDocument.body}
                loadId={editorDocument.loadId}
                filePath={selectedFile.path}
                assetRoot={assetRoot}
                cdnBase={cdnBase}
                resolveWikiTarget={resolveWikiTarget}
                onOpenWikiTarget={onOpenWikiTarget}
                backlinks={backlinks}
                typewriterMode={typewriterMode}
                spellCheck={spellCheck}
                showH1Warning={editorTitle.trim() !== ""}
                title={editorTitle}
                // Unparseable frontmatter has no knowable title, and edits to
                // it are refused — hide the title field rather than offer one.
                onTitleChange={frontmatterError === null ? handleTitleChange : undefined}
                onWordCount={onWordCount}
                onDirty={onDirty}
                onChange={handleEditorChange}
                onError={onError}
                initialSelection={currentEditorViewState?.selection}
                initialScrollTop={currentEditorViewState?.scrollTop}
                onViewStateChange={onEditorViewStateChange}
                registerPendingFlush={registerPendingFlush}
                searchJump={searchJump}
                frontmatterLineOffset={frontmatterLineOffset}
                onSearchJumpHandled={onSearchJumpHandled}
                focusBodyPath={focusBodyPath}
                onFocusBodyHandled={onFocusBodyHandled}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <EmptyState
            workspaceOpen={workspaceRoot !== null}
            loading={workspaceLoading}
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
        <ErrorBoundary
          variant="panel"
          title={t("errors.properties_failed")}
          resetKey={selectedFile.path}
        >
          <PropertiesPanel
            frontmatter={parsedFrontmatter}
            frontmatterError={frontmatterError}
            visible={propertiesOpen}
            drawer={propertiesDrawer}
            rootRef={propertiesDrawerRef}
            slug={selectedFile.name.replace(/\.mdx?$/, "")}
            contentType={selectedFile.contentType}
            coverImageVisible={coverImageVisible}
            filePath={selectedFile.path}
            assetRoot={assetRoot}
            cdnBase={cdnBase}
            onFieldChange={(key, value) => onFieldChange(selectedFile.path, key, value)}
            onToggleCoverImage={onToggleCoverImage}
            onToggle={onToggleProperties}
            onError={onError}
          />
        </ErrorBoundary>
      )}
    </>
  );
}
