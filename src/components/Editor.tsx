import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Mathematics } from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import Typography from "@tiptap/extension-typography";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "tiptap-markdown";
import { FindReplace } from "../lib/tiptap/FindReplace";
import { LinkPreview } from "../lib/tiptap/LinkPreview";
import { TextFolding } from "../lib/tiptap/TextFolding";
import { BubbleMenu } from "./BubbleMenu";
import { CodeBlockView } from "./CodeBlockView";
import { FindReplaceBar } from "./FindReplaceBar";
import { LinkDialog } from "./LinkDialog";
import { TableControls } from "./TableControls";
import "katex/dist/katex.min.css";
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
  const [showFindReplace, setShowFindReplace] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight }),
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
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics,
      LinkPreview,
      FindReplace,
      TextFolding,
    ],
    content,
    editorProps: {
      attributes: { spellcheck: spellCheck ? "true" : "false" },
      handlePaste(view, event) {
        const text = (event.clipboardData?.getData("text/plain") ?? "").trim();
        if (!/^https?:\/\/\S+$/.test(text)) return false;
        if (view.state.selection.empty) return false;
        // Paste a URL with text selected → apply it as a link mark
        event.preventDefault();
        const { from, to } = view.state.selection;
        const linkMark = view.state.schema.marks.link.create({
          href: text,
          rel: "noopener noreferrer",
        });
        view.dispatch(view.state.tr.addMark(from, to, linkMark));
        return true;
      },
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
      if (!(e.metaKey || e.ctrlKey) || e.key?.toLowerCase() !== "k") return;
      if (!editor?.isFocused) return;
      e.preventDefault();
      const href = editor.getAttributes("link").href ?? "";
      setLinkDialog({ href });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  // Cmd+E — toggle inline code; intercept before WKWebView's "Use Selection for Find"
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key?.toLowerCase() !== "e") return;
      if (!editor?.isFocused) return;
      e.preventDefault();
      editor.chain().focus().toggleCode().run();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  // Cmd+Shift+V — paste as plain text, stripping all rich formatting
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key?.toLowerCase() !== "v") return;
      if (!editor?.isFocused) return;
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        editor.chain().focus().insertContent(text).run();
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  // Cmd+H — open / close find & replace bar
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key?.toLowerCase() !== "h") return;
      if (!editor?.isFocused && !showFindReplace) return;
      e.preventDefault();
      setShowFindReplace((v) => !v);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, showFindReplace]);

  // Insert / Format menu commands forwarded from the native menu bar
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    listen<string>("menu-action", (event) => {
      if (!editor || linkDialog) return;
      switch (event.payload) {
        case "format-bold":
          editor.chain().focus().toggleBold().run();
          break;
        case "format-italic":
          editor.chain().focus().toggleItalic().run();
          break;
        case "format-strike":
          editor.chain().focus().toggleStrike().run();
          break;
        case "format-code":
          editor.chain().focus().toggleCode().run();
          break;
        case "format-heading-1":
          editor.chain().focus().toggleHeading({ level: 1 }).run();
          break;
        case "format-heading-2":
          editor.chain().focus().toggleHeading({ level: 2 }).run();
          break;
        case "format-heading-3":
          editor.chain().focus().toggleHeading({ level: 3 }).run();
          break;
        case "format-blockquote":
          editor.chain().focus().toggleBlockquote().run();
          break;
        case "format-bullet-list":
          editor.chain().focus().toggleBulletList().run();
          break;
        case "format-ordered-list":
          editor.chain().focus().toggleOrderedList().run();
          break;
        case "insert-link": {
          const href = editor.getAttributes("link").href ?? "";
          setLinkDialog({ href });
          break;
        }
        case "insert-code-block":
          editor.chain().focus().toggleCodeBlock().run();
          break;
        case "insert-hr":
          editor.chain().focus().setHorizontalRule().run();
          break;
        case "insert-table":
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          break;
      }
    }).then((fn) => {
      if (mounted) {
        unlisten = fn;
      } else {
        fn();
      }
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [editor, linkDialog]);

  return (
    <div className="editor-wrapper">
      <div ref={scrollRef} className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
      {editor && showFindReplace && (
        <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
      )}
      {editor && <TableControls editor={editor} />}
      {editor && (
        <BubbleMenu
          editor={editor}
          onLinkClick={() => {
            const href = editor.getAttributes("link").href ?? "";
            setLinkDialog({ href });
          }}
        />
      )}
      {linkDialog && (
        <LinkDialog
          initialHref={linkDialog.href}
          onApply={(url) => {
            editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            setLinkDialog(null);
          }}
          onRemove={() => {
            editor?.chain().focus().extendMarkRange("link").unsetLink().run();
            setLinkDialog(null);
          }}
          onCancel={() => setLinkDialog(null)}
        />
      )}
    </div>
  );
}
