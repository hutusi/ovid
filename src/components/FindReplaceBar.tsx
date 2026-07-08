import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import { FIND_REPLACE_KEY } from "../lib/tiptap/FindReplace";
import "./FindReplaceBar.css";

interface FindReplaceBarProps {
  editor: Editor;
  /** Show the replace row. False in find-only mode (Cmd+F). */
  showReplace: boolean;
  onClose: () => void;
}

export function FindReplaceBar({ editor, showReplace, onClose }: FindReplaceBarProps) {
  const { t } = useTranslation();
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);

  const { matchCount, currentIndex } = useEditorState({
    editor,
    selector: (ctx) => {
      const ps = FIND_REPLACE_KEY.getState(ctx.editor.state);
      return {
        matchCount: ps?.matches.length ?? 0,
        currentIndex: ps?.currentIndex ?? 0,
      };
    },
  });

  // Focus + select the find input on mount and whenever the mode changes.
  // Switching replace→find unmounts the replace row, which would otherwise
  // drop focus to <body>; pulling focus back to find (the way VS Code keeps
  // focus in the search box) keeps the bar keyboard-driveable. showReplace
  // is the intended trigger, not a value the effect reads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: showReplace is the trigger
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [showReplace]);

  // Clear decorations on unmount
  useEffect(() => {
    return () => {
      editor.commands.setFindTerm("");
    };
  }, [editor]);

  function handleFindChange(value: string) {
    setFindTerm(value);
    editor.commands.setFindTerm(value);
  }

  function handleFindKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        editor.commands.findPrev();
      } else {
        editor.commands.findNext();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function handleReplaceKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (matchCount === 0) return;
      // Enter replaces the current match; Cmd/Ctrl+Enter replaces all.
      if (e.metaKey || e.ctrlKey) {
        editor.commands.replaceAll(replaceTerm);
      } else {
        editor.commands.replaceOne(replaceTerm);
      }
    }
  }

  const countLabel =
    findTerm && matchCount > 0
      ? `${currentIndex + 1} / ${matchCount}`
      : findTerm
        ? t("find_replace.no_results")
        : "";

  return (
    <search
      className="find-replace-bar"
      aria-label={
        showReplace ? t("find_replace.find_and_replace_aria") : t("find_replace.find_aria")
      }
    >
      <div className="find-replace-row">
        <div className="find-replace-input-wrap">
          <input
            ref={findInputRef}
            className="find-replace-input"
            type="text"
            placeholder={t("find_replace.find_placeholder")}
            aria-label={t("find_replace.find_aria")}
            value={findTerm}
            onChange={(e) => handleFindChange(e.target.value)}
            onKeyDown={handleFindKeyDown}
            spellCheck={false}
            {...PLAIN_TEXT_INPUT_PROPS}
          />
          {countLabel && (
            <span className="find-replace-count" aria-live="polite">
              {countLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="find-replace-nav-btn"
          title={t("find_replace.prev_match_tooltip")}
          aria-label={t("find_replace.prev_match")}
          disabled={matchCount === 0}
          onClick={() => editor.commands.findPrev()}
        >
          ↑
        </button>
        <button
          type="button"
          className="find-replace-nav-btn"
          title={t("find_replace.next_match_tooltip")}
          aria-label={t("find_replace.next_match")}
          disabled={matchCount === 0}
          onClick={() => editor.commands.findNext()}
        >
          ↓
        </button>
        <button
          type="button"
          className="find-replace-close-btn"
          title={t("find_replace.close_tooltip")}
          aria-label={t("find_replace.close_aria")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {showReplace && (
        <div className="find-replace-row">
          <input
            className="find-replace-input"
            type="text"
            placeholder={t("find_replace.replace_placeholder")}
            aria-label={t("find_replace.replace_aria")}
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            spellCheck={false}
            {...PLAIN_TEXT_INPUT_PROPS}
          />
          <button
            type="button"
            className="find-replace-action-btn"
            disabled={matchCount === 0}
            onClick={() => editor.commands.replaceOne(replaceTerm)}
          >
            {t("find_replace.replace_one")}
          </button>
          <button
            type="button"
            className="find-replace-action-btn"
            disabled={matchCount === 0}
            onClick={() => editor.commands.replaceAll(replaceTerm)}
          >
            {t("find_replace.replace_all")}
          </button>
        </div>
      )}
    </search>
  );
}
