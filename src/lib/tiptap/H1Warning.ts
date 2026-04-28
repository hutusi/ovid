import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const H1_WARNING_KEY = new PluginKey<DecorationSet>("h1Warning");

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name === "heading" && node.attrs.level === 1) {
      decorations.push(
        Decoration.node(offset, offset + node.nodeSize, {
          class: "h1-warning",
        })
      );
    }
  });
  return decorations.length > 0
    ? DecorationSet.create(state.doc, decorations)
    : DecorationSet.empty;
}

export const H1Warning = Extension.create({
  name: "h1Warning",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: H1_WARNING_KEY,
        state: {
          init(_config, state) {
            return buildDecorations(state);
          },
          apply(tr, prev, _oldState, newState) {
            if (!tr.docChanged) return prev;
            return buildDecorations(newState);
          },
        },
        props: {
          decorations(state) {
            return H1_WARNING_KEY.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
