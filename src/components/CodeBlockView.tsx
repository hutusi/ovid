import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useState } from "react";
import "./CodeBlockView.css";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

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

function optionClass(active: boolean) {
  return `px-2 py-[5px] text-[12px] font-mono rounded text-left transition-colors cursor-pointer ${
    active
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-accent hover:text-foreground"
  }`;
}

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const language = (node.attrs.language as string | null) ?? "";

  function selectLang(lang: string | null) {
    updateAttributes({ language: lang });
    setOpen(false);
  }

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-lang-bar" contentEditable={false}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="code-block-lang-btn" title="Change language">
              {language || "plain"}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[200px] p-1.5 grid grid-cols-2 gap-0.5"
            align="end"
            side="bottom"
            sideOffset={4}
          >
            <button
              type="button"
              className={optionClass(!language)}
              onClick={() => selectLang(null)}
            >
              plain
            </button>
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                className={optionClass(language === lang)}
                onClick={() => selectLang(lang)}
              >
                {lang}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
}
