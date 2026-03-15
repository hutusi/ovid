import { invoke } from "@tauri-apps/api/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "tiptap-markdown";
import { LinkPreview } from "../lib/tiptap/LinkPreview";
import { LinkDialog } from "./LinkDialog";
import "../styles/editor.css";

const lowlight = createLowlight(common);

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

interface EditorProps {
  content?: string;
  filePath?: string;
  typewriterMode?: boolean;
  spellCheck?: boolean;
  onWordCount?: (count: number) => void;
  onChange?: (markdown: string) => void;
}

export function Editor({
  content = "",
  filePath,
  typewriterMode = false,
  spellCheck = true,
  onWordCount,
  onChange,
}: EditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const typewriterRef = useRef(typewriterMode);
  useEffect(() => {
    typewriterRef.current = typewriterMode;
  }, [typewriterMode]);

  const [linkDialog, setLinkDialog] = useState<{ href: string } | null>(null);

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
      LinkPreview,
    ],
    content,
    editorProps: {
      attributes: { spellcheck: spellCheck ? "true" : "false" },
      handleDrop(view, event) {
        const imageFiles = Array.from(event.dataTransfer?.files ?? [])
          .filter((f) => IMAGE_MIME.test(f.type))
          .map((f) => ({ name: f.name, srcPath: (f as { path?: string }).path }))
          .filter((f): f is { name: string; srcPath: string } => f.srcPath !== undefined);
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        // Capture coords now; recompute position after async uploads settle
        // to avoid using a stale absolute offset if the document changes.
        const dropX = event.clientX;
        const dropY = event.clientY;
        Promise.allSettled(
          imageFiles.map(({ name, srcPath }) =>
            invoke<string>("save_asset", { srcPath, activeFilePath: filePath }).then((relPath) => ({
              name,
              relPath,
            }))
          )
        ).then((results) => {
          const saved = results.flatMap((r) => {
            if (r.status === "fulfilled") return [r.value];
            console.error("save_asset failed:", r.reason);
            return [];
          });
          if (saved.length === 0) return;
          const dropPos = view.posAtCoords({ left: dropX, top: dropY })?.pos;
          if (dropPos === undefined) return;
          // Apply all insertions in one transaction to avoid stale positions
          const tr = view.state.tr;
          let offset = 0;
          for (const { name, relPath } of saved) {
            const node = view.state.schema.nodes.image.create({ src: relPath, alt: name });
            tr.insert(dropPos + offset, node);
            offset += node.nodeSize;
          }
          view.dispatch(tr);
        });
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
      if (coords.top === 0 && coords.bottom === 0) return;
      const scrollEl = scrollRef.current;
      const rect = scrollEl.getBoundingClientRect();
      const cursorRelTop = coords.top - rect.top;
      const target = scrollEl.scrollTop + cursorRelTop - rect.height / 2;
      scrollEl.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    },
  });

  // Update spellcheck live when the preference changes
  useEffect(() => {
    editor?.setOptions({
      editorProps: { attributes: { spellcheck: spellCheck ? "true" : "false" } },
    });
  }, [editor, spellCheck]);

  // Cmd+K — open link dialog when editor is focused
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "k") return;
      if (!editor?.isFocused) return;
      e.preventDefault();
      const href = editor.getAttributes("link").href ?? "";
      setLinkDialog({ href });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  return (
    <div className="editor-wrapper">
      <div ref={scrollRef} className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
      {linkDialog && (
        <LinkDialog
          initialHref={linkDialog.href}
          onApply={(url) => {
            editor?.chain().focus().setLink({ href: url }).run();
            setLinkDialog(null);
          }}
          onRemove={() => {
            editor?.chain().focus().unsetLink().run();
            setLinkDialog(null);
          }}
          onCancel={() => setLinkDialog(null)}
        />
      )}
    </div>
  );
}
