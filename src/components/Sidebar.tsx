import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { Folder, FolderOpen } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { isPerfLoggingEnabled, logPerf, measureSync } from "../lib/perf";
import {
  buildExpandedStorageKey,
  findAncestorPaths,
  getNodeExpanded,
  parseExpandedPaths,
  seedExpandedPaths,
  shouldDefaultExpand,
  shouldRevealSelectedAncestors,
} from "../lib/sidebarExpansion";
import {
  filterTree,
  getSidebarDisplayName,
  needsPageDivider,
  rollupGitStatus,
  sortTree,
} from "../lib/sidebarUtils";
import type { FileNode, GitStatus } from "../lib/types";
import { ContentTypeIcon } from "./ContentTypeIcon";
import "./Sidebar.css";
import { Input } from "./ui/input";

interface SidebarProps {
  tree: FileNode[];
  workspaceKey?: string | null;
  selectedPath: string | null;
  visible: boolean;
  workspaceName: string | null;
  gitStatusMap: Map<string, GitStatus>;
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
  onSelect,
  onNewFile,
  onLoadDirectoryChildren,
  onRename,
  onDuplicate,
  onNewFromExisting,
  onDelete,
}: FileItemProps) {
  const expanded = forceExpand || isExpanded(node, depth);
  const isSelected = node.path === selectedPath;
  const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
  const indent = `${12 + depth * 14}px`;

  async function showDirContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({ text: "New file here", action: () => onNewFile(node.path) }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await MenuItem.new({ text: "Rename", action: () => onRename(node) }),
        await MenuItem.new({ text: "Delete", action: () => onDelete(node) }),
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
            onClick={() => {
              if (!expanded && node.childrenLoaded === false) {
                onLoadDirectoryChildren(node.path);
              }
              onToggleExpand(node.path, depth);
            }}
          >
            <DirIcon size={13} className="sidebar-file-icon sidebar-dir-icon" />
            {node.name}
            {dirRollup && (
              <span
                className={`git-dot git-dot-${dirRollup}`}
                title={`${dirRollup} changes inside`}
              />
            )}
          </button>
        </div>
        {expanded &&
          (node.children ?? []).map((child, idx, sorted) => (
            <Fragment key={child.path}>
              {needsPageDivider(sorted, idx) && <div className="sidebar-section-divider" />}
              <FileItem
                node={child}
                depth={depth + 1}
                isExpanded={isExpanded}
                onToggleExpand={onToggleExpand}
                selectedPath={selectedPath}
                gitStatusMap={gitStatusMap}
                forceExpand={forceExpand}
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

  if (!isMarkdown) return null;

  const displayName = getSidebarDisplayName(node);
  const gitStatus = gitStatusMap.get(node.path);

  async function showFileContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({ text: "Make a Copy", action: () => onDuplicate(node) }),
        await MenuItem.new({ text: "New from Existing", action: () => onNewFromExisting(node) }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await MenuItem.new({ text: "Rename", action: () => onRename(node) }),
        await MenuItem.new({ text: "Delete", action: () => onDelete(node) }),
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
        showFileContextMenu();
      }}
    >
      <button
        type="button"
        className="sidebar-file"
        style={{ paddingLeft: indent }}
        onClick={() => onSelect(node)}
        onDoubleClick={() => onRename(node)}
        onKeyDown={(e) => {
          if (e.key === "F2") onRename(node);
        }}
      >
        <span className="sidebar-file-icon-wrap">
          <ContentTypeIcon type={node.contentType} className="sidebar-file-icon" />
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
  const renderStartedAtRef = useRef(0);
  renderStartedAtRef.current = performance.now();
  const [filterQuery, setFilterQuery] = useState("");
  const expandedStorageKey = useMemo(() => buildExpandedStorageKey(workspaceKey), [workspaceKey]);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [hasStoredExpandedState, setHasStoredExpandedState] = useState(false);
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

  const renderedNodes = useMemo(
    () =>
      measureSync(
        "sidebar.renderedNodes",
        () => sortTree(filterQuery ? filterTree(tree, filterQuery) : tree),
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
    setIsExpandedStateLoaded(false);
    const stored = localStorage.getItem(expandedStorageKey);
    const next = parseExpandedPaths(stored);
    setHasStoredExpandedState(next.hasStoredExpandedState);
    setExpandedPaths(next.expandedPaths);
    setIsExpandedStateLoaded(true);
  }, [expandedStorageKey]);

  useEffect(() => {
    if (!isExpandedStateLoaded) return;
    localStorage.setItem(expandedStorageKey, JSON.stringify(expandedPaths));
  }, [expandedPaths, expandedStorageKey, isExpandedStateLoaded]);

  useEffect(() => {
    if (!isExpandedStateLoaded) return;
    if (selectedAncestorPaths.size === 0) return;
    if (!shouldRevealSelectedAncestors(expandedPaths, hasStoredExpandedState)) return;
    setExpandedPaths((current) => seedExpandedPaths(current, selectedAncestorPaths));
  }, [selectedAncestorPaths, hasStoredExpandedState, expandedPaths, isExpandedStateLoaded]);

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
          title="Switch workspace"
        >
          {workspaceName ?? "No workspace"}
        </button>
        <div className="sidebar-header-actions">
          <button
            type="button"
            className="sidebar-open-btn"
            onClick={onOpenWorkspace}
            title="Open workspace"
          >
            ⊕
          </button>
        </div>
      </div>

      {tree.length > 0 && (
        <div className="sidebar-filter">
          <div className="relative flex-1">
            <Input
              type="text"
              className="h-7 text-[12px] pr-6"
              placeholder="Filter files…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setFilterQuery("");
              }}
            />
            {filterQuery && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-fg-subtle p-0.5 rounded leading-none hover:text-fg"
                aria-label="Clear filter"
                onClick={() => setFilterQuery("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sidebar-tree">
        {tree.length === 0 ? (
          <div className="sidebar-empty">
            <p>No workspace open.</p>
            <button type="button" className="sidebar-open-workspace-btn" onClick={onOpenWorkspace}>
              Open folder
            </button>
          </div>
        ) : (
          renderedNodes.map((node, idx, sorted) => (
            <Fragment key={node.path}>
              {needsPageDivider(sorted, idx) && <div className="sidebar-section-divider" />}
              <FileItem
                node={node}
                depth={0}
                isExpanded={isNodeExpanded}
                onToggleExpand={handleToggleExpand}
                selectedPath={selectedPath}
                gitStatusMap={gitStatusMap}
                forceExpand={filterQuery.length > 0}
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
        aria-label="Resize sidebar"
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
