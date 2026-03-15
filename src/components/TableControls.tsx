import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { FloatingMenu } from "@tiptap/react/menus";
import { useCallback } from "react";
import "./TableControls.css";

interface TableControlsProps {
  editor: Editor;
}

export function TableControls({ editor }: TableControlsProps) {
  const isInTable = useEditorState({
    editor,
    selector: ({ editor: e }) => e.isActive("table"),
  });

  const shouldShow = useCallback(() => isInTable, [isInTable]);

  return (
    <FloatingMenu editor={editor} shouldShow={shouldShow}>
      <div className="table-controls" role="toolbar" aria-label="Table controls">
        <button
          type="button"
          className="table-ctrl-btn"
          title="Add row below"
          aria-label="Add row below"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().addRowAfter().run();
          }}
        >
          +row
        </button>
        <button
          type="button"
          className="table-ctrl-btn"
          title="Delete row"
          aria-label="Delete row"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().deleteRow().run();
          }}
        >
          −row
        </button>
        <div className="table-ctrl-divider" aria-hidden="true" />
        <button
          type="button"
          className="table-ctrl-btn"
          title="Add column after"
          aria-label="Add column after"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().addColumnAfter().run();
          }}
        >
          +col
        </button>
        <button
          type="button"
          className="table-ctrl-btn"
          title="Delete column"
          aria-label="Delete column"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().deleteColumn().run();
          }}
        >
          −col
        </button>
        <div className="table-ctrl-divider" aria-hidden="true" />
        <button
          type="button"
          className="table-ctrl-btn table-ctrl-delete"
          title="Delete table"
          aria-label="Delete table"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().deleteTable().run();
          }}
        >
          ✕ table
        </button>
      </div>
    </FloatingMenu>
  );
}
