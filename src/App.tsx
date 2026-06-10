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
import { commands } from "./lib/commands";
import { getGitBranchTitle } from "./lib/gitUi";
import { isMac } from "./lib/platform";
import { getPathDisplayLabel } from "./lib/postPath";
import { forContentMode, forFilesMode, getDirIndexEntry } from "./lib/sidebarUtils";
import type { CollectionItem, FileNode } from "./lib/types";
import { PROPERTIES_OPEN_KEY, SIDEBAR_VISIBLE_KEY, togglePersisted } from "./lib/uiVisibility";
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
import {
  buildNoteResolverIndex,
  createWikiNote,
  EMPTY_NOTE_RESOLVER_INDEX,
  type NoteResolverIndex,
  type ResolvedWikiTarget,
  resolveWikiTarget,
} from "./lib/wikiLink";
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
  // Keep the native View menu's check-mark in sync with panel visibility so
  // the menu reflects the panel state the way Obsidian / VS Code do.
  useEffect(() => {
    void commands.menu.setChecked({ id: "toggle-sidebar", checked: sidebarVisible });
  }, [sidebarVisible]);
  useEffect(() => {
    void commands.menu.setChecked({ id: "toggle-properties", checked: propertiesOpen });
  }, [propertiesOpen]);
  const [zenMode, setZenMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [baselineCaptured, setBaselineCaptured] = useState(false);
  const overlay = useOverlayStack();
  const [coverImageVisible, setCoverImageVisible] = useState(false);
  const pendingAutoOpenPath = useRef<string | null>(null);
  const editorViewStateRef = useRef<Record<string, EditorViewState>>({});

  const { toasts, showToast, notifications, unread, markNotificationsRead, clearNotifications } =
    useToast();
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

  // Wiki-link resolution index — refreshed asynchronously whenever the
  // workspace's notes-bucket file list changes. Held in a ref so the stable
  // `resolveWikiTargetCallback` always sees the latest snapshot without
  // forcing every wiki link node-view to re-render on each prop change.
  const [noteResolverIndex, setNoteResolverIndex] =
    useState<NoteResolverIndex>(EMPTY_NOTE_RESOLVER_INDEX);
  const noteResolverGenRef = useRef(0);
  const noteResolverIndexRef = useRef(noteResolverIndex);
  useEffect(() => {
    noteResolverIndexRef.current = noteResolverIndex;
  }, [noteResolverIndex]);
  useEffect(() => {
    const gen = ++noteResolverGenRef.current;
    void (async () => {
      const index = await buildNoteResolverIndex(flatFiles, (path) =>
        commands.files.read({ path })
      );
      if (gen === noteResolverGenRef.current) {
        setNoteResolverIndex(index);
      }
    })();
  }, [flatFiles]);

  const resolveWikiTargetCallback = useCallback(
    (target: string): ResolvedWikiTarget => resolveWikiTarget(target, noteResolverIndexRef.current),
    []
  );

  const onOpenWikiTarget = useCallback(
    async (target: string) => {
      if (!workspaceRoot) return;
      const resolved = resolveWikiTarget(target, noteResolverIndexRef.current);
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
          createFile: (path, content) => commands.files.create({ path, content }),
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
          })
        );
      }
    },
    [workspaceRoot, postsBasePath, refreshTree, openByPath, setFileViewerNode, showToast, t]
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
  const { recentWorkspaces, pushRecentWorkspace, removeRecentWorkspace } = useRecentWorkspaces();
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
    <div
      className="app"
      data-zen={zenMode ? "true" : undefined}
      data-platform={isMac ? "darwin" : undefined}
    >
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
            onToggleVisible={() => togglePersisted(setSidebarVisible, SIDEBAR_VISIBLE_KEY)}
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
          sidebarVisible={sidebarVisible}
          onExpandSidebar={() => {
            setSidebarVisible(true);
            localStorage.setItem(SIDEBAR_VISIBLE_KEY, "true");
          }}
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
          recentFiles={recentFiles}
          onOpenWorkspace={handleOpenWorkspace}
          onOpenRecent={handleOpenByPath}
          propertiesOpen={propertiesOpen}
          onToggleProperties={() => togglePersisted(setPropertiesOpen, PROPERTIES_OPEN_KEY)}
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
        onOpenCommit={() => void openCommitDialog("Update")}
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
      <AppDialogs
        overlay={overlay}
        toasts={toasts}
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
          fileContent,
          authors,
          assetRoot,
          onSuccess: (mediaId) => {
            void handleFieldChange("wechatMediaId", mediaId);
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
      />
    </div>
  );
}

export default App;
