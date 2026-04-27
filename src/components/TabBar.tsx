import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findNodeByPath } from "../lib/appRestore";
import { getSidebarDisplayName } from "../lib/sidebarUtils";
import type { FileNode, SaveStatus } from "../lib/types";
import "./TabBar.css";

interface TabBarProps {
  tabs: string[];
  tree: FileNode[];
  activePath: string | null;
  saveStatus: SaveStatus;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function nodeForPath(tree: FileNode[], path: string): FileNode {
  const found = findNodeByPath(tree, path);
  if (found) return found;
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() ?? path;
  return { name, path, isDirectory: false };
}

export function TabBar({
  tabs,
  tree,
  activePath,
  saveStatus,
  onSelect,
  onClose,
  onReorder,
}: TabBarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activePath is the intended trigger for scrolling into view
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activePath]);

  return (
    <div className="tab-bar" role="toolbar" aria-label="Open files">
      {tabs.map((path, index) => {
        const node = nodeForPath(tree, path);
        const label = getSidebarDisplayName(node);
        const isActive = path === activePath;
        const isDragging = dragIndex === index;
        const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
        const showUnsaved = isActive && saveStatus === "unsaved";
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: drag wrapper; keyboard-accessible actions live on the inner buttons
          <div
            key={path}
            ref={isActive ? activeTabRef : undefined}
            className={[
              "tab-bar-item",
              isActive ? "is-active" : "",
              isDragging ? "is-dragging" : "",
              isDropTarget ? "is-drop-target" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            draggable
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", path);
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropIndex !== index) setDropIndex(index);
            }}
            onDragLeave={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && e.currentTarget.contains(next)) return;
              if (dropIndex === index) setDropIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== index) {
                onReorder(dragIndex, index);
              }
              setDragIndex(null);
              setDropIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDropIndex(null);
            }}
          >
            <button
              type="button"
              className="tab-bar-label"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(path)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(path);
                }
              }}
              title={path}
            >
              <span
                className={`save-dot ${showUnsaved ? "unsaved" : "saved"} tab-bar-dot`}
                aria-hidden="true"
              />
              <span className="tab-bar-label-text">{label}</span>
            </button>
            <button
              type="button"
              className="tab-bar-close"
              aria-label={`Close ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
