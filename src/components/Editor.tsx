import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import "../styles/editor.css";

interface EditorProps {
  content?: string;
  onWordCount?: (count: number) => void;
}

export function Editor({ content = "", onWordCount }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
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
      if (onWordCount) {
        const text = editor.getText();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        onWordCount(words);
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
