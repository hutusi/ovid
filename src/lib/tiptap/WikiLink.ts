// WikiLink: Obsidian-style `[[Target]]` (and `[[Target|Display]]`) inline node.
//
// Round-trip seams:
//   - typed → node: `addInputRules` matches `[[…]]$` at the cursor. Tiptap's
//     own input-rules plugin already runs after the global IMEComposition
//     guard (priority 1000), so CJK pinyin commits never trigger this rule
//     mid-composition.
//   - markdown load → node: `addStorage.markdown.parse.setup` registers a
//     markdown-it inline rule that consumes `[[…]]` and renders the matching
//     HTML token (`<a data-wiki-target=…>`) that Tiptap's `parseHTML` then
//     adopts.
//   - node → markdown save: `addStorage.markdown.serialize` writes the
//     `[[target]]` or `[[target|display]]` form verbatim.
//
// Resolution (resolved vs. unresolved styling, click target) is delegated to
// the consumer via the `resolve` and `onOpen` options — this extension
// intentionally does not know about FlatFile, useEditorSession, or React
// state. See `src/lib/wikiLink.ts` for the resolver and
// `src/components/WikiLinkView.tsx` for the node-view that consumes both.

import { Node, nodeInputRule } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type { MarkdownSerializerState } from "prosemirror-markdown";
import { WikiLinkView } from "../../components/WikiLinkView";
import { parseWikiLink, type ResolvedWikiTarget } from "../wikiLink";

export interface WikiLinkOptions {
  /** Called by the node-view to decide resolved/unresolved styling. */
  resolve?: (target: string) => ResolvedWikiTarget;
  /** Called when the user clicks or presses Enter on a wiki link. */
  onOpen?: (target: string, displayText: string | null) => void;
  /** Class applied to the rendered `<a>` element. */
  className?: string;
}

// markdown-it tokens carry the raw inner text (no brackets) under `content`.
const TOKEN_NAME = "wikilink";

// tiptap-markdown calls every extension's `parse.setup` on every parse, sharing
// one MarkdownIt instance per editor — guard against duplicate registration so
// the inline ruler doesn't grow unboundedly on each file load.
const REGISTERED_FLAG = Symbol.for("ovid.wikiLink.markdownItRegistered");

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Inline rule: at `[[`, scan forward for the matching `]]` on the same line
// and emit a single self-closing `wikilink` token. We intentionally do not
// consume across newlines (Obsidian's behaviour), and we skip a target with
// an empty `[[]]` body so it stays as literal brackets.
function wikiLinkInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
  if (state.src.charCodeAt(start + 1) !== 0x5b) return false;
  const closeStart = state.src.indexOf("]]", start + 2);
  if (closeStart === -1) return false;
  const inner = state.src.slice(start + 2, closeStart);
  if (inner.length === 0) return false;
  if (/\n/.test(inner)) return false;
  if (inner.includes("[[") || inner.includes("]]")) return false;
  if (!silent) {
    const token = state.push(TOKEN_NAME, "", 0);
    token.content = inner;
    token.markup = "[[]]";
  }
  state.pos = closeStart + 2;
  return true;
}

// ---------------------------------------------------------------------------
// Suggestion plugin: tracks an in-progress `[[query` typed pattern at the
// caret so the popover (rendered from React) can show note autocomplete.
//
// The state is *derived* from doc text each transaction — there's no event
// channel from typing to popover beyond the regular PM transaction. The
// popover subscribes via `editor.on("transaction")` and reads the state
// through `wikiLinkSuggestionKey.getState`.
// ---------------------------------------------------------------------------

export interface WikiLinkSuggestionState {
  active: boolean;
  /** Position of the first `[` in `[[…` (where insertion should replace). */
  from: number;
  /** Current cursor position (end of the query text). */
  to: number;
  /** Text typed after `[[` and before the cursor. May be empty. */
  query: string;
}

const INACTIVE: WikiLinkSuggestionState = { active: false, from: 0, to: 0, query: "" };

// Restricted to the active line, with no newlines in the query: a user who
// hits Enter mid-suggestion is conclusively done with the popover.
const SUGGESTION_RE = /\[\[([^[\]\n]*)$/;

export function computeWikiLinkSuggestionState(state: EditorState): WikiLinkSuggestionState {
  const { from, to } = state.selection;
  // Multi-character selections never trigger the popover — the user is
  // clearly not in the middle of typing a fresh `[[…`.
  if (from !== to) return INACTIVE;
  const $pos = state.doc.resolve(from);
  if (!$pos.parent.isTextblock) return INACTIVE;
  // Limit lookback to the parent textblock so a `[[` two paragraphs above
  // doesn't keep triggering the popover.
  const parentStart = $pos.start();
  const textBefore = state.doc.textBetween(parentStart, from, "\n", "\0");
  const match = SUGGESTION_RE.exec(textBefore);
  if (!match) return INACTIVE;
  const query = match[1];
  const fromPos = from - query.length - 2;
  return { active: true, from: fromPos, to: from, query };
}

export const wikiLinkSuggestionKey = new PluginKey<WikiLinkSuggestionState>("wikiLinkSuggestion");

function wikiLinkSuggestionPlugin(): Plugin<WikiLinkSuggestionState> {
  return new Plugin<WikiLinkSuggestionState>({
    key: wikiLinkSuggestionKey,
    state: {
      init: (_config, state) => computeWikiLinkSuggestionState(state),
      apply: (_tr, _prev, _oldState, newState) => computeWikiLinkSuggestionState(newState),
    },
  });
}

export function registerWikiLinkMarkdownItRule(md: MarkdownIt): void {
  const marker = md as unknown as Record<symbol, boolean>;
  if (marker[REGISTERED_FLAG]) return;
  marker[REGISTERED_FLAG] = true;
  md.inline.ruler.before("link", TOKEN_NAME, wikiLinkInlineRule);
  md.renderer.rules[TOKEN_NAME] = (tokens, idx) => {
    const { target, displayText } = parseWikiLink(tokens[idx].content);
    const label = displayText ?? target;
    const displayAttr =
      displayText !== null ? ` data-wiki-display="${escapeHtml(displayText)}"` : "";
    return `<a class="wiki-link" data-wiki-target="${escapeHtml(target)}"${displayAttr}>${escapeHtml(label)}</a>`;
  };
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      resolve: undefined,
      onOpen: undefined,
      className: "wiki-link",
    };
  },

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-wiki-target") ?? "",
        renderHTML: (attrs) => ({ "data-wiki-target": attrs.target as string }),
      },
      displayText: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-wiki-display"),
        renderHTML: (attrs) =>
          attrs.displayText ? { "data-wiki-display": attrs.displayText as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-wiki-target]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = (node.attrs.target as string) ?? "";
    const displayText = node.attrs.displayText as string | null;
    const label = displayText ?? target;
    return [
      "a",
      {
        ...HTMLAttributes,
        class: this.options.className ?? "wiki-link",
        "data-wiki-target": target,
        ...(displayText ? { "data-wiki-display": displayText } : {}),
      },
      label,
    ];
  },

  renderText({ node }) {
    const target = (node.attrs.target as string) ?? "";
    const displayText = node.attrs.displayText as string | null;
    return displayText ? `[[${target}|${displayText}]]` : `[[${target}]]`;
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[([^[\]\n]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => {
          const { target, displayText } = parseWikiLink(match[1]);
          return { target, displayText };
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: import("prosemirror-model").Node) {
          const target = (node.attrs.target as string) ?? "";
          const displayText = node.attrs.displayText as string | null;
          state.write(displayText ? `[[${target}|${displayText}]]` : `[[${target}]]`);
        },
        parse: {
          setup(md: MarkdownIt) {
            registerWikiLinkMarkdownItRule(md);
          },
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addProseMirrorPlugins() {
    return [wikiLinkSuggestionPlugin()];
  },
});
