import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import type { WikiLinkOptions } from "../lib/tiptap/WikiLink";

export function WikiLinkView({ node, extension, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const opts = extension.options as WikiLinkOptions;
  const target = (node.attrs.target as string) ?? "";
  const displayText = node.attrs.displayText as string | null;
  const label = displayText ?? target;

  const resolved = opts.resolve?.(target);
  const exists = resolved ? resolved.exists : false;
  const ariaLabel = exists
    ? t("wikiLink.resolvedAria", { target, defaultValue: `Wiki link to ${target}` })
    : t("wikiLink.unresolvedAria", { target, defaultValue: `Unresolved wiki link to ${target}` });

  const handleActivate = () => {
    opts.onOpen?.(target, displayText);
  };

  return (
    <NodeViewWrapper as="span" className="wiki-link-wrapper" contentEditable={false}>
      <a
        className={`wiki-link${exists ? "" : " wiki-link-unresolved"}${selected ? " wiki-link-selected" : ""}`}
        href={resolved ? `#${resolved.relativePath}` : undefined}
        data-wiki-target={target}
        data-wiki-display={displayText ?? undefined}
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.preventDefault();
          handleActivate();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivate();
          }
        }}
      >
        {label}
      </a>
    </NodeViewWrapper>
  );
}
