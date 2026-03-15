import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { FIND_REPLACE_KEY } from "../lib/tiptap/FindReplace";
import "./FindReplaceBar.css";

interface FindReplaceBarProps {
  editor: Editor;
  onClose: () => void;
}

export function FindReplaceBar({ editor, onClose }: FindReplaceBarProps) {
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

  // Focus find input on mount
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

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
    if (e.key === "Escape") onClose();
  }

  const countLabel =
    findTerm && matchCount > 0
      ? `${currentIndex + 1} / ${matchCount}`
      : findTerm
        ? "No results"
        : "";

  return (
    <search className="find-replace-bar" aria-label="Find and replace">
      <div className="find-replace-row">
        <div className="find-replace-input-wrap">
          <input
            ref={findInputRef}
            className="find-replace-input"
            type="text"
            placeholder="Find"
            aria-label="Find"
            value={findTerm}
            onChange={(e) => handleFindChange(e.target.value)}
            onKeyDown={handleFindKeyDown}
            spellCheck={false}
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
          title="Previous match (Shift+Enter)"
          aria-label="Previous match"
          disabled={matchCount === 0}
          onClick={() => editor.commands.findPrev()}
        >
          ↑
        </button>
        <button
          type="button"
          className="find-replace-nav-btn"
          title="Next match (Enter)"
          aria-label="Next match"
          disabled={matchCount === 0}
          onClick={() => editor.commands.findNext()}
        >
          ↓
        </button>
        <button
          type="button"
          className="find-replace-close-btn"
          title="Close (Esc)"
          aria-label="Close find and replace"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="find-replace-row">
        <input
          className="find-replace-input"
          type="text"
          placeholder="Replace"
          aria-label="Replace"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          onKeyDown={handleReplaceKeyDown}
          spellCheck={false}
        />
        <button
          type="button"
          className="find-replace-action-btn"
          disabled={matchCount === 0}
          onClick={() => editor.commands.replaceOne(replaceTerm)}
        >
          Replace
        </button>
        <button
          type="button"
          className="find-replace-action-btn"
          disabled={matchCount === 0}
          onClick={() => editor.commands.replaceAll(replaceTerm)}
        >
          All
        </button>
      </div>
    </search>
  );
}
