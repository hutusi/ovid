import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isPerfLoggingEnabled, logPerf, measureAsync, measureSync } from "../lib/perf";
import type { SearchResult } from "../lib/types";
import "./SearchPanel.css";
import { Input } from "./ui/input";

interface SearchPanelProps {
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

export function SearchPanel({ onOpenFile, onClose }: SearchPanelProps) {
  const renderStartedAtRef = useRef(0);
  renderStartedAtRef.current = performance.now();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear pending debounce timer on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const query = q.trim();
      const res = await measureAsync(
        "search_workspace.invoke",
        () => invoke<SearchResult[]>("search_workspace", { query }),
        { query }
      );
      setResults(res);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") onClose();
  }

  const totalMatches = useMemo(
    () =>
      measureSync(
        "searchPanel.totalMatches",
        () => results.reduce((n, r) => n + r.totalMatches, 0),
        { files: results.length }
      ),
    [results]
  );

  useEffect(() => {
    if (!isPerfLoggingEnabled()) return;
    logPerf("searchPanel.commit", performance.now() - renderStartedAtRef.current, {
      queryLength: query.length,
      files: results.length,
      matches: totalMatches,
      searching: searching ? 1 : 0,
    });
  }, [query.length, results.length, searching, totalMatches]);

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <Input
          ref={inputRef}
          placeholder="Search in workspace…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Search workspace"
          className="h-7 text-[13px]"
        />
        <button
          type="button"
          className="search-close-btn"
          onClick={onClose}
          title="Close search (Esc)"
        >
          ✕
        </button>
      </div>

      <div className="search-results">
        {searching && <p className="search-status">Searching…</p>}

        {!searching && query.trim() && results.length === 0 && (
          <p className="search-status">No results for "{query}"</p>
        )}

        {!searching && results.length > 0 && (
          <p className="search-summary">
            {totalMatches} {totalMatches === 1 ? "match" : "matches"} in {results.length}{" "}
            {results.length === 1 ? "file" : "files"}
          </p>
        )}

        {results.map((result) => {
          const baseName =
            result.path
              .split("/")
              .pop()
              ?.replace(/\.mdx?$/, "") ?? result.path;
          const displayName = result.title || baseName;
          return (
            <div key={result.path} className="search-result-group">
              <button
                type="button"
                className="search-result-file"
                data-draft={result.draft ? "true" : undefined}
                onClick={() => onOpenFile(result.path)}
              >
                {displayName}
              </button>
              {result.matches.map((match) => (
                <button
                  key={match.lineNumber}
                  type="button"
                  className="search-result-match"
                  onClick={() => onOpenFile(result.path)}
                >
                  <span className="search-match-line">{match.lineNumber}</span>
                  <span className="search-match-content">
                    <HighlightedLine text={match.lineContent} query={query} />
                  </span>
                </button>
              ))}
              {result.hasMoreMatches && (
                <p className="search-status">
                  Showing {result.matches.length} of {result.totalMatches} matches in this file
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HighlightedLine({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const lowerQuery = query.trim().toLowerCase();
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lowerQuery ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: split parts have no stable key
          <mark key={i} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
