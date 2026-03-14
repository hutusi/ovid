import { useEffect, useMemo, useRef, useState } from "react";
import type { FlatFile } from "../lib/fileSearch";
import { flattenTree, score } from "../lib/fileSearch";
import type { FileNode } from "../lib/types";
import "./FileSwitcher.css";

interface RecentFile {
  path: string;
  name: string;
  title?: string;
}

interface FileSwitcherProps {
  tree: FileNode[];
  recentFiles: RecentFile[];
  onSelect: (node: FileNode) => void;
  onClose: () => void;
}

export function FileSwitcher({ tree, recentFiles, onSelect, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allFiles = useMemo(() => flattenTree(tree), [tree]);

  const filesByPath = useMemo(() => {
    const map = new Map<string, FlatFile>();
    for (const f of allFiles) map.set(f.node.path, f);
    return map;
  }, [allFiles]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recents first (resolved to current tree), then remaining files
      const recentFlat = recentFiles
        .map((r) => filesByPath.get(r.path))
        .filter((f): f is FlatFile => f !== undefined);
      const recentPaths = new Set(recentFlat.map((f) => f.node.path));
      const rest = allFiles.filter((f) => !recentPaths.has(f.node.path));
      return [...recentFlat, ...rest].slice(0, 50);
    }
    return allFiles
      .map((f) => ({ file: f, s: score(f, query.trim()) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ file }) => file)
      .slice(0, 50);
  }, [allFiles, filesByPath, recentFiles, query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll active item into view
  useEffect(() => {
    const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[activeIndex]) onSelect(results[activeIndex].node);
        break;
      case "Escape":
        onClose();
        break;
    }
  }

  return (
    <div className="switcher-overlay">
      <button type="button" className="switcher-backdrop" aria-label="Close" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Quick file switcher" className="switcher">
        <input
          ref={inputRef}
          className="switcher-input"
          placeholder="Search files…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
        />
        {results.length > 0 ? (
          <div ref={listRef} className="switcher-list">
            {results.map((f, i) => (
              <button
                key={f.node.path}
                type="button"
                className={`switcher-item ${i === activeIndex ? "active" : ""}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(f.node)}
              >
                <span className={`switcher-name ${f.node.draft ? "draft" : ""}`}>
                  {f.displayName}
                </span>
                <span className="switcher-path">{f.relativePath}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="switcher-empty">No files match</p>
        )}
      </div>
    </div>
  );
}
