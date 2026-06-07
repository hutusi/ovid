// WikiSuggestionPopover: a `[[…]]`-trigger autocomplete dropdown that lists
// existing notes ranked by the same `score`/`compareFiles` engine Cmd+P uses.
//
// Coordination model:
//   - The WikiLink Tiptap extension's suggestion plugin (see
//     `wikiLinkSuggestionKey` in `WikiLink.ts`) derives, on every
//     transaction, the position-and-query of an in-progress `[[…` at the
//     caret. We subscribe via `editor.on("transaction")` and re-render when
//     that state changes.
//   - Keyboard nav happens here on a `document.keydown` capture-phase
//     listener so we intercept arrow keys / Enter before ProseMirror's
//     bubble-phase handlers can act on them.
//   - On select, we insert a `wikiLink` JSON node replacing `[[query` and
//     focus the editor. No markdown parsing involved.

import type { Editor } from "@tiptap/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { compareFiles, type FlatFile } from "../lib/fileSearch";
import { type WikiLinkSuggestionState, wikiLinkSuggestionKey } from "../lib/tiptap/WikiLink";
import { filterNotes } from "../lib/wikiLink";

interface WikiSuggestionPopoverProps {
  editor: Editor;
  flatFiles: FlatFile[];
}

const MAX_RESULTS = 8;

interface PositionedSuggestion {
  state: WikiLinkSuggestionState;
  /** Anchor rect in client coordinates, captured at the start of the suggestion. */
  anchor: { top: number; bottom: number; left: number };
}

export function WikiSuggestionPopover({ editor, flatFiles }: WikiSuggestionPopoverProps) {
  const { t } = useTranslation();
  const [positioned, setPositioned] = useState<PositionedSuggestion | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Track which suggestion-start the user dismissed via Escape, so we don't
  // re-open the popover for the same `[[…` until they navigate away or start
  // a fresh one.
  const dismissedAtRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to the editor's suggestion plugin state.
  useEffect(() => {
    const updateState = () => {
      const next = wikiLinkSuggestionKey.getState(editor.state);
      if (!next?.active) {
        setPositioned(null);
        dismissedAtRef.current = null;
        return;
      }
      if (dismissedAtRef.current === next.from) {
        setPositioned(null);
        return;
      }
      // Recompute anchor every state change so the popover follows scroll /
      // text reflow without us needing a separate resize listener.
      const coords = editor.view.coordsAtPos(next.from);
      setPositioned({
        state: next,
        anchor: { top: coords.top, bottom: coords.bottom, left: coords.left },
      });
    };
    updateState();
    editor.on("transaction", updateState);
    editor.on("focus", updateState);
    editor.on("blur", () => setPositioned(null));
    return () => {
      editor.off("transaction", updateState);
      editor.off("focus", updateState);
    };
  }, [editor]);

  // Reset selection whenever the query changes — the previous index may
  // be out of bounds against a shorter result list. Track the last seen
  // query in a ref so we don't reset selection on every transaction.
  const prevQueryRef = useRef<string | null>(null);
  const currentQuery = positioned?.state.query ?? null;
  if (currentQuery !== prevQueryRef.current) {
    prevQueryRef.current = currentQuery;
    // Schedule the state update; running it inline during render is safe
    // because React batches setState calls outside of effects.
    if (selectedIndex !== 0) setSelectedIndex(0);
  }

  // Build the ranked suggestion list.
  const suggestions = useMemo(() => {
    if (!positioned) return [];
    const notes = filterNotes(flatFiles);
    const q = positioned.state.query;
    if (!q) {
      // Empty query: surface the first N notes alphabetically. Recent-file
      // ranking could feed in here later but is out of scope for the MVP.
      return notes
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, MAX_RESULTS);
    }
    return notes
      .slice()
      .sort((a, b) => compareFiles(a, b, q))
      .slice(0, MAX_RESULTS);
  }, [positioned, flatFiles]);

  // Capture-phase keyboard handler so arrow/Enter/Esc don't reach ProseMirror.
  useEffect(() => {
    if (!positioned) return;
    const handler = (event: KeyboardEvent) => {
      // Only act when the editor view itself owns focus — typing in the
      // properties panel or any input shouldn't drive the popover.
      const active = document.activeElement;
      if (!active || !editor.view.dom.contains(active)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((i) => (suggestions.length === 0 ? 0 : (i + 1) % suggestions.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((i) =>
          suggestions.length === 0 ? 0 : (i - 1 + suggestions.length) % suggestions.length
        );
      } else if (event.key === "Enter" || event.key === "Tab") {
        if (suggestions.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        insertSelected(editor, positioned.state, suggestions[selectedIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissedAtRef.current = positioned.state.from;
        setPositioned(null);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [positioned, suggestions, selectedIndex, editor]);

  // Scroll the highlighted row into view inside the popover.
  useLayoutEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-suggestion-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!positioned || suggestions.length === 0) return null;

  return (
    <div
      className="wiki-suggestion-popover"
      role="listbox"
      aria-label={t("wikiLink.suggestionsAria", { defaultValue: "Wiki link suggestions" })}
      style={{
        position: "fixed",
        top: positioned.anchor.bottom + 4,
        left: positioned.anchor.left,
      }}
    >
      <div ref={listRef} className="wiki-suggestion-list">
        {suggestions.map((file, i) => (
          <button
            key={file.node.path}
            type="button"
            data-suggestion-item
            role="option"
            aria-selected={i === selectedIndex}
            className={`wiki-suggestion-item${i === selectedIndex ? " is-selected" : ""}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onMouseDown={(e) => {
              // Mousedown (not click) so we beat the editor's blur — clicking
              // a popover button otherwise blurs the editor first and the
              // suggestion state goes inactive before insert runs.
              e.preventDefault();
              insertSelected(editor, positioned.state, file);
            }}
          >
            <span className="wiki-suggestion-title">{file.displayName}</span>
            <span className="wiki-suggestion-path">{file.relativePath}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function insertSelected(editor: Editor, state: WikiLinkSuggestionState, selected: FlatFile): void {
  // Use the note's frontmatter title (via `displayName`) as the target so the
  // resolver round-trips correctly via `byTitle`. Falls back to the filename
  // stem if no title is set.
  const target = selected.displayName;
  editor
    .chain()
    .focus()
    .insertContentAt({ from: state.from, to: state.to }, [
      { type: "wikiLink", attrs: { target, displayText: null } },
      { type: "text", text: " " },
    ])
    .run();
}
