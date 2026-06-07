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
import { compareFiles, type FlatFile, score } from "../lib/fileSearch";
import { type WikiLinkSuggestionState, wikiLinkSuggestionKey } from "../lib/tiptap/WikiLink";
import { filterNotes, type NoteResolverIndex } from "../lib/wikiLink";

interface WikiSuggestionPopoverProps {
  editor: Editor;
  flatFiles: FlatFile[];
  /** Same index the editor's WikiLink uses for resolution. Reading it here
   *  lets us pick a target the resolver will actually round-trip back to
   *  this file — see `resolverTargetForNote`. Notes that have neither a
   *  frontmatter `title:` nor an `aliases:` entry are filtered out of the
   *  suggestion list because there's no safe target to write. */
  resolverIndex: NoteResolverIndex;
}

const MAX_RESULTS = 8;

interface PositionedSuggestion {
  state: WikiLinkSuggestionState;
  /** Anchor rect in client coordinates, captured at the start of the suggestion. */
  anchor: { top: number; bottom: number; left: number };
}

export function WikiSuggestionPopover({
  editor,
  flatFiles,
  resolverIndex,
}: WikiSuggestionPopoverProps) {
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
    const handleBlur = () => setPositioned(null);
    updateState();
    editor.on("transaction", updateState);
    editor.on("focus", updateState);
    editor.on("blur", handleBlur);
    return () => {
      editor.off("transaction", updateState);
      editor.off("focus", updateState);
      editor.off("blur", handleBlur);
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

  // Build the ranked suggestion list. We exclude notes the resolver can't
  // round-trip — selecting one of those would write a `[[stem]]` target
  // that the alias/title-only resolver wouldn't find, and clicking it
  // later would materialize a duplicate file rather than reopening this
  // one. Notes need either a frontmatter `title:` or at least one alias
  // to qualify for the popover.
  const suggestions = useMemo(() => {
    if (!positioned) return [];
    const notes = filterNotes(flatFiles).filter((f) => hasResolverHandle(f, resolverIndex));
    const q = positioned.state.query;
    if (!q) {
      // Empty query: surface the first N notes alphabetically. Recent-file
      // ranking could feed in here later but is out of scope for the MVP.
      return notes
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, MAX_RESULTS);
    }
    // Mirror Cmd+P: filter out files with no match for the query so the
    // popover doesn't dilute the suggestions with unrelated notes.
    return notes
      .filter((f) => score(f, q) > 0)
      .sort((a, b) => compareFiles(a, b, q))
      .slice(0, MAX_RESULTS);
  }, [positioned, flatFiles, resolverIndex]);

  // Derive the effective highlight from `selectedIndex`, clamped against
  // the current suggestions length. The result list can shrink without the
  // query changing (a note got renamed, the resolver index rebuilt) — in
  // that case the unclamped index would dereference `undefined` in
  // `insertSelected`. Clamping every render keeps the highlight valid
  // without an extra state-setting effect.
  const activeIndex =
    suggestions.length === 0 ? 0 : Math.min(selectedIndex, suggestions.length - 1);

  // Capture-phase keyboard handler so arrow/Enter/Esc don't reach ProseMirror.
  useEffect(() => {
    if (!positioned) return;
    const handler = (event: KeyboardEvent) => {
      // Only act when the editor view itself owns focus — typing in the
      // properties panel or any input shouldn't drive the popover.
      const active = document.activeElement;
      if (!active || !editor.view.dom.contains(active)) return;
      // When there are no suggestions to surface (popover renders null at
      // the bottom), let every navigation key bubble through so the user
      // can still move the cursor normally. Esc remains useful — it
      // dismisses the latent suggestion state for this `[[…` start.
      if (suggestions.length === 0) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismissedAtRef.current = positioned.state.from;
          setPositioned(null);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        insertSelected(editor, positioned.state, suggestions[activeIndex], resolverIndex);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissedAtRef.current = positioned.state.from;
        setPositioned(null);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [positioned, suggestions, activeIndex, editor, resolverIndex]);

  // Scroll the highlighted row into view inside the popover.
  useLayoutEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-suggestion-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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
            aria-selected={i === activeIndex}
            className={`wiki-suggestion-item${i === activeIndex ? " is-selected" : ""}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onMouseDown={(e) => {
              // Mousedown (not click) so we beat the editor's blur — clicking
              // a popover button otherwise blurs the editor first and the
              // suggestion state goes inactive before insert runs.
              e.preventDefault();
              insertSelected(editor, positioned.state, file, resolverIndex);
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

function insertSelected(
  editor: Editor,
  state: WikiLinkSuggestionState,
  selected: FlatFile,
  resolverIndex: NoteResolverIndex
): void {
  const target = resolverTargetForNote(selected, resolverIndex);
  if (!target) return;
  editor
    .chain()
    .focus()
    .insertContentAt({ from: state.from, to: state.to }, [
      { type: "wikiLink", attrs: { target, displayText: null } },
      { type: "text", text: " " },
    ])
    .run();
}

/** True iff `file` has a frontmatter handle the resolver can round-trip
 *  (`title:` or at least one `aliases:` entry). Notes without either are
 *  hidden from the popover so we never insert a `[[stem]]` target that the
 *  alias/title-only resolver can't find later. */
function hasResolverHandle(file: FlatFile, index: NoteResolverIndex): boolean {
  return resolverTargetForNote(file, index) !== null;
}

/** Pick the wiki-link target for an inserted suggestion. Matches the
 *  resolver's lookup order: first alias, then title. Returns null when the
 *  note has neither — callers should not insert in that case. */
function resolverTargetForNote(file: FlatFile, index: NoteResolverIndex): string | null {
  const entry = index.byPath.get(file.relativePath);
  if (entry?.aliases && entry.aliases.length > 0) return entry.aliases[0];
  if (entry?.title) return entry.title;
  return null;
}
