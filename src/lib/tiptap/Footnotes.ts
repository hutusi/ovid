import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const FOOTNOTE_REF_RE = /\[\^([^\]]+)\]/g;
const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:\s+/;

const FOOTNOTES_KEY = new PluginKey<DecorationSet>("footnotes");

export interface FootnoteReferenceRange {
  from: number;
  to: number;
  id: string;
}

export interface FootnoteDefinitionRange {
  from: number;
  to: number;
  id: string;
}

export function collectFootnoteReferences(doc: Node): FootnoteReferenceRange[] {
  const ranges: FootnoteReferenceRange[] = [];

  doc.descendants((node, pos, parent) => {
    if (
      !node.isText ||
      !node.text ||
      parent?.type.name === "codeBlock" ||
      (parent?.type.name === "paragraph" && FOOTNOTE_DEF_RE.test(parent.textContent))
    ) {
      return true;
    }

    for (const match of node.text.matchAll(FOOTNOTE_REF_RE)) {
      const text = match[0];
      const index = match.index;
      if (index === undefined) continue;

      const id = match[1];
      ranges.push({
        from: pos + index,
        to: pos + index + text.length,
        id,
      });
    }

    return true;
  });

  return ranges;
}

export function collectFootnoteDefinitions(doc: Node): FootnoteDefinitionRange[] {
  const ranges: FootnoteDefinitionRange[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") {
      return true;
    }

    const match = node.textContent.match(FOOTNOTE_DEF_RE);
    if (!match) {
      return true;
    }

    ranges.push({
      from: pos,
      to: pos + node.nodeSize,
      id: match[1],
    });
    return true;
  });

  return ranges;
}

function buildDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];

  for (const reference of collectFootnoteReferences(doc)) {
    decorations.push(
      Decoration.inline(reference.from, reference.to, {
        class: "footnote-reference",
        "data-footnote-id": reference.id,
      })
    );
  }

  for (const definition of collectFootnoteDefinitions(doc)) {
    decorations.push(
      Decoration.node(definition.from, definition.to, {
        class: "footnote-definition",
        "data-footnote-id": definition.id,
      })
    );
  }

  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export const Footnotes = Extension.create({
  name: "footnotes",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: FOOTNOTES_KEY,
        state: {
          init(_config, state) {
            return buildDecorations(state.doc);
          },
          apply(tr, prev, _oldState, newState) {
            if (!tr.docChanged) {
              return prev;
            }

            return buildDecorations(newState.doc);
          },
        },
        props: {
          decorations(state) {
            return FOOTNOTES_KEY.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
