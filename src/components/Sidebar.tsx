import {
  ArrowLeftRight,
  BookOpen,
  File,
  FileText,
  Folder,
  FolderOpen,
  LayoutTemplate,
  ListOrdered,
  StickyNote,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { filterTree, rollupGitStatus } from "../lib/sidebarUtils";
import { FileContextMenu } from "./FileContextMenu";
import "./Sidebar.css";
import type { FileNode, GitStatus } from "../lib/types";

function ContentTypeIcon({ type }: { type: string | undefined }) {
  const props = { size: 13, className: "sidebar-file-icon" };
  switch (type) {
    case "post":
      return <FileText {...props} />;
    case "flow":
      return <ArrowLeftRight {...props} />;
    case "series":
      return <ListOrdered {...props} />;
    case "book":
      return <BookOpen {...props} />;
    case "page":
      return <LayoutTemplate {...props} />;
    case "note":
      return <StickyNote {...props} />;
    default:
      return <File {...props} />;
  }
}

interface SidebarProps {
  tree: FileNode[];
  selectedPath: string | null;
  renamingPath: string | null;
  visible: boolean;
  workspaceName: string | null;
  workspaceRoot: string | null;
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
  onContextMenu: (node: FileNode, x: number, y: number) => void;
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
  onContextMenu,
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
        <div
          role="none"
          className="sidebar-dir-row"
          style={{ paddingLeft: indent }}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(node, e.clientX, e.clientY);
          }}
        >
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
        {isExpanded &&
          node.children?.map((child) => (
            <FileItem
              key={child.path}
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
              onContextMenu={onContextMenu}
            />
          ))}
      </div>
    );
  }

  if (!isMarkdown) return null;

  if (isRenaming) {
    return (
      <div className="sidebar-rename-row" style={{ paddingLeft: indent }}>
        <input
          ref={renameRef}
          className="sidebar-rename-input"
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
    <div
      role="none"
      className={`sidebar-file-row ${isSelected ? "selected" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node, e.clientX, e.clientY);
      }}
    >
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
        <ContentTypeIcon type={node.contentType} />
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
  selectedPath,
  renamingPath,
  visible,
  workspaceName,
  workspaceRoot,
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
  const [contextMenu, setContextMenu] = useState<{
    node: FileNode;
    x: number;
    y: number;
  } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? Number(stored) : SIDEBAR_DEFAULT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    function onMouseMove(ev: MouseEvent) {
      const delta = ev.clientX - dragStartX.current;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidth.current + delta));
      setSidebarWidth(next);
    }

    function onMouseUp(ev: MouseEvent) {
      const delta = ev.clientX - dragStartX.current;
      const final = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidth.current + delta));
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(final));
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleContextMenu(node: FileNode, x: number, y: number) {
    setContextMenu({ node, x, y });
  }

  function handleContextMenuRename(node: FileNode) {
    onStartRename(node.path);
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
          {workspaceRoot && (
            <button
              type="button"
              className="sidebar-action-btn"
              title="New file (⌘N)"
              onClick={() => onNewFile(workspaceRoot)}
            >
              +
            </button>
          )}
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
          <input
            type="text"
            className="sidebar-filter-input"
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
              className="sidebar-filter-clear"
              aria-label="Clear filter"
              onClick={() => setFilterQuery("")}
            >
              ✕
            </button>
          )}
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
          (filterQuery ? filterTree(tree, filterQuery) : tree).map((node) => (
            <FileItem
              key={node.path}
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
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <FileContextMenu
          node={contextMenu.node}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onNewFile={contextMenu.node.isDirectory ? onNewFile : undefined}
          onRename={handleContextMenuRename}
          onDelete={onDelete}
          onClose={() => setContextMenu(null)}
        />
      )}

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
      />
    </div>
  );
}
