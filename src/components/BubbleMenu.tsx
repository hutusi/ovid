import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { useTranslation } from "react-i18next";
import "./BubbleMenu.css";

interface BubbleMenuProps {
  editor: Editor;
  onLinkClick: () => void;
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
  const { t } = useTranslation();
  const activeStates = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
    }),
  });

  return (
    <TiptapBubbleMenu
      editor={editor}
      shouldShow={({ state }) => {
        const sel = state.selection;
        // Don't show for node selections (image clicks, table cells, etc.)
        return !sel.empty && !("node" in sel);
      }}
    >
      <div className="bubble-menu" role="toolbar" aria-label={t("bubble_menu.toolbar_label")}>
        <button
          type="button"
          className={`bubble-btn bubble-bold${activeStates.bold ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          title={t("bubble_menu.bold_tooltip")}
          aria-label={t("bubble_menu.bold")}
          aria-pressed={activeStates.bold}
        >
          B
        </button>
        <button
          type="button"
          className={`bubble-btn bubble-italic${activeStates.italic ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
          title={t("bubble_menu.italic_tooltip")}
          aria-label={t("bubble_menu.italic")}
          aria-pressed={activeStates.italic}
        >
          I
        </button>
        <button
          type="button"
          className={`bubble-btn bubble-strike${activeStates.strike ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleStrike().run();
          }}
          title={t("bubble_menu.strikethrough")}
          aria-label={t("bubble_menu.strikethrough")}
          aria-pressed={activeStates.strike}
        >
          S
        </button>
        <button
          type="button"
          className={`bubble-btn bubble-code${activeStates.code ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleCode().run();
          }}
          title={t("bubble_menu.inline_code_tooltip")}
          aria-label={t("bubble_menu.inline_code")}
          aria-pressed={activeStates.code}
        >
          {"</>"}
        </button>
        <div className="bubble-divider" aria-hidden="true" />
        <button
          type="button"
          className={`bubble-btn bubble-link${activeStates.link ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onLinkClick();
          }}
          title={t("bubble_menu.link_tooltip")}
          aria-label={t("bubble_menu.link")}
          aria-pressed={activeStates.link}
        >
          ↗
        </button>
      </div>
    </TiptapBubbleMenu>
  );
}
