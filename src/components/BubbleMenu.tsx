import type { Editor } from "@tiptap/react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import "./BubbleMenu.css";

interface BubbleMenuProps {
  editor: Editor;
  onLinkClick: () => void;
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
  return (
    <TiptapBubbleMenu editor={editor}>
      <div className="bubble-menu" role="toolbar" aria-label="Formatting options">
        <button
          type="button"
          className={`bubble-btn bubble-bold${editor.isActive("bold") ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          title="Bold (⌘B)"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
        >
          B
        </button>
        <button
          type="button"
          className={`bubble-btn bubble-italic${editor.isActive("italic") ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
          title="Italic (⌘I)"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
        >
          I
        </button>
        <button
          type="button"
          className={`bubble-btn bubble-strike${editor.isActive("strike") ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleStrike().run();
          }}
          title="Strikethrough"
          aria-label="Strikethrough"
          aria-pressed={editor.isActive("strike")}
        >
          S
        </button>
        <button
          type="button"
          className={`bubble-btn bubble-code${editor.isActive("code") ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleCode().run();
          }}
          title="Inline code (⌘E)"
          aria-label="Inline code"
          aria-pressed={editor.isActive("code")}
        >
          {"</>"}
        </button>
        <div className="bubble-divider" aria-hidden="true" />
        <button
          type="button"
          className={`bubble-btn bubble-link${editor.isActive("link") ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onLinkClick();
          }}
          title="Link (⌘K)"
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
        >
          ↗
        </button>
      </div>
    </TiptapBubbleMenu>
  );
}
