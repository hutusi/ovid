import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import { parseCoverImage, resolveImageSrc } from "../lib/imageUtils";
import { isMac } from "../lib/platform";
import type { FileNode, RecentFile, SaveStatus } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { FileViewer, isReadOnlyContent } from "./FileViewer";
import { PropertiesPanel } from "./PropertiesPanel";
import { TabBar } from "./TabBar";
import { TextCover } from "./TextCover";

export type EditorViewState = { selection: number; scrollTop: number };

const loadEditor = async () => import("./Editor");
const Editor = lazy(async () => ({
  default: (await loadEditor()).Editor,
}));

export interface EditorPaneProps {
  // Workspace context
  workspaceRootPath: string | null;
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
  onWordCount: (count: number) => void;
  onDirty: () => void;
  onChange: (markdown: string) => void;
  onError: (message: string) => void;
  currentEditorViewState: EditorViewState | undefined;
  onEditorViewStateChange: (state: EditorViewState) => void;
  registerPendingFlush: (flush: (() => void) | null) => void;

  // Empty state
  recentFiles: RecentFile[];
  onOpenWorkspace: () => void;
  onOpenRecent: (path: string) => void;

  // Properties panel
  propertiesOpen: boolean;
  onToggleProperties: () => void;
  onToggleCoverImage: () => void;
}

export function EditorPane({
  workspaceRootPath,
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
  recentFiles,
  onOpenWorkspace,
  onOpenRecent,
  propertiesOpen,
  onToggleProperties,
  onToggleCoverImage,
}: EditorPaneProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!workspaceRootPath && !selectedFile) return;
    const timer = window.setTimeout(() => {
      void loadEditor();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceRootPath, selectedFile]);

  const editorTitle = parsedFrontmatter.title != null ? String(parsedFrontmatter.title) : "";

  return (
    <>
      <div className="editor-column">
        {(tabs.length > 0 || !sidebarVisible || !propertiesOpen) && (
          <div className="editor-top-bar">
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
            {!propertiesOpen && (
              <button
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
        )}
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
      {selectedFile && !isReadOnlyContent(selectedFile) && (
        <PropertiesPanel
          frontmatter={parsedFrontmatter}
          visible={propertiesOpen}
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
