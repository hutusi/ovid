import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import "../styles/editor.css";

interface EditorProps {
  content?: string;
  onWordCount?: (count: number) => void;
  onChange?: (markdown: string) => void;
}

export function Editor({ content = "", onWordCount, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
      Typography,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Image,
    ],
    content,
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markdown = (editor.storage as any).markdown.getMarkdown() as string;
      onChange?.(markdown);

      if (onWordCount) {
        const text = editor.getText();
        onWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      }
    },
  });

  return (
    <div className="editor-wrapper">
      <div className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
