import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import {
  CODE_BLOCK_LANGUAGES,
  isPresetCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from "../lib/codeBlockLanguages";
import "./CodeBlockView.css";

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [customLanguage, setCustomLanguage] = useState("");
  const language = (node.attrs.language as string | null) ?? "";
  const barRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!open) return;
    setCustomLanguage(isPresetCodeBlockLanguage(language) ? "" : language);
    window.setTimeout(() => customInputRef.current?.focus(), 0);
  }, [open, language]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  function selectLang(lang: string | null) {
    updateAttributes({ language: lang });
    setOpen(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function submitCustomLanguage() {
    selectLang(normalizeCodeBlockLanguage(customLanguage));
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
        <button
          type="button"
          className={`code-block-copy-btn${copyState !== "idle" ? ` is-${copyState}` : ""}`}
          title={copyState === "copied" ? "Copied" : "Copy code"}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyState === "copied" ? "copied" : copyState === "error" ? "failed" : "copy"}
        </button>

        {open && (
          <div className="code-block-lang-picker">
            <button
              type="button"
              className={`code-block-lang-option${!language ? " active" : ""}`}
              onClick={() => selectLang(null)}
            >
              plain
            </button>
            {CODE_BLOCK_LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                className={`code-block-lang-option${language === lang ? " active" : ""}`}
                onClick={() => selectLang(lang)}
              >
                {lang}
              </button>
            ))}
            <div className="code-block-custom-language">
              <label className="code-block-custom-label" htmlFor="code-block-custom-language">
                Custom language
              </label>
              <div className="code-block-custom-row">
                <input
                  id="code-block-custom-language"
                  ref={customInputRef}
                  type="text"
                  className="code-block-custom-input"
                  placeholder="mermaid, toml, tsx"
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCustomLanguage();
                    }
                  }}
                />
                <button
                  type="button"
                  className="code-block-custom-apply"
                  onClick={() => submitCustomLanguage()}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
}
