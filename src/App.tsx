import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppDialogs } from "./components/AppDialogs";
import { EmptyState } from "./components/EmptyState";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FileViewer, getFileViewKind } from "./components/FileViewer";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { loadLastRecentFilePath } from "./lib/appRestore";
import { makeFileNodeFromPath } from "./lib/fileNode";
import { parseFrontmatter } from "./lib/frontmatter";
import { getGitBranchTitle } from "./lib/gitUi";
import { resolveImageSrc } from "./lib/imageUtils";
import { getPathDisplayLabel } from "./lib/postPath";
import type { FileNode, ModalState } from "./lib/types";
import { useContentTypes } from "./lib/useContentTypes";
import { useEditorPreferences } from "./lib/useEditorPreferences";
import { useFileEditor } from "./lib/useFileEditor";
import { useFilesMode } from "./lib/useFilesMode";
import { useGit } from "./lib/useGit";
import { useGitFocusFetch } from "./lib/useGitFocusFetch";
import { useGitRefreshOnSave } from "./lib/useGitRefreshOnSave";
import { useGitUiController } from "./lib/useGitUiController";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { useMenuActions } from "./lib/useMenuActions";
import { useOpenTabs } from "./lib/useOpenTabs";
import { useRecentFiles } from "./lib/useRecentFiles";
import { useRecentWorkspaces } from "./lib/useRecentWorkspaces";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWordCountGoal } from "./lib/useWordCountGoal";
import { useWorkspace } from "./lib/useWorkspace";
import { useWorkspaceRevisionPoll } from "./lib/useWorkspaceRevisionPoll";
import { countLocalImages, extractExcerpt, hasMathBlocks } from "./lib/wechatHtml";
import "./styles/global.css";
import "./App.css";

type EditorViewState = { selection: number; scrollTop: number };

const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";
const AUTO_REOPEN_KEY = "ovid:skipAutoReopen";

const loadEditor = async () => import("./components/Editor");
const Editor = lazy(async () => ({
  default: (await loadEditor()).Editor,
}));

const SearchPanel = lazy(async () => ({
  default: (await import("./components/SearchPanel")).SearchPanel,
}));

function App() {
  const { t } = useTranslation();
  const { resolvedTheme, setPreference } = useTheme();
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== "false"
  );
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [baselineCaptured, setBaselineCaptured] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [wechatPublishDialogOpen, setWechatPublishDialogOpen] = useState(false);
  const [coverImageVisible, setCoverImageVisible] = useState(false);
  const pendingAutoOpenPath = useRef<string | null>(null);
  const editorViewStateRef = useRef<Record<string, EditorViewState>>({});
  const tabSyncRef = useRef<{
    renameTab: (oldPath: string, newPath: string) => void;
    removeTab: (path: string) => void;
  }>({ renameTab: () => {}, removeTab: () => {} });

  const { toasts, showToast } = useToast();
  const { prefs, updatePrefs } = useEditorPreferences();
  const { goal: wordCountGoal, setGoal: setWordCountGoal } = useWordCountGoal();

  const {
    selectedFile,
    setSelectedFile,
    fileContent,
    wordCount,
    setWordCount,
    parsedFrontmatter,
    saveStatus,
    selectedPathRef,
    pendingMarkdownRef,
    lastSavedContentRef,
    flushPendingSave,
    resetFileState,
    handleCloseFile,
    handleSelectFile,
    reloadSelectedFileFromDisk,
    handleEditorChange,
    handleEditorDirty,
    handleFieldChange,
    registerEditorFlush,
  } = useFileEditor({ showToast });
  const selectedFileRef = useRef<FileNode | null>(selectedFile);
  const saveStatusRef = useRef<"saved" | "unsaved">(saveStatus);
  const isGitRepoRef = useRef(false);

  selectedFileRef.current = selectedFile;
  saveStatusRef.current = saveStatus;

  const {
    tree,
    flatFiles,
    workspaceName,
    workspaceRoot,
    workspaceRootPath,
    isAmytisWorkspace,
    assetRoot,
    cdnBase,
    defaultAuthor,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDuplicate,
    handleNewFromExisting,
    handleDelete,
    refreshTree,
    loadDirectoryChildren,
  } = useWorkspace({
    showToast,
    flushPendingSave,
    handleCloseFile,
    handleSelectFile,
    selectedFile,
    selectedPathRef,
    setSelectedFile,
    resetFileState,
    onPathRenamed: (oldPath, newPath) => tabSyncRef.current.renameTab(oldPath, newPath),
    onPathRemoved: (path) => tabSyncRef.current.removeTab(path),
  });

  const { recentFiles, pushRecent, resetRecent } = useRecentFiles(workspaceRoot);
  const { tabs, openTab, closeTab, reorderTabs, renameTab, removeTab } =
    useOpenTabs(workspaceRootPath);
  useEffect(() => {
    tabSyncRef.current = { renameTab, removeTab };
  }, [renameTab, removeTab]);

  const {
    sidebarMode,
    fileViewerNode,
    setFileViewerNode,
    filesTree,
    handleToggleSidebarMode,
    handleLoadDirectoryChildrenFiles,
  } = useFilesMode({ workspaceRootPath, showToast, t });

  const handleLoadDirectoryChildren = useCallback(
    (dirPath: string) => {
      void loadDirectoryChildren(dirPath);
    },
    [loadDirectoryChildren]
  );

  // Canonical open-by-path: looks up the full FileNode from the complete flat index
  // (never from the hierarchical tree, which can become incomplete after sidebar interactions),
  // then selects, records, and tabs the file in one consistent step.
  const openFileByPath = useCallback(
    (path: string) => {
      const node = flatFiles.find((f) => f.node.path === path)?.node ?? makeFileNodeFromPath(path);
      if (node.isDirectory) return;
      setFileViewerNode(null);
      void handleSelectFile(node);
      pushRecent(node);
      openTab(path);
    },
    [flatFiles, handleSelectFile, pushRecent, openTab, setFileViewerNode]
  );

  function handleSidebarSelect(node: import("./lib/types").FileNode) {
    const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
    if (sidebarMode === "content" || isMarkdown) {
      setFileViewerNode(null);
      void handleSelectFile(node);
      if (!node.isDirectory) {
        pushRecent(node);
        openTab(node.path);
      }
      return;
    }
    const kind = getFileViewKind(node);
    if (kind === null) {
      showToast(t("file_viewer.cannot_open"));
      return;
    }
    void handleCloseFile();
    setFileViewerNode(node);
  }

  const closeActiveTabOrFile = useCallback(() => {
    if (fileViewerNode) {
      setFileViewerNode(null);
      return;
    }
    if (selectedFile && tabs.includes(selectedFile.path)) {
      const { neighbor } = closeTab(selectedFile.path);
      if (neighbor) {
        const node =
          flatFiles.find((f) => f.node.path === neighbor)?.node ?? makeFileNodeFromPath(neighbor);
        void handleSelectFile(node);
        pushRecent(node);
        return;
      }
    }
    void handleCloseFile();
  }, [
    fileViewerNode,
    setFileViewerNode,
    selectedFile,
    tabs,
    closeTab,
    flatFiles,
    handleSelectFile,
    pushRecent,
    handleCloseFile,
  ]);

  const handleEditorViewStateChange = useCallback(
    (viewState: EditorViewState) => {
      if (!selectedFile) return;
      editorViewStateRef.current[selectedFile.path] = viewState;
    },
    [selectedFile]
  );
  const currentEditorViewState = selectedFile
    ? editorViewStateRef.current[selectedFile.path]
    : undefined;
  const { recentWorkspaces, pushRecentWorkspace } = useRecentWorkspaces();
  const {
    gitStatusMap,
    isGitRepo,
    currentBranch,
    remoteInfo,
    refreshGitStatus,
    handleCommit,
    handlePush,
    handlePull,
    handleFetch,
    handleSwitchBranch,
    handleCreateBranch,
    handleCheckoutRemoteBranch,
    handleRenameBranch,
    handleDeleteBranch,
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteBranches,
    getRemoteInfo,
  } = useGit(workspaceRoot);
  isGitRepoRef.current = isGitRepo;
  const contentTypes = useContentTypes(workspaceRoot, isAmytisWorkspace);
  const {
    commitDialog,
    branchSwitcher,
    newBranchDialogOpen,
    renameBranchDialog,
    deleteBranchDialog,
    gitSyncPopoverOpen,
    gitChangeSummary,
    gitSyncLabel,
    gitSyncPopover,
    pushSuccessMessage,
    defaultCommitMessage,
    openCommitDialog,
    setCommitDialog,
    handleCommitDialogCommit,
    runGitAction,
    openBranchSwitcher,
    closeBranchSwitcher,
    switchBranch,
    createBranch,
    checkoutRemoteBranch,
    renameBranch,
    deleteBranch,
    openRemote,
    copyRemoteUrl,
    handleGitSyncAction,
    setNewBranchDialogOpen,
    setRenameBranchDialog,
    setDeleteBranchDialog,
    setGitSyncPopoverOpen,
  } = useGitUiController({
    gitStatusMap,
    isGitRepo,
    remoteInfo,
    workspaceRootPath,
    parsedTitle: parsedFrontmatter.title == null ? undefined : String(parsedFrontmatter.title),
    selectedFileName: selectedFile?.name,
    showToast,
    flushPendingSave,
    openWorkspaceAtPath,
    handleCommit,
    handlePush,
    handlePull,
    handleSwitchBranch,
    handleCreateBranch,
    handleCheckoutRemoteBranch,
    handleRenameBranch,
    handleDeleteBranch,
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteBranches,
    getRemoteInfo,
  });

  // Sync recent files list when workspace changes
  useEffect(() => {
    if (workspaceRoot) resetRecent(workspaceRoot);
  }, [workspaceRoot, resetRecent]);

  useEffect(() => {
    if (!workspaceRootPath && !selectedFile) return;
    const timer = window.setTimeout(() => {
      void loadEditor();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceRootPath, selectedFile]);

  // Track recently opened workspaces
  useEffect(() => {
    if (workspaceRootPath && workspaceName) {
      pushRecentWorkspace(workspaceRootPath, workspaceName);
    }
  }, [workspaceRootPath, workspaceName, pushRecentWorkspace]);

  // Auto-reopen last workspace on launch (once)
  const autoReopenAttempted = useRef(false);
  useEffect(() => {
    if (
      autoReopenAttempted.current ||
      workspaceRootPath !== null ||
      recentWorkspaces.length === 0 ||
      localStorage.getItem(AUTO_REOPEN_KEY) === "true"
    )
      return;
    autoReopenAttempted.current = true;
    pendingAutoOpenPath.current = loadLastRecentFilePath(
      recentWorkspaces[0].rootPath,
      localStorage
    );
    void openWorkspaceAtPath(recentWorkspaces[0].rootPath);
  }, [recentWorkspaces, openWorkspaceAtPath, workspaceRootPath]);

  useEffect(() => {
    const path = pendingAutoOpenPath.current;
    if (!path || tree.length === 0 || selectedFile) return;
    pendingAutoOpenPath.current = null;
    openFileByPath(path);
  }, [tree, selectedFile, openFileByPath]);

  // Reset per-file UI state when switching files (selectedFile is the trigger, not used in body)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile is the intended trigger
  useEffect(() => {
    setSessionBaseline(null);
    setBaselineCaptured(false);
    setCoverImageVisible(false);
  }, [selectedFile]);

  // Capture baseline on first word-count event for the new file (including empty files)
  useEffect(() => {
    if (!baselineCaptured) {
      setSessionBaseline(wordCount);
      setBaselineCaptured(true);
    }
  }, [wordCount, baselineCaptured]);

  useKeyboardShortcuts({
    modal,
    commitDialog,
    switcherOpen,
    branchSwitcher,
    newBranchDialogOpen,
    renameBranchDialog,
    deleteBranchDialog,
    workspaceSwitcherOpen,
    updateDialogOpen,
    wechatPublishDialogOpen,
    zenMode,
    workspaceRoot,
    tree,
    isGitRepo,
    defaultCommitMessage,
    flushPendingSave,
    closeActiveTabOrFile,
    handleOpenWorkspace,
    handleNewTodayFlow,
    openCommitDialog,
    setModal,
    setSidebarVisible,
    setPropertiesOpen,
    setSearchOpen,
    setZenMode,
    setWorkspaceSwitcherOpen,
    setSwitcherOpen,
  });

  useGitRefreshOnSave({ saveStatus, isGitRepo, refreshGitStatus });

  useWorkspaceRevisionPoll({
    workspaceRoot,
    refreshTree,
    reloadSelectedFileFromDisk,
    handleCloseFile,
    refreshGitStatus,
    showToast,
    t,
    lastSavedContentRef,
    selectedFileRef,
    saveStatusRef,
    isGitRepoRef,
  });

  useGitFocusFetch({ workspaceRoot, isGitRepo, handleFetch });

  useMenuActions({
    modal,
    commitDialog,
    switcherOpen,
    branchSwitcher,
    newBranchDialogOpen,
    renameBranchDialog,
    deleteBranchDialog,
    workspaceSwitcherOpen,
    updateDialogOpen,
    wechatPublishDialogOpen,
    workspaceRoot,
    tree,
    isGitRepo,
    selectedFile,
    prefs,
    pushSuccessMessage,
    defaultCommitMessage,
    pendingMarkdownRef,
    fileContent,
    showToast,
    t,
    setModal,
    setSidebarVisible,
    setPropertiesOpen,
    setSearchOpen,
    setZenMode,
    setTypewriterMode,
    setSwitcherOpen,
    setWorkspaceSwitcherOpen,
    setUpdateDialogOpen,
    setWechatPublishDialogOpen,
    setNewBranchDialogOpen,
    flushPendingSave,
    closeActiveTabOrFile,
    handleOpenWorkspace,
    handleNewTodayFlow,
    openCommitDialog,
    openBranchSwitcher,
    runGitAction,
    handlePush,
    openRemote,
    copyRemoteUrl,
    handlePull,
    handleFetch,
    updatePrefs,
  });

  const coverImagePath =
    parsedFrontmatter.coverImage != null && parsedFrontmatter.coverImage !== ""
      ? String(parsedFrontmatter.coverImage)
      : undefined;

  // Values passed to WechatPublishDialog when opened
  const wechatBaseDir = selectedFile
    ? selectedFile.path.substring(0, selectedFile.path.lastIndexOf("/"))
    : (workspaceRootPath ?? "");
  // Pass the raw coverImage frontmatter value to Rust; Rust resolves root-relative
  // paths (/images/…) against assetRoot and relative paths against wechatBaseDir.
  const wechatCoverImagePath = coverImagePath ?? null;
  // Author: frontmatter author → site.config default → empty; blank frontmatter treated as missing
  const frontmatterAuthor =
    parsedFrontmatter.author != null ? String(parsedFrontmatter.author).trim() : "";
  const wechatAuthor = frontmatterAuthor || (defaultAuthor ?? "");
  // Digest: frontmatter excerpt/description → auto-extract from body
  const wechatBody = pendingMarkdownRef.current ?? parseFrontmatter(fileContent).body;
  const wechatDigest = (() => {
    if (parsedFrontmatter.excerpt != null && String(parsedFrontmatter.excerpt).trim())
      return String(parsedFrontmatter.excerpt).trim();
    if (parsedFrontmatter.description != null && String(parsedFrontmatter.description).trim())
      return String(parsedFrontmatter.description).trim();
    return extractExcerpt(wechatBody);
  })();
  const wechatHasMath = hasMathBlocks(wechatBody);
  const wechatImageCount = countLocalImages(wechatBody);
  const wechatMediaId =
    parsedFrontmatter.wechatMediaId != null && String(parsedFrontmatter.wechatMediaId).trim()
      ? String(parsedFrontmatter.wechatMediaId).trim()
      : null;
  const wechatTitle =
    parsedFrontmatter.title != null
      ? String(parsedFrontmatter.title)
      : (selectedFile?.name.replace(/\.mdx?$/, "") ?? "");
  const wechatMarkdown = wechatBody;

  async function handlePublishAwareFieldChange(key: string, value: unknown) {
    await handleFieldChange(key, value as Parameters<typeof handleFieldChange>[1]);
    if (key === "draft" && value === false && isGitRepo) {
      try {
        const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
        await openCommitDialog(`Publish: ${title}`);
      } catch {
        // git unavailable — ignore
      }
    }
  }

  function handleOpenByPath(path: string) {
    openFileByPath(path);
    setSearchOpen(false);
  }

  function handleSelectFromTab(path: string) {
    const node = flatFiles.find((f) => f.node.path === path)?.node ?? makeFileNodeFromPath(path);
    setFileViewerNode(null);
    void handleSelectFile(node);
    pushRecent(node);
  }

  function handleCloseTab(path: string) {
    const wasActive = selectedFile?.path === path;
    const { neighbor } = closeTab(path);
    if (!wasActive) return;
    if (neighbor) handleSelectFromTab(neighbor);
    else void handleCloseFile();
  }

  const sessionWordsAdded = sessionBaseline !== null ? Math.max(0, wordCount - sessionBaseline) : 0;

  return (
    <div className="app" data-zen={zenMode ? "true" : undefined}>
      <div className="app-body">
        {searchOpen ? (
          <Suspense fallback={null}>
            <SearchPanel onOpenFile={handleOpenByPath} onClose={() => setSearchOpen(false)} />
          </Suspense>
        ) : (
          <Sidebar
            tree={sidebarMode === "files" ? filesTree : tree}
            workspaceKey={workspaceRootPath}
            selectedPath={fileViewerNode?.path ?? selectedFile?.path ?? null}
            visible={sidebarVisible}
            workspaceName={workspaceName}
            gitStatusMap={gitStatusMap}
            mode={sidebarMode}
            onToggleMode={handleToggleSidebarMode}
            onSelect={handleSidebarSelect}
            onOpenWorkspace={handleOpenWorkspace}
            onOpenSwitcher={() => setWorkspaceSwitcherOpen(true)}
            onNewFile={(dirPath) => setModal({ type: "new-file", dirPath })}
            onLoadDirectoryChildren={
              sidebarMode === "files"
                ? (dirPath) => void handleLoadDirectoryChildrenFiles(dirPath)
                : handleLoadDirectoryChildren
            }
            onRename={(node) => setModal({ type: "rename-path", node })}
            onDuplicate={(node) => setModal({ type: "duplicate-file", node })}
            onNewFromExisting={(node) => setModal({ type: "new-from-existing", node })}
            onDelete={handleDelete}
          />
        )}
        <div className="editor-column">
          {tabs.length >= 2 && (
            <TabBar
              tabs={tabs}
              tree={tree}
              activePath={selectedFile?.path ?? null}
              saveStatus={saveStatus}
              onSelect={handleSelectFromTab}
              onClose={handleCloseTab}
              onReorder={reorderTabs}
            />
          )}
          {selectedFile && coverImageVisible && coverImagePath && (
            <div className="cover-image-banner">
              <img
                src={resolveImageSrc(coverImagePath, selectedFile.path, assetRoot, cdnBase)}
                alt={parsedFrontmatter.title ? String(parsedFrontmatter.title) : ""}
              />
            </div>
          )}
          {fileViewerNode ? (
            <FileViewer node={fileViewerNode} onClose={() => setFileViewerNode(null)} />
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
                  spellCheck={prefs.spellCheck}
                  showH1Warning={
                    parsedFrontmatter.title != null && String(parsedFrontmatter.title).trim() !== ""
                  }
                  title={parsedFrontmatter.title != null ? String(parsedFrontmatter.title) : ""}
                  onTitleChange={(value) => void handlePublishAwareFieldChange("title", value)}
                  onWordCount={setWordCount}
                  onDirty={handleEditorDirty}
                  onChange={handleEditorChange}
                  onError={showToast}
                  initialSelection={currentEditorViewState?.selection}
                  initialScrollTop={currentEditorViewState?.scrollTop}
                  onViewStateChange={handleEditorViewStateChange}
                  registerPendingFlush={registerEditorFlush}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <EmptyState
              workspaceOpen={workspaceRoot !== null}
              recentFiles={recentFiles}
              onOpenWorkspace={handleOpenWorkspace}
              onOpenRecent={handleOpenByPath}
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
            onFieldChange={handlePublishAwareFieldChange}
            onToggleCoverImage={() => setCoverImageVisible((v) => !v)}
            onError={showToast}
          />
        )}
      </div>
      <StatusBar
        fileLabel={selectedFile ? getPathDisplayLabel(selectedFile) : null}
        wordCount={wordCount}
        resolvedTheme={resolvedTheme}
        saveStatus={saveStatus}
        zenMode={zenMode}
        typewriterMode={typewriterMode}
        sessionWordsAdded={sessionWordsAdded}
        wordCountGoal={wordCountGoal}
        fontFamily={prefs.fontFamily}
        fontSize={prefs.fontSize}
        spellCheck={prefs.spellCheck}
        gitBranch={isGitRepo ? currentBranch : null}
        gitBranchTitle={isGitRepo ? getGitBranchTitle(currentBranch, remoteInfo, t) : undefined}
        gitSyncLabel={gitSyncLabel}
        gitSyncTitle={gitSyncPopover?.description}
        gitChangeLabel={gitChangeSummary?.label}
        gitChangeTitle={gitChangeSummary?.title}
        gitSyncPopoverOpen={gitSyncPopoverOpen}
        onOpenBranches={() => void openBranchSwitcher()}
        onRenamePath={
          selectedFile && !selectedFile.isDirectory
            ? () => setModal({ type: "rename-path", node: selectedFile })
            : undefined
        }
        onOpenCommit={() => void openCommitDialog("Update")}
        onOpenGitSync={() => setGitSyncPopoverOpen((open) => !open)}
        onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
        onToggleZen={() => setZenMode((v) => !v)}
        onToggleTypewriter={() => setTypewriterMode((v) => !v)}
        onSetFontFamily={(f) => updatePrefs({ fontFamily: f })}
        onSetFontSize={(s) => updatePrefs({ fontSize: s })}
        onToggleSpellCheck={() => updatePrefs({ spellCheck: !prefs.spellCheck })}
        onSetWordCountGoal={setWordCountGoal}
      />
      <AppDialogs
        toasts={toasts}
        gitSyncPopoverOpen={gitSyncPopoverOpen}
        gitSyncPopover={gitSyncPopover}
        setGitSyncPopoverOpen={setGitSyncPopoverOpen}
        handleGitSyncAction={handleGitSyncAction}
        workspaceSwitcherOpen={workspaceSwitcherOpen}
        recentWorkspaces={recentWorkspaces}
        workspaceRootPath={workspaceRootPath}
        openWorkspaceAtPath={openWorkspaceAtPath}
        handleOpenWorkspace={handleOpenWorkspace}
        setWorkspaceSwitcherOpen={setWorkspaceSwitcherOpen}
        updateDialogOpen={updateDialogOpen}
        flushPendingSave={flushPendingSave}
        setUpdateDialogOpen={setUpdateDialogOpen}
        wechatPublishDialogOpen={wechatPublishDialogOpen}
        selectedFile={selectedFile}
        wechatTitle={wechatTitle}
        wechatAuthor={wechatAuthor}
        wechatDigest={wechatDigest}
        wechatHasMath={wechatHasMath}
        wechatImageCount={wechatImageCount}
        wechatMarkdown={wechatMarkdown}
        wechatBaseDir={wechatBaseDir}
        assetRoot={assetRoot}
        wechatCoverImagePath={wechatCoverImagePath}
        wechatMediaId={wechatMediaId}
        setWechatPublishDialogOpen={setWechatPublishDialogOpen}
        onWechatSuccess={(mediaId) => {
          void handleFieldChange("wechatMediaId", mediaId);
        }}
        modal={modal}
        setModal={setModal}
        contentTypes={contentTypes}
        handleNewFile={handleNewFile}
        handleDuplicate={handleDuplicate}
        handleNewFromExisting={handleNewFromExisting}
        handleRename={handleRename}
        switcherOpen={switcherOpen}
        flatFiles={flatFiles}
        recentFiles={recentFiles}
        openFileByPath={openFileByPath}
        setSwitcherOpen={setSwitcherOpen}
        commitDialog={commitDialog}
        setCommitDialog={setCommitDialog}
        handleCommitDialogCommit={handleCommitDialogCommit}
        branchSwitcher={branchSwitcher}
        currentBranch={currentBranch}
        switchBranch={switchBranch}
        checkoutRemoteBranch={checkoutRemoteBranch}
        closeBranchSwitcher={closeBranchSwitcher}
        setNewBranchDialogOpen={setNewBranchDialogOpen}
        setRenameBranchDialog={setRenameBranchDialog}
        setDeleteBranchDialog={setDeleteBranchDialog}
        runGitAction={runGitAction}
        handlePush={handlePush}
        openRemote={openRemote}
        copyRemoteUrl={copyRemoteUrl}
        newBranchDialogOpen={newBranchDialogOpen}
        createBranch={createBranch}
        renameBranchDialog={renameBranchDialog}
        renameBranch={renameBranch}
        deleteBranchDialog={deleteBranchDialog}
        deleteBranch={deleteBranch}
      />
    </div>
  );
}

export default App;
