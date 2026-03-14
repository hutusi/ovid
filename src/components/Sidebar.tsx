import { FileNode } from "../lib/types";

interface SidebarProps {
  tree: FileNode[];
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
  onOpenWorkspace: () => void;
  workspaceName: string | null;
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
}

function FileItem({ node, depth, selectedPath, onSelect }: FileItemProps) {
  const isSelected = node.path === selectedPath;
  const isMarkdown = node.extension === ".md" || node.extension === ".mdx";

  if (node.isDirectory) {
    return (
      <div>
        <div
          className="sidebar-dir"
          style={{ paddingLeft: `${12 + depth * 14}px` }}
        >
          <span className="sidebar-icon">▸</span>
          {node.name}
        </div>
        {node.children?.map((child) => (
          <FileItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  if (!isMarkdown) return null;

  return (
    <div
      className={`sidebar-file ${isSelected ? "selected" : ""}`}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      onClick={() => onSelect(node)}
    >
      <span className="sidebar-icon">◦</span>
      {node.name.replace(/\.mdx?$/, "")}
    </div>
  );
}

export function Sidebar({
  tree,
  selectedPath,
  onSelect,
  onOpenWorkspace,
  workspaceName,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-workspace-name">
          {workspaceName ?? "No workspace"}
        </span>
        <button className="sidebar-open-btn" onClick={onOpenWorkspace} title="Open workspace">
          ⊕
        </button>
      </div>

      <div className="sidebar-tree">
        {tree.length === 0 ? (
          <div className="sidebar-empty">
            <p>No workspace open.</p>
            <button className="sidebar-open-workspace-btn" onClick={onOpenWorkspace}>
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
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
