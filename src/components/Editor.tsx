import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { InputRule } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
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
import { ImageRenderer } from "../lib/tiptap/ImageRenderer";
import { InlineEditMode } from "../lib/tiptap/InlineEditMode";
import { LinkPreview } from "../lib/tiptap/LinkPreview";
import { TextFolding } from "../lib/tiptap/TextFolding";
import { normalizeTaskLists } from "../lib/tiptap/taskLists";
import { BubbleMenu } from "./BubbleMenu";
import { CodeBlockView } from "./CodeBlockView";
import { FindReplaceBar } from "./FindReplaceBar";
import { LinkDialog } from "./LinkDialog";
import { TableControls } from "./TableControls";
import "katex/dist/katex.min.css";
import "../styles/editor.css";

const lowlight = createLowlight(common);

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

async function pickAndInsertImage(
  editor: ReturnType<typeof useEditor>,
  filePath: string | undefined,
  onError?: (msg: string) => void
) {
  if (!editor) return;
  try {
    const srcPath = await invoke<string | null>("pick_image_file");
    if (!srcPath) return;
    const relPath = await invoke<string>("save_asset", { srcPath, activeFilePath: filePath });
    // Split on both / and \ to handle Windows paths correctly
    const fileName = (srcPath.split(/[/\\]/).pop() ?? "image").replace(/\.[^.]+$/, "");
    editor.chain().focus().setImage({ src: relPath, alt: fileName }).run();
  } catch (err) {
    const msg = `Failed to insert image: ${err instanceof Error ? err.message : err}`;
    if (onError) onError(msg);
    else console.error(msg);
  }
}

interface EditorProps {
  content?: string;
  filePath?: string;
  assetRoot?: string;
  cdnBase?: string;
  typewriterMode?: boolean;
  spellCheck?: boolean;
  onWordCount?: (count: number) => void;
  onChange?: (markdown: string) => void;
  onError?: (msg: string) => void;
}

export function Editor({
  content = "",
  filePath,
  assetRoot,
  cdnBase,
  typewriterMode = false,
  spellCheck = true,
  onWordCount,
  onChange,
  onError,
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
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
      Typography,
      Link.extend({
        addInputRules() {
          return [
            new InputRule({
              // Match completed [text](url) at the cursor
              find: /\[([^[\]]+)\]\(([^()]+)\)$/,
              handler: ({ range, match, chain }) => {
                const [, text, href] = match;
                chain()
                  .deleteRange(range)
                  .insertContentAt(range.from, {
                    type: "text",
                    text,
                    marks: [{ type: "link", attrs: { href, rel: "noopener noreferrer" } }],
                  })
                  .run();
              },
            }),
          ];
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      ImageRenderer.configure({ filePath, assetRoot, cdnBase }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics,
      LinkPreview,
      FindReplace,
      TextFolding,
      InlineEditMode,
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
            const msg = `Failed to drop image: ${r.reason}`;
            if (onError) onError(msg);
            else console.error(msg);
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

  // Update spellcheck live — set directly on the DOM to avoid replacing editorProps
  useEffect(() => {
    if (!editor) return;
    try {
      editor.view.dom.setAttribute("spellcheck", spellCheck ? "true" : "false");
    } catch {
      // view not yet mounted — initial value is set via editorProps in useEditor
    }
  }, [editor, spellCheck]);

  // Some Markdown inputs still parse task syntax as plain bullet items
  // with a leading "[ ]" or "[x]" text token. Normalize that once on load
  // so opened files render as real task lists with interactive checkboxes.
  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeTaskLists(editor.getJSON());
    if (JSON.stringify(normalized) === JSON.stringify(editor.getJSON())) return;
    editor.commands.setContent(normalized, false);
  }, [editor]);

  // Click on the ](url) hint from InlineEditMode → open link dialog
  // Use scrollRef instead of editor.view.dom to avoid accessing the view before it's mounted
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !editor) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("link-url-hint")) return;
      e.preventDefault();
      const href = editor.getAttributes("link").href ?? "";
      setLinkDialog({ href });
    }
    container.addEventListener("mousedown", onMouseDown);
    return () => container.removeEventListener("mousedown", onMouseDown);
  }, [editor]);

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
      navigator.clipboard
        .readText()
        .then((text) => {
          editor.view.dispatch(editor.view.state.tr.insertText(text));
        })
        .catch((err) => {
          console.error("Failed to read clipboard:", err);
        });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  // Cmd+Shift+I — open file picker and insert image
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key?.toLowerCase() !== "i") return;
      if (!editor?.isFocused) return;
      e.preventDefault();
      pickAndInsertImage(editor, filePath, onError);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, filePath, onError]);

  // Cmd+H — open / close find & replace bar
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key?.toLowerCase() !== "h") return;
      if (!editor?.isFocused && !showFindReplace) return;
      e.preventDefault();
      setShowFindReplace((v) => {
        if (v) editor?.chain().focus().run();
        return !v;
      });
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
        case "format-task-list":
          editor.chain().focus().toggleTaskList().run();
          break;
        case "insert-link": {
          const href = editor.getAttributes("link").href ?? "";
          setLinkDialog({ href });
          break;
        }
        case "insert-image":
          pickAndInsertImage(editor, filePath, onError);
          break;
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
  }, [editor, linkDialog, filePath, onError]);

  return (
    <div className="editor-wrapper">
      <div ref={scrollRef} className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
      {editor && showFindReplace && (
        <FindReplaceBar
          editor={editor}
          onClose={() => {
            setShowFindReplace(false);
            editor.chain().focus().run();
          }}
        />
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
