import { lazy, Suspense, useEffect } from "react";
import type { FrontmatterValue, ParsedFrontmatter } from "../lib/frontmatter";
import { resolveImageSrc } from "../lib/imageUtils";
import type { FileNode, RecentFile, SaveStatus } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { FileViewer } from "./FileViewer";
import { PropertiesPanel } from "./PropertiesPanel";
import { TabBar } from "./TabBar";

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
  tabs,
  tree,
  saveStatus,
  selectedFile,
  onSelectFromTab,
  onCloseTab,
  onReorderTabs,
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
        {tabs.length >= 2 && (
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
        {selectedFile && coverImageVisible && coverImagePath && (
          <div className="cover-image-banner">
            <img
              src={resolveImageSrc(coverImagePath, selectedFile.path, assetRoot, cdnBase)}
              alt={editorTitle}
            />
          </div>
        )}
        {fileViewerNode ? (
          <FileViewer node={fileViewerNode} onClose={onCloseFileViewer} />
        ) : selectedFile ? (
          <ErrorBoundary key={selectedFile.path}>
            <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
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
      {selectedFile && (
        <PropertiesPanel
          frontmatter={parsedFrontmatter}
          visible={propertiesOpen}
          slug={selectedFile.name.replace(/\.mdx?$/, "")}
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
