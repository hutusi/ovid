import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CODE_BLOCK_LANGUAGES,
  isPresetCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from "../lib/codeBlockLanguages";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import { usePopover } from "../lib/usePopover";
import "./CodeBlockView.css";

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [customLanguage, setCustomLanguage] = useState("");
  const language = (node.attrs.language as string | null) ?? "";
  const barRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  usePopover({
    open,
    onClose: () => setOpen(false),
    containerRef: barRef,
    panelRef: pickerRef,
    initialFocusRef: customInputRef,
    // The picker sits inside the editor's DOM, whose focus handling is
    // ProseMirror's; a click outside still closes it.
    closeOnFocusOut: false,
  });

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
          title={t("code_block.change_language")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {language || t("code_block.plain")}
        </button>
        <button
          type="button"
          className={`code-block-copy-btn${copyState !== "idle" ? ` is-${copyState}` : ""}`}
          title={
            copyState === "copied" ? t("code_block.copied_tooltip") : t("code_block.copy_tooltip")
          }
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyState === "copied"
            ? t("code_block.copied_button")
            : copyState === "error"
              ? t("code_block.failed_button")
              : t("code_block.copy_button")}
        </button>

        {open && (
          <div ref={pickerRef} className="code-block-lang-picker">
            <button
              type="button"
              className={`code-block-lang-option${!language ? " active" : ""}`}
              aria-pressed={!language}
              onClick={() => selectLang(null)}
            >
              {t("code_block.plain")}
            </button>
            {CODE_BLOCK_LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                className={`code-block-lang-option${language === lang ? " active" : ""}`}
                aria-pressed={language === lang}
                onClick={() => selectLang(lang)}
              >
                {lang}
              </button>
            ))}
            <div className="code-block-custom-language">
              <label className="code-block-custom-label" htmlFor="code-block-custom-language">
                {t("code_block.custom_language")}
              </label>
              <div className="code-block-custom-row">
                <input
                  id="code-block-custom-language"
                  ref={customInputRef}
                  type="text"
                  className="code-block-custom-input"
                  placeholder={t("code_block.custom_language_placeholder")}
                  value={customLanguage}
                  {...PLAIN_TEXT_INPUT_PROPS}
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
                  {t("code_block.apply")}
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
