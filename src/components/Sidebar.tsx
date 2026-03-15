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
  onSelect,
  onNewFile,
  onRename,
  onDelete,
  onStartRename,
  onCancelRename,
}: FileItemProps) {
  const [expanded, setExpanded] = useState(true);
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
    const DirIcon = expanded ? FolderOpen : Folder;
    return (
      <div>
        <div className="sidebar-dir-row" style={{ paddingLeft: indent }}>
          <button type="button" className="sidebar-dir" onClick={() => setExpanded((v) => !v)}>
            <DirIcon size={13} className="sidebar-file-icon sidebar-dir-icon" />
            {node.name}
          </button>
          <button
            type="button"
            className="sidebar-dir-action"
            title="New file here"
            onClick={() => onNewFile(node.path)}
          >
            +
          </button>
        </div>
        {expanded &&
          node.children?.map((child) => (
            <FileItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
              gitStatusMap={gitStatusMap}
              onSelect={onSelect}
              onNewFile={onNewFile}
              onRename={onRename}
              onDelete={onDelete}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
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
    <div className={`sidebar-file-row ${isSelected ? "selected" : ""}`}>
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
      <button
        type="button"
        className="sidebar-delete-btn"
        title="Move to Trash"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node);
        }}
      >
        ✕
      </button>
    </div>
  );
}

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
  return (
    <div className={`sidebar ${visible ? "" : "hidden"}`}>
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

      <div className="sidebar-tree">
        {tree.length === 0 ? (
          <div className="sidebar-empty">
            <p>No workspace open.</p>
            <button type="button" className="sidebar-open-workspace-btn" onClick={onOpenWorkspace}>
              Open folder
            </button>
          </div>
        ) : (
          tree.map((node) => (
            <FileItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
              gitStatusMap={gitStatusMap}
              onSelect={onSelect}
              onNewFile={onNewFile}
              onRename={onRename}
              onDelete={onDelete}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
            />
          ))
        )}
      </div>
    </div>
  );
}
