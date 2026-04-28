import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { compareFiles, type FlatFile, flattenTree, score } from "../lib/fileSearch";
import type { FileNode, RecentFile } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import { Input } from "./ui/input";
import "./Modal.css";
import "./FileSwitcher.css";

interface FileSwitcherProps {
  tree: FileNode[];
  recentFiles: RecentFile[];
  onSelect: (node: FileNode) => void;
  onClose: () => void;
}

function buildItemGroups(
  allFiles: FlatFile[],
  filesByPath: Map<string, FlatFile>,
  recentFiles: RecentFile[],
  query: string
) {
  if (!query.trim()) {
    const recentResults = recentFiles
      .map((r) => filesByPath.get(r.path))
      .filter((f): f is FlatFile => f !== undefined);
    const recentPaths = new Set(recentResults.map((f) => f.node.path));
    const otherResults = allFiles
      .filter((f) => !recentPaths.has(f.node.path))
      .slice(0, 50 - recentResults.length);
    return { recentResults, otherResults };
  }

  const recentRankByPath = new Map(recentFiles.map((file, index) => [file.path, index]));
  const otherResults = allFiles
    .filter((f) => score(f, query.trim()) > 0)
    .sort((a, b) => compareFiles(a, b, query.trim(), recentRankByPath))
    .slice(0, 50);

  return { recentResults: [] as FlatFile[], otherResults };
}

export function FileSwitcher({ tree, recentFiles, onSelect, onClose }: FileSwitcherProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const allFiles = useMemo(() => flattenTree(tree), [tree]);

  const filesByPath = useMemo(() => {
    const map = new Map<string, FlatFile>();
    for (const f of allFiles) map.set(f.node.path, f);
    return map;
  }, [allFiles]);

  const { recentResults, otherResults } = useMemo(
    () => buildItemGroups(allFiles, filesByPath, recentFiles, query),
    [allFiles, filesByPath, recentFiles, query]
  );

  const visibleItems = useMemo(
    () => [...recentResults, ...otherResults],
    [recentResults, otherResults]
  );
  const otherResultsOffset = recentResults.length;

  useEffect(() => {
    setActiveIndex((current) => {
      if (visibleItems.length === 0) return 0;
      return Math.min(current, visibleItems.length - 1);
    });
  }, [visibleItems]);

  function handleMove(delta: number) {
    if (visibleItems.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return visibleItems.length - 1;
      if (next >= visibleItems.length) return 0;
      return next;
    });
  }

  function handleOpenActive() {
    const active = visibleItems[activeIndex];
    if (!active) return;
    onSelect(active.node);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleMove(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleMove(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleOpenActive();
    }
  }

  function renderItem(file: FlatFile, index: number) {
    const isActive = index === activeIndex;
    return (
      <button
        key={file.node.path}
        type="button"
        role="option"
        aria-selected={isActive}
        className={`fs-item${isActive ? " is-active" : ""}`}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => onSelect(file.node)}
      >
        <span className="fs-item-title" data-draft={file.node.draft ? "true" : undefined}>
          {file.displayName}
        </span>
        <span className="fs-item-path">{file.relativePath}</span>
      </button>
    );
  }
  return (
    <div className="modal-overlay modal-overlay--top" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("file_switcher.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("file_switcher.title")}
        className="fs-panel"
        onKeyDown={handleKeyDown}
      >
        <div className="fs-search-row">
          <Search className="fs-search-icon" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("file_switcher.search_placeholder")}
            className="fs-search-input"
            aria-label={t("file_switcher.search_label")}
          />
        </div>
        <div className="fs-list" role="listbox" aria-label={t("file_switcher.matching")}>
          {visibleItems.length === 0 ? (
            <div className="fs-empty">{t("file_switcher.no_match")}</div>
          ) : query.trim() === "" ? (
            <>
              {recentResults.length > 0 && (
                <>
                  <div className="fs-group-heading">{t("file_switcher.recent")}</div>
                  {recentResults.map((file, index) => renderItem(file, index))}
                </>
              )}
              {recentResults.length > 0 && otherResults.length > 0 && (
                <div className="fs-separator" aria-hidden="true" />
              )}
              {otherResults.length > 0 && (
                <>
                  {recentResults.length > 0 && (
                    <div className="fs-group-heading">{t("file_switcher.all_files")}</div>
                  )}
                  {otherResults.map((file, index) => renderItem(file, otherResultsOffset + index))}
                </>
              )}
            </>
          ) : (
            otherResults.map((file, index) => renderItem(file, index))
          )}
        </div>
      </div>
    </div>
  );
}
