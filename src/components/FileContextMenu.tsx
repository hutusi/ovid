import { useEffect, useRef } from "react";
import type { FileNode } from "../lib/types";
import "./FileContextMenu.css";

interface FileContextMenuProps {
  node: FileNode | null;
  position: { x: number; y: number } | null;
  onNewFile?: (dirPath: string) => void;
  onRename?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
  onClose: () => void;
}

export function FileContextMenu({
  node,
  position,
  onNewFile,
  onRename,
  onDelete,
  onClose,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [position, onClose]);

  if (!node || !position) return null;

  return (
    <div
      ref={menuRef}
      className="file-context-menu"
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
    >
      {node.isDirectory && onNewFile && (
        <>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              onNewFile(node.path);
              onClose();
            }}
          >
            New file here
          </button>
          <div className="context-menu-divider" />
        </>
      )}
      {onRename && (
        <button
          type="button"
          className="context-menu-item"
          onClick={() => {
            onRename(node);
            onClose();
          }}
        >
          Rename <span className="context-menu-shortcut">F2</span>
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="context-menu-item context-menu-item-danger"
          onClick={() => {
            onDelete(node);
            onClose();
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
