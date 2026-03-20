import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const ACTIVE_HEADING_KEY = new PluginKey<DecorationSet>("activeHeadingIndicator");

function buildDecorations(state: EditorState) {
  const { selection } = state;
  const { $from } = selection;

  if ($from.parent.type.name !== "heading") {
    return DecorationSet.empty;
  }

  const level = Number($from.parent.attrs.level);
  if (!Number.isFinite(level)) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(state.doc, [
    Decoration.node($from.before(), $from.after(), {
      class: "is-active-heading",
      "data-heading-level": String(level),
    }),
  ]);
}

export const ActiveHeadingIndicator = Extension.create({
  name: "activeHeadingIndicator",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: ACTIVE_HEADING_KEY,
        state: {
          init(_config, state) {
            return buildDecorations(state);
          },
          apply(tr, prev, _oldState, newState) {
            if (!tr.docChanged && !tr.selectionSet) {
              return prev;
            }

            return buildDecorations(newState);
          },
        },
        props: {
          decorations(state) {
            return ACTIVE_HEADING_KEY.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
