import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { FloatingMenu } from "@tiptap/react/menus";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./TableControls.css";

interface TableControlsProps {
  editor: Editor;
}

export function TableControls({ editor }: TableControlsProps) {
  const { t } = useTranslation();
  const isInTable = useEditorState({
    editor,
    selector: ({ editor: e }) => e.isActive("table"),
  });

  const shouldShow = useCallback(() => isInTable, [isInTable]);

  return (
    <FloatingMenu editor={editor} shouldShow={shouldShow}>
      <div className="table-controls" role="toolbar" aria-label={t("table_controls.toolbar_label")}>
        <button
          type="button"
          className="table-ctrl-btn"
          title={t("table_controls.add_row")}
          aria-label={t("table_controls.add_row")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().addRowAfter().run();
          }}
        >
          {t("table_controls.add_row_text")}
        </button>
        <button
          type="button"
          className="table-ctrl-btn"
          title={t("table_controls.delete_row")}
          aria-label={t("table_controls.delete_row")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().deleteRow().run();
          }}
        >
          {t("table_controls.delete_row_text")}
        </button>
        <div className="table-ctrl-divider" aria-hidden="true" />
        <button
          type="button"
          className="table-ctrl-btn"
          title={t("table_controls.add_col")}
          aria-label={t("table_controls.add_col")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().addColumnAfter().run();
          }}
        >
          {t("table_controls.add_col_text")}
        </button>
        <button
          type="button"
          className="table-ctrl-btn"
          title={t("table_controls.delete_col")}
          aria-label={t("table_controls.delete_col")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().deleteColumn().run();
          }}
        >
          {t("table_controls.delete_col_text")}
        </button>
        <div className="table-ctrl-divider" aria-hidden="true" />
        <button
          type="button"
          className="table-ctrl-btn table-ctrl-delete"
          title={t("table_controls.delete_table")}
          aria-label={t("table_controls.delete_table")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().deleteTable().run();
          }}
        >
          {t("table_controls.delete_table_text")}
        </button>
      </div>
    </FloatingMenu>
  );
}
