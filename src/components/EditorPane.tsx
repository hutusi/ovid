import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import { parseCoverImage, resolveImageSrc } from "../lib/imageUtils";
import type { FileNode, RecentFile } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { FileViewer, isReadOnlyContent } from "./FileViewer";
import { PropertiesPanel } from "./PropertiesPanel";
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

  // Editor file context
  selectedFile: FileNode | null;
  onCloseTab: (path: string) => void;

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
  onToggleCoverImage: () => void;
}

export function EditorPane({
  workspaceRootPath,
  workspaceRoot,
  selectedFile,
  onCloseTab,
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
          onError={onError}
        />
      )}
    </>
  );
}
