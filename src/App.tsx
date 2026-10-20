import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppDialogs } from "./components/AppDialogs";
import type { EditorViewState } from "./components/EditorPane";
import { EditorPane, preloadEditor } from "./components/EditorPane";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getFileViewKind, isReadOnlyContent } from "./components/FileViewer";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { ToastStack } from "./components/ToastStack";
import type { NewContentKind } from "./lib/amytisScaffold";
import type { AppActionCtx } from "./lib/appActions";
import { loadLastRecentFilePath } from "./lib/appRestore";
import { commands } from "./lib/commands";
import { getGitBranchTitle } from "./lib/gitUi";
import { isMac } from "./lib/platform";
import { getPathDisplayLabel } from "./lib/postPath";
import { forContentMode, forFilesMode } from "./lib/sidebarUtils";
import type { FileNode, SaveStatus, SearchJumpTarget, WordCountKind } from "./lib/types";
import { PROPERTIES_OPEN_KEY, SIDEBAR_VISIBLE_KEY } from "./lib/uiVisibility";
import { useAppPreferences } from "./lib/useAppPreferences";
import { useCloseGuard } from "./lib/useCloseGuard";
import { useCollectionActions } from "./lib/useCollectionActions";
import { useContentPreferences } from "./lib/useContentPreferences";
import { useCoverImage } from "./lib/useCoverImage";
import { useEditorPreferences } from "./lib/useEditorPreferences";
import { type ConflictResolution, type SaveBlock, useFileEditor } from "./lib/useFileEditor";
import { useFilesMode } from "./lib/useFilesMode";
import { useGit } from "./lib/useGit";
import { useGitFocusFetch } from "./lib/useGitFocusFetch";
import { useGitRefreshOnSave } from "./lib/useGitRefreshOnSave";
import { useGitUiController } from "./lib/useGitUiController";
import { useGlobalErrorHandlers } from "./lib/useGlobalErrorHandlers";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { useMenuActions } from "./lib/useMenuActions";
import { useNoteIndex } from "./lib/useNoteIndex";
import { useOverlayStack } from "./lib/useOverlayStack";
import { useRecentWorkspaces } from "./lib/useRecentWorkspaces";
import { useResponsivePanels } from "./lib/useResponsivePanels";
import { focusSidebarTree } from "./lib/useSidebarTreeFocus";
import { useStableCallback } from "./lib/useStableCallback";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWordCountGoal } from "./lib/useWordCountGoal";
import { useWorkspaceChangeMonitor } from "./lib/useWorkspaceChangeMonitor";
import { useWorkspaceSession } from "./lib/useWorkspaceSession";
import { createWikiNote } from "./lib/wikiLink";
import { createWritingStats } from "./lib/writingStats";
import "./styles/global.css";
import "./App.css";

const SearchPanel = lazy(async () => ({
  default: (await import("./components/SearchPanel")).SearchPanel,
}));

function App() {
  const { t } = useTranslation();
  const { preference: themePreference, resolvedTheme, setPreference } = useTheme();
  const { prefs: appPrefs, updatePrefs: updateAppPrefs } = useAppPreferences();
  const { prefs: contentPrefs, updatePrefs: updateContentPrefs } = useContentPreferences();
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== "false"
  );
  const [propertiesOpen, setPropertiesOpen] = useState(
    () => localStorage.getItem(PROPERTIES_OPEN_KEY) !== "false"
  );
  const [zenMode, setZenMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const overlay = useOverlayStack();
  const pendingAutoOpenPath = useRef<string | null>(null);
  const editorViewStateRef = useRef<Record<string, EditorViewState>>({});

  const {
    toasts,
    showToast,
    dismissToast,
    pauseToast,
    resumeToast,
    notifications,
    unread,
    markNotificationsRead,
    clearNotifications,
  } = useToast();
  // Editor/properties failures (image paste, cover upload) are errors.
  const showError = useCallback(
    (message: string) => showToast(message, { kind: "error" }),
    [showToast]
  );
  // Surface otherwise-silent async failures (fire-and-forget promises, uncaught
  // errors) as a throttled toast instead of losing them to the console.
  useGlobalErrorHandlers(showToast);
  const { prefs, updatePrefs } = useEditorPreferences();
  const { goal: wordCountGoal, setGoal: setWordCountGoal } = useWordCountGoal();

  // Open the external-change conflict prompt when a save is refused because the
  // file changed on disk. Memoized so useFileEditor's conflict handler is stable.
  const openConflictDialog = useCallback(
    (reason: SaveBlock) => overlay.open({ kind: "conflict", reason }),
    [overlay.open]
  );

  const {
    selectedFile,
    editorDocument,
    getCurrentBody,
    remountEditor,
    renameSelection,
    frontmatterLineOffset,
    parsedFrontmatter,
    frontmatterError,
    saveStatus,
    resolveConflict,
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
  } = useFileEditor({ showToast, onConflict: openConflictDialog });
  const panelLayout = useResponsivePanels({
    sidebarPreferred: sidebarVisible,
    setSidebarPreferred: setSidebarVisible,
    propertiesPreferred: propertiesOpen,
    setPropertiesPreferred: setPropertiesOpen,
    propertiesAvailable: selectedFile !== null && !isReadOnlyContent(selectedFile),
    blockingOverlayOpen: overlay.isBlocking,
  });
  // Native View menu checkmarks describe what is actually visible. In compact
  // mode this means the transient drawer state, not the preserved desktop
  // preference that will return when the window widens.
  useEffect(() => {
    void commands.menu.setChecked({
      id: "toggle-sidebar",
      checked: panelLayout.sidebarVisible,
    });
  }, [panelLayout.sidebarVisible]);
  useEffect(() => {
    void commands.menu.setChecked({
      id: "toggle-properties",
      checked: panelLayout.propertiesOpen,
    });
  }, [panelLayout.propertiesOpen]);
  // Flush pending saves before the window closes so the last ~1s of typing held
  // by the autosave debounce isn't lost when the WebView is torn down on quit.
  const requestQuit = useCloseGuard(flushPendingSave, showToast);
  // Word counts and session progress live outside App state (see
  // writingStats.ts): only the status-bar readout re-renders while typing.
  const [writingStats] = useState(createWritingStats);
  const { coverImageVisible, toggleCoverImage } = useCoverImage(selectedFile);
  const handleWordCount = useCallback(
    (count: number, path?: string, kind?: WordCountKind) => {
      if (path) writingStats.report(path, count, kind);
    },
    [writingStats]
  );
  const selectedFileRef = useRef<FileNode | null>(selectedFile);
  const saveStatusRef = useRef<SaveStatus>(saveStatus);
  const isGitRepoRef = useRef(false);

  selectedFileRef.current = selectedFile;
  saveStatusRef.current = saveStatus;

  const {
    tree,
    flatFiles,
    workspaceName,
    workspaceRoot,
    workspaceRootPath,
    assetRoot,
    cdnBase,
    defaultAuthor,
    postsBasePath,
    features,
    authors,
    i18n: i18nConfig,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleCreateAmytisWorkspace,
    handleCloneWorkspace,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDuplicate,
    handleNewFromExisting,
    handleDelete,
    addCollectionItem,
    removeCollectionItem,
    refreshTree,
    tabs,
    closeTab,
    reorderTabs,
    recentFiles,
    openFile,
    openByPath,
    closeActive,
    forgetRemovedPath,
  } = useWorkspaceSession({
    showToast,
    flushPendingSave,
    resetFileState,
    contentPrefs,
    onSessionPathRenamed: writingStats.pathRenamed,
    onSessionPathRemoved: writingStats.pathRemoved,
    fileEditor: {
      selectedFile,
      renameSelection,
      handleSelectFile,
      handleCloseFile,
    },
  });

  const { sidebarMode, fileViewerNode, setFileViewerNode, viewerGen, handleToggleSidebarMode } =
    useFilesMode({
      workspaceRootPath,
    });

  // Project the canonical workspace tree into the shape the active sidebar
  // mode wants. Both modes derive from the single tree owned by useWorkspace
  // — selectors live in sidebarUtils so they're testable in isolation and
  // keep Sidebar.tsx unaware of the projection rules.
  const sidebarTree = useMemo(() => {
    if (sidebarMode === "files") return forFilesMode(tree);
    if (!workspaceRoot || !workspaceRootPath) return [];
    return forContentMode(tree, {
      workspaceRoot: workspaceRootPath,
      treeRoot: workspaceRoot,
      postsBasePath,
      features,
      locales: i18nConfig.locales,
      defaultLocale: i18nConfig.defaultLocale ?? undefined,
    });
  }, [
    sidebarMode,
    tree,
    workspaceRoot,
    workspaceRootPath,
    postsBasePath,
    features,
    i18nConfig.locales,
    i18nConfig.defaultLocale,
  ]);

  // Resolve each collection entry's `items:` to navigable sidebar links.
  const {
    collectionLinks,
    handleAddToCollection,
    handleRemoveFromCollection,
    handleAddCollectionItem,
    collectionCandidatesFor,
  } = useCollectionActions({
    tree,
    flatFiles,
    workspaceRoot,
    postsBasePath,
    overlay,
    addCollectionItem,
    removeCollectionItem,
  });

  // openByPath / openFile / closeActive live inside useEditorSession; here we
  // only have to clear the FileViewer (a separate, files-mode UI concern) and
  // delegate. `setFileViewerNode` bumps the viewer generation (see
  // useFilesMode), so clearing it here invalidates any pending viewer-set.
  const openFileByPath = useCallback(
    (path: string): Promise<boolean> => {
      setFileViewerNode(null);
      return openByPath(path);
    },
    [openByPath, setFileViewerNode]
  );

  // Wiki-link resolution index — refreshed asynchronously whenever the
  // workspace's notes-bucket file list changes. Held in a ref so the stable
  // `resolveWikiTargetCallback` always sees the latest snapshot without
  // forcing every wiki link node-view to re-render on each prop change.
  // Pending "scroll the editor to this search match" request; consumed (and
  // cleared) by the Editor once the target file's content is on screen.
  const [searchJump, setSearchJump] = useState<SearchJumpTarget | null>(null);
  const searchJumpGenRef = useRef(0);
  const handleSearchJumpHandled = useCallback(() => setSearchJump(null), []);

  const {
    noteResolverIndex,
    resolveWikiTarget: resolveWikiTargetCallback,
    resolveWikiTargetForNavigation,
  } = useNoteIndex(flatFiles, workspaceRoot);

  const onOpenWikiTarget = useCallback(
    async (target: string) => {
      if (!workspaceRoot) return;
      const resolved = await resolveWikiTargetForNavigation(target);
      if (resolved.exists) {
        setFileViewerNode(null);
        void openByPath(`${workspaceRoot}/${resolved.relativePath}`);
        return;
      }
      try {
        const { filePath } = await createWikiNote(target, {
          workspaceRoot,
          postsBasePath,
          today: new Date().toISOString().slice(0, 10),
          ensureDir: (path) => commands.files.ensureDir({ path }),
          createFile: async (path, content) => {
            await commands.files.create({ path, content });
          },
          t,
        });
        await refreshTree();
        setFileViewerNode(null);
        void openByPath(filePath);
      } catch (err) {
        showToast(
          t("wikiLink.createNoteFailed", {
            target,
            message: err instanceof Error ? err.message : String(err),
          }),
          { kind: "error" }
        );
      }
    },
    [
      workspaceRoot,
      postsBasePath,
      refreshTree,
      openByPath,
      setFileViewerNode,
      showToast,
      t,
      resolveWikiTargetForNavigation,
    ]
  );

  // Stable handlers for the memoized sidebar (its rows re-render only when
  // their own inputs change). The overlay's open() is itself stable.
  const openModal = overlay.open;
  const sidebarHandlers = {
    onSelect: useStableCallback((node: FileNode) => handleSidebarSelect(node)),
    onToggleMode: useStableCallback(() => handleToggleSidebarMode()),
    onDelete: useCallback(
      (node: FileNode) => openModal({ kind: "modal", state: { type: "delete-path", node } }),
      [openModal]
    ),
    onOpenSwitcher: useCallback(() => openModal({ kind: "workspaceSwitcher" }), [openModal]),
    onNewFile: useCallback(
      (dirPath: string, kind: NewContentKind) =>
        openModal({ kind: "modal", state: { type: "new-file", dirPath, kind } }),
      [openModal]
    ),
    onRename: useCallback(
      (node: FileNode) => openModal({ kind: "modal", state: { type: "rename-path", node } }),
      [openModal]
    ),
    onDuplicate: useCallback(
      (node: FileNode) => openModal({ kind: "modal", state: { type: "duplicate-file", node } }),
      [openModal]
    ),
    onNewFromExisting: useCallback(
      (node: FileNode) => openModal({ kind: "modal", state: { type: "new-from-existing", node } }),
      [openModal]
    ),
  };

  async function handleSidebarSelect(node: FileNode) {
    // Bump first, before any branch or early return, so *every* sidebar click
    // — including an unsupported-file click that only toasts — supersedes a
    // pending non-Markdown selection whose slow close is still in flight.
    const gen = viewerGen.bump();
    const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
    if (sidebarMode === "content" || isMarkdown) {
      setFileViewerNode(null);
      void openFile(node);
      return;
    }
    const kind = getFileViewKind(node);
    if (kind === null) {
      showToast(t("file_viewer.cannot_open"));
      return;
    }
    // Show the (read-only) viewer only after the open Markdown file's save
    // transaction closes — a conflicting/failed close keeps the editor and its
    // pending edit on screen rather than hiding it behind the viewer. Guard on
    // the selection generation so a slow close can't set the viewer over a
    // newer selection made while it was pending.
    if ((await handleCloseFile()) && viewerGen.isCurrent(gen)) {
      setFileViewerNode(node);
    }
  }

  const closeActiveTabOrFile = useCallback(() => {
    if (fileViewerNode) {
      setFileViewerNode(null);
      return;
    }
    closeActive();
  }, [fileViewerNode, setFileViewerNode, closeActive]);

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
  const { recentWorkspaces, pushRecentWorkspace, removeRecentWorkspace } = useRecentWorkspaces();
  const {
    gitStatusMap,
    isGitRepo,
    currentBranch,
    remoteInfo,
    refreshGitStatus,
    refreshFileStatus,
    handleCommit,
    handlePush,
    handlePull,
    handleFetch,
    handlePushWithCredentials,
    handlePullWithCredentials,
    handleFetchWithCredentials,
    handleForgetCredentials,
    hasCredentialsForHost,
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
  const gitUi = useGitUiController({
    overlay,
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
    handlePushWithCredentials,
    handlePullWithCredentials,
    handleFetchWithCredentials,
    handleForgetCredentials,
    hasCredentialsForHost,
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
  // App-level consumers (StatusBar, menu/keyboard wiring) pull what they
  // need off the controller; the git dialogs receive `gitUi` whole.
  const {
    gitActionInFlight,
    gitChangeSummary,
    gitSyncLabel,
    gitSyncPopover,
    pushSuccessMessage,
    defaultCommitMessage,
    openCommitDialog,
    runGitAction,
    openBranchSwitcher,
    openRemote,
    copyRemoteUrl,
    toggleGitSyncPopover,
  } = gitUi;

  // Track recently opened workspaces
  useEffect(() => {
    if (workspaceRootPath && workspaceName) {
      pushRecentWorkspace(workspaceRootPath, workspaceName);
    }
  }, [workspaceRootPath, workspaceName, pushRecentWorkspace]);

  // Auto-reopen the last workspace + its tabs on launch (once), when the
  // "restore last session" preference is on. useOpenTabs rehydrates the tab
  // bar from the workspace's persisted tab list; here we additionally surface
  // the most-recent file as the active tab.
  //
  // The preference is latched at mount: toggling it mid-session must NOT
  // trigger an auto-reopen, only affect the next launch.
  const initialRestoreLastSession = useRef(appPrefs.restoreLastSession);
  const autoReopenAttempted = useRef(false);
  useEffect(() => {
    if (
      autoReopenAttempted.current ||
      workspaceRootPath !== null ||
      recentWorkspaces.length === 0 ||
      !initialRestoreLastSession.current
    )
      return;
    autoReopenAttempted.current = true;
    pendingAutoOpenPath.current = loadLastRecentFilePath(
      recentWorkspaces[0].rootPath,
      localStorage
    );
    // A file will reopen once the workspace is in: load the editor meanwhile.
    if (pendingAutoOpenPath.current) preloadEditor();
    void openWorkspaceAtPath(recentWorkspaces[0].rootPath);
  }, [recentWorkspaces, openWorkspaceAtPath, workspaceRootPath]);

  useEffect(() => {
    const path = pendingAutoOpenPath.current;
    if (!path || tree.length === 0 || selectedFile) return;
    pendingAutoOpenPath.current = null;
    openFileByPath(path);
  }, [tree, selectedFile, openFileByPath]);

  // One context object feeds both input adapters of the global action
  // table (ADR 0018): keyboard shortcuts and native menu events dispatch
  // the same appActions rows.
  const appActionCtx = useMemo<AppActionCtx>(
    () => ({
      overlay,
      zenMode,
      workspaceRoot,
      tree,
      isGitRepo,
      selectedFile,
      prefs,
      pushSuccessMessage,
      defaultCommitMessage,
      getCurrentBody,
      showToast,
      t,
      toggleSidebar: panelLayout.toggleSidebar,
      focusSidebar: () => {
        panelLayout.showSidebar();
        // After the sidebar has rendered visible.
        requestAnimationFrame(() => focusSidebarTree());
      },
      toggleProperties: panelLayout.toggleProperties,
      setZenMode,
      setTypewriterMode,
      requestQuit,
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
    }),
    [
      overlay,
      zenMode,
      workspaceRoot,
      tree,
      isGitRepo,
      selectedFile,
      prefs,
      pushSuccessMessage,
      defaultCommitMessage,
      getCurrentBody,
      showToast,
      t,
      panelLayout.toggleSidebar,
      panelLayout.showSidebar,
      panelLayout.toggleProperties,
      requestQuit,
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
    ]
  );

  useKeyboardShortcuts(appActionCtx);

  useGitRefreshOnSave({ saveStatus, isGitRepo, refreshGitStatus: refreshFileStatus });

  useWorkspaceChangeMonitor({
    workspaceRootPath,
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

  useMenuActions(appActionCtx);

  const coverImagePath =
    parsedFrontmatter.coverImage != null && parsedFrontmatter.coverImage !== ""
      ? String(parsedFrontmatter.coverImage)
      : undefined;

  /** Resolve a blocked save. "discard" (offered when the file vanished) also
   *  closes it the way an in-app delete would — tab, recents and all. */
  async function handleResolveConflict(resolution: ConflictResolution) {
    const path = selectedFile?.path;
    await resolveConflict(resolution);
    if (resolution === "discard" && path) await forgetRemovedPath(path);
  }

  async function handlePublishAwareFieldChange(path: string, key: string, value: unknown) {
    await handleFieldChange(path, key, value as Parameters<typeof handleFieldChange>[2]);
    if (key === "draft" && value === false && isGitRepo && path === selectedFile?.path) {
      try {
        const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
        await openCommitDialog(t("commit_dialog.default_publish_message", { title }));
      } catch {
        // git unavailable — ignore
      }
    }
  }

  async function handleOpenByPath(
    path: string,
    match?: { lineContent: string; lineNumber: number; query: string }
  ) {
    overlay.close("search");
    // Await the open (which reloads content + frontmatter offset) before
    // publishing the jump, so the editor never consumes it against the
    // outgoing file's state, and an aborted open publishes no jump.
    const opened = await openFileByPath(path);
    if (match && opened) setSearchJump({ path, ...match, gen: ++searchJumpGenRef.current });
  }

  function handleSelectFromTab(path: string) {
    setFileViewerNode(null);
    void openByPath(path);
  }

  function handleCloseTab(path: string) {
    // Closing the active tab must save/switch first and drop the tab only on
    // success — closeActive owns that ordering (peek neighbour → transition →
    // remove tab). A non-active tab has no outgoing save to protect, so remove
    // it directly.
    if (selectedFile?.path === path) {
      void closeActive();
      return;
    }
    closeTab(path);
  }

  return (
    <div
      className="app"
      data-zen={zenMode ? "true" : undefined}
      data-platform={isMac ? "darwin" : undefined}
    >
      <div className="app-body">
        <ErrorBoundary
          variant="panel"
          title={t("errors.sidebar_failed")}
          resetKey={workspaceRootPath ?? undefined}
        >
          {overlay.is("search") ? (
            <Suspense fallback={null}>
              <SearchPanel onOpenFile={handleOpenByPath} onClose={() => overlay.close("search")} />
            </Suspense>
          ) : (
            <Sidebar
              tree={sidebarTree}
              workspaceKey={workspaceRootPath}
              selectedPath={fileViewerNode?.path ?? selectedFile?.path ?? null}
              visible={panelLayout.sidebarVisible}
              maxWidth={panelLayout.sidebarMaxWidth}
              workspaceName={workspaceName}
              gitStatusMap={gitStatusMap}
              mode={sidebarMode}
              postsBasePath={postsBasePath}
              features={features}
              collectionLinks={collectionLinks}
              onToggleMode={sidebarHandlers.onToggleMode}
              onToggleVisible={panelLayout.toggleSidebar}
              onSelect={sidebarHandlers.onSelect}
              onOpenWorkspace={handleOpenWorkspace}
              onOpenSwitcher={sidebarHandlers.onOpenSwitcher}
              onNewFile={sidebarHandlers.onNewFile}
              onNewTodayFlow={handleNewTodayFlow}
              onAddToCollection={handleAddToCollection}
              onRemoveFromCollection={handleRemoveFromCollection}
              onRename={sidebarHandlers.onRename}
              onDuplicate={sidebarHandlers.onDuplicate}
              onNewFromExisting={sidebarHandlers.onNewFromExisting}
              onDelete={sidebarHandlers.onDelete}
            />
          )}
        </ErrorBoundary>
        <EditorPane
          workspaceRoot={workspaceRoot}
          tabs={tabs}
          tree={tree}
          saveStatus={saveStatus}
          selectedFile={selectedFile}
          onSelectFromTab={handleSelectFromTab}
          onCloseTab={handleCloseTab}
          onReorderTabs={reorderTabs}
          sidebarVisible={panelLayout.sidebarVisible}
          onExpandSidebar={panelLayout.showSidebar}
          coverImageVisible={coverImageVisible}
          coverImagePath={coverImagePath}
          assetRoot={assetRoot}
          cdnBase={cdnBase}
          fileViewerNode={fileViewerNode}
          onCloseFileViewer={() => setFileViewerNode(null)}
          editorDocument={editorDocument}
          onEditorRetry={remountEditor}
          typewriterMode={typewriterMode}
          spellCheck={prefs.spellCheck}
          parsedFrontmatter={parsedFrontmatter}
          frontmatterError={frontmatterError}
          onFieldChange={handlePublishAwareFieldChange}
          onWordCount={handleWordCount}
          onDirty={handleEditorDirty}
          onChange={handleEditorChange}
          onError={showError}
          currentEditorViewState={currentEditorViewState}
          onEditorViewStateChange={handleEditorViewStateChange}
          registerPendingFlush={registerEditorFlush}
          resolveWikiTarget={resolveWikiTargetCallback}
          onOpenWikiTarget={onOpenWikiTarget}
          flatFiles={flatFiles}
          noteResolverIndex={noteResolverIndex}
          currentRelativePath={
            selectedFile && workspaceRoot && selectedFile.path.startsWith(`${workspaceRoot}/`)
              ? selectedFile.path.slice(workspaceRoot.length + 1)
              : null
          }
          onOpenSource={openFileByPath}
          searchJump={searchJump}
          frontmatterLineOffset={frontmatterLineOffset}
          onSearchJumpHandled={handleSearchJumpHandled}
          recentFiles={recentFiles}
          onOpenWorkspace={handleOpenWorkspace}
          onOpenRecent={handleOpenByPath}
          propertiesOpen={panelLayout.propertiesOpen}
          propertiesDrawer={panelLayout.propertiesDrawer}
          onToggleProperties={panelLayout.toggleProperties}
          onDismissPropertiesDrawer={panelLayout.dismissPropertiesDrawer}
          onToggleCoverImage={toggleCoverImage}
        />
      </div>
      <ErrorBoundary variant="bar" title={t("errors.status_bar_failed")}>
        <StatusBar
          fileLabel={selectedFile ? getPathDisplayLabel(selectedFile) : null}
          writingStats={writingStats}
          filePath={selectedFile?.path ?? null}
          resolvedTheme={resolvedTheme}
          saveStatus={saveStatus}
          zenMode={zenMode}
          typewriterMode={typewriterMode}
          wordCountGoal={wordCountGoal}
          fontFamily={prefs.fontFamily}
          fontSize={prefs.fontSize}
          spellCheck={prefs.spellCheck}
          gitBranch={isGitRepo ? currentBranch : null}
          gitBranchTitle={isGitRepo ? getGitBranchTitle(currentBranch, remoteInfo, t) : undefined}
          gitSyncLabel={gitSyncLabel}
          gitActionInFlight={gitActionInFlight}
          gitSyncTitle={gitSyncPopover?.description}
          gitChangeLabel={gitChangeSummary?.label}
          gitChangeTitle={gitChangeSummary?.title}
          gitSyncPopoverOpen={overlay.is("gitSyncPopover")}
          notificationsCount={notifications.length}
          notificationsUnread={unread}
          notificationsOpen={overlay.is("notifications")}
          onOpenNotifications={() => {
            if (overlay.is("notifications")) {
              overlay.close("notifications");
            } else {
              markNotificationsRead();
              overlay.open({ kind: "notifications" });
            }
          }}
          onOpenBranches={() => void openBranchSwitcher()}
          onRenamePath={
            selectedFile && !selectedFile.isDirectory
              ? () =>
                  overlay.open({
                    kind: "modal",
                    state: { type: "rename-path", node: selectedFile },
                  })
              : undefined
          }
          onOpenCommit={() => void openCommitDialog(t("commit_dialog.default_update_message"))}
          onOpenGitSync={toggleGitSyncPopover}
          onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
          onToggleZen={() => setZenMode((v) => !v)}
          onToggleTypewriter={() => setTypewriterMode((v) => !v)}
          onSetFontFamily={(f) => updatePrefs({ fontFamily: f })}
          onSetFontSize={(s) => updatePrefs({ fontSize: s })}
          onToggleSpellCheck={() => updatePrefs({ spellCheck: !prefs.spellCheck })}
          onSetWordCountGoal={setWordCountGoal}
          onOpenPreferences={() => overlay.open({ kind: "preferences" })}
        />
      </ErrorBoundary>
      {/* A crashed dialog shows a small card; closing it closes the overlay. */}
      <ErrorBoundary
        variant="floating"
        title={t("errors.dialog_failed")}
        resetKey={overlay.active?.kind}
        onReset={() => overlay.close()}
      >
        <AppDialogs
          overlay={overlay}
          notifications={notifications}
          clearNotifications={clearNotifications}
          flushPendingSave={flushPendingSave}
          git={{ gitUi, currentBranch, handlePush }}
          workspace={{
            recentWorkspaces,
            workspaceRootPath,
            openWorkspaceAtPath,
            handleOpenWorkspace,
            removeRecentWorkspace,
            handleCreateAmytisWorkspace,
            handleCloneWorkspace,
            showToast,
          }}
          files={{
            handleNewFile,
            handleDuplicate,
            handleNewFromExisting,
            handleRename,
            handleDelete,
            collectionCandidatesFor,
            onAddCollectionItem: handleAddCollectionItem,
            flatFiles,
            recentFiles,
            openFileByPath,
          }}
          wechat={{
            selectedFile,
            parsedFrontmatter,
            workspaceRootPath,
            defaultAuthor: defaultAuthor ?? null,
            pendingMarkdownRef,
            lastSavedContentRef,
            fileContent: editorDocument.body,
            authors,
            assetRoot,
            // Bound to the file being published when this render's closure is
            // captured by the dialog's publish call, so the media id is recorded
            // on that file even if the user moves on before it finishes.
            onSuccess: (mediaId) => {
              if (selectedFile) void handleFieldChange(selectedFile.path, "wechatMediaId", mediaId);
            },
          }}
          preferences={{
            themePreference,
            setThemePreference: setPreference,
            editorPrefs: prefs,
            updateEditorPrefs: updatePrefs,
            wordCountGoal,
            setWordCountGoal,
            contentPrefs,
            updateContentPrefs,
            appPrefs,
            updateAppPrefs,
            showToast,
          }}
          conflict={{
            fileName: selectedFile?.name ?? "",
            resolveConflict: handleResolveConflict,
          }}
        />
      </ErrorBoundary>
      {/* Outside the dialog boundary: a crashed dialog must not hide toasts. */}
      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onPause={pauseToast}
        onResume={resumeToast}
      />
    </div>
  );
}

export default App;
