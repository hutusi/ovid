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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const language = (node.attrs.language as string | null) ?? "";

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-lang-bar" ref={dropdownRef} contentEditable={false}>
        <button
          type="button"
          className="code-block-lang-btn"
          onClick={() => setOpen((v) => !v)}
          title="Change language"
        >
          {language || "plain"}
        </button>
        {open && (
          <div className="code-block-lang-dropdown">
            <button
              type="button"
              className={`code-block-lang-option${!language ? " active" : ""}`}
              onClick={() => {
                updateAttributes({ language: null });
                setOpen(false);
              }}
            >
              plain
            </button>
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                className={`code-block-lang-option${language === lang ? " active" : ""}`}
                onClick={() => {
                  updateAttributes({ language: lang });
                  setOpen(false);
                }}
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
