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
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "tiptap-markdown";
import { commands } from "../lib/commands";
import { countWords } from "../lib/countWords";
import type { FindReplaceMode } from "../lib/editor/commands";
import {
  createImageDropHandler,
  createImagePasteHandler,
  IMAGE_MIME,
} from "../lib/editor/imagePaste";
import { useEditorCommands } from "../lib/editor/useEditorCommands";
import { useMarkdownSync } from "../lib/editor/useMarkdownSync";
import type { FlatFile } from "../lib/fileSearch";
import { normalizeMarkdownSpacing } from "../lib/markdown";
import { isPerfLoggingEnabled, logPerf, measureSync } from "../lib/perf";
import { matchOccurrenceRank, stripLineMarkers } from "../lib/searchJump";
import { ActiveHeadingIndicator } from "../lib/tiptap/ActiveHeadingIndicator";
import { collectMatches, FindReplace } from "../lib/tiptap/FindReplace";
import { Footnotes } from "../lib/tiptap/Footnotes";
import { H1Warning } from "../lib/tiptap/H1Warning";
import { IMEComposition } from "../lib/tiptap/IMEComposition";
import { ImageRenderer } from "../lib/tiptap/ImageRenderer";
import { InlineEditMode } from "../lib/tiptap/InlineEditMode";
import { LinkPreview } from "../lib/tiptap/LinkPreview";
import { ListBackspace } from "../lib/tiptap/ListBackspace";
import {
  BoldWithMarkdownShortcut,
  ItalicWithMarkdownShortcut,
  StrikeWithMarkdownShortcut,
} from "../lib/tiptap/markdownInputRules";
import { TextFolding } from "../lib/tiptap/TextFolding";
import {
  getTaskListTypingNormalization,
  getTypedTaskPrefixLength,
  normalizeTaskLists,
} from "../lib/tiptap/taskLists";
import { WikiLink } from "../lib/tiptap/WikiLink";
import type { SearchJumpTarget, WordCountKind } from "../lib/types";
import type { NoteResolverIndex, ResolvedWikiTarget } from "../lib/wikiLink";
import { BacklinksPanel } from "./BacklinksPanel";
import { BubbleMenu } from "./BubbleMenu";
import { CodeBlockView } from "./CodeBlockView";
import { FindReplaceBar } from "./FindReplaceBar";
import { LinkDialog } from "./LinkDialog";
import { TableControls } from "./TableControls";
import { TitleInput } from "./TitleInput";
import { WikiSuggestionPopover } from "./WikiSuggestionPopover";
import "katex/dist/katex.min.css";
import "../styles/editor.css";

const lowlight = createLowlight(common);

// Word counting walks the whole document via getText(); coalesce keystrokes
// so long documents don't pay that cost per character typed.
const WORD_COUNT_DEBOUNCE_MS = 300;

interface EditorProps {
  content?: string;
  filePath?: string;
  assetRoot?: string;
  cdnBase?: string;
  /** Wiki-link resolution (`[[Target]]` → `notes/foo.md`). Stable across renders. */
  resolveWikiTarget?: (target: string) => ResolvedWikiTarget;
  /** Called when the user clicks/Enter on a wiki link. Stable across renders. */
  onOpenWikiTarget?: (target: string, displayText: string | null) => void;
  /** Inputs for the "Linked references" backlinks panel at the bottom of the
   *  editor scroll area. Pass `undefined` (or omit) to disable the panel. */
  backlinks?: {
    currentRelativePath: string | null;
    flatFiles: FlatFile[];
    resolverIndex: NoteResolverIndex;
    onOpenSource: (sourcePath: string) => void;
  };
  typewriterMode?: boolean;
  spellCheck?: boolean;
  showH1Warning?: boolean;
  title?: string;
  onTitleChange?: (value: string) => void;
  initialSelection?: number;
  initialScrollTop?: number;
  /** Reports the document's word count with the file it belongs to and the
   *  report's provenance: a synchronous "open" once per mount, a synchronous
   *  "reload" on content swaps under the same mount, and debounced "typing"
   *  while editing. The synchronous emissions always precede the debounce,
   *  so the session word-count baseline for a path is its loaded size,
   *  never a mid-typing snapshot. */
  onWordCount?: (count: number, filePath?: string, kind?: WordCountKind) => void;
  onDirty?: () => void;
  onChange?: (markdown: string) => void;
  onError?: (msg: string) => void;
  onViewStateChange?: (viewState: { selection: number; scrollTop: number }) => void;
  registerPendingFlush?: (flush: (() => void) | null) => void;
  /** One-shot "scroll to this search match" request; consumed once the target
   *  file's content is on screen, then cleared via onSearchJumpHandled. */
  searchJump?: SearchJumpTarget | null;
  /** Lines the frontmatter occupies, to map the jump's full-file line number
   *  to a body line. */
  frontmatterLineOffset?: number;
  onSearchJumpHandled?: () => void;
}

export function Editor({
  content = "",
  filePath,
  assetRoot,
  cdnBase,
  resolveWikiTarget,
  onOpenWikiTarget,
  backlinks,
  typewriterMode = false,
  spellCheck = true,
  initialSelection,
  initialScrollTop,
  onWordCount,
  onDirty,
  onChange,
  onError,
  showH1Warning = false,
  title,
  onTitleChange,
  onViewStateChange,
  registerPendingFlush,
  searchJump,
  frontmatterLineOffset = 0,
  onSearchJumpHandled,
}: EditorProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const wordCountTimerRef = useRef<number | null>(null);
  const typewriterRef = useRef(typewriterMode);
  const updateStartedAtRef = useRef(0);
  const pendingRestoreTimersRef = useRef<number[]>([]);
  const pendingRestoreFramesRef = useRef<number[]>([]);
  const lastAppliedContentRef = useRef(content);
  useEffect(() => {
    typewriterRef.current = typewriterMode;
  }, [typewriterMode]);

  // Stable indirection so resolver/onOpen updates don't force a useEditor
  // re-instantiation — the extension options are baked in once but read
  // through the ref every time the node-view renders.
  const resolveWikiTargetRef = useRef(resolveWikiTarget);
  const onOpenWikiTargetRef = useRef(onOpenWikiTarget);
  useEffect(() => {
    resolveWikiTargetRef.current = resolveWikiTarget;
  }, [resolveWikiTarget]);
  useEffect(() => {
    onOpenWikiTargetRef.current = onOpenWikiTarget;
  }, [onOpenWikiTarget]);

  const [linkDialog, setLinkDialog] = useState<{ href: string } | null>(null);
  const [findReplaceMode, setFindReplaceMode] = useState<FindReplaceMode>("closed");

  const { serializeMarkdown, setCurrentEditor, cancelPendingSerialize, scheduleSerialize } =
    useMarkdownSync({ onChange, registerPendingFlush });

  const emitViewState = useCallback(
    (selection: number, scrollTop = scrollRef.current?.scrollTop ?? 0) => {
      onViewStateChange?.({ selection, scrollTop });
    },
    [onViewStateChange]
  );

  const formatMarkdownSpacing = useCallback(
    (editorInstance: NonNullable<ReturnType<typeof useEditor>>) => {
      cancelPendingSerialize();

      const currentMarkdown = serializeMarkdown(editorInstance);
      const formattedMarkdown = normalizeMarkdownSpacing(currentMarkdown);
      if (formattedMarkdown === currentMarkdown) return;

      const selectionFrom = editorInstance.state.selection.from;
      editorInstance.commands.setContent(formattedMarkdown, { emitUpdate: false });

      const maxPos = Math.max(1, editorInstance.state.doc.content.size);
      const nextSelection = TextSelection.create(
        editorInstance.state.doc,
        Math.min(Math.max(selectionFrom, 1), maxPos)
      );
      editorInstance.view.dispatch(
        editorInstance.state.tr.setSelection(nextSelection).setMeta("scrollIntoView", false)
      );

      onDirty?.();
      onChange?.(formattedMarkdown);
      emitViewState(nextSelection.from);
    },
    [cancelPendingSerialize, emitViewState, onChange, onDirty, serializeMarkdown]
  );

  const clearPendingRestore = useCallback(() => {
    for (const timer of pendingRestoreTimersRef.current) window.clearTimeout(timer);
    for (const frame of pendingRestoreFramesRef.current) window.cancelAnimationFrame(frame);
    pendingRestoreTimersRef.current = [];
    pendingRestoreFramesRef.current = [];
  }, []);

  const editor = useEditor({
    extensions: [
      // `link`, `bold`, `italic`, and `strike` are disabled here because we
      // register customised versions below: Link gets a `[text](url)` input
      // rule and `openOnClick: false`; Bold/Italic/Strike get CJK-friendly
      // regexes that fire mid Chinese/Japanese/Korean prose (StarterKit
      // requires whitespace before `**`/`*`/`~~`). StarterKit v3 includes
      // all four by default — keep these flags so it doesn't warn about
      // duplicates. Extracted versions live in
      // `src/lib/tiptap/markdownInputRules.ts`.
      StarterKit.configure({
        codeBlock: false,
        link: false,
        bold: false,
        italic: false,
        strike: false,
      }),
      IMEComposition,
      BoldWithMarkdownShortcut,
      ItalicWithMarkdownShortcut,
      StrikeWithMarkdownShortcut,
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
        placeholder: t("editor.placeholder"),
      }),
      Typography,
      Link.extend({
        addInputRules() {
          return [
            new InputRule({
              // Match completed [text](url) at the cursor. The `(?<!!)`
              // lookbehind skips image syntax (`![alt](src)`) so ImageRenderer's
              // own input rule can handle it without the Link rule racing in
              // and turning the bracketed slice into a link with a stray `!`.
              find: /(?<!!)\[([^[\]]+)\]\(([^()]+)\)$/,
              handler: ({ range, match, commands }) => {
                const [, text, href] = match;
                commands.insertContentAt(range, [
                  {
                    type: "text",
                    text,
                    marks: [{ type: "link", attrs: { href, rel: "noopener noreferrer" } }],
                  },
                ]);
              },
            }),
          ];
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      WikiLink.configure({
        resolve: (target) =>
          resolveWikiTargetRef.current?.(target) ?? { relativePath: "", exists: false },
        onOpen: (target, displayText) => onOpenWikiTargetRef.current?.(target, displayText),
      }),
      ImageRenderer.configure({ filePath, assetRoot, cdnBase }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics,
      LinkPreview,
      FindReplace,
      Footnotes,
      ActiveHeadingIndicator,
      ListBackspace,
      TextFolding,
      InlineEditMode,
      ...(showH1Warning ? [H1Warning] : []),
    ],
    content,
    editorProps: {
      attributes: {
        spellcheck: spellCheck ? "true" : "false",
        autocorrect: "off",
        autocapitalize: "none",
      },
      handleKeyDown(view, event) {
        if (event.key !== "Tab") return false;
        const { state } = view;
        const { $from } = state.selection;
        for (let d = $from.depth; d >= 0; d--) {
          if ($from.node(d).type.name === "codeBlock") {
            event.preventDefault();
            view.dispatch(state.tr.insertText("  "));
            return true;
          }
        }
        return false;
      },
      handlePaste(view, event) {
        if (
          createImagePasteHandler({
            filePath,
            onError,
            t,
            saveFromBytes: commands.assets.saveFromBytes,
          })(view, event)
        ) {
          return true;
        }
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
        view.focus();
        view.dispatch(view.state.tr.addMark(from, to, linkMark));
        return true;
      },
      handleDOMEvents: {
        dragover(_view, event) {
          if (
            Array.from(event.dataTransfer?.items ?? []).some((item) => IMAGE_MIME.test(item.type))
          ) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      handleDrop(view, event) {
        return createImageDropHandler({
          filePath,
          onError,
          t,
          saveFromBytes: commands.assets.saveFromBytes,
        })(view, event);
      },
    },
    onUpdate({ editor }) {
      clearPendingRestore();
      setCurrentEditor(editor);
      updateStartedAtRef.current = performance.now();
      const isUserEdit = editor.isFocused;
      const { selection } = editor.state;
      const currentBlock =
        selection.$from.parent.type.name === "paragraph" ? selection.$from : null;
      const ancestorNodeNames: string[] = [];
      for (let depth = selection.$from.depth; depth >= 0; depth--) {
        ancestorNodeNames.push(selection.$from.node(depth).type.name);
      }

      // Cheap guards first: only the caret's own block is serialized per
      // keystroke; the full-document getJSON() (measurable in long documents)
      // runs only when the block actually carries a typed task prefix inside
      // a bullet list — the case normalization can act on.
      const currentBlockJson =
        currentBlock !== null && ancestorNodeNames.includes("bulletList")
          ? currentBlock.parent.toJSON()
          : undefined;
      const typingNormalization =
        currentBlockJson !== undefined && getTypedTaskPrefixLength(currentBlockJson) !== null
          ? measureSync(
              "editor.taskListNormalization",
              () =>
                getTaskListTypingNormalization(
                  editor.getJSON(),
                  currentBlockJson,
                  selection.from,
                  ancestorNodeNames
                ),
              {
                selectionDepth: selection.$from.depth,
                docSize: editor.state.doc.content.size,
              }
            )
          : null;

      if (typingNormalization) {
        editor.commands.setContent(typingNormalization.normalized, { emitUpdate: false });
        editor.commands.setTextSelection(typingNormalization.targetPos);
      }

      if (isUserEdit) {
        onDirty?.();
      }
      if (isUserEdit) {
        scheduleSerialize(editor);
      }

      if (onWordCount) {
        // Debounced: getText() walks the whole document — don't pay that per
        // keystroke. The timeout also lands after the current render commits,
        // which matters because ProseMirror dispatches an initial transaction
        // while `useEditor` is still constructing (a synchronous onWordCount
        // would setState in App mid-render). The immediate count on file load
        // comes from the mount/content-change effects below, not this path.
        if (wordCountTimerRef.current !== null) window.clearTimeout(wordCountTimerRef.current);
        wordCountTimerRef.current = window.setTimeout(() => {
          wordCountTimerRef.current = null;
          if (editor.isDestroyed) return;
          const text = measureSync("editor.wordCountText", () => editor.getText(), {
            docSize: editor.state.doc.content.size,
          });
          onWordCount(countWords(text), filePath, "typing");
        }, WORD_COUNT_DEBOUNCE_MS);
      }

      if (isPerfLoggingEnabled()) {
        logPerf("editor.commit", performance.now() - updateStartedAtRef.current, {
          docSize: editor.state.doc.content.size,
          selectionDepth: selection.$from.depth,
          normalized: typingNormalization ? 1 : 0,
        });
      }

      emitViewState(selection.from);
    },
    onSelectionUpdate({ editor: ed }) {
      clearPendingRestore();
      if (typewriterRef.current && scrollRef.current) {
        measureSync(
          "editor.typewriterScroll",
          () => {
            const { from } = ed.view.state.selection;
            const coords = ed.view.coordsAtPos(from);
            if (coords.top === 0 && coords.bottom === 0) return;
            const scrollEl = scrollRef.current;
            if (!scrollEl) return;
            const rect = scrollEl.getBoundingClientRect();
            const cursorRelTop = coords.top - rect.top;
            const target = scrollEl.scrollTop + cursorRelTop - rect.height / 2;
            scrollEl.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
          },
          {
            docSize: ed.state.doc.content.size,
          }
        );
      }
      emitViewState(ed.state.selection.from);
    },
  });

  useEffect(() => {
    setCurrentEditor(editor);
  }, [editor, setCurrentEditor]);

  useEffect(
    () => () => {
      if (wordCountTimerRef.current !== null) window.clearTimeout(wordCountTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!editor || content === lastAppliedContentRef.current) return;
    lastAppliedContentRef.current = content;
    clearPendingRestore();
    editor.commands.setContent(content, { emitUpdate: false });
    onWordCount?.(countWords(editor.getText()), filePath, "reload");
  }, [clearPendingRestore, content, editor, filePath, onWordCount]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !editor) return;
    function handleScroll(event: Event) {
      const target = event.currentTarget;
      if (!(target instanceof HTMLDivElement)) return;
      emitViewState(editor.state.selection.from, target.scrollTop);
    }
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [editor, emitViewState]);

  useEffect(() => {
    if (!editor) return;
    clearPendingRestore();
    const restoreViewState = () => {
      if (initialSelection !== undefined) {
        const maxPos = Math.max(1, editor.state.doc.content.size);
        const nextSelection = TextSelection.create(
          editor.state.doc,
          Math.min(Math.max(initialSelection, 1), maxPos)
        );
        editor.view.dispatch(
          editor.state.tr.setSelection(nextSelection).setMeta("scrollIntoView", false)
        );
      }
      if (scrollRef.current && initialScrollTop !== undefined) {
        scrollRef.current.scrollTop = initialScrollTop;
      }
    };
    pendingRestoreFramesRef.current.push(window.requestAnimationFrame(restoreViewState));
    for (const delayMs of [16, 48, 96, 180, 320]) {
      pendingRestoreTimersRef.current.push(
        window.setTimeout(() => {
          pendingRestoreFramesRef.current.push(window.requestAnimationFrame(restoreViewState));
        }, delayMs)
      );
    }
    return () => {
      clearPendingRestore();
    };
  }, [clearPendingRestore, editor, initialScrollTop, initialSelection]);

  // Consume a pending search-match jump once this editor shows the target
  // file. Declared *after* the view-state-restoration effect so it can cancel
  // that effect's scheduled restore (RAF + timers up to 320 ms) via
  // clearPendingRestore — otherwise a delayed restore would reset selection
  // and scroll back to the saved position, undoing the jump on a
  // previously-visited file. The lastAppliedContentRef guard makes it wait
  // for the content-apply effect above.
  useEffect(() => {
    if (!editor || !searchJump || searchJump.path !== filePath) return;
    if (lastAppliedContentRef.current !== content) return;
    const doc = editor.state.doc;
    // Rank identical body lines by proximity to the match's mapped body line,
    // and select the same-rank in-document hit (collectMatches yields hits in
    // document order) — so a repeated line jumps to the clicked occurrence,
    // not the first on the page. The raw line often carries Markdown syntax
    // (`# Heading`, `**bold**`) the rendered doc text lacks, so fall back to a
    // marker-stripped line, then to the query's first occurrence.
    let lineHits = collectMatches(doc, searchJump.lineContent);
    // Rank candidates with the same transform that produced the hits, so the
    // occurrence count matches the hit set being indexed.
    let normalize: (line: string) => string = (line) => line.trim();
    if (lineHits.length === 0) {
      const stripped = stripLineMarkers(searchJump.lineContent);
      if (stripped && stripped !== searchJump.lineContent.trim()) {
        lineHits = collectMatches(doc, stripped);
        normalize = stripLineMarkers;
      }
    }
    let target: { from: number; to: number } | undefined;
    if (lineHits.length > 0) {
      const targetBodyLine = searchJump.lineNumber - 1 - frontmatterLineOffset;
      const rank = matchOccurrenceRank(
        content.split("\n"),
        searchJump.lineContent,
        targetBodyLine,
        normalize
      );
      target = lineHits[Math.min(rank, lineHits.length - 1)];
    } else {
      target = collectMatches(doc, searchJump.query)[0];
    }
    if (target) {
      // Cancel any pending view-state restore first, so it can't fire later
      // and clobber the jump we're about to apply.
      clearPendingRestore();
      editor
        .chain()
        .focus()
        .setTextSelection({ from: target.from, to: target.to })
        .scrollIntoView()
        .run();
    }
    onSearchJumpHandled?.();
  }, [
    editor,
    searchJump,
    filePath,
    content,
    frontmatterLineOffset,
    clearPendingRestore,
    onSearchJumpHandled,
  ]);

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
    const original = editor.getJSON();
    const originalStr = JSON.stringify(original);
    const normalized = normalizeTaskLists(original);
    const normalizedStr = JSON.stringify(normalized);
    if (normalizedStr === originalStr) return;
    editor.commands.setContent(normalized, { emitUpdate: false });
  }, [editor]);

  // The keyed remount initialises lastAppliedContentRef to the already-loaded
  // content, so the content-swap effect above never fires for the mount
  // document — and the debounced onWordCount path from the construction
  // transaction lands ~300ms later, far too late to baseline the session
  // word-count against. Emit the mounted document's count synchronously,
  // once per editor instance. Declared after the task-list normalization
  // effect (effects run in declaration order) so legacy "[x]" text tokens
  // are gone before the baseline is measured.
  const initialCountEmittedRef = useRef(false);
  useEffect(() => {
    if (!editor || initialCountEmittedRef.current) return;
    initialCountEmittedRef.current = true;
    onWordCount?.(countWords(editor.getText()), filePath, "open");
  }, [editor, filePath, onWordCount]);

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

  // All keyboard shortcuts + native menu-action events dispatch from one
  // declarative command table — see src/lib/editor/commands.ts. Adding a
  // new editor command is one row there + (optionally) one entry in
  // src-tauri/src/menu.rs; this hook does not need to change.
  const commandsCtx = useMemo(
    () => ({
      filePath,
      onError,
      setLinkDialog,
      findReplaceMode,
      setFindReplaceMode,
      formatMarkdownSpacing,
      linkDialogOpen: linkDialog !== null,
      t,
    }),
    [filePath, onError, formatMarkdownSpacing, findReplaceMode, linkDialog, t]
  );
  useEditorCommands(editor, commandsCtx);

  return (
    <div className="editor-wrapper">
      <div ref={scrollRef} className="editor-scroll">
        {onTitleChange !== undefined && (
          <TitleInput
            title={title ?? ""}
            onChange={onTitleChange}
            onSubmit={() => editor?.commands.focus("end")}
          />
        )}
        <EditorContent editor={editor} />
        {backlinks && (
          <BacklinksPanel
            currentRelativePath={backlinks.currentRelativePath}
            flatFiles={backlinks.flatFiles}
            resolverIndex={backlinks.resolverIndex}
            onOpenSource={backlinks.onOpenSource}
          />
        )}
      </div>
      {editor && findReplaceMode !== "closed" && (
        <FindReplaceBar
          editor={editor}
          showReplace={findReplaceMode === "replace"}
          onClose={() => {
            setFindReplaceMode("closed");
            editor.chain().focus().run();
          }}
        />
      )}
      {editor && <TableControls editor={editor} />}
      {editor && backlinks && (
        <WikiSuggestionPopover
          editor={editor}
          flatFiles={backlinks.flatFiles}
          resolverIndex={backlinks.resolverIndex}
        />
      )}
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
