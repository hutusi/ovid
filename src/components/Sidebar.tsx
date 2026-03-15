import { Folder, FolderOpen } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { filterTree, needsPageDivider, rollupGitStatus, sortNodes } from "../lib/sidebarUtils";
import type { FileNode, GitStatus } from "../lib/types";
import { ContentTypeIcon } from "./ContentTypeIcon";
import "./Sidebar.css";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { Input } from "./ui/input";

interface SidebarProps {
  tree: FileNode[];
  selectedPath: string | null;
  renamingPath: string | null;
  visible: boolean;
  workspaceName: string | null;
  gitStatusMap: Map<string, GitStatus>;
  onSelect: (node: FileNode) => void;
  onOpenWorkspace: () => void;
  onOpenSwitcher: () => void;
  onNewFile: (dirPath: string) => void;
  onRename: (node: FileNode, newName: string) => void;
  onDelete: (node: FileNode) => void;
  onStartRename: (path: string) => void;
  onCancelRename: () => void;
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  renamingPath: string | null;
  gitStatusMap: Map<string, GitStatus>;
  forceExpand?: boolean;
  onSelect: (node: FileNode) => void;
  onNewFile: (dirPath: string) => void;
  onRename: (node: FileNode, newName: string) => void;
  onDelete: (node: FileNode) => void;
  onStartRename: (path: string) => void;
  onCancelRename: () => void;
}

function FileItem({
  node,
  depth,
  selectedPath,
  renamingPath,
  gitStatusMap,
  forceExpand = false,
  onSelect,
  onNewFile,
  onRename,
  onDelete,
  onStartRename,
  onCancelRename,
}: FileItemProps) {
  const [expanded, setExpanded] = useState(true);
  const isExpanded = forceExpand || expanded;
  const isSelected = node.path === selectedPath;
  const isRenaming = renamingPath === node.path;
  const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
  const baseName = node.name.replace(/\.mdx?$/, "");
  const [renameValue, setRenameValue] = useState(baseName);
  const renameRef = useRef<HTMLInputElement>(null);
  const indent = `${12 + depth * 14}px`;

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(baseName);
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [isRenaming, baseName]);

  if (node.isDirectory) {
    const DirIcon = isExpanded ? FolderOpen : Folder;
    const dirRollup = !isExpanded ? rollupGitStatus(node, gitStatusMap) : undefined;
    return (
      <div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div role="none" className="sidebar-dir-row" style={{ paddingLeft: indent }}>
              <button type="button" className="sidebar-dir" onClick={() => setExpanded((v) => !v)}>
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
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onNewFile(node.path)}>New file here</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onStartRename(node.path)}>
              Rename <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={() => onDelete(node)}
            >
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isExpanded &&
          sortNodes(node.children ?? []).map((child, idx, sorted) => (
            <Fragment key={child.path}>
              {needsPageDivider(sorted, idx) && <div className="sidebar-section-divider" />}
              <FileItem
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                renamingPath={renamingPath}
                gitStatusMap={gitStatusMap}
                forceExpand={forceExpand}
                onSelect={onSelect}
                onNewFile={onNewFile}
                onRename={onRename}
                onDelete={onDelete}
                onStartRename={onStartRename}
                onCancelRename={onCancelRename}
              />
            </Fragment>
          ))}
      </div>
    );
  }

  if (!isMarkdown) return null;

  if (isRenaming) {
    return (
      <div className="sidebar-rename-row" style={{ paddingLeft: indent }}>
        <Input
          ref={renameRef}
          className="h-7 text-[13.5px]"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && renameValue.trim()) {
              onRename(node, renameValue.trim());
            } else if (e.key === "Escape") {
              onCancelRename();
            }
          }}
          onBlur={() => {
            if (renameValue.trim()) onRename(node, renameValue.trim());
            else onCancelRename();
          }}
        />
      </div>
    );
  }

  const displayName = node.title || baseName;
  const gitStatus = gitStatusMap.get(node.path);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div role="none" className={`sidebar-file-row ${isSelected ? "selected" : ""}`}>
          <button
            type="button"
            className="sidebar-file"
            style={{ paddingLeft: indent }}
            onClick={() => onSelect(node)}
            onDoubleClick={() => onStartRename(node.path)}
            onKeyDown={(e) => {
              if (e.key === "F2") onStartRename(node.path);
            }}
          >
            <ContentTypeIcon type={node.contentType} className="sidebar-file-icon" />
            <span className={node.draft ? "sidebar-file-name draft" : "sidebar-file-name"}>
              {displayName}
            </span>
            {gitStatus && <span className={`git-dot git-dot-${gitStatus}`} title={gitStatus} />}
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onStartRename(node.path)}>
          Rename <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onClick={() => onDelete(node)}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const SIDEBAR_WIDTH_KEY = "ovid:sidebarWidth";
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240;

export function Sidebar({
  tree,
  selectedPath,
  renamingPath,
  visible,
  workspaceName,
  gitStatusMap,
  onSelect,
  onOpenWorkspace,
  onOpenSwitcher,
  onNewFile,
  onRename,
  onDelete,
  onStartRename,
  onCancelRename,
}: SidebarProps) {
  const [filterQuery, setFilterQuery] = useState("");
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
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--color-text-faint)] p-0.5 rounded leading-none hover:text-[var(--color-text)]"
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
          sortNodes(filterQuery ? filterTree(tree, filterQuery) : tree).map((node, idx, sorted) => (
            <Fragment key={node.path}>
              {needsPageDivider(sorted, idx) && <div className="sidebar-section-divider" />}
              <FileItem
                node={node}
                depth={0}
                selectedPath={selectedPath}
                renamingPath={renamingPath}
                gitStatusMap={gitStatusMap}
                forceExpand={filterQuery.length > 0}
                onSelect={onSelect}
                onNewFile={onNewFile}
                onRename={onRename}
                onDelete={onDelete}
                onStartRename={onStartRename}
                onCancelRename={onCancelRename}
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
