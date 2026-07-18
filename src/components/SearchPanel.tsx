import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "../lib/commands";
import { createGenerationGuard } from "../lib/latestOnly";
import { isPerfLoggingEnabled, logPerf, measureAsync, measureSync } from "../lib/perf";
import type { SearchResult } from "../lib/types";
import "./SearchPanel.css";
import { Input } from "./ui/input";

interface SearchPanelProps {
  /** Open a file; when a specific match was chosen, `match` carries its raw
   *  line, 1-based file line number, and the query so the editor can scroll
   *  to the exact occurrence. */
  onOpenFile: (
    path: string,
    match?: { lineContent: string; lineNumber: number; query: string }
  ) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

export function SearchPanel({ onOpenFile, onClose }: SearchPanelProps) {
  const { t } = useTranslation();
  const renderStartedAtRef = useRef(0);
  renderStartedAtRef.current = performance.now();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // The trimmed query the displayed results belong to. During the debounce
  // window `query` can already be ahead of this — the results are then stale
  // and must not be actionable (opening one would attach the new query to an
  // old match).
  const [resultsQuery, setResultsQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation guard: only the latest query may apply its results — a slower
  // older search must not overwrite newer results or clear their spinner.
  const searchGenRef = useRef(createGenerationGuard());

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
    // The generation was already bumped in handleChange when this query's
    // input landed, so an in-flight response for a superseded query is
    // invalidated the instant the user types — not 300 ms later when this
    // fires. Capture (don't re-bump) so that guard still holds.
    const guard = searchGenRef.current;
    const gen = guard.current();
    if (!q.trim()) {
      setResults([]);
      setResultsQuery("");
      setError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const query = q.trim();
      const res = await measureAsync(
        "search_workspace.invoke",
        () => commands.search.workspace({ query }) as Promise<SearchResult[]>,
        { query }
      );
      if (!guard.isCurrent(gen)) return;
      setResults(res);
      setResultsQuery(query);
      setError(null);
      setActiveIndex(-1);
    } catch (err) {
      if (!guard.isCurrent(gen)) return;
      console.error("Search failed:", err);
      setResults([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (guard.isCurrent(gen)) setSearching(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    // Invalidate any in-flight request now, so its late response can't render
    // under the new input during the debounce window.
    searchGenRef.current.bump();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  }

  // Flattened match rows for keyboard navigation, and each file's offset into
  // that flat list so rendered rows can mark themselves active.
  const flatMatches = useMemo(
    () => results.flatMap((r) => r.matches.map((match) => ({ path: r.path, match }))),
    [results]
  );
  const matchOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let acc = 0;
    for (const r of results) {
      offsets.set(r.path, acc);
      acc += r.matches.length;
    }
    return offsets;
  }, [results]);

  useEffect(() => {
    if (activeIndex < 0) return;
    resultsRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Results are stale once the input has moved past the query they belong to
  // (a newer search is pending in the debounce window). Opening a stale row
  // would attach the new query to an old match, so actions no-op until the
  // pending search lands.
  const resultsStale = query.trim() !== resultsQuery;

  function openMatch(index: number) {
    if (resultsStale) return;
    const item = flatMatches[index];
    if (!item) return;
    onOpenFile(item.path, {
      lineContent: item.match.lineContent,
      lineNumber: item.match.lineNumber,
      query: resultsQuery,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flatMatches.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      openMatch(activeIndex === -1 ? 0 : activeIndex);
    }
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
          placeholder={t("search_panel.placeholder")}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={t("search_panel.aria_label")}
          role="combobox"
          aria-expanded={flatMatches.length > 0}
          aria-controls="search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
          className="h-7 text-[13px]"
        />
        <button
          type="button"
          className="search-close-btn"
          onClick={onClose}
          title={t("search_panel.close_tooltip")}
        >
          ✕
        </button>
      </div>

      <div className="search-results" ref={resultsRef}>
        {searching && (
          <p className="search-status" role="status">
            {t("search_panel.searching")}
          </p>
        )}

        {!searching && error && (
          <p className="search-status search-error" role="alert">
            {t("search_panel.error", { message: error })}
          </p>
        )}

        {!searching && !error && query.trim() && results.length === 0 && (
          <p className="search-status" role="status">
            {t("search_panel.no_results", { query })}
          </p>
        )}

        {!searching && results.length > 0 && (
          <p className="search-summary" role="status">
            {t("search_panel.summary", {
              matches: t("search_panel.matches", { count: totalMatches }),
              files: t("search_panel.files", { count: results.length }),
            })}
          </p>
        )}

        {results.length > 0 && (
          <div id="search-listbox" role="listbox" aria-label={t("search_panel.aria_label")}>
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
                    // File headers open the file but aren't part of the
                    // arrow-key option sequence — keep them out of the tab
                    // order so the input's aria-activedescendant is the single
                    // keyboard cursor.
                    tabIndex={-1}
                    data-draft={result.draft ? "true" : undefined}
                    onClick={() => {
                      if (!resultsStale) onOpenFile(result.path);
                    }}
                  >
                    {displayName}
                  </button>
                  {result.matches.map((match, matchIdx) => {
                    const flatIndex = (matchOffsets.get(result.path) ?? 0) + matchIdx;
                    return (
                      <button
                        key={match.lineNumber}
                        type="button"
                        id={`search-option-${flatIndex}`}
                        role="option"
                        aria-selected={flatIndex === activeIndex}
                        className="search-result-match"
                        data-active={flatIndex === activeIndex ? "true" : undefined}
                        onClick={() => openMatch(flatIndex)}
                      >
                        <span className="search-match-line">{match.lineNumber}</span>
                        <span className="search-match-content">
                          <HighlightedLine text={match.lineContent} query={query} />
                        </span>
                      </button>
                    );
                  })}
                  {result.hasMoreMatches && (
                    <p className="search-status">
                      {t("search_panel.overflow", {
                        shown: result.matches.length,
                        total: result.totalMatches,
                      })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
