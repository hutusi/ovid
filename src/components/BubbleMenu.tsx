import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import "./BubbleMenu.css";

interface BubbleMenuProps {
  editor: Editor;
  onLinkClick: () => void;
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
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
      <div className="bubble-menu" role="toolbar" aria-label="Formatting options">
        <button
          type="button"
          className={`bubble-btn bubble-bold${activeStates.bold ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          title="Bold (⌘B)"
          aria-label="Bold"
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
          title="Italic (⌘I)"
          aria-label="Italic"
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
          title="Strikethrough"
          aria-label="Strikethrough"
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
          title="Inline code (⌘E)"
          aria-label="Inline code"
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
          title="Link (⌘K)"
          aria-label="Link"
          aria-pressed={activeStates.link}
        >
          ↗
        </button>
      </div>
    </TiptapBubbleMenu>
  );
}
