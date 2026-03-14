import { invoke } from "@tauri-apps/api/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef } from "react";
import { Markdown } from "tiptap-markdown";
import "../styles/editor.css";

const lowlight = createLowlight(common);

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

interface EditorProps {
  content?: string;
  typewriterMode?: boolean;
  onWordCount?: (count: number) => void;
  onChange?: (markdown: string) => void;
}

export function Editor({
  content = "",
  typewriterMode = false,
  onWordCount,
  onChange,
}: EditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const typewriterRef = useRef(typewriterMode);
  useEffect(() => {
    typewriterRef.current = typewriterMode;
  }, [typewriterMode]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
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
    editorProps: {
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          IMAGE_MIME.test(f.type)
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        for (const file of files) {
          const srcPath: string | undefined = (file as { path?: string }).path;
          if (!srcPath) continue;
          invoke<string>("save_asset", { srcPath })
            .then((relPath) => {
              if (pos !== undefined) {
                view.dispatch(
                  view.state.tr.insert(
                    pos,
                    view.state.schema.nodes.image.create({ src: relPath, alt: file.name })
                  )
                );
              }
            })
            .catch((err) => console.error("save_asset failed:", err));
        }
        return true;
      },
    },
    onUpdate({ editor }) {
      // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown storage has no public type
      const markdown = (editor.storage as any).markdown.getMarkdown() as string;
      onChange?.(markdown);

      if (onWordCount) {
        const text = editor.getText();
        onWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      }
    },
    onSelectionUpdate({ editor: ed }) {
      if (!typewriterRef.current || !scrollRef.current) return;
      const { from } = ed.view.state.selection;
      const coords = ed.view.coordsAtPos(from);
      const scrollEl = scrollRef.current;
      const rect = scrollEl.getBoundingClientRect();
      const cursorRelTop = coords.top - rect.top;
      const target = scrollEl.scrollTop + cursorRelTop - rect.height / 2;
      scrollEl.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    },
  });

  return (
    <div className="editor-wrapper">
      <div ref={scrollRef} className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
