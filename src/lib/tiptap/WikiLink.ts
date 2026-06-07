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
});
