import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import "./CodeBlockView.css";

const LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "markdown",
  "python",
  "ruby",
  "rust",
  "shell",
  "sql",
  "swift",
  "typescript",
  "xml",
  "yaml",
];

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const language = (node.attrs.language as string | null) ?? "";
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectLang(lang: string | null) {
    updateAttributes({ language: lang });
    setOpen(false);
  }

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div ref={barRef} className="code-block-lang-bar" contentEditable={false}>
        <button
          type="button"
          className="code-block-lang-btn"
          title="Change language"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {language || "plain"}
        </button>

        {open && (
          <div className="code-block-lang-picker" role="listbox" aria-label="Select language">
            <button
              type="button"
              role="option"
              aria-selected={!language}
              className={`code-block-lang-option${!language ? " active" : ""}`}
              onClick={() => selectLang(null)}
            >
              plain
            </button>
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                role="option"
                aria-selected={language === lang}
                className={`code-block-lang-option${language === lang ? " active" : ""}`}
                onClick={() => selectLang(lang)}
              >
                {lang}
              </button>
            ))}
          </div>
        )}
      </div>
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
}
