import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep } from "@tiptap/pm/transform";
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

/** Scan one textblock at `pos` for footnote syntax. Footnotes never span
 *  blocks, which is what lets the plugin rescan only edited blocks. A
 *  paragraph that is a definition (`[^id]: …`) yields the definition and no
 *  references; code blocks yield nothing. */
function scanTextblock(
  block: Node,
  pos: number,
  references: FootnoteReferenceRange[],
  definitions: FootnoteDefinitionRange[]
): void {
  if (block.type.name === "codeBlock") return;
  if (block.type.name === "paragraph") {
    // Computed once per block — not once per text node, which was quadratic
    // in paragraphs split into many formatted runs.
    const definition = FOOTNOTE_DEF_RE.exec(block.textContent);
    if (definition) {
      definitions.push({ from: pos, to: pos + block.nodeSize, id: definition[1] });
      return;
    }
  }
  block.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    const start = pos + 1 + offset;
    for (const match of child.text.matchAll(FOOTNOTE_REF_RE)) {
      if (match.index === undefined) continue;
      references.push({
        from: start + match.index,
        to: start + match.index + match[0].length,
        id: match[1],
      });
    }
  });
}

function scanRange(doc: Node, from: number, to: number) {
  const references: FootnoteReferenceRange[] = [];
  const definitions: FootnoteDefinitionRange[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    scanTextblock(node, pos, references, definitions);
    return false;
  });
  return { references, definitions };
}

export function collectFootnoteReferences(doc: Node): FootnoteReferenceRange[] {
  return scanRange(doc, 0, doc.content.size).references;
}

export function collectFootnoteDefinitions(doc: Node): FootnoteDefinitionRange[] {
  return scanRange(doc, 0, doc.content.size).definitions;
}

function decorationsFor(
  references: FootnoteReferenceRange[],
  definitions: FootnoteDefinitionRange[]
): Decoration[] {
  return [
    ...references.map((reference) =>
      Decoration.inline(reference.from, reference.to, {
        class: "footnote-reference",
        "data-footnote-id": reference.id,
      })
    ),
    ...definitions.map((definition) =>
      Decoration.node(definition.from, definition.to, {
        class: "footnote-definition",
        "data-footnote-id": definition.id,
      })
    ),
  ];
}

export function buildDecorations(doc: Node): DecorationSet {
  const { references, definitions } = scanRange(doc, 0, doc.content.size);
  const decorations = decorationsFor(references, definitions);
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** The previous decorations, mapped through `tr`, with only the textblocks
 *  the transaction touched rescanned. Typing therefore costs one block's
 *  scan, not a walk of the whole document. */
export function updateDecorations(prev: DecorationSet, tr: Transaction): DecorationSet {
  const doc = tr.doc;
  let set = prev.map(tr.mapping, doc);
  // Changed ranges, in the final document's coordinates.
  const changed: Array<[number, number]> = [];
  tr.mapping.maps.forEach((stepMap, index) => {
    const rest = tr.mapping.slice(index + 1);
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      changed.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
    // A mark step moves no position, so its step map is empty — yet adding or
    // removing a mark splits or merges the text runs the scan reads one at a
    // time (`[^` + bold `a` + `]` becomes a reference once the bold is gone).
    const step = tr.steps[index];
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      changed.push([rest.map(step.from, -1), rest.map(step.to, 1)]);
    }
  });
  for (const [rawFrom, rawTo] of changed) {
    // Widen by one so a collapsed range (a deletion) still reaches the block
    // around it, then cover whole textblocks.
    const from = Math.max(0, Math.min(rawFrom, rawTo) - 1);
    const to = Math.min(doc.content.size, Math.max(rawFrom, rawTo) + 1);
    let blockFrom = from;
    let blockTo = to;
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      blockFrom = Math.min(blockFrom, pos);
      blockTo = Math.max(blockTo, pos + node.nodeSize);
      return false;
    });
    // Only decorations inside the rescanned blocks: a neighbour's node
    // decoration can touch the boundary without being rescanned.
    set = set.remove(
      set
        .find(blockFrom, blockTo, () => true)
        .filter((decoration) => decoration.from >= blockFrom && decoration.to <= blockTo)
    );
    const { references, definitions } = scanRange(doc, blockFrom, blockTo);
    const fresh = decorationsFor(references, definitions);
    if (fresh.length > 0) set = set.add(doc, fresh);
  }
  return set;
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
          apply(tr, prev) {
            if (!tr.docChanged) {
              return prev;
            }
            return updateDecorations(prev, tr);
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
