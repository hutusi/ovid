import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface FindReplacePluginState {
  decorations: DecorationSet;
  matches: Array<{ from: number; to: number }>;
  currentIndex: number;
}

export const FIND_REPLACE_KEY = new PluginKey<FindReplacePluginState>("findReplace");
const META_KEY = "findReplaceMeta";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      setFindTerm: (term: string) => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      replaceOne: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

function collectMatches(doc: Node, term: string): Array<{ from: number; to: number }> {
  if (!term) return [];
  const matches: Array<{ from: number; to: number }> = [];
  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    regex.lastIndex = 0;
    let m = regex.exec(node.text);
    while (m !== null) {
      matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      m = regex.exec(node.text);
    }
  });
  return matches;
}

function buildDecorations(
  doc: Node,
  matches: Array<{ from: number; to: number }>,
  currentIndex: number
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === currentIndex ? "find-match-current" : "find-match",
      })
    )
  );
}

export const FindReplace = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    let searchTerm = "";

    return [
      new Plugin<FindReplacePluginState>({
        key: FIND_REPLACE_KEY,
        state: {
          init() {
            return { decorations: DecorationSet.empty, matches: [], currentIndex: 0 };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(META_KEY) as
              | { searchTerm?: string; currentIndex?: number }
              | undefined;

            if (meta?.searchTerm !== undefined) searchTerm = meta.searchTerm;

            const currentIndex = meta?.currentIndex ?? prev.currentIndex;
            const needsRecompute = meta?.searchTerm !== undefined || tr.docChanged;
            const matches = needsRecompute ? collectMatches(tr.doc, searchTerm) : prev.matches;
            const clampedIndex =
              matches.length > 0 ? Math.min(currentIndex, matches.length - 1) : 0;

            return {
              decorations: buildDecorations(tr.doc, matches, clampedIndex),
              matches,
              currentIndex: clampedIndex,
            };
          },
        },
        props: {
          decorations(state) {
            return FIND_REPLACE_KEY.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setFindTerm:
        (term) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(META_KEY, { searchTerm: term, currentIndex: 0 });
            tr.setMeta("addToHistory", false);
            dispatch(tr);
          }
          return true;
        },

      findNext:
        () =>
        ({ tr, dispatch, editor }) => {
          const ps = FIND_REPLACE_KEY.getState(editor.state);
          if (!ps || ps.matches.length === 0) return false;
          const nextIndex = (ps.currentIndex + 1) % ps.matches.length;
          const match = ps.matches[nextIndex];
          if (dispatch) {
            tr.setMeta(META_KEY, { currentIndex: nextIndex });
            tr.setMeta("addToHistory", false);
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
            dispatch(tr);
          }
          return true;
        },

      findPrev:
        () =>
        ({ tr, dispatch, editor }) => {
          const ps = FIND_REPLACE_KEY.getState(editor.state);
          if (!ps || ps.matches.length === 0) return false;
          const prevIndex = (ps.currentIndex - 1 + ps.matches.length) % ps.matches.length;
          const match = ps.matches[prevIndex];
          if (dispatch) {
            tr.setMeta(META_KEY, { currentIndex: prevIndex });
            tr.setMeta("addToHistory", false);
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
            dispatch(tr);
          }
          return true;
        },

      replaceOne:
        (replacement) =>
        ({ tr, dispatch, editor }) => {
          const ps = FIND_REPLACE_KEY.getState(editor.state);
          if (!ps || ps.matches.length === 0) return false;
          const match = ps.matches[ps.currentIndex];
          if (!match) return false;
          if (dispatch) {
            if (replacement) {
              tr.replaceWith(match.from, match.to, editor.state.schema.text(replacement));
            } else {
              tr.delete(match.from, match.to);
            }
            dispatch(tr);
          }
          return true;
        },

      replaceAll:
        (replacement) =>
        ({ tr, dispatch, editor }) => {
          const ps = FIND_REPLACE_KEY.getState(editor.state);
          if (!ps || ps.matches.length === 0) return false;
          if (dispatch) {
            // Iterate end-to-start so earlier positions stay valid
            for (let i = ps.matches.length - 1; i >= 0; i--) {
              const m = ps.matches[i];
              if (replacement) {
                tr.replaceWith(m.from, m.to, editor.state.schema.text(replacement));
              } else {
                tr.delete(m.from, m.to);
              }
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
