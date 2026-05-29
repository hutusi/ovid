import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppDialogs } from "./components/AppDialogs";
import type { EditorViewState } from "./components/EditorPane";
import { EditorPane } from "./components/EditorPane";
import { getFileViewKind } from "./components/FileViewer";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { loadLastRecentFilePath } from "./lib/appRestore";
import { collectionCandidates } from "./lib/collection";
import { parseFrontmatter } from "./lib/frontmatter";
import { getGitBranchTitle } from "./lib/gitUi";
import { getPathDisplayLabel } from "./lib/postPath";
import { forContentMode, forFilesMode, getDirIndexEntry } from "./lib/sidebarUtils";
import type { CollectionItem, FileNode } from "./lib/types";
import { useAppPreferences } from "./lib/useAppPreferences";
import { useCollectionLinks } from "./lib/useCollectionLinks";
import { useContentPreferences } from "./lib/useContentPreferences";
import { useEditorPreferences } from "./lib/useEditorPreferences";
import { useFileEditor } from "./lib/useFileEditor";
import { useFilesMode } from "./lib/useFilesMode";
import { useGit } from "./lib/useGit";
import { useGitFocusFetch } from "./lib/useGitFocusFetch";
import { useGitRefreshOnSave } from "./lib/useGitRefreshOnSave";
import { useGitUiController } from "./lib/useGitUiController";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { useMenuActions } from "./lib/useMenuActions";
import { useOverlayStack } from "./lib/useOverlayStack";
import { useRecentWorkspaces } from "./lib/useRecentWorkspaces";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWordCountGoal } from "./lib/useWordCountGoal";
import { useWorkspaceRevisionPoll } from "./lib/useWorkspaceRevisionPoll";
import { useWorkspaceSession } from "./lib/useWorkspaceSession";
import { countLocalImages, extractExcerpt, hasMathBlocks } from "./lib/wechatHtml";
import "./styles/global.css";
import "./App.css";

const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";

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
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [baselineCaptured, setBaselineCaptured] = useState(false);
  const overlay = useOverlayStack();
  const [coverImageVisible, setCoverImageVisible] = useState(false);
  const pendingAutoOpenPath = useRef<string | null>(null);
  const editorViewStateRef = useRef<Record<string, EditorViewState>>({});

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
    assetRoot,
    cdnBase,
    defaultAuthor,
    postsBasePath,
    features,
    authors,
    i18n: i18nConfig,
    handleOpenWorkspace,
    openWorkspaceAtPath,
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
  } = useWorkspaceSession({
    showToast,
    flushPendingSave,
    resetFileState,
    contentPrefs,
    fileEditor: {
      selectedFile,
      selectedPathRef,
      setSelectedFile,
      handleSelectFile,
      handleCloseFile,
    },
  });

  const { sidebarMode, fileViewerNode, setFileViewerNode, handleToggleSidebarMode } = useFilesMode({
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
  const { links: collectionLinks, reload: reloadCollectionLinks } = useCollectionLinks({
    tree,
    flatFiles,
    contentRoot: workspaceRoot,
    postsBasePath,
  });

  const handleAddToCollection = useCallback(
    (collectionDir: FileNode) => {
      const index = getDirIndexEntry(collectionDir);
      if (!index) return;
      const existing: CollectionItem[] = (collectionLinks.get(collectionDir.path) ?? []).map(
        (link) => (link.kind === "series" ? { series: link.slug } : { post: link.slug })
      );
      overlay.open({
        kind: "modal",
        state: { type: "add-to-collection", indexPath: index.path, existing },
      });
    },
    [collectionLinks, overlay]
  );

  const handleRemoveFromCollection = useCallback(
    async (indexPath: string, key: string) => {
      await removeCollectionItem(indexPath, key);
      reloadCollectionLinks();
    },
    [removeCollectionItem, reloadCollectionLinks]
  );

  const collectionCandidatesFor = useCallback(
    (existing: CollectionItem[], selfIndexPath: string) =>
      collectionCandidates(
        flatFiles,
        { contentRoot: workspaceRoot ?? "", postsBasePath },
        existing,
        selfIndexPath
      ),
    [flatFiles, workspaceRoot, postsBasePath]
  );

  const handleAddCollectionItem = useCallback(
    async (indexPath: string, item: CollectionItem) => {
      await addCollectionItem(indexPath, item);
      reloadCollectionLinks();
    },
    [addCollectionItem, reloadCollectionLinks]
  );

  // openByPath / openFile / closeActive live inside useEditorSession; here we
  // only have to clear the FileViewer (a separate, files-mode UI concern) and
  // delegate. Two-line wrappers rather than re-implementing the orchestration.
  const openFileByPath = useCallback(
    (path: string) => {
      setFileViewerNode(null);
      void openByPath(path);
    },
    [openByPath, setFileViewerNode]
  );

  function handleSidebarSelect(node: FileNode) {
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
    void handleCloseFile();
    setFileViewerNode(node);
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
  const autoReopenAttempted = useRef(false);
  useEffect(() => {
    if (
      autoReopenAttempted.current ||
      workspaceRootPath !== null ||
      recentWorkspaces.length === 0 ||
      !appPrefs.restoreLastSession
    )
      return;
    autoReopenAttempted.current = true;
    pendingAutoOpenPath.current = loadLastRecentFilePath(
      recentWorkspaces[0].rootPath,
      localStorage
    );
    void openWorkspaceAtPath(recentWorkspaces[0].rootPath);
  }, [recentWorkspaces, openWorkspaceAtPath, workspaceRootPath, appPrefs.restoreLastSession]);

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
    overlay,
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
    setSidebarVisible,
    setPropertiesOpen,
    setZenMode,
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
    overlay,
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
    setSidebarVisible,
    setPropertiesOpen,
    setZenMode,
    setTypewriterMode,
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
  // Source priority: in-flight edit → most recent on-disk content → initial
  // load. fileContent is only updated when the editor mounts a new file, so
  // after an auto-save fires it goes stale; lastSavedContentRef tracks every
  // successful write and is the right fallback once any save has happened.
  // Nullish (not truthy) check so an empty saved file is honoured rather
  // than falling through to fileContent.
  const wechatBody =
    pendingMarkdownRef.current ?? parseFrontmatter(lastSavedContentRef.current ?? fileContent).body;
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
    overlay.close("search");
  }

  function handleSelectFromTab(path: string) {
    setFileViewerNode(null);
    void openByPath(path);
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
        {overlay.is("search") ? (
          <Suspense fallback={null}>
            <SearchPanel onOpenFile={handleOpenByPath} onClose={() => overlay.close("search")} />
          </Suspense>
        ) : (
          <Sidebar
            tree={sidebarTree}
            workspaceKey={workspaceRootPath}
            selectedPath={fileViewerNode?.path ?? selectedFile?.path ?? null}
            visible={sidebarVisible}
            workspaceName={workspaceName}
            gitStatusMap={gitStatusMap}
            mode={sidebarMode}
            postsBasePath={postsBasePath}
            features={features}
            collectionLinks={collectionLinks}
            onToggleMode={handleToggleSidebarMode}
            onSelect={handleSidebarSelect}
            onOpenWorkspace={handleOpenWorkspace}
            onOpenSwitcher={() => overlay.open({ kind: "workspaceSwitcher" })}
            onNewFile={(dirPath, kind) =>
              overlay.open({ kind: "modal", state: { type: "new-file", dirPath, kind } })
            }
            onNewTodayFlow={handleNewTodayFlow}
            onAddToCollection={handleAddToCollection}
            onRemoveFromCollection={handleRemoveFromCollection}
            onRename={(node) =>
              overlay.open({ kind: "modal", state: { type: "rename-path", node } })
            }
            onDuplicate={(node) =>
              overlay.open({ kind: "modal", state: { type: "duplicate-file", node } })
            }
            onNewFromExisting={(node) =>
              overlay.open({ kind: "modal", state: { type: "new-from-existing", node } })
            }
            onDelete={handleDelete}
          />
        )}
        <EditorPane
          workspaceRootPath={workspaceRootPath}
          workspaceRoot={workspaceRoot}
          tabs={tabs}
          tree={tree}
          saveStatus={saveStatus}
          selectedFile={selectedFile}
          onSelectFromTab={handleSelectFromTab}
          onCloseTab={handleCloseTab}
          onReorderTabs={reorderTabs}
          coverImageVisible={coverImageVisible}
          coverImagePath={coverImagePath}
          assetRoot={assetRoot}
          cdnBase={cdnBase}
          fileViewerNode={fileViewerNode}
          onCloseFileViewer={() => setFileViewerNode(null)}
          fileContent={fileContent}
          typewriterMode={typewriterMode}
          spellCheck={prefs.spellCheck}
          parsedFrontmatter={parsedFrontmatter}
          onFieldChange={handlePublishAwareFieldChange}
          onWordCount={setWordCount}
          onDirty={handleEditorDirty}
          onChange={handleEditorChange}
          onError={showToast}
          currentEditorViewState={currentEditorViewState}
          onEditorViewStateChange={handleEditorViewStateChange}
          registerPendingFlush={registerEditorFlush}
          recentFiles={recentFiles}
          onOpenWorkspace={handleOpenWorkspace}
          onOpenRecent={handleOpenByPath}
          propertiesOpen={propertiesOpen}
          onToggleCoverImage={() => setCoverImageVisible((v) => !v)}
        />
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
            ? () =>
                overlay.open({
                  kind: "modal",
                  state: { type: "rename-path", node: selectedFile },
                })
            : undefined
        }
        onOpenCommit={() => void openCommitDialog("Update")}
        onOpenGitSync={() => setGitSyncPopoverOpen(!gitSyncPopoverOpen)}
        onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
        onToggleZen={() => setZenMode((v) => !v)}
        onToggleTypewriter={() => setTypewriterMode((v) => !v)}
        onSetFontFamily={(f) => updatePrefs({ fontFamily: f })}
        onSetFontSize={(s) => updatePrefs({ fontSize: s })}
        onToggleSpellCheck={() => updatePrefs({ spellCheck: !prefs.spellCheck })}
        onSetWordCountGoal={setWordCountGoal}
      />
      <AppDialogs
        overlay={overlay}
        toasts={toasts}
        gitSyncPopoverOpen={gitSyncPopoverOpen}
        gitSyncPopover={gitSyncPopover}
        setGitSyncPopoverOpen={setGitSyncPopoverOpen}
        handleGitSyncAction={handleGitSyncAction}
        recentWorkspaces={recentWorkspaces}
        workspaceRootPath={workspaceRootPath}
        openWorkspaceAtPath={openWorkspaceAtPath}
        handleOpenWorkspace={handleOpenWorkspace}
        flushPendingSave={flushPendingSave}
        selectedFile={selectedFile}
        wechatTitle={wechatTitle}
        wechatAuthor={wechatAuthor}
        authors={authors}
        wechatDigest={wechatDigest}
        wechatHasMath={wechatHasMath}
        wechatImageCount={wechatImageCount}
        wechatMarkdown={wechatMarkdown}
        wechatBaseDir={wechatBaseDir}
        assetRoot={assetRoot}
        wechatCoverImagePath={wechatCoverImagePath}
        wechatMediaId={wechatMediaId}
        onWechatSuccess={(mediaId) => {
          void handleFieldChange("wechatMediaId", mediaId);
        }}
        handleNewFile={handleNewFile}
        handleDuplicate={handleDuplicate}
        handleNewFromExisting={handleNewFromExisting}
        handleRename={handleRename}
        collectionCandidatesFor={collectionCandidatesFor}
        onAddCollectionItem={handleAddCollectionItem}
        flatFiles={flatFiles}
        recentFiles={recentFiles}
        openFileByPath={openFileByPath}
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
        themePreference={themePreference}
        setThemePreference={setPreference}
        editorPrefs={prefs}
        updateEditorPrefs={updatePrefs}
        wordCountGoal={wordCountGoal}
        setWordCountGoal={setWordCountGoal}
        contentPrefs={contentPrefs}
        updateContentPrefs={updateContentPrefs}
        appPrefs={appPrefs}
        updateAppPrefs={updateAppPrefs}
      />
    </div>
  );
}

export default App;
