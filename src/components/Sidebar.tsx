import {
  BookOpen,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Files,
  LibraryBig,
  PanelLeftClose,
  Search,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewContentKind } from "../lib/amytisScaffold";
import type { CollectionLink } from "../lib/collection";
import type { FeatureBucket } from "../lib/commands/generated/FeatureBucket";
import { isPerfLoggingEnabled, logPerf, measureSync } from "../lib/perf";
import {
  clampSidebarWidth,
  filterTree,
  getBucketContentType,
  needsPageDivider,
  nextSidebarWidth,
} from "../lib/sidebarUtils";
import type { FileNode, GitStatus } from "../lib/types";
import { useSidebarExpansion } from "../lib/useSidebarExpansion";
import { FileItem } from "./sidebar/FileItem";
import "./Sidebar.css";

export type SidebarMode = "content" | "files";

interface SidebarProps {
  tree: FileNode[];
  workspaceKey?: string | null;
  selectedPath: string | null;
  visible: boolean;
  maxWidth?: number;
  workspaceName: string | null;
  gitStatusMap: Map<string, GitStatus>;
  mode: SidebarMode;
  /** `posts.basePath` from site.config, so the posts bucket follows the config. */
  postsBasePath?: string;
  /** Content buckets from site.config `features:` — drives bucket visibility
   *  (handled in the projection) and localized bucket labels. */
  features?: FeatureBucket[];
  /** Resolved `items:` links per collection entry, keyed by the collection dir path. */
  collectionLinks?: Map<string, CollectionLink[]>;
  onToggleMode: () => void;
  onToggleVisible: () => void;
  onSelect: (node: FileNode) => void;
  onOpenWorkspace: () => void;
  onOpenSwitcher: () => void;
  onNewFile: (dirPath: string, kind: NewContentKind) => void;
  onNewTodayFlow: () => void;
  onAddToCollection: (collectionDir: FileNode) => void;
  onRemoveFromCollection: (indexPath: string, key: string) => void;
  onRename: (node: FileNode) => void;
  onDuplicate: (node: FileNode) => void;
  onNewFromExisting: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
}

const SIDEBAR_WIDTH_KEY = "ovid:sidebarWidth";
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240;

export function Sidebar({
  tree,
  workspaceKey,
  selectedPath,
  visible,
  maxWidth = SIDEBAR_MAX,
  workspaceName,
  gitStatusMap,
  mode,
  postsBasePath,
  features,
  collectionLinks,
  onToggleMode,
  onToggleVisible,
  onSelect,
  onOpenWorkspace,
  onOpenSwitcher,
  onNewFile,
  onNewTodayFlow,
  onAddToCollection,
  onRemoveFromCollection,
  onRename,
  onDuplicate,
  onNewFromExisting,
  onDelete,
}: SidebarProps) {
  const { t } = useTranslation();
  const filesMode = mode === "files";
  const renderStartedAtRef = useRef(0);
  renderStartedAtRef.current = performance.now();
  const [filterQuery, setFilterQuery] = useState("");
  const [filterExpanded, setFilterExpanded] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  // A top-level Content-mode bucket (`notes/`, `books/`, …) — these rows are
  // collapsed by default so a workspace dominated by one bucket doesn't push
  // the others off-screen. Files mode and nested folders aren't buckets.
  const isBucketRow = useCallback(
    (node: FileNode, depth: number): boolean =>
      depth === 0 &&
      node.isDirectory &&
      !filesMode &&
      !!getBucketContentType(node.name, postsBasePath),
    [filesMode, postsBasePath]
  );
  const {
    isExpanded: isNodeExpanded,
    toggleExpanded: handleToggleExpand,
    setAllBuckets,
  } = useSidebarExpansion({
    workspaceKey,
    tree,
    selectedPath,
    isBucket: isBucketRow,
  });
  // Bucket nodes currently in the tree — used to power the expand-all /
  // collapse-all action. Empty in Files mode or when the projected tree has no
  // recognised buckets (e.g. plain non-Amytis workspaces).
  const bucketNodes = useMemo(
    () => tree.filter((node) => isBucketRow(node, 0)),
    [tree, isBucketRow]
  );
  // The header button collapses everything only when *every* bucket is open;
  // mixed and all-closed states stay on "expand all" so a click never wipes
  // out buckets the user has manually opened. `aria-pressed` then cleanly
  // reads as "all sections currently expanded".
  const allBucketsExpanded = useMemo(
    () => bucketNodes.length > 0 && bucketNodes.every((node) => isNodeExpanded(node, 0)),
    [bucketNodes, isNodeExpanded]
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = stored ? Number(stored) : SIDEBAR_DEFAULT;
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT;
    return clampSidebarWidth(parsed, SIDEBAR_MIN, SIDEBAR_MAX);
  });
  // Transient width while a mouse drag is live — tracks the cursor independently
  // of the persisted preference, so a drag that returns to its start (or a no-op
  // click) renders correctly without clobbering `sidebarWidth`.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const isResizing = dragWidth !== null;
  const effectiveMaxWidth = clampSidebarWidth(maxWidth, SIDEBAR_MIN, SIDEBAR_MAX);
  const displayedWidth = dragWidth ?? Math.min(sidebarWidth, effectiveMaxWidth);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const isMounted = useRef(true);
  const activeDragListeners = useRef<{
    onMouseMove: (ev: MouseEvent) => void;
    onMouseUp: (ev: MouseEvent) => void;
  } | null>(null);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      const listeners = activeDragListeners.current;
      if (listeners) {
        window.removeEventListener("mousemove", listeners.onMouseMove);
        window.removeEventListener("mouseup", listeners.onMouseUp);
        activeDragListeners.current = null;
      }
      isMounted.current = false;
    };
  }, []);

  // The tree prop arrives already projected (forContentMode / forFilesMode
  // applied at the App level), so this layer only needs to apply the search-
  // box query filter. filterTree preserves caller-provided ordering.
  const renderedNodes = useMemo(
    () =>
      measureSync(
        "sidebar.renderedNodes",
        () => (filterQuery ? filterTree(tree, filterQuery) : tree),
        {
          treeNodes: tree.length,
          filterLength: filterQuery.length,
        }
      ),
    [filterQuery, tree]
  );

  useEffect(() => {
    if (!isPerfLoggingEnabled()) return;
    logPerf("sidebar.commit", performance.now() - renderStartedAtRef.current, {
      renderedNodes: renderedNodes.length,
      filterLength: filterQuery.length,
      visible: visible ? 1 : 0,
    });
  }, [renderedNodes.length, filterQuery.length, visible]);

  useEffect(() => {
    if (!filterExpanded) return;
    const id = requestAnimationFrame(() => {
      filterInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [filterExpanded]);

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = displayedWidth;
    setDragWidth(displayedWidth);

    const onMouseMove = (ev: MouseEvent) => {
      if (!isMounted.current) return;
      const delta = ev.clientX - dragStartX.current;
      // Follow the cursor live (incl. back to the start); the persist decision
      // happens only on mouse-up so a return-to-start renders correctly.
      setDragWidth(
        clampSidebarWidth(dragStartWidth.current + delta, SIDEBAR_MIN, effectiveMaxWidth)
      );
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      activeDragListeners.current = null;
      if (!isMounted.current) return;
      const delta = ev.clientX - dragStartX.current;
      // Persist only a real resize. A no-op click, a return-to-start, or an
      // at-cap drag returns null, leaving the stored preferred width (which can
      // exceed the current usable max) untouched.
      const next = nextSidebarWidth(dragStartWidth.current, delta, SIDEBAR_MIN, effectiveMaxWidth);
      if (next !== null) {
        setSidebarWidth(next);
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
      }
      setDragWidth(null);
    };

    activeDragListeners.current = { onMouseMove, onMouseUp };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className={`sidebar ${visible ? "" : "hidden"}${isResizing ? " resizing" : ""}`}
      style={
        visible ? { width: `${displayedWidth}px`, minWidth: `${displayedWidth}px` } : undefined
      }
    >
      <div className="sidebar-header" data-tauri-drag-region="deep">
        <div className="sidebar-header-actions">
          <fieldset className="sidebar-mode-switcher">
            <button
              type="button"
              className="sidebar-mode-btn"
              onClick={() => !filesMode || onToggleMode()}
              title={t("sidebar.mode_content")}
              aria-label={t("sidebar.mode_content")}
              aria-pressed={!filesMode}
            >
              <BookOpen size={13} />
            </button>
            <button
              type="button"
              className="sidebar-mode-btn"
              onClick={() => filesMode || onToggleMode()}
              title={t("sidebar.mode_files")}
              aria-label={t("sidebar.mode_files")}
              aria-pressed={filesMode}
            >
              <Files size={13} />
            </button>
          </fieldset>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleVisible}
            title={t("sidebar.collapse")}
            aria-label={t("sidebar.collapse")}
          >
            <PanelLeftClose size={13} />
          </button>
        </div>
      </div>
      <div className="sidebar-workspace-name-row">
        <button
          type="button"
          className="sidebar-workspace-name"
          onClick={onOpenSwitcher}
          title={t("sidebar.switch_workspace")}
          aria-haspopup="dialog"
        >
          <LibraryBig size={13} className="sidebar-workspace-name-icon" aria-hidden="true" />
          <span className="sidebar-workspace-name-label">
            {workspaceName ?? t("sidebar.no_workspace_name")}
          </span>
          <ChevronDown size={11} className="sidebar-workspace-name-chevron" aria-hidden="true" />
        </button>
        {bucketNodes.length >= 2 && (
          <button
            type="button"
            className="sidebar-buckets-toggle"
            onClick={() =>
              setAllBuckets(
                !allBucketsExpanded,
                bucketNodes.map((node) => node.path)
              )
            }
            title={
              allBucketsExpanded
                ? t("sidebar.collapse_all_buckets")
                : t("sidebar.expand_all_buckets")
            }
            aria-label={
              allBucketsExpanded
                ? t("sidebar.collapse_all_buckets")
                : t("sidebar.expand_all_buckets")
            }
            aria-pressed={allBucketsExpanded}
          >
            {allBucketsExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          </button>
        )}
        {tree.length > 0 && (
          <button
            type="button"
            className="sidebar-filter-toggle"
            onClick={() => {
              if (filterExpanded) {
                setFilterExpanded(false);
                setFilterQuery("");
              } else {
                setFilterExpanded(true);
              }
            }}
            title={t("sidebar.toggle_filter")}
            aria-label={t("sidebar.toggle_filter")}
            aria-expanded={filterExpanded}
            aria-pressed={filterExpanded}
          >
            <Search size={13} />
          </button>
        )}
      </div>

      {tree.length > 0 && (filterExpanded || filterQuery !== "") && (
        <div className="sidebar-filter">
          <div className="sidebar-filter-inner">
            <Search size={12} className="sidebar-filter-icon" aria-hidden="true" />
            <input
              ref={filterInputRef}
              type="text"
              className="sidebar-filter-input"
              aria-label={t("sidebar.filter_label")}
              placeholder={t("sidebar.filter_placeholder")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (filterQuery === "") {
                    setFilterExpanded(false);
                  } else {
                    setFilterQuery("");
                  }
                }
              }}
              onBlur={() => {
                if (filterQuery === "") setFilterExpanded(false);
              }}
            />
            {filterQuery && (
              <button
                type="button"
                className="sidebar-filter-clear"
                aria-label={t("sidebar.clear_filter")}
                onClick={() => {
                  setFilterQuery("");
                  setFilterExpanded(false);
                }}
              >
                <X size={10} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sidebar-tree">
        {tree.length === 0 ? (
          <div className="sidebar-empty">
            <p>{t("sidebar.no_workspace")}</p>
            <button type="button" className="sidebar-open-workspace-btn" onClick={onOpenWorkspace}>
              {t("sidebar.open_folder")}
            </button>
          </div>
        ) : (
          renderedNodes.map((node, idx, sorted) => (
            <Fragment key={node.path}>
              {!filesMode && needsPageDivider(sorted, idx) && (
                <div className="sidebar-section-divider" />
              )}
              <FileItem
                node={node}
                depth={0}
                isExpanded={isNodeExpanded}
                onToggleExpand={handleToggleExpand}
                selectedPath={selectedPath}
                gitStatusMap={gitStatusMap}
                forceExpand={filterQuery.length > 0}
                filesMode={filesMode}
                postsBasePath={postsBasePath}
                features={features}
                collectionLinks={collectionLinks}
                onSelect={onSelect}
                onNewFile={onNewFile}
                onNewTodayFlow={onNewTodayFlow}
                onAddToCollection={onAddToCollection}
                onRemoveFromCollection={onRemoveFromCollection}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onNewFromExisting={onNewFromExisting}
                onDelete={onDelete}
              />
            </Fragment>
          ))
        )}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: resize splitter widget requires div, not <hr> */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resize")}
        aria-valuenow={displayedWidth}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={effectiveMaxWidth}
        tabIndex={0}
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = e.shiftKey ? 24 : 12;
          const delta = e.key === "ArrowRight" ? step : -step;
          // Grow from the rendered width and clamp to the dynamic max. A no-op at
          // the cap returns null so we don't overwrite the stored *preferred*
          // width (which may exceed the current usable max on a narrow window).
          const next = nextSidebarWidth(displayedWidth, delta, SIDEBAR_MIN, effectiveMaxWidth);
          if (next === null) return;
          setSidebarWidth(next);
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
        }}
      />
    </div>
  );
}
