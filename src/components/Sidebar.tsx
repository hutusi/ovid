import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { BookOpen, FileImage, Files, FileText, Folder, FolderOpen, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isPerfLoggingEnabled, logPerf, measureSync } from "../lib/perf";
import {
  buildExpandedStorageKey,
  findAncestorPaths,
  findExpandedUnloadedPaths,
  forceExpandAncestors,
  getNodeExpanded,
  parseExpandedPaths,
  shouldDefaultExpand,
} from "../lib/sidebarExpansion";
import {
  collapseIndexNodes,
  filterNoiseDirs,
  filterTree,
  getSidebarDisplayName,
  needsPageDivider,
  rollupGitStatus,
  sortTree,
  sortTreeAlpha,
} from "../lib/sidebarUtils";
import type { FileNode, GitStatus } from "../lib/types";
import { ContentTypeIcon } from "./ContentTypeIcon";
import "./Sidebar.css";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);

export type SidebarMode = "content" | "files";

interface SidebarProps {
  tree: FileNode[];
  workspaceKey?: string | null;
  selectedPath: string | null;
  visible: boolean;
  workspaceName: string | null;
  gitStatusMap: Map<string, GitStatus>;
  mode: SidebarMode;
  onToggleMode: () => void;
  onSelect: (node: FileNode) => void;
  onOpenWorkspace: () => void;
  onOpenSwitcher: () => void;
  onNewFile: (dirPath: string) => void;
  onLoadDirectoryChildren: (dirPath: string) => void;
  onRename: (node: FileNode) => void;
  onDuplicate: (node: FileNode) => void;
  onNewFromExisting: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  isExpanded: (node: FileNode, depth: number) => boolean;
  onToggleExpand: (path: string, depth: number) => void;
  selectedPath: string | null;
  gitStatusMap: Map<string, GitStatus>;
  forceExpand?: boolean;
  filesMode: boolean;
  onSelect: (node: FileNode) => void;
  onNewFile: (dirPath: string) => void;
  onLoadDirectoryChildren: (dirPath: string) => void;
  onRename: (node: FileNode) => void;
  onDuplicate: (node: FileNode) => void;
  onNewFromExisting: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
}

function FileItem({
  node,
  depth,
  isExpanded,
  onToggleExpand,
  selectedPath,
  gitStatusMap,
  forceExpand = false,
  filesMode,
  onSelect,
  onNewFile,
  onLoadDirectoryChildren,
  onRename,
  onDuplicate,
  onNewFromExisting,
  onDelete,
}: FileItemProps) {
  const { t } = useTranslation();
  const expanded = forceExpand || isExpanded(node, depth);
  const isSelected = node.path === selectedPath;
  const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
  const indent = `${12 + depth * 14}px`;

  async function showDirContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({
          text: t("sidebar.new_file_here"),
          action: () => onNewFile(node.path),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await MenuItem.new({ text: t("sidebar.rename"), action: () => onRename(node) }),
        await MenuItem.new({ text: t("sidebar.delete"), action: () => onDelete(node) }),
      ],
    });
    await menu.popup();
  }

  if (node.isDirectory) {
    const DirIcon = expanded ? FolderOpen : Folder;
    const dirRollup = !expanded ? rollupGitStatus(node, gitStatusMap) : undefined;
    return (
      <div>
        <div
          role="none"
          className="sidebar-dir-row"
          style={{ paddingLeft: indent }}
          onContextMenu={(e) => {
            e.preventDefault();
            showDirContextMenu();
          }}
        >
          <button
            type="button"
            className="sidebar-dir"
            aria-expanded={expanded}
            onClick={() => onToggleExpand(node.path, depth)}
          >
            <DirIcon size={13} className="sidebar-file-icon sidebar-dir-icon" />
            {node.name}
            {dirRollup && (
              <span
                className={`git-dot git-dot-${dirRollup}`}
                title={t("sidebar.changes_inside", { status: dirRollup })}
              />
            )}
          </button>
        </div>
        {expanded &&
          (node.children ?? []).map((child, idx, sorted) => (
            <Fragment key={child.path}>
              {!filesMode && needsPageDivider(sorted, idx) && (
                <div className="sidebar-section-divider" />
              )}
              <FileItem
                node={child}
                depth={depth + 1}
                isExpanded={isExpanded}
                onToggleExpand={onToggleExpand}
                selectedPath={selectedPath}
                gitStatusMap={gitStatusMap}
                forceExpand={forceExpand}
                filesMode={filesMode}
                onSelect={onSelect}
                onNewFile={onNewFile}
                onLoadDirectoryChildren={onLoadDirectoryChildren}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onNewFromExisting={onNewFromExisting}
                onDelete={onDelete}
              />
            </Fragment>
          ))}
      </div>
    );
  }

  if (!isMarkdown && !filesMode) return null;

  const ext = (node.extension?.replace(".", "") ?? node.name.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const displayName = !filesMode && isMarkdown ? getSidebarDisplayName(node) : node.name;
  const gitStatus = gitStatusMap.get(node.path);

  async function showMarkdownContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({ text: t("sidebar.make_copy"), action: () => onDuplicate(node) }),
        await MenuItem.new({
          text: t("sidebar.new_from_existing"),
          action: () => onNewFromExisting(node),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await MenuItem.new({ text: t("sidebar.rename"), action: () => onRename(node) }),
        await MenuItem.new({ text: t("sidebar.delete"), action: () => onDelete(node) }),
      ],
    });
    await menu.popup();
  }

  async function showNonMarkdownContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({ text: t("sidebar.rename"), action: () => onRename(node) }),
        await MenuItem.new({ text: t("sidebar.delete"), action: () => onDelete(node) }),
      ],
    });
    await menu.popup();
  }

  return (
    <div
      role="none"
      className={`sidebar-file-row ${isSelected ? "selected" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        if (isMarkdown) showMarkdownContextMenu();
        else showNonMarkdownContextMenu();
      }}
    >
      <button
        type="button"
        className="sidebar-file"
        style={{ paddingLeft: indent }}
        onClick={() => onSelect(node)}
        onKeyDown={(e) => {
          if (e.key === "F2") onRename(node);
        }}
      >
        <span className="sidebar-file-icon-wrap">
          {isMarkdown ? (
            <ContentTypeIcon type={node.contentType} className="sidebar-file-icon" />
          ) : isImage ? (
            <FileImage size={13} className="sidebar-file-icon sidebar-file-icon-generic" />
          ) : (
            <FileText size={13} className="sidebar-file-icon sidebar-file-icon-generic" />
          )}
          {node.containerDirPath && <span className="sidebar-file-icon-badge" />}
        </span>
        <span className={node.draft ? "sidebar-file-name draft" : "sidebar-file-name"}>
          {displayName}
        </span>
        {gitStatus && <span className={`git-dot git-dot-${gitStatus}`} title={gitStatus} />}
      </button>
    </div>
  );
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
  workspaceName,
  gitStatusMap,
  mode,
  onToggleMode,
  onSelect,
  onOpenWorkspace,
  onOpenSwitcher,
  onNewFile,
  onLoadDirectoryChildren,
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
  const expandedStorageKey = useMemo(() => buildExpandedStorageKey(workspaceKey), [workspaceKey]);
  const expandedStorageKeyRef = useRef(expandedStorageKey);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [isExpandedStateLoaded, setIsExpandedStateLoaded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = stored ? Number(stored) : SIDEBAR_DEFAULT;
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT;
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parsed));
  });
  const [isResizing, setIsResizing] = useState(false);
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

  const selectedAncestorPaths = useMemo(
    () =>
      measureSync("sidebar.findAncestorPaths", () => findAncestorPaths(tree, selectedPath), {
        treeNodes: tree.length,
        hasSelection: Boolean(selectedPath),
      }),
    [tree, selectedPath]
  );

  const selectedAncestorKey = useMemo(
    () => [...selectedAncestorPaths].sort().join("\0"),
    [selectedAncestorPaths]
  );

  const renderedNodes = useMemo(
    () =>
      measureSync(
        "sidebar.renderedNodes",
        () => {
          const base = filesMode ? filterNoiseDirs(tree) : collapseIndexNodes(tree);
          const filtered = filterQuery ? filterTree(base, filterQuery) : base;
          return filesMode ? sortTreeAlpha(filtered) : sortTree(filtered);
        },
        {
          treeNodes: tree.length,
          filterLength: filterQuery.length,
        }
      ),
    [filterQuery, tree, filesMode]
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
    expandedStorageKeyRef.current = expandedStorageKey;
    const stored = localStorage.getItem(expandedStorageKey);
    const next = parseExpandedPaths(stored);
    setExpandedPaths(next.expandedPaths);
    setIsExpandedStateLoaded(true);
  }, [expandedStorageKey]);

  useEffect(() => {
    if (!isExpandedStateLoaded) return;
    localStorage.setItem(expandedStorageKeyRef.current, JSON.stringify(expandedPaths));
  }, [expandedPaths, isExpandedStateLoaded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedPath is intentionally included so sibling-file navigation (same ancestorKey, different path) re-triggers ancestor expansion
  useEffect(() => {
    if (!isExpandedStateLoaded) return;
    if (!selectedAncestorKey) return;
    const ancestors = new Set(selectedAncestorKey.split("\0"));
    setExpandedPaths((current) => forceExpandAncestors(current, ancestors));
  }, [selectedPath, selectedAncestorKey, isExpandedStateLoaded]);

  useEffect(() => {
    if (!isExpandedStateLoaded) return;
    const toLoad = findExpandedUnloadedPaths(tree, expandedPaths);
    for (const path of toLoad) onLoadDirectoryChildren(path);
  }, [tree, expandedPaths, isExpandedStateLoaded, onLoadDirectoryChildren]);

  function isNodeExpanded(node: FileNode, depth: number): boolean {
    return getNodeExpanded(node.path, depth, expandedPaths);
  }

  function handleToggleExpand(path: string, depth: number) {
    setExpandedPaths((current) => {
      const next = { ...current };
      next[path] = !(current[path] ?? shouldDefaultExpand(depth));
      return next;
    });
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isMounted.current) return;
      const delta = ev.clientX - dragStartX.current;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidth.current + delta));
      setSidebarWidth(next);
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      activeDragListeners.current = null;
      if (!isMounted.current) return;
      const delta = ev.clientX - dragStartX.current;
      const final = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidth.current + delta));
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(final));
      setIsResizing(false);
    };

    activeDragListeners.current = { onMouseMove, onMouseUp };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className={`sidebar ${visible ? "" : "hidden"}${isResizing ? " resizing" : ""}`}
      style={visible ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : undefined}
    >
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-workspace-name"
          onClick={onOpenSwitcher}
          title={t("sidebar.switch_workspace")}
        >
          {workspaceName ?? t("sidebar.no_workspace_name")}
        </button>
        <div className="sidebar-header-actions">
          <button
            type="button"
            className="sidebar-mode-btn"
            onClick={onToggleMode}
            title={
              filesMode ? t("sidebar.toggle_mode_to_content") : t("sidebar.toggle_mode_to_files")
            }
            aria-label={
              filesMode ? t("sidebar.toggle_mode_to_content") : t("sidebar.toggle_mode_to_files")
            }
            aria-pressed={filesMode}
          >
            {filesMode ? <BookOpen size={13} /> : <Files size={13} />}
          </button>
          <button
            type="button"
            className="sidebar-open-btn"
            onClick={onOpenWorkspace}
            title={t("sidebar.open_workspace")}
            aria-label={t("sidebar.open_workspace")}
          >
            ⊕
          </button>
        </div>
      </div>

      {tree.length > 0 && (
        <div className="sidebar-filter">
          <div className="sidebar-filter-inner">
            <Search size={12} className="sidebar-filter-icon" aria-hidden="true" />
            <input
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
                if (e.key === "Escape") setFilterQuery("");
              }}
            />
            {filterQuery && (
              <button
                type="button"
                className="sidebar-filter-clear"
                aria-label={t("sidebar.clear_filter")}
                onClick={() => setFilterQuery("")}
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
                onSelect={onSelect}
                onNewFile={onNewFile}
                onLoadDirectoryChildren={onLoadDirectoryChildren}
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
        aria-label={t("sidebar.resize")}
        aria-valuenow={sidebarWidth}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        tabIndex={0}
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = e.shiftKey ? 24 : 12;
          const delta = e.key === "ArrowRight" ? step : -step;
          const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarWidth + delta));
          setSidebarWidth(next);
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
        }}
      />
    </div>
  );
}
